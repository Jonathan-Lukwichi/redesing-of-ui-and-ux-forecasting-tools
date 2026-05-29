"""
/api/datasets/* — upload and inspect the 7 source files of the Steve Biko
hospital forecasting pipeline. Data lives in core/registry (in-memory only).
"""
from __future__ import annotations
import hashlib
import io
import math
from dataclasses import asdict
from typing import Any

import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile

from core import registry, prepare_registry, data_source
from core.datasets import (
    ALL_SCHEMAS,
    DatasetSchema,
    get_schema,
    schema_ids,
)
from core.joins import GROUPS


router = APIRouter(prefix="/api/datasets", tags=["datasets"])


# -- helpers --------------------------------------------------------------------

def _schema_dict(s: DatasetSchema) -> dict[str, Any]:
    return {
        "id": s.id,
        "label": s.label,
        "description": s.description,
        "category": s.category,
        "grain": s.grain,
        "key_columns": list(s.key_columns),
        "required_columns": list(s.required_columns),
        "expected_columns": list(s.expected_columns),
        "expected_rows_hint": s.expected_rows_hint,
        "source_filename_hint": s.source_filename_hint,
    }


def _nan_safe(value: Any) -> Any:
    """JSON has no NaN. Replace with None on a per-value basis."""
    if isinstance(value, float) and math.isnan(value):
        return None
    return value


def _records(df: pd.DataFrame, n: int) -> list[dict[str, Any]]:
    head = df.head(n).to_dict(orient="records")
    return [{k: _nan_safe(v) for k, v in row.items()} for row in head]


def _date_range(df: pd.DataFrame, key_columns: tuple[str, ...]) -> dict[str, str] | None:
    col = "date" if "date" in df.columns else ("datetime" if "datetime" in df.columns else None)
    if col is None:
        # fall back to first key column if it parses as a date
        col = key_columns[0] if key_columns and key_columns[0] in df.columns else None
    if col is None:
        return None
    try:
        s = pd.to_datetime(df[col], errors="coerce").dropna()
        if s.empty:
            return None
        return {"start": str(s.min().date()), "end": str(s.max().date())}
    except Exception:
        return None


def _parse_csv(content: bytes) -> pd.DataFrame:
    try:
        return pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(400, f"Could not parse CSV: {e}")


def _validate(df: pd.DataFrame, schema: DatasetSchema) -> dict[str, Any]:
    cols = list(df.columns)
    cols_set = set(cols)
    expected_set = set(schema.expected_columns)
    required_set = set(schema.required_columns)

    missing_required = sorted(required_set - cols_set)
    missing_expected = sorted(expected_set - cols_set)
    extra = sorted(cols_set - expected_set)

    return {
        "columns": cols,
        "schema_valid": not missing_required and not missing_expected and not extra,
        "missing_required": missing_required,
        "missing_expected": missing_expected,
        "extra_columns": extra,
    }


def _build_metadata(
    schema: DatasetSchema,
    df: pd.DataFrame,
    filename: str,
    raw_bytes: bytes,
) -> dict[str, Any]:
    validation = _validate(df, schema)
    return {
        "id": schema.id,
        "label": schema.label,
        "category": schema.category,
        "grain": schema.grain,
        "filename": filename,
        "rows": int(len(df)),
        "expected_rows_hint": schema.expected_rows_hint,
        "key_columns": list(schema.key_columns),
        "date_range": _date_range(df, schema.key_columns),
        "signature_hash": "sha256:" + hashlib.sha256(raw_bytes).hexdigest(),
        **validation,
    }


def _score_schema(df_columns: set[str], schema: DatasetSchema) -> float:
    """Heuristic score in [0, 1] of how well df_columns matches a schema."""
    req = set(schema.required_columns)
    exp = set(schema.expected_columns)
    if not exp:
        return 0.0
    req_match = (len(req & df_columns) / len(req)) if req else 0.0
    exp_match = len(exp & df_columns) / len(exp)
    # Penalise files that bring lots of columns that the schema does not expect.
    extra = df_columns - exp
    extra_penalty = len(extra) / max(len(df_columns), 1)
    score = 0.6 * req_match + 0.4 * exp_match - 0.15 * extra_penalty
    return max(0.0, min(1.0, score))


def _best_fit(df: pd.DataFrame, exclude_id: str) -> dict[str, Any] | None:
    """Among all schemas (except `exclude_id`), find the one whose columns
    most closely match the uploaded file. Returns `None` if no schema scores
    above a confidence threshold."""
    cols = set(df.columns)
    candidates = []
    for s in ALL_SCHEMAS:
        if s.id == exclude_id:
            continue
        candidates.append((s, _score_schema(cols, s)))
    if not candidates:
        return None
    candidates.sort(key=lambda x: x[1], reverse=True)
    top, score = candidates[0]
    if score < 0.6:
        return None
    return {
        "id": top.id,
        "label": top.label,
        "category": top.category,
        "confidence": round(score, 2),
    }


# -- routes ---------------------------------------------------------------------

@router.delete("")
async def clear_all() -> dict[str, Any]:
    """Wipe every loaded dataset from the in-memory registry. Also invalidates
    every built prepare group, since they all depend on these datasets."""
    ids = registry.loaded_ids()
    registry.clear_all()
    invalidated = prepare_registry.loaded_ids()
    prepare_registry.clear_all()
    return {
        "cleared": ids,
        "count": len(ids),
        "invalidated_groups": invalidated,
    }


def _invalidate_dependent_groups(dataset_id: str) -> list[str]:
    """Drop any prepare-group that relied on the given dataset id."""
    dependent = [g.id for g in GROUPS if dataset_id in g.required_datasets]
    invalidated = []
    for group_id in dependent:
        if prepare_registry.clear(group_id):
            invalidated.append(group_id)
    return invalidated


@router.get("/inventory")
async def inventory() -> dict[str, Any]:
    """List all 7 dataset slots with their schema and current load state."""
    loaded = set(registry.loaded_ids())
    items = []
    for s in ALL_SCHEMAS:
        meta = registry.get_metadata(s.id) if s.id in loaded else None
        items.append({
            "schema": _schema_dict(s),
            "loaded": s.id in loaded,
            "metadata": meta,
        })
    return {"items": items, "loaded_count": len(loaded), "total": len(ALL_SCHEMAS)}


def _ingest_csv(schema: DatasetSchema, raw: bytes, filename: str) -> dict[str, Any]:
    """Parse + validate + register the raw bytes of a CSV against a schema.
    Shared by the upload and fetch endpoints."""
    df = _parse_csv(raw)
    meta = _build_metadata(schema, df, filename, raw)

    if meta["missing_required"]:
        detail: dict[str, Any] = {
            "error": "missing_required_columns",
            "target_id": schema.id,
            "target_label": schema.label,
            "filename": filename,
            "missing_required": meta["missing_required"],
            "uploaded_columns": meta["columns"],
            "expected_required": list(schema.required_columns),
            "message": (
                f"This file is missing required columns for {schema.label}: "
                f"{meta['missing_required']}."
            ),
        }
        bf = _best_fit(df, exclude_id=schema.id)
        if bf is not None:
            detail["best_fit"] = bf
            detail["message"] += (
                f" It looks like the '{bf['label']}' dataset "
                f"(confidence {int(bf['confidence'] * 100)}%)."
            )
        raise HTTPException(400, detail)

    registry.put(schema.id, df, meta)
    # A new copy stales any merged group that used it.
    meta["invalidated_groups"] = _invalidate_dependent_groups(schema.id)
    meta["preview"] = _records(df, 10)
    return meta


@router.post("/{dataset_id}/upload")
async def upload(dataset_id: str, file: UploadFile = File(...)) -> dict[str, Any]:
    schema = get_schema(dataset_id)
    if schema is None:
        raise HTTPException(404, f"Unknown dataset id '{dataset_id}'. "
                                  f"Valid ids: {schema_ids()}")
    raw = await file.read()
    return _ingest_csv(schema, raw, file.filename or "uploaded.csv")


@router.get("/source/status")
async def source_status() -> dict[str, Any]:
    """Tell the frontend whether the Fetch button can be enabled."""
    return data_source.status()


@router.post("/{dataset_id}/fetch")
async def fetch_from_source(dataset_id: str) -> dict[str, Any]:
    """Pull this dataset's CSV from the configured private data repo and run it
    through the same validation/storage path as an upload."""
    schema = get_schema(dataset_id)
    if schema is None:
        raise HTTPException(404, f"Unknown dataset id '{dataset_id}'. "
                                  f"Valid ids: {schema_ids()}")

    filename = schema.source_filename_hint
    if not filename:
        raise HTTPException(500, f"No filename hint configured for '{dataset_id}'.")

    try:
        raw = await data_source.fetch_raw(filename)
    except data_source.FetchError as e:
        status_code = e.http_status or 502
        raise HTTPException(status_code, {
            "error":   "fetch_failed",
            "target_id": schema.id,
            "filename": filename,
            "message":  str(e),
        })

    return _ingest_csv(schema, raw, filename)


@router.get("/{dataset_id}")
async def get_metadata(dataset_id: str) -> dict[str, Any]:
    schema = get_schema(dataset_id)
    if schema is None:
        raise HTTPException(404, f"Unknown dataset id '{dataset_id}'.")
    entry = registry.get(dataset_id)
    if entry is None:
        return {"schema": _schema_dict(schema), "loaded": False, "metadata": None}
    return {"schema": _schema_dict(schema), "loaded": True, "metadata": entry.metadata}


@router.get("/{dataset_id}/preview")
async def preview(dataset_id: str, n: int = 10) -> dict[str, Any]:
    df = registry.get_df(dataset_id)
    if df is None:
        raise HTTPException(404, f"Dataset '{dataset_id}' is not loaded.")
    n = max(1, min(n, 100))
    return {
        "id": dataset_id,
        "rows_returned": n,
        "columns": list(df.columns),
        "records": _records(df, n),
    }


@router.delete("/{dataset_id}")
async def clear(dataset_id: str) -> dict[str, Any]:
    if get_schema(dataset_id) is None:
        raise HTTPException(404, f"Unknown dataset id '{dataset_id}'.")
    cleared = registry.clear(dataset_id)
    invalidated = _invalidate_dependent_groups(dataset_id)
    return {
        "id": dataset_id,
        "cleared": cleared,
        "invalidated_groups": invalidated,
    }
