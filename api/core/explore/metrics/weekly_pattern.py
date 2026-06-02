"""Weekly rhythm — how strongly each week mirrors the one before it.

Computed as autocorrelation at lag 7. We surface the magnitude as a
qualitative band (Strong / Moderate / Weak) so non-technical readers
get a one-word read on whether the model can lean on the week-over-week
pattern. The raw ACF(7) value is in the detail field.
"""
from __future__ import annotations
import pandas as pd
from statsmodels.tsa.stattools import acf

from ..pipeline import Metric, MetricAnalyzer, GroupProfile


class WeeklyPatternMetric(MetricAnalyzer):
    code = "MF3"
    section = "forecast"
    required_roles = ("target",)
    required_group_grain = "daily"
    preferred_group_ids = ("g1",)

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile, ctx) -> Metric | None:
        s = pd.to_numeric(df[prof.target], errors="coerce").dropna()
        if s.size < 30:
            return None
        try:
            a = acf(s.to_numpy(), nlags=7, fft=True)
        except Exception:
            return None
        if len(a) < 8:
            return None
        a7 = float(a[7])
        mag = abs(a7)
        if mag >= 0.6:
            label = "Strong"
            accent = "stable"
        elif mag >= 0.35:
            label = "Moderate"
            accent = "stable"
        elif mag >= 0.15:
            label = "Weak"
            accent = "watch"
        else:
            label = "Almost none"
            accent = "watch"

        return Metric(
            id=f"{self.code}:{group_id}",
            code=self.code,
            label="WEEKLY RHYTHM",
            value=label,
            unit=None,
            delta_pct=None,
            delta_label=f"Same shape each week · score {a7:.2f} of 1.00",
            sparkline=None,
            accent=accent,
            polarity="neutral",
            source_group=group_id,
            detail={"acf_lag7": round(a7, 3)},
        )
