"""Calendar effects — % change vs a normal day for each calendar flag.

Returns a ranked list. Negative bars dominate when calendar conditions
suppress arrivals (holidays, festive season, weekends, …).
"""
from __future__ import annotations
import pandas as pd

from ..pipeline import AnalysisContext, GroupProfile


_FLAG_LABELS = {
    "is_public_holiday":   "Public holiday",
    "is_festive_season":   "Festive season",
    "is_long_weekend":     "Long weekend",
    "is_weekend":          "Weekend",
    "is_school_holiday":   "School holiday",
    "is_near_holiday":     "Near holiday",
    "is_winter_holiday":   "Winter holiday",
    "is_month_end_period": "Month-end",
    "is_december":         "December",
    "is_january":          "January",
}


def build_calendar_effects_ranked(
    df: pd.DataFrame, profile: GroupProfile, ctx: AnalysisContext,
) -> dict:
    if not profile.target:
        return {"available": False}
    y = pd.to_numeric(df[profile.target], errors="coerce")
    rows = []
    for col, label in _FLAG_LABELS.items():
        if col not in df.columns:
            continue
        flag = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)
        on  = y[flag == 1].dropna()
        off = y[flag == 0].dropna()
        if on.size < 5 or off.size < 5 or float(off.mean()) <= 0:
            continue
        pct = round((float(on.mean()) - float(off.mean())) / float(off.mean()) * 100, 1)
        rows.append({
            "label":         label,
            "pct_deviation": pct,
            "on_mean":       round(float(on.mean()), 2),
            "off_mean":      round(float(off.mean()), 2),
            "n_on":          int(on.size),
        })
    rows.sort(key=lambda r: r["pct_deviation"])
    return {"available": True, "rows": rows}
