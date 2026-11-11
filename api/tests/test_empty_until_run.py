"""Empty until run: before a pipeline run has finished in this server process,
nothing serves or computes a result. Readiness lives in the pipeline job, a
guard refuses the result routes, the assistant has no numbers to quote, the
startup fetch is gone, and the sample button loads the stored data and runs
the same pipeline.

Results are made "not ready" per test by giving the job a fresh state; the
conftest marks every other test ready, because they describe the app after a
run.
"""
import threading

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from core import auth, data_source, registry, security
from core.pipeline import job, sample, stages, staging
from tests import pipeline_fixtures as fx

NO_RESULTS = {"error": "no_results",
              "message": ("No results yet. Upload your data on the Data Hub and run the "
                          "pipeline, or use the sample data.")}
PASSWORD = "a-long-enough-test-password"


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """Nothing here may reach GitHub: the simulation loader falls back to the
    bundled files, and the sample tests install their own fake fetch."""
    async def refuse(filename):
        raise data_source.FetchError("offline in tests", http_status=503)
    monkeypatch.setattr(data_source, "fetch_raw", refuse)


@pytest.fixture()
def not_ready(monkeypatch):
    monkeypatch.setattr(job, "_STATE", job._State())


@pytest.fixture()
def open_client(monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "open")
    monkeypatch.setenv("DEMO_INSECURE", "1")
    for limiter in security.LIMITS.values():
        limiter._hits.clear()
    import main
    return TestClient(main.app)


def _protected(monkeypatch):
    h = auth.hash_password(PASSWORD)
    monkeypatch.setenv("AUTH_USERS", f"adm:admin:{h};viv:viewer:{h}")
    monkeypatch.setenv("AUTH_SECRET", "test-secret-not-a-real-one")
    monkeypatch.setenv("AUTH_MODE", "protected")
    monkeypatch.delenv("DEMO_INSECURE", raising=False)
    for limiter in security.LIMITS.values():
        limiter._hits.clear()
    import main
    return TestClient(main.app, base_url="https://testserver")


def _login(c, username):
    r = c.post("/api/auth/login", json={"username": username, "password": PASSWORD})
    assert r.status_code == 200, r.text


def _ok():
    return stages.StageResult("fine", [], "done")


def _run(source="upload"):
    job.start(source=source)
    assert job.wait(120)
    return job.status()


# --- Readiness in the job ---------------------------------------------------

def test_status_before_any_run_says_not_ready(not_ready):
    s = job.status()
    assert s["results_ready"] is False
    assert s["results_source"] is None and s["run_source"] is None
    assert s["source"] == {"mode": "none"}
    assert job.results_available() is False


def test_a_finished_run_makes_results_ready(not_ready, monkeypatch):
    monkeypatch.setattr(stages, "STAGES", [("check", "Check", _ok), ("optimise", "Optimise", _ok)])
    s = _run()
    assert s["results_ready"] is True and job.results_available() is True
    assert s["results_source"] == "upload" and s["run_source"] == "upload"
    assert s["source"]["mode"] == "uploaded" and s["source"]["run"] == 1


def test_results_are_ready_only_once_the_run_has_finished(not_ready, monkeypatch):
    """Recommend reads the results (the guard lets it), but the pages wait."""
    entered, release = threading.Event(), threading.Event()

    def hold():
        entered.set()
        release.wait(30)
        return _ok()

    monkeypatch.setattr(stages, "STAGES", [("check", "Check", _ok), ("optimise", "Optimise", _ok),
                                           ("recommend", "Recommend", hold)])
    job.start()
    try:
        assert entered.wait(10)
        assert job.results_available() is True
        assert job.status()["results_ready"] is False
    finally:
        release.set()
    assert job.wait(10)
    assert job.status()["results_ready"] is True


def test_a_run_that_clears_results_and_fails_is_not_ready(not_ready, monkeypatch):
    monkeypatch.setattr(stages, "STAGES", [("check", "Check", _ok), ("optimise", "Optimise", _ok)])
    _run()

    def fail():
        raise stages.StageFailed("stop")

    monkeypatch.setattr(stages, "STAGES", [("check", "Check", _ok), ("x", "X", fail)])
    s = _run()
    assert s["results_ready"] is False and s["results_source"] is None
    assert s["source"] == {"mode": "none"}


def test_a_run_refused_at_check_keeps_the_earlier_results_ready(not_ready, monkeypatch):
    monkeypatch.setattr(stages, "STAGES", [("check", "Check", _ok), ("optimise", "Optimise", _ok)])
    _run(source="sample")

    def refuse():
        raise stages.StageFailed("The files are not ready.")

    monkeypatch.setattr(stages, "STAGES", [("check", "Check", refuse)])
    s = _run()
    assert s["results_ready"] is True and s["results_source"] == "sample"
    assert s["run_source"] == "upload"


def test_status_route_exposes_readiness(open_client, not_ready):
    body = open_client.get("/api/pipeline/status").json()
    assert body["results_ready"] is False and body["run_source"] is None


# --- The guard --------------------------------------------------------------

GUARDED = [
    ("POST", "/api/forecast", {"history": []}),
    ("POST", "/api/forecast/run", {}),
    ("POST", "/api/forecast/specialty", {"specialty": "Medicine"}),
    ("GET", "/api/forecast/engines", None),
    ("POST", "/api/forecast/validate", {}),
    ("GET", "/api/forecast/demo", None),
    ("POST", "/api/task1/forecast", {}),
    ("POST", "/api/task2/forecast", {}),
    ("GET", "/api/staff/overview", None),
    ("GET", "/api/staff/strategy-compare-demo", None),
    ("GET", "/api/supply/overview", None),
    ("GET", "/api/supply/item/A01", None),
    ("POST", "/api/supply/compare", {}),
    ("POST", "/api/supply/sweep", {}),
    ("GET", "/api/supply/compare-demo", None),
    ("GET", "/api/supply/sweep-demo", None),
    ("POST", "/api/optimization/staff", {}),
    ("POST", "/api/optimization/supply", {}),
    ("POST", "/api/optimization/run", {}),
    ("POST", "/api/optimization/compare", {}),
    ("POST", "/api/optimization/policy/tune", {"policy": "dynamic"}),
    ("GET", "/api/optimization/forecast-options", None),
    ("GET", "/api/optimization/staff-pool", None),
    ("GET", "/api/explore/findings", None),
    ("GET", "/api/explore/metrics", None),
    ("GET", "/api/explore/sections/patient_arrivals_band", None),
    ("GET", "/api/explore/missingness", None),
    ("GET", "/api/explore/task1/stl", None),
    ("GET", "/api/explore/impact_matrix", None),
    ("GET", "/api/explore/index", None),
    ("POST", "/api/reports/email", {}),
]


@pytest.mark.parametrize("method,path,body", GUARDED)
def test_result_routes_are_refused_before_a_run(open_client, not_ready, method, path, body):
    r = open_client.request(method, path, json=body)
    assert r.status_code == 409, (path, r.status_code, r.text[:200])
    assert r.json() == NO_RESULTS


UNGUARDED = [
    "/api/forecast/last", "/api/forecast/specialty/last?specialty=Medicine",
    "/api/forecast/validate/last", "/api/forecast/coverage",
    "/api/optimization/last", "/api/optimization/policy", "/api/optimization/policy/tune/last",
    "/api/staff/strategy-compare-last", "/api/supply/compare-last", "/api/supply/sweep-last",
    "/api/datasets/inventory", "/api/prepare/groups", "/api/pipeline/status",
    "/api/pipeline/staged", "/api/pipeline/preflight", "/api/task1/models",
]


@pytest.mark.parametrize("path", UNGUARDED)
def test_data_and_last_routes_still_answer_before_a_run(open_client, not_ready, path):
    r = open_client.get(path)
    assert r.status_code == 200, (path, r.status_code, r.text[:200])


def test_last_routes_say_nothing_is_available_before_a_run(open_client, not_ready):
    assert open_client.get("/api/forecast/last").json() == {"available": False}
    assert open_client.get("/api/optimization/last").json()["status"] == "no_solution_yet"


def test_result_routes_answer_once_results_are_ready(open_client, not_ready):
    job._STATE.results_ok = True
    assert open_client.get("/api/staff/overview").status_code == 200
    assert open_client.get("/api/supply/overview").status_code == 200
    assert open_client.get("/api/explore/findings/index").status_code == 200


def test_the_access_gate_answers_before_the_readiness_guard(monkeypatch, not_ready):
    c = _protected(monkeypatch)
    assert c.post("/api/optimization/run", json={}).status_code == 401
    _login(c, "viv")
    assert c.post("/api/optimization/run", json={}).status_code == 403


def test_a_busy_pipeline_is_reported_before_missing_results(open_client, monkeypatch):
    entered, release = threading.Event(), threading.Event()

    def hold():
        entered.set()
        release.wait(30)
        return _ok()

    monkeypatch.setattr(job, "_STATE", job._State())
    monkeypatch.setattr(stages, "STAGES", [("hold", "Hold", hold)])
    job.start()
    try:
        assert entered.wait(10)
        r = open_client.post("/api/optimization/run", json={})
        assert r.status_code == 409 and r.json() == security.PIPELINE_BUSY
    finally:
        release.set()
    assert job.wait(10)


def test_the_pipeline_still_calls_the_route_functions_directly(not_ready):
    """The guard sits on the HTTP route, not in the function the stages call."""
    import asyncio
    from routers import staff
    out = asyncio.run(staff.staff_strategy_compare_demo())
    assert out.get("strategies")


# --- No startup fetch -------------------------------------------------------

def test_startup_no_longer_fetches_hospital_data(monkeypatch):
    called = []

    async def spy(filename):
        called.append(filename)
        raise data_source.FetchError("no", http_status=503)

    monkeypatch.setattr(data_source, "fetch_raw", spy)
    before = set(registry.loaded_ids())
    import main
    with TestClient(main.app):
        pass
    assert called == []
    assert set(registry.loaded_ids()) == before


# --- The assistant before a run -----------------------------------------------

def test_action_center_does_not_call_the_ai_before_a_run(open_client, not_ready, monkeypatch):
    from ai import actions, config
    monkeypatch.setattr(config, "configured", lambda: True)
    monkeypatch.setattr(actions, "build_and_store",
                        lambda: pytest.fail("the AI was asked before any run"))
    body = open_client.get("/api/ai/actions").json()
    assert body["actions"] == [] and body["results_ready"] is False
    body = open_client.get("/api/ai/actions?refresh=1").json()
    assert body["actions"] == [] and body["results_ready"] is False


@pytest.mark.parametrize("name", ["get_forecast", "get_supply_status", "get_staff_status",
                                  "get_optimization", "get_explore_findings"])
def test_assistant_tools_have_no_numbers_before_a_run(not_ready, monkeypatch, name):
    from ai import tools
    monkeypatch.setattr(tools, "_get", lambda path: pytest.fail(f"{name} read {path}"))
    out = tools.execute(name, {})
    assert out.get("no_data") is True
    assert "Data Hub" in out["error"] and "sample data" in out["error"]
    assert not any(ch.isdigit() for ch in out["error"])


def test_teaching_cards_still_answer_before_a_run(not_ready):
    from ai import tools
    out = tools.execute("lookup_knowledge", {"query": "safety stock"})
    assert out.get("cards")


# --- The sample run -----------------------------------------------------------

FAILED_LOAD = "The sample data could not be loaded"


@pytest.fixture()
def repo(monkeypatch):
    """The data repo, faked from the seed frames: each source file's CSV by its
    file name. Registry and staging start empty and are emptied afterwards."""
    fx.reset()
    fx.seed_all()
    files = {}
    for sid in sample.SOURCE_IDS:
        hint = registry.get_metadata(sid)["filename"]
        files[hint] = registry.get_df(sid).to_csv(index=False).encode()
    fx.reset()
    fetched = []

    async def fake(filename):
        fetched.append(filename)
        return files[filename]

    monkeypatch.setattr(data_source, "fetch_raw", fake)
    monkeypatch.setattr(data_source, "get_config", lambda: data_source.DataSourceConfig(
        repo="owner/data", branch="main", subpath="", token="t"))
    monkeypatch.setattr(stages, "STAGES", [("check", "Check", stages.check),
                                           ("optimise", "Optimise", _ok)])
    yield fetched
    assert job.wait(60)
    fx.reset()


def test_sample_loads_the_stored_files_and_runs_the_pipeline(open_client, not_ready, repo):
    r = open_client.post("/api/pipeline/sample")
    assert r.status_code == 200, r.text
    assert r.json()["running"] is True and r.json()["run_source"] == "sample"
    assert job.wait(60)
    s = job.status()
    assert [st["status"] for st in s["stages"]] == ["done", "done"], s["stages"]
    assert s["results_ready"] is True and s["results_source"] == "sample"
    assert s["source"]["mode"] == "sample"
    assert sorted(repo) == sorted(registry.get_metadata(sid)["filename"]
                                  for sid in sample.SOURCE_IDS)
    for sid in (*sample.SOURCE_IDS, *sample.PACK_IDS):
        assert registry.get_df(sid) is not None, sid
        assert registry.get_metadata(sid)["provenance"] == "sample", sid
    # The pack is simulated, and says so.
    assert set(registry.get_df("staff_list")["data_origin"]) == {"simulated"}


def test_the_demo_pack_ships_inside_the_backend():
    for sid in sample.PACK_IDS:
        assert (sample.PACK_DIR / f"{sid}.csv").is_file(), sid
    assert sample.PACK_DIR.is_relative_to(sample.PACK_DIR.parents[1])   # under api/


def test_sample_is_refused_while_a_run_is_going(open_client, not_ready, repo, monkeypatch):
    entered, release = threading.Event(), threading.Event()

    def hold():
        entered.set()
        release.wait(30)
        return _ok()

    monkeypatch.setattr(stages, "STAGES", [("hold", "Hold", hold)])
    job.start()
    try:
        assert entered.wait(10)
        r = open_client.post("/api/pipeline/sample")
        assert r.status_code == 409 and r.json() == security.PIPELINE_BUSY
    finally:
        release.set()


def test_a_visitor_may_start_the_sample_on_an_empty_server(monkeypatch, not_ready, repo):
    c = _protected(monkeypatch)
    r = c.post("/api/pipeline/sample")
    assert r.status_code == 200, r.text
    assert job.wait(60) and job.status()["results_ready"] is True


def test_a_visitor_can_never_replace_uploaded_data(monkeypatch, not_ready, repo):
    fx.put("calendar", pd.DataFrame({"date": ["2025-01-01"], "is_weekend": [False],
                                     "is_public_holiday": [False]}))
    c = _protected(monkeypatch)
    for url in ("/api/pipeline/sample", "/api/pipeline/sample?replace=true"):
        r = c.post(url)
        assert r.status_code == 403, r.text
        assert r.json()["error"] == "uploaded_data"
        assert "upload" in r.json()["message"]
    assert not job.is_running() and repo == []
    assert registry.get_metadata("calendar").get("provenance") is None


def test_staged_registers_count_as_uploaded_data(monkeypatch, not_ready, repo):
    from core.transform.month import transform_month
    from tests.fixtures.register_workbook import build_register
    staging.put(transform_month(build_register(2024, 3, days=2),
                                "Casualty_Daily_Register_2024_03.xlsx"))
    c = _protected(monkeypatch)
    assert c.post("/api/pipeline/sample").status_code == 403
    assert staging.months()


def test_results_of_an_upload_run_are_protected_too(monkeypatch, repo):
    monkeypatch.setattr(job, "_STATE", job._State(results_ok=True, results_source="upload",
                                                  successful_runs=1))
    c = _protected(monkeypatch)
    assert c.post("/api/pipeline/sample").status_code == 403


def test_a_visitor_cannot_restart_the_sample_once_results_exist(monkeypatch, repo):
    monkeypatch.setattr(job, "_STATE", job._State(results_ok=True, results_source="sample",
                                                  successful_runs=1))
    c = _protected(monkeypatch)
    r = c.post("/api/pipeline/sample")
    assert r.status_code == 409 and r.json()["error"] == "results_exist"
    assert repo == []


def test_a_data_writer_is_asked_before_uploaded_data_is_replaced(monkeypatch, not_ready, repo):
    fx.put("calendar", pd.DataFrame({"date": ["2025-01-01"], "is_weekend": [False],
                                     "is_public_holiday": [False]}))
    c = _protected(monkeypatch)
    _login(c, "adm")
    r = c.post("/api/pipeline/sample")
    assert r.status_code == 409 and r.json()["error"] == "replace_uploaded"
    assert not job.is_running()
    r = c.post("/api/pipeline/sample?replace=true")
    assert r.status_code == 200, r.text
    assert job.wait(60)
    assert registry.get_metadata("calendar")["provenance"] == "sample"
    assert job.status()["results_ready"] is True


def test_sample_replaces_staged_registers_for_a_data_writer(open_client, not_ready, repo):
    from core.transform.month import transform_month
    from tests.fixtures.register_workbook import build_register
    staging.put(transform_month(build_register(2024, 3, days=2),
                                "Casualty_Daily_Register_2024_03.xlsx"))
    assert open_client.post("/api/pipeline/sample?replace=true").status_code == 200
    assert job.wait(60)
    assert staging.months() == []


@pytest.mark.parametrize("error,expect", [
    (data_source.FetchError("GitHub rejected the token (401). Generate a new one.", 401),
     "token"),
    (data_source.FetchError("GitHub forbids access (403).", 403), "token"),
    (data_source.FetchError("Could not download 'x' after retries. Last error: "
                            "ConnectError: [Errno 11001] getaddrinfo failed", 504),
     "could not be reached"),
    (RuntimeError("Traceback (most recent call last): ZZSECRET"), FAILED_LOAD),
])
def test_repo_failures_end_the_run_with_a_plain_message(open_client, not_ready, repo,
                                                         monkeypatch, error, expect):
    async def failing(filename):
        raise error

    monkeypatch.setattr(data_source, "fetch_raw", failing)
    assert open_client.post("/api/pipeline/sample").status_code == 200
    assert job.wait(60)
    s = job.status()
    first = s["stages"][0]
    assert first["status"] == "failed"
    assert expect in first["receipt"] and FAILED_LOAD in first["receipt"]
    for bad in ("Traceback", "ZZSECRET", "Errno", "getaddrinfo"):
        assert bad not in first["receipt"]
    assert [st["status"] for st in s["stages"][1:]] == ["skipped"]
    assert s["results_ready"] is False and not job.is_running()


def test_an_unconfigured_data_repo_is_refused_plainly(open_client, not_ready, monkeypatch):
    monkeypatch.setattr(data_source, "get_config", lambda: data_source.DataSourceConfig(
        repo="", branch="main", subpath="", token=""))
    r = open_client.post("/api/pipeline/sample")
    assert r.status_code == 503 and r.json()["error"] == "sample_unavailable"
    assert "sample data" in r.json()["message"]
    assert not job.is_running()
