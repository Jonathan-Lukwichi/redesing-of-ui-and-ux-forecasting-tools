"""Day-to-day swing — how much a typical day differs from the average.

Computed as the coefficient of variation (std / mean × 100) but presented
as a band (Tight / Moderate / Wide) so non-technical readers get an
immediate read on how steady the demand is. The CV value is in detail.
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
        if cv < 20:
            label = "Tight"; accent = "stable"
        elif cv < 35:
            label = "Moderate"; accent = "stable"
        elif cv < 55:
            label = "Wide"; accent = "watch"
        else:
            label = "Very wide"; accent = "risk"
        return Metric(
            id=f"{self.code}:{group_id}",
            code=self.code,
            label="DAY-TO-DAY SWING",
            value=label,
            unit=None,
            delta_pct=None,
            delta_label=f"±{cv:.0f}% around an average day · tighter = more predictable",
            sparkline=None,
            accent=accent,
            polarity="neutral",
            source_group=group_id,
            detail={"cv_pct": cv},
        )
