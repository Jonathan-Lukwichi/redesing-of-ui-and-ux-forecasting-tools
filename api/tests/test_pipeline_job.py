"""The pipeline job (Task 9): one background thread running stages 0 to 3.

Runs use a real thread; tests wait on job.wait() rather than sleeping.
"""
import dataclasses
import threading

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from core import auth, joins, prepare_registry, registry, security, simulation_data
from core.pipeline import consolidate, job, stages, staging
from core.transform.month import transform_month
from tests import pipeline_fixtures as fx
from tests.fixtures.register_workbook import build_register

GROUPS = ("g1", "g2", "g3", "g4", "ops_daily")
PURE_IDS = ("daily_arrival", "hourly_arrival", "clinical_daily", "clinical_hourly")
OPS_DAILY_COLUMNS = ["date", "total_daily_arrivals", "required_nurses", "staffed_nurses",
                     "locum_hours", "consumption_units", "stockout_units", "stock_value_zar"]
PASSWORD = "a-long-enough-test-password"


@pytest.fixture(autouse=True)
def isolated(monkeypatch):
    saved_slots = {sid: registry.get(sid) for sid in fx.slot_ids()}
    saved_groups = {g: prepare_registry.get(g) for g in GROUPS}
    saved_uploaded = dict(simulation_data._UPLOADED)
    saved_meta = dict(simulation_data._META)
    monkeypatch.setattr(job, "_STATE", job._State())
    # Never reach a real AI provider: the recommend stage then ends amber.
    from ai import config as ai_config
    monkeypatch.setattr(ai_config, "configured", lambda: False)
    fx.reset()
    fx.seed_all()
    for g in GROUPS:
        prepare_registry.clear(g)
    yield
    assert job.wait(60), "a test left the job running"
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


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "open")
    monkeypatch.setenv("DEMO_INSECURE", "1")
    import main
    return TestClient(main.app)


def _month(year, month, days=2):
    name = f"Casualty_Daily_Register_{year}_{month:02d}.xlsx"
    return transform_month(build_register(year, month, days=days), name)


def _hold(monkeypatch):
    """Replace the stages with one that blocks until released."""
    entered, release = threading.Event(), threading.Event()

    def hold():
        entered.set()
        release.wait(30)
        return stages.StageResult("held", [], "done")

    monkeypatch.setattr(stages, "STAGES", [("hold", "Hold", hold)])
    return entered, release


def _statuses():
    return [s["status"] for s in job.status()["stages"]]


def _run():
    job.start()
    assert job.wait(120)
    return job.status()


def test_run_completes_stages_in_order():
    before = job.status()
    assert before["source"] == {"mode": "default"}
    assert [s["status"] for s in before["stages"]] == ["pending"] * 8

    s = _run()
    assert [st["id"] for st in s["stages"]] == ["check", "transform", "operations",
                                               "consolidate", "analyse", "forecast",
                                               "optimise", "recommend"]
    # Forecast is amber: the seed clinical file lacks three optional specialties.
    assert _statuses() == ["done", "skipped", "done", "done", "done", "amber", "done", "amber"]
    assert s["running"] is False and s["started_at"] and s["finished_at"]
    assert s["source"]["mode"] == "uploaded" and s["source"]["run"] == 1
    assert s["source"]["finished_at"] == s["finished_at"]
    assert s["origin"] == "simulated"
    for st in s["stages"]:
        assert st["seconds"] >= 0 and isinstance(st["receipt"], str) and st["receipt"]
    assert _run()["source"]["run"] == 2


def test_second_start_while_running_is_busy(client, monkeypatch):
    entered, release = _hold(monkeypatch)
    try:
        assert client.post("/api/pipeline/run").status_code == 200
        assert entered.wait(10)
        r = client.post("/api/pipeline/run")
        assert r.status_code == 409 and r.json()["error"] == "already_running"
        with pytest.raises(job.Busy):
            job.start()
        assert job.is_running()
        import core.pipeline
        assert core.pipeline.is_running()
    finally:
        release.set()
    assert job.wait(10) and not job.is_running()


def test_failed_stage_stops_and_marks_rest_skipped(monkeypatch):
    called = []

    def ok():
        called.append("ok")
        return stages.StageResult("fine", ["a warning"], "done")

    def fail():
        called.append("fail")
        raise stages.StageFailed("The files do not agree.")

    def never():
        called.append("never")
        return stages.StageResult("unreachable", [], "done")

    monkeypatch.setattr(stages, "STAGES", [("a", "A", ok), ("b", "B", fail),
                                           ("c", "C", never)])
    s = _run()
    assert called == ["ok", "fail"]
    assert _statuses() == ["done", "failed", "skipped"]
    assert s["stages"][1]["receipt"] == "The files do not agree."
    assert s["stages"][0]["warnings"] == ["a warning"]
    assert s["running"] is False and s["finished_at"]
    assert s["source"] == {"mode": "default"}


def test_unexpected_error_fails_the_stage_without_its_text(monkeypatch):
    def boom():
        raise RuntimeError("ZZFAKENAME in a cell")

    monkeypatch.setattr(stages, "STAGES", [("a", "Alpha", boom)])
    s = _run()
    assert _statuses() == ["failed"]
    assert "ZZFAKENAME" not in s["stages"][0]["receipt"]
    assert "Alpha" in s["stages"][0]["receipt"]


def test_upload_refused_if_a_run_starts_while_it_transforms(client, monkeypatch):
    import core.pipeline
    answers = iter([False, True])          # idle at the door, busy by staging time
    monkeypatch.setattr(core.pipeline, "is_running", lambda: next(answers))
    name = "Casualty_Daily_Register_2024_03.xlsx"
    r = client.post(f"/api/pipeline/registers?filename={name}",
                    content=build_register(2024, 3, days=2))
    assert r.status_code == 409
    assert staging.months() == []


def test_failed_run_leaves_results_cleared(client, monkeypatch):
    from routers import forecast
    from core import optimization_engine as engine

    def fail():
        raise stages.StageFailed("stop")

    forecast._LAST_RUN = {"stale": True}
    engine._LAST["staff"] = {"stale": True}
    version = job.status()["data_version"]
    monkeypatch.setattr(stages, "STAGES", [("check", "Check", stages.check),
                                           ("x", "X", fail)])
    s = _run()
    assert _statuses() == ["done", "failed"]
    assert s["data_version"] == version + 1
    assert client.get("/api/forecast/last").json() == {"available": False}
    assert client.get("/api/optimization/last").json()["status"] == "no_solution_yet"


TUNED = {"params_by_item": {"X": {"s_mult": 1.0, "q_mult": 1.0}},
         "tuned_at": "2026-01-01T00:00:00"}


@pytest.fixture()
def old_results(monkeypatch):
    """Results from an earlier run, standing in the /last caches, the stored
    Action Center list and the tuned reorder settings."""
    from ai import actions
    from core import optimization_engine as engine
    from routers import forecast

    monkeypatch.setattr(forecast, "_LAST_RUN", {"kind": "total", "ran_at": "earlier",
                                                "data_version": 0, "result": {"old": True}})
    monkeypatch.setattr(engine, "_LAST", dict(engine._LAST, staff={"old": True}))
    monkeypatch.setattr(engine, "_POLICY_STATE", dict(engine._POLICY_STATE))
    engine.set_policy("s_q", tuned=TUNED)
    monkeypatch.setattr(actions, "_STORED", {"actions": [{"title": "Old"}], "built_at": "x"})
    return engine


def test_failed_check_keeps_results_and_tuned_settings(client, old_results):
    from ai import actions
    engine = old_results
    version = job.status()["data_version"]
    registry.clear("calendar")
    s = _run()
    assert _statuses() == ["failed"] + ["skipped"] * 7
    assert s["data_version"] == version
    last = client.get("/api/forecast/last").json()
    assert last["available"] is True and last["result"] == {"old": True}
    assert client.get("/api/optimization/last").json()["staff"] == {"old": True}
    assert engine.get_policy_state()["params_by_item"] == TUNED["params_by_item"]
    assert actions.stored()["actions"] == [{"title": "Old"}]


def test_passing_check_clears_then_rebuilds_results(client, old_results):
    from ai import actions
    engine = old_results
    version = job.status()["data_version"]
    s = _run()
    assert _statuses() == ["done", "skipped", "done", "done", "done", "amber", "done", "amber"]
    assert s["data_version"] == version + 1
    last = client.get("/api/forecast/last").json()
    assert last["available"] is True and last["kind"] == "total"
    assert last["result"] != {"old": True} and last["data_version"] == version + 1
    plan = client.get("/api/optimization/last").json()
    assert plan["staff"] != {"old": True} and plan["supply"]
    state = engine.get_policy_state()
    assert state["policy"] == "s_q" and state["params_by_item"] is None
    assert stages.POLICY_NOTICE in s["stages"][6]["warnings"]
    assert actions.stored() is None   # no AI key here: nothing rebuilt it


def test_results_that_cannot_be_cleared_stop_the_run_after_check(monkeypatch):
    from core import data_version
    called = []

    def boom():
        raise RuntimeError("a clearer broke")

    def never():
        called.append("never")
        return stages.StageResult("unreachable", [], "done")

    monkeypatch.setattr(data_version, "invalidate_all", boom)
    monkeypatch.setattr(stages, "STAGES", [("check", "Check", stages.check),
                                           ("x", "X", never), ("y", "Y", never)])
    s = _run()
    assert _statuses() == ["done", "failed", "skipped"] and called == []
    assert s["stages"][1]["receipt"] == job.CLEAR_FAILED


def _seed_old_groups():
    for g in GROUPS:
        prepare_registry.put(g, pd.DataFrame({"date": ["2020-01-01"]}), {"id": g, "rows": 1})


def _no_groups_left():
    return all(prepare_registry.get(g) is None for g in GROUPS)


def test_consolidate_failing_on_g3_leaves_no_group(monkeypatch):
    from fastapi import HTTPException
    import routers.prepare as prep
    real = prep.build

    async def fail_on_g3(req, _user=None):
        if req.group == "g3":
            raise HTTPException(400, {"error": "missing_sources", "group": "g3",
                                      "missing": ["clinical_daily"],
                                      "message": "Cannot build G3: missing."})
        return await real(req)

    _seed_old_groups()
    monkeypatch.setattr(prep, "build", fail_on_g3)
    s = _run()
    assert _statuses() == ["done", "skipped", "done", "failed", "skipped", "skipped",
                           "skipped", "skipped"]
    assert s["stages"][3]["receipt"] == "Cannot build G3: missing."
    assert _no_groups_left()


def test_operations_failing_after_transform_leaves_no_group(monkeypatch):
    from core import ops_derive

    def bad(*_a, **_k):
        raise ValueError("staffing_daily: dates must be written YYYY-MM-DD.")

    _seed_old_groups()
    staging.put(_month(2024, 3))
    monkeypatch.setattr(ops_derive, "derive", bad)
    s = _run()
    assert _statuses() == ["done", "done", "failed"] + ["skipped"] * 5
    assert registry.get_metadata("daily_arrival")["filename"] == "transformed"
    assert _no_groups_left()


def test_check_failure_keeps_previously_built_groups():
    _seed_old_groups()
    registry.clear("calendar")
    _run()
    assert _statuses() == ["failed"] + ["skipped"] * 7
    assert all(prepare_registry.get(g) is not None for g in GROUPS)


def test_status_survives_a_new_client(client, monkeypatch):
    entered, release = _hold(monkeypatch)
    try:
        client.post("/api/pipeline/run")
        assert entered.wait(10)
        import main
        body = TestClient(main.app).get("/api/pipeline/status").json()
        assert body["running"] is True and body["started_at"]
        assert body["stages"][0]["status"] == "running"
    finally:
        release.set()
    assert job.wait(10)
    body = TestClient(main.app).get("/api/pipeline/status").json()
    assert body["running"] is False and body["stages"][0]["status"] == "done"


def test_transform_stage_skipped_when_no_months():
    r = stages.transform()
    assert r.status == "skipped"
    assert registry.get_metadata("daily_arrival")["filename"] != "transformed"


def test_transform_stage_overlays_staged_months():
    month = _month(2024, 3)
    staging.put(month)
    assert staging.unapplied() == ["2024-03"]
    r = stages.transform()
    assert r.status == "done"
    assert r.receipt == (f"1 month, {month.receipt['arrivals']:,} arrivals, "
                         "no patient identifiers kept")
    for sid in PURE_IDS:
        assert registry.get_metadata(sid)["filename"] == "transformed"
    dates = set(registry.get_df("daily_arrival")["date"].astype(str))
    assert "2024-03-01" in dates and "2025-06-01" in dates   # overlaid, history kept
    assert staging.unapplied() == []
    assert any("repeated across" in w for w in r.warnings)
    assert not any("April 2023" in w for w in r.warnings)


def test_transform_warns_about_zero_breakdowns_before_april_2023():
    staging.put(_month(2023, 2))
    r = stages.transform()
    assert any("April 2023" in w for w in r.warnings)


def test_no_arrivals_after_transform_stops_the_run():
    for sid in PURE_IDS:
        registry.clear(sid)
    month = _month(2025, 1)
    staging.put(dataclasses.replace(
        month,
        daily=month.daily.assign(patient_count=0, arrival_normal_hours=0,
                                 arrival_after_hours=0),
        hourly=month.hourly.assign(arrival_count=0)))
    s = _run()
    assert _statuses() == ["done", "failed"] + ["skipped"] * 6
    assert "arrivals" in s["stages"][1]["receipt"]
    assert registry.get_df("daily_arrival") is None
    assert staging.unapplied() == ["2025-01"]


def test_groups_built_sequentially(monkeypatch):
    import routers.prepare as prep
    real = prep.build
    calls, active, overlap = [], [0], []

    async def spy(req, _user=None):
        active[0] += 1
        overlap.append(active[0])
        calls.append(req.group)
        try:
            return await real(req)
        finally:
            active[0] -= 1

    monkeypatch.setattr(prep, "build", spy)
    s = _run()
    assert _statuses() == ["done", "skipped", "done", "done", "done", "amber", "done", "amber"]
    assert calls == ["g1", "g2", "g3", "g4"] and max(overlap) == 1
    for g in GROUPS:
        assert prepare_registry.get_df(g) is not None, g
    receipt = s["stages"][3]["receipt"]
    for g in ("G1", "G2", "G3", "G4"):
        assert g in receipt


def _ops_inputs():
    g1, _ = joins.BUILDERS["g1"](*(registry.get_df(d)
                                   for d in joins.get_group("g1").required_datasets))
    return (g1, registry.get_df("staffing_daily"), registry.get_df("inventory_movements"),
            registry.get_df("inventory_items"))


def test_ops_daily_columns():
    g1, staffing, moves, items = _ops_inputs()
    df = consolidate.build_ops_daily(g1, staffing, moves, items)
    assert list(df.columns) == OPS_DAILY_COLUMNS
    assert len(df) == 396

    day = "2025-03-10"
    row = df[df["date"] == day].iloc[0]
    mv = moves[moves["date"].astype(str) == day]
    price = items.set_index("item_id")["unit_price_zar"].astype("float64")
    value = (mv["recorded_stock_on_hand_units"].astype("float64")
             * mv["item_id"].map(price)).sum()
    st = staffing[staffing["date"].astype(str) == day].iloc[0]
    assert row["consumption_units"] == pytest.approx(
        mv["daily_consumption_units"].astype("float64").sum())
    assert row["stockout_units"] == pytest.approx(
        mv["stockout_today_units"].astype("float64").sum())
    assert row["stock_value_zar"] == pytest.approx(value)
    assert row["required_nurses"] == st["total_required_nurses"]
    assert row["staffed_nurses"] == st["total_staffed_nurses"]
    assert row["locum_hours"] == pytest.approx(float(st["total_locum_hours"]))
    g1_row = g1[g1["date"] == day].iloc[0]
    assert row["total_daily_arrivals"] == g1_row["total_daily_arrivals"]


def test_ops_daily_covers_only_shared_dates():
    g1, staffing, moves, items = _ops_inputs()
    g1 = g1.iloc[:100]
    last_dates = sorted(set(moves["date"].astype(str)))[-300:]
    moves = moves[moves["date"].astype(str).isin(last_dates)]
    df = consolidate.build_ops_daily(g1, staffing, moves, items)
    expected = sorted(set(g1["date"].astype(str)) & set(last_dates))
    assert list(df["date"]) == expected and len(expected) > 0


def test_run_requires_data_write(monkeypatch):
    h = auth.hash_password(PASSWORD)
    monkeypatch.setenv("AUTH_USERS", f"adm:admin:{h};viv:viewer:{h}")
    monkeypatch.setenv("AUTH_SECRET", "test-secret-not-a-real-one")
    monkeypatch.setenv("AUTH_MODE", "protected")
    monkeypatch.delenv("DEMO_INSECURE", raising=False)
    for limiter in security.LIMITS.values():
        limiter._hits.clear()
    import main
    c = TestClient(main.app, base_url="https://testserver")
    assert c.post("/api/pipeline/run").status_code == 401
    r = c.post("/api/auth/login", json={"username": "viv", "password": PASSWORD})
    assert r.status_code == 200, r.text
    assert c.post("/api/pipeline/run").status_code == 403
    assert not job.is_running() and job.status()["started_at"] is None


def test_peak_memory_recorded_per_stage():
    s = _run()
    peaks = [st["peak_mb"] for st in s["stages"]]
    assert all(p is not None and p > 0 for p in peaks)
    assert peaks == sorted(peaks)          # a process high-water mark only rises
    assert job.peak_mb() >= peaks[-1] - 0.05   # stage figures are rounded to 0.1
