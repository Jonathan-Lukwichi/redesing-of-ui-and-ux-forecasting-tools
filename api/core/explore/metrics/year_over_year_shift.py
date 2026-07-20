"""Year-over-year shift — what the latest year looks like vs the years before.

Matches the "2025 +18% vs 2022-2024" card on the design. Computed by
finding the maximum year in the data and comparing its mean against the
average of all earlier years that are present.
"""
from __future__ import annotations
import pandas as pd

from ..pipeline import Metric, MetricAnalyzer, GroupProfile


class YearOverYearShiftMetric(MetricAnalyzer):
    code = "MF10"
    section = "forecast"
    required_roles = ("target", "date")
    required_group_grain = "daily"
    preferred_group_ids = ("g1",)

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile, ctx) -> Metric | None:
        s = pd.to_numeric(df[prof.target], errors="coerce")
        d = pd.to_datetime(df[prof.date], errors="coerce")
        valid = s.notna() & d.notna()
        if valid.sum() < 90:
            return None
        s, d = s[valid], d[valid]
        years = d.dt.year
        unique_years = sorted(years.unique())
        if len(unique_years) < 2:
            return None
        latest = int(unique_years[-1])
        baseline_years = unique_years[:-1]
        latest_mean   = float(s[years == latest].mean())
        baseline_mean = float(s[years.isin(baseline_years)].mean())
        if baseline_mean <= 0:
            return None
        pct = round((latest_mean - baseline_mean) / baseline_mean * 100, 1)
        accent = "risk" if abs(pct) > 10 else "watch" if abs(pct) > 5 else "stable"
        sign = "+" if pct >= 0 else ""
        baseline_label = (
            f"{baseline_years[0]}–{baseline_years[-1]}" if len(baseline_years) > 1
            else f"{baseline_years[0]}"
        )
        # 30-day rolling tail for the sparkline.
        sparkline = (
            pd.Series(s.to_numpy())
              .rolling(window=30, min_periods=1).mean()
              .dropna().tail(40).round(1).tolist()
        )
        return Metric(
            id=f"{self.code}:{group_id}",
            code=self.code,
            label=f"{latest} SHIFT",
            value=f"{sign}{pct}",
            unit="%",
            delta_pct=None,
            delta_label=f"vs {baseline_label} average",
            sparkline=sparkline,
            accent=accent,
            polarity="normal",
            source_group=group_id,
            detail={
                "latest_year":   latest,
                "latest_mean":   round(latest_mean, 2),
                "baseline_years": baseline_years,
                "baseline_mean": round(baseline_mean, 2),
            },
        )
