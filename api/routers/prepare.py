"""
/api/prepare/* — build the four analysis groups G1–G4 from loaded datasets,
plus quality reporting per group.

Built groups live in core.prepare_registry (in-memory only).
"""
from __future__ import annotations
import math
from typing import Any

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core import prepare_registry, registry
from core.joins import BUILDERS, GROUPS, GroupSpec, get_group


router = APIRouter(prefix="/api/prepare", tags=["prepare"])


# ----- helpers ----------------------------------------------------------------

def _nan_safe(v: Any) -> Any:
    if isinstance(v, float) and math.isnan(v):
        return None
    return v


def _records(df: pd.DataFrame, n: int) -> list[dict[str, Any]]:
    head = df.head(n).to_dict(orient="records")
    return [{k: _nan_safe(v) for k, v in row.items()} for row in head]


def _spec_dict(g: GroupSpec) -> dict[str, Any]:
    return {
        "id": g.id,
        "label": g.label,
        "description": g.description,
        "grain": g.grain,
        "key_columns": list(g.key_columns),
        "required_datasets": list(g.required_datasets),
        "expected_rows_hint": g.expected_rows_hint,
    }


def _source_status(g: GroupSpec) -> dict[str, Any]:
    items = []
    for d_id in g.required_datasets:
        meta = registry.get_metadata(d_id)
        items.append({
            "id": d_id,
            "loaded": meta is not None,
            "rows": meta["rows"] if meta else None,
            "schema_valid": meta["schema_valid"] if meta else None,
        })
    all_loaded = all(it["loaded"] for it in items)
    return {"items": items, "all_loaded": all_loaded}


def _date_range(df: pd.DataFrame) -> dict[str, str] | None:
    if "date" not in df.columns:
        return None
    try:
        s = pd.to_datetime(df["date"], errors="coerce").dropna()
        if s.empty:
            return None
        return {"start": str(s.min().date()), "end": str(s.max().date())}
    except Exception:
        return None


def _column_info(df: pd.DataFrame) -> list[dict[str, Any]]:
    """For preview: per-column type, non-null count, unique count, sample."""
    out = []
    for c in df.columns:
        s = df[c]
        non_null = int(s.notna().sum())
        try:
            unique = int(s.nunique(dropna=True))
        except Exception:
            unique = None
        sample_val = None
        for v in s.dropna().head(1):
            sample_val = _nan_safe(v)
            break
        out.append({
            "column": c,
            "dtype": str(s.dtype),
            "non_null": non_null,
            "unique": unique,
            "sample": sample_val,
        })
    return out


# ----- routes -----------------------------------------------------------------

@router.get("/groups")
async def groups_inventory() -> dict[str, Any]:
    """List all 4 groups with source status and whether they are currently built."""
    items = []
    for g in GROUPS:
        sources = _source_status(g)
        built_meta = prepare_registry.get_metadata(g.id)
        items.append({
            "spec": _spec_dict(g),
            "sources": sources,
            "can_build": sources["all_loaded"],
            "built": built_meta is not None,
            "metadata": built_meta,
        })
    return {"items": items}


class BuildRequest(BaseModel):
    group: str
    date_start: str | None = None
    date_end:   str | None = None


@router.post("/build")
async def build(req: BuildRequest) -> dict[str, Any]:
    spec = get_group(req.group)
    if spec is None:
        raise HTTPException(404, f"Unknown group '{req.group}'. Valid: {[g.id for g in GROUPS]}")

    # Gather sources.
    sources: dict[str, pd.DataFrame] = {}
    missing = []
    for d_id in spec.required_datasets:
        df = registry.get_df(d_id)
        if df is None:
            missing.append(d_id)
        else:
            sources[d_id] = df
    if missing:
        raise HTTPException(400, {
            "error": "missing_sources",
            "group": spec.id,
            "missing": missing,
            "message": f"Cannot build {spec.label}: required datasets not loaded: {missing}.",
        })

    builder = BUILDERS[spec.id]
    args = [sources[d_id] for d_id in spec.required_datasets]
    try:
        df, audit = builder(*args, date_start=req.date_start, date_end=req.date_end)
    except Exception as e:
        raise HTTPException(500, f"Join failed for {spec.label}: {e}")

    metadata = {
        "id": spec.id,
        "label": spec.label,
        "grain": spec.grain,
        "rows": int(len(df)),
        "columns": list(df.columns),
        "n_columns": int(df.shape[1]),
        "date_range": _date_range(df),
        "expected_rows_hint": spec.expected_rows_hint,
        "audit": audit.to_list(),
        "regime_counts": _regime_counts(df),
        "era_counts": _era_counts(df),
        "zero_day_count": int(df["is_zero_day"].sum()) if "is_zero_day" in df.columns else None,
    }
    prepare_registry.put(spec.id, df, metadata)
    metadata["preview"] = _records(df, 10)
    metadata["column_info"] = _column_info(df)
    return metadata


@router.get("/{group_id}")
async def get_metadata(group_id: str) -> dict[str, Any]:
    spec = get_group(group_id)
    if spec is None:
        raise HTTPException(404, f"Unknown group '{group_id}'")
    entry = prepare_registry.get(group_id)
    if entry is None:
        return {"spec": _spec_dict(spec), "built": False, "metadata": None}
    return {"spec": _spec_dict(spec), "built": True, "metadata": entry.metadata}


@router.get("/{group_id}/preview")
async def preview(group_id: str, n: int = 10) -> dict[str, Any]:
    df = prepare_registry.get_df(group_id)
    if df is None:
        raise HTTPException(404, f"Group '{group_id}' not built")
    n = max(1, min(n, 200))
    return {
        "id": group_id,
        "rows_returned": n,
        "columns": list(df.columns),
        "records": _records(df, n),
        "column_info": _column_info(df.head(n)),
    }


@router.get("/{group_id}/quality")
async def quality(group_id: str) -> dict[str, Any]:
    df = prepare_registry.get_df(group_id)
    if df is None:
        raise HTTPException(404, f"Group '{group_id}' not built")

    n_rows = int(len(df))
    missingness = []
    for c in df.columns:
        n_missing = int(df[c].isna().sum())
        if n_missing == 0:
            continue
        missingness.append({
            "column": c,
            "missing": n_missing,
            "pct": round(n_missing / n_rows * 100, 2) if n_rows else 0.0,
        })
    missingness.sort(key=lambda r: r["pct"], reverse=True)

    type_breakdown: dict[str, int] = {}
    for c in df.columns:
        type_breakdown[str(df[c].dtype)] = type_breakdown.get(str(df[c].dtype), 0) + 1

    return {
        "id": group_id,
        "rows": n_rows,
        "columns": int(df.shape[1]),
        "missingness": missingness[:50],  # cap for payload size
        "missingness_total_columns": len(missingness),
        "type_breakdown": type_breakdown,
        "regime_counts": _regime_counts(df),
        "era_counts": _era_counts(df),
        "zero_day_count": int(df["is_zero_day"].sum()) if "is_zero_day" in df.columns else None,
        "duplicate_keys": _duplicate_keys(df),
        "date_range": _date_range(df),
    }


@router.delete("/{group_id}")
async def clear(group_id: str) -> dict[str, Any]:
    if get_group(group_id) is None:
        raise HTTPException(404, f"Unknown group '{group_id}'")
    cleared = prepare_registry.clear(group_id)
    return {"id": group_id, "cleared": cleared}


@router.delete("")
async def clear_all() -> dict[str, Any]:
    ids = prepare_registry.loaded_ids()
    prepare_registry.clear_all()
    return {"cleared": ids, "count": len(ids)}


# ----- per-DF summaries -------------------------------------------------------

def _regime_counts(df: pd.DataFrame) -> dict[str, int] | None:
    if "covid_regime" not in df.columns:
        return None
    counts = df["covid_regime"].value_counts(dropna=False).to_dict()
    return {str(k): int(v) for k, v in counts.items()}


def _era_counts(df: pd.DataFrame) -> dict[str, int] | None:
    if "schema_era" not in df.columns:
        return None
    counts = df["schema_era"].value_counts(dropna=False).to_dict()
    return {str(int(k)): int(v) for k, v in counts.items()}


def _duplicate_keys(df: pd.DataFrame) -> dict[str, Any]:
    key_cols = [c for c in ("date", "hour") if c in df.columns]
    if not key_cols:
        return {"key_columns": [], "count": 0}
    dup_count = int(df.duplicated(subset=key_cols, keep=False).sum())
    return {"key_columns": key_cols, "count": dup_count}
