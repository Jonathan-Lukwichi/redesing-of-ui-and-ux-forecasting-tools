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

# Frames derived from uploaded operations files (core/ops_derive.py). When set,
# ``load`` serves these and never fetches. Deliberately NOT registered with
# data_version: a run invalidates results first, then publishes the new frames.
_UPLOADED: dict[str, pd.DataFrame] = {}
_META: dict[str, object] = {"origin": None, "posts": None}


def publish(frames: dict[str, pd.DataFrame], origin: str, posts: int | None = None) -> None:
    """Serve ``frames`` from ``load`` in place of the bundled simulation files.

    The new dict is built first and rebound in one assignment, so a reader never
    sees it emptied mid-publish and falls back to the bundled data."""
    global _UPLOADED
    _UPLOADED = dict(frames)
    _META["origin"] = origin
    _META["posts"] = posts


def unpublish() -> None:
    """Go back to the repo / bundled simulation files."""
    global _UPLOADED
    _UPLOADED = {}
    _META["origin"] = None
    _META["posts"] = None


def is_uploaded() -> bool:
    return bool(_UPLOADED)


def origin() -> str | None:
    return _META["origin"]  # type: ignore[return-value]


def posts() -> int | None:
    return _META["posts"]  # type: ignore[return-value]


async def load(name: str) -> pd.DataFrame:
    """Load one simulation CSV by filename (e.g. 'supply_items.csv')."""
    uploaded = _UPLOADED   # one read: a publish may rebind it meanwhile
    if uploaded:
        if name not in uploaded:
            raise FileNotFoundError(f"{name} is not part of the uploaded operations data.")
        return uploaded[name]
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
