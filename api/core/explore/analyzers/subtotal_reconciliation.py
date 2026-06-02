"""F6 — Sub-total reconciliation across two raw datasets.

Demonstrates a cross-dataset analyzer: requires_raw_datasets means this
analyzer doesn't depend on any single merged group, it reaches into the
raw registry for the two inputs it needs.
"""
from __future__ import annotations
import pandas as pd

from ..pipeline import Analyzer, AnalysisContext, Finding, GroupProfile


SPECIALTY_HINT_COLS = (
    "spec_medicine", "spec_orthopaedics", "spec_surgery", "spec_gynae",
    "spec_maternity", "spec_paediatrics", "spec_psychiatry",
)


class SubtotalReconciliationAnalyzer(Analyzer):
    code = "F6"
    section = "quality"
    requires_raw_datasets = ("daily_arrival", "clinical_daily")
    # No grain restriction — it acts on raw daily files only.
    preferred_group_ids = ("g1",)
    required_roles = ()
    tolerance: float = 0.10

    def run(self, group_id, df, prof, ctx: AnalysisContext) -> Finding | None:
        daily    = ctx.raw("daily_arrival")
        clinical = ctx.raw("clinical_daily")
        if daily is None or clinical is None:
            return None
        if "date" not in daily.columns or "total_daily_arrivals" not in daily.columns:
            return None
        spec_cols = [c for c in SPECIALTY_HINT_COLS if c in clinical.columns]
        if not spec_cols or "date" not in clinical.columns:
            return None

        d = daily[["date", "total_daily_arrivals"]].copy()
        c = clinical[["date"] + spec_cols].copy()
        c["spec_sum"] = c[spec_cols].apply(pd.to_numeric, errors="coerce").fillna(0).sum(axis=1)
        d["date"] = pd.to_datetime(d["date"], errors="coerce").dt.strftime("%Y-%m-%d")
        c["date"] = pd.to_datetime(c["date"], errors="coerce").dt.strftime("%Y-%m-%d")

        j = d.merge(c[["date", "spec_sum"]], on="date", how="inner")
        total = pd.to_numeric(j["total_daily_arrivals"], errors="coerce")
        spec  = pd.to_numeric(j["spec_sum"], errors="coerce")
        valid = total.notna() & spec.notna() & (total > 0)
        if not valid.any():
            return None
        diff = (spec[valid] - total[valid]).abs() / total[valid]
        within = int((diff <= self.tolerance).sum())
        n = int(valid.sum())
        rate = round(within / n * 100, 1)
        category = "stable" if rate >= 70 else "watch"
        return Finding(
            id=f"{self.code}:cross",
            code=self.code,
            category=category,
            headline=f"{rate:.1f}%",
            title="Header totals reconcile with category sums",
            summary=(
                f"On {within:,} of {n:,} days, the daily header total agrees with the "
                f"sum of category arrivals within ±{int(self.tolerance*100)}%."
            ),
            mechanism=(
                "Ward-clerk header totals are written separately from category "
                "tallies. A high reconciliation rate validates that both columns can "
                "be trusted as forecasting targets."
            ),
            action=(
                "Treat the header total as the authoritative training target. The "
                "specialty sums remain usable for proportional analysis."
                if rate >= 70 else
                "Audit the days where sums diverge before relying on category totals."
            ),
            source_group=group_id,
            section=self.section,
            detail={
                "rate_pct": rate, "days_within_tolerance": within, "days_total": n,
                "tolerance_pct": int(round(self.tolerance * 100)),
            },
        )
