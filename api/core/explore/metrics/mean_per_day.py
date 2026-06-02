"""M2 — mean per day, with optional delta vs the pre-regime mean."""
from __future__ import annotations
import pandas as pd

from ..pipeline import Metric, MetricAnalyzer, GroupProfile


class MeanPerDayMetric(MetricAnalyzer):
    code = "M2"
    required_roles = ("target",)
    required_group_grain = "daily"
    preferred_group_ids = ("g1",)

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile, ctx) -> Metric | None:
        s = pd.to_numeric(df[prof.target], errors="coerce").dropna()
        if s.empty:
            return None
        mean = round(float(s.mean()), 1)

        # Compute a meaningful delta — recent 60-day mean vs the overall mean.
        # The blended-overall-vs-pre delta is mathematically tiny and operationally
        # useless, so we report a "are we currently above or below the long-run
        # average" signal instead.
        recent = s.tail(60)
        delta_pct = None
        delta_label = None
        if not recent.empty and mean > 0:
            delta_pct = round((float(recent.mean()) - mean) / mean * 100, 1)
            delta_label = "last 60d vs full window"

        # 30-day rolling for the sparkline.
        sparkline = (
            pd.to_numeric(df[prof.target], errors="coerce")
              .rolling(window=30, min_periods=1).mean()
              .dropna().tail(40).round(1).tolist()
        )

        return Metric(
            id=f"{self.code}:{group_id}",
            code=self.code,
            label="MEAN PER DAY",
            value=mean,
            unit="patients",
            delta_pct=delta_pct,
            delta_label=delta_label,
            sparkline=sparkline,
            accent="stable",
            source_group=group_id,
        )
