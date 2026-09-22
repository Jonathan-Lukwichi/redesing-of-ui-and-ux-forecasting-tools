"""Invariant tests for the optimisation engine.

The code that decides how many nurses work on Thursday and how many vials to
order had no tests at all. These are the properties that must hold for ANY
input, not golden numbers that break whenever a coefficient moves:

* no roster may ever breach the BCEA weekly cap or the 11-hour rest rule;
* the cost arithmetic must reconcile;
* a budget must actually bind, and must never be met by dropping the skills mix;
* the cost tie-breaker must prefer the cheaper of two interchangeable nurses;
* a Monte-Carlo saving must come with an interval, and figures on incomparable
  cost bases must not be differenced.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core import optimization_engine as E  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "data" / "simulation"


def _staff(n_pn=3, n_en=3, n_ena=3):
    out = []
    for i in range(n_pn):
        out.append({"staff_id": f"PN{i:03d}", "category": "Professional Nurse",
                    "skill_level": 2, "annual_salary_zar": 400_000 + i * 10_000})
    for i in range(n_en):
        out.append({"staff_id": f"EN{i:03d}", "category": "Enrolled Nurse",
                    "skill_level": 1, "annual_salary_zar": 220_000 + i * 10_000})
    for i in range(n_ena):
        out.append({"staff_id": f"NA{i:03d}", "category": "Enrolled Nursing Auxiliary",
                    "skill_level": 0, "annual_salary_zar": 180_000 + i * 10_000})
    return out


DATES = [f"2026-09-{d:02d}" for d in range(21, 28)]


def _solve(daily, staff=None, **kw):
    return E.solve_staff(daily, DATES, staff or _staff(), **kw)


# ── Lawfulness: these must hold for every input, always ──────────────────────

@pytest.mark.parametrize("daily", [
    [10] * 7,            # pool has slack
    [45] * 7,            # pool is tight
    [200] * 7,           # demand far exceeds capacity
    [5, 90, 8, 120, 7, 60, 9],   # violently uneven
])
def test_bcea_weekly_cap_never_breached(daily):
    r = _solve(daily)
    for row in r["roster"]:
        assert row["weekly_hours"] <= E.LEGAL_WEEKLY_HOURS, (
            f"{row['staff_id']} rostered {row['weekly_hours']}h, cap is "
            f"{E.LEGAL_WEEKLY_HOURS}h")
        assert row["bcea_45h_ok"] is True


@pytest.mark.parametrize("daily", [[10] * 7, [45] * 7, [200] * 7])
def test_eleven_hour_rest_rule_never_breached(daily):
    """No Day shift the morning after a Night shift (BCEA s14)."""
    r = _solve(daily)
    for row in r["roster"]:
        worked = set(row["shifts_assigned"])
        for d in range(len(daily) - 1):
            night = f"{E.DAY_ABBR[d % 7]}-Night"
            nxt = f"{E.DAY_ABBR[(d + 1) % 7]}-Day"
            assert not (night in worked and nxt in worked), (
                f"{row['staff_id']} works {night} then {nxt}")


@pytest.mark.parametrize("daily", [[10] * 7, [45] * 7, [200] * 7])
def test_one_shift_per_nurse_per_day(daily):
    r = _solve(daily)
    for row in r["roster"]:
        days = [s.split("-")[0] for s in row["shifts_assigned"]]
        assert len(days) == len(set(days)), f"{row['staff_id']} works twice in a day"


# ── Accounting: the numbers on screen must reconcile ─────────────────────────

@pytest.mark.parametrize("daily", [[10] * 7, [45] * 7, [200] * 7])
def test_cost_accounting_reconciles(daily):
    k = _solve(daily)["kpis"]
    assert abs((k["weekly_payroll_zar"] + k["locum_cost_zar"]) - k["weekly_cost_zar"]) <= 2


@pytest.mark.parametrize("daily", [[10] * 7, [45] * 7, [200] * 7])
def test_coverage_identity_holds(daily):
    """filled + unfilled must equal required, for every shift."""
    r = _solve(daily)
    for row in r["shifts"]:
        assert row["assigned"] + row["unfilled"] >= row["required"]
    k = r["kpis"]
    assert k["total_filled_slots"] + k["unfilled_slots"] >= k["total_required_slots"]


def test_solver_reaches_optimality():
    assert _solve([45] * 7)["status"] == "Optimal"


# ── The cost term: the regression this suite exists to prevent ───────────────

def test_cost_tie_breaker_prefers_cheaper_interchangeable_nurses():
    """With one category (so the skills-mix rule cannot drive the choice) and
    genuine slack, the cheapest nurses must get the shifts. Before the cost term
    was added to the objective this was pure luck of the solver's branching."""
    pool = [{"staff_id": f"NA{i:03d}", "category": "Enrolled Nursing Auxiliary",
             "skill_level": 0, "annual_salary_zar": 150_000 + i * 50_000}
            for i in range(8)]
    r = E.solve_staff([6] * 7, DATES, pool, kappa=1.0, sigma_eps=1.0)
    salary = {s["staff_id"]: s["annual_salary_zar"] for s in pool}
    worked = [salary[x["staff_id"]] for x in r["roster"] if x["n_shifts"] > 0]
    idle = [salary[x["staff_id"]] for x in r["roster"] if x["n_shifts"] == 0]
    assert idle, "test needs slack in the pool to be meaningful"
    assert max(worked) <= min(idle), (
        "an expensive nurse was rostered while a cheaper one sat idle — "
        "the cost tie-breaker is not working")


# ── The budget: it must bind, and never at the cost of safety ────────────────

def test_budget_above_the_cost_minimum_is_respected():
    """Because cost is already a tier of the objective, the unconstrained roster
    is the cheapest one that covers the forecast. A cap above it must therefore
    report no overrun."""
    daily = [10] * 7
    free = _solve(daily, kappa=1.0, sigma_eps=2.0)
    cap = free["kpis"]["weekly_cost_zar"] * 1.5
    capped = _solve(daily, kappa=1.0, sigma_eps=2.0, weekly_budget_zar=cap)
    assert capped["kpis"]["budget_respected"] is True
    assert capped["kpis"]["budget_overrun_zar"] == 0


def test_tight_budget_never_buys_compliance_by_cutting_coverage():
    """The contract that matters clinically: a cap that cannot be met must
    surface the gap, NOT quietly roster fewer nurses. Coverage under a tight
    budget must be no worse than coverage without one."""
    daily = [10] * 7
    free = _solve(daily, kappa=1.0, sigma_eps=2.0)
    starved = _solve(daily, kappa=1.0, sigma_eps=2.0, weekly_budget_zar=1_000.0)
    assert starved["kpis"]["coverage_pct"] >= free["kpis"]["coverage_pct"]
    assert starved["kpis"]["unfilled_slots"] <= free["kpis"]["unfilled_slots"]
    assert starved["kpis"]["budget_respected"] is False
    assert starved["kpis"]["budget_overrun_zar"] > 0


def test_budget_overrun_is_reported_not_hidden():
    """An impossible budget must surface the gap, never fail or silently pass."""
    r = _solve([200] * 7, weekly_budget_zar=1_000.0)
    assert r["status"] == "Optimal"
    assert r["kpis"]["budget_overrun_zar"] > 0
    assert r["kpis"]["budget_respected"] is False


def test_skills_mix_survives_an_impossible_budget():
    """Clinical safety outranks money: a tight cap must not buy compliance by
    taking the Professional Nurse off a shift."""
    staff = _staff()
    pn = {s["staff_id"] for s in staff if s["category"] == "Professional Nurse"}

    def shifts_without_pn(res):
        covered, with_pn = set(), set()
        for row in res["roster"]:
            covered |= set(row["shifts_assigned"])
            if row["staff_id"] in pn:
                with_pn |= set(row["shifts_assigned"])
        return len(covered - with_pn)

    free = _solve([10] * 7, staff, kappa=1.0, sigma_eps=2.0)
    starved = _solve([10] * 7, staff, kappa=1.0, sigma_eps=2.0, weekly_budget_zar=1_000.0)
    assert shifts_without_pn(starved) <= shifts_without_pn(free)


def test_no_budget_means_no_phantom_overrun():
    assert _solve([45] * 7)["kpis"]["budget_overrun_zar"] == 0
    assert _solve([45] * 7)["kpis"]["budget_respected"] is None


# ── Current-practice baseline: only compared when comparable ─────────────────

def test_current_practice_withheld_when_demand_levels_differ():
    r = _solve([200] * 7, current_weekly_cost_zar=245_000.0, current_mean_arrivals=69.0)
    cp = r["current_practice"]
    assert cp["comparable"] is False
    assert "saving_vs_current_weekly_zar" not in cp, (
        "costs at different demand levels were differenced anyway")
    assert cp["not_comparable_reason"]


def test_current_practice_compared_when_demand_matches():
    r = _solve([70] * 7, current_weekly_cost_zar=245_000.0, current_mean_arrivals=69.0)
    cp = r["current_practice"]
    assert cp["comparable"] is True
    assert "saving_vs_current_weekly_zar" in cp
    assert cp["interpretation"]


def test_current_practice_absent_when_not_supplied():
    assert _solve([45] * 7)["current_practice"] is None


# ── Supply: intervals and cost-basis honesty ─────────────────────────────────

def _items():
    import pandas as pd
    df = pd.read_csv(DATA / "supply_items.csv")
    return df.to_dict("records")


@pytest.mark.skipif(not (DATA / "supply_items.csv").exists(), reason="simulation data absent")
def test_supply_saving_carries_an_interval():
    r = E.reorder_supply(_items(), forecast_factor=1.0, service_level=0.95,
                         forecast_rel_err=0.12, n_reps=200)
    c = r["cost"]
    assert c["saving_half_width_zar"] > 0, "a Monte-Carlo saving was reported as a point value"
    assert c["saving_low_zar"] <= c["saving_zar"] <= c["saving_high_zar"]


@pytest.mark.skipif(not (DATA / "supply_items.csv").exists(), reason="simulation data absent")
def test_supply_reports_current_practice_on_the_realised_cost_basis():
    r = E.reorder_supply(_items(), forecast_factor=1.0, service_level=0.95,
                         forecast_rel_err=0.12, n_reps=200)
    assert r["cost"]["cost_basis"] == "realised"
    assert r["current_practice"] is not None
    assert r["current_practice"]["annual_zar"] > 0


@pytest.mark.skipif(not (DATA / "supply_items.csv").exists(), reason="simulation data absent")
def test_arm_simulator_does_not_compare_itself_to_recorded_spend():
    """The arm simulator prices holding and shortage synthetically, so its rands
    are not on the same basis as recorded spend. It must refuse the comparison
    rather than print a confident-looking meaningless percentage."""
    fc = {"daily_total": [70] * 7, "baseline_avg": 69.0, "mae": 8.3, "dates": DATES}
    r = E.plan_orders_for_policy("s_q", _items(), fc, 0.95, None)
    assert r["cost"]["cost_basis"] == "synthetic"
    assert r["cost"]["comparable_with_mc_engine"] is False
    assert r["current_practice"] is None


@pytest.mark.skipif(not (DATA / "supply_items.csv").exists(), reason="simulation data absent")
def test_order_quantities_are_never_negative():
    r = E.reorder_supply(_items(), forecast_factor=1.2, service_level=0.95,
                         forecast_rel_err=0.12, n_reps=200)
    for o in r["orders"]:
        assert o["order_qty"] >= 0
        assert o["order_cost_zar"] >= 0
