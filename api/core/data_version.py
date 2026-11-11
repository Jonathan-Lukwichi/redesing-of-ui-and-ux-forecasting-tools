"""One seam for "new data arrived, forget every computed result".

Each module that caches a result registers a clearer at import time. When the
data changes, invalidate_all() runs every clearer and bumps a version counter,
so stale forecasts, rosters and supply plans can never sit beside new data.
"""
from __future__ import annotations

import threading
from typing import Callable, Iterable

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
    return _bump_and_run(None)


def _bump_and_run(wanted: set[str] | None) -> int:
    """Bump the version, then run the wanted clearers (all when None) in
    registration order. Unknown names raise ValueError before anything runs or
    the version moves. A failing clearer never stops the others; the first
    error is re-raised after all of them have run."""
    global _VERSION
    with _LOCK:
        if wanted is not None:
            unknown = sorted(n for n in wanted if n not in _CLEARERS)
            if unknown:
                raise ValueError(f"Unknown cache owner(s): {', '.join(unknown)}")
        _VERSION += 1
        version = _VERSION
        clearers = [c for n, c in _CLEARERS.items() if wanted is None or n in wanted]
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


def invalidate(names: Iterable[str]) -> int:
    """Run only the named clearers (in registration order), bump the version and
    return it.

    An unknown name raises ValueError before any clearer runs. Like
    invalidate_all, the first clearer error is re-raised after all have run.
    """
    return _bump_and_run(set(names))
