"""Supply / Inventory planner — backed by the canonical chapter-7 inventory
simulation. Headline KPIs are the 30-seed aggregated means (with 95% CIs); the
item table and time-series come from the representative seed (42)."""
from __future__ import annotations
import math
from typing import Any, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core import simulation_data
from core.optimization_engine import (
    optimize_supply_multi_arm,
    optimize_supply_lead_time_sweep,
    DEFAULT_LEAD_TIME_SWEEP,
)

router = APIRouter(prefix="/api/supply", tags=["supply"])


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


def _status(service: float, stockouts: float, days_cover: float) -> str:
    if (service or 1) < 0.95 or (stockouts or 0) > 0:
        return "stockout"
    if days_cover is not None and days_cover > 120:
        return "excess"
    return "ok"


@router.get("/overview")
async def overview() -> dict[str, Any]:
    try:
        items = await simulation_data.load("supply_items.csv")
        kpis = await _kpis("supply_kpis.csv")
    except FileNotFoundError as e:
        raise HTTPException(503, {"error": "simulation_missing", "message": str(e)})

    rows = []
    for _, r in items.iterrows():
        mean_daily = float(r.get("mean_daily_consumption") or 0)
        avg_stock = float(r.get("avg_stock_on_hand") or 0)
        days_cover = round(avg_stock / mean_daily, 1) if mean_daily > 0 else None
        service = float(r.get("service_level_achieved") or 1)
        stockouts = float(r.get("number_of_stockout_events") or 0)
        rows.append({
            "item_id":        r["item_id"],
            "item_name":      r["item_name"],
            "category":       r["category"],
            "abc_class":      r["abc_class"],
            "unit":           r.get("unit"),
            "on_tender":      bool(r.get("on_current_tender")),
            "unit_price_zar": _nan(round(float(r.get("unit_price_zar") or 0), 2)),
            "mean_daily_consumption": round(mean_daily, 1),
            "days_cover":     days_cover,
            "service_level":  round(service * 100, 1),
            "stockout_events": int(stockouts),
            "total_cost_zar": _nan(round(float(r.get("total_cost_zar") or 0), 0)),
            "stockout_cost_zar": _nan(round(float(r.get("total_stockout_cost_zar") or 0), 0)),
            "inventory_value_zar": _nan(round(float(r.get("inventory_value_zar") or 0), 0)),
            "status":         _status(service, stockouts, days_cover),
        })
    order = {"stockout": 0, "excess": 1, "ok": 2}
    abc_order = {"A": 0, "B": 1, "C": 2}
    rows.sort(key=lambda x: (order.get(x["status"], 9), abc_order.get(x["abc_class"], 9),
                             -(x["total_cost_zar"] or 0)))

    by_abc = []
    for cls in ["A", "B", "C"]:
        sub = items[items["abc_class"] == cls]
        if len(sub):
            by_abc.append({
                "abc_class": cls,
                "items": int(len(sub)),
                "cost_zar": round(float(sub["total_cost_zar"].sum()), 0),
                "inventory_value_zar": round(float(sub["inventory_value_zar"].sum()), 0),
            })

    # Headline KPIs computed from THIS representative run, so they reconcile with
    # the item table and ABC breakdown exactly. The 30-seed means+CIs go in `ci`.
    headline = {
        "n_items":            int(len(items)),
        "items_at_risk":      int(sum(1 for x in rows if x["status"] == "stockout")),
        "total_cost_zar":     round(float(items["total_cost_zar"].sum()), 0),
        "stockout_cost_zar":  round(float(items["total_stockout_cost_zar"].sum()), 0),
        "inventory_value_zar": round(float(items["inventory_value_zar"].sum()), 0),
    }
    return {
        "kpis": headline,        # this run (consistent with the table/ABC below)
        "ci": kpis,              # 30-seed aggregated means + 95% CIs (context note)
        "items_at_risk": headline["items_at_risk"],
        "n_items": headline["n_items"],
        "inventory_value_zar": headline["inventory_value_zar"],
        "items": rows,
        "by_abc": by_abc,
    }


@router.get("/item/{item_id}")
async def item_detail(item_id: str) -> dict[str, Any]:
    try:
        items = await simulation_data.load("supply_items.csv")
        panel = await simulation_data.load("supply_panel.csv")
    except FileNotFoundError as e:
        raise HTTPException(503, {"error": "simulation_missing", "message": str(e)})

    meta = items[items["item_id"] == item_id]
    if meta.empty:
        raise HTTPException(404, f"Unknown item '{item_id}'.")
    m = meta.iloc[0]
    sub = panel[panel["item_id"] == item_id].sort_values("date")
    series = [{
        "date":        row["date"],
        "consumption": _nan(round(float(row["daily_consumption_units"]), 1)),
        "stock":       _nan(round(float(row["recorded_stock_on_hand_units"]), 0)),
        "on_order":    _nan(round(float(row["stock_on_order_units"]), 0)),
        "stockout":    _nan(round(float(row["stockout_today_units"]), 1)),
        "expiry":      _nan(round(float(row["expiry_today_units"]), 1)),
        "order_placed": bool(row["order_placed_today"]),
    } for _, row in sub.iterrows()]

    return {
        "item": {
            "item_id":   m["item_id"],
            "item_name": m["item_name"],
            "category":  m["category"],
            "abc_class": m["abc_class"],
            "unit":      m.get("unit"),
            "on_tender": bool(m.get("on_current_tender")),
            "unit_price_zar": _nan(round(float(m.get("unit_price_zar") or 0), 2)),
            "lead_time_days": _nan(m.get("lead_time_mean_days")),
            "mean_daily_consumption": round(float(m.get("mean_daily_consumption") or 0), 1),
            "service_level": round(float(m.get("service_level_achieved") or 1) * 100, 1),
            "stockout_events": int(m.get("number_of_stockout_events") or 0),
            "shelf_life_months": _nan(m.get("shelf_life_months")),
        },
        "series": series,
    }


# ─── Policy comparison + lead-time sweep (forecast-value demonstration) ────────
#
# These endpoints power the two new Supply Planner cards. They run a
# self-contained 4-policy inventory simulation (naive / static (s,S) / dynamic
# forecast base-stock / oracle) so the app can SHOW where feeding the forecast
# into the reorder decision actually pays — and where it doesn't (long lead
# times). The demo endpoints use a small illustrative basket; the POST variants
# accept a caller-supplied basket for the same engine.

class SupplyItemIn(BaseModel):
    sku: str
    name: str = ""
    category: str = ""
    on_hand: int = 0
    unit_cost: float
    ordering_cost: float = 50.0
    holding_rate: float = 0.25
    lead_time_days: int = 5
    daily_demand_avg: float
    daily_demand_std: float = 0.0


class SupplyCompareRequest(BaseModel):
    items: List[SupplyItemIn]
    service_level: float = 0.95
    lead_time_mean: Optional[float] = None


class SupplySweepRequest(BaseModel):
    items: List[SupplyItemIn]
    service_level: float = 0.95
    lead_times: Optional[List[float]] = None


# Illustrative hospital consumables basket for the demo cards (self-contained;
# independent of the calibrated 30-item chapter-7 panel served by /overview).
DEMO_ITEMS = [
    {"sku": "N95-3M-1860", "name": "N95 Respirator (3M 1860)", "category": "PPE",
     "on_hand": 78,   "unit_cost": 1.85, "ordering_cost": 45, "holding_rate": 0.25,
     "lead_time_days": 5, "daily_demand_avg": 24.0, "daily_demand_std": 4.5},
    {"sku": "GLOVE-NIT-M", "name": "Nitrile gloves (M)", "category": "PPE",
     "on_hand": 4200, "unit_cost": 0.12, "ordering_cost": 30, "holding_rate": 0.20,
     "lead_time_days": 3, "daily_demand_avg": 140.0, "daily_demand_std": 18.0},
    {"sku": "IV-SAL-1L", "name": "IV Saline 1L", "category": "Fluids",
     "on_hand": 142,  "unit_cost": 2.40, "ordering_cost": 60, "holding_rate": 0.22,
     "lead_time_days": 4, "daily_demand_avg": 50.0, "daily_demand_std": 9.0},
    {"sku": "SYRG-10ML", "name": "Syringe 10mL", "category": "Disposable",
     "on_hand": 1840, "unit_cost": 0.35, "ordering_cost": 35, "holding_rate": 0.20,
     "lead_time_days": 3, "daily_demand_avg": 80.0, "daily_demand_std": 12.0},
    {"sku": "OXY-MASK-A", "name": "Oxygen mask (adult)", "category": "Resp",
     "on_hand": 64,   "unit_cost": 3.20, "ordering_cost": 40, "holding_rate": 0.25,
     "lead_time_days": 5, "daily_demand_avg": 16.0, "daily_demand_std": 3.5},
    {"sku": "EPI-1MG", "name": "Epinephrine 1mg", "category": "Pharm",
     "on_hand": 218,  "unit_cost": 8.50, "ordering_cost": 80, "holding_rate": 0.30,
     "lead_time_days": 7, "daily_demand_avg": 8.0,  "daily_demand_std": 2.0},
    {"sku": "BAND-EL-4", "name": "Elastic bandage 4\"", "category": "Wound",
     "on_hand": 412,  "unit_cost": 1.10, "ordering_cost": 25, "holding_rate": 0.20,
     "lead_time_days": 2, "daily_demand_avg": 14.0, "daily_demand_std": 3.0},
]


@router.post("/compare")
async def supply_compare(req: SupplyCompareRequest) -> dict[str, Any]:
    """Run four inventory policies side by side at one lead-time setting.

    naive · static (s,S) · dynamic forecast base-stock (Li et al.) · oracle.
    """
    if not req.items:
        raise HTTPException(400, "Provide at least one inventory item.")
    if not (0.8 <= req.service_level <= 0.999):
        raise HTTPException(400, "service_level must be between 0.80 and 0.999.")
    try:
        return optimize_supply_multi_arm(
            items=[i.model_dump() for i in req.items],
            service_level=req.service_level,
            lead_time_mean=req.lead_time_mean,
        )
    except Exception as e:
        raise HTTPException(500, f"Supply comparison failed: {e}")


@router.post("/sweep")
async def supply_sweep(req: SupplySweepRequest) -> dict[str, Any]:
    """Sweep all four policies across a range of mean lead times (crossover chart)."""
    if not req.items:
        raise HTTPException(400, "Provide at least one inventory item.")
    if not (0.8 <= req.service_level <= 0.999):
        raise HTTPException(400, "service_level must be between 0.80 and 0.999.")
    try:
        return optimize_supply_lead_time_sweep(
            items=[i.model_dump() for i in req.items],
            service_level=req.service_level,
            lead_times=req.lead_times,
        )
    except Exception as e:
        raise HTTPException(500, f"Supply sweep failed: {e}")


@router.get("/compare-demo")
async def supply_compare_demo() -> dict[str, Any]:
    """Demo multi-arm comparison at the mean of the demo-item lead times."""
    return optimize_supply_multi_arm(DEMO_ITEMS, service_level=0.95)


@router.get("/sweep-demo")
async def supply_sweep_demo() -> dict[str, Any]:
    """Demo lead-time sweep for the crossover chart."""
    return optimize_supply_lead_time_sweep(
        DEMO_ITEMS, service_level=0.95, lead_times=list(DEFAULT_LEAD_TIME_SWEEP),
    )
