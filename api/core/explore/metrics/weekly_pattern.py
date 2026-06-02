"""Weekly pattern strength — autocorrelation at lag 7.

A high value means a strong week-over-week pattern that the forecasting
model can lean on for short-horizon predictions.
"""
from __future__ import annotations
import math
import numpy as np
import pandas as pd
from statsmodels.tsa.stattools import acf

from ..pipeline import Metric, MetricAnalyzer, GroupProfile


class WeeklyPatternMetric(MetricAnalyzer):
    code = "MF3"
    section = "forecast"
    required_roles = ("target",)
    required_group_grain = "daily"
    preferred_group_ids = ("g1",)

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile, ctx) -> Metric | None:
        s = pd.to_numeric(df[prof.target], errors="coerce").dropna()
        if s.size < 30:
            return None
        try:
            a = acf(s.to_numpy(), nlags=14, fft=True)
        except Exception:
            return None
        if len(a) < 8:
            return None
        a7 = float(a[7])
        a1 = float(a[1])
        accent = "stable" if abs(a7) >= 0.4 else "watch"
        return Metric(
            id=f"{self.code}:{group_id}",
            code=self.code,
            label="WEEKLY PATTERN",
            value=round(a7, 2),
            unit="ACF(7)",
            delta_pct=None,
            delta_label=f"lag-1 ACF {a1:.2f}",
            sparkline=None,
            accent=accent,
            polarity="neutral",
            source_group=group_id,
        )
