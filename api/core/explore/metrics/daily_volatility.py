"""Daily volatility — coefficient of variation of the daily target.

Operationally: how tight the model's prediction intervals will be. Below
20% is calm and predictable; above 35% is noisy and forecasts will widen.
"""
from __future__ import annotations
import pandas as pd

from ..pipeline import Metric, MetricAnalyzer, GroupProfile


class DailyVolatilityMetric(MetricAnalyzer):
    code = "MF4"
    section = "forecast"
    required_roles = ("target",)
    required_group_grain = "daily"
    preferred_group_ids = ("g1",)

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile, ctx) -> Metric | None:
        s = pd.to_numeric(df[prof.target], errors="coerce").dropna()
        if s.size < 30 or float(s.mean()) <= 0:
            return None
        cv = round(float(s.std(ddof=1)) / float(s.mean()) * 100, 1)
        accent = "stable" if cv < 25 else "watch" if cv < 40 else "risk"
        return Metric(
            id=f"{self.code}:{group_id}",
            code=self.code,
            label="DAILY VOLATILITY",
            value=cv,
            unit="% CV",
            delta_pct=None,
            delta_label="lower = tighter forecast bands",
            sparkline=None,
            accent=accent,
            polarity="neutral",
            source_group=group_id,
        )
