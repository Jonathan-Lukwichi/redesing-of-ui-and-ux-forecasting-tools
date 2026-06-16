"""Forecast-driven Optimization page endpoints.

POST /api/optimization/run        — run the whole pipeline (forecast → staff IP
                                     + supply (s,S)) and return the page payload.
GET  /api/optimization/last       — the most recent solution (for the Action
                                     Center and for re-loads without re-solving).
GET  /api/optimization/staff-pool — the nurse pool the solver draws from.

The forecast that drives everything comes from the live G1 pipeline when it is
merged; otherwise we fall back to the bundled 13-month scheduling simulation's
own arrival history so the page is always demonstrable.
"""
from __future__ import annotations
from typing import Any, Optional

import pandas as pd
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from core import simulation_data, optimization_engine as engine
from core.forecasting import run_arima_forecast
from routers.forecast import _forecast_from_series, _series_for

router = APIRouter(prefix="/api/optimization", tags=["optimization"])


class RunRequest(BaseModel):
    model: str = "statistical"          # statistical | ml
    kappa: float = 1.65                 # safety-buffer factor (~95% service)
    service_level: float = 0.95         # supply (s,S) service level
    weekly_budget_zar: Optional[float] = None
    start_date: Optional[str] = None    # optional backtest origin


async def _get_week_forecast(model: str, start_date: Optional[str]) -> dict[str, Any]:
    """Next-7-day total-ED forecast. Tries the live G1 pipeline; falls back to
    the simulation's own arrival history if G1 isn't merged."""
    # Primary: live G1 forecast.
    try:
        s, _ = _series_for("g1", None)
        res = _forecast_from_series(s, model, 7, weekly=False, start_date=start_date)
        days = res.get("forecast", [])
        if days:
            return {
                "week_starting": days[0]["date"],
                "dates": [d["date"] for d in days],
                "daily_total": [float(d["predicted"]) for d in days],
                "lower": [float(d["lower"]) for d in days],
                "upper": [float(d["upper"]) for d in days],
                "mae": res.get("mae"),
                "accuracy_pct": res.get("confidence_pct"),
                "baseline_avg": res.get("avg_actual"),
                "source": f"Live G1 forecast ({'Gradient Boosting' if model == 'ml' else 'SARIMAX'})",
            }
    except HTTPException:
        pass  # G1 not merged → fall back
    except Exception:
        pass

    # Fallback: forecast the simulation's own daily arrivals.
    daily = await simulation_data.load("staff_daily.csv")
    daily = daily.sort_values("date")
    hist = pd.to_numeric(daily["total_arrivals"], errors="coerce").dropna()
    dates = list(daily["date"].astype(str))[-len(hist):]
    history = [float(v) for v in hist.to_numpy()][-365:]
    dates = dates[-len(history):]
    res = run_arima_forecast(history, dates, 7)
    days = res.get("forecast", [])
    if not days:
        raise HTTPException(500, "Could not produce a forecast to optimize from.")
    return {
        "week_starting": days[0]["date"],
        "dates": [d["date"] for d in days],
        "daily_total": [float(d["predicted"]) for d in days],
        "lower": [float(d["lower"]) for d in days],
        "upper": [float(d["upper"]) for d in days],
        "mae": res.get("mae"),
        "accuracy_pct": round(max(0.0, 100.0 - float(res.get("mape") or 0)), 1),
        "baseline_avg": float(hist.mean()),
        "source": "Simulation arrival history (SARIMAX) — build G1 for the live forecast",
    }


def _staff_records(df) -> list[dict]:
    return [{
        "staff_id": r["staff_id"],
        "category": r["category"],
        "skill_level": int(r.get("skill_level") or 0),
        "annual_salary_zar": float(r.get("annual_salary_zar") or 0),
    } for _, r in df.iterrows()]


@router.post("/run")
async def run(req: RunRequest) -> dict[str, Any]:
    forecast = await _get_week_forecast(req.model, req.start_date)
    try:
        staff_df = await simulation_data.load("staff_members.csv")
        items_df = await simulation_data.load("supply_items.csv")
        panel_df = await simulation_data.load("supply_panel.csv")
    except FileNotFoundError as e:
        raise HTTPException(503, {"error": "simulation_missing", "message": str(e)})

    staff = _staff_records(staff_df)
    # Current stock snapshot = each item's latest recorded stock-on-hand.
    panel_sorted = panel_df.sort_values("date")
    last_stock = (panel_sorted.groupby("item_id")["recorded_stock_on_hand_units"]
                  .last().to_dict())
    items = items_df.to_dict("records")
    for it in items:
        cur = last_stock.get(it.get("item_id"))
        it["current_stock_units"] = None if cur is None else float(cur)

    # CBC solve is CPU-bound → keep the event loop free.
    payload = await run_in_threadpool(
        engine.optimize, forecast, staff, items,
        req.kappa, req.service_level, req.weekly_budget_zar,
    )
    return payload


@router.get("/last")
async def last() -> dict[str, Any]:
    res = engine.get_last()
    if res is None:
        return {"data": None, "status": "no_solution_yet"}
    return res


@router.get("/staff-pool")
async def staff_pool() -> dict[str, Any]:
    try:
        df = await simulation_data.load("staff_members.csv")
    except FileNotFoundError as e:
        raise HTTPException(503, {"error": "simulation_missing", "message": str(e)})
    staff = _staff_records(df)
    by_cat: dict[str, int] = {}
    for s in staff:
        by_cat[s["category"]] = by_cat.get(s["category"], 0) + 1
    return {"count": len(staff), "by_category": by_cat, "staff": staff}
