"""Per-category volume per Day / Week / Month / Year horizon.

Returns horizontal-bar data: each category's mean throughput at the
requested horizon. Used by the design's "Medicine dwarfs every other
specialty" card with its Day/Week/Month/Year toggle.
"""
from __future__ import annotations
import pandas as pd

from ..pipeline import AnalysisContext, GroupProfile


_HORIZON_MULTIPLIER = {
    "day":   1,
    "week":  7,
    "month": 30,
    "year":  365,
}


def build_category_volume_by_horizon(
    df: pd.DataFrame, profile: GroupProfile, ctx: AnalysisContext,
    *, horizon: str = "day",
) -> dict:
    cols = [c for c in (profile.categories.get("specialty") or []) if c in df.columns]
    if not cols:
        return {"available": False}
    mult = _HORIZON_MULTIPLIER.get(horizon, 1)
    horizon_label = {
        "day":   "per day", "week": "per week",
        "month": "per month", "year": "per year",
    }.get(horizon, "per day")

    rows = []
    for col in cols:
        y = pd.to_numeric(df[col], errors="coerce")
        if y.dropna().empty:
            continue
        mean = float(y.mean())
        rows.append({
            "category": col.replace("spec_", "").title(),
            "value":    round(mean * mult, 2),
        })
    rows.sort(key=lambda r: r["value"], reverse=True)
    return {
        "available":      True,
        "horizon":        horizon,
        "horizon_label":  horizon_label,
        "rows":           rows,
    }
