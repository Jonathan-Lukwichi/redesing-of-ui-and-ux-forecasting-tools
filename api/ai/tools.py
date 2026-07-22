"""Read-only tools the Ask-chat can call. Each wraps an existing app endpoint
and trims the result to keep token cost low. The chat can ONLY read — there are
no state-changing tools here by design."""
from __future__ import annotations
import os
from typing import Any

import httpx

_BASE = (os.getenv("SELF_BASE_URL")
         or f"http://127.0.0.1:{os.getenv('PORT', '8000')}").rstrip("/")


# Anthropic tool schemas (read-only).
TOOL_SCHEMAS = [
    {
        "name": "get_forecast",
        "description": "Get the patient-arrivals forecast. Returns the LAST forecast the user ran in the app — the exact same numbers, model and horizon currently shown on the Forecast page — or runs a fresh one only if the user hasn't run any yet. Always tell the user which model produced it (the 'model' field) and, for specialty runs, which specialty. Use for questions about predicted arrivals on any day in the forecast window.",
        "input_schema": {
            "type": "object",
            "properties": {
                "horizon": {"type": "integer", "enum": [1, 7, 30], "description": "Only used for the fresh-run fallback. Days ahead (1, 7, or 30)."},
                "model": {"type": "string", "enum": ["statistical", "ml"], "description": "Only used for the fresh-run fallback; default ml."},
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
        "description": "Get the CURRENT nurse staffing state: coverage, nurse shortfall, and the per-shift breakdown. Use ONLY for questions about the situation as it stands today. NOT for 'best roster', 'how many nurses do we need', or planning questions — use get_optimization for those (it holds the demand-matched roster).",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_optimization",
        "description": "Get the forecast-driven optimization plan: the cost-minimal lawful nurse roster (lawful coverage, nurse shortfall, locum hours needed, locum saved) and the (s,S) reorder plan (items to order this week, order cost, stockout risk addressed). Use for questions about what to do next week, the optimal roster, or what to reorder.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "lookup_knowledge",
        "description": "Look up a plain-language explanation of a METHOD or CONCEPT — the app's methods (forecast engines, multi-step, backtesting, (s,S), safety stock, inventory costs, Monte-Carlo, the staffing programme) PLUS the statistics and supply-chain foundations for interpreting scenarios: common vs special cause variation (is a spike real?), planning with spread not averages, count distributions and overdispersion, confidence intervals and real-vs-noise differences, correlation vs causation, autocorrelation, Pareto/ABC prioritisation, fair policy comparisons, PDSA adoption cycles, the bullwhip effect, risk pooling, lead time rules, push vs pull, and the value of information. Returns a short teaching summary and its source. Use it whenever you interpret WHY something looks the way it does, alongside (not instead of) the live-number tools.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The concept or question to explain, e.g. 'safety stock' or 'how does the ML forecast work'."},
            },
            "required": ["query"],
        },
    },
]


def _window_note(days: list[dict]) -> str | None:
    """Flag when the whole forecast window lies in the past, so the assistant
    tells the user it is a historical run/backtest — not the week ahead."""
    try:
        from datetime import date
        last = max(str(d.get("date") or "") for d in days) if days else ""
        if last and last < date.today().isoformat():
            return ("NOTE: this forecast window ends in the past — it is a historical "
                    "run/backtest the user made, not the week ahead. Say so in one "
                    "short clause when presenting it.")
    except Exception:
        pass
    return None


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
            # The engines are not perfectly deterministic, so a fresh run would
            # not match the page. Read the run the user is looking at; only fall
            # back to a fresh run when nothing has been run in the app yet.
            last = _get("/api/forecast/last")
            d, source = None, None
            if last.get("available") and (last.get("result") or {}).get("forecast"):
                d = last["result"]
                source = "the forecast run currently shown on the Forecast page"
            if d is None:
                d = _post("/api/forecast/run", {
                    "model": inp.get("model", "ml"),
                    "horizon": int(inp.get("horizon", 7)),
                })
                if d.get("error") or d.get("detail"):
                    return {"error": "Forecast not available — G1 (Daily demand) may not be merged. Build it on the Prepare page."}
                source = "a fresh run (the user has not run a forecast in the app yet)"
            days = d.get("forecast", [])
            model_label = {"ml": "best ML model", "statistical": "best statistical model"}.get(
                d.get("requested_model"), d.get("requested_model") or "unknown")
            note = _window_note(days)
            return {
                # NOTE: accuracy/error figures are deliberately omitted — the public
                # assistant must not quote accuracy numbers (see chat prompt).
                **({"window_note": note} if note else {}),
                "source": source,
                "model": model_label,
                "specialty": d.get("requested_specialty"),
                "is_backtest": d.get("is_backtest", False),
                "horizon_days": len(days),
                "forecast_start": d.get("forecast_start"),
                "total": round(sum(x["predicted"] for x in days)),
                "busiest": max(days, key=lambda x: x["predicted"], default=None) and {
                    "date": max(days, key=lambda x: x["predicted"])["date"],
                    "predicted": round(max(days, key=lambda x: x["predicted"])["predicted"])},
                "days": [{"date": x["date"], "predicted": round(x["predicted"]),
                          "range": [round(x["lower"]), round(x["upper"])],
                          **({"actual": round(x["actual"])} if x.get("actual") is not None else {})}
                         for x in days],
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
            k = d.get("kpis") or {}
            # Decision numbers ONLY. Payroll, weekly-hours averages and BCEA
            # breach counts are deliberately omitted from the chat payload —
            # they belong to the Staffing page explainer, not conversational
            # answers (the model cannot recite what it never sees).
            return {
                "note": ("Current state only. For the demand-matched BEST roster use "
                         "get_optimization; if that plan is unavailable, tell the user to "
                         "run the staff optimization on the Optimization page."),
                "kpis": {key: k.get(key) for key in (
                    "lawful_coverage_pct", "coverage_pct", "staffing_shortfall",
                    "nurses_needed_legal", "n_active_staff", "n_posts")},
                "shifts": d.get("shifts"),
            }
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
                return {"error": ("No optimization plan is available yet. Tell the user: press "
                                  "'Run staff optimization' and 'Run supply optimization' on the "
                                  "Optimization page to get the best demand-matched roster and "
                                  "reorder recommendations.")}
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
