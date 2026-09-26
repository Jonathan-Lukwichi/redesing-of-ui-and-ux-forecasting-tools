"""Authentication and role-based access control.

What this replaces
------------------
`src/pages/Admin.jsx` compared a hardcoded string (`hf-admin-2026`) in the
browser. That constant shipped inside the public JavaScript bundle, so anyone
could read it — or skip it entirely by setting the React state — and behind it
sat real model identities, accuracy figures and the AI audit log. CORS was
`["*"]` with no authentication anywhere, and `POST /api/reports/email` accepted
an arbitrary recipient plus an arbitrary PDF attachment, which made it an open
mail relay attached to the deployment's own sending reputation.

Design
------
Stateless HMAC-signed session tokens, verified server-side, with no third-party
dependency: the container is a single 512MB instance and an in-memory session
table would be lost on every restart and every scale event.

* Passwords are stored ONLY as scrypt hashes (stdlib `hashlib.scrypt`, the
  parameters below follow current OWASP guidance) with a per-user random salt.
  Nothing in this process can recover a password from what it stores.
* Tokens carry `sub`, `role` and `exp`, signed with HMAC-SHA256 over the
  canonical payload. Verification is constant-time (`hmac.compare_digest`), so
  the signature check cannot be probed by timing.
* Tokens are delivered as `HttpOnly`, `SameSite=Strict`, `Secure` cookies, so
  page JavaScript — and anything injected into it — cannot read them.

Roles are territory, NOT rank. A route asks for a SCOPE; a role is a set of
scopes; there is no ordering between roles. A stock manager is not a junior
director, and a staff manager has no business reading the pharmacy's plan:

    admin         — everything, including the data pipeline
    director      — every page and operational number, decisions and alerts, but
                    NOT accuracy figures, model identities or the AI audit log
    staff_manager — forecasts and staffing; nothing in supply
    stock_manager — forecasts and supply; nothing in staffing
    viewer        — every read-only page, no authority
    planner       — legacy middle rung of the old ladder, kept so existing
                    AUTH_USERS entries keep working after the model changed shape

See ROLE_SCOPES and ROLE_ACTION_CATEGORIES below for the authoritative mapping.

Deployment
----------
Users come from the `AUTH_USERS` environment variable, as
`username:role:scrypt_hash` entries separated by `;`. `python -m core.auth hash`
prints a hash for a password read from stdin. There is deliberately NO default
user and no default password: an unconfigured deployment has no accounts rather
than a well-known one.

`AUTH_SECRET` signs the tokens. If it is unset a random secret is generated per
process, which is safe but logs every user out on restart — the log line says so.

This is a real authentication layer, not an identity provider. Hospitals will
want SSO; `authenticate()` and `user_from_token()` are the two seams where an
OIDC provider slots in without touching any route.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import threading
import time
from dataclasses import dataclass
from typing import Optional

log = logging.getLogger("healthforecast.auth")

# OWASP-listed scrypt parameters (n=2^15, r=8, p=1). Slow enough to make offline
# cracking expensive, fast enough to log in with. The parameters are stored
# alongside each hash, so they can be raised later without invalidating existing
# credentials.
_SCRYPT_N = 1 << 15
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_LEN = 32

# scrypt needs 128 * n * r bytes (32MB here), which is above OpenSSL's default
# 32MB ceiling, so the limit is set explicitly with headroom.
_SCRYPT_MAXMEM = 128 * _SCRYPT_N * _SCRYPT_R * 2

# The deployment target is a single 512MB instance. Concurrent password hashes
# would each claim 32MB, so they are serialised: hashing is not a hot path
# (logins are rare), and the lock incidentally throttles credential stuffing
# to one guess at a time.
_HASH_LOCK = threading.Lock()

# ── Roles as TERRITORY, not rank ─────────────────────────────────────────────
# The first version of this file ranked roles on a ladder (viewer < planner <
# admin), where each role contained the one below. That is the wrong shape for a
# hospital: a stock manager is not "less than" a staffing manager, they are
# sideways — different territory, comparable authority inside it. So a role is a
# SET of scopes, and a route asks for the one scope it needs.
#
# Scope vocabulary (verb-scoped so read and act are separable):
SCOPES = (
    "forecast:read",    # the forecasts and the dashboard
    "forecast:validate",# run a rolling-origin backtest (heavy, but read-side)
    "data:read",        # Explore, dataset and group listings
    "data:write",       # upload, build groups, run backtests
    "staff:read",       # staffing pages and rosters
    "staff:plan",       # run the staff optimisation
    "supply:read",      # supply pages and stock history
    "supply:plan",      # run the supply optimisation, set the standing policy
    "actions:read",     # see the recommended action list
    "actions:decide",   # approve / snooze / dismiss an action
    "reports:send",     # email the operations report
    "admin",            # users, AI audit log, model identities, accuracy figures
    "assistant",        # use the AI assistant
)

_ALL = frozenset(SCOPES)

# Everything a person can look at, without authority to change anything.
_READ_ONLY = frozenset({
    "forecast:read", "data:read", "staff:read", "supply:read",
    "actions:read", "assistant",
})

ROLE_SCOPES: dict[str, frozenset[str]] = {
    # System administrator. Also owns the data pipeline: the analyst role was
    # deliberately folded in here rather than kept separate.
    "admin": _ALL,

    # Hospital director: every page and every operational number, plus the
    # decisions and the alerts. NOT accuracy figures, model identities or the
    # AI audit log — those stay with `admin`, per the governance rule that
    # accuracy is kept out of the front-line app. Reads the data pages but does
    # not run the pipeline.
    "director": _READ_ONLY | {"forecast:validate", "actions:decide", "reports:send"},

    # Workforce / nursing management.
    "staff_manager": frozenset({
        "forecast:read", "forecast:validate", "staff:read", "staff:plan",
        "actions:read", "actions:decide", "reports:send", "assistant",
    }),

    # Pharmacy / stores.
    "stock_manager": frozenset({
        "forecast:read", "forecast:validate", "supply:read", "supply:plan",
        "actions:read", "actions:decide", "reports:send", "assistant",
    }),

    # Read-only. Keeps the public demo working without handing anyone authority.
    "viewer": _READ_ONLY,

    # Legacy: the ladder's middle rung. Kept so existing AUTH_USERS entries
    # continue to work unchanged after the model changed shape underneath them.
    "planner": _READ_ONLY | {
        "data:write", "forecast:validate", "staff:plan", "supply:plan",
        "actions:decide", "reports:send",
    },
}

ROLES = tuple(ROLE_SCOPES)

# Which Action Center categories a role may see and decide on. The generator
# already tags every action staff | supply | capacity, so this needs no new data
# model. `capacity` is cross-cutting (a surge affects both), so both managers
# get it; nothing else crosses the line.
_ALL_CATEGORIES = frozenset({"staff", "supply", "capacity"})
ROLE_ACTION_CATEGORIES: dict[str, frozenset[str]] = {
    "admin": _ALL_CATEGORIES,
    "director": _ALL_CATEGORIES,
    "planner": _ALL_CATEGORIES,
    "viewer": _ALL_CATEGORIES,           # may read all, may decide none
    "staff_manager": frozenset({"staff", "capacity"}),
    "stock_manager": frozenset({"supply", "capacity"}),
}

SESSION_COOKIE = "hf_session"
DEFAULT_TTL_SECONDS = 12 * 3600          # one shift


@dataclass(frozen=True)
class User:
    username: str
    role: str

    @property
    def scopes(self) -> frozenset[str]:
        return ROLE_SCOPES.get(self.role, frozenset())

    def can(self, scope: str) -> bool:
        """True if this role holds `scope`. An unknown scope is always False —
        a typo in a route's requirement must deny, never wave everyone through."""
        return scope in self.scopes

    @property
    def action_categories(self) -> frozenset[str]:
        return ROLE_ACTION_CATEGORIES.get(self.role, frozenset())


# ── Password hashing ─────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """scrypt$n$r$p$salt$hash — self-describing, so parameters can change."""
    salt = secrets.token_bytes(16)
    with _HASH_LOCK:
        dk = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=_SCRYPT_N,
                            r=_SCRYPT_R, p=_SCRYPT_P, dklen=_SCRYPT_LEN,
                            maxmem=_SCRYPT_MAXMEM)
    return "scrypt${}${}${}${}${}".format(
        _SCRYPT_N, _SCRYPT_R, _SCRYPT_P,
        base64.b64encode(salt).decode(), base64.b64encode(dk).decode())


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt_b64, hash_b64 = stored.split("$")
        if scheme != "scrypt":
            return False
        with _HASH_LOCK:
            dk = hashlib.scrypt(password.encode("utf-8"),
                                salt=base64.b64decode(salt_b64),
                                n=int(n), r=int(r), p=int(p),
                                dklen=len(base64.b64decode(hash_b64)),
                                maxmem=128 * int(n) * int(r) * 2)
    except Exception:
        return False
    return hmac.compare_digest(dk, base64.b64decode(hash_b64))


# ── User store ───────────────────────────────────────────────────────────────

def _load_users() -> dict[str, tuple[str, str]]:
    """{username: (role, password_hash)} from AUTH_USERS.

    Read on every call so credentials can be rotated without a restart — the
    same pattern core/data_source.py already uses for the data-repo token."""
    raw = (os.getenv("AUTH_USERS") or "").strip()
    users: dict[str, tuple[str, str]] = {}
    for entry in raw.split(";"):
        entry = entry.strip()
        if not entry:
            continue
        parts = entry.split(":", 2)
        if len(parts) != 3:
            log.warning("AUTH_USERS entry ignored: expected user:role:hash")
            continue
        username, role, pw_hash = (p.strip() for p in parts)
        if role not in ROLES:
            log.warning("AUTH_USERS entry for %r ignored: unknown role %r", username, role)
            continue
        users[username] = (role, pw_hash)
    return users


def auth_configured() -> bool:
    return bool(_load_users())


# What a deployment grants when NO accounts are configured.
#
# The first version of this made "no accounts" mean "nothing protected works",
# which is the right instinct — a product that ships wide open by default is how
# these things go wrong. But applied bluntly it also breaks the public demo: the
# flagship Run-optimisation and backtest buttons return 503 on a deployment
# nobody has configured yet, which is a bad first impression and an easy thing
# to mistake for a broken app.
#
# So the closed-by-default rule is scoped to what is ACTUALLY dangerous rather
# than to everything that happens to be a write:
#
#   OPEN unconfigured   running an optimisation or a backtest. These read
#                       simulated data and return numbers. Nothing leaves the
#                       server, no secret is exposed, and they are rate limited.
#                       The cost is CPU, which the `heavy` bucket already caps.
#
#   CLOSED unconfigured reports:send  — sends real email from a verified domain
#                       admin         — the AI audit log, model identities, users
#                       data:write    — uploads and pipeline builds mutate server
#                                       state and are an easy resource vector
#
# Configure AUTH_USERS and this stops applying entirely: every route goes back
# to asking the signed-in user's role.
UNCONFIGURED_SCOPES = frozenset({
    "forecast:read", "forecast:validate", "data:read",
    "staff:read", "supply:read", "staff:plan", "supply:plan",
    "actions:read", "assistant",
})


def list_users() -> list[dict]:
    """Usernames and roles only. Never the hashes."""
    return [{"username": u, "role": r} for u, (r, _) in sorted(_load_users().items())]


# Precomputed once at import. The unknown-username branch below verifies against
# THIS rather than hashing a throwaway first: calling hash_password() there ran
# two scrypt derivations against the real branch's one, so a wrong password for a
# real account answered in about half the time of a wrong password for a
# non-existent one — a ~100% timing gap, which is a username oracle, not the
# defence the code claimed to be.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(32))


def authenticate(username: str, password: str) -> Optional[User]:
    """Verify credentials. Both branches perform EXACTLY ONE scrypt derivation,
    so response time does not reveal which accounts exist."""
    users = _load_users()
    record = users.get(username)
    if record is None:
        verify_password(password, _DUMMY_HASH)
        return None
    role, pw_hash = record
    if not verify_password(password, pw_hash):
        return None
    return User(username=username, role=role)


# ── Token signing ────────────────────────────────────────────────────────────

_RUNTIME_SECRET: Optional[bytes] = None


def _secret() -> bytes:
    global _RUNTIME_SECRET
    env = os.getenv("AUTH_SECRET")
    if env:
        return env.encode("utf-8")
    if _RUNTIME_SECRET is None:
        _RUNTIME_SECRET = secrets.token_bytes(32)
        log.warning("AUTH_SECRET is not set — using a per-process random secret. "
                    "Sessions will not survive a restart or a second instance.")
    return _RUNTIME_SECRET


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def issue_token(user: User, ttl_seconds: int = DEFAULT_TTL_SECONDS) -> str:
    payload = {"sub": user.username, "role": user.role,
               "exp": int(time.time()) + int(ttl_seconds)}
    body = _b64(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
    sig = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def user_from_token(token: Optional[str]) -> Optional[User]:
    """Verify signature, then expiry, then shape. Returns None for anything that
    does not check out — a caller can never distinguish 'tampered' from
    'expired' from 'malformed', which is deliberate."""
    if not token or "." not in token:
        return None
    body, _, sig = token.rpartition(".")
    expected = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        payload = json.loads(_unb64(body))
    except Exception:
        return None
    if int(payload.get("exp", 0)) < time.time():
        return None
    role = payload.get("role")
    username = payload.get("sub")
    if role not in ROLES or not username:
        return None
    return User(username=str(username), role=str(role))


# ── CLI: generate a password hash without it ever touching a shell history ───

if __name__ == "__main__":       # pragma: no cover
    import getpass
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "hash":
        pw = getpass.getpass("Password: ")
        again = getpass.getpass("Repeat:   ")
        if pw != again:
            sys.exit("Passwords do not match.")
        if len(pw) < 12:
            sys.exit("Use at least 12 characters.")
        print(hash_password(pw))
    else:
        print("usage: python -m core.auth hash")
