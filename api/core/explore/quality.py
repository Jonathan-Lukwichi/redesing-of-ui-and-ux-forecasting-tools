"""
Data-quality EDA analyses for the Explore page.

- missingness: per-column missing count + percentage
- outliers:    daily series classified into bands (zero, normal, high, peak)
               plus a parallel COVID-regime label so the scatter is colour-codable
- covid_regimes: pre / during / post quartile boxes + a thinned time-series with
               the same regime label for the dual-panel chart
"""
from __future__ import annotations
from typing import Any
import math

import numpy as np
import pandas as pd


def _nan(v: Any) -> Any:
    if isinstance(v, float) and math.isnan(v):
        return None
    return v


def missingness(df: pd.DataFrame, top: int = 25) -> dict[str, Any]:
    n = int(len(df))
    rows: list[dict[str, Any]] = []
    for c in df.columns:
        n_missing = int(df[c].isna().sum())
        if n_missing == 0:
            continue
        rows.append({
            "column": c,
            "missing": n_missing,
            "pct": round(n_missing / n * 100, 3) if n else 0.0,
        })
    rows.sort(key=lambda r: r["pct"], reverse=True)
    return {
        "rows": int(n),
        "columns_total": int(df.shape[1]),
        "columns_with_missing": len(rows),
        "top": rows[:top],
    }


def _box_stats(values: np.ndarray) -> dict[str, float | int]:
    if values.size == 0:
        return {"n": 0, "min": None, "q1": None, "median": None,
                "q3": None, "max": None, "mean": None, "std": None}
    q1, med, q3 = np.percentile(values, [25, 50, 75])
    iqr = q3 - q1
    lo = max(values.min(), q1 - 1.5 * iqr)
    hi = min(values.max(), q3 + 1.5 * iqr)
    return {
        "n":    int(values.size),
        "min":  float(values.min()),
        "q1":   float(q1),
        "median": float(med),
        "q3":   float(q3),
        "max":  float(values.max()),
        "whisker_low":  float(lo),
        "whisker_high": float(hi),
        "mean": float(values.mean()),
        "std":  float(values.std(ddof=1)) if values.size > 1 else 0.0,
    }


def outliers(df: pd.DataFrame, target_col: str = "total_daily_arrivals") -> dict[str, Any]:
    if target_col not in df.columns or "date" not in df.columns:
        return {"target": target_col, "available": False, "points": [], "summary": {}}

    s = pd.to_numeric(df[target_col], errors="coerce")
    valid = s.dropna()
    if valid.empty:
        return {"target": target_col, "available": False, "points": [], "summary": {}}

    q1, med, q3 = np.percentile(valid, [25, 50, 75])
    iqr = q3 - q1
    hi  = q3 + 1.5 * iqr
    peak = q3 + 3.0 * iqr

    points: list[dict[str, Any]] = []
    regimes = df.get("covid_regime")
    for date, value, regime in zip(
        df["date"].astype(str),
        s.fillna(np.nan),
        regimes.astype(str) if regimes is not None else [""] * len(df),
    ):
        if pd.isna(value):
            cat = "missing"
        elif value == 0:
            cat = "zero"
        elif value >= peak:
            cat = "peak"
        elif value >= hi:
            cat = "high"
        else:
            cat = "normal"
        points.append({
            "date":   date,
            "value":  None if pd.isna(value) else float(value),
            "category": cat,
            "regime": regime,
        })

    counts = pd.Series([p["category"] for p in points]).value_counts().to_dict()
    return {
        "target": target_col,
        "available": True,
        "thresholds": {
            "q1": float(q1), "median": float(med), "q3": float(q3),
            "high_cutoff": float(hi), "peak_cutoff": float(peak),
        },
        "summary": {str(k): int(v) for k, v in counts.items()},
        "points": points,
    }


def covid_regimes(df: pd.DataFrame, target_col: str = "total_daily_arrivals") -> dict[str, Any]:
    if target_col not in df.columns or "covid_regime" not in df.columns:
        return {"target": target_col, "available": False}

    series = []
    for _, row in df.iterrows():
        v = row.get(target_col)
        if pd.isna(v):
            continue
        series.append({
            "date":   str(row.get("date", "")),
            "value":  float(v),
            "regime": str(row.get("covid_regime", "")),
        })

    boxes: dict[str, dict[str, float | int]] = {}
    for regime in ("pre", "during", "post"):
        vals = pd.to_numeric(
            df.loc[df["covid_regime"] == regime, target_col], errors="coerce",
        ).dropna().to_numpy()
        boxes[regime] = _box_stats(vals)

    return {
        "target":   target_col,
        "available": True,
        "series":   series,
        "boxes":    boxes,
    }