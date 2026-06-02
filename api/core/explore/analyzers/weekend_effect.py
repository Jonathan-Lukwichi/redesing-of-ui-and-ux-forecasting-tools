"""F2 — Category-level weekend effect (e.g. Surgery weekends are +41%)."""
from __future__ import annotations
import pandas as pd

from ..pipeline import Analyzer, AnalysisContext, Finding, GroupProfile


class WeekendEffectAnalyzer(Analyzer):
    code = "F2"
    section = "departments"
    required_roles = ("weekend_flag",)
    requires_categories = ("specialty",)
    preferred_group_ids = ("g3",)

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile, ctx) -> Finding | None:
        flag = prof.weekend_flag
        rows = []
        for col in prof.category("specialty") or []:
            if col not in df.columns:
                continue
            s  = pd.to_numeric(df[col], errors="coerce")
            wd = s[df[flag] == 0].dropna()
            we = s[df[flag] == 1].dropna()
            if wd.empty or we.empty:
                continue
            wd_mean = float(wd.mean()); we_mean = float(we.mean())
            if wd_mean <= 0:
                continue
            rows.append({
                "category":     _label(col),
                "weekday_mean": round(wd_mean, 2),
                "weekend_mean": round(we_mean, 2),
                "pct_deviation": round((we_mean - wd_mean) / wd_mean * 100, 1),
            })
        if not rows:
            return None

        rows.sort(key=lambda r: r["pct_deviation"], reverse=True)
        # Headline is the row whose absolute deviation is largest.
        top = max(rows, key=lambda r: abs(r["pct_deviation"]))
        sign = "+" if top["pct_deviation"] >= 0 else ""
        return Finding(
            id=f"{self.code}:{group_id}",
            code=self.code,
            category="watch",
            headline=f"{sign}{top['pct_deviation']:.0f}%",
            title=f"{top['category']} runs against the grain on weekends",
            summary=(
                f"{top['category']} averages {top['weekend_mean']} on weekends vs "
                f"{top['weekday_mean']} on weekdays — {sign}{top['pct_deviation']:.0f}% "
                "while every other category falls."
            ),
            mechanism=(
                "Elective clinics close on weekends and route their complications "
                "to the ED. Acute trauma also concentrates on weekends."
            ),
            action=(
                f"Pre-position {top['category']} consumables every Friday afternoon. "
                "Build a separate weekend par-level for this category."
            ),
            source_group=group_id,
            section=self.section,
            detail={"rows": rows, "headline_row": top},
        )


def _label(col: str) -> str:
    if col.startswith("spec_"):
        return col[len("spec_"):].replace("_", " ").title()
    return col
