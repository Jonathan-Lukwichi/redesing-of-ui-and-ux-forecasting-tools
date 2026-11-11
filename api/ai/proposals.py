"""Pending run proposals: the confirmation token between the assistant and a run.

The assistant may only PROPOSE a run. propose_run (ai/run_tools.py) stores the
plan here under a fresh random token bound to the acting user, the exact plan,
and the fingerprint, readiness and data version the plan was made from. The
model never sees the token: it reaches the browser in the chat stream's
trailer, and only POST /api/ai/run (data:write) hands it back, after the user
pressed Run or typed yes. Then start_confirmed checks it and starts the plan.

A token
- lives TTL_SECONDS and is used once: a successful start, a stale plan and an
  expiry all consume it; a busy pipeline and someone else's request keep it;
- is revoked when the same user is offered a newer proposal;
- is never written anywhere. Audit rows carry only sha256(token)[:12].

The store is in memory, capped at MAX_PENDING (the oldest goes first), and
empty after a restart, like every other piece of run state.
"""
from __future__ import annotations

import hashlib
import secrets
import threading
import time
from dataclasses import dataclass

from ai import audit
from core import security
from core.pipeline import job, steps

TTL_SECONDS = 600
MAX_PENDING = 64

UNKNOWN = "That offer is no longer valid. Ask again and the assistant will re-check."
EXPIRED = "That offer has expired. Ask again and the assistant will re-check."
NOT_YOURS = "That offer was made to someone else."


class ProposalError(Exception):
    """A confirmation that cannot start a run. ``message`` is plain English."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


@dataclass(frozen=True)
class _Pending:
    username: str
    plan: steps.Plan
    public: dict          # plan.public(), shown back to the browser on start
    expires_at: float


_LOCK = threading.Lock()
_PENDING: dict[str, _Pending] = {}   # token -> proposal, oldest first


def _now() -> float:
    return time.time()


def reset() -> None:
    with _LOCK:
        _PENDING.clear()


def proposal_id(token: str) -> str:
    """What the audit log records instead of the token."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:12]


def _audit(surface: str, username: str | None, token: str, summary: str, **extra) -> None:
    audit.log_event(surface, "none", summary, "", 0, 0,
                    extra={"user": username, "proposal_id": proposal_id(token), **extra})


def issue(username: str, p: steps.Plan) -> dict:
    """Store this plan for this user and return what the browser gets:
    p.public() plus the token and its expiry (seconds since the epoch). The
    user's earlier pending proposal is revoked."""
    token = secrets.token_urlsafe(16)
    expires_at = _now() + TTL_SECONDS
    public = p.public()
    with _LOCK:
        for t in [t for t, e in _PENDING.items() if e.username == username]:
            _PENDING.pop(t)
        _PENDING[token] = _Pending(username, p, public, expires_at)
        while len(_PENDING) > MAX_PENDING:
            _PENDING.pop(next(iter(_PENDING)))
    ids = [s.id for s in p.steps]
    _audit("assistant_proposal", username, token, "proposed: " + ", ".join(ids),
           steps=ids, stage_ids=list(p.stage_ids), total_seconds=p.total_seconds)
    return {**public, "token": token, "expires_at": round(expires_at)}


def _take(token: str, username: str) -> _Pending:
    """The proposal behind this token, removed from the store, or ProposalError.
    Someone else's token stays where it is."""
    with _LOCK:
        entry = _PENDING.get(token)
        if entry is None:
            raise ProposalError(409, "proposal_unknown", UNKNOWN)
        if entry.username != username:
            raise ProposalError(403, "proposal_not_yours", NOT_YOURS)
        _PENDING.pop(token)
        if _now() > entry.expires_at:
            raise ProposalError(409, "proposal_expired", EXPIRED)
        return entry


def _put_back(token: str, entry: _Pending) -> None:
    """Return a token taken for a start that found the pipeline busy, unless
    the user has been offered a newer proposal meanwhile."""
    with _LOCK:
        if not any(e.username == entry.username for e in _PENDING.values()):
            _PENDING[token] = entry


def _outcome(username: str, token: str, logged: threading.Event):
    def on_finish(status: dict) -> None:
        logged.wait(5)    # the start row goes first, even for a very quick run
        stages = [{"id": s["id"], "status": s["status"]} for s in status.get("stages", [])]
        failed = next((s["id"] for s in stages if s["status"] == "failed"), None)
        _audit("assistant_run_outcome", username, token, "run ended",
               outcome="failed" if failed else "done", stages=stages, failed_stage=failed)
    return on_finish


def start_confirmed(token: str, username: str, via: str) -> dict:
    """Start the plan behind a token the user confirmed. Returns the job status
    and the proposal; raises ProposalError when it cannot start."""
    try:
        entry = _take(token, username)
        logged = threading.Event()
        try:
            try:
                status = steps.start(entry.plan, on_finish=_outcome(username, token, logged))
            except steps.Refused as e:          # stale, or the sample no longer allowed
                raise ProposalError(409, e.code, e.message) from None
            except job.Busy:
                _put_back(token, entry)
                raise ProposalError(409, "already_running",
                                    security.PIPELINE_BUSY["message"]) from None
            _audit("assistant_confirm", username, token, "confirmed", via=via)
            _audit("assistant_run_start", username, token, "run started",
                   stage_ids=list(entry.plan.stage_ids))
        finally:
            logged.set()
    except ProposalError as e:
        _audit("assistant_confirm_refused", username, token, "refused", via=via, code=e.code)
        raise
    return {"status": status, "proposal": entry.public}
