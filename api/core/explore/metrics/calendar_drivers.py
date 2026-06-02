"""Calendar drivers — how many calendar flags significantly move the target.

A higher count means the model has more calendar levers to lean on; if
the count is near zero, the forecast will be driven mostly by lags and
weather.
"""
from __future__ import annotations
import numpy as np
import pandas as pd
from scipy import stats

from ..pipeline import Metric, MetricAnalyzer, GroupProfile


_CANDIDATE_FLAGS = (
    "is_weekend", "is_public_holiday", "is_long_weekend",
    "is_near_holiday", "is_festive_season", "is_school_holiday",
    "is_month_end_period", "is_december", "is_january",
    "is_winter_holiday",
)


class CalendarDriversMetric(MetricAnalyzer):
    code = "MF6"
    section = "forecast"
    required_roles = ("target",)
    required_group_grain = "daily"
    preferred_group_ids = ("g1",)

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile, ctx) -> Metric | None:
        y = pd.to_numeric(df[prof.target], errors="coerce")
        present = [c for c in _CANDIDATE_FLAGS if c in df.columns]
        if not present:
            return None
        significant = 0
        biggest = None
        biggest_effect = 0.0
        for col in present:
            flag = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)
            on  = y[flag == 1].dropna().to_numpy()
            off = y[flag == 0].dropna().to_numpy()
            if on.size < 10 or off.size < 10:
                continue
            try:
                _, p = stats.ttest_ind(on, off, equal_var=False, nan_policy="omit")
            except Exception:
                continue
            if not np.isfinite(p):
                continue
            if p < 0.05:
                significant += 1
                if float(off.mean()) > 0:
                    effect = abs(float(on.mean()) - float(off.mean())) / float(off.mean()) * 100
                    if effect > biggest_effect:
                        biggest_effect = effect
                        biggest = col

        if not significant:
            return None
        return Metric(
            id=f"{self.code}:{group_id}",
            code=self.code,
            label="CALENDAR DRIVERS",
            value=significant,
            unit=f"of {len(present)}",
            delta_pct=None,
            delta_label=(
                f"biggest: {biggest} (~{biggest_effect:.0f}%)"
                if biggest else "significant calendar flags"
            ),
            sparkline=None,
            accent="stable" if significant >= 3 else "watch",
            polarity="neutral",
            source_group=group_id,
        )
