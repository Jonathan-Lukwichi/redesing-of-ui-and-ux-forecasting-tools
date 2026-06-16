"""Forecast-driven operations optimization (the Optimization page).

This is the PRESCRIPTIVE counterpart to the descriptive Staff/Supply planner
pages. It takes next week's demand forecast and computes:

  1. The cost-minimal LAWFUL nurse roster — a binary integer programme solved
     with PuLP/CBC (Chapter 3 §3.5.7). Demand per shift d_s is disaggregated
     from the daily forecast (§3.5.8); the 45h BCEA cap is enforced as a HARD
     constraint, so any demand that cannot be met lawfully shows up as an
     `unfilled` (locum) shortfall rather than as illegal overtime. That gap is
     the honest, forward-looking version of the Staff page's lawful-coverage
     story.

  2. A forecast-scaled (s,S) reorder plan for inventory — projected consumption
     is scaled by the forecast's demand factor, then each item gets a reorder
     point s = d·L + Zσ√L and an order-up-to level S; what to order this week is
     S − on_hand for any item at/under its reorder point.

Both halves are compared against a naive baseline (flat peak-padded staffing /
do-nothing inventory) so the page can show how much the forecast-driven plan
improves operations. The most recent solution is cached in-process so the
Action Center can rank actions from it without re-solving.
"""
from __future__ import annotations
import math
import time
from typing import Any, Optional

import numpy as np
from pulp import (
    LpProblem, LpVariable, LpMinimize, lpSum, LpInteger, LpBinary,
    LpStatus, PULP_CBC_CMD, value as lp_value,
)

# ── Constants (Chapter 3 §3.5.8 / Chapter 5 §5.4) ────────────────────────────
SHIFTS = ["Day", "Evening", "Night"]
SHIFT_SHARE = {"Day": 0.41, "Evening": 0.41, "Night": 0.18}   # Ch5 §5.4
NURSE_RATIO = {"Day": 4, "Evening": 5, "Night": 6}            # NDoH norms
SHIFT_HOURS = 12.0
LEGAL_WEEKLY_HOURS = 45.0                                     # BCEA s9
WORK_YEAR_HOURS = 2080.0                                      # 52w × 40h
DEFAULT_SIGMA_EPS = 9.35                                      # XGBoost residual SD
DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

# Service-level z-scores for the (s,S) safety stock.
_Z = {0.90: 1.282, 0.91: 1.341, 0.92: 1.405, 0.93: 1.476, 0.94: 1.555,
      0.95: 1.645, 0.96: 1.751, 0.97: 1.881, 0.98: 2.054, 0.99: 2.326}


def _z_for(sl: float) -> float:
    return _Z[min(_Z, key=lambda k: abs(k - sl))]


# Last solution, kept for /last and the Action Center.
_LAST: dict[str, Any] | None = None


def get_last() -> dict[str, Any] | None:
    return _LAST


# ── Staff: per-shift demand from the forecast (§3.5.8) ───────────────────────
def _shift_demand(daily_total: list[float], kappa: float, sigma_eps: float) -> dict:
    """d_s for each (day_index, shift), per Chapter 3 §3.5.8.

    The daily forecast uncertainty κ·σ is split across the shifts by their
    arrival share (so the whole-day buffer sums to κ·σ rather than being
    counted three times), added in patient space, then converted to nurses by
    the NDoH shift ratio."""
    daily_buffer = kappa * sigma_eps          # κ·σ patients of headroom for the day
    d_s: dict[tuple[int, str], int] = {}
    for di, total in enumerate(daily_total):
        for sh in SHIFTS:
            arrivals = float(total) * SHIFT_SHARE[sh]
            buffer = daily_buffer * SHIFT_SHARE[sh]
            d_s[(di, sh)] = max(1, math.ceil((arrivals + buffer) / NURSE_RATIO[sh]))
    return d_s


def solve_staff(
    daily_total: list[float],
    dates: list[str],
    staff: list[dict],
    kappa: float = 1.65,
    sigma_eps: float = DEFAULT_SIGMA_EPS,
    weekly_budget_zar: Optional[float] = None,
) -> dict[str, Any]:
    """Build and solve the Chapter 3 §3.5.7 binary IP with PuLP/CBC.

    Decision x[i, d, s] ∈ {0,1}: nurse i works shift s on day d. Demand coverage
    is softened with an integer `unfilled[d,s]` slack priced at a locum rate, so
    the problem is always feasible — the slack quantifies the lawful shortfall.
    """
    t0 = time.perf_counter()
    n_days = len(daily_total)
    day_idx = list(range(n_days))

    hourly = {s["staff_id"]: (float(s["annual_salary_zar"]) / WORK_YEAR_HOURS) for s in staff}
    shift_cost = {sid: hr * SHIFT_HOURS for sid, hr in hourly.items()}
    max_hourly = max(hourly.values()) if hourly else 200.0
    locum_shift_cost = max_hourly * 1.8 * SHIFT_HOURS   # agency premium ~1.8×
    pns = [s["staff_id"] for s in staff if s["category"] == "Professional Nurse"]

    d_s = _shift_demand(daily_total, kappa, sigma_eps)

    prob = LpProblem("WorkforceScheduling", LpMinimize)
    x = {(s["staff_id"], d, sh): LpVariable(f"x_{s['staff_id']}_{d}_{sh}", cat=LpBinary)
         for s in staff for d in day_idx for sh in SHIFTS}
    unfilled = {(d, sh): LpVariable(f"u_{d}_{sh}", lowBound=0, cat=LpInteger)
                for d in day_idx for sh in SHIFTS}
    # Skills-mix slack: shortfall of Professional Nurses on a shift (softened so
    # the PN-on-every-shift rule can never force infeasibility).
    pn_short = {(d, sh): LpVariable(f"pn_{d}_{sh}", lowBound=0, cat=LpInteger)
                for d in day_idx for sh in SHIFTS} if pns else {}

    # Objective (set ONCE): real payroll + locum cost for the shortfall + a
    # small penalty for unmet skills-mix. The locum penalty is weighted up
    # slightly by shift demand so that, among equal-cost optima, the solver
    # prefers to cover the BUSIEST shifts first (otherwise CBC may starve a
    # high-demand day arbitrarily). The reported locum cost still uses the flat
    # rate — this weight is only a deterministic tie-breaker on allocation.
    prob += (lpSum(shift_cost[s["staff_id"]] * x[(s["staff_id"], d, sh)]
                   for s in staff for d in day_idx for sh in SHIFTS)
             + lpSum(locum_shift_cost * (1 + 0.08 * d_s[(d, sh)]) * unfilled[(d, sh)]
                     for d in day_idx for sh in SHIFTS)
             + lpSum(0.5 * locum_shift_cost * v for v in pn_short.values()))

    # Demand coverage (soft via the locum slack).
    for d in day_idx:
        for sh in SHIFTS:
            prob += (lpSum(x[(s["staff_id"], d, sh)] for s in staff) + unfilled[(d, sh)]
                     >= d_s[(d, sh)])

    # 45-hour weekly cap — HARD (the lawful constraint; BCEA s9).
    for s in staff:
        prob += lpSum(x[(s["staff_id"], d, sh)] * SHIFT_HOURS
                      for d in day_idx for sh in SHIFTS) <= LEGAL_WEEKLY_HOURS

    # At most one shift per nurse per day.
    for s in staff:
        for d in day_idx:
            prob += lpSum(x[(s["staff_id"], d, sh)] for sh in SHIFTS) <= 1

    # 11-hour rest (BCEA s14): no Day shift the morning after a Night shift.
    for s in staff:
        for d in day_idx[:-1]:
            prob += x[(s["staff_id"], d, "Night")] + x[(s["staff_id"], d + 1, "Day")] <= 1

    # Skills mix: at least one Professional Nurse on every shift (softened).
    if pns:
        for d in day_idx:
            for sh in SHIFTS:
                prob += (lpSum(x[(p, d, sh)] for p in pns) + pn_short[(d, sh)] >= 1)

    solver = PULP_CBC_CMD(msg=0, timeLimit=30)
    prob.solve(solver)
    status = LpStatus[prob.status]

    # ── Decode ───────────────────────────────────────────────────────────────
    assigned = {(s["staff_id"], d, sh): int(round(lp_value(x[(s["staff_id"], d, sh)]) or 0))
                for s in staff for d in day_idx for sh in SHIFTS}

    per_day = []
    total_required = total_assigned = total_unfilled = 0
    for d in day_idx:
        req = sum(d_s[(d, sh)] for sh in SHIFTS)
        asg = sum(assigned[(s["staff_id"], d, sh)] for s in staff for sh in SHIFTS)
        unf = sum(int(round(lp_value(unfilled[(d, sh)]) or 0)) for sh in SHIFTS)
        total_required += req; total_assigned += asg; total_unfilled += unf
        per_day.append({
            "day_label": DAY_ABBR[d % 7], "date": dates[d],
            "demand": req, "scheduled": asg, "unfilled": unf,
            "locum_hours": round(unf * SHIFT_HOURS, 0),
        })

    shift_rows = []
    for sh in SHIFTS:
        req = sum(d_s[(d, sh)] for d in day_idx)
        asg = sum(assigned[(s["staff_id"], d, sh)] for s in staff for d in day_idx)
        unf = sum(int(round(lp_value(unfilled[(d, sh)]) or 0)) for d in day_idx)
        shift_rows.append({
            "shift": sh, "required": req, "assigned": asg, "unfilled": unf,
            "locum_hours": round(unf * SHIFT_HOURS, 0),
        })

    roster = []
    used_staff = 0
    payroll = 0.0
    for s in staff:
        sid = s["staff_id"]
        shifts_assigned = [f"{DAY_ABBR[d % 7]}-{sh}"
                           for d in day_idx for sh in SHIFTS if assigned[(sid, d, sh)]]
        n_shifts = len(shifts_assigned)
        wk_hours = n_shifts * SHIFT_HOURS
        wk_cost = n_shifts * shift_cost[sid]
        payroll += wk_cost
        if n_shifts:
            used_staff += 1
        roster.append({
            "staff_id": sid, "category": s["category"], "skill_level": s.get("skill_level", 0),
            "shifts_assigned": shifts_assigned, "n_shifts": n_shifts,
            "weekly_hours": round(wk_hours, 0), "weekly_cost_zar": round(wk_cost, 0),
            "bcea_45h_ok": wk_hours <= LEGAL_WEEKLY_HOURS,   # always True (hard cap)
        })
    roster.sort(key=lambda r: -r["n_shifts"])

    locum_hours = total_unfilled * SHIFT_HOURS
    locum_cost = total_unfilled * locum_shift_cost
    total_cost = payroll + locum_cost
    coverage = (total_assigned / total_required * 100) if total_required else 100.0
    lawful_coverage = ((total_required - total_unfilled) / total_required * 100) if total_required else 100.0

    # ── Naive baseline: the SAME nurse-hours, but allocated flat (spread evenly
    # across every shift, ignoring which shifts the forecast says are busy). This
    # is the "fixed roster" a manager runs without a forecast. Because it wastes
    # capacity on quiet shifts, it leaves more demand uncovered → more costly
    # locum. The optimizer's saving is the locum it avoids by matching the peaks.
    n_slots = n_days * len(SHIFTS)
    flat_per_slot = total_assigned / n_slots if n_slots else 0.0
    baseline_unfilled = sum(max(0.0, d_s[(d, sh)] - flat_per_slot)
                            for d in day_idx for sh in SHIFTS)
    baseline_locum_cost = baseline_unfilled * locum_shift_cost
    baseline_cost = payroll + baseline_locum_cost
    baseline_coverage = (total_assigned / total_required * 100) if total_required else 100.0  # same hours, but...
    # ...spread flat, the *effective* covered demand is lower (capacity lands on
    # quiet shifts): effective coverage = filled demand under the flat split.
    baseline_filled = sum(min(d_s[(d, sh)], flat_per_slot) for d in day_idx for sh in SHIFTS)
    baseline_coverage = (baseline_filled / total_required * 100) if total_required else 100.0
    savings = max(0.0, baseline_cost - total_cost)

    nurses_needed = math.ceil(total_required * SHIFT_HOURS / LEGAL_WEEKLY_HOURS)

    return {
        "status": status,
        "solve_time_seconds": round(time.perf_counter() - t0, 2),
        "objective_value_zar": round(total_cost, 0),
        "kpis": {
            "coverage_pct": round(coverage, 1),
            "lawful_coverage_pct": round(lawful_coverage, 1),
            "baseline_coverage_pct": round(baseline_coverage, 1),
            "total_required_slots": total_required,
            "total_filled_slots": total_assigned,
            "unfilled_slots": total_unfilled,
            "locum_hours": round(locum_hours, 0),
            "locum_cost_zar": round(locum_cost, 0),
            "nurses_used": used_staff,
            "nurses_available": len(staff),
            "nurses_needed_lawful": nurses_needed,
            "staffing_shortfall": max(0, nurses_needed - len(staff)),
            "weekly_payroll_zar": round(payroll, 0),
            "weekly_cost_zar": round(total_cost, 0),
            "baseline_cost_zar": round(baseline_cost, 0),
            "weekly_savings_zar": round(savings, 0),
            "savings_pct": round(savings / baseline_cost * 100, 1) if baseline_cost else 0.0,
        },
        "demand_vs_coverage": per_day,
        "shifts": shift_rows,
        "roster": roster,
    }


# ── Supply: forecast-scaled (s,S) reorder ────────────────────────────────────
def reorder_supply(
    items: list[dict],
    forecast_factor: float,
    service_level: float = 0.95,
    review_days: int = 7,
) -> dict[str, Any]:
    """Forecast-driven (s,S) policy. `forecast_factor` scales each item's mean
    daily consumption by next week's demand vs its historical baseline."""
    z = _z_for(service_level)
    factor = float(np.clip(forecast_factor, 0.5, 2.0))
    orders = []
    order_cost = 0.0
    risk_addressed = 0.0
    n_to_order = 0
    n_at_risk = 0

    for it in items:
        d_base = float(it.get("mean_daily_consumption") or 0)
        sd = float(it.get("sd_daily_consumption") or 0)
        L = float(it.get("lead_time_mean_days") or 5)
        # Current stock = the latest recorded snapshot when available, else the
        # yearly average (the average rarely sits below the reorder point).
        _cur = it.get("current_stock_units")
        on_hand = float(_cur if _cur is not None else (it.get("avg_stock_on_hand") or 0))
        price = float(it.get("unit_price_zar") or 0)
        d_proj = d_base * factor

        safety = z * sd * math.sqrt(max(L, 0.0))
        rop = d_proj * L + safety                       # reorder point s
        order_up_to = d_proj * (L + review_days) + safety   # level S
        days_cover = round(on_hand / d_proj, 1) if d_proj > 0 else None

        order_qty = 0
        status = "ok"
        if on_hand <= rop:
            order_qty = int(math.ceil(max(0.0, order_up_to - on_hand)))
            status = "order_now"
            n_to_order += 1
            order_cost += order_qty * price
            risk_addressed += float(it.get("total_stockout_cost_zar") or 0)
        if on_hand < safety:
            n_at_risk += 1
        elif on_hand > order_up_to * 2.5 and d_proj > 0:
            status = "excess"

        orders.append({
            "item_id": it.get("item_id"), "item_name": it.get("item_name"),
            "category": it.get("category"), "abc_class": it.get("abc_class"),
            "unit": it.get("unit"), "on_hand": round(on_hand, 0),
            "proj_daily": round(d_proj, 1), "lead_time_days": round(L, 0),
            "safety_stock": round(safety, 0), "reorder_point": round(rop, 0),
            "order_up_to": round(order_up_to, 0), "order_qty": order_qty,
            "order_cost_zar": round(order_qty * price, 0),
            "days_cover": days_cover, "status": status,
        })

    rank = {"order_now": 0, "excess": 1, "ok": 2}
    abc = {"A": 0, "B": 1, "C": 2}
    orders.sort(key=lambda o: (rank.get(o["status"], 9), abc.get(o["abc_class"], 9), -o["order_cost_zar"]))

    return {
        "service_level": service_level,
        "forecast_factor": round(factor, 3),
        "kpis": {
            "items_total": len(items),
            "items_to_order": n_to_order,
            "items_at_risk_now": n_at_risk,
            "order_cost_zar": round(order_cost, 0),
            "stockout_risk_addressed_zar": round(risk_addressed, 0),
        },
        "orders": orders,
    }


# ── Orchestration ────────────────────────────────────────────────────────────
def optimize(
    forecast: dict,
    staff: list[dict],
    items: list[dict],
    kappa: float = 1.65,
    service_level: float = 0.95,
    weekly_budget_zar: Optional[float] = None,
) -> dict[str, Any]:
    """Run both optimizations from one forecast and assemble the page payload."""
    global _LAST
    daily_total = forecast["daily_total"]
    dates = forecast["dates"]
    sigma_eps = float(forecast.get("mae") or DEFAULT_SIGMA_EPS)

    staff_res = solve_staff(daily_total, dates, staff, kappa=kappa,
                            sigma_eps=sigma_eps, weekly_budget_zar=weekly_budget_zar)

    baseline_avg = float(forecast.get("baseline_avg") or np.mean(daily_total))
    fc_avg = float(np.mean(daily_total))
    factor = fc_avg / baseline_avg if baseline_avg else 1.0
    supply_res = reorder_supply(items, factor, service_level=service_level)

    impact = {
        "staff_savings_zar": staff_res["kpis"]["weekly_savings_zar"],
        "staff_savings_pct": staff_res["kpis"]["savings_pct"],
        "lawful_coverage_pct": staff_res["kpis"]["lawful_coverage_pct"],
        "staffing_shortfall": staff_res["kpis"]["staffing_shortfall"],
        "locum_hours": staff_res["kpis"]["locum_hours"],
        "items_to_order": supply_res["kpis"]["items_to_order"],
        "order_cost_zar": supply_res["kpis"]["order_cost_zar"],
        "stockout_risk_addressed_zar": supply_res["kpis"]["stockout_risk_addressed_zar"],
        "forecast_factor": supply_res["forecast_factor"],
    }

    payload = {
        "meta": {
            "solver": "CBC",
            "status": staff_res["status"],
            "solve_time_seconds": staff_res["solve_time_seconds"],
            "forecast_source": forecast.get("source"),
            "kappa": kappa,
            "service_level": service_level,
        },
        "forecast": forecast,
        "staff": staff_res,
        "supply": supply_res,
        "impact": impact,
    }
    _LAST = payload
    return payload
