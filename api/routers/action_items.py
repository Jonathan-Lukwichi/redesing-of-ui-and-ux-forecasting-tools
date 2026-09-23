"""Decisions on Action Center items: approve, snooze, dismiss, complete.

The generated list itself still comes from `GET /api/ai/actions`. This router
owns what a human DID about each item, which is the part that has to survive a
refresh, name a person, and be answerable later.
"""
from __future__ import annotations

import re
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from core import action_store, security

router = APIRouter(prefix="/api/actions", tags=["actions"])

_DECIDABLE = ("approved", "snoozed", "dismissed", "done", "open")


class DecisionRequest(BaseModel):
    action_key: str = Field(min_length=8, max_length=64)
    title: str = Field(min_length=1, max_length=300)
    category: str = Field(min_length=1, max_length=40)
    urgency: Optional[str] = Field(default=None, max_length=20)
    status: str
    owner: Optional[str] = Field(default=None, max_length=120)
    due_date: Optional[str] = Field(default=None, max_length=10)
    note: Optional[str] = Field(default=None, max_length=1000)
    snooze_hours: Optional[float] = Field(default=None, ge=0.5, le=24 * 30)

    @field_validator("status")
    @classmethod
    def _known_status(cls, v: str) -> str:
        if v not in _DECIDABLE:
            raise ValueError(f"status must be one of {_DECIDABLE}")
        return v

    @field_validator("due_date")
    @classmethod
    def _iso_date(cls, v: Optional[str]) -> Optional[str]:
        if v and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
            raise ValueError("due_date must be YYYY-MM-DD")
        return v

    @field_validator("action_key")
    @classmethod
    def _hex_key(cls, v: str) -> str:
        if not re.fullmatch(r"[0-9a-f]+", v):
            raise ValueError("action_key must be lowercase hex")
        return v


@router.post("/decision")
async def decide(body: DecisionRequest, user=security.PlannerAccess) -> dict[str, Any]:
    """Record a decision.

    `decided_by` comes from the SESSION, never from the request body: an audit
    trail a caller can sign with someone else's name is worth nothing.

    The key is recomputed from the title and category rather than trusted, so a
    caller cannot attach a decision to an unrelated action by sending a key that
    does not match the content it claims to describe."""
    expected = action_store.action_key(body.category, body.title)
    if expected != body.action_key:
        raise HTTPException(400, {
            "error": "key_mismatch",
            "message": ("The action key does not match its title and category. "
                        "Reload the Action Center and try again."),
        })
    if body.status == "snoozed" and not body.snooze_hours:
        raise HTTPException(400, {"error": "snooze_hours_required",
                                  "message": "Snoozing needs a duration."})
    return action_store.record(
        expected, title=body.title, category=body.category, urgency=body.urgency,
        status=body.status, decided_by=user.username, owner=body.owner,
        due_date=body.due_date, note=body.note, snooze_hours=body.snooze_hours,
    )


@router.get("/decisions")
async def list_decisions(_user=security.ReadAccess) -> dict[str, Any]:
    return {"decisions": action_store.decisions(), "summary": action_store.summary()}


@router.get("/history")
async def decision_history(limit: int = 100, action_key: Optional[str] = None,
                           _user=security.ReadAccess) -> dict[str, Any]:
    """What was decided, by whom, and when — including for actions the generator
    no longer raises. This is the answer to 'what happened to the thing we
    approved last Tuesday?'"""
    return {"history": action_store.history(limit=limit, action_key_filter=action_key)}
