"""M5 — number of categories declared in the group profile.

Profile-driven: any group with a 'specialty', 'event' or other category
yields a metric automatically. The label uses the first category name to
make the card self-describing.
"""
from __future__ import annotations
import pandas as pd

from ..pipeline import Metric, MetricAnalyzer, GroupProfile


class CategoryCountMetric(MetricAnalyzer):
    code = "M5"
    requires_categories = ("specialty",)
    preferred_group_ids = ("g3",)

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile, ctx) -> Metric | None:
        cols = [c for c in (prof.category("specialty") or []) if c in df.columns]
        n = len(cols)
        if n == 0:
            return None
        # Total volume per category for the detail panel.
        totals = {}
        for col in cols:
            try:
                totals[col] = int(pd.to_numeric(df[col], errors="coerce").fillna(0).sum())
            except Exception:
                totals[col] = 0
        return Metric(
            id=f"{self.code}:{group_id}",
            code=self.code,
            label="DEPARTMENTS",
            value=n,
            unit="tracked",
            accent="stable",
            source_group=group_id,
            detail={"totals": totals},
        )
