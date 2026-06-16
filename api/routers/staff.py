"""Staff / Scheduling planner — backed by the chapter-7 scheduling simulation
(seed 42). See core/simulation_data.py for the data source."""
from __future__ import annotations
import math
from typing import Any

import numpy as np
from fastapi import APIRouter, HTTPException

from core import simulation_data

router = APIRouter(prefix="/api/staff", tags=["staff"])


def _nan(v: Any) -> Any:
    """Coerce numpy scalars to native Python and NaN/inf to None for JSON."""
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, (np.floating, float)):
        f = float(v)
        return None if (math.isnan(f) or math.isinf(f)) else f
    return v


@router.get("/overview")
async def overview() -> dict[str, Any]:
    try:
        members = await simulation_data.load("staff_members.csv")
        daily   = await simulation_data.load("staff_daily.csv")
        shifts  = await simulation_data.load("staff_shifts.csv")
    except FileNotFoundError as e:
        raise HTTPException(503, {"error": "simulation_missing", "message": str(e)})

    daily = daily.sort_values("date")

    # KPIs
    req = float(daily["total_required_nurses"].sum())
    staffed = float(daily["total_staffed_nurses"].sum())
    coverage = (staffed / req * 100) if req else 100.0
    kpis = {
        "coverage_pct":     round(coverage, 1),
        "total_payroll_zar": round(float(daily["total_payroll_cost_zar"].sum()), 0),
        "overtime_hours":   round(float(daily["total_overtime_hours"].sum()), 0),
        "bcea_violations":  int(members.get("bcea_45h_violations", 0).sum()) if "bcea_45h_violations" in members else 0,
        "unfilled_shifts":  int(daily["total_unfilled_shifts"].sum()),
        "n_staff":          int(len(members)),
        "days_simulated":   int(daily["date"].nunique()),
    }

    # Daily coverage series (arrivals vs required vs staffed)
    day_series = [{
        "date":      r["date"],
        "arrivals":  _nan(round(float(r["total_arrivals"]), 0)),
        "required":  int(r["total_required_nurses"]),
        "staffed":   int(r["total_staffed_nurses"]),
        "overtime":  _nan(round(float(r["total_overtime_hours"]), 1)),
        "unfilled":  int(r["total_unfilled_shifts"]),
        "cost":      _nan(round(float(r["total_payroll_cost_zar"]), 0)),
        "is_weekend": bool(r["is_weekend"]),
    } for _, r in daily.iterrows()]

    # Shift breakdown (Day / Evening / Night) averaged across the run.
    shift_rows = []
    for shift, sub in shifts.groupby("shift"):
        shift_rows.append({
            "shift":     shift,
            "avg_required": round(float(sub["required_nurses"].mean()), 1),
            "avg_staffed":  round(float(sub["staffed_nurses"].mean()), 1),
            "unfilled":     int(sub["unfilled_positions"].sum()),
            "locum_hours":  round(float(sub["locum_hours_used"].sum()), 0),
            "cost_zar":     round(float(sub["shift_total_cost_zar"].sum()), 0),
        })
    shift_order = {"Day": 0, "Evening": 1, "Night": 2}
    shift_rows.sort(key=lambda x: shift_order.get(x["shift"], 9))

    # Staff roster
    staff_rows = []
    for _, r in members.iterrows():
        staff_rows.append({
            "staff_id":     r["staff_id"],
            "name":         r.get("staff_name"),
            "category":     r["category"],
            "skill_level":  int(r.get("skill_level") or 0),
            "days_worked":  int(r.get("days_worked") or 0),
            "regular_hours": _nan(round(float(r.get("regular_hours") or 0), 0)),
            "overtime_hours": _nan(round(float(r.get("overtime_hours") or 0), 0)),
            "avg_weekly_hours": _nan(round(float(r.get("avg_weekly_hours") or 0), 1)),
            "days_sick":    int(r.get("days_sick") or 0),
            "payroll_cost_zar": _nan(round(float(r.get("payroll_cost_zar") or 0), 0)),
            "bcea_violations": int(r.get("bcea_45h_violations") or 0),
        })
    cat_order = {"Professional Nurse": 0, "Enrolled Nurse": 1, "Enrolled Nursing Auxiliary": 2}
    staff_rows.sort(key=lambda x: (cat_order.get(x["category"], 9), -(x["payroll_cost_zar"] or 0)))

    # Staff mix by category
    by_category = []
    for cat, sub in members.groupby("category"):
        by_category.append({
            "category": cat,
            "count": int(len(sub)),
            "payroll_zar": round(float(sub["payroll_cost_zar"].sum()), 0),
            "overtime_hours": round(float(sub["overtime_hours"].sum()), 0),
        })
    by_category.sort(key=lambda x: -x["payroll_zar"])

    return {"kpis": kpis, "daily": day_series, "shifts": shift_rows,
            "staff": staff_rows, "by_category": by_category}
