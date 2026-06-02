"""F7 — Linear growth trend in patients per day per year."""
from __future__ import annotations
import numpy as np
import pandas as pd

from ..pipeline import Analyzer, Finding, GroupProfile


class GrowthTrendAnalyzer(Analyzer):
    code = "F7"
    section = "demand"
    required_roles = ("target", "date")
    required_group_grain = "daily"
    preferred_group_ids = ("g1",)

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile, ctx) -> Finding | None:
        s = pd.Series(
            pd.to_numeric(df[prof.target], errors="coerce").to_numpy(),
            index=pd.to_datetime(df[prof.date], errors="coerce"),
        ).dropna().sort_index()
        if s.size < 60:
            return None

        days = (s.index - s.index.min()).days.to_numpy(dtype=float)
        slope, _ = np.polyfit(days, s.to_numpy(dtype=float), 1)
        per_year  = round(float(slope) * 365.0, 2)
        five_year = round(float(slope) * 365.0 * 5, 1)
        current   = round(float(s.tail(60).mean()), 1)

        sign = "+" if per_year >= 0 else ""
        return Finding(
            id=f"{self.code}:{group_id}",
            code=self.code,
            category="trend",
            headline=f"{sign}{per_year:.1f}/day",
            title="Long-run growth in baseline demand",
            summary=(
                f"Underlying trend adds about {sign}{per_year:.1f} arrivals per day per year. "
                f"Current 60-day average sits at {current}/day."
            ),
            mechanism=(
                "Catchment-population growth and shifting referral patterns lift "
                "the floor independently of any seasonal or regime effect."
            ),
            action=(
                f"Plan a 5-year capacity buffer of approximately {sign}{five_year:.0f} "
                "patients per day. Phase the buffer into rosters and storage rather "
                "than absorbing it all in year 5."
            ),
            source_group=group_id,
            section=self.section,
            detail={
                "per_day_slope":            round(float(slope), 4),
                "per_year":                 per_year,
                "five_year_uplift":         five_year,
                "current_60day_mean":       current,
            },
        )
