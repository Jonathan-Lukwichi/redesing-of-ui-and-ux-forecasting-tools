"""Warm-day lift — how much more (or fewer) patients arrive on hot days
compared to cold days.

Computed as the % difference in mean arrivals between the top temperature
quartile (Q4: hot) and the bottom quartile (Q1: cold).
"""
from __future__ import annotations
import numpy as np
import pandas as pd

from ..pipeline import Metric, MetricAnalyzer, GroupProfile


class WeatherLiftMetric(MetricAnalyzer):
    code = "MF5"
    section = "forecast"
    required_roles = ("target", "weather_temp")
    required_group_grain = "daily"
    preferred_group_ids = ("g1",)

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile, ctx) -> Metric | None:
        y = pd.to_numeric(df[prof.target], errors="coerce").to_numpy()
        x = pd.to_numeric(df[prof.weather_temp], errors="coerce").to_numpy()
        valid = np.isfinite(x) & np.isfinite(y)
        if valid.sum() < 40:
            return None
        x, y = x[valid], y[valid]
        q1, q3 = np.quantile(x, [0.25, 0.75])
        cold = y[x <= q1]
        hot  = y[x >= q3]
        if cold.size == 0 or hot.size == 0:
            return None
        cold_mean = float(cold.mean())
        hot_mean  = float(hot.mean())
        if cold_mean <= 0:
            return None
        lift = round((hot_mean - cold_mean) / cold_mean * 100, 1)
        sign = "+" if lift >= 0 else ""
        # Plain-English summary.
        direction = "more patients on warm days" if lift > 0 else "fewer patients on warm days"
        accent = "stable" if abs(lift) < 5 else "watch" if abs(lift) < 12 else "risk"
        return Metric(
            id=f"{self.code}:{group_id}",
            code=self.code,
            label="WARM-DAY LIFT",
            value=f"{sign}{lift}",
            unit="%",
            delta_pct=None,
            delta_label=f"{direction} (hot days {hot_mean:.0f}/day vs cold days {cold_mean:.0f}/day)",
            sparkline=None,
            accent=accent,
            polarity="neutral",
            source_group=group_id,
            detail={
                "cold_q1_mean": round(cold_mean, 1),
                "hot_q4_mean":  round(hot_mean, 1),
            },
        )
