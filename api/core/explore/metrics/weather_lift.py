"""Weather lift — % deviation in mean arrivals between the top and bottom
temperature quartile.

Tells the forecaster how much weather signal the model will pick up. A
small lift means weather features can be downweighted; a large lift means
they're material to short-horizon forecasting.
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
        cold_mean = float(y[x <= q1].mean()) if (x <= q1).any() else None
        hot_mean  = float(y[x >= q3].mean()) if (x >= q3).any() else None
        if cold_mean is None or hot_mean is None or cold_mean <= 0:
            return None
        lift = round((hot_mean - cold_mean) / cold_mean * 100, 1)
        accent = "stable" if abs(lift) < 5 else "watch" if abs(lift) < 12 else "risk"
        return Metric(
            id=f"{self.code}:{group_id}",
            code=self.code,
            label="WEATHER LIFT",
            value=f"{'+' if lift >= 0 else ''}{lift}",
            unit="%",
            delta_pct=None,
            delta_label="hot Q4 vs cold Q1 days",
            sparkline=None,
            accent=accent,
            polarity="neutral",
            source_group=group_id,
        )
