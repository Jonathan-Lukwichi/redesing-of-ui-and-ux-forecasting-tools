"""Dominant cycle — FFT-detected seasonal period with the highest power.

Searches for periods in [2, 365] days only, so the long-run trend (which
would otherwise dominate the spectrum) doesn't swallow the seasonal signal.
The series is linearly detrended before FFT.
"""
from __future__ import annotations
import numpy as np
import pandas as pd
from scipy.signal import detrend as sp_detrend

from ..pipeline import Metric, MetricAnalyzer, GroupProfile


def _classify(period_days: float) -> str | None:
    if not np.isfinite(period_days) or period_days <= 0:
        return None
    if 6.0  <= period_days <= 8.0:   return "Weekly"
    if 13.0 <= period_days <= 16.0:  return "Bi-weekly"
    if 28.0 <= period_days <= 31.0:  return "Monthly"
    if 60   <= period_days <= 65:    return "Bi-monthly"
    if 89.0 <= period_days <= 93.0:  return "Quarterly"
    if 175  <= period_days <= 190:   return "Semi-annual"
    if 360  <= period_days <= 370:   return "Yearly"
    return None  # Out-of-range periods don't map to a meaningful seasonal label.


class DominantCycleMetric(MetricAnalyzer):
    code = "MF8"
    section = "forecast"
    required_roles = ("target",)
    required_group_grain = "daily"
    preferred_group_ids = ("g1",)

    MIN_PERIOD = 2.0
    MAX_PERIOD = 365.0

    def run(self, group_id, df: pd.DataFrame, prof: GroupProfile, ctx) -> Metric | None:
        y = pd.to_numeric(df[prof.target], errors="coerce").dropna().to_numpy()
        if y.size < 60:
            return None
        # Linear detrend so the trend doesn't park its energy in low-freq bins.
        try:
            z = sp_detrend(y, type="linear")
        except Exception:
            z = y - y.mean()

        spec  = np.abs(np.fft.rfft(z))
        freqs = np.fft.rfftfreq(z.size, d=1.0)
        if spec.size < 3:
            return None

        # Restrict search to recognisable seasonal periods.
        periods = np.divide(
            1.0, freqs,
            out=np.full_like(freqs, np.inf, dtype=float),
            where=freqs > 0,
        )
        mask = (periods >= self.MIN_PERIOD) & (periods <= self.MAX_PERIOD)
        if not mask.any():
            return None
        candidate_idxs = np.where(mask)[0]
        idx = int(candidate_idxs[np.argmax(spec[candidate_idxs])])
        period = float(periods[idx])
        label = _classify(period)
        if label is None:
            return None  # don't surface unrecognised "37-day" style noise
        share = float(spec[idx] / spec[candidate_idxs].sum())
        return Metric(
            id=f"{self.code}:{group_id}",
            code=self.code,
            label="DOMINANT CYCLE",
            value=label,
            unit=f"period ≈ {period:.1f}d",
            delta_pct=round(share * 100, 1),
            delta_label="share of in-band spectral power",
            sparkline=None,
            accent="trend",
            polarity="neutral",
            source_group=group_id,
            detail={"period_days": round(period, 2), "power_share": round(share, 4)},
        )
