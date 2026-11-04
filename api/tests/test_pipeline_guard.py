"""While a pipeline run is in progress, nothing else may change the data or
fit models: every data-changing and heavy compute route answers 409 with the
body the pipeline's own Run uses when busy.

The run is real (a job thread held inside one stage), not a patched flag.
"""
import threading

import pytest
from fastapi.testclient import TestClient

from core import optimization_engine as engine, prepare_registry, registry, security
from core.pipeline import job, stages

BUSY = {"error": "already_running",
        "message": "A pipeline run is in progress. Wait for it to finish."}


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "open")
    monkeypatch.setenv("DEMO_INSECURE", "1")
    for limiter in security.LIMITS.values():
        limiter._hits.clear()
    import main
    return TestClient(main.app)


@pytest.fixture()
def running(monkeypatch):
    """A run held inside its only stage until the test ends."""
    entered, release = threading.Event(), threading.Event()

    def hold():
        entered.set()
        release.wait(30)
        return stages.StageResult("held", [], "done")

    monkeypatch.setattr(job, "_STATE", job._State())
    monkeypatch.setattr(stages, "STAGES", [("hold", "Hold", hold)])
    # The hold plan has no Check stage, so the run forgets results before it:
    # nothing a test seeds may depend on surviving it.
    job.start()
    assert entered.wait(10)
    yield
    release.set()
    assert job.wait(10)


def test_dataset_upload_during_a_run_is_refused(client, running):
    before = registry.get("calendar")
    r = client.post("/api/datasets/calendar/upload",
                    files={"file": ("calendar.csv", b"date\n2025-01-01\n", "text/csv")})
    assert r.status_code == 409 and r.json() == BUSY
    assert registry.get("calendar") is before


def test_prepare_build_during_a_run_is_refused(client, running):
    before = prepare_registry.get("g1")
    r = client.post("/api/prepare/build", json={"group": "g1"})
    assert r.status_code == 409 and r.json() == BUSY
    assert prepare_registry.get("g1") is before


def test_policy_put_during_a_run_is_refused(client, running):
    before = engine.get_policy_state()
    other = next(p for p in engine.DEPLOYABLE_POLICIES if p != before["policy"])
    r = client.put("/api/optimization/policy", json={"policy": other})
    assert r.status_code == 409 and r.json() == BUSY
    assert engine.get_policy_state() == before


@pytest.mark.parametrize("method,path,body", [
    ("DELETE", "/api/datasets", None),
    ("POST", "/api/datasets/calendar/fetch", None),
    ("DELETE", "/api/datasets/calendar", None),
    ("DELETE", "/api/prepare/g1", None),
    ("DELETE", "/api/prepare", None),
    ("POST", "/api/optimization/policy/tune", {"policy": "dynamic"}),
    ("POST", "/api/forecast/run", {}),
    ("POST", "/api/forecast/specialty", {"specialty": "Medicine"}),
    ("POST", "/api/optimization/run", {}),
    ("POST", "/api/optimization/staff", {}),
    ("POST", "/api/optimization/supply", {}),
])
def test_every_guarded_route_is_refused_during_a_run(client, running, method, path, body):
    r = client.request(method, path, json=body)
    assert r.status_code == 409, (path, r.status_code, r.text)
    assert r.json() == BUSY


def test_pipeline_run_and_guards_share_one_body(client, running):
    r = client.post("/api/pipeline/run")
    assert r.status_code == 409 and r.json() == BUSY


def test_guarded_routes_work_when_idle(client, monkeypatch):
    monkeypatch.setattr(engine, "_POLICY_STATE", dict(engine._POLICY_STATE))
    assert not job.is_running()
    r = client.put("/api/optimization/policy", json={"policy": engine.get_policy_state()["policy"]})
    assert r.status_code == 200
