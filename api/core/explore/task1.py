"""
Task 1 — Daily total demand analyses.

- distribution:     histogram + descriptive stats + best-fit candidates
                    (Normal, Poisson, NegBinomial) with AIC for each
- stl_decomposition: observed / trend / seasonal / residual via statsmodels STL
                    (weekly period = 7)
- acf_pacf:         autocorrelation + partial autocorrelation up to N lags,
                    with 95% confidence band
- calendar_effects: day-of-week and month boxplot summaries
"""
from __future__ import annotations
import math
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats
from statsmodels.tsa.seasonal import STL
from statsmodels.tsa.stattools import acf, pacf


def _safe(values: np.ndarray) -> np.ndarray:
    return values[np.isfinite(values)]


def distribution(df: pd.DataFrame, target_col: str = "total_daily_arrivals",
                 bins: int = 30) -> dict[str, Any]:
    if target_col not in df.columns:
        return {"target": target_col, "available": False}
    x = pd.to_numeric(df[target_col], errors="coerce").to_numpy()
    x = _safe(x)
    if x.size == 0:
        return {"target": target_col, "available": False}

    # Histogram
    counts, edges = np.histogram(x, bins=bins)
    centers = (edges[:-1] + edges[1:]) / 2
    width = float(edges[1] - edges[0])

    # Descriptive stats
    mean = float(x.mean())
    std  = float(x.std(ddof=1))
    skew = float(stats.skew(x))
    kurt = float(stats.kurtosis(x))
    vmr  = float(x.var(ddof=1) / mean) if mean > 0 else None

    # PDF candidates over centers, scaled by N * width so they overlay the count histogram.
    n_total = float(x.size)
    fits: list[dict[str, Any]] = []

    # Normal
    try:
        norm_pdf = stats.norm.pdf(centers, loc=mean, scale=std) * n_total * width
        aic_n = _aic_continuous(x, stats.norm.logpdf(x, loc=mean, scale=std), k=2)
        fits.append({"name": "Normal", "pdf": norm_pdf.tolist(), "aic": _round(aic_n)})
    except Exception:
        pass

    # Poisson (only for integer-valued non-negative data)
    try:
        if (x >= 0).all() and np.all(np.equal(np.mod(x, 1), 0)):
            lam = mean
            poisson_pmf = stats.poisson.pmf(np.round(centers).astype(int), mu=lam) * n_total
            aic_p = _aic_continuous(x, stats.poisson.logpmf(x.astype(int), mu=lam), k=1)
            fits.append({"name": "Poisson", "pdf": poisson_pmf.tolist(), "aic": _round(aic_p)})
    except Exception:
        pass

    # Negative Binomial (overdispersed count)
    try:
        if (x >= 0).all() and std > 0 and mean > 0 and std**2 > mean:
            p = mean / (std**2)
            n_param = mean * p / (1 - p)
            nb_pmf = stats.nbinom.pmf(np.round(centers).astype(int), n=n_param, p=p) * n_total
            aic_nb = _aic_continuous(x, stats.nbinom.logpmf(x.astype(int), n=n_param, p=p), k=2)
            fits.append({"name": "NegBinomial", "pdf": nb_pmf.tolist(), "aic": _round(aic_nb)})
    except Exception:
        pass

    return {
        "target": target_col,
        "available": True,
        "histogram": {
            "bin_centers": centers.tolist(),
            "counts":      counts.tolist(),
            "bin_width":   width,
        },
        "stats": {
            "n": int(n_total),
            "mean": _round(mean),
            "std":  _round(std),
            "min":  float(x.min()),
            "max":  float(x.max()),
            "median": float(np.median(x)),
            "skewness": _round(skew),
            "kurtosis": _round(kurt),
            "variance_to_mean_ratio": _round(vmr) if vmr is not None else None,
        },
        "fits": fits,
    }


def stl_decomposition(df: pd.DataFrame, target_col: str = "total_daily_arrivals",
                      period: int = 7) -> dict[str, Any]:
    if target_col not in df.columns or "date" not in df.columns:
        return {"target": target_col, "available": False}

    s = pd.Series(
        pd.to_numeric(df[target_col], errors="coerce").to_numpy(),
        index=pd.to_datetime(df["date"], errors="coerce"),
    ).dropna().sort_index()

    if s.size < period * 4:
        return {"target": target_col, "available": False, "reason": "not enough rows for STL"}

    # Subsample if extremely long to keep payload reasonable.
    if s.size > 1500:
        s = s.iloc[-1500:]

    try:
        result = STL(s, period=period, robust=True).fit()
    except Exception as e:
        return {"target": target_col, "available": False, "reason": str(e)}

    dates = [d.strftime("%Y-%m-%d") for d in s.index]
    return {
        "target":  target_col,
        "period":  period,
        "available": True,
        "dates":   dates,
        "observed": s.to_numpy().round(2).tolist(),
        "trend":    result.trend.to_numpy().round(2).tolist(),
        "seasonal": result.seasonal.to_numpy().round(2).tolist(),
        "resid":    result.resid.to_numpy().round(2).tolist(),
    }


def acf_pacf(df: pd.DataFrame, target_col: str = "total_daily_arrivals",
             nlags: int = 30) -> dict[str, Any]:
    if target_col not in df.columns:
        return {"target": target_col, "available": False}
    x = pd.to_numeric(df[target_col], errors="coerce").dropna().to_numpy()
    if x.size < nlags + 5:
        return {"target": target_col, "available": False, "reason": "not enough rows"}

    a = acf(x, nlags=nlags, fft=True)
    p = pacf(x, nlags=nlags, method="ywadjusted") if x.size > nlags + 2 else pacf(x, nlags=nlags)
    band = 1.96 / math.sqrt(x.size)

    return {
        "target":  target_col,
        "available": True,
        "nlags":   nlags,
        "n":       int(x.size),
        "lags":    list(range(nlags + 1)),
        "acf":     [round(float(v), 4) for v in a],
        "pacf":    [round(float(v), 4) for v in p],
        "confidence_band": round(float(band), 4),
    }


def calendar_effects(df: pd.DataFrame, target_col: str = "total_daily_arrivals") -> dict[str, Any]:
    if target_col not in df.columns:
        return {"target": target_col, "available": False}

    s = pd.to_numeric(df[target_col], errors="coerce")
    out: dict[str, Any] = {"target": target_col, "available": True}

    if "day_of_week" in df.columns:
        groups = df.assign(_v=s).groupby("day_of_week")["_v"]
        out["day_of_week"] = _group_box_stats(groups, ordered_keys=list(range(7)))
        out["day_of_week_labels"] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    if "month" in df.columns:
        groups = df.assign(_v=s).groupby("month")["_v"]
        out["month"] = _group_box_stats(groups, ordered_keys=list(range(1, 13)))
        out["month_labels"] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    if "is_weekend" in df.columns:
        wd = s[df["is_weekend"] == 0].dropna()
        we = s[df["is_weekend"] == 1].dropna()
        out["weekend_vs_weekday"] = {
            "weekday_mean": _round(float(wd.mean())) if wd.size else None,
            "weekend_mean": _round(float(we.mean())) if we.size else None,
            "weekday_n":    int(wd.size),
            "weekend_n":    int(we.size),
            "pct_deviation": (
                _round(float((we.mean() - wd.mean()) / wd.mean() * 100))
                if wd.size and wd.mean() else None
            ),
        }

    if "is_public_holiday" in df.columns:
        non = s[df["is_public_holiday"] == 0].dropna()
        hol = s[df["is_public_holiday"] == 1].dropna()
        out["holiday_vs_regular"] = {
            "regular_mean": _round(float(non.mean())) if non.size else None,
            "holiday_mean": _round(float(hol.mean())) if hol.size else None,
            "regular_n":    int(non.size),
            "holiday_n":    int(hol.size),
            "pct_deviation": (
                _round(float((hol.mean() - non.mean()) / non.mean() * 100))
                if non.size and non.mean() else None
            ),
        }

    return out


# ---- helpers ----------------------------------------------------------------

def _group_box_stats(groups, ordered_keys: list[Any]) -> list[dict[str, Any]]:
    out = []
    g_map = {k: v.dropna().to_numpy() for k, v in groups}
    for k in ordered_keys:
        vals = g_map.get(k, np.array([]))
        if vals.size == 0:
            out.append({"key": k, "n": 0})
            continue
        q1, med, q3 = np.percentile(vals, [25, 50, 75])
        out.append({
            "key": k,
            "n": int(vals.size),
            "min": float(vals.min()),
            "q1":  float(q1),
            "median": float(med),
            "q3":  float(q3),
            "max": float(vals.max()),
            "mean": float(vals.mean()),
        })
    return out


def _round(v: float | None, digits: int = 3) -> float | None:
    if v is None or not math.isfinite(v):
        return None
    return round(float(v), digits)


def _aic_continuous(x: np.ndarray, log_likelihood_values, k: int) -> float:
    ll = float(np.sum(log_likelihood_values))
    return 2 * k - 2 * ll
