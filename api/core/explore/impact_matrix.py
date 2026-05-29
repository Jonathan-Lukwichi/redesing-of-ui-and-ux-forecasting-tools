"""
Consolidated impact matrix (works on G1).

For each external feature (calendar binaries + weather quartiles) we report
the percentage deviation of mean(target) when the condition is true vs the
overall mean, plus a Welch t-test p-value for significance.
"""
from __future__ import annotations
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats


BINARY_CALENDAR_FEATURES = (
    "is_weekend",
    "is_public_holiday",
    "is_near_holiday",
    "is_long_weekend",
    "is_school_holiday",
    "is_festive_season",
    "is_month_end_period",
    "is_december",
)

CONTINUOUS_WEATHER_FEATURES = (
    "temp_mean_C",
    "temp_max_C",
    "temp_min_C",
    "precipitation_mm",
    "humidity_mean_pct",
    "wind_max_kmh",
)


def _binary_impact(df: pd.DataFrame, feature: str, target: np.ndarray) -> dict[str, Any] | None:
    if feature not in df.columns:
        return None
    flag = pd.to_numeric(df[feature], errors="coerce")
    on  = target[flag == 1]
    off = target[flag == 0]
    on = on[np.isfinite(on)]
    off = off[np.isfinite(off)]
    if on.size < 5 or off.size < 5:
        return None
    base = float(off.mean())
    if base == 0:
        return None
    pct = round((float(on.mean()) - base) / base * 100, 2)
    try:
        _, p = stats.ttest_ind(on, off, equal_var=False, nan_policy="omit")
        p = float(p)
    except Exception:
        p = None
    return {
        "feature": feature,
        "kind":    "binary",
        "level":   "true",
        "n_on":    int(on.size),
        "n_off":   int(off.size),
        "mean_on":  round(float(on.mean()), 2),
        "mean_off": round(base, 2),
        "pct_deviation": pct,
        "p_value": None if p is None or np.isnan(p) else round(p, 4),
    }


def _quartile_impact(df: pd.DataFrame, feature: str, target: np.ndarray) -> list[dict[str, Any]]:
    if feature not in df.columns:
        return []
    x = pd.to_numeric(df[feature], errors="coerce").to_numpy()
    valid = np.isfinite(x) & np.isfinite(target)
    if valid.sum() < 40:
        return []
    x = x[valid]
    y = target[valid]

    edges = np.quantile(x, [0, 0.25, 0.5, 0.75, 1.0])
    bins  = np.digitize(x, edges[1:-1], right=False)  # 0..3 for Q1..Q4
    grand = float(np.mean(y))
    if grand == 0:
        return []

    out: list[dict[str, Any]] = []
    for q in range(4):
        sel = (bins == q)
        if sel.sum() < 5:
            continue
        m = float(np.mean(y[sel]))
        try:
            _, p = stats.ttest_ind(y[sel], y[~sel], equal_var=False, nan_policy="omit")
            p = float(p)
        except Exception:
            p = None
        out.append({
            "feature": feature,
            "kind":    "quartile",
            "level":   f"Q{q+1}",
            "n_on":    int(sel.sum()),
            "n_off":   int((~sel).sum()),
            "mean_on": round(m, 2),
            "mean_off": round(grand, 2),
            "pct_deviation": round((m - grand) / grand * 100, 2),
            "p_value": None if p is None or np.isnan(p) else round(p, 4),
        })
    return out


def impact_matrix(df: pd.DataFrame, target_col: str = "total_daily_arrivals") -> dict[str, Any]:
    if target_col not in df.columns:
        return {"available": False}

    target = pd.to_numeric(df[target_col], errors="coerce").to_numpy()
    rows: list[dict[str, Any]] = []

    for feat in BINARY_CALENDAR_FEATURES:
        r = _binary_impact(df, feat, target)
        if r is not None:
            rows.append(r)

    for feat in CONTINUOUS_WEATHER_FEATURES:
        rows.extend(_quartile_impact(df, feat, target))

    # Pivot to a feature × level grid for the heatmap. Use the most extreme
    # quartile's value for continuous, raw % for binary.
    grid_rows: dict[str, dict[str, Any]] = {}
    for r in rows:
        key = r["feature"]
        grid_rows.setdefault(key, {"feature": r["feature"], "kind": r["kind"]})
        grid_rows[key][r["level"]] = {
            "pct": r["pct_deviation"],
            "p":   r["p_value"],
            "n_on": r["n_on"],
        }

    return {
        "available":     True,
        "target":        target_col,
        "rows":          list(grid_rows.values()),
        "binary_levels": ["true"],
        "quartile_levels": ["Q1", "Q2", "Q3", "Q4"],
    }
