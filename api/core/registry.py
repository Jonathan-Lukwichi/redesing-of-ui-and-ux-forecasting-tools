"""
In-memory dataset registry. The 7 source files live here for the lifetime of
the FastAPI process — never persisted to disk, never cached across restarts.
This is deliberate: the hospital data is private and the privacy demo model
is "user uploads each session".
"""
from __future__ import annotations
from dataclasses import dataclass, field
from threading import RLock
from typing import Any

import pandas as pd


def slim_numeric(df: pd.DataFrame) -> pd.DataFrame:
    """Halve the memory of numeric columns (float64->float32, int64->int32).
    The data is counts, temperatures and flags — float32's 7 significant
    digits are far more precision than the domain carries. JSON responses
    are numpy-safe via the orjson encoder in main.py."""
    for col in df.columns:
        dt = str(df[col].dtype)
        if dt == "float64":
            df[col] = df[col].astype("float32")
        elif dt == "int64":
            df[col] = df[col].astype("int32")
    return df


@dataclass
class DatasetEntry:
    """One uploaded dataset, indexed by schema id."""
    df: pd.DataFrame
    metadata: dict[str, Any]


_lock = RLock()
_entries: dict[str, DatasetEntry] = {}


def put(dataset_id: str, df: pd.DataFrame, metadata: dict[str, Any]) -> None:
    with _lock:
        _entries[dataset_id] = DatasetEntry(df=slim_numeric(df), metadata=metadata)


def get(dataset_id: str) -> DatasetEntry | None:
    with _lock:
        return _entries.get(dataset_id)


def get_df(dataset_id: str) -> pd.DataFrame | None:
    entry = get(dataset_id)
    return entry.df if entry else None


def get_metadata(dataset_id: str) -> dict[str, Any] | None:
    entry = get(dataset_id)
    return entry.metadata if entry else None


def clear(dataset_id: str) -> bool:
    with _lock:
        return _entries.pop(dataset_id, None) is not None


def clear_all() -> None:
    with _lock:
        _entries.clear()


def loaded_ids() -> list[str]:
    with _lock:
        return list(_entries.keys())
