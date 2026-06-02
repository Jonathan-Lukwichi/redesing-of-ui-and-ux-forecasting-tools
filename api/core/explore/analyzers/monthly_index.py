"""F3 — Monthly seasonal index vs annual mean. Surfaces the largest drop or rise."""
from __future__ import annotations
import pandas as pd

from ..pipeline import Analyzer, Finding, GroupProfile


MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]


class MonthlyIndexAnalyzer(Analyzer):
    code = "F3"
    section = "drivers"
    required_roles = ("target", "month")
    required_group_grain = "daily"
    preferred_group_ids = ("g1",)

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile, ctx) -> Finding | None:
        target = prof.target; month = prof.month
        s = pd.to_numeric(df[target], errors="coerce")
        m = pd.to_numeric(df[month], errors="coerce").astype("Int64")
        valid = s.notna() & m.notna()
        if not valid.any():
            return None
        means = s[valid].groupby(m[valid].astype(int)).mean()
        grand = float(s[valid].mean())
        if grand <= 0:
            return None

        rows = []
        for i in range(1, 13):
            if i not in means.index:
                rows.append({"month": i, "label": MONTH_LABELS[i-1], "mean": None, "index": None, "pct": None})
                continue
            mean = float(means.loc[i])
            idx = mean / grand * 100
            rows.append({
                "month": i, "label": MONTH_LABELS[i-1],
                "mean":  round(mean, 2),
                "index": round(idx, 1),
                "pct":   round(idx - 100, 1),
            })
        valid_rows = [r for r in rows if r["pct"] is not None]
        if not valid_rows:
            return None
        top = max(valid_rows, key=lambda r: abs(r["pct"]))
        sign = "+" if top["pct"] >= 0 else ""

        return Finding(
            id=f"{self.code}:{group_id}",
            code=self.code,
            category="watch",
            headline=f"{sign}{top['pct']:.1f}%",
            title=f"{top['label']} is the year's biggest seasonal swing",
            summary=(
                f"In {top['label']}, the daily average is {sign}{top['pct']:.1f}% "
                f"vs the annual mean of {grand:.1f}/day."
            ),
            mechanism=(
                "Year-end leave migrations and school closures pull elective patients "
                "out of the catchment area."
                if top["pct"] < 0 else
                "Seasonal driver lifts demand consistently across years in this month."
            ),
            action=(
                f"Reduce {top['label']} pharmacy and consumables orders by ~"
                f"{abs(top['pct']):.0f}%. Approve a higher proportion of annual leave."
                if top["pct"] < 0 else
                f"Pre-position additional stock heading into {top['label']}; align "
                "rostering to absorb the lift."
            ),
            source_group=group_id,
            section=self.section,
            detail={"annual_mean": round(grand, 2), "rows": rows, "headline_row": top},
        )
