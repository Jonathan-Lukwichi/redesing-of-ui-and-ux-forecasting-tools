"""M6 — count of zero-arrival flagged days. Data-quality watcher."""
from __future__ import annotations
import pandas as pd

from ..pipeline import Metric, MetricAnalyzer, GroupProfile


class ZeroDayCountMetric(MetricAnalyzer):
    code = "M6"
    required_roles = ("zero_day_flag",)
    required_group_grain = "daily"
    preferred_group_ids = ("g1",)

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile, ctx) -> Metric | None:
        s = pd.to_numeric(df[prof.zero_day_flag], errors="coerce").fillna(0)
        n_zero = int((s == 1).sum())
        total = int(len(s))
        if total == 0:
            return None
        share = round(n_zero / total * 100, 1) if total else 0.0
        return Metric(
            id=f"{self.code}:{group_id}",
            code=self.code,
            label="ZERO DAYS",
            value=n_zero,
            unit="flagged",
            delta_pct=share,
            delta_label=f"of {total:,} days",
            accent="watch" if n_zero > 0 else "stable",
            polarity="inverse",  # more zero-days = worse data quality
            source_group=group_id,
        )
