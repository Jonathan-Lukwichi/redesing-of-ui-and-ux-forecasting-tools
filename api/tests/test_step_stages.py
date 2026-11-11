"""Task 1: a stage for each step, and clearing only what a step owns."""
import asyncio
import re

import pytest

from core import data_version, optimization_engine as engine
from core.pipeline import READY_STEPS, stages
from routers import optimization, staff, supply  # noqa: F401  (each registers its clearer)
from tests.pipeline_fixtures import seeded  # noqa: F401  (a shared fixture)


@pytest.fixture
def saved_policy():
    saved = dict(engine._POLICY_STATE)
    was_reset = engine._TUNED_WAS_RESET
    yield
    engine._POLICY_STATE.update(saved)
    engine._TUNED_WAS_RESET = was_reset


def test_invalidate_runs_only_the_named_clearers_and_bumps_the_version(monkeypatch):
    calls = []
    monkeypatch.setattr(data_version, "_CLEARERS", {"a": lambda: calls.append("a"),
                                                     "b": lambda: calls.append("b")})
    before = data_version.current()
    assert data_version.invalidate(["b"]) == before + 1
    assert calls == ["b"]


def test_invalidate_refuses_an_unknown_name(monkeypatch):
    calls = []
    monkeypatch.setattr(data_version, "_CLEARERS", {"a": lambda: calls.append("a")})
    with pytest.raises(ValueError, match="nope"):
        data_version.invalidate(["a", "nope"])
    assert calls == []


def test_re_running_the_optimisation_keeps_tuned_settings(saved_policy):
    engine.set_policy("s_q", tuned={"params_by_item": {"X": {"s_mult": 1.0, "q_mult": 1.0}},
                                    "tuned_at": "2026-01-01T00:00:00"})
    data_version.invalidate(stages.CLEARS["optimise"])
    assert engine.get_policy_state()["tuned_at"] == "2026-01-01T00:00:00"
    assert engine.tuned_was_reset() is False
    assert asyncio.run(optimization.last())["status"] == "no_solution_yet"


def test_new_data_still_resets_tuned_settings(saved_policy):
    engine.set_policy("s_q", tuned={"params_by_item": {"X": {"s_mult": 1.0, "q_mult": 1.0}},
                                    "tuned_at": "2026-01-01T00:00:00"})
    data_version.invalidate_all()
    assert engine.tuned_was_reset() is True


def test_every_cleared_name_is_a_registered_clearer():
    import main  # noqa: F401  (registers every clearer)
    names = {n for ns in stages.CLEARS.values() for n in ns}
    assert names <= set(data_version._CLEARERS)


def test_stages_produce_exactly_the_ready_steps():
    assert {s for ss in stages.PRODUCES.values() for s in ss} == set(READY_STEPS)


def test_stage_entry_reads_the_pipeline_then_the_extra_stages(monkeypatch):
    assert stages.stage_entry("forecast")[2] is stages.forecast_stage
    assert stages.stage_entry("analyse_staff")[2] is stages.analyse_staff
    stub = lambda: stages.StageResult("x")
    monkeypatch.setattr(stages, "STAGES", [("forecast", "Forecast", stub)])
    assert stages.stage_entry("forecast")[2] is stub
    with pytest.raises(ValueError):
        stages.stage_entry("nope")


def test_the_full_analysis_runs_all_three_areas(monkeypatch):
    monkeypatch.setattr(stages, "analyse_arrivals", lambda: stages.StageResult("3 findings, 4 metrics"))
    monkeypatch.setattr(stages, "analyse_staff", lambda: stages.StageResult("5 active staff over 9 days"))
    monkeypatch.setattr(stages, "analyse_supply", lambda: stages.StageResult("2 items, 1 at risk of stockout", ["w"], "amber"))
    r = stages.analyse_stage()
    assert r.receipt == "5 active staff over 9 days; 2 items, 1 at risk of stockout; 3 findings, 4 metrics"
    assert r.status == "amber" and r.warnings == ["w"]


def test_staff_and_supply_analyses_read_the_operations_tables(seeded):
    stages.operations()
    assert re.fullmatch(r"\d+ active staff over \d+ days", stages.analyse_staff().receipt)
    assert re.fullmatch(r"\d+ items, \d+ at risk of stockout", stages.analyse_supply().receipt)
