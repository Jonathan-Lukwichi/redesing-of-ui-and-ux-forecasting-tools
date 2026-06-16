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
                "model": {"type": "string", "enum": ["statistical", "ml"], "description": "Engine; default statistical."},
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
                "model": inp.get("model", "statistical"),
                "horizon": int(inp.get("horizon", 7)),
            })
            if d.get("error") or d.get("detail"):
                return {"error": "Forecast not available — G1 (Daily demand) may not be merged. Build it on the Prepare page."}
            days = d.get("forecast", [])
            return {
                "horizon_days": len(days),
                "forecast_start": d.get("forecast_start"),
                "accuracy_pct": d.get("confidence_pct"),
                "typical_miss_patients": d.get("mae"),
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
                "at_risk": [{"item": i["item_name"], "class": i["abc_class"],
                             "service_pct": i["service_level"], "stockout_days": i["stockout_days"]}
                            for i in d.get("items", []) if i.get("status") == "stockout"][:8],
            }
        if name == "get_staff_status":
            d = _get("/api/staff/overview")
            if d.get("error") or d.get("detail"):
                return {"error": "Staffing data not available — the simulation files may not be loaded."}
            return {"kpis": d.get("kpis"), "shifts": d.get("shifts")}
    except Exception as e:
        return {"error": f"tool failed: {type(e).__name__}: {e}"}
    return {"error": f"unknown tool {name}"}
