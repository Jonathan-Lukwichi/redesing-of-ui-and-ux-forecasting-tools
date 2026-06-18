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
