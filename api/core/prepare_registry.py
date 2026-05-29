"""
In-memory cache for joined groups (G1–G4). Same pattern as the dataset
registry but keyed by group id. Last-built wins.
"""
from __future__ import annotations
from dataclasses import dataclass
from threading import RLock
from typing import Any

import pandas as pd


@dataclass
class GroupEntry:
    df: pd.DataFrame
    metadata: dict[str, Any]


_lock = RLock()
_entries: dict[str, GroupEntry] = {}


def put(group_id: str, df: pd.DataFrame, metadata: dict[str, Any]) -> None:
    with _lock:
        _entries[group_id] = GroupEntry(df=df, metadata=metadata)


def get(group_id: str) -> GroupEntry | None:
    with _lock:
        return _entries.get(group_id)


def get_df(group_id: str) -> pd.DataFrame | None:
    e = get(group_id)
    return e.df if e else None


def get_metadata(group_id: str) -> dict[str, Any] | None:
    e = get(group_id)
    return e.metadata if e else None


def clear(group_id: str) -> bool:
    with _lock:
        return _entries.pop(group_id, None) is not None


def clear_all() -> None:
    with _lock:
        _entries.clear()


def loaded_ids() -> list[str]:
    with _lock:
        return list(_entries.keys())
