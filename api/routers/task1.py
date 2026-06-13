"""Task 1 — Daily Total ED Arrivals.

REST surface defined in handover artefact api_spec.yaml:
  GET  /api/task1/models    -> list of 6 ModelSummary
  GET  /api/task1/metrics   -> per-model per-horizon errors (HeadlineMetrics)
  POST /api/task1/forecast  -> forecast for {alias, horizon, start_date}

The forecast endpoint is currently STUBBED with HTTP 503 until the modeling
team delivers feature_builder.py — the engineered+consensus / raw-10 exog
matrices that Stat 2 / ML 1 / ML 2 / Hybrid 1 / Hybrid 2 all require. The
GET endpoints work fully today because they only read JSON cards.
"""
from __future__ import annotations
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from core import handover


router = APIRouter(prefix="/api/task1", tags=["task1"])


# --- GET /api/task1/models ---------------------------------------------------

@router.get("/models")
async def list_models() -> dict[str, Any]:
    """All 6 model aliases ordered by validation RMSE (lowest first).

    Each entry is the headline.json row plus the public card (no scientific name)."""
    try:
        rows = handover.task1_headline()
    except handover.HandoverMissing as e:
        raise HTTPException(503, str(e))

    # Decorate every row with its public card (description, training_window, etc).
    out = []
    for r in rows:
        card = handover.task1_card_public(r["alias"])
        out.append({**r, "card": card})

    # Order by val_RMSE asc per DASHBOARD_SPEC §3.1
    out.sort(key=lambda x: (x.get("val_RMSE") is None, x.get("val_RMSE") or 0))
    return {"items": out, "count": len(out)}


# --- GET /api/task1/metrics --------------------------------------------------

@router.get("/metrics")
async def metrics() -> dict[str, Any]:
    """Per-model per-horizon dashboard metrics: daily MAPE + weekly/monthly/yearly."""
    try:
        per_horizon = handover.task1_per_horizon()
    except handover.HandoverMissing as e:
        raise HTTPException(503, str(e))
    return {"items": per_horizon, "count": len(per_horizon)}


# --- POST /api/task1/forecast ------------------------------------------------

class Task1ForecastRequest(BaseModel):
    alias:      Literal["Stat 1", "Stat 2", "ML 1", "ML 2", "Hybrid 1", "Hybrid 2"]
    horizon:    Literal["1d", "7d", "monthly", "yearly"]
    start_date: str = Field(..., description="YYYY-MM-DD, first date of the forecast window")


@router.post("/forecast")
async def run_forecast(req: Task1ForecastRequest) -> dict[str, Any]:
    # Surfacing the badge + horizon early helps the UI render meaningful empty state.
    try:
        card = handover.task1_card_public(req.alias)
    except handover.HandoverMissing as e:
        raise HTTPException(503, str(e))

    # TODO: when feature_builder.py from msc-modelling lands, this will:
    #   1. build exog_future + feature_future from G1 + calendar + weather joins
    #   2. spawn a subprocess in api/.venv-handover with the model bundle
    #   3. return point_forecasts as the spec defines.
    raise HTTPException(
        status_code=501,
        detail={
            "error": "feature_pipeline_pending",
            "message": (
                f"{req.alias} cannot run yet — the feature-engineering pipeline "
                "(exog_future / feature_future matrices) hasn't been integrated. "
                "Tracking with the modeling team via msc-modelling#feature_builder."
            ),
            "requested": req.model_dump(),
            "model_badge": card.get("badge"),
            "model_badge_label": card.get("badge_label"),
        },
    )
