from fastapi import APIRouter
from typing import Dict, Any, Optional
from pydantic import BaseModel

from core.forecasting import auto_forecast
from core.optimization import optimize_staff, optimize_supply
import numpy as np
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/kpis", tags=["kpis"])


@router.get("/demo")
async def kpis_demo() -> Dict[str, Any]:
    """Full KPI snapshot using demo data — no upload needed."""
    np.random.seed(42)
    n = 90
    base = 180
    today = datetime.today()
    dates = [(today - timedelta(days=n-i)).strftime("%Y-%m-%d") for i in range(n)]
    t = np.arange(n)
    weekly = 20 * np.sin(2 * np.pi * t / 7)
    trend  = 0.3 * t
    noise  = np.random.normal(0, 8, n)
    history = (base + weekly + trend + noise).clip(100, 320).round(0).tolist()

    fc = auto_forecast(history, dates, horizon=7)
    forecast_vals = [d["predicted"] for d in fc["forecast"]]
    fc_dates      = [d["date"]      for d in fc["forecast"]]

    peak_idx   = int(np.argmax(forecast_vals))
    forecast_today = forecast_vals[0]
    forecast_7d_total = sum(forecast_vals)

    staff = optimize_staff(forecast_vals, fc_dates)

    supply_items = [
        {"sku": "N95-3M-1860",  "name": "N95 Respirator",  "category": "PPE",
         "on_hand": 78,   "unit_cost": 1.85, "ordering_cost": 45, "holding_rate": 0.25,
         "lead_time_days": 5, "daily_demand_avg": 24.0, "daily_demand_std": 4.5},
        {"sku": "IV-SAL-1L",    "name": "IV Saline 1L",    "category": "Fluids",
         "on_hand": 142,  "unit_cost": 2.40, "ordering_cost": 60, "holding_rate": 0.22,
         "lead_time_days": 4, "daily_demand_avg": 50.0, "daily_demand_std": 9.0},
        {"sku": "OXY-MASK-A",   "name": "Oxygen mask",     "category": "Resp",
         "on_hand": 64,   "unit_cost": 3.20, "ordering_cost": 40, "holding_rate": 0.25,
         "lead_time_days": 5, "daily_demand_avg": 16.0, "daily_demand_std": 3.5},
        {"sku": "GLOVE-NIT-M",  "name": "Nitrile gloves",  "category": "PPE",
         "on_hand": 4200, "unit_cost": 0.12, "ordering_cost": 30, "holding_rate": 0.20,
         "lead_time_days": 3, "daily_demand_avg": 140.0,"daily_demand_std": 18.0},
    ]
    sup = optimize_supply(supply_items, forecast_total_7d=forecast_7d_total)

    items_at_rop    = sum(1 for i in sup["items"] if i["status"] == "below_rop")
    stockout_risk   = sum(1 for i in sup["items"] if i["days_cover"] < i["rop"] / max(i["daily_demand_avg"], 0.1))

    total_savings = staff["weekly_savings"] + sup["weekly_savings"]

    return {
        "forecast_today":       round(forecast_today, 1),
        "forecast_7d_total":    round(forecast_7d_total, 1),
        "forecast_peak_day":    fc_dates[peak_idx],
        "forecast_peak_value":  round(forecast_vals[peak_idx], 1),
        "model_mape":           fc["mape"],
        "model_mae":            fc["mae"],
        "model_used":           fc["model_used"],
        "staff_coverage_pct":   staff["coverage_pct"],
        "staff_weekly_cost":    staff["total_cost"],
        "staff_weekly_savings": staff["weekly_savings"],
        "staff_overtime_hrs":   round(sum(s["overtime_hrs"] for s in staff["schedules"]), 1),
        "supply_service_level": sup["service_level"],
        "supply_items_at_rop":  items_at_rop,
        "supply_stockout_risk": stockout_risk,
        "supply_weekly_savings":sup["weekly_savings"],
        "actions_critical":     2,
        "actions_high":         3,
        "estimated_savings":    round(total_savings, 2),
    }
