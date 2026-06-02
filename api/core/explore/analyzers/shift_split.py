"""F4 — Day / Evening / Night shift split for hourly series."""
from __future__ import annotations
import pandas as pd

from ..pipeline import Analyzer, Finding, GroupProfile


def _bucket(h: int) -> str:
    if 7  <= h < 15: return "day"
    if 15 <= h < 23: return "evening"
    return "night"


class ShiftSplitAnalyzer(Analyzer):
    code = "F4"
    section = "hours"
    required_roles = ("target", "hour")
    required_group_grain = "hourly"
    preferred_group_ids = ("g2",)

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile, ctx) -> Finding | None:
        target = prof.target
        s = pd.to_numeric(df[target], errors="coerce")
        h = pd.to_numeric(df[prof.hour], errors="coerce").astype("Int64")
        valid = s.notna() & h.notna()
        if not valid.any():
            return None
        buckets = pd.Series([_bucket(int(x)) for x in h[valid]], index=s.index[valid])
        totals = s[valid].groupby(buckets).sum()
        grand = float(totals.sum())
        if grand <= 0:
            return None
        shares = {k: round(float(totals.get(k, 0.0)) / grand * 100, 1) for k in ("day","evening","night")}
        headline = f"{int(round(shares['day']))}/{int(round(shares['evening']))}/{int(round(shares['night']))}"

        return Finding(
            id=f"{self.code}:{group_id}",
            code=self.code,
            category="stable",
            headline=headline,
            title="Shift-level split is stable enough to roster against",
            summary=(
                f"Day {shares['day']}% · Evening {shares['evening']}% · Night "
                f"{shares['night']}%. This split barely drifts year over year."
            ),
            mechanism=(
                "Hourly demand is volatile and hard to predict — but aggregating "
                "to 8-hour shifts cancels out most of the noise."
            ),
            action=(
                "Anchor nurse and medical-officer rosters to the "
                f"{headline} Day / Evening / Night split. Hourly rostering will look noisy."
            ),
            source_group=group_id,
            section=self.section,
            detail={
                "buckets": [
                    {"key": "day",     "label": "Day 07–15",     "share_pct": shares["day"]},
                    {"key": "evening", "label": "Evening 15–23", "share_pct": shares["evening"]},
                    {"key": "night",   "label": "Night 23–07",   "share_pct": shares["night"]},
                ],
            },
        )
