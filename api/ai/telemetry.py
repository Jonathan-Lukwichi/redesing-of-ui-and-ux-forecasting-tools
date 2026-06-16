"""In-memory token/cost log for the AI assistant (per-process ring buffer).

Powers the admin usage tile and the daily budget cap. Resets on restart.
"""
from __future__ import annotations
from collections import deque
from datetime import date, datetime, timezone
from typing import Any

from ai import config

_LOG: deque[dict] = deque(maxlen=500)


def record(surface: str, model: str, in_tokens: int, out_tokens: int) -> dict:
    entry = {
        "ts":         datetime.now(timezone.utc).isoformat(),
        "day":        date.today().isoformat(),
        "surface":    surface,
        "model":      model,
        "in_tokens":  int(in_tokens),
        "out_tokens": int(out_tokens),
        "cost_usd":   config.cost_usd(model, in_tokens, out_tokens),
    }
    _LOG.append(entry)
    return entry


def spent_today_usd() -> float:
    today = date.today().isoformat()
    return round(sum(e["cost_usd"] for e in _LOG if e["day"] == today), 6)


def remaining_budget_usd() -> float:
    return round(max(0.0, config.daily_budget_usd() - spent_today_usd()), 6)


def over_budget() -> bool:
    return spent_today_usd() >= config.daily_budget_usd()


def summary() -> dict[str, Any]:
    return {
        "spent_today_usd":     spent_today_usd(),
        "daily_budget_usd":    config.daily_budget_usd(),
        "remaining_usd":       remaining_budget_usd(),
        "calls_today":         sum(1 for e in _LOG if e["day"] == date.today().isoformat()),
        "recent":             list(_LOG)[-10:][::-1],
    }
