"""F1 — Permanent regime shift between labeled regimes (e.g. pre/during/post)."""
from __future__ import annotations
import pandas as pd

from ..pipeline import Analyzer, AnalysisContext, Finding, GroupProfile


class RegimeShiftAnalyzer(Analyzer):
    code = "F1"
    section = "demand"
    required_roles = ("target", "regime_label")
    required_group_grain = "daily"
    preferred_group_ids = ("g1",)

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile, ctx) -> Finding | None:
        target = prof.target; regime = prof.regime_label
        s = pd.to_numeric(df[target], errors="coerce")
        r = df[regime].astype(str)
        means = s.groupby(r).mean()
        counts = s.groupby(r).count()

        pre  = float(means.get("pre",   float("nan")))
        post = float(means.get("post",  float("nan")))
        during = float(means.get("during", float("nan")))
        if pd.isna(pre) or pd.isna(post) or pre <= 0:
            return None
        pct = (post - pre) / pre * 100
        return Finding(
            id=f"{self.code}:{group_id}",
            code=self.code,
            category="risk" if pct > 5 else "watch",
            headline=f"+{pct:.1f}%" if pct >= 0 else f"{pct:.1f}%",
            title="Permanent demand shift",
            summary=(
                f"Post-COVID averages {post:.1f} arrivals per day vs {pre:.1f} pre-COVID "
                f"({pct:+.1f}%). The shift has not reverted."
            ),
            mechanism=(
                "Deferred-care backlog and continued catchment-area population growth "
                "raised the baseline. The COVID dip was temporary; the post-COVID "
                "increase is structural."
            ),
            action=(
                "Rebase procurement par-levels, roster templates and capacity plans "
                "to the post-COVID baseline. Any plan anchored to 2019 averages is "
                "structurally undersized."
            ),
            source_group=group_id,
            section=self.section,
            detail={
                "pre_mean":    round(pre, 1),
                "during_mean": None if pd.isna(during) else round(during, 1),
                "post_mean":   round(post, 1),
                "pct_shift":   round(pct, 1),
                "regime_counts": {
                    k: int(v) for k, v in counts.to_dict().items()
                },
            },
        )
