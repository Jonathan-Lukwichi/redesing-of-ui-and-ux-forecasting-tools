"""Sign in, sign out, and who am I.

Deliberately small: no self-registration, no password reset, no email flows.
Accounts are provisioned by an operator through AUTH_USERS, which is the right
posture for a hospital deployment where identities come from HR, not from a
sign-up form — and it means this service never stores anything it would have to
protect beyond the hashes.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from core import auth, security

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=512)


@router.post("/login")
def login(body: LoginRequest, request: Request, response: Response,
          _rl=Depends(security.rate_limit("login"))) -> dict[str, Any]:
    if not auth.auth_configured():
        raise HTTPException(503, {
            "error": "auth_not_configured",
            "message": ("No user accounts are configured on this deployment. "
                        "Set AUTH_USERS — see api/.env.example."),
        })
    user = auth.authenticate(body.username, body.password)
    if user is None:
        # One message for both 'no such user' and 'wrong password': telling them
        # apart hands an attacker a list of valid usernames.
        raise HTTPException(401, {"error": "invalid_credentials",
                                  "message": "Incorrect username or password."})
    token = auth.issue_token(user)
    response.set_cookie(auth.SESSION_COOKIE, token,
                        max_age=auth.DEFAULT_TTL_SECONDS,
                        **security.cookie_kwargs(request))
    return {"user": {"username": user.username, "role": user.role}}


@router.post("/logout")
def logout(request: Request, response: Response) -> dict[str, Any]:
    response.delete_cookie(auth.SESSION_COOKIE, **security.cookie_kwargs(request))
    return {"ok": True}


@router.get("/me")
def me(request: Request) -> dict[str, Any]:
    """Current identity and the deployment's posture, so the UI can render the
    right surfaces instead of guessing or hiding things client-side."""
    user = security.current_user(request)
    return {
        "user": None if user is None else {
            "username": user.username,
            "role": user.role,
            # The UI renders territory from these. They are a CONVENIENCE for
            # the browser, never the control: every route checks the same scope
            # server-side, so a tampered response buys nothing.
            "scopes": sorted(user.scopes),
            "action_categories": sorted(user.action_categories),
        },
        "auth_mode": security.auth_mode(),
        "auth_configured": auth.auth_configured(),
        "roles": list(auth.ROLES),
        # What this deployment grants WITHOUT a session. In `protected` mode
        # reads are open, so a visitor to the public demo still sees the
        # read-only pages; in `strict` mode it is empty. The UI mirrors this
        # rather than hardcoding its own idea of anonymous access, so the
        # sidebar can never offer a page the server would then refuse.
        "anonymous_scopes": (
            [] if security.auth_mode() == "strict"
            # With no accounts configured the deployment runs as a working demo:
            # the compute features are usable, the dangerous ones are not.
            else sorted(auth.UNCONFIGURED_SCOPES if not auth.auth_configured()
                        else auth.ROLE_SCOPES["viewer"])
        ),
        "anonymous_action_categories": (
            [] if security.auth_mode() == "strict"
            else sorted(auth.ROLE_ACTION_CATEGORIES["viewer"])
        ),
    }


@router.get("/users")
def users(_user=security.AdminAccess) -> dict[str, Any]:
    """Usernames and roles, admin only. Never the password hashes."""
    return {"users": auth.list_users()}
