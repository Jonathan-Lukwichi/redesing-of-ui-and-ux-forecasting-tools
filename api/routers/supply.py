"""Supply / Inventory planner — backed by the canonical chapter-7 inventory
simulation. Headline KPIs are the 30-seed aggregated means (with 95% CIs); the
item table and time-series come from the representative seed (42)."""
from __future__ import annotations
import math
from typing import Any

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException

from core import simulation_data

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
