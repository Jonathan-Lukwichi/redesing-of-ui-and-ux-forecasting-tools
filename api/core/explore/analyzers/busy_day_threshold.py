"""F8 — Demand shape signal: average day vs 80th-percentile busy day.

Matches the design's "Average day is 58 patients; a busy day is 80 or more"
card. Computes the mean and a busy-day threshold from the target series so
ward managers know what counts as a normal vs heavy day.
"""
from __future__ import annotations
import numpy as np
import pandas as pd

from ..pipeline import Analyzer, AnalysisContext, Finding, GroupProfile


class BusyDayThresholdAnalyzer(Analyzer):
    code = "F8"
    section = "demand"
    required_roles = ("target",)
    required_group_grain = "daily"
    preferred_group_ids = ("g1",)

    BUSY_PERCENTILE = 0.80
    QUIET_PERCENTILE = 0.20

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile, ctx: AnalysisContext) -> Finding | None:
        s = pd.to_numeric(df[prof.target], errors="coerce").dropna()
        if s.size < 30:
            return None
        mean = int(round(float(s.mean())))
        busy_threshold  = int(round(float(np.quantile(s, self.BUSY_PERCENTILE))))
        quiet_threshold = int(round(float(np.quantile(s, self.QUIET_PERCENTILE))))
        busy_count = int((s >= busy_threshold).sum())
        share = round(busy_count / s.size * 100, 1)
        return Finding(
            id=f"{self.code}:{group_id}",
            code=self.code,
            category="stable",
            headline=f"{mean}/day",
            title=f"Average day is {mean} patients; a busy day is {busy_threshold} or more",
            summary=(
                f"{busy_count:,} of {s.size:,} days ({share}%) crossed the busy "
                f"threshold; quiet days are {quiet_threshold} or fewer."
            ),
            mechanism=(
                "The busy threshold is the 80th percentile of daily arrivals across "
                "the selected window. It marks the workload a roster needs to absorb "
                "without spilling over."
            ),
            action=(
                f"Roster to handle {busy_threshold}+ arrivals on roughly 1 day in 5; "
                f"plan baseline staffing around {mean} and surge protocols above "
                f"{busy_threshold}."
            ),
            source_group=group_id,
            section=self.section,
            detail={
                "mean":            mean,
                "busy_threshold":  busy_threshold,
                "quiet_threshold": quiet_threshold,
                "busy_day_share_pct": share,
            },
        )
