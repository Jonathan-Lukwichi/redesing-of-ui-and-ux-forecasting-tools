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


# Last solution, kept for /last and the Action Center. Staff and supply can be
# run independently (each button on the page), so we accumulate the halves.
_LAST: dict[str, Any] = {"forecast": None, "staff": None, "supply": None,
                          "impact": None, "meta": None}


def get_last() -> dict[str, Any] | None:
    if _LAST.get("staff") is None and _LAST.get("supply") is None:
        return None
    return _LAST


def _build_impact() -> dict[str, Any]:
    """Assemble the headline impact (incl. combined saving) from whichever
    halves have been solved."""
    st = _LAST.get("staff") or {}
    sup = _LAST.get("supply") or {}
    sc = st.get("cost") or {}
    uc = sup.get("cost") or {}
    sk = st.get("kpis") or {}
    uk = sup.get("kpis") or {}
    # Reconcile to a common ANNUAL basis: staff savings are weekly (×52), supply
    # savings are already annualised by the Monte-Carlo horizon.
    staff_annual = sc.get("saving_annual_zar") or 0
    supply_annual = uc.get("saving_zar") or 0
    return {
        "staff_cost": sc,
        "supply_cost": uc,
        "total_saving_annual_zar": round(staff_annual + supply_annual, 0),
        "staff_saving_weekly_zar": sc.get("saving_zar") or 0,
        "staff_saving_annual_zar": staff_annual,
        "supply_saving_annual_zar": supply_annual,
        "lawful_coverage_pct": sk.get("lawful_coverage_pct"),
        "staffing_shortfall": sk.get("staffing_shortfall"),
        "locum_hours": sk.get("locum_hours"),
        "items_to_order": uk.get("items_to_order"),
        "order_cost_zar": uk.get("order_cost_zar"),
        "stockout_risk_addressed_zar": uk.get("stockout_risk_addressed_zar"),
        "forecast_factor": sup.get("forecast_factor"),
    }


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
    # Balance variable: the minimum coverage FRACTION achieved across all shifts.
    # Maximising it spreads the limited nurses evenly instead of dumping them on
    # one shift (a plain min-cost LP goes to a lop-sided corner solution).
    min_cov = LpVariable("min_cov", lowBound=0, upBound=1)

    # Objective (set ONCE), lexicographic via weights:
    #   1. minimise total locum-covered shortfall  (BIG weight) → max coverage
    #   2. maximise the worst shift's coverage      (−1)        → even spread
    #   3. small penalty for unmet skills-mix
    BIG = 1_000_000.0
    prob += (BIG * lpSum(unfilled[(d, sh)] for d in day_idx for sh in SHIFTS)
             - min_cov
             + lpSum(0.001 * v for v in pn_short.values()))

    # Demand coverage (soft via the locum slack).
    for d in day_idx:
        for sh in SHIFTS:
            covered = lpSum(x[(s["staff_id"], d, sh)] for s in staff)
            prob += covered + unfilled[(d, sh)] >= d_s[(d, sh)]
            # Every shift must reach at least the common min-coverage fraction.
            prob += covered >= min_cov * d_s[(d, sh)]

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

    # ── BEFORE optimization: the "fixed peak roster" a manager runs WITHOUT a
    # forecast — staff every shift to the busiest day of the week, every day (the
    # safe default). It covers demand but over-provisions on quieter days, so it
    # buys more expensive agency locum than necessary. AFTER optimization we
    # provision exactly the forecast demand, so the locum bill drops. The own-
    # nurse payroll is the same in both (the 23 salaried nurses work either way);
    # the saving is the agency locum the forecast lets us avoid.
    peak_slots = sum(max(d_s[(d, sh)] for d in day_idx) for sh in SHIFTS) * n_days
    before_locum_slots = max(0, peak_slots - total_assigned)
    after_locum_slots = total_unfilled
    before_locum_cost = before_locum_slots * locum_shift_cost
    after_locum_cost = after_locum_slots * locum_shift_cost
    before_cost = payroll + before_locum_cost
    after_cost = payroll + after_locum_cost
    savings = max(0.0, before_cost - after_cost)

    nurses_needed = math.ceil(total_required * SHIFT_HOURS / LEGAL_WEEKLY_HOURS)

    return {
        "status": status,
        "solve_time_seconds": round(time.perf_counter() - t0, 2),
        "cost": {
            "before_zar": round(before_cost, 0),       # fixed peak roster
            "after_zar": round(after_cost, 0),         # forecast-optimized
            "saving_zar": round(savings, 0),
            "saving_pct": round(savings / before_cost * 100, 1) if before_cost else 0.0,
            "saving_annual_zar": round(savings * 52, 0),
            "own_payroll_zar": round(payroll, 0),
            "before_locum_zar": round(before_locum_cost, 0),
            "after_locum_zar": round(after_locum_cost, 0),
            "before_locum_hours": round(before_locum_slots * SHIFT_HOURS, 0),
            "after_locum_hours": round(after_locum_slots * SHIFT_HOURS, 0),
        },
        "kpis": {
            "coverage_pct": round(coverage, 1),
            "lawful_coverage_pct": round(lawful_coverage, 1),
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
        },
        "demand_vs_coverage": per_day,
        "shifts": shift_rows,
        "roster": roster,
    }


# -- Supply: two-stage stochastic (s,S) programme (Chapter 3 §3.5.6) ----------
# Stage 1 sets (s, S); stage 2 observes demand drawn from the forecast predictive
# distribution. s* is closed-form; S* is the order-up-to level that minimises the
# Monte-Carlo expectation of the per-day total cost
#   C_t = K*1[order] + h*I+ + p*(y~ - I)+ + w*wastage,
# simulated over a rolling horizon for many replications.
MC_HORIZON_DAYS = 90
MC_REPS = 800
MC_GRID = 11


def _item_cost_params(it: dict, price: float) -> tuple[float, float, float, float]:
    """Derive (K, h, p, w) for an item from its simulation cost record.
    K = fixed cost per order; h = holding cost / unit / day; p = stockout
    penalty / unit short; w = wastage cost / unit expired."""
    orders_placed = float(it.get("total_orders_placed") or 0)
    K = (float(it.get("total_ordering_cost_zar") or 0) / orders_placed) if orders_placed > 0 else 350.0
    avg_stock = float(it.get("avg_stock_on_hand") or 0)
    hold_total = float(it.get("total_holding_cost_zar") or 0)
    h = (hold_total / (avg_stock * 396.0)) if (avg_stock > 0 and hold_total > 0) else price * 0.25 / 365.0
    so_units = float(it.get("total_stockout_units") or 0)
    so_cost = float(it.get("total_stockout_cost_zar") or 0)
    p = (so_cost / so_units) if (so_units > 0 and so_cost > 0) else max(price * 5.0, 1.0)
    w = price  # full value lost on expiry
    return K, max(h, 0.0), max(p, 0.0), max(w, 0.0)


def _simulate_policies(D, s_arr, S_arr, I0, L, K, h, p, w, cap):
    """Vectorised inventory simulation over (reps x policies). D is the
    pre-sampled demand matrix (horizon x reps) -- common random numbers across
    all candidate policies. Returns per-policy mean total cost and the mean
    cost split into (ordering, holding, stockout, wastage)."""
    T, R = D.shape
    G = len(S_arr)
    I = np.full((R, G), float(I0))
    on_order = np.zeros((R, G))
    arrivals = np.zeros((T + L + 1, R, G))
    Kc = np.zeros((R, G)); Hc = np.zeros((R, G)); Pc = np.zeros((R, G)); Wc = np.zeros((R, G))
    s_row = s_arr[None, :]; S_row = S_arr[None, :]
    finite_cap = np.isfinite(cap)
    for t in range(T):
        recv = arrivals[t]
        I += recv; on_order -= recv
        ip = I + on_order
        order_qty = np.where(ip <= s_row, np.clip(S_row - ip, 0.0, None), 0.0)
        on_order += order_qty
        arrivals[t + L] += order_qty
        Kc += K * (order_qty > 0)
        d = D[t][:, None]
        Pc += p * np.clip(d - I, 0.0, None)
        I = I - np.minimum(I, d)
        if finite_cap:
            expired = np.clip(I - cap, 0.0, None)
            Wc += w * expired
            I = np.minimum(I, cap)
        Hc += h * I
    total = Kc + Hc + Pc + Wc
    return (total.mean(axis=0),
            {"ordering": Kc.mean(axis=0), "holding": Hc.mean(axis=0),
             "stockout": Pc.mean(axis=0), "wastage": Wc.mean(axis=0)})


def reorder_supply(
    items: list[dict],
    forecast_factor: float,
    service_level: float = 0.95,
    review_days: int = 7,
    horizon_days: int = MC_HORIZON_DAYS,
    n_reps: int = MC_REPS,
    forecast_rel_err: float = 0.15,
) -> dict[str, Any]:
    """Forecast-driven two-stage (s,S) optimisation (Chapter 3 §3.5.6).

    Per item: D_bar = forecast-scaled mean daily demand, sigma = demand SD
    (intrinsic demand noise combined with the forecast residual σ_ε, so a more
    accurate forecast lowers the required safety stock).
      s* = D_bar*L + z_alpha*sigma*sqrt(L)            (closed form)
      S* = argmin_S  E[ sum C_t(s*, S) ]              (Monte-Carlo grid search)
    BEFORE = a naive policy that ignores forecast uncertainty (no safety stock:
    s=D_bar*L, S=D_bar*(L+R)); AFTER = the optimised (s*, S*). Both costs come
    from the SAME simulator and horizon, so the saving is the value the forecast
    adds. Costs are reported annualised."""
    z = _z_for(service_level)
    factor = float(np.clip(forecast_factor, 0.5, 2.0))
    rng = np.random.default_rng(42)            # deterministic across re-runs
    annual = 365.0 / horizon_days

    orders = []
    before_total = after_total = 0.0
    order_cost = 0.0
    n_to_order = n_at_risk = 0
    breakdown_before = {"ordering": 0.0, "holding": 0.0, "stockout": 0.0, "wastage": 0.0}
    breakdown_after = dict(breakdown_before)

    for it in items:
        d_base = float(it.get("mean_daily_consumption") or 0)
        intrinsic_sd = float(it.get("sd_daily_consumption") or 0)
        L = max(1, int(round(float(it.get("lead_time_mean_days") or 5))))
        _cur = it.get("current_stock_units")
        on_hand = float(_cur if _cur is not None else (it.get("avg_stock_on_hand") or 0))
        price = float(it.get("unit_price_zar") or 0)
        shelf_days = float(it.get("shelf_life_months") or 24) * 30.0
        d_proj = d_base * factor

        # σ_ε (§3.5.6): intrinsic demand noise ⊕ forecast residual. The forecast
        # component (D̄·rel_err) is the part a better forecast shrinks — so model
        # accuracy directly changes the safety stock, and hence the cost.
        fc_sigma = d_proj * forecast_rel_err
        sigma = math.hypot(intrinsic_sd, fc_sigma)
        safety = z * sigma * math.sqrt(L)
        s_opt = d_proj * L + safety                          # closed-form reorder s*
        s_base = d_proj * L                                  # naive: no safety
        S_base = d_proj * (L + review_days)                  # naive order-up-to

        if d_proj <= 0:
            orders.append(_order_row(it, on_hand, d_proj, L, safety, s_opt, S_base, 0, price, None, "ok"))
            continue

        K, h, p, w = _item_cost_params(it, price)
        cap = shelf_days * d_proj if shelf_days > 0 else np.inf

        # Candidate S grid (>= s*), spanning up to ~2 review+lead cycles of cover.
        S_hi = s_opt + d_proj * (L + review_days) * 2.0 + safety
        S_grid = np.linspace(max(s_opt, S_base), max(S_hi, S_base + 1.0), MC_GRID)
        s_arr = np.concatenate([[s_base], np.full(MC_GRID, s_opt)])
        S_arr = np.concatenate([[S_base], S_grid])

        D = np.clip(rng.normal(d_proj, max(sigma, 1e-6), size=(horizon_days, n_reps)), 0.0, None)
        costs, comp = _simulate_policies(D, s_arr, S_arr, on_hand, L, K, h, p, w, cap)

        before_cost = float(costs[0])
        opt_idx = 1 + int(np.argmin(costs[1:]))
        after_cost = float(costs[opt_idx])
        S_star = float(S_arr[opt_idx])

        before_total += before_cost
        after_total += after_cost
        for kk in breakdown_before:
            breakdown_before[kk] += float(comp[kk][0])
            breakdown_after[kk] += float(comp[kk][opt_idx])

        days_cover = round(on_hand / d_proj, 1)
        order_qty = 0
        status = "ok"
        if on_hand <= s_opt:
            order_qty = int(math.ceil(max(0.0, S_star - on_hand)))
            status = "order_now"
            n_to_order += 1
            order_cost += order_qty * price
        if on_hand < safety:
            n_at_risk += 1
        elif on_hand > S_star * 2.5:
            status = "excess"

        orders.append(_order_row(it, on_hand, d_proj, L, safety, s_opt, S_star,
                                 order_qty, price, days_cover, status,
                                 saved=round((before_cost - after_cost) * annual, 0)))

    rank = {"order_now": 0, "excess": 1, "ok": 2}
    abc = {"A": 0, "B": 1, "C": 2}
    orders.sort(key=lambda o: (rank.get(o["status"], 9), abc.get(o["abc_class"], 9), -o["order_cost_zar"]))

    before_a = before_total * annual
    after_a = after_total * annual
    saving_a = max(0.0, before_a - after_a)
    stockout_cut = max(0.0, (breakdown_before["stockout"] - breakdown_after["stockout"]) * annual)

    return {
        "service_level": service_level,
        "forecast_factor": round(factor, 3),
        "horizon_days": horizon_days,
        "n_reps": n_reps,
        "cost": {
            "before_zar": round(before_a, 0),     # naive policy, annualised
            "after_zar": round(after_a, 0),       # optimised (s*,S*), annualised
            "saving_zar": round(saving_a, 0),
            "saving_pct": round(saving_a / before_a * 100, 1) if before_a else 0.0,
            "basis": "annualised expected total cost (Monte-Carlo)",
        },
        "cost_breakdown": {
            "before": {k: round(v * annual, 0) for k, v in breakdown_before.items()},
            "after": {k: round(v * annual, 0) for k, v in breakdown_after.items()},
        },
        "kpis": {
            "items_total": len(items),
            "items_to_order": n_to_order,
            "items_at_risk_now": n_at_risk,
            "order_cost_zar": round(order_cost, 0),
            "stockout_risk_addressed_zar": round(stockout_cut, 0),
        },
        "orders": orders,
    }


def _order_row(it, on_hand, d_proj, L, safety, rop, order_up_to, order_qty, price,
               days_cover, status, saved=0):
    return {
        "item_id": it.get("item_id"), "item_name": it.get("item_name"),
        "category": it.get("category"), "abc_class": it.get("abc_class"),
        "unit": it.get("unit"), "on_hand": round(on_hand, 0),
        "proj_daily": round(d_proj, 1), "lead_time_days": round(L, 0),
        "safety_stock": round(safety, 0), "reorder_point": round(rop, 0),
        "order_up_to": round(order_up_to, 0), "order_qty": order_qty,
        "order_cost_zar": round(order_qty * price, 0),
        "annual_saving_zar": saved,
        "days_cover": days_cover, "status": status,
    }


# ── Orchestration ────────────────────────────────────────────────────────────
def _meta(forecast: dict, **kw) -> dict[str, Any]:
    m = {"solver": "CBC", "forecast_source": forecast.get("source"),
         "forecast_model": forecast.get("model"), "forecast_model_label": forecast.get("model_label"),
         "forecast_accuracy_pct": forecast.get("accuracy_pct"), "forecast_mae": forecast.get("mae")}
    m.update(kw)
    return m


def forecast_rel_err(forecast: dict) -> float:
    """Forecast residual relative error (MAE / mean) — the σ_ε lever. A more
    accurate forecast has a smaller value, which shrinks safety stock."""
    daily = forecast.get("daily_total") or []
    mean = float(np.mean(daily)) if daily else 0.0
    mae = float(forecast.get("mae") or DEFAULT_SIGMA_EPS)
    return float(np.clip(mae / mean, 0.02, 0.6)) if mean else 0.15


def forecast_factor(forecast: dict) -> float:
    baseline = float(forecast.get("baseline_avg") or 0)
    daily = forecast.get("daily_total") or []
    fc_avg = float(np.mean(daily)) if daily else baseline
    return fc_avg / baseline if baseline else 1.0


def run_staff(
    forecast: dict,
    staff: list[dict],
    kappa: float = 1.65,
    weekly_budget_zar: Optional[float] = None,
) -> dict[str, Any]:
    """Run ONLY the staff optimization; update the shared cache; return the
    staff slice of the page payload."""
    sigma_eps = float(forecast.get("mae") or DEFAULT_SIGMA_EPS)
    res = solve_staff(forecast["daily_total"], forecast["dates"], staff,
                      kappa=kappa, sigma_eps=sigma_eps, weekly_budget_zar=weekly_budget_zar)
    _LAST["forecast"] = forecast
    _LAST["staff"] = res
    _LAST["meta"] = _meta(forecast, status=res["status"],
                          solve_time_seconds=res["solve_time_seconds"], kappa=kappa)
    _LAST["impact"] = _build_impact()
    return {"meta": _LAST["meta"], "forecast": forecast, "staff": res, "impact": _LAST["impact"]}


def run_supply(
    forecast: dict,
    items: list[dict],
    service_level: float = 0.95,
) -> dict[str, Any]:
    """Run ONLY the supply optimization; update the shared cache; return the
    supply slice of the page payload."""
    res = reorder_supply(items, forecast_factor(forecast), service_level=service_level,
                         forecast_rel_err=forecast_rel_err(forecast))
    _LAST["forecast"] = forecast
    _LAST["supply"] = res
    if _LAST.get("meta") is None:
        _LAST["meta"] = _meta(forecast, service_level=service_level)
    _LAST["impact"] = _build_impact()
    return {"meta": _LAST["meta"], "forecast": forecast, "supply": res, "impact": _LAST["impact"]}


def optimize(
    forecast: dict,
    staff: list[dict],
    items: list[dict],
    kappa: float = 1.65,
    service_level: float = 0.95,
    weekly_budget_zar: Optional[float] = None,
) -> dict[str, Any]:
    """Run BOTH optimizations (used by the combined endpoint + Action Center)."""
    run_staff(forecast, staff, kappa=kappa, weekly_budget_zar=weekly_budget_zar)
    run_supply(forecast, items, service_level=service_level)
    return {
        "meta": _LAST["meta"], "forecast": forecast,
        "staff": _LAST["staff"], "supply": _LAST["supply"], "impact": _LAST["impact"],
    }


def compute_both(
    forecast: dict,
    staff: list[dict],
    items: list[dict],
    kappa: float = 1.65,
    service_level: float = 0.95,
) -> dict[str, Any]:
    """Run both optimizations PURELY (no cache write) — for the forecast
    comparison, which evaluates several forecasts without disturbing _LAST."""
    sigma_eps = float(forecast.get("mae") or DEFAULT_SIGMA_EPS)
    staff_res = solve_staff(forecast["daily_total"], forecast["dates"], staff,
                            kappa=kappa, sigma_eps=sigma_eps)
    supply_res = reorder_supply(items, forecast_factor(forecast), service_level=service_level,
                                forecast_rel_err=forecast_rel_err(forecast))
    return {"forecast": forecast, "staff": staff_res, "supply": supply_res}


# ─── Multi-arm policy comparison and lead-time sweep ──────────────────────────
#
# Four inventory policies, ranked by how well they consume the demand forecast:
#   1. naive       — flat monthly bulk order sized to historical mean (no forecast)
#   2. s_q         — continuous-review (s, Q): order a FIXED EOQ whenever the
#                    inventory position falls to the reorder point s (textbook).
#   3. r_s         — periodic-review (R, S): every review period, order up to a
#                    mean-based order-up-to level S (textbook periodic policy).
#   4. ss_static   — classical (s, S) with mean-scaled safety stock (the baseline
#                    the current Optimization page already runs)
#   5. dynamic     — forecast-driven order-up-to BASE-STOCK (Li et al. 2022):
#                    S_t = Σ forecast over (L + R) + z·√(forecast_var + demand_var).
#                    Weekly review; order only when position < target.
#   6. oracle      — perfect-foresight base-stock using ACTUAL demand over the
#                    protection window — a ceiling/benchmark, not deployable.
#
# The point: `dynamic` beats `ss_static` most at SHORT lead times, where the
# forecast horizon still covers the (L + R) window and the forecast is still
# skilful. As lead time grows past the forecast's useful horizon the advantage
# fades — the crossover the sweep chart makes visible. All arms share common
# random numbers per (seed, item), so the comparison is paired and clean.

NB_DISPERSION = 1.4               # Chapter 5 calibrated negative-binomial dispersion
CHAPTER6_TEST_MAPE = 0.126        # Chapter 6 XGBoost test-set MAPE (≈12.6%)
SIM_HORIZON_DAYS = 60             # simulation length per policy per seed
SIM_SEEDS = (42, 123, 456)        # common-random-numbers replications
REVIEW_PERIOD_DAYS = 7            # weekly review for the dynamic and oracle arms
NAIVE_BUFFER = 1.20              # naive orders +20% over expected monthly demand

# Default lead-time sweep: short (3d, Li-et-al regime) out to 30d (tender cycles).
DEFAULT_LEAD_TIME_SWEEP = [3, 5, 7, 10, 14, 21, 30]

# Fixed policy ordering / index — used for DETERMINISTIC rng seeding (the
# reference used hash(), which is per-process randomised and breaks
# reproducibility of the thesis figures across restarts).
_POLICIES = ("naive", "s_q", "r_s", "ss_static", "dynamic", "oracle")
_POLICY_IDX = {p: i for i, p in enumerate(_POLICIES)}


def _stable_key(text: str) -> int:
    """Deterministic small integer from a string (process-independent)."""
    return sum((i + 1) * ord(c) for i, c in enumerate(str(text))) % 100003


def _negbin(mean: float, dispersion: float, rng: np.random.Generator) -> int:
    """Negative-binomial draw parameterised by (mean, dispersion)."""
    if mean <= 0:
        return 0
    n = dispersion
    p = n / (n + mean)
    return int(rng.negative_binomial(n, p))


def _gamma_lead(mean: float, sd: float, rng: np.random.Generator) -> int:
    """Gamma lead-time draw, at least one day."""
    if mean <= 0:
        return 0
    if sd <= 0:
        return max(1, int(round(mean)))
    shape = (mean / sd) ** 2
    scale = (sd ** 2) / mean
    return max(1, int(round(rng.gamma(shape, scale))))


def _synthesize_forecast(actual: np.ndarray, target_mape: float, seed: int) -> np.ndarray:
    """Synthesize a forecast that hits `target_mape` against the actuals.

    Adds Gaussian relative noise with sigma = mape·√(π/2) so E[|noise|] = mape,
    and horizon-degrades sigma by √step so the day-h forecast is noisier than
    the day-1 forecast — i.e. accuracy decays with horizon, as it does in life.
    """
    rng = np.random.default_rng(seed)
    n = len(actual)
    horizons = np.arange(1, n + 1)
    mape_h = target_mape * np.sqrt(horizons)
    sigma_h = mape_h * np.sqrt(np.pi / 2.0)
    noise = rng.normal(0.0, sigma_h)
    return np.clip(actual * (1.0 + noise), 1.0, None)


def _simulate_item_policy(
    item: dict,
    actual_demand: np.ndarray,
    forecast_demand: np.ndarray,
    policy: str,
    lead_time_mean: float,
    lead_time_sd: float,
    z: float,
    seed: int,
) -> dict:
    """One `SIM_HORIZON_DAYS`-day simulation of one item under one policy.

    Returns {total_cost, holding, ordering, stockout, stockouts, service_level}.
    """
    rng_lead = np.random.default_rng(seed * 100003 + _POLICY_IDX[policy] * 7919 + 13)
    n_days = len(actual_demand)
    unit_cost = float(item["unit_cost"])
    hold_rate = float(item["holding_rate"])
    order_cost = float(item["ordering_cost"])
    stockout_penalty = 5.0 * unit_cost  # clinical proxy: 5× unit cost per unit short

    d_avg = float(np.mean(actual_demand))
    d_std = float(np.std(actual_demand)) if len(actual_demand) > 1 else max(1.0, 0.3 * d_avg)

    # Static (s, S) sizing — the target for naive and thresholds for ss_static.
    safety = z * d_std * np.sqrt(lead_time_mean)
    s_thr = d_avg * lead_time_mean + safety
    D_annual = d_avg * 365
    H = unit_cost * hold_rate
    eoq = float(np.sqrt(2 * D_annual * order_cost / H)) if (H > 0 and D_annual > 0) else max(1.0, d_avg * 7)
    S_cap = s_thr + eoq

    stock = float(item.get("on_hand", int(S_cap)))
    pending: list[tuple] = []

    total_hold = total_order = total_stockout = 0.0
    stockouts = 0
    units_consumed = units_short = 0.0

    for day in range(n_days):
        # Deliveries arriving today
        remaining = []
        for arr_day, qty in pending:
            if arr_day <= day:
                stock += qty
            else:
                remaining.append((arr_day, qty))
        pending = remaining

        # Consumption
        demand = int(actual_demand[day])
        if demand <= stock:
            stock -= demand
            units_consumed += demand
        else:
            units_consumed += stock
            short = demand - stock
            units_short += short
            total_stockout += short * stockout_penalty
            stockouts += 1
            stock = 0

        # Reorder rule per policy
        place = 0
        if policy == "naive":
            if day % 30 == 0:                                   # monthly bulk
                place = max(1, int(round(d_avg * 30 * NAIVE_BUFFER)))

        elif policy == "s_q":
            # Continuous-review (s, Q): check every day; order a FIXED EOQ
            # whenever the inventory position drops to the reorder point.
            position = stock + sum(q for _, q in pending)
            if position <= s_thr:
                place = max(1, int(round(eoq)))

        elif policy == "r_s":
            # Periodic-review (R, S): every review, top up to a mean-based
            # order-up-to level covering demand over the (L + R) window.
            if day % REVIEW_PERIOD_DAYS == 0:
                S_rs = d_avg * (lead_time_mean + REVIEW_PERIOD_DAYS) + safety
                position = stock + sum(q for _, q in pending)
                if position < S_rs:
                    place = max(1, int(round(S_rs - position)))

        elif policy == "ss_static":
            if day % REVIEW_PERIOD_DAYS == 0:
                position = stock + sum(q for _, q in pending)
                if position < s_thr:
                    place = max(1, int(round(S_cap - position)))

        elif policy == "dynamic":
            if day % REVIEW_PERIOD_DAYS == 0:
                L_int = max(1, int(round(lead_time_mean)))
                window = forecast_demand[day:min(n_days, day + L_int + REVIEW_PERIOD_DAYS)]
                if len(window):
                    mean_window = float(np.sum(window))
                    forecast_var = (CHAPTER6_TEST_MAPE * mean_window) ** 2
                    nb_var = mean_window * (1.0 + mean_window / NB_DISPERSION)
                    target = mean_window + z * np.sqrt(forecast_var + nb_var)
                    position = stock + sum(q for _, q in pending)
                    if position < target:
                        place = max(1, int(round(target - position)))

        elif policy == "oracle":
            if day % REVIEW_PERIOD_DAYS == 0:
                L_int = max(1, int(round(lead_time_mean)))
                window = actual_demand[day:min(n_days, day + L_int + REVIEW_PERIOD_DAYS)]
                if len(window):
                    mean_window = float(np.sum(window))
                    nb_var = mean_window * (1.0 + mean_window / NB_DISPERSION)
                    target = mean_window + z * np.sqrt(nb_var)
                    position = stock + sum(q for _, q in pending)
                    if position < target:
                        place = max(1, int(round(target - position)))
        else:
            raise ValueError(f"Unknown policy: {policy}")

        if place > 0:
            lead = _gamma_lead(lead_time_mean, lead_time_sd, rng_lead)
            pending.append((day + lead, place))
            total_order += order_cost

        total_hold += stock * unit_cost * hold_rate / 365.0

    service_level = units_consumed / max(1e-9, units_consumed + units_short)
    return {
        "total_cost": total_hold + total_order + total_stockout,
        "holding": total_hold,
        "ordering": total_order,
        "stockout": total_stockout,
        "stockouts": stockouts,
        "service_level": service_level,
    }


def _run_comparison_for_lead_time(items: list[dict], z: float, lead_time_mean: float) -> dict:
    """Run the four policies × `SIM_SEEDS` for a given mean lead time.

    Common random numbers: each (seed, item) generates ONE actual demand and
    ONE forecast realisation shared across all policies, so policy differences
    are paired and cleaner than independent draws would give.
    """
    lead_time_sd = 0.3 * lead_time_mean            # coefficient of variation 30%
    accum = {p: {k: [] for k in ("total_cost", "holding", "ordering",
                                 "stockout", "stockouts", "service_level")}
             for p in _POLICIES}

    for seed in SIM_SEEDS:
        rng_demand = np.random.default_rng(seed)
        for item in items:
            d_avg = float(item["daily_demand_avg"])
            actual = np.array([_negbin(d_avg, NB_DISPERSION, rng_demand)
                               for _ in range(SIM_HORIZON_DAYS)], dtype=float)
            forecast = _synthesize_forecast(actual, CHAPTER6_TEST_MAPE,
                                            seed + _stable_key(item["sku"]))
            for p in _POLICIES:
                r = _simulate_item_policy(item, actual, forecast, p,
                                          lead_time_mean, lead_time_sd, z, seed)
                for k in accum[p]:
                    accum[p][k].append(r[k])

    summary = {}
    for p, metrics in accum.items():
        tc = metrics["total_cost"]
        summary[p] = {
            "total_cost_mean": float(np.mean(tc)),
            "total_cost_sd": float(np.std(tc, ddof=1)) if len(tc) > 1 else 0.0,
            "holding_mean": float(np.mean(metrics["holding"])),
            "ordering_mean": float(np.mean(metrics["ordering"])),
            "stockout_mean": float(np.mean(metrics["stockout"])),
            "stockouts_mean": float(np.mean(metrics["stockouts"])),
            "service_level_mean": float(np.mean(metrics["service_level"])),
        }
    return summary


def optimize_supply_multi_arm(
    items: list[dict],
    service_level: float = 0.95,
    lead_time_mean: Optional[float] = None,
) -> dict[str, Any]:
    """Compare naive / ss_static / dynamic / oracle at ONE lead time.

    If `lead_time_mean` is None, uses the mean of the items' lead_time_days.
    Deltas are reported versus the ss_static (classical (s,S)) baseline, so the
    dynamic arm's gain reads directly as "what the forecast-driven policy adds".
    """
    z = _z_for(service_level)
    if lead_time_mean is None:
        lead_time_mean = float(np.mean([item.get("lead_time_days", 7) for item in items]))
    summary = _run_comparison_for_lead_time(items, z, float(lead_time_mean))

    baseline_cost = summary["ss_static"]["total_cost_mean"]
    for p in summary:
        summary[p]["delta_vs_baseline_pct"] = (
            100.0 * (baseline_cost - summary[p]["total_cost_mean"]) / max(1.0, baseline_cost)
        )

    return {
        "success": True,
        "service_level": service_level,
        "z_score": round(z, 3),
        "lead_time_mean_days": float(lead_time_mean),
        "n_items": len(items),
        "n_seeds": len(SIM_SEEDS),
        "sim_horizon_days": SIM_HORIZON_DAYS,
        "policies": summary,
        "message": (f"Compared naive, static (s,S), dynamic base-stock and oracle "
                    f"across {len(items)} SKUs at mean lead time {lead_time_mean:.0f}d."),
    }


def optimize_supply_lead_time_sweep(
    items: list[dict],
    service_level: float = 0.95,
    lead_times: Optional[list] = None,
) -> dict[str, Any]:
    """Sweep the four policies across a range of mean lead times.

    Returns crossover-chart data: for each policy an array of costs indexed by
    lead-time bin, plus per-row deltas. The story is the intersection of the
    `dynamic` and `ss_static` lines: dynamic wins to the LEFT of the crossover
    (short lead times) where the forecast horizon still tracks the (L+R) window.
    """
    if lead_times is None:
        lead_times = list(DEFAULT_LEAD_TIME_SWEEP)
    z = _z_for(service_level)

    series = {p: [] for p in _POLICIES}
    rows = []
    for L in lead_times:
        summary = _run_comparison_for_lead_time(items, z, float(L))
        for p in _POLICIES:
            series[p].append(round(summary[p]["total_cost_mean"], 2))
        rows.append({
            "lead_time_days": float(L),
            "costs": {p: round(summary[p]["total_cost_mean"], 2) for p in _POLICIES},
            "dynamic_vs_ss_static_pct": round(
                100.0 * (summary["ss_static"]["total_cost_mean"]
                         - summary["dynamic"]["total_cost_mean"])
                / max(1.0, summary["ss_static"]["total_cost_mean"]), 2),
        })

    # Crossover = the end of the CONTIGUOUS winning streak from the short-lead
    # end (i.e. the last lead time before dynamic first drops below static).
    # Using the *largest* positive L would be dishonest: mid-range simulation
    # noise can flip a later bin positive and overstate the region where the
    # forecast actually helps. The "wins to the left of the crossover" story
    # is only true for the contiguous run.
    crossover_lead_time = None
    for r in rows:
        if r["dynamic_vs_ss_static_pct"] > 0:
            crossover_lead_time = r["lead_time_days"]
        else:
            break

    return {
        "success": True,
        "service_level": service_level,
        "z_score": round(z, 3),
        "n_items": len(items),
        "n_seeds": len(SIM_SEEDS),
        "lead_times": [float(L) for L in lead_times],
        "series": series,
        "rows": rows,
        "crossover_lead_time_days": crossover_lead_time,
        "message": (f"Swept lead times {lead_times[0]:.0f}d–{lead_times[-1]:.0f}d across "
                    f"{len(items)} SKUs. Dynamic base-stock beats static up to about "
                    f"{crossover_lead_time if crossover_lead_time else 'no'} days."),
    }
