"""Calendar × category matrix — % change on each calendar event for each
specialty/event family.

Rows are categories, columns are calendar conditions, cell values are %
deviations against the off-flag baseline.
"""
from __future__ import annotations
import pandas as pd

from ..pipeline import AnalysisContext, GroupProfile


_FLAG_LABELS = {
    "is_public_holiday":   "Public holiday",
    "is_long_weekend":     "Long weekend",
    "is_weekend":          "Weekend",
    "is_festive_season":   "Festive season",
}


def build_calendar_x_category(
    df: pd.DataFrame, profile: GroupProfile, ctx: AnalysisContext,
) -> dict:
    specialty_cols = [c for c in (profile.categories.get("specialty") or []) if c in df.columns]
    if not specialty_cols:
        return {"available": False}
    flag_cols = [(col, label) for col, label in _FLAG_LABELS.items() if col in df.columns]
    if not flag_cols:
        return {"available": False}

    rows = []
    for col in specialty_cols:
        y = pd.to_numeric(df[col], errors="coerce")
        row = {"category": col.replace("spec_", "").title(), "cells": {}}
        for flag_col, flag_label in flag_cols:
            flag = pd.to_numeric(df[flag_col], errors="coerce").fillna(0).astype(int)
            on  = y[flag == 1].dropna()
            off = y[flag == 0].dropna()
            if on.size < 5 or off.size < 5 or float(off.mean()) <= 0:
                row["cells"][flag_label] = None
                continue
            row["cells"][flag_label] = round(
                (float(on.mean()) - float(off.mean())) / float(off.mean()) * 100, 1
            )
        rows.append(row)
    return {
        "available": True,
        "calendar_labels": [label for _, label in flag_cols],
        "rows": rows,
    }
