"""M3 — % shift between the pre and post regime means."""
from __future__ import annotations
import pandas as pd

from ..pipeline import Metric, MetricAnalyzer, GroupProfile


class PostCovidShiftMetric(MetricAnalyzer):
    code = "M3"
    section = "data_health"
    required_roles = ("target", "regime_label")
    required_group_grain = "daily"
    preferred_group_ids = ("g1",)

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile, ctx) -> Metric | None:
        s = pd.to_numeric(df[prof.target], errors="coerce")
        r = df[prof.regime_label].astype(str)
        pre  = s[r == "pre"].dropna()
        post = s[r == "post"].dropna()
        if pre.empty or post.empty or pre.mean() <= 0:
            return None
        pct = round((float(post.mean()) - float(pre.mean())) / float(pre.mean()) * 100, 1)
        accent = "risk" if pct > 5 else "watch" if pct > 0 else "stable"
        return Metric(
            id=f"{self.code}:{group_id}",
            code=self.code,
            label="POST-COVID SHIFT",
            value=f"{'+' if pct >= 0 else ''}{pct}",
            unit="%",
            delta_pct=pct,
            delta_label="vs pre-COVID",
            accent=accent,
            source_group=group_id,
        )
