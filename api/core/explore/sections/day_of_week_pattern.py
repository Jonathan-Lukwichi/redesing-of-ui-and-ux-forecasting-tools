"""Day-of-week pattern — bars showing mean arrivals per weekday."""
from __future__ import annotations
import pandas as pd

from ..pipeline import AnalysisContext, GroupProfile


_DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def build_day_of_week_pattern(
    df: pd.DataFrame, profile: GroupProfile, ctx: AnalysisContext,
) -> dict:
    if not profile.target or not profile.day_of_week:
        return {"available": False}
    s   = pd.to_numeric(df[profile.target], errors="coerce")
    dow = pd.to_numeric(df[profile.day_of_week], errors="coerce")
    valid = s.notna() & dow.notna()
    if not valid.any():
        return {"available": False}
    means = s[valid].groupby(dow[valid].astype(int)).mean()
    rows = []
    for i in range(7):
        if i in means.index:
            rows.append({"label": _DOW_LABELS[i], "mean": round(float(means.loc[i]), 2)})
        else:
            rows.append({"label": _DOW_LABELS[i], "mean": None})

    # Headline computed against Wednesday as the baseline (matches design).
    wed = next((r["mean"] for r in rows if r["label"] == "Wed"), None)
    busiest  = max((r for r in rows if r["mean"] is not None), key=lambda r: r["mean"])
    quietest = min((r for r in rows if r["mean"] is not None), key=lambda r: r["mean"])
    headline_vs_wed = None
    if wed and wed > 0 and busiest["mean"] is not None:
        headline_vs_wed = round((busiest["mean"] - wed) / wed * 100, 1)
    return {
        "available":     True,
        "rows":          rows,
        "busiest":       busiest,
        "quietest":      quietest,
        "vs_wednesday":  headline_vs_wed,
    }
