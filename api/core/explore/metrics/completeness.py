"""Completeness — % of expected calendar days that actually have observations.

99.79% would mean nearly every day in the calendar window is represented.
Lower numbers flag periods where the source data has gaps.
"""
from __future__ import annotations
import pandas as pd

from ..pipeline import Metric, MetricAnalyzer, GroupProfile


class CompletenessMetric(MetricAnalyzer):
    code = "MF9"
    section = "forecast"
    required_roles = ("date",)
    required_group_grain = "daily"
    preferred_group_ids = ("g1",)

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile, ctx) -> Metric | None:
        d = pd.to_datetime(df[prof.date], errors="coerce").dropna()
        if d.empty:
            return None
        observed = int(d.dt.normalize().nunique())
        expected = int((d.max() - d.min()).days + 1)
        if expected <= 0:
            return None
        pct = round(observed / expected * 100, 2)
        accent = "stable" if pct >= 99 else "watch" if pct >= 90 else "risk"
        return Metric(
            id=f"{self.code}:{group_id}",
            code=self.code,
            label="COMPLETENESS",
            value=f"{pct}",
            unit="%",
            delta_pct=None,
            delta_label=f"{observed:,} of {expected:,} expected days",
            sparkline=None,
            accent=accent,
            polarity="neutral",
            source_group=group_id,
        )
