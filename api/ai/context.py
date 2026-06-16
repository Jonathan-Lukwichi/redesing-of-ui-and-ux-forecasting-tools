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


def build_staff_context(d: dict[str, Any]) -> str:
    k = d.get("kpis", {}) or {}
    lines = ["<context>", "Nurse staffing summary (13-month simulation, seed 42):",
             f"Coverage: {k.get('coverage_pct')}% (staffed vs required)",
             f"Total payroll: R{round(k.get('total_payroll_zar') or 0):,}",
             f"Overtime hours: {k.get('overtime_hours')}",
             f"Unfilled shifts: {k.get('unfilled_shifts')} over {k.get('days_simulated')} days",
             f"BCEA 45h/week violations: {k.get('bcea_violations')}",
             f"Nurses: {k.get('n_staff')}"]
    for s in (d.get("shifts") or []):
        lines.append(f"Shift {s['shift']}: avg {s['avg_staffed']}/{s['avg_required']} nurses, "
                     f"{s['unfilled']} unfilled, {s['locum_hours']} locum hrs, cost R{round(s['cost_zar']):,}")
    lines.append("</context>")
    return "\n".join(lines)


def build_supply_context(d: dict[str, Any]) -> str:
    k = d.get("kpis", {}) or {}
    lines = ["<context>", "Inventory summary (13-month simulation, seed 42):",
             f"Service level: {k.get('service_level_pct')}%",
             f"Items at risk: {k.get('items_at_risk')} of {k.get('n_items')}",
             f"Stockout-days: {k.get('stockout_events')}",
             f"Total cost: R{round(k.get('total_cost_zar') or 0):,}",
             f"Inventory value: R{round(k.get('inventory_value_zar') or 0):,}"]
    for a in (d.get("by_abc") or []):
        lines.append(f"Class {a['abc_class']}: {a['items']} items, cost R{round(a['cost_zar']):,}")
    risky = [i for i in (d.get("items") or []) if i.get("status") == "stockout"][:6]
    for i in risky:
        lines.append(f"At risk: {i['item_name']} (class {i['abc_class']}), service {i['service_level']}%, {i['stockout_days']} stockout-days")
    lines.append("</context>")
    return "\n".join(lines)


def build_explore_context(d: dict[str, Any]) -> str:
    # The Explore page passes a list/dict of findings; summarise generically.
    import json
    blob = json.dumps(d, default=str)[:3000]
    return f"<context>\nExploratory findings (JSON, numbers are authoritative):\n{blob}\n</context>"
