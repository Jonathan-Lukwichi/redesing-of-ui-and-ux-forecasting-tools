"""Read-only tools the Ask-chat can call. Each wraps an existing app endpoint
and trims the result to keep token cost low. The chat can ONLY read — there are
no state-changing tools here by design."""
from __future__ import annotations
import os
from typing import Any

import httpx

_BASE = (os.getenv("SELF_BASE_URL") or "http://127.0.0.1:8000").rstrip("/")


# Anthropic tool schemas (read-only).
TOOL_SCHEMAS = [
    {
        "name": "get_forecast",
        "description": "Get the live patient-arrivals forecast for the whole ED. Returns predicted patients per day with confidence ranges and accuracy. Use for questions about how busy upcoming days/weeks will be.",
        "input_schema": {
            "type": "object",
            "properties": {
                "horizon": {"type": "integer", "enum": [1, 7, 30], "description": "Days ahead (1, 7, or 30)."},
                "model": {"type": "string", "enum": ["statistical", "ml"], "description": "Engine; default ml (most accurate)."},
            },
        },
    },
    {
        "name": "get_supply_status",
        "description": "Get current inventory/supply status: service level, items at risk of stockout, costs, and ABC breakdown. Use for questions about stock, reorders, or stockout risk.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_staff_status",
        "description": "Get current nurse staffing status: coverage, payroll, overtime, unfilled shifts, BCEA compliance, and per-shift breakdown. Use for questions about rosters, coverage, or staffing cost.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_optimization",
        "description": "Get the forecast-driven optimization plan: the cost-minimal lawful nurse roster (lawful coverage, nurse shortfall, locum hours needed, locum saved) and the (s,S) reorder plan (items to order this week, order cost, stockout risk addressed). Use for questions about what to do next week, the optimal roster, or what to reorder.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "lookup_knowledge",
        "description": "Look up a plain-language explanation of a METHOD or CONCEPT used in the app — e.g. how the forecast works, SARIMAX vs machine learning, recursive vs direct multi-step, what accuracy/MAPE means, the (s,S) reorder policy, safety stock and service level, the four inventory costs, Monte-Carlo simulation, the staffing integer programme, or how the forecast drives the plans. Returns a short teaching summary and the source it is grounded in. Use this to EXPLAIN the analysis/methodology (not to fetch live numbers).",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The concept or question to explain, e.g. 'safety stock' or 'how does the ML forecast work'."},
            },
            "required": ["query"],
        },
    },
]


def _get(path: str) -> dict:
    with httpx.Client(timeout=120) as c:
        r = c.get(f"{_BASE}{path}")
        return r.json() if r.headers.get("content-type", "").startswith("application/json") else {"error": r.text[:300]}


def _post(path: str, body: dict) -> dict:
    with httpx.Client(timeout=120) as c:
        r = c.post(f"{_BASE}{path}", json=body)
        return r.json() if r.headers.get("content-type", "").startswith("application/json") else {"error": r.text[:300]}


def execute(name: str, inp: dict[str, Any]) -> dict[str, Any]:
    """Run a tool, return a compact result dict (or an error explaining the fix)."""
    try:
        if name == "get_forecast":
            d = _post("/api/forecast/run", {
                "model": inp.get("model", "ml"),
                "horizon": int(inp.get("horizon", 7)),
            })
            if d.get("error") or d.get("detail"):
                return {"error": "Forecast not available — G1 (Daily demand) may not be merged. Build it on the Prepare page."}
            days = d.get("forecast", [])
            return {
                # NOTE: accuracy/error figures are deliberately omitted — the public
                # assistant must not quote accuracy numbers (see chat prompt).
                "horizon_days": len(days),
                "forecast_start": d.get("forecast_start"),
                "total": round(sum(x["predicted"] for x in days)),
                "busiest": max(days, key=lambda x: x["predicted"], default=None) and {
                    "date": max(days, key=lambda x: x["predicted"])["date"],
                    "predicted": round(max(days, key=lambda x: x["predicted"])["predicted"])},
                "days": [{"date": x["date"], "predicted": round(x["predicted"]),
                          "range": [round(x["lower"]), round(x["upper"])]} for x in days[:14]],
            }
        if name == "get_supply_status":
            d = _get("/api/supply/overview")
            if d.get("error") or d.get("detail"):
                return {"error": "Supply data not available — the simulation files may not be loaded."}
            return {
                "kpis": d.get("kpis"),
                "items_at_risk": d.get("items_at_risk"),
                "at_risk": [{"item": i["item_name"], "class": i["abc_class"],
                             "service_pct": i["service_level"], "stockout_events": i["stockout_events"]}
                            for i in d.get("items", []) if i.get("status") == "stockout"][:8],
            }
        if name == "get_staff_status":
            d = _get("/api/staff/overview")
            if d.get("error") or d.get("detail"):
                return {"error": "Staffing data not available — the simulation files may not be loaded."}
            return {"kpis": d.get("kpis"), "shifts": d.get("shifts")}
        if name == "lookup_knowledge":
            from ai import knowledge
            cards = knowledge.search(inp.get("query", ""), k=2)
            if not cards:
                return {"note": "No specific card matched; explain from general knowledge but keep it simple and grounded.",
                        "available_topics": knowledge.topics()}
            return {"cards": cards}
        if name == "get_optimization":
            d = _get("/api/optimization/last")
            if not d or not d.get("staff"):
                d = _post("/api/optimization/run", {"model": "ml"})
            if d.get("error") or d.get("detail") or not d.get("staff"):
                return {"error": "Optimization plan not available — run it on the Optimization page."}
            staff = d.get("staff") or {}; supply = d.get("supply") or {}
            sk = staff.get("kpis") or {}; sc = staff.get("cost") or {}
            uk = supply.get("kpis") or {}; uc = supply.get("cost") or {}
            return {
                "week_starting": (d.get("forecast") or {}).get("week_starting"),
                "forecast_source": (d.get("forecast") or {}).get("source"),
                "staff_cost_before_after_saving_zar": [sc.get("before_zar"), sc.get("after_zar"), sc.get("saving_zar")],
                "staff": {k: sk.get(k) for k in (
                    "lawful_coverage_pct", "staffing_shortfall", "nurses_needed_lawful",
                    "nurses_available", "locum_hours", "unfilled_slots")},
                "staff_by_shift": [{"shift": s["shift"], "required": s["required"],
                                    "assigned": s["assigned"], "unfilled": s["unfilled"]}
                                   for s in (staff.get("shifts") or [])],
                "supply_cost_before_after_saving_zar": [uc.get("before_zar"), uc.get("after_zar"), uc.get("saving_zar")],
                "supply": {k: uk.get(k) for k in (
                    "items_to_order", "items_total", "order_cost_zar",
                    "stockout_risk_addressed_zar", "items_at_risk_now")},
                "orders_now": [{"item": o["item_name"], "qty": o["order_qty"],
                                "abc": o["abc_class"], "cost_zar": o["order_cost_zar"]}
                               for o in (supply.get("orders") or []) if o["status"] == "order_now"][:8],
            }
    except Exception as e:
        return {"error": f"tool failed: {type(e).__name__}: {e}"}
    return {"error": f"unknown tool {name}"}
