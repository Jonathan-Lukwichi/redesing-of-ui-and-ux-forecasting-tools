"""Calendar effects — how many calendar conditions (holidays, weekends,
school terms, etc.) measurably move daily demand.

Plain-English value: a count of calendar conditions whose impact passes a
statistical significance threshold (Welch t-test, p < 0.05). The
delta_label names the strongest one so the card is self-describing.
"""
from __future__ import annotations
import numpy as np
import pandas as pd
from scipy import stats

from ..pipeline import Metric, MetricAnalyzer, GroupProfile


_FLAG_LABELS = {
    "is_weekend":           "Weekends",
    "is_public_holiday":    "Public holidays",
    "is_long_weekend":      "Long weekends",
    "is_near_holiday":      "Days near a holiday",
    "is_festive_season":    "Festive season",
    "is_school_holiday":    "School holidays",
    "is_month_end_period":  "Month-end",
    "is_december":          "December",
    "is_january":           "January",
    "is_winter_holiday":    "Winter holidays",
}


class CalendarDriversMetric(MetricAnalyzer):
    code = "MF6"
    section = "forecast"
    required_roles = ("target",)
    required_group_grain = "daily"
    preferred_group_ids = ("g1",)

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile, ctx) -> Metric | None:
        y = pd.to_numeric(df[prof.target], errors="coerce")
        present = [c for c in _FLAG_LABELS if c in df.columns]
        if not present:
            return None
        significant = 0
        biggest_label = None
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
                        biggest_label = _FLAG_LABELS[col]

        if not significant:
            return None
        # Plain-English caption naming the strongest driver.
        if biggest_label is not None:
            caption = f"Biggest swing: {biggest_label} (~{biggest_effect:.0f}%)"
        else:
            caption = "Calendar conditions that meaningfully change demand"

        return Metric(
            id=f"{self.code}:{group_id}",
            code=self.code,
            label="CALENDAR EFFECTS",
            value=f"{significant} of {len(present)}",
            unit="matter",
            delta_pct=None,
            delta_label=caption,
            sparkline=None,
            accent="stable" if significant >= 3 else "watch",
            polarity="neutral",
            source_group=group_id,
        )
