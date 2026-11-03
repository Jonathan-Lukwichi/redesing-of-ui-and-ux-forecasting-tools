"""Staged months: the aggregates of each transformed register, keyed by month.

Held in RAM only (never written to disk). A re-uploaded month replaces the
staged one. Staged months stay staged after a run; ``mark_applied`` records
which versions the last run consumed, so ``unapplied`` can list what is new.
"""
from threading import RLock

from core.transform.month import MonthTables

_lock = RLock()
_months: dict[tuple[int, int], MonthTables] = {}
_applied: dict[tuple[int, int], str] = {}   # month -> sha256 the last run used


def put(month: MonthTables) -> None:
    with _lock:
        _months[(month.year, month.month)] = month


def months() -> list[MonthTables]:
    with _lock:
        return [_months[k] for k in sorted(_months)]


def clear() -> int:
    with _lock:
        n = len(_months)
        _months.clear()
        _applied.clear()
        return n


def mark_applied() -> None:
    with _lock:
        _applied.clear()
        _applied.update({k: m.sha256 for k, m in _months.items()})


def unapplied() -> list[str]:
    """Staged months a run has not yet consumed (new, or replaced since)."""
    with _lock:
        return [f"{y:04d}-{m:02d}" for (y, m) in sorted(_months)
                if _applied.get((y, m)) != _months[(y, m)].sha256]
