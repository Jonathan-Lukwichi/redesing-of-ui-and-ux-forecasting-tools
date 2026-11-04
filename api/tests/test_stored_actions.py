"""Task 12: the Action Center list is built once per run and stored; the route
serves the stored list; tool provenance follows the data origin.

No test reaches a real AI provider: the generator is always monkeypatched.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from ai import actions, config, telemetry, tools
from core import action_store, data_version, simulation_data
from core.pipeline import stages

ITEMS = [
    {"title": "Order IV fluids", "reason": "Stock low", "category": "supply", "urgency": "high"},
    {"title": "Add a night nurse", "reason": "Short", "category": "staff", "urgency": "medium"},
]


def _generated(**kw):
    return {"actions": [dict(a, id=i) for i, a in enumerate(ITEMS)],
            "usage": {"in": 10, "out": 5}, "model": "test-model", **kw}


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    actions.clear_stored()
    monkeypatch.setenv("AUTH_MODE", "open")
    monkeypatch.setenv("DEMO_INSECURE", "1")
    monkeypatch.setattr(telemetry, "record", lambda *a, **k: {})
    monkeypatch.setattr("ai.audit.log_event", lambda *a, **k: None)
    yield
    actions.clear_stored()


@pytest.fixture()
def client():
    from core import security
    for limiter in security.LIMITS.values():   # many reads in one minute here
        limiter._hits.clear()
    import main
    return TestClient(main.app)


def _forbid_generate(monkeypatch):
    def boom():
        raise AssertionError("the AI generator must not run")
    monkeypatch.setattr(actions, "generate", boom)


def test_route_serves_the_stored_list_without_calling_ai(client, monkeypatch):
    monkeypatch.setattr(actions, "generate", _generated)
    actions.build_and_store()
    _forbid_generate(monkeypatch)
    monkeypatch.setattr(config, "configured", lambda: False)   # no AI needed to read
    r = client.get("/api/ai/actions")
    assert r.status_code == 200
    body = r.json()
    assert [a["title"] for a in body["actions"]] == [a["title"] for a in ITEMS]
    assert body["built_at"] and body["data_version"] == data_version.current()
    assert "usage" not in body and "model" not in body


def test_route_generates_only_when_nothing_is_stored(client, monkeypatch):
    calls = []
    monkeypatch.setattr(actions, "generate", lambda: calls.append(1) or _generated())
    monkeypatch.setattr(config, "configured", lambda: True)
    monkeypatch.setattr(telemetry, "over_budget", lambda: False)
    assert client.get("/api/ai/actions").status_code == 200
    assert client.get("/api/ai/actions").status_code == 200
    assert calls == [1]            # the second read came from the store
    assert actions.stored() is not None


def test_telemetry_and_audit_happen_once_per_generation(client, monkeypatch):
    recorded, audited = [], []
    monkeypatch.setattr(telemetry, "record", lambda *a, **k: recorded.append(a) or {})
    monkeypatch.setattr("ai.audit.log_event", lambda *a, **k: audited.append(a))
    monkeypatch.setattr(actions, "generate", _generated)
    actions.build_and_store()
    for _ in range(3):
        assert client.get("/api/ai/actions").status_code == 200
    assert len(recorded) == 1 and len(audited) == 1


def test_stored_list_still_gets_decisions_and_territory_filter(client, monkeypatch):
    monkeypatch.setattr(actions, "generate", _generated)
    actions.build_and_store()
    seen = {}

    def decorate(items):
        seen["called"] = True
        return [dict(a, status="approved") for a in items]

    monkeypatch.setattr(action_store, "apply_decisions", decorate)
    body = client.get("/api/ai/actions").json()
    assert seen["called"] and all(a["status"] == "approved" for a in body["actions"])
    # The stored copy itself stays undecorated.
    assert "status" not in actions.stored()["actions"][0]

    class Caller:
        action_categories = {"supply", "capacity"}

        def can(self, _scope):
            return False

    from routers import ai as ai_router
    monkeypatch.setattr(ai_router.security, "current_user", lambda _r: Caller())
    body = client.get("/api/ai/actions").json()
    assert [a["category"] for a in body["actions"]] == ["supply"]
    assert body["hidden_by_role"] == 1


def test_invalidate_clears_stored_actions(monkeypatch):
    monkeypatch.setattr(actions, "generate", _generated)
    actions.build_and_store()
    assert actions.stored() is not None
    data_version.invalidate_all()
    assert actions.stored() is None


def test_a_list_built_across_an_invalidation_is_not_stored(monkeypatch):
    def slow():
        data_version.invalidate_all()      # a new run starts mid-generation
        return _generated()
    monkeypatch.setattr(actions, "generate", slow)
    actions.build_and_store()
    assert actions.stored() is None


def test_no_ai_key_ends_amber_and_run_completes(monkeypatch):
    _forbid_generate(monkeypatch)
    monkeypatch.setattr(config, "configured", lambda: False)
    r = stages.recommend_stage()
    assert r.status == "amber" and r.receipt == "Recommendations need an AI key"


def test_ai_error_ends_amber(monkeypatch):
    def boom():
        raise RuntimeError("provider said: ZZSECRET")
    monkeypatch.setattr(actions, "generate", boom)
    monkeypatch.setattr(config, "configured", lambda: True)
    monkeypatch.setattr(telemetry, "over_budget", lambda: False)
    r = stages.recommend_stage()
    assert r.status == "amber"
    assert "ZZSECRET" not in r.receipt + "".join(r.warnings)
    assert actions.stored() is None


def test_recommend_stage_stores_the_list(monkeypatch):
    monkeypatch.setattr(actions, "generate", _generated)
    monkeypatch.setattr(config, "configured", lambda: True)
    monkeypatch.setattr(telemetry, "over_budget", lambda: False)
    r = stages.recommend_stage()
    assert r.status == "done" and r.receipt.startswith("2 recommendations")
    assert len(actions.stored()["actions"]) == 2


@pytest.fixture()
def fake_overview(monkeypatch):
    def fake_get(path):
        if path == "/api/supply/overview":
            return {"kpis": {}, "items_at_risk": 0, "items": []}
        return {"kpis": {"n_active_staff": 17}, "days_simulated": 30, "shifts": []}
    monkeypatch.setattr(tools, "_get", fake_get)


@pytest.mark.parametrize("origin,simulated", [("real", False), ("simulated", True), (None, True)])
def test_tool_source_follows_data_origin(monkeypatch, fake_overview, origin, simulated):
    monkeypatch.setitem(simulation_data._META, "origin", origin)
    for name in ("get_supply_status", "get_staff_status"):
        source = tools.execute(name, {})["source"]
        assert ("SIMULATED" in source) is simulated, source
    staff = tools.execute("get_staff_status", {})["source"]
    assert "17-nurse" in staff and "23" not in staff


def test_empty_list_ends_amber_but_is_stored(monkeypatch):
    monkeypatch.setattr(actions, "generate",
                        lambda: {"actions": [], "usage": {"in": 1, "out": 1}, "model": "m"})
    monkeypatch.setattr(config, "configured", lambda: True)
    monkeypatch.setattr(telemetry, "over_budget", lambda: False)
    r = stages.recommend_stage()
    assert r.status == "amber"
    assert r.receipt == "The AI returned no recommendations. Run again to rebuild them."
    kept = actions.stored()
    assert kept is not None and kept["actions"] == [] and kept["built_at"]


def test_generation_failure_logs_the_exception_type_only(monkeypatch, caplog):
    def boom():
        raise RuntimeError("provider said: ZZSECRET")
    monkeypatch.setattr(actions, "generate", boom)
    monkeypatch.setattr(config, "configured", lambda: True)
    monkeypatch.setattr(telemetry, "over_budget", lambda: False)
    with caplog.at_level("WARNING", logger="healthforecast.pipeline"):
        stages.recommend_stage()
    assert "RuntimeError" in caplog.text and "ZZSECRET" not in caplog.text


def test_pipeline_has_eight_stages():
    ids = [sid for sid, _label, _fn in stages.STAGES]
    assert len(ids) == 8 and ids[-2:] == ["optimise", "recommend"]


def test_tune_last_and_validation_last_carry_the_data_version(client):
    for path in ("/api/optimization/policy/tune/last", "/api/forecast/validate/last"):
        body = client.get(path).json()
        assert body["data_version"] == data_version.current(), path


def test_over_budget_ends_amber(monkeypatch):
    _forbid_generate(monkeypatch)
    monkeypatch.setattr(config, "configured", lambda: True)
    monkeypatch.setattr(telemetry, "over_budget", lambda: True)
    r = stages.recommend_stage()
    assert r.status == "amber" and "budget" in r.receipt
    assert actions.stored() is None


# --- Re-generate, and lists outdated by a hand-made plan or forecast ----------

def _ai_ready(monkeypatch):
    monkeypatch.setattr(config, "configured", lambda: True)
    monkeypatch.setattr(telemetry, "over_budget", lambda: False)


def _store(monkeypatch, items):
    monkeypatch.setattr(actions, "generate",
                        lambda: {"actions": items, "usage": {"in": 1, "out": 1}, "model": "m"})
    actions.build_and_store()


def test_refresh_rebuilds_the_stored_list(client, monkeypatch):
    _store(monkeypatch, [dict(ITEMS[0], title="Old item", id=0)])
    calls = []
    monkeypatch.setattr(actions, "generate", lambda: calls.append(1) or _generated())
    _ai_ready(monkeypatch)
    body = client.get("/api/ai/actions?refresh=1").json()
    assert calls == [1]
    assert [a["title"] for a in body["actions"]] == [a["title"] for a in ITEMS]
    assert [a["title"] for a in actions.stored()["actions"]] == [a["title"] for a in ITEMS]
    client.get("/api/ai/actions")
    assert calls == [1]            # a plain read serves the fresh list from the store


@pytest.mark.parametrize("configured,over,status,error", [
    (False, False, 503, "ai_not_configured"),
    (True, True, 429, "budget_exhausted"),
])
def test_refresh_keeps_the_ai_checks(client, monkeypatch, configured, over, status, error):
    _store(monkeypatch, list(ITEMS))
    _forbid_generate(monkeypatch)
    monkeypatch.setattr(config, "configured", lambda: configured)
    monkeypatch.setattr(telemetry, "over_budget", lambda: over)
    r = client.get("/api/ai/actions?refresh=1")
    assert r.status_code == status and r.json()["error"] == error
    assert len(actions.stored()["actions"]) == 2   # the stored list is not thrown away


def test_refresh_is_rate_limited(client, monkeypatch):
    from core import security
    monkeypatch.setitem(security.LIMITS, "ai", security.RateLimiter(limit=1, window_seconds=60))
    _store(monkeypatch, list(ITEMS))
    monkeypatch.setattr(actions, "generate", _generated)
    _ai_ready(monkeypatch)
    assert client.get("/api/ai/actions?refresh=1").status_code == 200
    assert client.get("/api/ai/actions?refresh=1").status_code == 429


def test_an_empty_stored_list_is_regenerated(client, monkeypatch):
    _store(monkeypatch, [])
    calls = []
    monkeypatch.setattr(actions, "generate", lambda: calls.append(1) or _generated())
    _ai_ready(monkeypatch)
    body = client.get("/api/ai/actions").json()
    assert calls == [1] and len(body["actions"]) == 2


def test_a_manual_optimisation_run_clears_the_stored_list(client, monkeypatch):
    from core import optimization_engine as engine
    from routers import optimization

    async def week(*_a, **_k):
        return {"daily_total": [1.0] * 7, "dates": [f"2026-01-0{i}" for i in range(1, 8)]}

    monkeypatch.setattr(engine, "_LAST", dict(engine._LAST))
    monkeypatch.setattr(optimization, "_get_week_forecast", week)
    monkeypatch.setattr(engine, "run_staff", lambda *a, **k: {"staff": "planned"})
    monkeypatch.setattr(engine, "run_supply_policy", lambda *a, **k: {"supply": "planned"})
    monkeypatch.setattr(engine, "optimize", lambda *a, **k: {"both": "planned"})
    for path in ("/api/optimization/run", "/api/optimization/staff", "/api/optimization/supply"):
        _store(monkeypatch, list(ITEMS))
        r = client.post(path, json={})
        assert r.status_code == 200, (path, r.text)
        assert actions.stored() is None, path


def test_a_manual_total_forecast_clears_the_stored_list(client, monkeypatch):
    from routers import forecast

    monkeypatch.setattr(forecast, "_LAST_RUN", None)
    monkeypatch.setattr(forecast, "compute_total", lambda *a, **k: {"forecast": []})
    _store(monkeypatch, list(ITEMS))
    assert client.post("/api/forecast/run", json={}).status_code == 200
    assert actions.stored() is None


def test_a_specialty_forecast_keeps_the_stored_list(client, monkeypatch):
    from routers import forecast

    monkeypatch.setattr(forecast, "_LAST_RUN", None)
    monkeypatch.setattr(forecast, "compute_specialty", lambda *a, **k: {"forecast": []})
    _store(monkeypatch, list(ITEMS))
    assert client.post("/api/forecast/specialty", json={"specialty": "Medicine"}).status_code == 200
    assert len(actions.stored()["actions"]) == 2
