"""Stationarity — Augmented Dickey-Fuller p-value.

A low p-value means the series is stationary in mean, which is what
ARIMA-class baselines assume. If non-stationary, the forecast either has
to model the trend explicitly or work on differenced data.

Mirrors the ADF check the Streamlit EDA already runs in
04_Explore_Data._render_time_series_diagnostics.
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
        is_stationary = p < 0.05
        return Metric(
            id=f"{self.code}:{group_id}",
            code=self.code,
            label="STATIONARITY",
            value="Yes" if is_stationary else "No",
            unit=f"ADF p={p:.3f}",
            delta_pct=None,
            delta_label="trend-stationary if Yes",
            sparkline=None,
            accent="stable" if is_stationary else "watch",
            polarity="neutral",
            source_group=group_id,
            detail={"adf_statistic": round(float(stat), 3), "p_value": round(float(p), 4)},
        )
