"""
Task 2 — Specialty composition (works on G3).

- specialty_mix:        proportion of each specialty over time, thinned + smoothed
                        for plotting (stacked-area shape)
- specialty_correlation: 7×7 Pearson correlation matrix on specialty columns
"""
from __future__ import annotations
from typing import Any

import numpy as np
import pandas as pd


SPECIALTIES = (
    ("spec_medicine",    "Medicine"),
    ("spec_orthopaedics","Orthopaedics"),
    ("spec_surgery",     "Surgery"),
    ("spec_gynae",       "Gynaecology"),
    ("spec_maternity",   "Maternity"),
    ("spec_paediatrics", "Paediatrics"),
    ("spec_psychiatry",  "Psychiatry"),
)


def _present_specs(df: pd.DataFrame) -> list[tuple[str, str]]:
    return [(col, label) for col, label in SPECIALTIES if col in df.columns]


def specialty_mix(df: pd.DataFrame, smoothing_window: int = 30,
                  max_points: int = 500) -> dict[str, Any]:
    present = _present_specs(df)
    if not present or "date" not in df.columns:
        return {"available": False}

    dates = pd.to_datetime(df["date"], errors="coerce")
    order = dates.argsort()
    dates = dates.iloc[order].reset_index(drop=True)

    counts = pd.DataFrame({
        label: pd.to_numeric(df[col], errors="coerce").iloc[order].reset_index(drop=True)
        for col, label in present
    }).fillna(0)
    counts = counts.rolling(window=smoothing_window, min_periods=1).mean()

    # Thin the time axis if too long.
    n = len(dates)
    step = max(1, n // max_points)
    dates_thin = dates.iloc[::step]
    counts_thin = counts.iloc[::step]

    return {
        "available":  True,
        "dates":      [d.strftime("%Y-%m-%d") for d in dates_thin],
        "specialties": [label for _, label in present],
        "series": {
            label: counts_thin[label].round(2).tolist()
            for label in [lab for _, lab in present]
        },
        "smoothing_window": smoothing_window,
        "totals": {
            label: int(round(float(counts[label].sum()))) for _, label in present
        },
    }


def specialty_correlation(df: pd.DataFrame) -> dict[str, Any]:
    present = _present_specs(df)
    if len(present) < 2:
        return {"available": False}

    labels = [lab for _, lab in present]
    sub = df[[col for col, _ in present]].apply(pd.to_numeric, errors="coerce")
    corr = sub.corr(method="pearson").round(3)

    matrix = [[float(corr.iat[i, j]) if not np.isnan(corr.iat[i, j]) else None
               for j in range(corr.shape[1])]
              for i in range(corr.shape[0])]

    return {
        "available": True,
        "labels":    labels,
        "matrix":    matrix,
    }
