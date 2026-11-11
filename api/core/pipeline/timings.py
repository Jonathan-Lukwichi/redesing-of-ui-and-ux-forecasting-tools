"""How long each stage takes: the estimates the assistant quotes.

The numbers come from the server, never from the model. A fresh server quotes
DEFAULT_SECONDS. Once a stage has finished (done or amber), its latest time is
kept with the size of the data it ran on, and later estimates scale that time
to the data held now. Failed stages are never recorded.

Kept in RAM, keyed only by the stage ids in DEFAULT_SECONDS, so it stays a
dozen entries whatever runs.
"""
from __future__ import annotations

import math
import threading

from core import registry
from core.pipeline import staging

DEFAULT_SECONDS: dict[str, int] = {
    "load": 20, "check": 2, "transform": 3, "operations": 3, "consolidate": 5,
    "analyse": 8, "analyse_arrivals": 6, "analyse_staff": 1, "analyse_supply": 1,
    "forecast": 20, "optimise": 6, "recommend": 25,
}
UNKNOWN_SECONDS = 5
MIN_SECONDS, MAX_SECONDS = 1, 900

_LOCK = threading.Lock()
_RECORDED: dict[str, tuple[float, float]] = {}   # stage id -> (seconds, scale)


def scale_for(stage_id: str) -> float | None:
    """The size of the data a stage would run on now: the staged months for
    Transform, nothing for the sample loader, the daily arrival rows otherwise.
    None when the daily arrivals are absent or empty: a time measured then has
    no size to scale by, so it is neither recorded nor scaled."""
    if stage_id == "transform":
        return float(max(1, len(staging.months())))
    if stage_id == "load":
        return 1.0
    df = registry.get_df("daily_arrival")
    return float(len(df)) if df is not None and len(df) else None


def record(stage_id: str, seconds: float, scale: float | None) -> None:
    """Keep a finished stage's time and the scale it ran at (the latest wins)."""
    if stage_id not in DEFAULT_SECONDS or scale is None or scale <= 0:
        return
    with _LOCK:
        _RECORDED[stage_id] = (float(seconds), float(scale))


def estimate(stage_id: str) -> int:
    """Whole seconds this stage should take now, between 1 and 900."""
    if stage_id not in DEFAULT_SECONDS:
        return UNKNOWN_SECONDS
    with _LOCK:
        recorded = _RECORDED.get(stage_id)
    now = scale_for(stage_id) if recorded is not None else None
    if recorded is None or now is None:
        value = DEFAULT_SECONDS[stage_id]
    else:
        seconds, scale = recorded
        value = math.ceil(seconds * now / scale)
    return min(MAX_SECONDS, max(MIN_SECONDS, value))


def reset() -> None:
    """Forget every recorded time (tests)."""
    with _LOCK:
        _RECORDED.clear()
