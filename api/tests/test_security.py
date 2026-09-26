"""Security tests.

Each one pins a hole the audit found open. They are written as attacks, not as
feature checks: the question is not "does login work" but "can this still be
reached without one".
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core import auth, security  # noqa: E402

PASSWORD = "a-long-enough-test-password"


@pytest.fixture()
def env(monkeypatch):
    """A deployment with one account per role and a fixed signing secret."""
    h = auth.hash_password(PASSWORD)
    monkeypatch.setenv("AUTH_USERS", f"viv:viewer:{h};pam:planner:{h};ada:admin:{h}")
    monkeypatch.setenv("AUTH_SECRET", "test-secret-not-a-real-one")
    monkeypatch.setenv("AUTH_MODE", "protected")
    monkeypatch.delenv("DEMO_INSECURE", raising=False)
    # Rate-limit buckets are process-global; start each test clean so one test's
    # traffic cannot fail another.
    for limiter in security.LIMITS.values():
        limiter._hits.clear()
    yield


@pytest.fixture()
def client(env):
    import main
    # https base URL on purpose: the session cookie carries `Secure`, so a plain
    # http client would silently discard it — which is exactly the production
    # behaviour we want, and would make every logged-in assertion below pass
    # for the wrong reason.
    return TestClient(main.app, base_url="https://testserver")


def _login(client, username):
    r = client.post("/api/auth/login", json={"username": username, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r


# ── The open mail relay ──────────────────────────────────────────────────────

def test_report_email_rejects_anonymous_callers(client):
    """The worst hole: anyone could send an arbitrary PDF from the deployment's
    verified sender to any address, and push arbitrary text into the model."""
    r = client.post("/api/reports/email", json={
        "to": "attacker@example.com", "pdf_base64": "AAAA", "context": {},
    })
    assert r.status_code == 401, f"still reachable anonymously: {r.status_code}"


def test_report_email_rejects_a_viewer(client):
    _login(client, "viv")
    r = client.post("/api/reports/email", json={
        "to": "someone@example.com", "pdf_base64": "AAAA", "context": {},
    })
    assert r.status_code == 403


# ── The audit log and model identities ───────────────────────────────────────

@pytest.mark.parametrize("path", ["/api/ai/audit", "/api/ai/audit/stats", "/api/ai/usage"])
def test_audit_surfaces_require_admin(client, path):
    assert client.get(path).status_code == 401
    _login(client, "pam")                       # planner is not enough
    assert client.get(path).status_code == 403
    client.post("/api/auth/logout")
    _login(client, "ada")
    assert client.get(path).status_code == 200


def test_user_list_never_exposes_password_hashes(client):
    _login(client, "ada")
    body = client.get("/api/auth/users").json()
    assert {u["username"] for u in body["users"]} == {"viv", "pam", "ada"}
    assert "scrypt$" not in client.get("/api/auth/users").text


# ── Write paths ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize("method,path,payload", [
    ("post", "/api/prepare/build", {"group_id": "g1"}),
    ("delete", "/api/prepare/g1", None),
    ("delete", "/api/datasets/daily_arrival", None),
    ("post", "/api/optimization/staff", {"model": "ml"}),
    ("post", "/api/optimization/run", {"model": "ml"}),
    ("post", "/api/forecast/validate", {"model": "ml", "horizon": 7}),
])
def test_write_paths_reject_anonymous_callers(client, method, path, payload):
    r = getattr(client, method)(path, json=payload) if payload else getattr(client, method)(path)
    assert r.status_code == 401, f"{method.upper()} {path} still open ({r.status_code})"


# ── Sessions ─────────────────────────────────────────────────────────────────

def test_login_rejects_a_wrong_password(client):
    r = client.post("/api/auth/login", json={"username": "ada", "password": "wrong"})
    assert r.status_code == 401


def test_login_does_not_reveal_which_usernames_exist(client):
    no_user = client.post("/api/auth/login", json={"username": "ghost", "password": "wrong"})
    bad_pw = client.post("/api/auth/login", json={"username": "ada", "password": "wrong"})
    assert no_user.status_code == bad_pw.status_code == 401
    assert no_user.json()["detail"] == bad_pw.json()["detail"]


def test_session_cookie_is_httponly_and_samesite(client):
    r = _login(client, "ada")
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie, "page scripts can read the session token"
    assert "samesite=strict" in cookie, "a third-party page could ride the session"


def test_a_forged_token_is_rejected(client):
    forged = auth.issue_token(auth.User("mallory", "admin"))
    tampered = forged[:-4] + ("aaaa" if not forged.endswith("aaaa") else "bbbb")
    r = client.get("/api/ai/audit", headers={"Authorization": f"Bearer {tampered}"})
    assert r.status_code == 401


def test_a_token_signed_with_another_secret_is_rejected(client, monkeypatch):
    monkeypatch.setenv("AUTH_SECRET", "a-different-secret")
    other = auth.issue_token(auth.User("mallory", "admin"))
    monkeypatch.setenv("AUTH_SECRET", "test-secret-not-a-real-one")
    assert client.get("/api/ai/audit",
                      headers={"Authorization": f"Bearer {other}"}).status_code == 401


def test_an_expired_token_is_rejected(client):
    stale = auth.issue_token(auth.User("ada", "admin"), ttl_seconds=-10)
    assert client.get("/api/ai/audit",
                      headers={"Authorization": f"Bearer {stale}"}).status_code == 401


def test_logout_clears_the_session(client):
    _login(client, "ada")
    assert client.get("/api/ai/audit").status_code == 200
    client.post("/api/auth/logout")
    assert client.get("/api/ai/audit").status_code == 401


# ── Posture ──────────────────────────────────────────────────────────────────

def test_unconfigured_deployment_is_closed_not_open(client, monkeypatch):
    """No accounts must mean no access. The opposite default is how products
    ship wide open."""
    monkeypatch.delenv("AUTH_USERS", raising=False)
    r = client.post("/api/reports/email", json={"to": "x@y.com", "pdf_base64": "A", "context": {}})
    assert r.status_code == 503
    assert r.json()["detail"]["error"] == "auth_not_configured"


def test_open_mode_requires_an_explicit_acknowledgement(monkeypatch):
    """AUTH_MODE=open alone must not disable enforcement — a typo or a copied
    env file should never be enough."""
    monkeypatch.setenv("AUTH_MODE", "open")
    monkeypatch.delenv("DEMO_INSECURE", raising=False)
    assert security.auth_mode() == "protected"
    monkeypatch.setenv("DEMO_INSECURE", "1")
    assert security.auth_mode() == "open"


def test_unknown_auth_mode_falls_back_to_protected(monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "nonsense")
    assert security.auth_mode() == "protected"


def test_strict_mode_gates_reads_too(client, monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "strict")
    assert client.get("/api/optimization/last").status_code == 401
    _login(client, "viv")
    assert client.get("/api/optimization/last").status_code == 200


def test_cors_is_not_a_wildcard():
    assert "*" not in security.allowed_origins()


def test_security_headers_are_present(client):
    h = client.get("/health").headers
    assert h["x-content-type-options"] == "nosniff"
    assert h["x-frame-options"] == "DENY"


# ── Rate limiting ────────────────────────────────────────────────────────────

def test_login_is_rate_limited(client):
    codes = [client.post("/api/auth/login",
                         json={"username": "ada", "password": "wrong"}).status_code
             for _ in range(12)]
    assert 429 in codes, "unlimited password guesses are still possible"


def test_rate_limiter_window_expires(monkeypatch):
    """A limiter that never forgets is a denial of service on your own users."""
    clock = [1000.0]
    monkeypatch.setattr(security.time, "monotonic", lambda: clock[0])
    limiter = security.RateLimiter(limit=2, window_seconds=100)
    assert limiter.check("k")[0] and limiter.check("k")[0]
    allowed, retry_after = limiter.check("k")
    assert not allowed and retry_after > 0
    clock[0] += 101
    assert limiter.check("k")[0], "the window never reopens"


def test_rate_limits_are_per_client_not_global(monkeypatch):
    """One noisy client must not lock everyone else out."""
    clock = [1000.0]
    monkeypatch.setattr(security.time, "monotonic", lambda: clock[0])
    limiter = security.RateLimiter(limit=1, window_seconds=100)
    assert limiter.check("a")[0]
    assert not limiter.check("a")[0]
    assert limiter.check("b")[0], "a second client was blocked by the first"


# ── Findings from the adversarial security review ────────────────────────────
# Each of these reproduces a hole that was confirmed open, so it cannot return.

import asyncio  # noqa: E402


def _raw_asgi_get(app, path: str):
    """Speak ASGI directly. An HTTP client normalises `//x` to `/x`, which hides
    this vector entirely — the original report was only reproducible below the
    client layer, and so is this regression test."""
    scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
             "method": "GET", "scheme": "http", "path": path,
             "raw_path": path.encode(), "query_string": b"", "root_path": "",
             "headers": [(b"host", b"testserver")],
             "client": ("1.2.3.4", 1234), "server": ("testserver", 80)}
    chunks, status = [], {}

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(msg):
        if msg["type"] == "http.response.start":
            status["code"] = msg["status"]
        elif msg["type"] == "http.response.body":
            chunks.append(msg.get("body", b""))

    asyncio.run(app(scope, receive, send))
    return status.get("code"), b"".join(chunks)


@pytest.mark.parametrize("path", [
    "//etc/passwd",          # absolute join: Path(static) / "/etc/passwd" == /etc/passwd
    "//etc/hostname",
    "//proc/self/environ",   # would have exposed every secret in the process
])
def test_spa_fallback_cannot_serve_files_outside_the_static_root(path, tmp_path, monkeypatch):
    """Unauthenticated arbitrary file read, confirmed exploitable before the fix.

    The old guard rejected ".." but not an ABSOLUTE path, and this route lives
    outside /api/ so no AUTH_MODE closed it."""
    import main
    static = tmp_path / "static"
    static.mkdir()
    (static / "index.html").write_text("<html>spa</html>")
    monkeypatch.setattr(main, "_STATIC_DIR", static, raising=False)

    from fastapi import FastAPI
    from fastapi.responses import FileResponse
    probe = FastAPI()
    root = static.resolve()

    @probe.get("/{full_path:path}")
    async def fallback(full_path: str):          # mirrors main.spa_fallback
        if full_path:
            try:
                candidate = (root / full_path.lstrip("/")).resolve()
            except (OSError, ValueError, RuntimeError):
                candidate = None
            if candidate is not None and candidate.is_relative_to(root) and candidate.is_file():
                return FileResponse(candidate)
        return FileResponse(root / "index.html")

    code, body = _raw_asgi_get(probe, path)
    assert code == 200
    assert b"spa" in body[:40], f"{path} escaped the static root: {body[:80]!r}"


def test_the_live_app_does_not_leak_files_through_the_spa_fallback():
    """The same check against the real wiring, when a static build is present."""
    import main
    if not getattr(main, "_SERVE_FRONTEND", False):
        pytest.skip("no built frontend in this checkout")
    code, body = _raw_asgi_get(main.app, "//etc/passwd")
    assert b"root:x:0:0" not in body, "the live app still serves /etc/passwd"


def test_login_timing_does_not_reveal_which_usernames_exist(env):
    """The dummy-hash branch ran TWO scrypt derivations against the real
    branch's one, so a wrong password for a real account answered in about half
    the time — a username oracle wearing the costume of a defence."""
    import time as _time

    def average_ms(username):
        runs = []
        for _ in range(4):
            t0 = _time.perf_counter()
            auth.authenticate(username, "definitely-the-wrong-password")
            runs.append(_time.perf_counter() - t0)
        return sorted(runs)[len(runs) // 2] * 1000     # median: robust to a stray GC pause

    known, unknown = average_ms("ada"), average_ms("no-such-person")
    ratio = unknown / known
    assert 0.6 < ratio < 1.6, (
        f"unknown usernames answer {ratio:.2f}x slower than known ones — "
        "the login is an account-enumeration oracle")


def test_deleting_an_account_ends_its_live_session(client, monkeypatch):
    """Offboarding has to take effect NOW. The role used to be frozen in the
    signed token for its full 12-hour life, so a removed admin kept admin."""
    _login(client, "ada")
    assert client.get("/api/ai/audit").status_code == 200
    monkeypatch.setenv("AUTH_USERS", "")                 # account removed
    assert client.get("/api/ai/audit").status_code in (401, 503), (
        "a deleted account's existing session still works")


def test_demoting_a_user_takes_effect_on_the_next_request(client, monkeypatch):
    """The token proves identity; the store decides authority."""
    _login(client, "ada")
    assert client.get("/api/ai/audit").status_code == 200
    h = auth.hash_password(PASSWORD)
    monkeypatch.setenv("AUTH_USERS", f"ada:viewer:{h}")  # admin -> viewer
    assert client.get("/api/ai/audit").status_code == 403, (
        "a demoted admin still holds admin authority")


def test_forwarded_for_is_ignored_unless_a_proxy_is_trusted(monkeypatch):
    """Trusting X-Forwarded-For unconditionally let one attacker present as
    unlimited distinct clients and stroll through the login limit."""
    from starlette.requests import Request

    def req(xff):
        headers = [(b"x-forwarded-for", xff.encode())] if xff else []
        return Request({"type": "http", "headers": headers, "client": ("10.0.0.1", 1)})

    monkeypatch.delenv("TRUST_PROXY", raising=False)
    assert security._client_key(req("1.1.1.1")) == security._client_key(req("2.2.2.2")) == "10.0.0.1"

    monkeypatch.setenv("TRUST_PROXY", "1")
    assert security._client_key(req("1.1.1.1")) == "1.1.1.1"


# ── The unconfigured-deployment posture ──────────────────────────────────────
# "Closed by default" is right, but applied bluntly it turned an unconfigured
# deployment into a wall of 503s including the flagship demo features. The rule
# is now scoped to what is actually dangerous. Both halves are pinned here,
# because getting either one wrong is a bad failure: too open leaks, too closed
# looks broken.

@pytest.fixture()
def unconfigured(monkeypatch):
    monkeypatch.delenv("AUTH_USERS", raising=False)
    monkeypatch.setenv("AUTH_SECRET", "test-secret-not-a-real-one")
    monkeypatch.setenv("AUTH_MODE", "protected")
    monkeypatch.delenv("DEMO_INSECURE", raising=False)
    for limiter in security.LIMITS.values():
        limiter._hits.clear()
    import main
    return TestClient(main.app, base_url="https://testserver")


@pytest.mark.parametrize("method,path,payload", [
    ("post", "/api/optimization/staff",  {"model": "ml"}),
    ("post", "/api/optimization/supply", {"model": "ml"}),
    ("post", "/api/forecast/validate",   {"model": "ml", "horizon": 7}),
])
def test_demo_compute_works_without_accounts(unconfigured, method, path, payload):
    """These read simulated data and return numbers. Nothing leaves the server
    and they are rate limited, so a 503 here would only make the demo look
    broken without making anything safer."""
    status = getattr(unconfigured, method)(path, json=payload).status_code
    assert status not in (401, 403, 503), (
        f"{method.upper()} {path} returned {status} on an unconfigured deployment — "
        "the demo's flagship feature is unreachable")


@pytest.mark.parametrize("method,path,payload,why", [
    ("post", "/api/reports/email", {"to": "a@b.com", "pdf_base64": "AA", "context": {}},
     "sends real email from a verified domain"),
    ("get",  "/api/ai/audit", None, "the AI audit log"),
    ("get",  "/api/auth/users", None, "the user list"),
    ("post", "/api/prepare/build", {"group_id": "g1"}, "mutates server state"),
])
def test_dangerous_surfaces_stay_closed_without_accounts(unconfigured, method, path, payload, why):
    r = getattr(unconfigured, method)(path, json=payload) if payload is not None \
        else getattr(unconfigured, method)(path)
    assert r.status_code == 503, f"{path} ({why}) was reachable unconfigured"
    assert r.json()["detail"]["error"] == "auth_not_configured"


def test_the_error_names_what_it_cannot_do(unconfigured):
    """A bare 'not configured' leaves an operator guessing. The message names
    the capability and what to set."""
    body = unconfigured.get("/api/ai/audit").json()["detail"]
    assert "AUTH_USERS" in body["message"]
    assert body["scope"] == "admin"


def test_configuring_accounts_restores_full_role_enforcement(client):
    """The posture is a fallback, not a hole: once accounts exist, every route
    goes back to asking the signed-in user's role."""
    assert client.post("/api/optimization/staff", json={"model": "ml"}).status_code == 401
    _login(client, "viv")                      # viewer holds no :plan scope
    assert client.post("/api/optimization/staff", json={"model": "ml"}).status_code == 403
