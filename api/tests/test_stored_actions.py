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


def test_pipeline_has_eight_stages():
    ids = [sid for sid, _label, _fn in stages.STAGES]
    assert len(ids) == 8 and ids[-2:] == ["optimise", "recommend"]


def test_tune_last_and_validation_last_carry_the_data_version(client):
    for path in ("/api/optimization/policy/tune/last", "/api/forecast/validate/last"):
        body = client.get(path).json()
        assert body["data_version"] == data_version.current(), path
