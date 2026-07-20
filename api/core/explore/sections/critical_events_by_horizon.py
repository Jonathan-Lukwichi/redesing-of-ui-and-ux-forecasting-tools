"""Critical-event load per Day / Week / Month horizon.

Aggregates rows from the EVENT_FAMILIES catalogue (gunshot, stab wound,
common assault, etc.) and reports their mean rate per horizon.
"""
from __future__ import annotations
import pandas as pd

from ..pipeline import AnalysisContext, GroupProfile
from ..task3 import EVENT_FAMILIES


_HORIZON_MULTIPLIER = {"day": 1, "week": 7, "month": 30}


def build_critical_events_by_horizon(
    df: pd.DataFrame, profile: GroupProfile, ctx: AnalysisContext,
    *, horizon: str = "week",
) -> dict:
    mult = _HORIZON_MULTIPLIER.get(horizon, 7)
    rows = []
    for label, cols in EVENT_FAMILIES.items():
        present = [c for c in cols if c in df.columns]
        if not present:
            continue
        series = df[present].apply(pd.to_numeric, errors="coerce").fillna(0).sum(axis=1)
        if series.dropna().empty:
            continue
        mean = float(series.mean())
        rows.append({
            "category": label,
            "value":    round(mean * mult, 2),
        })
    rows.sort(key=lambda r: r["value"], reverse=True)
    return {
        "available":     True,
        "horizon":       horizon,
        "horizon_label": {"day": "per day", "week": "per week", "month": "per month"}.get(horizon, "per week"),
        "rows":          rows,
    }
