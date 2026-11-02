"""One seam for "new data arrived, forget every computed result".

Each module that caches a result registers a clearer at import time. When the
data changes, invalidate_all() runs every clearer and bumps a version counter,
so stale forecasts, rosters and supply plans can never sit beside new data.
"""
from __future__ import annotations

import threading
from typing import Callable

_LOCK = threading.Lock()
_VERSION = 0
_CLEARERS: dict[str, Callable[[], None]] = {}


def current() -> int:
    with _LOCK:
        return _VERSION


def register(name: str, clear: Callable[[], None]) -> None:
    """Register (or replace) the clearer for one cache owner."""
    with _LOCK:
        _CLEARERS[name] = clear


def invalidate_all() -> int:
    """Run every clearer, bump the version and return it.

    A failing clearer never stops the others; the first error is re-raised
    after all of them have run.
    """
    global _VERSION
    with _LOCK:
        _VERSION += 1
        version = _VERSION
        clearers = list(_CLEARERS.values())
    first_error: Exception | None = None
    for clear in clearers:
        try:
            clear()
        except Exception as exc:  # noqa: BLE001 - keep clearing the rest
            if first_error is None:
                first_error = exc
    if first_error is not None:
        raise first_error
    return version
