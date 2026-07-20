"""Two-line hourly profile: weekday curve and weekend curve."""
from __future__ import annotations
import pandas as pd

from ..pipeline import AnalysisContext, GroupProfile


WEEKDAY_DOWS = (0, 1, 2, 3, 4)
WEEKEND_DOWS = (5, 6)


def build_weekday_vs_weekend_hourly(
    df: pd.DataFrame, profile: GroupProfile, ctx: AnalysisContext,
) -> dict:
    if not profile.target or not profile.hour or not profile.day_of_week:
        return {"available": False}
    s   = pd.to_numeric(df[profile.target], errors="coerce")
    h   = pd.to_numeric(df[profile.hour], errors="coerce")
    dow = pd.to_numeric(df[profile.day_of_week], errors="coerce")
    valid = s.notna() & h.notna() & dow.notna()
    if not valid.any():
        return {"available": False}
    s, h, dow = s[valid], h[valid].astype(int), dow[valid].astype(int)

    def mean_curve(target_dows):
        mask = dow.isin(target_dows)
        if not mask.any():
            return [0.0] * 24
        means = s[mask].groupby(h[mask]).mean()
        return [round(float(means.get(hr, 0.0)), 2) for hr in range(24)]

    weekday = mean_curve(WEEKDAY_DOWS)
    weekend = mean_curve(WEEKEND_DOWS)
    peak_h    = int(max(range(24), key=lambda i: weekday[i]))
    trough_h  = int(min(range(24), key=lambda i: weekday[i]))
    return {
        "available": True,
        "weekday":   weekday,
        "weekend":   weekend,
        "peak_hour":   peak_h,
        "trough_hour": trough_h,
        "peak_value":   weekday[peak_h],
        "trough_value": weekday[trough_h],
    }
