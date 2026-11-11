"""Task 2: readiness per step, and runs of a stage plan, in the pipeline job.

The stages are stubs under their real ids (pipeline_fixtures.stub_stages), so
these tests are about the job's bookkeeping, not what the stages compute.
"""
import pytest

from core import data_version, registry
from core.pipeline import READY_STEPS, job, preflight
from tests.pipeline_fixtures import fail_in, hold_in, seeded, stub_stages  # noqa: F401


@pytest.fixture(autouse=True)
def fresh_job(monkeypatch):
    monkeypatch.setattr(job, "_STATE", job._State())
    yield
    assert job.wait(30), "a test left the job running"


def _run(plan=None):
    job.start(plan=plan)
    assert job.wait(10)
    return job.status()


def test_a_full_run_makes_every_step_ready(stub_stages):
    s = _run()
    assert s["ready_steps"] == list(READY_STEPS) and s["results_ready"] is True


def test_a_subset_run_marks_only_its_steps(stub_stages):
    job._STATE.ready = {"arrivals"}
    s = _run(plan=["forecast", "optimise"])
    assert s["ready_steps"] == ["arrivals", "forecast", "optimise"]


def test_a_subset_run_hides_only_what_it_reproduces(stub_stages, hold_in):
    job._STATE.ready = set(READY_STEPS)
    with hold_in("forecast"):
        job.start(plan=["forecast", "optimise", "recommend"])
        assert job.status()["ready_steps"] == ["arrivals", "staff", "supply"]
        assert job.step_ready("forecast") is False and job.step_ready("staff") is True
    assert job.wait(10) and job.status()["ready_steps"] == list(READY_STEPS)


def test_a_subset_run_clears_only_the_caches_it_owns(stub_stages, monkeypatch):
    seen = []
    monkeypatch.setattr(data_version, "invalidate", lambda names: seen.append(tuple(names)) or 0)
    monkeypatch.setattr(data_version, "invalidate_all", lambda: pytest.fail("wiped everything"))
    _run(plan=["forecast"])
    assert seen == [("forecast", "optimization")]


def test_an_analysis_only_run_clears_no_cache(stub_stages):
    before = data_version.current()
    _run(plan=["analyse_staff"])
    assert data_version.current() == before


def test_a_plan_with_data_preparation_wipes_everything(stub_stages, monkeypatch):
    job._STATE.ready = set(READY_STEPS)
    wiped = []
    monkeypatch.setattr(data_version, "invalidate_all", lambda: wiped.append(1) or 0)
    s = _run(plan=["check", "transform", "operations", "consolidate", "analyse_arrivals"])
    assert wiped == [1] and s["ready_steps"] == ["arrivals"]


def test_a_failed_step_stays_unready_and_others_survive(stub_stages, fail_in):
    job._STATE.ready = {"arrivals", "forecast"}
    with fail_in("forecast"):
        s = _run(plan=["forecast"])
    assert s["ready_steps"] == ["arrivals"]


def test_on_finish_gets_the_final_status_once(stub_stages):
    got = []
    job.start(plan=["forecast"], on_finish=got.append)
    assert job.wait(10)
    assert len(got) == 1 and got[0]["running"] is False


def test_an_on_finish_error_never_breaks_the_job(stub_stages):
    job.start(plan=["forecast"], on_finish=lambda s: 1 / 0)
    assert job.wait(10) and job.status()["ready_steps"] == ["forecast"]


def test_an_unknown_stage_is_refused_before_starting(stub_stages):
    with pytest.raises(ValueError):
        job.start(plan=["forecast", "nope"])
    assert job.is_running() is False


def test_a_partial_run_keeps_where_the_results_came_from(stub_stages):
    job.start(source="sample")
    assert job.wait(10)
    mode = job.status()["source"]["mode"]
    _run(plan=["forecast"])
    assert job.results_source() == "sample" and job.status()["source"]["mode"] == mode == "sample"


def test_a_partial_run_onto_no_results_takes_its_source(stub_stages):
    _run(plan=["forecast"])
    assert job.results_source() == "upload"


def test_a_wiping_plan_takes_the_new_source(stub_stages):
    job.start(source="sample")
    assert job.wait(10)
    s = _run(plan=["check", "transform", "operations", "consolidate", "analyse_arrivals"])
    assert job.results_source() == "upload" and s["source"]["mode"] == "uploaded"


def test_consolidate_records_the_inputs_fingerprint(stub_stages):
    _run(plan=["check", "transform", "operations", "consolidate"])
    assert job.prepared_fingerprint() == preflight.inputs_fingerprint()


def test_the_fingerprint_changes_when_a_file_changes(seeded):
    a = preflight.inputs_fingerprint()
    e = registry.get("calendar")
    registry.put("calendar", e.df, {**e.metadata, "signature_hash": "sha256:other"})
    assert preflight.inputs_fingerprint() != a
