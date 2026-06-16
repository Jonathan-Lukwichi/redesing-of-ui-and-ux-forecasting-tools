"""Builds the <context> envelope shown to the model. Numbers only — this is the
single source of truth the model is allowed to quote (see prompts.GROUNDING)."""
from __future__ import annotations
from typing import Any


def _fmt_day(d: dict, unit: str) -> str:
    base = f"{d['date']}: predicted {round(d['predicted'])} (range {round(d['lower'])}-{round(d['upper'])}, {d.get('label','')})"
    if d.get("actual") is not None:
        base += f" — actual was {round(d['actual'])}"
    return base


def build_forecast_context(data: dict[str, Any]) -> str:
    days = data.get("forecast", []) or []
    if not days:
        return "<context>No forecast data available.</context>"

    unit = "week" if data.get("resolution") == "weekly" else "day"
    specialty = data.get("requested_specialty")
    who = f"{specialty} arrivals" if specialty else "total ED arrivals"
    engine = "Machine-learning" if data.get("requested_model") == "ml" else "Statistical"

    preds = [d["predicted"] for d in days]
    total = round(sum(preds))
    avg = round(sum(preds) / len(preds))
    busiest = max(days, key=lambda d: d["predicted"])
    quietest = min(days, key=lambda d: d["predicted"])

    lines = [
        "<context>",
        f"Forecast target: {who}",
        f"Engine used: {engine} (live)",
        f"Periods: {len(days)} {unit}s, starting {data.get('forecast_start')}",
        f"Latest real data was: {data.get('last_actual_date')}",
        f"Accuracy: about {round(data.get('confidence_pct') or 0)}% ({data.get('confidence_tier','')})",
        f"Typical miss: about {round(data.get('mae') or 0)} patients per {unit}",
        f"Total over the window: {total} patients",
        f"Average per {unit}: {avg} patients",
        f"Busiest {unit}: {busiest['date']} ({round(busiest['predicted'])})",
        f"Quietest {unit}: {quietest['date']} ({round(quietest['predicted'])})",
    ]
    if data.get("low_volume"):
        lines.append(f"NOTE: low-volume target (~{data.get('avg_actual')} per {unit}); treat point numbers as indicative, plan with the range.")

    bt = data.get("backtest")
    if data.get("is_backtest") and bt:
        lines.append(
            f"This is a BACKTEST against real numbers: {bt['n_compared']} {unit}(s) compared, "
            f"day-level accuracy {round(bt['accuracy_pct'])}%, predicted total {round(bt['total_predicted'])} "
            f"vs actual total {round(bt['total_actual'])} ({bt['total_pct_error']}% off)."
        )

    lines.append("Per-period numbers:")
    for d in days[:31]:
        lines.append("  " + _fmt_day(d, unit))
    if len(days) > 31:
        lines.append(f"  ... and {len(days) - 31} more {unit}s")
    lines.append("</context>")
    return "\n".join(lines)


def _kpi(k: dict, name: str, unit: str = "") -> str:
    v = (k or {}).get(name)
    if not isinstance(v, dict):
        return f"{name}: n/a"
    return f"{name}: {v['mean']}{unit} (95% CI {v['lo']}–{v['hi']})"


def build_staff_context(d: dict[str, Any]) -> str:
    k = d.get("kpis", {}) or {}
    lines = ["<context>",
             "Nurse staffing — 30-seed simulation, means with 95% confidence intervals.",
             "NOTE: BCEA limits are LOGGED not enforced (12-hour shifts are the SA public-hospital norm), so high violation counts and ~58h weeks are expected/realistic.",
             _kpi(k, "coverage_pct", "%"),
             _kpi(k, "annual_payroll_zar"),
             _kpi(k, "mean_weekly_hours"),
             _kpi(k, "bcea_violations_per_staff"),
             _kpi(k, "locum_share_pct", "%"),
             _kpi(k, "sick_events"),
             f"Active nurses: {d.get('n_active_staff')} (of 30 posts; rest vacant)"]
    for s in (d.get("shifts") or []):
        lines.append(f"Shift {s['shift']}: avg {s['avg_filled']}/{s['avg_required']} nurses, "
                     f"{s['unfilled']} unfilled, {s['locum_hours']} locum hrs")
    lines.append("</context>")
    return "\n".join(lines)


def build_supply_context(d: dict[str, Any]) -> str:
    k = d.get("kpis", {}) or {}
    lines = ["<context>",
             "Inventory — 30-seed simulation, means with 95% confidence intervals.",
             _kpi(k, "stockout_incidence_pct", "%"),
             _kpi(k, "total_annual_cost_zar"),
             _kpi(k, "annual_stockout_penalty_zar"),
             _kpi(k, "annual_holding_zar"),
             _kpi(k, "annual_ordering_zar"),
             _kpi(k, "annual_expiry_zar"),
             _kpi(k, "non_performance_rate", "%"),
             _kpi(k, "lead_time_median_unflagged_days"),
             _kpi(k, "n_stockout_events"),
             f"Items at risk: {d.get('items_at_risk')} of {d.get('n_items')}",
             f"Inventory value (seed 42): R{round(d.get('inventory_value_zar') or 0):,}"]
    for a in (d.get("by_abc") or []):
        lines.append(f"Class {a['abc_class']}: {a['items']} items, cost R{round(a['cost_zar']):,}")
    risky = [i for i in (d.get("items") or []) if i.get("status") == "stockout"][:6]
    for i in risky:
        lines.append(f"At risk: {i['item_name']} (class {i['abc_class']}), service {i['service_level']}%, {i['stockout_events']} stockout events")
    lines.append("</context>")
    return "\n".join(lines)


def build_explore_context(d: dict[str, Any]) -> str:
    # The Explore page passes a list/dict of findings; summarise generically.
    import json
    blob = json.dumps(d, default=str)[:3000]
    return f"<context>\nExploratory findings (JSON, numbers are authoritative):\n{blob}\n</context>"
