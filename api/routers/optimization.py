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
from core.forecasting import run_arima_forecast, run_ml_forecast
from routers.forecast import _forecast_from_series, _series_for

router = APIRouter(prefix="/api/optimization", tags=["optimization"])

# Public-facing generic names (no algorithm names, no accuracy). The real model
# identities and accuracy live on the (future) admin page, not the public app.
_MODEL_LABEL = {"statistical": "Best statistical model", "ml": "Best ML model"}


class RunRequest(BaseModel):
    model: str = "ml"                   # statistical | ml — default to the most accurate engine
    kappa: float = 1.65                 # safety-buffer factor (~95% service)
    service_level: float = 0.95         # supply service level
    weekly_budget_zar: Optional[float] = None
    start_date: Optional[str] = None    # optional backtest origin
    policy: Optional[str] = None        # supply policy family; None = the standing policy


class PolicyRequest(BaseModel):
    policy: str                          # one of engine.DEPLOYABLE_POLICIES
    service_level: float = 0.95


def _arm_items(items: list[dict]) -> list[dict]:
    """Map the supply panel's item records onto the arm simulator's schema."""
    return [{
        "sku": str(it.get("item_id") or it.get("item_name")),
        "daily_demand_avg": float(it.get("mean_daily_consumption") or 0),
        "unit_cost": float(it.get("unit_price_zar") or 0),
        "holding_rate": 0.25,
        "ordering_cost": float(it.get("ordering_cost_zar") or 50.0),
        "lead_time_days": float(it.get("lead_time_mean_days") or 7),
    } for it in items if float(it.get("mean_daily_consumption") or 0) > 0]


# Load-last cache for the on-demand tuning runs (the /last pattern).
_LAST_TUNE: dict[str, Any] = {}


# Cache the fitted forecast so the staff and supply buttons (and re-runs) don't
# refit the model each time. Keyed by (model, start_date); cleared on process exit.
_FC_CACHE: dict[tuple, dict[str, Any]] = {}


async def _get_week_forecast(model: str, start_date: Optional[str]) -> dict[str, Any]:
    """Next-7-day total-ED forecast. Tries the live G1 pipeline (same data and
    accuracy as the Forecast page); falls back to the simulation's own arrival
    history only if G1 isn't merged. We ONLY cache the live G1 result — a
    transient fallback must never get pinned, otherwise the optimization would
    keep showing demo numbers (and a different accuracy) after G1 is ready."""
    key = (model, start_date or "open")
    cached = _FC_CACHE.get(key)
    if cached and cached.get("live"):
        return cached
    fc = await _compute_week_forecast(model, start_date)
    if fc.get("live"):
        _FC_CACHE[key] = fc
    return fc


async def _compute_week_forecast(model: str, start_date: Optional[str]) -> dict[str, Any]:
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
                "model": model,
                "model_label": _MODEL_LABEL[model],
                "live": True,
                "source": f"Live forecast on real ED arrivals — {_MODEL_LABEL[model]}",
            }
    except HTTPException:
        pass  # G1 not merged → fall back
    except Exception:
        pass

    # Fallback: forecast the simulation's own daily arrivals — with the SELECTED
    # engine, so the statistical vs ML comparison is genuine.
    daily = await simulation_data.load("staff_daily.csv")
    daily = daily.sort_values("date")
    hist = pd.to_numeric(daily["total_arrivals"], errors="coerce").dropna()
    dates = list(daily["date"].astype(str))[-len(hist):]
    history = [float(v) for v in hist.to_numpy()][-365:]
    dates = dates[-len(history):]
    res = (run_ml_forecast if model == "ml" else run_arima_forecast)(history, dates, 7)
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
        "model": model,
        "model_label": _MODEL_LABEL[model],
        "live": False,
        "source": f"Demo data — {_MODEL_LABEL[model]} (build G1 on Prepare for live numbers)",
    }


def _staff_records(df) -> list[dict]:
    return [{
        "staff_id": r["staff_id"],
        "category": r["category"],
        "skill_level": int(r.get("skill_level") or 0),
        "annual_salary_zar": float(r.get("annual_salary_zar") or 0),
    } for _, r in df.iterrows()]


async def _load_staff() -> list[dict]:
    try:
        df = await simulation_data.load("staff_members.csv")
    except FileNotFoundError as e:
        raise HTTPException(503, {"error": "simulation_missing", "message": str(e)})
    return _staff_records(df)


async def _load_items() -> list[dict]:
    try:
        items_df = await simulation_data.load("supply_items.csv")
        panel_df = await simulation_data.load("supply_panel.csv")
    except FileNotFoundError as e:
        raise HTTPException(503, {"error": "simulation_missing", "message": str(e)})
    # Current stock snapshot = each item's latest recorded stock-on-hand.
    last_stock = (panel_df.sort_values("date")
                  .groupby("item_id")["recorded_stock_on_hand_units"].last().to_dict())
    items = items_df.to_dict("records")
    for it in items:
        cur = last_stock.get(it.get("item_id"))
        it["current_stock_units"] = None if cur is None else float(cur)
    return items


@router.post("/staff")
async def run_staff(req: RunRequest) -> dict[str, Any]:
    """Run ONLY the staff (workforce IP) optimization."""
    forecast = await _get_week_forecast(req.model, req.start_date)
    staff = await _load_staff()
    return await run_in_threadpool(engine.run_staff, forecast, staff, req.kappa, req.weekly_budget_zar)


@router.post("/supply")
async def run_supply(req: RunRequest) -> dict[str, Any]:
    """Run ONLY the supply optimization — under the requested policy family,
    or the standing policy when none is given (Plan C)."""
    forecast = await _get_week_forecast(req.model, req.start_date)
    items = await _load_items()
    state = engine.get_policy_state()
    policy = req.policy or state["policy"]
    if policy not in engine.DEPLOYABLE_POLICIES:
        raise HTTPException(400, f"'{policy}' is not a deployable policy.")
    params = state["params_by_item"] if policy == state["policy"] else None
    return await run_in_threadpool(
        engine.run_supply_policy, forecast, items, policy, req.service_level, params)


@router.get("/policy")
async def get_policy() -> dict[str, Any]:
    """The standing supply policy + the deployable-policy registry."""
    return {
        "state": engine.get_policy_state(),
        "registry": {k: {"label": v["label"], "desc": v["desc"], "params": list(v["params"])}
                     for k, v in engine.DEPLOYABLE_POLICIES.items()},
    }


@router.put("/policy")
async def put_policy(req: PolicyRequest) -> dict[str, Any]:
    """Adopt a standing policy family (untuned: textbook parameters apply
    until /policy/tune is run)."""
    try:
        state = engine.set_policy(req.policy, tuned=_LAST_TUNE.get(req.policy))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"state": state}


@router.post("/policy/tune")
async def tune_policy(req: PolicyRequest) -> dict[str, Any]:
    """Grid-search the family's parameters per item on the shared simulator
    (on demand — nothing runs on page load)."""
    items = await _load_items()
    arm_items = _arm_items(items)
    if not arm_items:
        raise HTTPException(503, "No supply items available to tune against.")
    try:
        result = await run_in_threadpool(
            engine.tune_policy, arm_items, req.policy, req.service_level)
    except ValueError as e:
        raise HTTPException(400, str(e))
    _LAST_TUNE[req.policy] = result
    # Tuning an adopted policy refreshes its stored parameters immediately.
    if engine.get_policy_state()["policy"] == req.policy:
        engine.set_policy(req.policy, tuned=result)
    return result


@router.get("/policy/tune/last")
async def tune_last() -> dict[str, Any]:
    """Most recent tuning results per policy (for Load-last-result buttons)."""
    return {"results": _LAST_TUNE}


@router.post("/run")
async def run(req: RunRequest) -> dict[str, Any]:
    """Run BOTH optimizations (combined; used by the Action Center)."""
    forecast = await _get_week_forecast(req.model, req.start_date)
    staff = await _load_staff()
    items = await _load_items()
    return await run_in_threadpool(
        engine.optimize, forecast, staff, items,
        req.kappa, req.service_level, req.weekly_budget_zar,
    )


@router.get("/forecast-options")
async def forecast_options() -> dict[str, Any]:
    """The forecast engines available to drive the optimization, with each
    one's accuracy — so the page can show what choosing each model means."""
    out = []
    for m in ("statistical", "ml"):
        try:
            fc = await _get_week_forecast(m, None)
            out.append({
                "model": m, "label": _MODEL_LABEL[m],
                "accuracy_pct": fc.get("accuracy_pct"), "mae": round(float(fc.get("mae") or 0), 1),
                "avg_daily": round(float(sum(fc["daily_total"]) / len(fc["daily_total"])), 0),
                "source": fc.get("source"),
            })
        except Exception as e:
            out.append({"model": m, "label": _MODEL_LABEL[m], "error": str(e)})
    out.sort(key=lambda x: -(x.get("accuracy_pct") or 0))
    return {"options": out, "specialty_note": (
        "Optimization is driven by the TOTAL ED arrivals forecast (Task 1). "
        "Per-specialty forecasts (Task 2: Medicine, Orthopaedics, …) inform the "
        "skills-mix in the thesis, but the simulation roster is typed by grade "
        "(PN/EN/ENA), not specialty, so specialty acuity enters as the "
        "≥1-Professional-Nurse-per-shift rule rather than per-specialty demand.")}


def _model_summary(model: str, res: dict) -> dict[str, Any]:
    fc = res["forecast"]; st = res["staff"]; sup = res["supply"]
    sc = st["cost"]; uc = sup["cost"]
    staff_annual = sc.get("saving_annual_zar") or 0
    supply_annual = uc.get("saving_zar") or 0
    return {
        "model": model, "label": _MODEL_LABEL[model],
        "accuracy_pct": fc.get("accuracy_pct"), "mae": round(float(fc.get("mae") or 0), 1),
        "staff": {"before_zar": sc["before_zar"], "after_zar": sc["after_zar"],
                  "saving_weekly_zar": sc["saving_zar"], "saving_annual_zar": staff_annual,
                  "lawful_coverage_pct": st["kpis"]["lawful_coverage_pct"],
                  "locum_hours": st["kpis"]["locum_hours"],
                  "required_slots": st["kpis"]["total_required_slots"]},
        "supply": {"before_zar": uc["before_zar"], "after_zar": uc["after_zar"],
                   "saving_annual_zar": supply_annual,
                   "stockout_after_zar": sup["cost_breakdown"]["after"]["stockout"],
                   "order_cost_zar": sup["kpis"]["order_cost_zar"]},
        "total_saving_annual_zar": round(staff_annual + supply_annual, 0),
    }


@router.post("/compare")
async def compare(req: RunRequest) -> dict[str, Any]:
    """Run the FULL optimization under BOTH forecast models and return them
    side by side, so the user can see what forecast accuracy is worth."""
    staff = await _load_staff()
    items = await _load_items()
    forecasts = {m: await _get_week_forecast(m, req.start_date) for m in ("statistical", "ml")}

    def _both():
        return {m: _model_summary(m, engine.compute_both(
            forecasts[m], staff, items, req.kappa, req.service_level))
            for m in ("statistical", "ml")}

    models = await run_in_threadpool(_both)
    a, b = models["statistical"], models["ml"]
    best = max(models.values(), key=lambda x: x.get("accuracy_pct") or 0)
    worst = min(models.values(), key=lambda x: x.get("accuracy_pct") or 0)
    return {
        "models": models,
        "comparison": {
            "more_accurate": best["model"], "less_accurate": worst["model"],
            "accuracy_gain_pts": round((best.get("accuracy_pct") or 0) - (worst.get("accuracy_pct") or 0), 1),
            "total_after_diff_zar": round((worst["staff"]["after_zar"] + worst["supply"]["after_zar"])
                                          - (best["staff"]["after_zar"] + best["supply"]["after_zar"]), 0),
            "staff_locum_diff_hours": round((worst["staff"]["locum_hours"] or 0) - (best["staff"]["locum_hours"] or 0), 0),
            "supply_after_diff_zar": round(worst["supply"]["after_zar"] - best["supply"]["after_zar"], 0),
        },
    }


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
