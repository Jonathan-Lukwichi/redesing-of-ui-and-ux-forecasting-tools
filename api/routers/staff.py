"""Staff / Scheduling planner — backed by the canonical chapter-7 scheduling
simulation. Headline KPIs are the 30-seed aggregated means (with 95% CIs); the
per-staff roster and daily/shift series come from the representative seed (42).

Note: the simulation LOGS BCEA violations rather than enforcing them (12-hour
shifts are the SA public-hospital norm), so high violation counts and ~58h weeks
are the literature-anchored reality, not a bug."""
from __future__ import annotations
import math
from typing import Any

import numpy as np
from fastapi import APIRouter, HTTPException

from core import simulation_data

router = APIRouter(prefix="/api/staff", tags=["staff"])


def _nan(v: Any) -> Any:
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, (np.floating, float)):
        f = float(v)
        return None if (math.isnan(f) or math.isinf(f)) else f
    return v


async def _kpis(name: str) -> dict[str, dict]:
    df = await simulation_data.load(name)
    return {r["kpi"]: {"mean": round(float(r["mean"]), 1),
                       "lo": round(float(r["lower_95"]), 1),
                       "hi": round(float(r["upper_95"]), 1)}
            for _, r in df.iterrows()}


@router.get("/overview")
async def overview() -> dict[str, Any]:
    try:
        members = await simulation_data.load("staff_members.csv")
        daily   = await simulation_data.load("staff_daily.csv")
        shifts  = await simulation_data.load("staff_shifts.csv")
        kpis    = await _kpis("staff_kpis.csv")
    except FileNotFoundError as e:
        raise HTTPException(503, {"error": "simulation_missing", "message": str(e)})

    daily = daily.sort_values("date")

    day_series = [{
        "date":      r["date"],
        "arrivals":  _nan(round(float(r["total_arrivals"]), 0)),
        "required":  int(r["total_required_nurses"]),
        "staffed":   int(r["total_staffed_nurses"]),
        "locum_hours": _nan(round(float(r["total_locum_hours"]), 1)),
        "unfilled":  int(r["total_unfilled_shifts"]),
        "bcea_today": int(r.get("bcea_violations_today", 0) or 0),
        "cost":      _nan(round(float(r["total_payroll_cost_zar"]), 0)),
        "is_weekend": bool(r["is_weekend"]),
    } for _, r in daily.iterrows()]

    shift_rows = []
    for shift, sub in shifts.groupby("shift"):
        shift_rows.append({
            "shift":        shift,
            "avg_required": round(float(sub["required_nurses"].mean()), 1),
            "avg_filled":   round(float(sub["filled_staff_assigned"].mean()), 1),
            "unfilled":     int(sub["unfilled_positions_after_locum"].sum()),
            "locum_hours":  round(float(sub["locum_hours_used"].sum()), 0),
            "cost_zar":     round(float(sub["shift_total_cost_zar"].sum()), 0),
        })
    shift_order = {"Day": 0, "Evening": 1, "Night": 2}
    shift_rows.sort(key=lambda x: shift_order.get(x["shift"], 9))

    staff_rows = []
    for _, r in members.iterrows():
        staff_rows.append({
            "staff_id":     r["staff_id"],
            "category":     r["category"],
            "skill_level":  int(r.get("skill_level") or 0),
            "days_worked":  int(r.get("total_days_worked") or 0),
            "days_sick":    int(r.get("total_days_sick") or 0),
            "regular_hours": _nan(round(float(r.get("total_regular_hours") or 0), 0)),
            "overtime_hours": _nan(round(float(r.get("total_overtime_hours") or 0), 0)),
            "avg_weekly_hours": _nan(round(float(r.get("average_weekly_hours") or 0), 1)),
            "max_weekly_hours": _nan(round(float(r.get("max_weekly_hours_observed") or 0), 0)),
            "bcea_violations": int(r.get("bcea_45hour_violations_count") or 0),
            "payroll_cost_zar": _nan(round(float(r.get("total_payroll_cost_zar") or 0), 0)),
        })
    cat_order = {"Professional Nurse": 0, "Enrolled Nurse": 1, "Enrolled Nursing Auxiliary": 2}
    staff_rows.sort(key=lambda x: (cat_order.get(x["category"], 9), -(x["payroll_cost_zar"] or 0)))

    by_category = []
    for cat, sub in members.groupby("category"):
        by_category.append({
            "category": cat,
            "count": int(len(sub)),
            "payroll_zar": round(float(sub["total_payroll_cost_zar"].sum()), 0),
            "avg_weekly_hours": round(float(sub["average_weekly_hours"].mean()), 1),
        })
    by_category.sort(key=lambda x: -x["payroll_zar"])

    # Headline KPIs from THIS representative run, consistent with the roster table.
    req = float(daily["total_required_nurses"].sum())
    staffed = float(daily["total_staffed_nurses"].sum())
    n_active = int(len(members))
    mean_wk = float(members["average_weekly_hours"].mean())

    # Lawful-staffing scenario: what coverage the available nurses could deliver
    # if each worked only the legal 45h/week (no overwork). The gap between this
    # and the actual (overwork-propped) coverage is the true demand-supply mismatch.
    SHIFT_H = 12.0          # 12-hour shifts (SA norm); each required slot = one shift
    LEGAL_WEEKLY = 45.0     # BCEA s9 weekly maximum
    weeks = daily["date"].nunique() / 7.0
    req_hours = req * SHIFT_H
    legal_capacity_h = n_active * LEGAL_WEEKLY * weeks
    nurses_needed_legal = (req_hours / (LEGAL_WEEKLY * weeks)) if weeks else n_active

    headline = {
        "coverage_pct":          round((staffed / req * 100) if req else 100.0, 1),   # actual (overwork-propped)
        "lawful_coverage_pct":   round((legal_capacity_h / req_hours * 100) if req_hours else 100.0, 1),
        "nurses_needed_legal":   round(nurses_needed_legal, 1),
        "staffing_shortfall":    max(0, int(round(nurses_needed_legal - n_active))),
        "overwork_pct":          int(round(mean_wk / LEGAL_WEEKLY * 100)),
        "annual_payroll_zar":    round(float(members["total_payroll_cost_zar"].sum()), 0),
        "mean_weekly_hours":     round(mean_wk, 1),
        "bcea_per_nurse":        int(round(float(members["bcea_45hour_violations_count"].mean()))),
        "locum_hours":           round(float(daily["total_locum_hours"].sum()), 0),
        "n_active_staff":        n_active,
        "n_posts":               30,
    }
    return {
        "kpis": headline,        # this run (consistent with the roster table)
        "ci": kpis,              # 30-seed aggregated means + 95% CIs (context note)
        "n_active_staff": headline["n_active_staff"],
        "days_simulated": int(daily["date"].nunique()),
        "daily": day_series,
        "shifts": shift_rows,
        "staff": staff_rows,
        "by_category": by_category,
    }
