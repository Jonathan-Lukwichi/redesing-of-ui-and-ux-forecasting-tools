"""Hour × Day-of-week heatmap with discrete intensity bands.

Matches the design's 5-band ("Very quiet" → "Peak") heatmap. Bands are
derived from the actual data distribution so the chart self-calibrates
when the dataset changes.
"""
from __future__ import annotations
import numpy as np
import pandas as pd

from ..pipeline import AnalysisContext, GroupProfile


_DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
_BAND_LABELS = ["Very quiet", "Quiet", "Moderate", "Busy", "Peak"]


def build_hour_dow_banded(
    df: pd.DataFrame, profile: GroupProfile, ctx: AnalysisContext,
) -> dict:
    if not profile.target or not profile.hour or not profile.day_of_week:
        return {"available": False}
    y   = pd.to_numeric(df[profile.target], errors="coerce")
    h   = pd.to_numeric(df[profile.hour], errors="coerce")
    dow = pd.to_numeric(df[profile.day_of_week], errors="coerce")
    valid = y.notna() & h.notna() & dow.notna()
    if not valid.any():
        return {"available": False}
    y, h, dow = y[valid], h[valid].astype(int), dow[valid].astype(int)

    # Hour x DoW mean grid.
    grid_means = (
        pd.DataFrame({"y": y.to_numpy(), "h": h.to_numpy(), "dow": dow.to_numpy()})
        .groupby(["dow", "h"])["y"].mean()
        .unstack(fill_value=0.0)
    )
    rows = []
    bins = np.quantile(grid_means.to_numpy().flatten(), [0.0, 0.2, 0.4, 0.6, 0.8, 1.0])
    for dow_idx in range(7):
        row_values = []
        for hour in range(24):
            val = float(grid_means.loc[dow_idx, hour]) if (dow_idx in grid_means.index and hour in grid_means.columns) else 0.0
            band_idx = int(np.searchsorted(bins[1:], val, side="left"))
            band_idx = max(0, min(4, band_idx))
            row_values.append({"value": round(val, 2), "band": band_idx})
        rows.append({"label": _DOW_LABELS[dow_idx], "cells": row_values})
    return {
        "available": True,
        "bands":     _BAND_LABELS,
        "thresholds": [round(float(b), 2) for b in bins],
        "rows":      rows,
    }
