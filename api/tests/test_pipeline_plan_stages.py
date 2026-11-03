"""Stages 5 and 6 (Task 11): forecast and optimise.

One module-scoped run on the seed data (396 days) feeds the read-only checks,
since a run fits models and solves a roster. Tests that change the data or
monkeypatch run on their own afterwards.
"""
import asyncio
import copy

import numpy as np
import pandas as pd
import pytest

from core import data_version, optimization_engine as engine, prepare_registry, registry
from core import simulation_data
from core.pipeline import stages
from routers import forecast, optimization, staff, supply
from tests import pipeline_fixtures as fx

GROUPS = ("g1", "g2", "g3", "g4", "ops_daily")
POLICY_NOTICE = ("Tuned reorder settings were reset because the data changed. "
                 "Re-tune on the Optimization page.")
SEVEN = ("Medicine", "Orthopaedics", "Surgery", "Gynaecology", "Paediatrics",
         "Maternity", "Psychiatry")


def _seed_seven_specialties():
    """seed_all() carries only the four required specialty columns."""
    daily = registry.get_df("daily_arrival")
    n = len(daily)
    cols = {c: (np.arange(n) % (k + 3)) + 1 for k, c in enumerate(forecast.SPECIALTY_COLUMN.values())}
    fx.put("clinical_daily", pd.DataFrame({"date": daily["date"], **cols}))


def _run(*fns):
    return [fn() for fn in fns]


def _last(route, *args):
    return copy.deepcopy(asyncio.run(route(*args)))


@pytest.fixture(scope="module")
def world():
    """Save every global the stages touch, give each test the seeded data, and
    put everything back at the end of the module."""
    saved_slots = {sid: registry.get(sid) for sid in fx.slot_ids()}
    saved_groups = {g: prepare_registry.get(g) for g in GROUPS}
    saved_uploaded = dict(simulation_data._UPLOADED)
    saved_meta = dict(simulation_data._META)
    saved_policy = dict(engine._POLICY_STATE)
    fx.reset()
    fx.seed_all()
    _seed_seven_specialties()
    yield
    data_version.invalidate_all()   # leave no result from these runs behind
    fx.reset()
    for sid, entry in saved_slots.items():
        if entry is not None:
            registry.put(sid, entry.df, entry.metadata)
    for g, entry in saved_groups.items():
        prepare_registry.clear(g)
        if entry is not None:
            prepare_registry.put(g, entry.df, entry.metadata)
    simulation_data._UPLOADED.clear()
    simulation_data._UPLOADED.update(saved_uploaded)
    simulation_data._META.update(saved_meta)
    engine._POLICY_STATE.update(saved_policy)


@pytest.fixture(scope="module")
def ran(world):
    """One full run through optimise. The standing family is (s,Q) with tuned
    settings, so the run must keep the family and reset the settings."""
    engine.set_policy("s_q", tuned={"params_by_item": {"X": {"s_mult": 1.0, "q_mult": 1.0}},
                                    "tuned_at": "2026-01-01T00:00:00"})
    data_version.invalidate_all()
    _run(stages.check, stages.transform, stages.operations, stages.consolidate)
    fc = stages.forecast_stage()
    opt = stages.optimise_stage()
    specialties = {sp: _last(forecast.last_specialty, sp) for sp in SEVEN}
    return {
        "version": data_version.current(),
        "forecast": fc, "optimise": opt,
        "forecast_last": _last(forecast.last_run),
        "specialty_last": specialties,
        "optimization_last": _last(optimization.last),
        "compare_last": _last(supply.supply_compare_last),
        "strategy_last": _last(staff.staff_strategy_compare_last),
        "policy": engine.get_policy_state(),
    }


def _cheapest_deployable(compare):
    pol = compare["policies"]
    return min((p for p in pol if p in engine.DEPLOYABLE_POLICIES),
               key=lambda p: pol[p]["total_cost_mean"])


# --- Forecast -----------------------------------------------------------------

def test_total_forecast_is_published_and_validated(ran):
    last = ran["forecast_last"]
    assert last["available"] is True and last["kind"] == "total"
    assert last["data_version"] == ran["version"]
    res = last["result"]
    assert res["validated"] is True and res["validation"] is not None
    assert res["requested_model"] == stages.PIPELINE_MODEL == "ml"
    assert res["requested_horizon"] == stages.PIPELINE_HORIZON == 7
    assert len(res["forecast"]) == 7
    assert ran["forecast"].status == "done"
    assert "backtested" in ran["forecast"].receipt


def test_specialties_never_replace_total(ran):
    assert set(forecast._LAST_SPECIALTY) == set(SEVEN)
    for sp in SEVEN:
        got = ran["specialty_last"][sp]
        assert got["available"] is True
        assert got["result"]["requested_specialty"] == sp
        assert got["result"]["data_version"] == ran["version"]
    assert ran["forecast_last"]["kind"] == "total"
    assert "requested_specialty" not in ran["forecast_last"]["result"]


def test_weekly_specialties_use_weekly_resolution(ran):
    for sp in SEVEN:
        res = ran["specialty_last"][sp]["result"]
        weekly = sp in ("Maternity", "Psychiatry")
        assert res["resolution"] == ("weekly" if weekly else "daily"), sp
        assert res["requested_horizon"] == (4 if weekly else 7), sp
        dates = pd.to_datetime([d["date"] for d in res["forecast"]])
        assert set(np.diff(dates).astype("timedelta64[D]").astype(int)) == {7 if weekly else 1}


# --- Optimise -----------------------------------------------------------------

def test_optimiser_uses_the_published_forecast(ran):
    plan_fc = ran["optimization_last"]["forecast"]
    published = [float(d["predicted"]) for d in ran["forecast_last"]["result"]["forecast"]]
    assert plan_fc["live"] is True
    assert plan_fc["daily_total"] == published
    assert ran["optimization_last"]["staff"] is not None
    assert ran["optimization_last"]["supply"] is not None


def test_run_never_adopts_a_family(ran):
    assert ran["policy"]["policy"] == "s_q"
    assert ran["optimization_last"]["meta"]["supply_policy"] == "s_q"


def test_receipt_names_recommended_and_adopted_family(ran):
    receipt = ran["optimise"].receipt
    rec = _cheapest_deployable(ran["compare_last"]["result"])
    assert engine.DEPLOYABLE_POLICIES[rec]["label"] in receipt
    assert engine.DEPLOYABLE_POLICIES["s_q"]["label"] in receipt
    assert "recommend" in receipt.lower() and "adopted" in receipt.lower()


def test_receipt_gives_tuned_notice_when_settings_were_reset(ran):
    assert engine.get_policy_state()["params_by_item"] is None
    assert POLICY_NOTICE in ran["optimise"].warnings


def test_every_last_payload_carries_data_version(ran):
    v = ran["version"]
    assert ran["forecast_last"]["data_version"] == v
    assert ran["optimization_last"]["meta"]["data_version"] == v
    assert ran["compare_last"]["result"]["data_version"] == v
    assert ran["strategy_last"]["result"]["data_version"] == v


def test_no_accuracy_figures_in_receipts_or_warnings(ran):
    for r in (ran["forecast"], ran["optimise"]):
        text = " ".join([r.receipt, *r.warnings]).lower()
        assert "mape" not in text and "accuracy" not in text and "%" not in text


# --- Separate runs (these change the shared state) ------------------------------

def test_no_tuned_notice_when_nothing_was_reset(ran, monkeypatch):
    data_version.invalidate_all()     # the settings are already reset: nothing to clear
    assert engine.tuned_was_reset() is False
    _plan_from_cache(ran, monkeypatch)
    assert POLICY_NOTICE not in stages.optimise_stage().warnings


def test_tuned_was_reset_follows_the_last_invalidation(ran):
    engine.set_policy("dynamic", tuned={"params_by_item": {"X": {"z": 1.645}},
                                        "tuned_at": "2026-01-01T00:00:00"})
    data_version.invalidate_all()
    assert engine.tuned_was_reset() is True
    assert engine.get_policy_state()["policy"] == "dynamic"
    data_version.invalidate_all()
    assert engine.tuned_was_reset() is False


def _plan_from_cache(ran, monkeypatch, compare=None):
    """Skip the roster solve: reuse the module run's plan, optionally with a
    canned policy comparison."""
    plan = copy.deepcopy(ran["optimization_last"])
    monkeypatch.setattr(optimization, "run_for_pipeline", lambda model: plan)
    if compare is not None:
        monkeypatch.setattr(supply, "optimize_supply_multi_arm",
                            lambda items, **kw: copy.deepcopy(compare))


def _comparison(costs):
    return {"success": True, "policies": {p: {"total_cost_mean": c} for p, c in costs.items()}}


def test_naive_is_never_recommended(ran, monkeypatch):
    _plan_from_cache(ran, monkeypatch, _comparison(
        {"naive": 1.0, "oracle": 0.5, "s_q": 30.0, "r_s": 20.0, "ss_static": 40.0,
         "dynamic": 25.0}))
    r = stages.optimise_stage()
    assert f"recommends {engine.DEPLOYABLE_POLICIES['r_s']['label']}" in r.receipt
    assert "naive" not in r.receipt.lower() and "oracle" not in r.receipt.lower()


def test_no_deployable_arm_gives_no_recommendation(ran, monkeypatch):
    _plan_from_cache(ran, monkeypatch, _comparison({"naive": 1.0, "oracle": 0.5}))
    r = stages.optimise_stage()
    assert "no recommendation" in r.receipt.lower()
    for spec in engine.DEPLOYABLE_POLICIES.values():
        assert f"recommends {spec['label']}" not in r.receipt


def test_forecast_not_backtested_is_amber_but_published(ran, monkeypatch):
    monkeypatch.setattr(forecast, "compute_validation", lambda *a, **k: None)
    data_version.invalidate_all()
    r = stages.forecast_stage()
    assert r.status == "amber"
    assert "not backtested" in r.receipt
    last = asyncio.run(forecast.last_run())
    assert last["available"] is True and last["kind"] == "total"
    assert last["result"]["validated"] is False
    fc = optimization._FC_CACHE[(stages.PIPELINE_MODEL, "open")]
    assert fc["live"] is True and fc["error_basis"] == "one_step_holdout"


def test_missing_specialty_columns_are_named_not_fatal(ran, monkeypatch):
    g3 = prepare_registry.get("g3")
    try:
        prepare_registry.put("g3", g3.df.drop(columns=["spec_maternity", "spec_gynae"]),
                             g3.metadata)
        data_version.invalidate_all()
        r = stages.forecast_stage()
        assert r.status == "amber"
        assert any("Gynaecology" in w and "Maternity" in w for w in r.warnings)
        assert set(forecast._LAST_SPECIALTY) == set(SEVEN) - {"Gynaecology", "Maternity"}
    finally:
        prepare_registry.put("g3", g3.df, g3.metadata)


def test_forecast_without_g1_fails(world):
    saved = prepare_registry.get("g1")
    try:
        prepare_registry.clear("g1")
        data_version.invalidate_all()
        with pytest.raises(stages.StageFailed):
            stages.forecast_stage()
        assert asyncio.run(forecast.last_run()) == {"available": False}
    finally:
        if saved is not None:
            prepare_registry.put("g1", saved.df, saved.metadata)


def test_optimise_failure_when_g1_missing_is_not_a_fallback(ran):
    saved = prepare_registry.get("g1")
    try:
        prepare_registry.clear("g1")
        data_version.invalidate_all()       # empties _FC_CACHE and the plan
        with pytest.raises(stages.StageFailed) as e:
            stages.optimise_stage()
        assert "G1" in e.value.message
        assert engine.get_last() is None
        assert not optimization._FC_CACHE
        assert supply._LAST_COMPARE == {} and staff._LAST_STRATEGY == {}
    finally:
        prepare_registry.put("g1", saved.df, saved.metadata)


def test_stages_run_in_order():
    assert [sid for sid, _l, _f in stages.STAGES][-3:] == ["forecast", "optimise", "recommend"]
