"""Recent trend — last-60d mean vs the long-run mean.

Operationally: is the model about to face higher- or lower-than-average
demand? Drops the descriptive "mean per day" framing in favour of an
explicit delta.
"""
from __future__ import annotations
import pandas as pd

from ..pipeline import Metric, MetricAnalyzer, GroupProfile


class RecentTrendMetric(MetricAnalyzer):
    code = "MF2"
    section = "forecast"
    required_roles = ("target",)
    required_group_grain = "daily"
    preferred_group_ids = ("g1",)

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile, ctx) -> Metric | None:
        s = pd.to_numeric(df[prof.target], errors="coerce").dropna()
        if s.size < 60:
            return None
        baseline = float(s.mean())
        recent   = float(s.tail(60).mean())
        if baseline <= 0:
            return None
        delta = round((recent - baseline) / baseline * 100, 1)
        accent = "watch" if abs(delta) > 10 else "stable"

        sparkline = (
            s.rolling(window=30, min_periods=1).mean().dropna().tail(40).round(1).tolist()
        )

        return Metric(
            id=f"{self.code}:{group_id}",
            code=self.code,
            label="RECENT TREND",
            value=round(recent, 1),
            unit="/day",
            delta_pct=delta,
            delta_label="last 60d vs long-run mean",
            sparkline=sparkline,
            accent=accent,
            polarity="neutral",
            source_group=group_id,
        )
