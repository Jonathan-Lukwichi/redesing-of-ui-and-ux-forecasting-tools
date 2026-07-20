"""Daily swing — standard deviation reported in absolute patient terms.

Matches the design's "DAILY SWING ±14" card. Complements DAILY VOLATILITY
(which expresses the same idea as % CV) by showing the swing in the same
unit the operations team thinks in: patients per day.
"""
from __future__ import annotations
import pandas as pd

from ..pipeline import Metric, MetricAnalyzer, GroupProfile


class DailySwingMetric(MetricAnalyzer):
    code = "MF11"
    section = "forecast"
    required_roles = ("target",)
    required_group_grain = "daily"
    preferred_group_ids = ("g1",)

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile, ctx) -> Metric | None:
        s = pd.to_numeric(df[prof.target], errors="coerce").dropna()
        if s.size < 30:
            return None
        sd = float(s.std(ddof=1))
        mean = float(s.mean()) if s.mean() > 0 else None
        accent = "stable"
        if mean is not None:
            cv = sd / mean
            accent = "stable" if cv < 0.25 else "watch" if cv < 0.4 else "risk"
        return Metric(
            id=f"{self.code}:{group_id}",
            code=self.code,
            label="DAILY SWING",
            value=f"±{round(sd)}",
            unit="patients",
            delta_pct=None,
            delta_label="day-to-day standard deviation",
            sparkline=None,
            accent=accent,
            polarity="neutral",
            source_group=group_id,
        )
