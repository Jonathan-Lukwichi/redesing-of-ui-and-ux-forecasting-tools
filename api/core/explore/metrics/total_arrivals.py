"""M1 — total arrivals across the full series."""
from __future__ import annotations
import pandas as pd

from ..pipeline import Metric, MetricAnalyzer, GroupProfile


class TotalArrivalsMetric(MetricAnalyzer):
    code = "M1"
    required_roles = ("target",)
    required_group_grain = "daily"
    preferred_group_ids = ("g1",)

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile, ctx) -> Metric | None:
        s = pd.to_numeric(df[prof.target], errors="coerce")
        total = int(s.sum())
        # Last 30-day rolling for the sparkline.
        sparkline = (
            s.rolling(window=30, min_periods=1).mean().dropna().tail(40).round(1).tolist()
        )
        return Metric(
            id=f"{self.code}:{group_id}",
            code=self.code,
            label="TOTAL ARRIVALS",
            value=total,
            unit="patients",
            sparkline=sparkline,
            accent="stable",
            source_group=group_id,
        )
