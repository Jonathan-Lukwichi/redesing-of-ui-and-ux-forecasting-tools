"""Supply / Inventory planner — backed by the chapter-7 inventory simulation
(seed 42). See core/simulation_data.py for the data source."""
from __future__ import annotations
import math
from typing import Any

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException

from core import simulation_data

router = APIRouter(prefix="/api/supply", tags=["supply"])


def _nan(v: Any) -> Any:
    """Coerce numpy scalars to native Python and NaN/inf to None for JSON."""
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, (np.floating, float)):
        f = float(v)
        return None if (math.isnan(f) or math.isinf(f)) else f
    return v


def _status(stockout_days: float, service_level: float, days_cover: float) -> str:
    if (stockout_days or 0) > 0 or (service_level or 1) < 0.98:
        return "stockout"
    if days_cover is not None and days_cover > 90:
        return "excess"
    return "ok"


@router.get("/overview")
async def overview() -> dict[str, Any]:
    try:
        items = await simulation_data.load("supply_items.csv")
    except FileNotFoundError as e:
        raise HTTPException(503, {"error": "simulation_missing", "message": str(e)})

    rows = []
    for _, r in items.iterrows():
        mean_daily = float(r.get("mean_daily_consumption") or 0)
        avg_stock = float(r.get("avg_stock_on_hand") or 0)
        days_cover = round(avg_stock / mean_daily, 1) if mean_daily > 0 else None
        sl = float(r.get("service_level") or 1)
        stockout_days = float(r.get("stockout_days") or 0)
        rows.append({
            "item_id":        r["item_id"],
            "item_name":      r["item_name"],
            "category":       r["category"],
            "abc_class":      r["abc_class"],
            "unit":           r.get("unit"),
            "unit_price_zar": _nan(round(float(r.get("unit_price_zar") or 0), 2)),
            "mean_daily_consumption": round(mean_daily, 1),
            "days_cover":     days_cover,
            "service_level":  round(sl * 100, 1),
            "stockout_days":  int(stockout_days),
            "total_cost_zar": _nan(round(float(r.get("total_cost_zar") or 0), 0)),
            "inventory_value_zar": _nan(round(float(r.get("inventory_value_zar") or 0), 0)),
            "lead_time_days": _nan(r.get("lead_time_mean_days")),
            "status":         _status(stockout_days, sl, days_cover),
        })
    order = {"stockout": 0, "excess": 1, "ok": 2}
    abc_order = {"A": 0, "B": 1, "C": 2}
    rows.sort(key=lambda x: (order.get(x["status"], 9), abc_order.get(x["abc_class"], 9),
                             -(x["total_cost_zar"] or 0)))

    consumption = float(items["total_consumption_units"].sum())
    stockout_units = float(items.get("stockout_units", pd.Series([0])).sum())
    service_level = (1.0 - stockout_units / consumption) if consumption else 1.0

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

    by_category = []
    for cat, sub in items.groupby("category"):
        by_category.append({
            "category": cat,
            "items": int(len(sub)),
            "inventory_value_zar": round(float(sub["inventory_value_zar"].sum()), 0),
        })

    kpis = {
        "service_level_pct":   round(service_level * 100, 1),
        "items_at_risk":       int(sum(1 for x in rows if x["status"] == "stockout")),
        "stockout_events":     int(items["stockout_days"].sum()),
        "total_cost_zar":      round(float(items["total_cost_zar"].sum()), 0),
        "inventory_value_zar": round(float(items["inventory_value_zar"].sum()), 0),
        "n_items":             int(len(items)),
    }
    return {"kpis": kpis, "items": rows, "by_abc": by_abc,
            "by_category": sorted(by_category, key=lambda x: -x["inventory_value_zar"])}


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
        "date":         row["date"],
        "consumption":  _nan(round(float(row["daily_consumption_units"]), 1)),
        "stock":        _nan(round(float(row["stock_on_hand_units"]), 0)),
        "on_order":     _nan(round(float(row["stock_on_order_units"]), 0)),
        "stockout":     _nan(round(float(row["stockout_today_units"]), 1)),
        "order_placed": bool(row["order_placed_today"]),
    } for _, row in sub.iterrows()]

    return {
        "item": {
            "item_id":   m["item_id"],
            "item_name": m["item_name"],
            "category":  m["category"],
            "abc_class": m["abc_class"],
            "unit":      m.get("unit"),
            "unit_price_zar": _nan(round(float(m.get("unit_price_zar") or 0), 2)),
            "lead_time_days": _nan(m.get("lead_time_mean_days")),
            "mean_daily_consumption": round(float(m.get("mean_daily_consumption") or 0), 1),
            "service_level": round(float(m.get("service_level") or 1) * 100, 1),
            "stockout_days": int(m.get("stockout_days") or 0),
            "shelf_life_months": _nan(m.get("shelf_life_months")),
        },
        "series": series,
    }
