"""Every role against every protected endpoint.

Roles are territory, not rank, so the interesting failures are SIDEWAYS: a stock
manager reaching a staffing route, or a director reaching the audit log. A
minimum-rank check cannot express that, and a per-route test would not catch a
new endpoint quietly defaulting to the wrong territory. This matrix does.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core import auth, security  # noqa: E402

PASSWORD = "a-long-enough-test-password"
ROLES = ("admin", "director", "staff_manager", "stock_manager", "viewer")

# (method, path, body, scope the route requires)
ENDPOINTS = [
    ("post",   "/api/optimization/staff",   {"model": "ml"},  "staff:plan"),
    ("post",   "/api/optimization/supply",  {"model": "ml"},  "supply:plan"),
    ("put",    "/api/optimization/policy",  {"policy": "s_q"}, "supply:plan"),
    ("post",   "/api/optimization/policy/tune", {"policy": "s_q"}, "supply:plan"),
    ("post",   "/api/prepare/build",        {"group_id": "g1"}, "data:write"),
    ("delete", "/api/prepare/g1",           None,             "data:write"),
    ("delete", "/api/datasets/daily_arrival", None,           "data:write"),
    ("post",   "/api/forecast/validate",    {"model": "ml", "horizon": 7}, "data:write"),
    ("post",   "/api/reports/email",        {"to": "a@b.com", "pdf_base64": "AA", "context": {}},
     "reports:send"),
    ("get",    "/api/ai/audit",             None,             "admin"),
    ("get",    "/api/ai/audit/stats",       None,             "admin"),
    ("get",    "/api/ai/usage",             None,             "admin"),
    ("get",    "/api/auth/users",           None,             "admin"),
]


@pytest.fixture()
def env(monkeypatch):
    h = auth.hash_password(PASSWORD)
    monkeypatch.setenv("AUTH_USERS", ";".join(f"{r}:{r}:{h}" for r in ROLES))
    monkeypatch.setenv("AUTH_SECRET", "test-secret-not-a-real-one")
    monkeypatch.setenv("AUTH_MODE", "protected")
    monkeypatch.delenv("DEMO_INSECURE", raising=False)
    monkeypatch.delenv("TRUST_PROXY", raising=False)
    for limiter in security.LIMITS.values():
        limiter._hits.clear()
    yield


@pytest.fixture()
def client(env):
    import main
    return TestClient(main.app, base_url="https://testserver")


def _login(client, role):
    r = client.post("/api/auth/login", json={"username": role, "password": PASSWORD})
    assert r.status_code == 200, r.text


def _call(client, method, path, body):
    return getattr(client, method)(path, json=body) if body is not None else getattr(client, method)(path)


@pytest.mark.parametrize("role", ROLES)
@pytest.mark.parametrize("method,path,body,scope", ENDPOINTS)
def test_every_role_against_every_protected_endpoint(client, role, method, path, body, scope):
    """A role holding the scope must NOT get 403; a role without it MUST.

    Anything other than 403 is accepted for a permitted role — the endpoint may
    legitimately answer 409/422/503 because no data is loaded in a test process.
    The question here is only ever authorisation."""
    _login(client, role)
    allowed = auth.User(role, role).can(scope)
    status = _call(client, method, path, body).status_code

    if allowed:
        assert status != 403, f"{role} holds {scope} but {method.upper()} {path} returned 403"
    else:
        assert status == 403, (
            f"{role} does NOT hold {scope} yet {method.upper()} {path} returned {status}")


@pytest.mark.parametrize("method,path,body,scope", ENDPOINTS)
def test_every_protected_endpoint_rejects_anonymous_callers(client, method, path, body, scope):
    assert _call(client, method, path, body).status_code == 401


# ── The sideways failures the old ladder could not express ───────────────────

def test_a_stock_manager_cannot_run_the_staffing_plan(client):
    _login(client, "stock_manager")
    assert client.post("/api/optimization/staff", json={"model": "ml"}).status_code == 403


def test_a_staffing_manager_cannot_run_the_supply_plan(client):
    _login(client, "staff_manager")
    assert client.post("/api/optimization/supply", json={"model": "ml"}).status_code == 403


def test_a_staffing_manager_cannot_set_the_reorder_policy(client):
    _login(client, "staff_manager")
    assert client.put("/api/optimization/policy", json={"policy": "s_q"}).status_code == 403


def test_the_combined_run_needs_both_territories(client):
    """It does both halves, so holding one is not enough."""
    for role in ("staff_manager", "stock_manager"):
        _login(client, role)
        assert client.post("/api/optimization/run", json={"model": "ml"}).status_code == 403, role
        client.post("/api/auth/logout")
    _login(client, "admin")
    assert client.post("/api/optimization/run", json={"model": "ml"}).status_code != 403


def test_the_director_sees_every_page_but_not_the_audit_log(client):
    """The answer chosen for this deployment: accuracy figures, model identities
    and the AI audit log stay with admin, even for the director."""
    _login(client, "director")
    assert client.get("/api/ai/audit").status_code == 403
    assert client.get("/api/auth/users").status_code == 403
    assert client.post("/api/reports/email",
                       json={"to": "a@b.com", "pdf_base64": "AA", "context": {}}).status_code != 403


def test_the_director_cannot_run_the_data_pipeline(client):
    _login(client, "director")
    assert client.post("/api/prepare/build", json={"group_id": "g1"}).status_code == 403


def test_a_viewer_can_decide_nothing(client):
    _login(client, "viewer")
    for method, path, body, _ in ENDPOINTS:
        assert _call(client, method, path, body).status_code == 403, f"{method} {path}"


def test_the_legacy_planner_role_still_works(client, monkeypatch):
    """Existing AUTH_USERS entries must not break when the model changed shape."""
    h = auth.hash_password(PASSWORD)
    monkeypatch.setenv("AUTH_USERS", f"pam:planner:{h}")
    r = client.post("/api/auth/login", json={"username": "pam", "password": PASSWORD})
    assert r.status_code == 200
    assert client.post("/api/optimization/staff", json={"model": "ml"}).status_code != 403
    assert client.post("/api/optimization/supply", json={"model": "ml"}).status_code != 403
    assert client.get("/api/ai/audit").status_code == 403      # never had admin


def test_an_unknown_scope_denies_rather_than_waving_everyone_through():
    assert auth.User("x", "admin").can("staff:plann") is False
    with pytest.raises(ValueError):
        security.require_scope("not:a:scope")
