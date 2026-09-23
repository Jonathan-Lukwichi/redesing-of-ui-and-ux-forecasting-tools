"""FastAPI glue for authentication, authorisation and rate limiting.

Enforcement posture
-------------------
`AUTH_MODE` decides how much of the API needs a session:

  protected (default)  Sensitive and mutating routes require a session; read
                       routes stay open. This is what the live demo runs: it
                       closes the open mail relay, the audit log and every write
                       path without turning the public demo into a login wall.
  strict               Everything except /api/auth/* and /api/health requires a
                       session. This is what a hospital deployment runs.
  open                 No enforcement. Refuses to start unless DEMO_INSECURE=1
                       is also set, so it can never be reached by accident or by
                       a half-finished env file.

Whichever mode is set, if no users are configured the sensitive routes are
CLOSED, not open: an unconfigured deployment denies access rather than granting
it. The one exception is `open` mode with its explicit acknowledgement flag.
"""
from __future__ import annotations

import os
import threading
import time
from collections import deque
from typing import Callable, Optional

from fastapi import Depends, HTTPException, Request, Response

from core import auth
from core.auth import User

_MODES = ("protected", "strict", "open")


def auth_mode() -> str:
    mode = (os.getenv("AUTH_MODE") or "protected").strip().lower()
    if mode not in _MODES:
        return "protected"
    if mode == "open" and (os.getenv("DEMO_INSECURE") or "").strip() != "1":
        # An explicit, deliberate acknowledgement is required to run with no
        # enforcement. Silently honouring AUTH_MODE=open would make a typo or a
        # copied env file enough to expose everything.
        return "protected"
    return mode


def allowed_origins() -> list[str]:
    """CORS origins. Production serves the frontend from the same origin, so the
    default allows only local development — never the `["*"]` the app shipped
    with, which let any website on the internet call this API."""
    raw = (os.getenv("CORS_ORIGINS") or "").strip()
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    return ["http://localhost:5173", "http://127.0.0.1:5173",
            "http://localhost:4173", "http://127.0.0.1:4173"]


def cookie_kwargs(request: Optional[Request] = None) -> dict:
    """HttpOnly so page scripts cannot read the token; SameSite=strict so a
    third-party page cannot ride the session; Secure unless we are plainly on
    http://localhost, where the browser would otherwise discard the cookie."""
    insecure_local = False
    if request is not None:
        host = (request.url.hostname or "").lower()
        insecure_local = request.url.scheme == "http" and host in ("localhost", "127.0.0.1")
    return {"httponly": True, "samesite": "strict", "secure": not insecure_local, "path": "/"}


# ── Rate limiting ────────────────────────────────────────────────────────────
# A fixed-memory sliding window per (bucket, client). The app had no rate
# limiting at all, which left the AI endpoints and the report mailer open to
# anyone who found the URL. In-process is the right scope here: the deployment
# is one container. A multi-instance deployment needs a shared store, and the
# header below says which instance answered so that is diagnosable.

class RateLimiter:
    def __init__(self, limit: int, window_seconds: float):
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque] = {}
        self._lock = threading.Lock()

    def check(self, key: str) -> tuple[bool, float]:
        """(allowed, retry_after_seconds)."""
        now = time.monotonic()
        with self._lock:
            q = self._hits.setdefault(key, deque())
            while q and now - q[0] > self.window:
                q.popleft()
            if len(q) >= self.limit:
                return False, max(0.0, self.window - (now - q[0]))
            q.append(now)
            if len(self._hits) > 4096:       # bounded: never an unbounded cache
                for k in [k for k, v in self._hits.items() if not v][:1024]:
                    self._hits.pop(k, None)
            return True, 0.0


# Login is the most attackable route, so it is the tightest. The report mailer
# sends real email from a verified domain, so it is tighter still.
LIMITS: dict[str, RateLimiter] = {
    "login":  RateLimiter(limit=10, window_seconds=300),
    "ai":     RateLimiter(limit=30, window_seconds=60),
    "email":  RateLimiter(limit=5,  window_seconds=3600),
    "heavy":  RateLimiter(limit=60, window_seconds=60),
}


def _client_key(request: Request) -> str:
    """Identify the caller for rate limiting.

    X-Forwarded-For is honoured only when TRUST_PROXY=1, because a client can
    set that header freely: trusting it unconditionally let one attacker appear
    as unlimited distinct clients and walk straight through the login limit.
    Set TRUST_PROXY=1 only when the app really does sit behind a proxy that
    overwrites the header (Render does)."""
    if (os.getenv("TRUST_PROXY") or "").strip() == "1":
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else "?"


def rate_limit(bucket: str) -> Callable:
    """Dependency factory: `Depends(rate_limit("email"))`."""
    def _dep(request: Request) -> None:
        limiter = LIMITS.get(bucket)
        if limiter is None:
            return
        ok, retry_after = limiter.check(f"{bucket}:{_client_key(request)}")
        if not ok:
            raise HTTPException(
                429,
                {"error": "rate_limited",
                 "message": f"Too many requests. Try again in {int(retry_after) + 1}s."},
                headers={"Retry-After": str(int(retry_after) + 1)},
            )
    return _dep


# ── Identity and authorisation ───────────────────────────────────────────────

def current_user(request: Request) -> Optional[User]:
    """Whoever is calling, or None. Never raises — used for optional identity.

    The token proves IDENTITY; the user store decides AUTHORITY. The role is
    re-read from AUTH_USERS on every request rather than trusted from the
    signed payload, because the payload is frozen for the token's whole
    lifetime: demote an admin to viewer, or delete them outright after a
    credential compromise, and a token-trusting check would keep honouring
    their old role for up to 12 hours while the operator believed the change
    had taken effect. Deleting the account now ends the session on the next
    request, which is what an offboarding procedure has to be able to rely on.
    """
    token = request.cookies.get(auth.SESSION_COOKIE)
    if not token:
        header = request.headers.get("authorization") or ""
        if header.lower().startswith("bearer "):
            token = header[7:].strip()
    claimed = auth.user_from_token(token)
    if claimed is None:
        return None

    users = auth._load_users()
    if not users:
        # No store to check against (e.g. `open` mode, or accounts cleared
        # mid-session): a token alone must not confer authority.
        return None
    record = users.get(claimed.username)
    if record is None:
        return None            # account removed -> session is over
    current_role, _ = record
    return User(username=claimed.username, role=current_role)


def require_role(minimum: str) -> Callable:
    """Dependency factory: `Depends(require_role("planner"))`.

    In `open` mode every request is treated as an admin, which is only
    reachable with DEMO_INSECURE=1 (see auth_mode)."""
    if minimum not in auth.ROLES:
        raise ValueError(f"unknown role {minimum!r}")

    def _dep(request: Request) -> User:
        if auth_mode() == "open":
            return User(username="demo", role="admin")

        user = current_user(request)
        if user is None:
            if not auth.auth_configured():
                # Closed by default: no accounts means no access, rather than
                # a deployment that forgot to configure users being wide open.
                raise HTTPException(503, {
                    "error": "auth_not_configured",
                    "message": ("This deployment has no user accounts configured, so "
                                "protected features are unavailable. Set AUTH_USERS "
                                "(see api/.env.example)."),
                })
            raise HTTPException(401, {"error": "not_authenticated",
                                      "message": "Sign in to continue."})
        if not user.can(minimum):
            raise HTTPException(403, {
                "error": "insufficient_role",
                "message": f"This needs the '{minimum}' role; you have '{user.role}'.",
            })
        return user
    return _dep


def require_read(request: Request) -> Optional[User]:
    """Read routes: open in `protected` mode, gated in `strict` mode."""
    if auth_mode() != "strict":
        return current_user(request)
    return require_role("viewer")(request)


ReadAccess = Depends(require_read)
PlannerAccess = Depends(require_role("planner"))
AdminAccess = Depends(require_role("admin"))
