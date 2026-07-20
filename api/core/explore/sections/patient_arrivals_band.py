"""Featured area chart: rolling daily mean with 95% prediction band.

Returns dates + mean line + ci_lower / ci_upper for the band.
"""
from __future__ import annotations
import math
import pandas as pd

from ..pipeline import AnalysisContext, GroupProfile


def build_patient_arrivals_band(
    df: pd.DataFrame, profile: GroupProfile, ctx: AnalysisContext,
    *, smoothing_window: int = 7,
) -> dict:
    if not profile.target or not profile.date:
        return {"available": False}
    s = pd.Series(
        pd.to_numeric(df[profile.target], errors="coerce").to_numpy(),
        index=pd.to_datetime(df[profile.date], errors="coerce"),
    ).dropna().sort_index()
    if s.empty:
        return {"available": False}
    roll = s.rolling(window=smoothing_window, min_periods=1)
    mean = roll.mean()
    std  = roll.std(ddof=0).fillna(0)
    n    = roll.count().clip(lower=1)
    ci   = 1.96 * std / n.pow(0.5)
    dates = [d.strftime("%Y-%m-%d") for d in mean.index]
    return {
        "available": True,
        "smoothing_window": smoothing_window,
        "dates":     dates,
        "mean":      mean.round(2).tolist(),
        "ci_lower":  (mean - ci).round(2).tolist(),
        "ci_upper":  (mean + ci).round(2).tolist(),
        "overall_mean": round(float(s.mean()), 2),
    }
