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
    ci = d.get("ci", {}) or {}
    lines = ["<context>",
             "Nurse staffing (Casualty unit; NURSES ONLY — no doctors in this dataset). One representative simulation run.",
             f"Lawful-hours coverage: {k.get('lawful_coverage_pct')}%  (coverage the {k.get('n_active_staff')} nurses could deliver working only the legal 45h/week)",
             f"Actual coverage today: {k.get('coverage_pct')}%  — but ONLY reached by working {k.get('mean_weekly_hours')}h/week ({k.get('overwork_pct')}% of the legal 45h limit)",
             f"Staffing shortfall: {k.get('staffing_shortfall')} nurses (demand needs ~{k.get('nurses_needed_legal')} at lawful hours; only {k.get('n_active_staff')} of {k.get('n_posts')} posts filled)",
             f"BCEA 45h breaches per nurse/year: {k.get('bcea_per_nurse')} (logged, not enforced — the SA norm)",
             f"Annual payroll: R{round(k.get('annual_payroll_zar') or 0):,}",
             "Across 30 runs (95% CI): " + _kpi(ci, "coverage_pct", "%") + "; " + _kpi(ci, "bcea_violations_per_staff")]
    for s in (d.get("shifts") or []):
        lines.append(f"Shift {s['shift']}: avg {s['avg_filled']}/{s['avg_required']} nurses, "
                     f"{s['unfilled']} unfilled, {s['locum_hours']} locum hrs")
    lines.append("</context>")
    return "\n".join(lines)


def build_optimization_context(d: dict[str, Any]) -> str:
    fc = d.get("forecast", {}) or {}
    staff = d.get("staff") or {}
    supply = d.get("supply") or {}
    st = staff.get("kpis", {}) or {}
    sc = staff.get("cost", {}) or {}
    uk = supply.get("kpis", {}) or {}
    uc = supply.get("cost", {}) or {}
    daily = fc.get("daily_total") or []
    avg = round(sum(daily) / len(daily)) if daily else None

    def _r(v):
        return f"R{round(v or 0):,}"

    lines = ["<context>",
             "Forecast-driven optimization plan for NEXT WEEK (NURSES ONLY — no doctors). "
             "The roster caps every nurse at the lawful 45h/week; demand it cannot meet "
             "lawfully is covered by costly agency locum.",
             f"Forecast: week of {fc.get('week_starting')}, about {avg} arrivals/day, "
             f"source {fc.get('source')}, accuracy ~{round(fc.get('accuracy_pct') or 0)}%"]
    if sc:
        lines += [
            f"STAFF cost — before optimization (staff for the busiest day, every day): {_r(sc.get('before_zar'))}/week.",
            f"STAFF cost — after optimization (matched to the forecast): {_r(sc.get('after_zar'))}/week.",
            f"STAFF saving: {_r(sc.get('saving_zar'))}/week ({sc.get('saving_pct')}%), about {_r(sc.get('saving_annual_zar'))}/year if sustained.",
            f"Lawful own-nurse coverage: {st.get('lawful_coverage_pct')}% — the rest needs {st.get('locum_hours')} agency locum hours; "
            f"meeting demand with own staff would need ~{st.get('nurses_needed_lawful')} nurses (have {st.get('nurses_available')}, short {st.get('staffing_shortfall')}).",
        ]
    if uc:
        lines += [
            f"SUPPLY cost (two-stage stochastic (s,S), Monte-Carlo) — annual expected total cost.",
            f"  before optimization (naive policy, no forecast safety stock): {_r(uc.get('before_zar'))}/year.",
            f"  after optimization (optimised s*,S* — order-up-to that minimises expected cost): {_r(uc.get('after_zar'))}/year.",
            f"SUPPLY saving: {_r(uc.get('saving_zar'))}/year ({uc.get('saving_pct')}%), mostly from cutting stockout penalties; "
            f"order {uk.get('items_to_order')} of {uk.get('items_total')} items now for {_r(uk.get('order_cost_zar'))}.",
        ]
    for s in (staff.get("shifts") or []):
        lines.append(f"Shift {s['shift']}: {s['assigned']}/{s['required']} nurses scheduled, {s['unfilled']} need locum")
    for o in [o for o in (supply.get("orders") or []) if o.get("status") == "order_now"][:6]:
        lines.append(f"Reorder: {o['item_name']} (class {o['abc_class']}) — order {o['order_qty']}")
    lines.append("</context>")
    return "\n".join(lines)


def build_supply_context(d: dict[str, Any]) -> str:
    k = d.get("kpis", {}) or {}
    ci = d.get("ci", {}) or {}
    lines = ["<context>",
             "Inventory — one representative simulation run (numbers below), with 30-seed means as context.",
             f"Items at risk: {k.get('items_at_risk')} of {k.get('n_items')}",
             f"Total cost (this run): R{round(k.get('total_cost_zar') or 0):,}",
             f"Stockout penalty (this run): R{round(k.get('stockout_cost_zar') or 0):,}",
             f"Inventory value: R{round(k.get('inventory_value_zar') or 0):,}",
             "Across 30 runs (95% CI): " + _kpi(ci, "total_annual_cost_zar") + "; " + _kpi(ci, "stockout_incidence_pct", "%") + "; " + _kpi(ci, "non_performance_rate", "%")]
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
