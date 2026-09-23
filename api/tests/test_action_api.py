"""API-level tests for Action Center decisions.

These are the ones that matter for accountability: the trail must name the
session's user and nobody else, and a caller must not be able to attach a
decision to an action it does not describe.
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core import action_store, auth, security  # noqa: E402

PASSWORD = "a-long-enough-test-password"
TITLE = "Reorder paracetamol IV 1g"
CATEGORY = "supply"


@pytest.fixture()
def client(monkeypatch):
    h = auth.hash_password(PASSWORD)
    monkeypatch.setenv("AUTH_USERS", f"viv:viewer:{h};pam:planner:{h}")
    monkeypatch.setenv("AUTH_SECRET", "test-secret-not-a-real-one")
    monkeypatch.setenv("AUTH_MODE", "protected")
    monkeypatch.delenv("DEMO_INSECURE", raising=False)
    for limiter in security.LIMITS.values():
        limiter._hits.clear()
    action_store.reset_for_tests(os.path.join(tempfile.mkdtemp(), "d.sqlite3"))
    import main
    yield TestClient(main.app, base_url="https://testserver")
    action_store.reset_for_tests()


def _login(client, who):
    r = client.post("/api/auth/login", json={"username": who, "password": PASSWORD})
    assert r.status_code == 200, r.text


def _payload(status="approved", **kw):
    body = {
        "action_key": action_store.action_key(CATEGORY, TITLE),
        "title": TITLE, "category": CATEGORY, "urgency": "high", "status": status,
    }
    body.update(kw)
    return body


def test_anonymous_callers_cannot_record_decisions(client):
    assert client.post("/api/actions/decision", json=_payload()).status_code == 401


def test_a_viewer_cannot_record_decisions(client):
    _login(client, "viv")
    assert client.post("/api/actions/decision", json=_payload()).status_code == 403


def test_the_trail_names_the_session_user_not_the_request_body(client):
    """An audit trail a caller can sign with someone else's name is worthless."""
    _login(client, "pam")
    body = _payload()
    body["decided_by"] = "someone-else"          # ignored: not part of the schema
    r = client.post("/api/actions/decision", json=body)
    assert r.status_code == 200, r.text
    assert r.json()["decided_by"] == "pam"

    rows = client.get("/api/actions/history").json()["history"]
    assert rows[0]["decided_by"] == "pam"


def test_a_mismatched_key_is_rejected(client):
    """The key is recomputed from the content, so a caller cannot attach a
    decision to an unrelated action by sending a key that does not match."""
    _login(client, "pam")
    body = _payload()
    body["action_key"] = action_store.action_key("staff", "Something else entirely")
    r = client.post("/api/actions/decision", json=body)
    assert r.status_code == 400
    assert r.json()["detail"]["error"] == "key_mismatch"


def test_snoozing_requires_a_duration(client):
    _login(client, "pam")
    assert client.post("/api/actions/decision", json=_payload("snoozed")).status_code == 400
    ok = client.post("/api/actions/decision", json=_payload("snoozed", snooze_hours=24))
    assert ok.status_code == 200
    assert ok.json()["snooze_until"] is not None


def test_an_unknown_status_is_rejected_by_the_schema(client):
    _login(client, "pam")
    assert client.post("/api/actions/decision", json=_payload("yolo")).status_code == 422


def test_a_malformed_due_date_is_rejected(client):
    _login(client, "pam")
    assert client.post("/api/actions/decision",
                       json=_payload(due_date="30/09/2026")).status_code == 422


def test_decisions_and_summary_are_readable(client):
    _login(client, "pam")
    client.post("/api/actions/decision", json=_payload(owner="Sr Dlamini", due_date="2026-09-30"))
    body = client.get("/api/actions/decisions").json()
    assert body["summary"]["counts"]["approved"] == 1
    stored = next(iter(body["decisions"].values()))
    assert stored["owner"] == "Sr Dlamini"
    assert stored["due_date"] == "2026-09-30"
