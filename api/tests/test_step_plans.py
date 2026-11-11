"""Task 5: the step planner (core/pipeline/steps.py) and the server-side
estimates (core/pipeline/timings.py).

The stages are stubs under their real ids where a run is started
(pipeline_fixtures.stub_stages). Unless a test says otherwise the data counts
as prepared (steps.needs_preparation is False), the files check passes, and
the sample may be loaded.
"""
import pandas as pd
import pytest

from core import data_version, prepare_registry, registry
from core.pipeline import READY_STEPS, job, preflight, sample, stages, steps, timings
from tests.pipeline_fixtures import fail_in, hold_in, seeded, stub_stages  # noqa: F401

CHECKS_OK = {"ok": True, "issues": [], "replaced_months": [], "arrivals_source": None}


@pytest.fixture(autouse=True)
def fresh(request, monkeypatch):
    monkeypatch.setattr(job, "_STATE", job._State())
    if "seeded_groups" not in request.fixturenames:   # that test checks the real one
        monkeypatch.setattr(steps, "needs_preparation", lambda: False)
    monkeypatch.setattr(preflight, "run_checks", lambda: dict(CHECKS_OK))
    monkeypatch.setattr(sample, "refusal", lambda can_write, replace: None)
    timings.reset()
    yield
    assert job.wait(30), "a test left the job running"
    timings.reset()


@pytest.fixture
def ready(monkeypatch):
    """``ready(steps)`` sets the steps the job holds results for."""
    def set_ready(names):
        monkeypatch.setattr(job._STATE, "ready", set(names))
    return set_ready


@pytest.fixture
def seeded_groups(seeded):
    """The seeded slots plus a built G1, as after a data preparation."""
    prepare_registry.put("g1", pd.DataFrame({"date": ["2025-01-01"]}),
                         {"id": "g1", "rows": 1})
    yield


def ids(p): return [s.id for s in p.steps]
def reasons(p): return {s.id: s.reason for s in p.steps}


def test_a_prepared_server_runs_only_the_forecast(ready):
    ready({"arrivals"})
    p = steps.plan(["forecast"])
    assert ids(p) == ["forecast"] and p.stage_ids == ("forecast",)


def test_the_optimisation_brings_its_forecast(ready):
    ready(set())
    assert reasons(steps.plan(["optimise"])) == {"forecast": "needed", "optimise": "asked"}


def test_recommendations_bring_everything_they_need(ready):
    ready(set())
    assert ids(steps.plan(["recommend"])) == ["staff", "supply", "forecast", "optimise", "recommend"]


def test_rerunning_the_forecast_reruns_what_depends_on_it(ready):
    ready(set(READY_STEPS))
    assert reasons(steps.plan(["forecast"])) == {"forecast": "asked", "optimise": "rerun",
                                                 "recommend": "rerun"}


def test_rerunning_an_analysis_reruns_nothing_after_it(ready):
    ready(set(READY_STEPS))
    assert ids(steps.plan(["staff"])) == ["staff"]


def test_data_preparation_runs_only_when_the_data_changed(ready, monkeypatch):
    ready({"arrivals", "forecast"})
    monkeypatch.setattr(steps, "needs_preparation", lambda: True)
    p = steps.plan(["supply"])
    assert reasons(p) == {"prepare": "needed", "arrivals": "rerun", "supply": "asked",
                          "forecast": "rerun"}
    assert p.stage_ids[:4] == ("check", "transform", "operations", "consolidate")


def test_needs_preparation_follows_the_fingerprint(seeded_groups):
    job._STATE.prepared_fingerprint = preflight.inputs_fingerprint()
    assert steps.needs_preparation() is False
    job._STATE.prepared_fingerprint = "old"
    assert steps.needs_preparation() is True


def test_needs_preparation_when_the_groups_are_gone(seeded_groups):
    job._STATE.prepared_fingerprint = preflight.inputs_fingerprint()
    prepare_registry.clear("g1")
    assert steps.needs_preparation() is True


def test_needs_preparation_when_nothing_was_prepared(seeded_groups):
    assert job.prepared_fingerprint() is None and steps.needs_preparation() is True


def test_missing_files_refuse_a_plan_that_prepares(monkeypatch, ready):
    ready(set()); monkeypatch.setattr(steps, "needs_preparation", lambda: True)
    monkeypatch.setattr(preflight, "run_checks", lambda: {"ok": False, "issues": [
        {"level": "error", "file": "inventory_items.csv",
         "message": "Missing file. Upload it before running."}]})
    with pytest.raises(steps.Refused) as e:
        steps.plan(["forecast"])
    assert e.value.code == "files_missing" and "inventory_items.csv" in e.value.message
    assert e.value.missing[0]["file"] == "inventory_items.csv"


def test_a_plan_that_does_not_prepare_skips_the_files_check(monkeypatch, ready):
    ready({"forecast"})
    monkeypatch.setattr(preflight, "run_checks", lambda: pytest.fail("checked the files"))
    assert ids(steps.plan(["optimise"])) == ["optimise"]


def test_the_sample_is_refused_over_uploaded_data(monkeypatch):
    monkeypatch.setattr(sample, "refusal", lambda can_write, replace: (409, sample.REPLACE_UPLOADED))
    with pytest.raises(steps.Refused) as e:
        steps.plan(["sample"])
    assert e.value.code == "replace_uploaded" and "Data Hub" in e.value.message


def test_full_and_sample_cover_every_stage():
    every = tuple(sid for sid, _l, _f in stages.STAGES)
    assert steps.plan(["full"]).stage_ids == every
    assert steps.plan(["sample"]).stage_seconds[0][0] == "load"


def test_a_full_run_is_one_planned_step_with_the_total():
    p = steps.plan(["full"])
    assert [(s.id, s.reason) for s in p.steps] == [("full", "asked")]
    assert p.steps[0].seconds == p.total_seconds == sum(s for _i, s in p.stage_seconds)


def test_plans_are_refused_while_a_run_is_going(hold_in):
    with hold_in("forecast") as entered:
        job.start(plan=["forecast"])
        assert entered.wait(10)
        with pytest.raises(steps.Refused) as e:
            steps.plan(["staff"])
    assert e.value.code == "already_running"


@pytest.mark.parametrize("bad", [[], ["nope"], ["full", "forecast"]])
def test_unknown_or_mixed_steps_raise(bad):
    with pytest.raises(ValueError):
        steps.plan(bad)


@pytest.mark.parametrize("req,page", [(["forecast"], "forecast-total"), (["optimise"], "optimize"),
    (["arrivals", "staff"], "staff"), (["full"], "dashboard"), (["prepare"], "upload")])
def test_the_page_follows_the_last_asked_step(ready, req, page):
    ready(set(READY_STEPS))
    assert steps.plan(req).page == page


def test_the_public_view_lists_steps_and_stages(ready):
    ready({"arrivals"})
    assert steps.plan(["optimise"]).public() == {
        "kind": "steps", "page": "optimize", "total_seconds": 26,
        "steps": [{"id": "forecast", "label": "Prediction", "reason": "needed", "seconds": 20},
                  {"id": "optimise", "label": "Optimization", "reason": "asked", "seconds": 6}],
        "stages": [{"id": "forecast", "seconds": 20}, {"id": "optimise", "seconds": 6}]}


def test_estimates_use_the_defaults_on_a_fresh_server(ready):
    ready({"arrivals"})
    assert steps.plan(["forecast"]).total_seconds == 20


def test_estimates_follow_recorded_seconds_scaled_by_history(seeded):
    rows = len(registry.get_df("daily_arrival"))
    timings.record("forecast", 30.0, rows / 2)
    assert timings.estimate("forecast") == 60


def test_estimates_are_bounded_and_keyed_by_known_stages():
    timings.record("nope", 3.0, 1.0)
    assert "nope" not in timings._RECORDED and timings.estimate("nope") == 5
    timings.record("load", 5000.0, 1.0)
    assert timings.estimate("load") == 900
    timings.record("load", 0.0, 1.0)
    assert timings.estimate("load") == 1


def test_a_run_records_its_stage_seconds(stub_stages):
    job.start(plan=["forecast"]); assert job.wait(10)
    assert "forecast" in timings._RECORDED


def test_a_failed_stage_is_never_recorded(stub_stages, fail_in):
    with fail_in("forecast"):
        job.start(plan=["forecast"]); assert job.wait(10)
    assert "forecast" not in timings._RECORDED


def test_a_plan_goes_stale_when_data_or_readiness_changes(ready):
    ready({"arrivals"}); p = steps.plan(["forecast"])
    assert steps.still_valid(p)
    job._STATE.ready = {"arrivals", "staff"}
    assert not steps.still_valid(p)
    job._STATE.ready = {"arrivals"}
    data_version.invalidate_all()
    assert not steps.still_valid(p)


def test_start_runs_the_planned_stages_through_the_job(ready, stub_stages):
    ready(set(READY_STEPS))
    steps.start(steps.plan(["forecast"])); assert job.wait(10)
    assert [s["id"] for s in job.status()["stages"]] == ["forecast", "optimise", "recommend"]


def test_a_stale_plan_starts_nothing(ready, stub_stages):
    ready({"arrivals"}); p = steps.plan(["forecast"])
    job._STATE.ready = set()
    with pytest.raises(steps.Refused) as e:
        steps.start(p)
    assert e.value.code == "proposal_stale" and e.value.message == steps.STALE
    assert job.is_running() is False and job.status()["started_at"] is None


def test_the_sample_run_loads_first_and_records_the_load(stub_stages, monkeypatch):
    loaded = []
    monkeypatch.setattr(sample, "load", lambda: loaded.append(1))
    steps.start(steps.plan(["sample"])); assert job.wait(10)
    s = job.status()
    assert loaded == [1] and s["run_source"] == "sample"
    assert s["ready_steps"] == list(READY_STEPS) and "load" in timings._RECORDED


def test_the_sample_is_checked_again_at_start(stub_stages, monkeypatch):
    p = steps.plan(["sample"])
    monkeypatch.setattr(sample, "refusal", lambda can_write, replace: (409, sample.REPLACE_UPLOADED))
    with pytest.raises(steps.Refused) as e:
        steps.start(p)
    assert e.value.code == "replace_uploaded" and job.is_running() is False
