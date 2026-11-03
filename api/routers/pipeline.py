"""/api/pipeline/* — raw register upload (transformed as it arrives), staging,
download of the transformed tables, and the pipeline run. HTTP concerns only;
the work lives in core/transform and core/pipeline.

The body is read from request.stream() into memory, never as multipart:
Starlette spools multipart uploads over 1MB to a temp file, and hospital files
must never touch disk.
"""
from __future__ import annotations

import gc
import threading
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response

from core import pipeline, registry, security
from core.pipeline import job, preflight, staging
from core.transform import TransformError
from core.transform.month import transform_month

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])

MAX_BODY_BYTES = 25 * 1024 * 1024
PURE_IDS = ("daily_arrival", "hourly_arrival", "clinical_daily", "clinical_hourly")
_BUSY = "A pipeline run is in progress. Wait for it to finish."
_TOO_BIG = "That file is larger than the 25 MB limit."

# One month is held and transformed at a time (512MB budget).
_transform_lock = threading.Lock()


def _transform_and_stage(raw: bytearray, filename: str) -> dict[str, Any]:
    with _transform_lock:
        try:
            month = transform_month(bytes(raw), filename)
        finally:
            raw.clear()
        previous = next((m for m in staging.months()
                         if (m.year, m.month) == (month.year, month.month)), None)
        if previous is not None and previous.sha256 == month.sha256:
            return {**previous.receipt, "status": "unchanged"}
        # A run may have started while this file was transforming: never hand
        # it a half-staged month.
        if pipeline.is_running():
            raise HTTPException(409, _BUSY)
        staging.put(month)
        return {**month.receipt,
                "status": "replaced" if previous is not None else "added"}


@router.post("/registers")
async def upload_register(request: Request, filename: str,
                          _user=security.DataWriteAccess) -> dict[str, Any]:
    if pipeline.is_running():
        raise HTTPException(409, _BUSY)
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_BODY_BYTES:
        raise HTTPException(413, _TOO_BIG)
    body = bytearray()
    try:
        async for chunk in request.stream():
            body += chunk
            if len(body) > MAX_BODY_BYTES:
                raise HTTPException(413, _TOO_BIG)
        if not body:
            raise HTTPException(422, "The upload was empty.")
        try:
            return await run_in_threadpool(_transform_and_stage, body, filename)
        except TransformError as e:
            raise HTTPException(422, e.public_message)
    finally:
        body.clear()
        del body
        gc.collect()


@router.get("/staged")
async def staged() -> dict[str, Any]:
    return {
        "months": [{**m.receipt, "sha256": m.sha256} for m in staging.months()],
        "unapplied": staging.unapplied(),
    }


@router.get("/preflight")
async def preflight_checks() -> dict[str, Any]:
    return await run_in_threadpool(preflight.run_checks)


@router.delete("/staged")
async def clear_staged(_user=security.DataWriteAccess) -> dict[str, Any]:
    if pipeline.is_running():
        raise HTTPException(409, _BUSY)
    return {"cleared": staging.clear()}


@router.get("/transformed/{dataset_id}.csv")
async def download_transformed(dataset_id: str,
                               _user=security.DataWriteAccess) -> Response:
    if dataset_id not in PURE_IDS:
        raise HTTPException(404, "Unknown table.")
    df = registry.get_df(dataset_id)
    if df is None:
        raise HTTPException(404, "That table is empty.")
    return Response(
        df.to_csv(index=False), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{dataset_id}.csv"'})


@router.post("/run")
async def run(_user=security.DataWriteAccess) -> Any:
    try:
        return job.start()
    except job.Busy:
        return JSONResponse(status_code=409,
                            content={"error": "already_running", "message": _BUSY})


@router.get("/status")
async def status() -> dict[str, Any]:
    return job.status()
