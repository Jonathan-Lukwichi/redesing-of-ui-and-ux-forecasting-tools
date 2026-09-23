"""Durable decisions on the Action Center.

Why this exists
---------------
`src/pages/ActionCenter.jsx` held approve / snooze / dismiss in
`useState({})`. Every decision vanished on refresh, nothing recorded WHO made
it, and there was no way to ask what happened to the thing approved last
Tuesday. An action list that forgets is a demo, not an operations tool: the
whole value of the loop is accountability, and accountability needs a record.

Storage
-------
SQLite on a local file. The deployment is one 512MB container, decisions are
low-volume and small, and SQLite gives durability, atomicity and a queryable
history with no extra service. The path is configurable so a deployment with a
persistent disk can point it there; the default lives beside the code and is
explicitly documented as ephemeral on a container that has no volume.

Identity of an action
---------------------
The generator (`api/ai/actions.py`) produces a ranked list from live signals on
every call, with no stable ids. So an action's identity is derived from its
content: a hash of (category, normalised title). That means the same underlying
problem keeps its decision across regenerations — snooze "Reorder paracetamol IV"
today and it stays snoozed tomorrow — while a genuinely new problem arrives
undecided. It also means a materially reworded title is treated as a new action,
which is the safer failure: showing something twice beats silently hiding it.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Optional

# Decision vocabulary. `open` is the implicit state of anything not yet decided.
STATUSES = ("open", "approved", "snoozed", "dismissed", "done")
_TERMINAL = ("done", "dismissed")

_DEFAULT_PATH = Path(__file__).resolve().parent.parent / "data" / "action_decisions.sqlite3"
_lock = threading.Lock()
_conn: Optional[sqlite3.Connection] = None


def _db_path() -> Path:
    raw = (os.getenv("ACTION_DB_PATH") or "").strip()
    return Path(raw) if raw else _DEFAULT_PATH


def _connect() -> sqlite3.Connection:
    global _conn
    if _conn is not None:
        return _conn
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    # check_same_thread=False because FastAPI serves from a threadpool; every
    # write goes through _lock, so the connection is never used concurrently.
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS action_decisions (
            action_key   TEXT PRIMARY KEY,
            title        TEXT NOT NULL,
            category     TEXT NOT NULL,
            urgency      TEXT,
            status       TEXT NOT NULL,
            owner        TEXT,
            due_date     TEXT,
            note         TEXT,
            decided_by   TEXT NOT NULL,
            decided_at   REAL NOT NULL,
            snooze_until REAL
        );
        CREATE TABLE IF NOT EXISTS action_history (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            action_key  TEXT NOT NULL,
            title       TEXT,
            status      TEXT NOT NULL,
            owner       TEXT,
            due_date    TEXT,
            note        TEXT,
            decided_by  TEXT NOT NULL,
            decided_at  REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ix_history_key ON action_history(action_key);
        CREATE INDEX IF NOT EXISTS ix_history_at  ON action_history(decided_at);
        """
    )
    conn.commit()
    _conn = conn
    return conn


def reset_for_tests(path: Optional[str] = None) -> None:
    """Close and rebind the connection. Tests only."""
    global _conn
    with _lock:
        if _conn is not None:
            _conn.close()
            _conn = None
        if path is not None:
            os.environ["ACTION_DB_PATH"] = path


# ── Identity ─────────────────────────────────────────────────────────────────

def action_key(category: str, title: str) -> str:
    """Stable id from content. Case and whitespace are normalised so trivial
    rewording does not orphan a decision; numbers are kept, because 'order 40
    units' and 'order 400 units' are genuinely different actions."""
    norm = re.sub(r"\s+", " ", (title or "").strip().lower())
    raw = f"{(category or '').strip().lower()}|{norm}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:20]


# ── Reads ────────────────────────────────────────────────────────────────────

def _row_to_decision(row: sqlite3.Row) -> dict[str, Any]:
    d = dict(row)
    # A snooze that has run out is reported as open again. Storing the expiry
    # rather than a flag means nothing has to run on a schedule to wake it.
    if d.get("status") == "snoozed" and d.get("snooze_until") and d["snooze_until"] <= time.time():
        d["status"] = "open"
        d["snooze_expired"] = True
    return d


def decisions() -> dict[str, dict[str, Any]]:
    conn = _connect()
    rows = conn.execute("SELECT * FROM action_decisions").fetchall()
    return {r["action_key"]: _row_to_decision(r) for r in rows}


def history(limit: int = 100, action_key_filter: Optional[str] = None) -> list[dict[str, Any]]:
    conn = _connect()
    limit = max(1, min(int(limit), 500))
    if action_key_filter:
        rows = conn.execute(
            "SELECT * FROM action_history WHERE action_key = ? "
            "ORDER BY decided_at DESC LIMIT ?", (action_key_filter, limit)).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM action_history ORDER BY decided_at DESC LIMIT ?", (limit,)).fetchall()
    return [dict(r) for r in rows]


def apply_decisions(actions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Attach each freshly generated action's stored decision, if any.

    Actions the generator no longer raises simply stop appearing; their history
    survives, which is what makes 'what happened to that?' answerable."""
    stored = decisions()
    out = []
    for a in actions:
        key = action_key(a.get("category", ""), a.get("title", ""))
        d = stored.get(key)
        enriched = dict(a)
        enriched["action_key"] = key
        enriched["status"] = (d or {}).get("status", "open")
        enriched["owner"] = (d or {}).get("owner")
        enriched["due_date"] = (d or {}).get("due_date")
        enriched["note"] = (d or {}).get("note")
        enriched["decided_by"] = (d or {}).get("decided_by")
        enriched["decided_at"] = (d or {}).get("decided_at")
        enriched["snooze_until"] = (d or {}).get("snooze_until")
        out.append(enriched)
    return out


# ── Writes ───────────────────────────────────────────────────────────────────

def record(action_key_value: str, *, title: str, category: str, urgency: Optional[str],
           status: str, decided_by: str, owner: Optional[str] = None,
           due_date: Optional[str] = None, note: Optional[str] = None,
           snooze_hours: Optional[float] = None) -> dict[str, Any]:
    """Set an action's state and append to the immutable history.

    Every write names the person: `decided_by` is taken from the authenticated
    session, never from the request body, so the trail cannot be forged by a
    caller claiming to be someone else."""
    if status not in STATUSES:
        raise ValueError(f"unknown status {status!r}")
    now = time.time()
    snooze_until = now + float(snooze_hours) * 3600 if (status == "snoozed" and snooze_hours) else None

    with _lock:
        conn = _connect()
        conn.execute(
            """INSERT INTO action_decisions
                 (action_key, title, category, urgency, status, owner, due_date,
                  note, decided_by, decided_at, snooze_until)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(action_key) DO UPDATE SET
                 title=excluded.title, category=excluded.category,
                 urgency=excluded.urgency, status=excluded.status,
                 owner=excluded.owner, due_date=excluded.due_date,
                 note=excluded.note, decided_by=excluded.decided_by,
                 decided_at=excluded.decided_at, snooze_until=excluded.snooze_until""",
            (action_key_value, title, category, urgency, status, owner, due_date,
             note, decided_by, now, snooze_until),
        )
        conn.execute(
            """INSERT INTO action_history
                 (action_key, title, status, owner, due_date, note, decided_by, decided_at)
               VALUES (?,?,?,?,?,?,?,?)""",
            (action_key_value, title, status, owner, due_date, note, decided_by, now),
        )
        conn.commit()
    return {"action_key": action_key_value, "status": status, "decided_by": decided_by,
            "decided_at": now, "snooze_until": snooze_until}


def summary() -> dict[str, Any]:
    """Counts by status, plus what is overdue — the closed-loop view."""
    conn = _connect()
    rows = conn.execute("SELECT * FROM action_decisions").fetchall()
    counts: dict[str, int] = {s: 0 for s in STATUSES}
    overdue = 0
    today = time.strftime("%Y-%m-%d")
    for r in rows:
        d = _row_to_decision(r)
        counts[d["status"]] = counts.get(d["status"], 0) + 1
        if d["status"] not in _TERMINAL and d.get("due_date") and d["due_date"] < today:
            overdue += 1
    total_decisions = conn.execute("SELECT COUNT(*) AS n FROM action_history").fetchone()["n"]
    return {"counts": counts, "overdue": overdue, "decisions_recorded": total_decisions}
