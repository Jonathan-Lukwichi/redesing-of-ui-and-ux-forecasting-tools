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

        delta_pct = None
        delta_label = None
        if prof.regime_label and prof.regime_label in df.columns:
            r = df[prof.regime_label].astype(str)
            pre = pd.to_numeric(df[prof.target], errors="coerce")[r == "pre"].dropna()
            if not pre.empty and pre.mean() > 0:
                delta_pct = round((mean - float(pre.mean())) / float(pre.mean()) * 100, 1)
                delta_label = "vs pre-COVID"

        # 60-day rolling for sparkline
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
