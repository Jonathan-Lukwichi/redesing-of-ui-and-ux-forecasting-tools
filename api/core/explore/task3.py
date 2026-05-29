"""
Task 3 — Critical-event classification (works on G3).

class_balance: for each critical-event category we compute its 90th percentile
on the daily series and report how many days exceed it. Surge-day rate per
category is the primary diagnostic for the binary classification target.
"""
from __future__ import annotations
from typing import Any

import numpy as np
import pandas as pd


EVENT_FAMILIES: dict[str, tuple[str, ...]] = {
    "Gunshot":          ("gunshot_male", "gunshot_female", "gunshot_child"),
    "Stab wound":       ("stab_wound_male", "stab_wound_female", "stab_wound_child"),
    "Common assault":   ("common_assault_male", "common_assault_female", "common_assault_child"),
    "Sexual assault":   ("sexual_assault_male", "sexual_assault_female", "sexual_assault_child"),
    "Domestic violence":("domestic_violence_male", "domestic_violence_female", "domestic_violence_child"),
    "Falls":            ("falls_male", "falls_female", "falls_child"),
    "Mob justice":      ("mob_justice_male", "mob_justice_female", "mob_justice_child"),
    "Accidents":        ("accident_mva", "accident_pva", "accident_train", "accident_mba"),
}


def _row_total(df: pd.DataFrame, cols: tuple[str, ...]) -> pd.Series | None:
    present = [c for c in cols if c in df.columns]
    if not present:
        return None
    return df[present].apply(pd.to_numeric, errors="coerce").fillna(0).sum(axis=1)


def class_balance(df: pd.DataFrame, percentile: int = 90) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    total_days = int(len(df))
    for label, cols in EVENT_FAMILIES.items():
        s = _row_total(df, cols)
        if s is None or s.dropna().empty:
            continue
        x = s.to_numpy()
        threshold = float(np.percentile(x, percentile))
        surge_days = int((x > threshold).sum())
        rate = round(surge_days / total_days * 100, 2) if total_days else 0.0
        rows.append({
            "category":    label,
            "threshold":   round(threshold, 2),
            "surge_days":  surge_days,
            "total_days":  total_days,
            "surge_rate":  rate,
            "mean":        round(float(x.mean()), 2),
            "max":         int(x.max()),
        })

    rows.sort(key=lambda r: r["surge_rate"], reverse=True)
    return {
        "available":  bool(rows),
        "percentile": percentile,
        "expected_rate_pct": round((100 - percentile), 2),
        "categories": rows,
    }
