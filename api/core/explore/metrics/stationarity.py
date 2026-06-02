"""Demand stability — plain-English wrapper around the Augmented Dickey-Fuller
test. A "stable" series fluctuates around a fixed mean and is easier to
forecast; a "drifting" series is wandering and needs the trend modelled
explicitly.

The ADF p-value is preserved in the detail field for technical users; the
card itself shows only the operational summary.
"""
from __future__ import annotations
import pandas as pd
from statsmodels.tsa.stattools import adfuller

from ..pipeline import Metric, MetricAnalyzer, GroupProfile


class StationarityMetric(MetricAnalyzer):
    code = "MF7"
    section = "forecast"
    required_roles = ("target",)
    required_group_grain = "daily"
    preferred_group_ids = ("g1",)

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile, ctx) -> Metric | None:
        s = pd.to_numeric(df[prof.target], errors="coerce").dropna()
        if s.size < 30:
            return None
        try:
            stat, p, *_ = adfuller(s.to_numpy(), autolag="AIC")
        except Exception:
            return None
        is_stable = p < 0.05
        return Metric(
            id=f"{self.code}:{group_id}",
            code=self.code,
            label="DEMAND STABILITY",
            value="Stable" if is_stable else "Drifting",
            unit=None,
            delta_pct=None,
            delta_label=(
                "Fluctuates around a steady baseline — straightforward to forecast"
                if is_stable
                else "Trending or wandering — the model needs to handle the drift explicitly"
            ),
            sparkline=None,
            accent="stable" if is_stable else "watch",
            polarity="neutral",
            source_group=group_id,
            detail={"adf_statistic": round(float(stat), 3), "p_value": round(float(p), 4)},
        )
