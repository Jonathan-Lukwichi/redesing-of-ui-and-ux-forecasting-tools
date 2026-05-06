from fastapi import APIRouter
from typing import List, Dict, Any
from pydantic import BaseModel

router = APIRouter(prefix="/api/actions", tags=["actions"])


class ActionsRequest(BaseModel):
    forecast: List[float]
    dates: List[str]
    supply_items: List[Dict[str, Any]] = []
    staff_schedule: List[Dict[str, Any]] = []
    supply_results: List[Dict[str, Any]] = []


@router.post("")
async def generate_actions(req: ActionsRequest) -> Dict[str, Any]:
    actions = []

    # ── Staff actions from schedule ──────────────────────────────────────────
    for s in req.staff_schedule:
        patients = s.get("patients", 0)
        total    = s.get("total_staff", 0)
        ot       = s.get("overtime_hrs", 0)
        date     = s.get("date", "")

        capacity = total * 5  # rough patients per shift
        if patients > capacity * 0.95 or ot > 2:
            actions.append({
                "priority": "danger" if ot > 3 else "warning",
                "label":    "Critical" if ot > 3 else "High",
                "tab":      "Staff",
                "title":    f"Understaffing risk on {date}",
                "desc":     f"Forecast: {patients:.0f} patients. Current schedule: {total} staff "
                            f"({'%.1f' % ot}h overtime). Consider adding staff.",
                "tags":     ["Staff", date],
                "impact":   f"${ot * 200:.0f}" if ot > 0 else "—",
                "why":      f"Demand-to-capacity ratio exceeds threshold on {date}.",
            })

    # ── Supply actions from optimized inventory ──────────────────────────────
    for item in req.supply_results:
        status = item.get("status", "ok")
        name   = item.get("name", item.get("sku", "Unknown"))
        dc     = item.get("days_cover", 99)
        rop    = item.get("rop", 0)
        on_hand= item.get("on_hand", 0)
        qty    = item.get("opt_order_qty", 0)
        lt     = item.get("lead_time_days", 5)  # not always present

        if status == "below_rop":
            actions.append({
                "priority": "danger" if dc < 3 else "warning",
                "label":    "Critical" if dc < 3 else "High",
                "tab":      "Supply",
                "title":    f"Reorder {name}",
                "desc":     f"Stock at {on_hand} units ({dc:.1f} days cover). ROP is {rop:.0f}. "
                            f"Suggested order: {qty} units.",
                "tags":     ["Supply", item.get("category", "")],
                "impact":   "Prevent stockout",
                "why":      f"At current burn rate, stockout in {dc:.1f} days. Lead time is {lt}d.",
            })
        elif status == "excess":
            actions.append({
                "priority": "info",
                "label":    "Medium",
                "tab":      "Supply",
                "title":    f"Review excess stock: {name}",
                "desc":     f"{on_hand} units on hand vs ROP {rop:.0f} ({dc:.1f} days cover). "
                            f"Consider redistributing or returning excess.",
                "tags":     ["Supply", "Excess", item.get("category", "")],
                "impact":   "—",
            })

    # ── Forecast-driven capacity actions ────────────────────────────────────
    if req.forecast:
        import numpy as np
        avg = float(np.mean(req.forecast))
        peak_val = max(req.forecast)
        peak_idx = req.forecast.index(peak_val)
        peak_date = req.dates[peak_idx] if req.dates else "Unknown"

        if peak_val > avg * 1.15:
            actions.append({
                "priority": "warning",
                "label":    "High",
                "tab":      "Capacity",
                "title":    f"Peak demand expected on {peak_date}",
                "desc":     f"Forecast shows {peak_val:.0f} arrivals on {peak_date} "
                            f"(+{((peak_val/avg)-1)*100:.0f}% above weekly avg). "
                            f"Pre-position overflow capacity.",
                "tags":     ["Capacity", peak_date],
                "impact":   "Reduce wait time",
                "why":      f"Weekly average is {avg:.0f} patients. Peak exceeds by "
                            f"{peak_val - avg:.0f}.",
            })

    # Sort: danger first, then warning, then info
    priority_order = {"danger": 0, "warning": 1, "info": 2}
    actions.sort(key=lambda a: priority_order.get(a["priority"], 3))

    return {
        "success": True,
        "count":   len(actions),
        "critical":sum(1 for a in actions if a["priority"] == "danger"),
        "high":    sum(1 for a in actions if a["priority"] == "warning"),
        "medium":  sum(1 for a in actions if a["priority"] == "info"),
        "actions": actions,
    }


@router.get("/demo")
async def actions_demo() -> Dict[str, Any]:
    """Demo actions based on the built-in demo forecast + supply."""
    forecast = [188.0, 195.0, 218.0, 232.0, 215.0, 188.0, 174.0]
    dates    = ["2026-05-04","2026-05-05","2026-05-06","2026-05-07",
                "2026-05-08","2026-05-09","2026-05-10"]

    from core.optimization import optimize_staff, optimize_supply

    staff    = optimize_staff(forecast, dates)
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
        {"sku": "BAND-EL-4",    "name": "Elastic bandage", "category": "Wound",
         "on_hand": 412,  "unit_cost": 1.10, "ordering_cost": 25, "holding_rate": 0.20,
         "lead_time_days": 2, "daily_demand_avg": 14.0, "daily_demand_std": 3.0},
    ]
    sup = optimize_supply(supply_items, forecast_total_7d=sum(forecast))

    req = ActionsRequest(
        forecast=forecast,
        dates=dates,
        staff_schedule=staff["schedules"],
        supply_results=sup["items"],
    )
    return await generate_actions(req)
