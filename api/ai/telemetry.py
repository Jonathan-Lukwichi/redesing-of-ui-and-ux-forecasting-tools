"""Token/cost telemetry for the AI assistant.

The daily budget cap is enforced from the DURABLE audit log (ai/audit.py), so a
server restart can no longer reset today's spend to zero. The in-memory ring
buffer remains only as a fast "recent calls" feed for the admin tile.
Day boundaries are UTC, matching the audit timestamps.
"""
from __future__ import annotations
from collections import deque
from datetime import datetime, timezone
from typing import Any

from ai import config

_LOG: deque[dict] = deque(maxlen=500)


def _utc_day() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def record(surface: str, model: str, in_tokens: int, out_tokens: int) -> dict:
    entry = {
        "ts":         datetime.now(timezone.utc).isoformat(),
        "day":        _utc_day(),
        "surface":    surface,
        "model":      model,
        "in_tokens":  int(in_tokens),
        "out_tokens": int(out_tokens),
        "cost_usd":   config.cost_usd(model, in_tokens, out_tokens),
    }
    _LOG.append(entry)
    return entry


def spent_today_usd() -> float:
    """Durable: read from the audit JSONL, not the restartable ring buffer."""
    from ai import audit
    return audit.day_cost_usd(_utc_day())


def remaining_budget_usd() -> float:
    return round(max(0.0, config.daily_budget_usd() - spent_today_usd()), 6)


def over_budget() -> bool:
    return spent_today_usd() >= config.daily_budget_usd()


def summary() -> dict[str, Any]:
    from ai import audit
    today = _utc_day()
    return {
        "spent_today_usd":  spent_today_usd(),
        "daily_budget_usd": config.daily_budget_usd(),
        "remaining_usd":    remaining_budget_usd(),
        "calls_today":      audit.day_calls(today),
        "recent":           list(_LOG)[-10:][::-1],
    }
