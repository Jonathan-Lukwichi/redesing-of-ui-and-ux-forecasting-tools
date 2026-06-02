"""M4 — number of post-regime days available for training."""
from __future__ import annotations
import pandas as pd

from ..pipeline import Metric, MetricAnalyzer, GroupProfile


class PostCovidDaysMetric(MetricAnalyzer):
    code = "M4"
    required_roles = ("regime_label",)
    required_group_grain = "daily"
    preferred_group_ids = ("g1",)

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile, ctx) -> Metric | None:
        r = df[prof.regime_label].astype(str)
        n_post = int((r == "post").sum())
        total = int(r.notna().sum())
        if n_post == 0:
            return None
        share = round(n_post / max(total, 1) * 100, 1)
        return Metric(
            id=f"{self.code}:{group_id}",
            code=self.code,
            label="POST-COVID DAYS",
            value=n_post,
            unit="days",
            delta_pct=share,
            delta_label="of full window",
            accent="trend",
            source_group=group_id,
            detail={"share_pct": share, "total_days": total},
        )
