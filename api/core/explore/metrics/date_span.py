"""M7 — number of days covered by the dataset."""
from __future__ import annotations
import pandas as pd

from ..pipeline import Metric, MetricAnalyzer, GroupProfile


class DateSpanMetric(MetricAnalyzer):
    code = "M7"
    section = "data_health"
    required_roles = ("date",)
    required_group_grain = "daily"
    preferred_group_ids = ("g1",)

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile, ctx) -> Metric | None:
        d = pd.to_datetime(df[prof.date], errors="coerce").dropna()
        if d.empty:
            return None
        days = int(len(d))
        years = round((d.max() - d.min()).days / 365.25, 1)
        return Metric(
            id=f"{self.code}:{group_id}",
            code=self.code,
            label="WINDOW",
            value=days,
            unit="days",
            delta_pct=None,
            delta_label=f"{years} years",
            accent="trend",
            source_group=group_id,
            detail={
                "start": d.min().strftime("%Y-%m-%d"),
                "end":   d.max().strftime("%Y-%m-%d"),
                "years": years,
            },
        )
