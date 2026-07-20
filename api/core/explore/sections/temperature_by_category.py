"""Temperature lift by category — % change vs the mild-day baseline.

Buckets temperature into 5 bands and shows mean arrivals per category in
each band, expressed as % relative to the Q2 (mild) baseline.
"""
from __future__ import annotations
import numpy as np
import pandas as pd

from ..pipeline import AnalysisContext, GroupProfile


_BAND_LABELS = ["Cold (Q1)", "Cool (Q2)", "Mild (Q3)", "Warm (Q4)", "Hot (Q5)"]


def build_temperature_by_category(
    df: pd.DataFrame, profile: GroupProfile, ctx: AnalysisContext,
) -> dict:
    if not profile.weather_temp or not profile.target:
        return {"available": False}
    temp = pd.to_numeric(df[profile.weather_temp], errors="coerce")
    valid = temp.notna()
    if not valid.any():
        return {"available": False}
    quantiles = np.quantile(temp[valid], [0.0, 0.2, 0.4, 0.6, 0.8, 1.0])
    band = pd.cut(temp, bins=quantiles, include_lowest=True, labels=False, duplicates="drop")

    columns: list[tuple[str, str]] = []
    target_label = "Total demand"
    columns.append((profile.target, target_label))
    if profile.categories.get("specialty"):
        for col in profile.categories["specialty"]:
            if col in df.columns:
                label = col.replace("spec_", "").title()
                columns.append((col, label))

    series = {}
    for col, label in columns:
        y = pd.to_numeric(df[col], errors="coerce")
        v = band.notna() & y.notna()
        if not v.any():
            continue
        means = y[v].groupby(band[v].astype(int)).mean()
        # Baseline = mild (band index 2)
        baseline = float(means.get(2, means.mean()))
        if baseline <= 0:
            continue
        deltas = []
        for i in range(len(_BAND_LABELS)):
            if i in means.index:
                deltas.append(round((float(means.loc[i]) - baseline) / baseline * 100, 1))
            else:
                deltas.append(None)
        series[label] = deltas

    return {
        "available": True,
        "band_labels": _BAND_LABELS,
        "series": series,
        "baseline": "Mild (Q3) = 0%",
    }
