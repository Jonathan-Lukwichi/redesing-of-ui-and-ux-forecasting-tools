"""Training window — how much usable data the model has to learn from.

Folds together the date span and the post-regime usable cut into one card,
so the strip doesn't waste two slots on closely-related descriptors.
"""
from __future__ import annotations
import pandas as pd

from ..pipeline import Metric, MetricAnalyzer, GroupProfile


class TrainingWindowMetric(MetricAnalyzer):
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
        # If we know the regime, prefer the post-regime block as the trainable cut.
        usable = total
        usable_label = "days available"
        if prof.regime_label and prof.regime_label in df.columns:
            r = df[prof.regime_label].astype(str)
            usable = int((r == "post").sum())
            if usable > 0 and usable < total:
                usable_label = f"post-regime usable · {total:,} total"
            else:
                usable = total
        return Metric(
            id=f"{self.code}:{group_id}",
            code=self.code,
            label="TRAINING WINDOW",
            value=usable,
            unit="days",
            delta_pct=None,
            delta_label=usable_label,
            sparkline=None,
            accent="trend",
            polarity="neutral",
            source_group=group_id,
        )
