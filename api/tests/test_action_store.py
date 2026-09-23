"""Tests for durable Action Center decisions.

The property that matters is not "can we write a row" — it is that a decision
survives, names a real person, and can be answered for later. Each test pins
one of those.
"""
from __future__ import annotations

import os
import sys
import tempfile
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core import action_store as S  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    S.reset_for_tests(os.path.join(tempfile.mkdtemp(), "decisions.sqlite3"))
    yield
    S.reset_for_tests()


ACTIONS = [
    {"title": "Reorder paracetamol IV 1g", "category": "supply", "urgency": "high", "reason": "r"},
    {"title": "Cover Thursday night shift", "category": "staff", "urgency": "medium", "reason": "r"},
]


def _key(a):
    return S.action_key(a["category"], a["title"])


def test_a_decision_survives_regeneration():
    """The bug this replaces: every decision vanished on refresh."""
    first = S.apply_decisions(ACTIONS)
    assert [a["status"] for a in first] == ["open", "open"]

    S.record(_key(ACTIONS[0]), title=ACTIONS[0]["title"], category="supply",
             urgency="high", status="approved", decided_by="pam")

    # Regenerate from scratch, as the assistant does on every page load.
    again = S.apply_decisions([dict(a) for a in ACTIONS])
    assert again[0]["status"] == "approved"
    assert again[0]["decided_by"] == "pam"
    assert again[1]["status"] == "open"


def test_trivial_rewording_keeps_the_decision():
    """The generator rewrites titles freely; casing and spacing must not orphan
    a decision and silently resurrect something already dismissed."""
    S.record(_key(ACTIONS[0]), title=ACTIONS[0]["title"], category="supply",
             urgency="high", status="dismissed", decided_by="pam")
    reworded = [{"title": "  reorder   PARACETAMOL IV 1g ", "category": "SUPPLY"}]
    assert S.apply_decisions(reworded)[0]["status"] == "dismissed"


def test_a_materially_different_action_is_not_silently_hidden():
    """Different numbers mean a different action. Treating them as the same
    would hide a new problem under an old dismissal — the dangerous direction."""
    S.record(_key(ACTIONS[0]), title=ACTIONS[0]["title"], category="supply",
             urgency="high", status="dismissed", decided_by="pam")
    different = [{"title": "Reorder paracetamol IV 2g", "category": "supply"}]
    assert S.apply_decisions(different)[0]["status"] == "open"


def test_history_is_append_only_and_survives_the_action_disappearing():
    k = _key(ACTIONS[0])
    for status in ("approved", "done"):
        S.record(k, title=ACTIONS[0]["title"], category="supply", urgency="high",
                 status=status, decided_by="pam")
    rows = S.history(action_key_filter=k)
    assert [r["status"] for r in rows] == ["done", "approved"]   # newest first

    # The generator stops raising it; the record must still answer for it.
    assert S.apply_decisions([ACTIONS[1]])[0]["status"] == "open"
    assert len(S.history(action_key_filter=k)) == 2


def test_an_expired_snooze_reopens_without_a_scheduler():
    k = _key(ACTIONS[1])
    S.record(k, title=ACTIONS[1]["title"], category="staff", urgency="medium",
             status="snoozed", decided_by="pam", snooze_hours=-1)
    assert S.apply_decisions([ACTIONS[1]])[0]["status"] == "open"


def test_a_live_snooze_stays_snoozed():
    k = _key(ACTIONS[1])
    S.record(k, title=ACTIONS[1]["title"], category="staff", urgency="medium",
             status="snoozed", decided_by="pam", snooze_hours=24)
    out = S.apply_decisions([ACTIONS[1]])[0]
    assert out["status"] == "snoozed"
    assert out["snooze_until"] > time.time()


def test_summary_counts_overdue_work():
    S.record(_key(ACTIONS[0]), title=ACTIONS[0]["title"], category="supply", urgency="high",
             status="approved", decided_by="pam", due_date="2020-01-01")
    s = S.summary()
    assert s["counts"]["approved"] == 1
    assert s["overdue"] == 1, "an approved action past its due date is not being surfaced"


def test_closed_work_is_not_counted_overdue():
    S.record(_key(ACTIONS[0]), title=ACTIONS[0]["title"], category="supply", urgency="high",
             status="done", decided_by="pam", due_date="2020-01-01")
    assert S.summary()["overdue"] == 0


def test_unknown_status_is_rejected():
    with pytest.raises(ValueError):
        S.record(_key(ACTIONS[0]), title="x", category="supply", urgency="high",
                 status="yolo", decided_by="pam")
