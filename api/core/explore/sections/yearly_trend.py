"""Yearly bar chart — total arrivals per calendar year."""
from __future__ import annotations
import pandas as pd

from ..pipeline import AnalysisContext, GroupProfile


def build_yearly_trend(
    df: pd.DataFrame, profile: GroupProfile, ctx: AnalysisContext,
) -> dict:
    if not profile.target or not profile.date:
        return {"available": False}
    s = pd.to_numeric(df[profile.target], errors="coerce")
    d = pd.to_datetime(df[profile.date], errors="coerce")
    valid = s.notna() & d.notna()
    if not valid.any():
        return {"available": False}
    grouped = s[valid].groupby(d[valid].dt.year)
    rows = []
    for year, vals in grouped:
        rows.append({
            "year":  int(year),
            "total": int(round(float(vals.sum()))),
            "mean":  round(float(vals.mean()), 2),
            "days":  int(vals.size),
        })
    rows.sort(key=lambda r: r["year"])
    return {"available": True, "rows": rows}
