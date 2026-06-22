"""Durable audit trail for every AI interaction (responsible-AI / accountability).

WHO principle 4 (responsibility & accountability) and POPIA's accountability
principle expect a persistent, reconstructable record of what the AI was asked,
what it answered, with which model, and at what cost. The token/cost telemetry
(ai/telemetry.py) is an in-memory ring buffer that resets on restart; THIS module
is the durable complement — an append-only JSONL log on disk.

It records only operational/aggregate content (no patient-level data ever reaches
the AI layer), and the stored responses are already confidentiality-scrubbed
(ai/redact.py), so the log itself contains no PHI and no hospital identity.
"""
from __future__ import annotations
import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any

from ai import config

_DIR = Path(__file__).resolve().parent.parent / "data"
_FILE = _DIR / "ai_audit.jsonl"
_LOCK = Lock()

_REQ_MAX = 4000      # truncate the stored request context
_RESP_MAX = 8000     # truncate the stored response


def log_event(surface: str, model: str, request: str, response: str,
              in_tokens: int = 0, out_tokens: int = 0,
              extra: dict[str, Any] | None = None) -> dict[str, Any]:
    """Append one durable audit record. Best-effort: never raises into the
    request path (a logging failure must not break the user's response)."""
    entry = {
        "ts":         datetime.now(timezone.utc).isoformat(),
        "surface":    surface,
        "model":      model,
        "request":    (request or "")[:_REQ_MAX],
        "response":   (response or "")[:_RESP_MAX],
        "in_tokens":  int(in_tokens or 0),
        "out_tokens": int(out_tokens or 0),
        "cost_usd":   config.cost_usd(model, in_tokens or 0, out_tokens or 0),
    }
    if extra:
        entry.update(extra)
    try:
        with _LOCK:
            _DIR.mkdir(parents=True, exist_ok=True)
            with open(_FILE, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        pass  # auditing must never break the response
    return entry


def _read() -> list[dict[str, Any]]:
    if not _FILE.exists():
        return []
    with _LOCK:
        lines = _FILE.read_text(encoding="utf-8").splitlines()
    out = []
    for line in lines:
        try:
            out.append(json.loads(line))
        except Exception:
            continue
    return out


def recent(n: int = 50) -> list[dict[str, Any]]:
    """Most-recent-first audit records (capped)."""
    return _read()[-max(1, min(n, 500)):][::-1]


def stats() -> dict[str, Any]:
    rows = _read()
    by_surface: dict[str, int] = {}
    total_cost = 0.0
    for r in rows:
        by_surface[r.get("surface", "?")] = by_surface.get(r.get("surface", "?"), 0) + 1
        total_cost += float(r.get("cost_usd") or 0)
    first = rows[0]["ts"] if rows else None
    last = rows[-1]["ts"] if rows else None
    return {
        "total_events":   len(rows),
        "by_surface":     by_surface,
        "total_cost_usd": round(total_cost, 6),
        "first_event":    first,
        "last_event":     last,
        "log_file":       str(_FILE),
    }
