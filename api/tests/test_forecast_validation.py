"""Tests for rolling-origin validation and forecast sanity.

The point of core/validation.py is that it must not be able to flatter a model.
These tests check exactly that: that it sees a planted signal, that it refuses
to score data it was trained on, that it reports honestly when a model is no
better than a naive rule, and that it says "I don't know" rather than inventing
a number when there is not enough history.
"""
from __future__ import annotations

import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core import validation as V            # noqa: E402
from core.forecasting import run_ml_forecast, run_arima_forecast  # noqa: E402


def _series(n=400, seed=7, weekly_amp=12.0, noise=4.0, base=70.0):
    """Synthetic arrivals with a KNOWN weekly cycle and a mild trend."""
    rng = np.random.default_rng(seed)
    t = np.arange(n)
    vals = (base
            + weekly_amp * np.sin(2 * np.pi * t / 7.0)
            + 0.01 * t
            + rng.normal(0, noise, n))
    idx = pd.date_range("2024-01-01", periods=n, freq="D")
    return pd.Series(np.clip(vals, 0, None), index=idx)


# ── The validator must actually measure something ────────────────────────────

def test_rolling_origin_measures_a_planted_weekly_signal():
    """Mechanics: the validator must return a complete, finite result set.

    Note it is NOT asserted that the model beats seasonal naive here. On a pure
    period-7 sine, 'same day last week' is very close to optimal and the ML
    engine — which feeds its own predictions back for multi-step — measurably
    loses to it (MASE ~1.0-1.4 across noise levels). That is a genuine property
    of the engine on clean seasonal data, and the validator correctly reports it
    rather than flattering the model. The real-data guarantee is asserted in
    test_ml_engine_beats_seasonal_naive_on_recorded_history below."""
    s = _series(noise=2.0)
    v = V.rolling_origin_evaluate(s, run_ml_forecast, horizon=7, n_folds=4)
    assert v is not None
    assert v["n_folds"] == 4
    assert v["mae"] is not None and v["mae"] > 0
    assert v["mase"] is not None and np.isfinite(v["mase"])
    assert v["seasonal_naive_mae"] is not None and v["seasonal_naive_mae"] > 0
    assert v["beats_seasonal_naive"] is (v["mase"] < 1.0), (
        "beats_seasonal_naive must agree with the MASE it was derived from")


_RECORDED = Path(__file__).resolve().parents[1] / "data" / "simulation" / "staff_daily.csv"


@pytest.mark.skipif(not _RECORDED.exists(), reason="recorded history absent")
def test_ml_engine_beats_seasonal_naive_on_recorded_history():
    """The product guarantee worth protecting: on the department's real arrivals
    the ML engine must do better than 'assume next week repeats last week'. If a
    change makes this fail, the forecast is no longer earning its place."""
    df = pd.read_csv(_RECORDED, parse_dates=["date"])
    s = pd.Series(df["total_arrivals"].astype(float).values, index=df["date"])
    v = V.rolling_origin_evaluate(s, run_ml_forecast, horizon=7, n_folds=5)
    assert v is not None
    assert v["mase"] < 1.0, (
        f"the ML engine no longer beats seasonal naive on real data (MASE {v['mase']})")
    assert v["beats_seasonal_naive"] is True


def test_every_fold_is_scored_on_unseen_data():
    """The whole point: a fold must never be scored on rows it trained on.
    Verified by construction — the forecaster only ever receives history[:c]."""
    s = _series(n=300)
    seen = []

    def spy(history, dates, h):
        seen.append(len(history))
        return run_ml_forecast(history, dates, h)

    v = V.rolling_origin_evaluate(s, spy, horizon=7, n_folds=3, step=7)
    assert v is not None
    # Every training window must end at least `horizon` days before the series
    # end, so a full horizon of unseen actuals exists to score against.
    for train_len in seen:
        assert train_len <= len(s) - 7


def test_per_step_buckets_cover_the_whole_horizon():
    v = V.rolling_origin_evaluate(_series(), run_ml_forecast, horizon=7, n_folds=3)
    assert [d["step"] for d in v["per_step"]] == [1, 2, 3, 4, 5, 6, 7]
    assert all(d["n"] == v["n_folds"] for d in v["per_step"])


def test_horizon_mae_is_the_window_mean_not_a_single_noisy_step():
    v = V.rolling_origin_evaluate(_series(), run_ml_forecast, horizon=7, n_folds=4)
    per_step = [d["mae"] for d in v["per_step"] if d["mae"] is not None]
    assert min(per_step) <= v["horizon_mae"] <= max(per_step)
    assert v["horizon_mae"] == v["mae"]


# ── It must fail honestly ────────────────────────────────────────────────────

def test_returns_none_when_history_is_too_short():
    """No history, no number. The caller must be able to say 'not validated'
    rather than show a fabricated accuracy."""
    assert V.rolling_origin_evaluate(_series(n=60), run_ml_forecast, horizon=7) is None


def test_a_model_that_is_no_better_than_naive_is_reported_as_such():
    """Pure noise: nothing to learn, so MASE should not claim a win."""
    rng = np.random.default_rng(3)
    s = pd.Series(np.clip(rng.normal(70, 12, 320), 0, None),
                  index=pd.date_range("2024-01-01", periods=320, freq="D"))
    v = V.rolling_origin_evaluate(s, run_ml_forecast, horizon=7, n_folds=4)
    assert v is not None
    assert v["mase"] is not None
    # On unpredictable data a seasonal-naive forecast is roughly as good; the
    # honest outcome is a MASE near or above 1, never a confident win.
    assert v["mase"] > 0.75, f"claimed an implausible win on pure noise (MASE {v['mase']})"


def test_a_failing_fold_is_skipped_not_faked():
    calls = {"n": 0}

    def flaky(history, dates, h):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("engine blew up")
        return run_ml_forecast(history, dates, h)

    v = V.rolling_origin_evaluate(_series(), flaky, horizon=7, n_folds=4)
    assert v["n_folds"] == 3, "a failed fold was counted or faked"


def test_summary_never_claims_validation_that_did_not_happen():
    assert V.summarise(None) == "Not yet backtested at this horizon."
    v = V.rolling_origin_evaluate(_series(), run_ml_forecast, horizon=7, n_folds=3)
    assert "Backtested on 3 past windows" in V.summarise(v)


# ── Prediction-interval calibration ──────────────────────────────────────────

def test_prediction_interval_coverage_is_measured_and_plausible():
    """A band claiming 95% that catches 40% is broken, and nothing else in the
    product would notice. This is the check that would catch it."""
    v = V.rolling_origin_evaluate(_series(), run_ml_forecast, horizon=7, n_folds=5)
    assert v["pi_coverage_pct"] is not None
    assert v["pi_nominal_pct"] == 95.0
    assert 50.0 <= v["pi_coverage_pct"] <= 100.0


# ── Engine sanity ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("engine", [run_ml_forecast, run_arima_forecast])
def test_forecasts_are_never_negative(engine):
    s = _series(base=8.0, weekly_amp=7.0, noise=4.0, n=200)
    res = engine(s.tolist(), [d.strftime("%Y-%m-%d") for d in s.index], 14)
    for day in res["forecast"]:
        assert day["predicted"] >= 0
        assert day["lower"] >= 0
        assert day["lower"] <= day["upper"]


@pytest.mark.parametrize("engine", [run_ml_forecast, run_arima_forecast])
def test_engines_return_the_requested_horizon(engine):
    s = _series(n=200)
    for h in (1, 7, 30):
        res = engine(s.tolist(), [d.strftime("%Y-%m-%d") for d in s.index], h)
        assert len(res["forecast"]) == h


def test_category_split_is_declared_as_a_historical_mix_not_a_forecast():
    """CATEGORY_WEIGHTS applies fixed long-run proportions to the daily total,
    so nothing in it predicts a category. The payload must say so, or a future
    consumer will present constants as predictions."""
    s = _series(n=200)
    res = run_ml_forecast(s.tolist(), [d.strftime("%Y-%m-%d") for d in s.index], 7)
    basis = res["category_split_basis"]
    assert basis["is_forecast"] is False
    assert basis["method"] == "historical_case_mix"
