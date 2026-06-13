"""Task 2 — Per-Specialty Arrivals.

REST surface (per api_spec.yaml):
  GET  /api/task2/specialties  -> 7 specialties + their available models
  GET  /api/task2/metrics      -> per-specialty per-alias headline metrics
  POST /api/task2/forecast     -> forecast for {specialty, alias, horizon, start_date}

Same status as Task 1: GET endpoints work today, POST is stubbed pending the
feature-engineering pipeline.
"""
from __future__ import annotations
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from core import handover


router = APIRouter(prefix="/api/task2", tags=["task2"])


# --- GET /api/task2/specialties ---------------------------------------------

@router.get("/specialties")
async def list_specialties() -> dict[str, Any]:
    """All 7 specialties with their available model aliases + resolution.

    Maternity and Psychiatry are weekly-resolution only — the UI uses this
    field to swap horizon options (1d/7d/monthly/yearly  vs  1week/4weeks/yearly)."""
    try:
        cat = handover.task2_catalogue()
    except handover.HandoverMissing as e:
        raise HTTPException(503, str(e))

    # Decorate every (specialty, alias) pair with its badge from headline_all
    headline = {(r["specialty"], r["alias"]): r for r in handover.task2_headline_all()}

    enriched = []
    for sp in cat:
        models = []
        for alias in sp.get("available_models", []):
            h = headline.get((sp["specialty"], alias), {})
            models.append({
                "alias":       alias,
                "val_MAPE":    h.get("val_MAPE"),
                "badge":       h.get("badge"),
                "badge_label": h.get("badge_label"),
                "badge_emoji": h.get("badge_emoji"),
            })
        # Order: operational → planning → research, then by MAPE asc
        order = {"operational": 0, "planning": 1, "research": 2}
        models.sort(key=lambda m: (order.get(m.get("badge"), 9), m.get("val_MAPE") or 999))
        enriched.append({**sp, "models": models})

    return {"items": enriched, "count": len(enriched)}


# --- GET /api/task2/metrics --------------------------------------------------

@router.get("/metrics")
async def metrics() -> dict[str, Any]:
    """Flat headline metrics for every (specialty, alias) pair."""
    try:
        rows = handover.task2_headline_all()
    except handover.HandoverMissing as e:
        raise HTTPException(503, str(e))
    return {"items": rows, "count": len(rows)}


# --- POST /api/task2/forecast ------------------------------------------------

DAILY_HORIZONS  = ("1d", "7d", "monthly", "yearly")
WEEKLY_HORIZONS = ("1week", "4weeks", "yearly")


class Task2ForecastRequest(BaseModel):
    specialty:  Literal["Medicine","Orthopaedics","Surgery","Gynaecology","Paediatrics","Maternity","Psychiatry"]
    alias:      Literal["Stat 1", "Stat 2", "ML 1", "ML 2", "Hybrid 1", "Hybrid 2"]
    horizon:    str = Field(..., description="One of 1d/7d/monthly/yearly (daily specialties) or 1week/4weeks/yearly (Maternity, Psychiatry)")
    start_date: str = Field(..., description="YYYY-MM-DD")


@router.post("/forecast")
async def run_forecast(req: Task2ForecastRequest) -> dict[str, Any]:
    try:
        card = handover.task2_card(req.specialty, req.alias)
    except handover.HandoverMissing as e:
        raise HTTPException(503, str(e))
    except FileNotFoundError:
        raise HTTPException(
            404,
            {
                "error": "model_not_trained_for_specialty",
                "message": f"{req.alias} is not trained for {req.specialty}.",
                "requested": req.model_dump(),
            },
        )

    # Validate horizon matches the resolution
    cat = {s["specialty"]: s for s in handover.task2_catalogue()}
    if req.specialty in cat:
        res = cat[req.specialty].get("resolution", "daily")
        valid = WEEKLY_HORIZONS if res == "weekly" else DAILY_HORIZONS
        if req.horizon not in valid:
            raise HTTPException(
                400,
                {
                    "error": "invalid_horizon",
                    "message": f"{req.specialty} uses {res} resolution. Valid horizons: {list(valid)}.",
                },
            )

    raise HTTPException(
        status_code=501,
        detail={
            "error": "feature_pipeline_pending",
            "message": (
                f"{req.specialty} / {req.alias} cannot run yet — the per-specialty "
                "feature-engineering pipeline hasn't been integrated. "
                "Tracking with the modeling team via msc-modelling#feature_builder."
            ),
            "requested": req.model_dump(),
            "model_badge": card.get("badge"),
            "model_badge_label": card.get("badge_label"),
        },
    )
