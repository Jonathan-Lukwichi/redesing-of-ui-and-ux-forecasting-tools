"""Data span — how much data the Explore page is looking at.

Explore is retrospective on the *full* dataset (every day on record); the
training-window decision is made elsewhere (Train Models page). So this
card simply reports the number of observed days + the calendar span, with
no regime filtering applied.
"""
from __future__ import annotations
import pandas as pd

from ..pipeline import Metric, MetricAnalyzer, GroupProfile


class TrainingWindowMetric(MetricAnalyzer):
    """Kept under the old class name for backwards-compatible imports — the
    user-facing label is now DATA SPAN and the value reflects the full
    dataset, not the post-regime cut."""
    code = "MF1"
    section = "forecast"
    required_roles = ("date",)
    required_group_grain = "daily"
    preferred_group_ids = ("g1",)

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile, ctx) -> Metric | None:
        d = pd.to_datetime(df[prof.date], errors="coerce").dropna()
        if d.empty:
            return None
        total = int(len(d))
        years = round((d.max() - d.min()).days / 365.25, 1)
        return Metric(
            id=f"{self.code}:{group_id}",
            code=self.code,
            label="DATA SPAN",
            value=total,
            unit="days observed",
            delta_pct=None,
            delta_label=f"{years} years · {d.min().strftime('%b %Y')} – {d.max().strftime('%b %Y')}",
            sparkline=None,
            accent="trend",
            polarity="neutral",
            source_group=group_id,
        )
