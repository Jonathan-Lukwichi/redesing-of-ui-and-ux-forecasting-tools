"""The sample run: the stored data, through the same pipeline.

For anyone without the hospital's files (an examiner on the public site, say),
"Use the sample data" loads the seven source tables from the configured data
repo, through the same fetch-and-validate path as the Data Hub's Fetch buttons
(RAM only, never written to disk), plus the simulated inventory and scheduling
demo pack that ships with the backend in api/data/demo-pack/. Then the normal
eight stages run on it. The pack keeps data_origin=simulated, so every page
that uses it still says the data is simulated.

Who may start it is decided here, so the route stays thin: anyone, on a server
with nothing uploaded and no results yet; never a visitor over a hospital's
uploaded data or the results of an upload run; and someone who can upload data
only after confirming the replacement.
"""
from __future__ import annotations

import asyncio
import gc
import logging
from pathlib import Path

from core import data_source, datasets, prepare_registry, registry, simulation_data
from core.pipeline import job, staging
from core.pipeline.stages import OPS_IDS, StageFailed

log = logging.getLogger("healthforecast.pipeline")

PACK_DIR = Path(__file__).resolve().parents[2] / "data" / "demo-pack"
SOURCE_IDS = ("daily_arrival", "hourly_arrival", "clinical_daily", "clinical_hourly",
              "calendar", "weather_daily", "weather_hourly")
PACK_IDS = OPS_IDS
SAMPLE = "sample"
REPO = "repo"   # fetched by a data writer from the same repo: not a hospital upload

UNAVAILABLE = {"error": "sample_unavailable",
               "message": ("The sample data is not set up on this server: no data "
                           "repository is configured.")}
UPLOADED_DATA = {"error": "uploaded_data",
                 "message": ("This server holds data uploaded from a hospital, and only "
                             "someone who can upload data may replace it with the sample "
                             "data.")}
RESULTS_EXIST = {"error": "results_exist",
                 "message": "Results are already available. Open any results page to see them."}
REPLACE_UPLOADED = {"error": "replace_uploaded",
                    "message": ("This replaces the uploaded data and its results with the "
                                "sample data.")}

_FAILED = "The sample data could not be loaded"


def holds_uploaded_data() -> bool:
    """Whether the staged months, the loaded files or the results came from a
    real upload. Anything without a sample or repo provenance counts as one."""
    if staging.months():
        return True
    for sid in registry.loaded_ids():
        if (registry.get_metadata(sid) or {}).get("provenance") not in (SAMPLE, REPO):
            return True
    return job.results_source() == "upload"


def refusal(can_write: bool, replace: bool) -> tuple[int, dict] | None:
    """Why this caller may not start the sample now, as (status, body), or None."""
    if not data_source.get_config().configured:
        return 503, UNAVAILABLE
    uploaded = holds_uploaded_data()
    if not can_write:
        if uploaded:
            return 403, UPLOADED_DATA
        if job.results_available():
            # A visitor restarting the sample would only blank every page for
            # everyone else for the length of a run.
            return 409, RESULTS_EXIST
        return None
    if uploaded and not replace:
        return 409, REPLACE_UPLOADED
    return None


def _fetch_failure(e: data_source.FetchError) -> str:
    if e.http_status in (401, 403):
        return (f"{_FAILED}: the data repository refused this server's access token. "
                "Whoever runs the server needs to paste a new read-only token into its "
                "settings, then try again.")
    if e.http_status == 404:
        return f"{_FAILED}: a stored file is missing from the data repository."
    if e.http_status == 503:
        return f"{_FAILED}: no data repository is configured on this server."
    return (f"{_FAILED}: the data repository could not be reached. Check the internet "
            "connection and try again.")


def _ingest(schema, raw: bytes, filename: str) -> None:
    # Imported lazily to avoid a circular import (routers import the pipeline).
    from fastapi import HTTPException
    from routers.datasets import _ingest_csv
    try:
        meta = _ingest_csv(schema, raw, filename)
    except HTTPException:
        # The detail names columns; the reason shown names only the file.
        raise StageFailed(f"{_FAILED}: {filename} does not have the columns it should.") from None
    meta.pop("preview", None)
    meta["provenance"] = SAMPLE


def load() -> None:
    """Replace the staged months and every loaded file with the sample. Runs in
    the pipeline thread (job.start's ``prepare``), after the old results are
    forgotten. Raises StageFailed with a plain-English reason."""
    # Everything goes first, so the old and new copies are never held together.
    staging.clear()
    registry.clear_all()
    prepare_registry.clear_all()
    simulation_data.unpublish()
    gc.collect()

    for sid in SOURCE_IDS:
        schema = datasets.get_schema(sid)
        filename = schema.source_filename_hint
        try:
            raw = asyncio.run(data_source.fetch_raw(filename))
        except data_source.FetchError as e:
            log.warning("sample: fetching %s failed (HTTP %s)", filename, e.http_status)
            raise StageFailed(_fetch_failure(e)) from None
        try:
            _ingest(schema, raw, filename)
        finally:
            del raw
            gc.collect()

    for sid in PACK_IDS:
        schema = datasets.get_schema(sid)
        path = PACK_DIR / schema.source_filename_hint
        if not path.is_file():
            raise StageFailed(f"{_FAILED}: the stored {schema.label.lower()} file is "
                              "missing from the server.")
        _ingest(schema, path.read_bytes(), schema.source_filename_hint)
