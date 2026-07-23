import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict, Any, Tuple
import warnings
warnings.filterwarnings("ignore")

CATEGORY_WEIGHTS = {
    "respiratory": 0.264,
    "cardiac":     0.206,
    "trauma":      0.150,
    "gi":          0.131,
    "infectious":  0.104,
    "neurological":0.085,
    "other":       0.060,
}

def _label(v: float, values: List[float]) -> str:
    p75 = np.percentile(values, 75)
    p90 = np.percentile(values, 90)
    if v >= p90:
        return "peak"
    if v >= p75:
        return "high"
    if v >= np.percentile(values, 40):
        return "med"
    return "low"


# South African public holidays — deterministic for any date, so they are
# always legitimate forecast features (known at decision time, any horizon).
try:
    import holidays as _holidays_lib
    _ZA_HOLIDAYS = _holidays_lib.country_holidays("ZA", years=range(2015, 2041))
except Exception:  # pragma: no cover — package missing: features become zeros
    _ZA_HOLIDAYS = {}


def _is_holiday(ts: pd.Timestamp) -> int:
    try:
        return int(ts.date() in _ZA_HOLIDAYS)
    except Exception:
        return 0


# Weather covariate columns (must match the weather_daily dataset and
# core/weather.py). Used only when a weather frame covering both the training
# history and the forecast window is supplied.
WEATHER_FEATURES = ["temp_max_C", "temp_min_C", "precipitation_mm"]


def _calendar_extras(ts: pd.Timestamp) -> dict:
    return {
        "is_holiday":         _is_holiday(ts),
        "day_before_holiday": _is_holiday(ts + timedelta(days=1)),
        "day_after_holiday":  _is_holiday(ts - timedelta(days=1)),
        "day_of_month":       ts.day,
    }


def _build_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy().sort_values("date")
    df["dow"] = df["date"].dt.dayofweek
    df["month"] = df["date"].dt.month
    df["is_weekend"] = (df["dow"] >= 5).astype(int)
    df["is_holiday"] = df["date"].map(_is_holiday)
    df["day_before_holiday"] = (df["date"] + pd.Timedelta(days=1)).map(_is_holiday)
    df["day_after_holiday"]  = (df["date"] - pd.Timedelta(days=1)).map(_is_holiday)
    df["day_of_month"] = df["date"].dt.day
    for lag in [1, 2, 3, 7]:
        df[f"lag_{lag}"] = df["arrivals"].shift(lag)
    df["roll7_mean"] = df["arrivals"].shift(1).rolling(7).mean()
    df["roll7_std"]  = df["arrivals"].shift(1).rolling(7).std()
    df["roll14_mean"]= df["arrivals"].shift(1).rolling(14).mean()
    return df.dropna()


def _as_1d(x) -> np.ndarray:
    """Coerce a statsmodels result (Series or ndarray) to a 1-D float array.
    Newer statsmodels returns plain ndarrays (no .values); older returns
    pandas objects. This works for both."""
    return np.asarray(getattr(x, "values", x), dtype=float).ravel()


def _conf_bounds(ci) -> Tuple[np.ndarray, np.ndarray]:
    """Split a conf_int result (DataFrame or 2-col ndarray) into lower/upper."""
    arr = np.asarray(getattr(ci, "values", ci), dtype=float)
    return arr[:, 0], arr[:, 1]


def run_arima_forecast(
    history: List[float],
    dates: List[str],
    horizon: int = 7,
) -> Dict[str, Any]:
    from statsmodels.tsa.arima.model import ARIMA
    from statsmodels.tsa.statespace.sarimax import SARIMAX

    series = np.array(history, dtype=float)
    best_aic = np.inf
    best_order = (1, 1, 1)
    best_seasonal = (1, 1, 0, 7)

    # Grid search over small ARIMA space
    for p in range(3):
        for q in range(3):
            try:
                m = ARIMA(series, order=(p, 1, q)).fit()
                if m.aic < best_aic:
                    best_aic = m.aic
                    best_order = (p, 1, q)
            except Exception:
                pass

    # Try SARIMA with weekly seasonality
    try:
        sarima = SARIMAX(
            series,
            order=best_order,
            seasonal_order=best_seasonal,
            enforce_stationarity=False,
            enforce_invertibility=False,
        ).fit(disp=False)
        fc = sarima.get_forecast(steps=horizon)
        mean_fc = _as_1d(fc.predicted_mean)
        lower, upper = _conf_bounds(fc.conf_int(alpha=0.05))
        model_name = "SARIMAX(weekly)"
        resid = _as_1d(sarima.resid)
    except Exception:
        model = ARIMA(series, order=best_order).fit()
        fc = model.get_forecast(steps=horizon)
        mean_fc = _as_1d(fc.predicted_mean)
        lower, upper = _conf_bounds(fc.conf_int(alpha=0.05))
        model_name = f"ARIMA{best_order}"
        resid = _as_1d(model.resid)

    # Clip negatives
    mean_fc = np.clip(mean_fc, 0, None)
    lower    = np.clip(lower,    0, None)
    upper    = np.clip(upper,    0, None)

    # Metrics on last 20% of history as holdout
    holdout_n = max(7, len(series) // 5)
    train = series[:-holdout_n]
    test  = series[-holdout_n:]
    try:
        val_model = ARIMA(train, order=best_order).fit()
        val_fc = val_model.forecast(steps=holdout_n)
        mae  = float(np.mean(np.abs(val_fc - test)))
        mape = float(np.mean(np.abs((val_fc - test) / (test + 1e-6))) * 100)
    except Exception:
        mae  = float(np.mean(np.abs(np.diff(series[-7:]))))
        mape = mae / (np.mean(series) + 1e-6) * 100

    # Build forecast dates
    last_date = pd.to_datetime(dates[-1]) if dates else datetime.today()
    fc_dates = [
        (last_date + timedelta(days=i+1)).strftime("%Y-%m-%d")
        for i in range(horizon)
    ]

    all_vals = mean_fc.tolist()
    forecast_days = []
    for i in range(horizon):
        cats = {k: round(mean_fc[i] * w, 1) for k, w in CATEGORY_WEIGHTS.items()}
        forecast_days.append({
            "date":       fc_dates[i],
            "predicted":  round(float(mean_fc[i]), 1),
            "lower":      round(float(lower[i]), 1),
            "upper":      round(float(upper[i]), 1),
            "label":      _label(float(mean_fc[i]), all_vals),
            "categories": cats,
        })

    # History for chart
    hist_out = [
        {"date": d, "arrivals": float(v)}
        for d, v in zip(dates[-30:], series[-30:])
    ]

    return {
        "success":    True,
        "model_used": model_name,
        "mape":       round(mape, 2),
        "mae":        round(mae, 2),
        "horizon":    horizon,
        "forecast":   forecast_days,
        "history":    hist_out,
        "interval_method": "model_pi",  # the model's own 95% prediction interval
        "message":    f"Trained on {len(series)} days of data",
    }


def run_ml_forecast(
    history: List[float],
    dates: List[str],
    horizon: int = 7,
    weather: "pd.DataFrame | None" = None,
    calendar_extras: bool = True,
) -> Dict[str, Any]:
    """`weather` (optional): DataFrame with columns date + WEATHER_FEATURES
    covering BOTH the training dates and the forecast window. History rows use
    recorded weather; forecast rows use a real weather forecast (or recorded
    weather in backtest/replay). If coverage is incomplete the model silently
    runs without weather — never with invented values."""
    from sklearn.ensemble import GradientBoostingRegressor

    df = pd.DataFrame({"date": pd.to_datetime(dates), "arrivals": history})
    df = _build_features(df)

    feature_cols = ["dow", "month", "is_weekend", "lag_1", "lag_2", "lag_3", "lag_7",
                    "roll7_mean", "roll7_std", "roll14_mean"]
    if calendar_extras:
        feature_cols += ["is_holiday", "day_before_holiday", "day_after_holiday",
                         "day_of_month"]

    # Attach weather covariates when the frame covers enough of the history
    # and every day of the forecast window.
    last_date_ts = pd.to_datetime(dates[-1])
    horizon_dates = [last_date_ts + timedelta(days=i + 1) for i in range(horizon)]
    weather_lookup: dict = {}
    use_weather = False
    if weather is not None and len(weather):
        w = weather.copy()
        w["date"] = pd.to_datetime(w["date"]).dt.normalize()
        w = w.dropna(subset=WEATHER_FEATURES).drop_duplicates("date")
        weather_lookup = {d: r for d, r in zip(w["date"], w[WEATHER_FEATURES].to_dict("records"))}
        hist_cover = df["date"].dt.normalize().isin(w["date"]).mean()
        fut_cover = all(d.normalize() in weather_lookup for d in horizon_dates)
        if hist_cover >= 0.95 and fut_cover:
            df = df.merge(w[["date"] + WEATHER_FEATURES], on="date", how="inner")
            feature_cols += WEATHER_FEATURES
            use_weather = True

    # Train/val split (last 15%)
    split = max(7, int(len(df) * 0.85))
    train_df = df.iloc[:split]
    val_df   = df.iloc[split:]

    X_train = train_df[feature_cols]
    y_train = train_df["arrivals"]

    model = GradientBoostingRegressor(n_estimators=200, max_depth=4, learning_rate=0.05)
    model.fit(X_train, y_train)

    if len(val_df) > 0:
        preds_val = model.predict(val_df[feature_cols])
        mae  = float(np.mean(np.abs(preds_val - val_df["arrivals"].values)))
        mape = float(np.mean(np.abs((preds_val - val_df["arrivals"].values) /
                                     (val_df["arrivals"].values + 1e-6))) * 100)
    else:
        mae, mape = 10.0, 5.0

    # Iterative multi-step forecast
    all_hist = list(df["arrivals"].values)
    all_dates = list(df["date"].values)
    forecasted = []
    last_date = pd.to_datetime(dates[-1])

    for step in range(horizon):
        next_date = last_date + timedelta(days=step+1)
        row = {
            "dow":        next_date.dayofweek,
            "month":      next_date.month,
            "is_weekend": int(next_date.dayofweek >= 5),
            "lag_1":      all_hist[-1],
            "lag_2":      all_hist[-2],
            "lag_3":      all_hist[-3],
            "lag_7":      all_hist[-7] if len(all_hist) >= 7 else all_hist[-1],
            "roll7_mean": np.mean(all_hist[-7:]),
            "roll7_std":  np.std(all_hist[-7:]),
            "roll14_mean":np.mean(all_hist[-14:]) if len(all_hist) >= 14 else np.mean(all_hist),
        }
        if calendar_extras:
            row.update(_calendar_extras(pd.Timestamp(next_date)))
        if use_weather:
            row.update(weather_lookup[pd.Timestamp(next_date).normalize()])
        pred = float(model.predict(pd.DataFrame([row])[feature_cols])[0])
        pred = max(0, pred)
        forecasted.append(pred)
        all_hist.append(pred)

    # Data-driven 95% interval: use the middle 95% of the model's OWN past
    # errors (validation residuals = actual - predicted) instead of assuming a
    # normal curve. We also widen gently with the horizon, because an iterative
    # multi-step forecast (it feeds its own predictions back in) accumulates
    # uncertainty the further ahead it goes.
    if len(val_df) > 0:
        residuals = val_df["arrivals"].values - preds_val  # actual - predicted
        q_lo = float(np.quantile(residuals, 0.025))
        q_hi = float(np.quantile(residuals, 0.975))
    else:
        # Fallback when there's no validation split: normal approx from MAE.
        q_lo, q_hi = -1.96 * mae * 1.25, 1.96 * mae * 1.25

    all_vals = forecasted
    fc_dates = [
        (last_date + timedelta(days=i+1)).strftime("%Y-%m-%d")
        for i in range(horizon)
    ]
    forecast_days = []
    for i in range(horizon):
        # Gentle horizon widening: +6% per step ahead (1-step band at i=0).
        widen = 1.0 + 0.06 * i
        cats = {k: round(forecasted[i] * w, 1) for k, w in CATEGORY_WEIGHTS.items()}
        forecast_days.append({
            "date":       fc_dates[i],
            "predicted":  round(forecasted[i], 1),
            "lower":      round(max(0, forecasted[i] + q_lo * widen), 1),
            "upper":      round(forecasted[i] + q_hi * widen, 1),
            "label":      _label(forecasted[i], all_vals),
            "categories": cats,
        })

    hist_out = [
        {"date": str(d)[:10], "arrivals": float(v)}
        for d, v in zip(dates[-30:], history[-30:])
    ]

    return {
        "success":    True,
        "model_used": "GradientBoosting",
        "mape":       round(mape, 2),
        "mae":        round(mae, 2),
        "horizon":    horizon,
        "forecast":   forecast_days,
        "history":    hist_out,
        "interval_method": "empirical",  # middle 95% of the model's own past errors
        "weather_used": use_weather,
        "n_features":  len(feature_cols),
        "message":    f"Trained on {len(df)} feature-engineered samples",
    }


def auto_forecast(
    history: List[float],
    dates: List[str],
    horizon: int = 7,
) -> Dict[str, Any]:
    """Try ML first; fall back to ARIMA."""
    if len(history) < 30:
        return run_arima_forecast(history, dates, horizon)
    try:
        result = run_ml_forecast(history, dates, horizon)
        result["model_used"] = "GradientBoosting (auto)"
        return result
    except Exception:
        return run_arima_forecast(history, dates, horizon)
