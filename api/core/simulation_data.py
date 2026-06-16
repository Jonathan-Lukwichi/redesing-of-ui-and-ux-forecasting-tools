"""Loader for the chapter-7 simulation CSVs (Staff scheduling + Supply inventory).

Primary source is the GitHub data repo under ``simulation/`` (fetched via
``data_source.fetch_raw``); if that file isn't there yet (or fetch fails) we
fall back to the bundled local copy in ``api/data/simulation/``. Frames are
cached for the process lifetime.
"""
from __future__ import annotations
import io
from pathlib import Path

import pandas as pd

from core import data_source

_LOCAL = Path(__file__).resolve().parent.parent / "data" / "simulation"
_CACHE: dict[str, pd.DataFrame] = {}


async def load(name: str) -> pd.DataFrame:
    """Load one simulation CSV by filename (e.g. 'supply_items.csv')."""
    if name in _CACHE:
        return _CACHE[name]

    df: pd.DataFrame | None = None
    # Primary: the data repo, under simulation/
    try:
        raw = await data_source.fetch_raw(f"simulation/{name}")
        df = pd.read_csv(io.BytesIO(raw))
    except Exception:
        df = None
    # Fallback: bundled local copy
    if df is None:
        p = _LOCAL / name
        if p.exists():
            df = pd.read_csv(p)
    if df is None:
        raise FileNotFoundError(
            f"simulation/{name} not found in the data repo or local fallback "
            f"({_LOCAL}). Push the curated CSVs to the repo's simulation/ folder."
        )
    _CACHE[name] = df
    return df


def clear_cache() -> None:
    _CACHE.clear()
