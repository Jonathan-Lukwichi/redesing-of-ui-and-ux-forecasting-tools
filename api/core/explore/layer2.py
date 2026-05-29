"""
Layer 2 — Hourly disaggregation calibration (works on G2).

hourly_profile: mean arrivals per hour 0..23 with 95% CI band, plus separate
day-of-week curves for the heatmap view. Peak-to-trough ratio is reported as a
single scalar.
"""
from __future__ import annotations
from typing import Any
import math

import numpy as np
import pandas as pd


def hourly_profile(df: pd.DataFrame, target_col: str = "arrival_count") -> dict[str, Any]:
    if target_col not in df.columns or "hour" not in df.columns:
        return {"available": False}

    s = pd.to_numeric(df[target_col], errors="coerce")
    h = pd.to_numeric(df["hour"], errors="coerce")
    valid = s.notna() & h.notna()
    s = s[valid]
    h = h[valid].astype(int)

    if s.empty:
        return {"available": False}

    grouped = pd.DataFrame({"hour": h.to_numpy(), "v": s.to_numpy()}).groupby("hour")["v"]
    rows = []
    for hour in range(24):
        if hour in grouped.groups:
            arr = grouped.get_group(hour).to_numpy()
            mean = float(arr.mean())
            std  = float(arr.std(ddof=1)) if arr.size > 1 else 0.0
            ci   = 1.96 * std / math.sqrt(arr.size) if arr.size > 0 else 0.0
        else:
            mean = 0.0; std = 0.0; ci = 0.0
        rows.append({
            "hour":    hour,
            "mean":    round(mean, 2),
            "std":     round(std, 2),
            "ci_low":  round(mean - ci, 2),
            "ci_high": round(mean + ci, 2),
        })

    means = np.array([r["mean"] for r in rows], dtype=float)
    peak_to_trough = round(float(means.max() / means.min()), 2) if means.min() > 0 else None

    # Per-day-of-week mean curve (optional, used for heatmap).
    dow_curves: dict[str, list[float]] = {}
    if "day_of_week" in df.columns:
        dow_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        dow_series = pd.to_numeric(df["day_of_week"], errors="coerce")
        dow_valid = dow_series.notna()
        sub = pd.DataFrame({
            "dow":  dow_series[dow_valid].astype(int).to_numpy(),
            "hour": h[dow_valid].to_numpy(),
            "v":    s[dow_valid].to_numpy(),
        })
        pivot = sub.groupby(["dow", "hour"])["v"].mean().unstack(fill_value=0)
        for dow_idx in range(7):
            if dow_idx in pivot.index:
                row = pivot.loc[dow_idx]
                curve = [round(float(row.get(h, 0.0)), 2) for h in range(24)]
            else:
                curve = [0.0] * 24
            dow_curves[dow_labels[dow_idx]] = curve

    return {
        "available":   True,
        "target":      target_col,
        "n":           int(s.size),
        "rows":        rows,
        "peak_to_trough_ratio": peak_to_trough,
        "dow_curves":  dow_curves,
    }
