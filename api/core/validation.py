"""Rolling-origin forecast validation.

Why this module exists
----------------------
The engines in ``core.forecasting`` used to report their accuracy from a single
holdout scored ONE STEP AHEAD:

* the ML path measured error on validation rows whose ``lag_1``/``lag_7``/
  rolling means came from real observed history, while the forecast shown to a
  user is built iteratively, feeding each prediction back in as the next day's
  lag — so by day 7 the model stands on six of its own guesses;
* the statistical path measured a NON-seasonal ARIMA on a train split while
  displaying a SARIMAX forecast, having chosen the order on the full series
  including the holdout.

Both overstate accuracy, and the overstatement is not cosmetic: the optimiser
takes ``mae`` as sigma_eps for the staffing buffer and as the forecast-error term
in the safety-stock formula, so an optimistic error silently under-sizes both.

What this does instead
----------------------
Walk-forward (rolling-origin) evaluation, the standard method for time-series
forecasts: choose a set of cut-offs near the end of the series, and at each one
train only on what came before and forecast ``horizon`` days blind. Errors are
accumulated PER HORIZON STEP, so a 7-day plan is judged on 7-day-ahead accuracy
and a 30-day plan on 30-day-ahead accuracy.

Reported measures
-----------------
* ``mae``   — mean absolute error, in patients. The headline: it is in the units
              a charge nurse thinks in, and it is what the optimiser consumes.
* ``mase``  — MAE divided by the MAE of a seasonal-naive (last week, same day)
              forecast on the training data. Scale-free and defined at zero, so
              it works where MAPE breaks. Below 1 means better than "same as
              last week"; above 1 means worse, which is the number that should
              stop a deployment.
* ``mape``  — kept because managers ask for it, but it is reported alongside a
              zero-denominator count so it is never quoted blind.
* ``pi_coverage`` — the share of actuals that fell inside the stated 95% band.
              A band claiming 95% that catches 60% is a broken band, and nothing
              else in the product would have caught that.
"""
from __future__ import annotations

import math
from typing import Any, Callable, Optional

import warnings

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

# A fold costs one full model fit, so the default is sized to stay inside the
# 512MB / on-demand budget while giving the per-step means something to stand on.
DEFAULT_FOLDS = 8
SEASONAL_PERIOD = 7          # weekly seasonality in ED arrivals


def _seasonal_naive_mae(train: np.ndarray, period: int = SEASONAL_PERIOD) -> float:
    """MAE of 'same day last week' on the training data — the MASE denominator."""
    if train.size <= period:
        return float("nan")
    diffs = np.abs(train[period:] - train[:-period])
    return float(np.mean(diffs)) if diffs.size else float("nan")


def rolling_origin_evaluate(
    series: pd.Series,
    forecaster: Callable[[list[float], list[str], int], dict],
    horizon: int,
    n_folds: int = DEFAULT_FOLDS,
    step: int = SEASONAL_PERIOD,
    min_train: int = 90,
) -> Optional[dict[str, Any]]:
    """Walk `n_folds` cut-offs backwards from the end of `series`.

    `forecaster(history, dates, horizon)` must return the engine payload shape
    (a ``forecast`` list of ``{predicted, lower, upper}``). Each fold trains only
    on data strictly before its cut-off, so nothing the fold is scored on was
    visible to it.

    Returns None when the series is too short to cut folds from — the caller
    should then say the model is unvalidated rather than invent a number.
    """
    values = np.asarray(series.values, dtype=float)
    dates = [d.strftime("%Y-%m-%d") for d in pd.to_datetime(series.index)]
    n = values.size

    # Latest usable cut-off leaves a full horizon of actuals to score against.
    cutoffs: list[int] = []
    for k in range(n_folds):
        c = n - horizon - k * step
        if c < min_train:
            break
        cutoffs.append(c)
    if not cutoffs:
        return None
    cutoffs.reverse()

    # abs errors and interval hits, bucketed by step-ahead (1..horizon)
    step_abs: list[list[float]] = [[] for _ in range(horizon)]
    step_ape: list[list[float]] = [[] for _ in range(horizon)]
    hits = total = zero_denom = 0
    naive_maes: list[float] = []
    folds_run = 0

    for c in cutoffs:
        hist = values[:c]
        hist_dates = dates[:c]
        actual = values[c:c + horizon]
        if actual.size < horizon:
            continue
        try:
            res = forecaster(hist.tolist(), hist_dates, horizon)
        except Exception:
            continue           # a fold that cannot fit is skipped, never faked
        days = res.get("forecast") or []
        if len(days) < horizon:
            continue
        folds_run += 1
        nm = _seasonal_naive_mae(hist)
        if not math.isnan(nm) and nm > 0:
            naive_maes.append(nm)

        for h in range(horizon):
            pred = float(days[h].get("predicted", 0.0))
            act = float(actual[h])
            step_abs[h].append(abs(pred - act))
            if abs(act) > 1e-9:
                step_ape[h].append(abs(pred - act) / abs(act))
            else:
                zero_denom += 1
            lo = days[h].get("lower")
            hi = days[h].get("upper")
            if lo is not None and hi is not None:
                total += 1
                if float(lo) <= act <= float(hi):
                    hits += 1

    if not folds_run:
        return None

    per_step = [{
        "step": h + 1,
        "mae": round(float(np.mean(step_abs[h])), 2) if step_abs[h] else None,
        "mape": round(float(np.mean(step_ape[h]) * 100), 2) if step_ape[h] else None,
        "n": len(step_abs[h]),
    } for h in range(horizon)]

    flat_abs = [e for bucket in step_abs for e in bucket]
    flat_ape = [e for bucket in step_ape for e in bucket]
    mae = float(np.mean(flat_abs)) if flat_abs else None
    naive_mae = float(np.mean(naive_maes)) if naive_maes else None
    mase = (round(mae / naive_mae, 3) if (mae is not None and naive_mae) else None)

    return {
        "method": "rolling_origin",
        "horizon": horizon,
        "n_folds": folds_run,
        "step_days": step,
        "train_from": dates[0],
        "last_cutoff": dates[min(cutoffs[-1], n - 1)],
        "mae": round(mae, 2) if mae is not None else None,
        "mape": round(float(np.mean(flat_ape) * 100), 2) if flat_ape else None,
        "mape_zero_denominator_days": zero_denom,
        "mase": mase,
        "seasonal_naive_mae": round(naive_mae, 2) if naive_mae else None,
        "beats_seasonal_naive": (None if mase is None else bool(mase < 1.0)),
        "pi_coverage_pct": round(hits / total * 100, 1) if total else None,
        "pi_nominal_pct": 95.0,
        "per_step": per_step,
        # What the optimiser consumes. Deliberately the MEAN error across the
        # whole planning window, not the final step: each per-step bucket holds
        # only one observation per fold, so individual steps are far too noisy
        # to size a safety buffer from. The window mean is what the plan is
        # actually exposed to, and it is measured multi-step, which is the
        # correction this module exists to make.
        "horizon_mae": round(mae, 2) if mae is not None else None,
        "per_step_note": ("Each step is measured once per fold, so individual steps "
                          "are noisy; read the trend, not a single day."),
    }


def summarise(v: Optional[dict[str, Any]]) -> str:
    """One plain-English line for the UI and the AI assistant."""
    if not v:
        return "Not yet backtested at this horizon."
    parts = [f"Backtested on {v['n_folds']} past windows"]
    if v.get("mae") is not None:
        parts.append(f"typically within {v['mae']:.0f} patients")
    if v.get("mase") is not None:
        parts.append("better than 'same as last week'" if v["beats_seasonal_naive"]
                     else "NOT better than 'same as last week'")
    if v.get("pi_coverage_pct") is not None:
        parts.append(f"the stated range caught {v['pi_coverage_pct']:.0f}% of days")
    return " · ".join(parts) + "."
