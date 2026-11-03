"""F12 — Kruskal-Wallis test: does daily demand differ by weekday or by month?

Rank-based, so it needs no assumption that arrivals are normally distributed.
Zero-arrival days (outages, not quiet days) are excluded.
"""
from __future__ import annotations
import pandas as pd
from scipy.stats import kruskal

from ..pipeline import Analyzer, AnalysisContext, Finding, GroupProfile

ALPHA = 0.05
MIN_DAYS = 30


def _test(values: pd.Series, groups: pd.Series) -> dict | None:
    samples = [g.to_numpy() for _, g in values.groupby(groups) if len(g) >= 2]
    if len(samples) < 2:
        return None
    if values.nunique() < 2:   # every value identical: no difference at all
        h, p = 0.0, 1.0
    else:
        h, p = kruskal(*samples)
    return {"h": round(float(h), 2), "p": round(float(p), 4), "groups": len(samples)}


class KruskalWallisAnalyzer(Analyzer):
    code = "F12"
    section = "demand"
    required_roles = ("target", "day_of_week", "month")
    required_group_grain = "daily"
    preferred_group_ids = ("g1",)

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile,
            ctx: AnalysisContext) -> Finding | None:
        if prof.zero_day_flag and prof.zero_day_flag in df.columns:
            df = df[pd.to_numeric(df[prof.zero_day_flag], errors="coerce").fillna(0) == 0]
        y = pd.to_numeric(df[prof.target], errors="coerce")
        keep = y.notna()
        if keep.sum() < MIN_DAYS:
            return None
        y = y[keep]
        by_dow = _test(y, df.loc[keep, prof.day_of_week])
        by_month = _test(y, df.loc[keep, prof.month])
        if by_dow is None and by_month is None:
            return None
        found = [name for name, r in (("weekday", by_dow), ("month", by_month))
                 if r and r["p"] < ALPHA]
        significant = bool(found)
        lead = by_dow or by_month
        return Finding(
            id=f"{self.code}:{group_id}", code=self.code,
            category="trend" if significant else "stable",
            headline=f"H = {lead['h']:g}",
            title=(f"Demand differs significantly by {' and '.join(found)}" if significant
                   else "No significant pattern by weekday or month"),
            summary=("; ".join(f"by {n}: H = {r['h']:g}, p = {r['p']:g}"
                               for n, r in (("weekday", by_dow), ("month", by_month)) if r)
                     + f" (significant below p = {ALPHA})."),
            mechanism=("Kruskal-Wallis compares typical daily arrivals across weekdays and "
                       "across months using ranks, so a few extreme days do not drive it."),
            action=("Keep weekday and month terms in the forecast and roster."
                    if significant else
                    "A flat baseline is enough; calendar terms add little."),
            source_group=group_id, section=self.section,
            detail={"day_of_week": by_dow, "month": by_month, "alpha": ALPHA,
                    "significant": significant})
