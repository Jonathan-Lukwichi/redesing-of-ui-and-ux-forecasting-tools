import os
from datetime import datetime

from fastapi import APIRouter, HTTPException, Body
from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel
import numpy as np
import pandas as pd

from core.forecasting import auto_forecast, run_arima_forecast, run_ml_forecast, WEATHER_FEATURES
from core import prepare_registry, weather as live_weather

router = APIRouter(prefix="/api/forecast", tags=["forecast"])


class ForecastRequest(BaseModel):
    history: List[float]
    dates: List[str]
    horizon: int = 7
    model: str = "auto"  # auto | arima | ml


@router.post("")
async def run_forecast(req: ForecastRequest) -> Dict[str, Any]:
    if len(req.history) < 14:
        raise HTTPException(400, "Need at least 14 days of history to forecast.")
    if len(req.history) != len(req.dates):
        raise HTTPException(400, "history and dates must have the same length.")

    try:
        if req.model == "arima":
            result = run_arima_forecast(req.history, req.dates, req.horizon)
        elif req.model == "ml":
            result = run_ml_forecast(req.history, req.dates, req.horizon)
        else:
            result = auto_forecast(req.history, req.dates, req.horizon)
    except Exception as e:
        raise HTTPException(500, f"Forecast failed: {e}")

    return result


class RunRequest(BaseModel):
    """Frontend-facing forecast request. Server pulls history from G1 itself
    so the browser never has to ship a 1500-day array. Manager picks a model
    family and a horizon — that's it.

    `alias` is an optional display label (e.g. "Hybrid 1") so the weather-style
    result can echo back the catalogue model the manager clicked, even though
    the live engine that actually runs is SARIMAX (statistical) or Gradient
    Boosting (ml)."""
    model: Literal["statistical", "ml"] = "statistical"
    horizon: int = 7
    alias: Optional[str] = None
    # Optional backtest: forecast FROM this date using only data before it, then
    # compare to the actuals we already have. None = forecast the open future.
    start_date: Optional[str] = None


# Horizons the weather-style UI offers. Daily: 1, 7, 30, 365. Weekly specialties
# count in weeks: 1, 4, 52. 14 kept for backward compatibility.
_ALLOWED_HORIZONS = (1, 4, 7, 14, 30, 52, 365)


def _confidence_from_intervals(forecast: list) -> Optional[float]:
    """A robust, bounded confidence: how tight each day's 95% interval is
    relative to its predicted value, averaged. Works even for low-volume
    specialties where MAPE blows up. 100% = razor-tight band, 0% = band as
    wide as the value itself."""
    if not forecast:
        return None
    rels = []
    for d in forecast:
        pred = max(float(d.get("predicted", 0)), 1.0)
        half = (float(d.get("upper", 0)) - float(d.get("lower", 0))) / 2.0
        rels.append(min(half / pred, 1.0))
    mean_rel = sum(rels) / len(rels)
    return round(max(0.0, min(100.0, 100.0 * (1.0 - mean_rel))), 1)


def _confidence_tier(pct: Optional[float]) -> Optional[str]:
    if pct is None:
        return None
    if pct >= 75:
        return "High"
    if pct >= 50:
        return "Moderate"
    if pct >= 25:
        return "Low"
    return "Very low"


def _attach_confidence(result: dict, hist_mean: float) -> None:
    """Attach confidence_pct, a qualitative tier, a low_volume flag, and the
    basis used.

    Headline confidence = the model's validation ACCURACY (100 − MAPE). This is
    the standard, intuitive measure and matches the MAPE we already report. The
    95% interval (shown as the range) carries the separate day-to-day spread, so
    we don't double-count interval width into the headline number.

    For very low-volume series (a handful of cases per period) MAPE is unstable
    (tiny denominators blow it up), so we fall back to interval tightness and
    flag low_volume — telling planners to use the range, not the point number,
    rather than pretending to a precision the data can't support."""
    low_volume = bool(hist_mean < 5.0)
    mape = result.get("mape")

    if not low_volume and isinstance(mape, (int, float)):
        pct = round(max(0.0, min(100.0, 100.0 - mape)), 1)
        basis = "accuracy"           # 100 − validation MAPE
    else:
        pct = _confidence_from_intervals(result.get("forecast"))
        basis = "interval"           # band tightness (MAPE unreliable here)

    result["confidence_pct"] = pct
    result["confidence_tier"] = _confidence_tier(pct)
    result["confidence_basis"] = basis
    result["low_volume"] = low_volume
    result["avg_actual"] = round(float(hist_mean), 1)


# Weather covariates only help when the forecast window is short enough for a
# real weather forecast to exist at decision time.
_WEATHER_MAX_HORIZON = 14

# Backtested Jul 2026 over 8 cutoffs, horizon 7: calendar features improved
# MAE 12.55 -> 11.52; adding weather (recorded, i.e. its best case) moved it to
# 11.92 — worse than calendar-only. Weather plumbing is kept but opt-in until
# a validated gain exists: set FORECAST_WEATHER=on to enable.
_WEATHER_ENABLED = (os.getenv("FORECAST_WEATHER") or "off").strip().lower() == "on"


def _weather_frame(weather_df, dates, horizon: int):
    """Assemble recorded history + window weather for the ML engine.
    Returns (frame, source_label) or (None, None). Window rows come from the
    recorded data when available (backtest / historical replay), otherwise
    from the live Open-Meteo APIs."""
    if weather_df is None or not len(dates):
        return None, None
    last = pd.to_datetime(dates[-1])
    win = [last + pd.Timedelta(days=i + 1) for i in range(horizon)]
    w = weather_df.copy()
    w["date"] = pd.to_datetime(w["date"]).dt.normalize()
    have = set(w["date"])
    if all(d.normalize() in have for d in win):
        return w, "recorded (replay)"
    fetched = live_weather.daily_for_dates(win)
    if fetched is not None:
        return pd.concat([w, fetched], ignore_index=True), "open-meteo"
    return None, None


def _forecast_from_series(
    s: "pd.Series",
    model: str,
    horizon: int,
    weekly: bool = False,
    start_date: Optional[str] = None,
    weather_df: "Optional[pd.DataFrame]" = None,
) -> Dict[str, Any]:
    """Core forecast routine shared by Task 1 (total) and Task 2 (specialty).

    `s` is the full daily, date-indexed, cleaned series. When `start_date` is
    given we train ONLY on data strictly before it and forecast forward from it
    — then attach the real actuals for any forecast period we already have, so
    the UI can show predicted-vs-actual (a backtest). With no start_date we
    forecast the open future from the last known day."""
    data_min, data_max = s.index.min(), s.index.max()
    grain = s.resample("W").sum() if weekly else s
    unit = "weeks" if weekly else "days"

    cutoff = pd.to_datetime(start_date) if start_date else None
    train = grain[grain.index < cutoff] if cutoff is not None else grain

    if train.size < 30:
        raise HTTPException(
            422,
            f"Only {int(train.size)} {unit} of history before the chosen start "
            f"— need at least 30. Pick a later start date.",
        )
    if not weekly and train.size > 730:
        train = train.iloc[-730:]

    history = train.to_numpy().round(2).tolist()
    dates   = [d.strftime("%Y-%m-%d") for d in train.index]

    try:
        if model == "statistical":
            result = run_arima_forecast(history, dates, horizon)
        else:
            wframe, wsource = (None, None)
            if _WEATHER_ENABLED and not weekly and horizon <= _WEATHER_MAX_HORIZON:
                wframe, wsource = _weather_frame(weather_df, dates, horizon)
            result = run_ml_forecast(history, dates, horizon, weather=wframe)
            result["weather_source"] = wsource if result.get("weather_used") else None
    except Exception as e:
        raise HTTPException(500, f"Forecast failed: {e}")

    # Engine emits consecutive daily dates; rewrite to weekly steps if needed.
    if weekly and result.get("forecast"):
        last = pd.to_datetime(dates[-1])
        for i, day in enumerate(result["forecast"]):
            day["date"] = (last + pd.Timedelta(days=7 * (i + 1))).strftime("%Y-%m-%d")

    # Attach real actuals where we have them → backtest comparison.
    actual_lookup = {d.strftime("%Y-%m-%d"): float(v) for d, v in grain.items()}
    n_comp = 0
    ae_sum = 0.0
    ape_sum = 0.0
    tot_pred = 0.0
    tot_act = 0.0
    for day in result.get("forecast", []):
        a = actual_lookup.get(day["date"])
        if a is not None:
            day["actual"] = round(a, 1)
            n_comp += 1
            ae_sum += abs(day["predicted"] - a)
            ape_sum += abs(day["predicted"] - a) / (abs(a) + 1e-6)
            tot_pred += day["predicted"]
            tot_act += a
        else:
            day["actual"] = None

    backtest = None
    if n_comp > 0:
        bt_mape = round(ape_sum / n_comp * 100, 2)
        # Window-total error (the aggregated number cancels daily noise — the
        # honest metric when planning at the window level, not per-day).
        total_pct_err = round(abs(tot_pred - tot_act) / (abs(tot_act) + 1e-6) * 100, 2)
        backtest = {
            "n_compared":      n_comp,
            "mae":             round(ae_sum / n_comp, 2),
            "mape":            bt_mape,
            "accuracy_pct":    round(max(0.0, min(100.0, 100.0 - bt_mape)), 1),
            "total_predicted": round(tot_pred, 1),
            "total_actual":    round(tot_act, 1),
            "total_pct_error": total_pct_err,
        }

    result["forecast_start"]      = result["forecast"][0]["date"] if result.get("forecast") else None
    result["last_actual_date"]    = dates[-1] if dates else None
    result["history_window_days"] = int(train.size)
    result["data_min_date"]       = data_min.strftime("%Y-%m-%d")
    result["data_max_date"]       = data_max.strftime("%Y-%m-%d")
    result["is_backtest"]         = backtest is not None
    result["backtest"]            = backtest

    _attach_confidence(result, float(train.mean()))

    # When we can compare to reality, confidence = how it ACTUALLY did on the
    # chosen window (the most honest measure available).
    if backtest is not None and not result.get("low_volume"):
        result["confidence_pct"]   = backtest["accuracy_pct"]
        result["confidence_tier"]  = _confidence_tier(backtest["accuracy_pct"])
        result["confidence_basis"] = "backtest"
    return result


# The most recent forecast run from either Forecast page. The engines are not
# perfectly deterministic run-to-run, so the Ask assistant must read THIS result
# — the numbers the user is actually looking at — rather than trigger its own.
_LAST_RUN: Optional[Dict[str, Any]] = None


def _remember_run(kind: str, result: Dict[str, Any]) -> None:
    global _LAST_RUN
    _LAST_RUN = {
        "kind":   kind,  # "total" | "specialty"
        "ran_at": datetime.now().isoformat(timespec="seconds"),
        "result": result,
    }


@router.get("/last")
async def last_run() -> Dict[str, Any]:
    """The last forecast the user ran (exactly what the Forecast page shows)."""
    if _LAST_RUN is None:
        return {"available": False}
    return {"available": True, **_LAST_RUN}


@router.post("/run")
async def run_from_pipeline(req: RunRequest) -> Dict[str, Any]:
    # Forecast pulls history from G1 in-memory; frontend only sends model + horizon.
    if req.horizon not in _ALLOWED_HORIZONS:
        raise HTTPException(
            400, f"horizon must be one of {_ALLOWED_HORIZONS} days.")

    df = prepare_registry.get_df("g1")
    if df is None:
        raise HTTPException(
            409,
            {"error": "g1_not_merged",
             "message": "G1 (Daily demand) is not merged. Build it on the Prepare page first."},
        )

    target_col = "total_daily_arrivals"
    if target_col not in df.columns or "date" not in df.columns:
        raise HTTPException(
            500,
            f"G1 is missing required columns ('date' and '{target_col}').",
        )

    s = pd.Series(
        pd.to_numeric(df[target_col], errors="coerce").to_numpy(),
        index=pd.to_datetime(df["date"], errors="coerce"),
    ).dropna().sort_index()

    weather_df = (df[["date"] + WEATHER_FEATURES].copy()
                  if all(c in df.columns for c in WEATHER_FEATURES) else None)
    result = _forecast_from_series(
        s, req.model, req.horizon, weekly=False, start_date=req.start_date,
        weather_df=weather_df,
    )
    result["requested_model"]   = req.model
    result["requested_alias"]   = req.alias
    result["requested_horizon"] = req.horizon
    _remember_run("total", result)
    return result


# --- Per-specialty forecast (Task 2) -----------------------------------------

# Display specialty name -> G3 column holding that specialty's daily count.
SPECIALTY_COLUMN = {
    "Medicine":     "spec_medicine",
    "Orthopaedics": "spec_orthopaedics",
    "Surgery":      "spec_surgery",
    "Gynaecology":  "spec_gynae",
    "Paediatrics":  "spec_paediatrics",
    "Maternity":    "spec_maternity",
    "Psychiatry":   "spec_psychiatry",
}


class SpecialtyForecastRequest(BaseModel):
    """Task 2 weather-style forecast for one specialty. Server pulls the
    specialty's daily series from the merged G3 (Clinical daily) group."""
    specialty: str
    model: Literal["statistical", "ml"] = "statistical"
    horizon: int = 7
    alias: Optional[str] = None
    # "weekly" specialties (Maternity / Psychiatry) are resampled to weekly sums.
    resolution: Literal["daily", "weekly"] = "daily"
    # Optional backtest start (see RunRequest.start_date).
    start_date: Optional[str] = None


@router.post("/specialty")
async def run_specialty_forecast(req: SpecialtyForecastRequest) -> Dict[str, Any]:
    col = SPECIALTY_COLUMN.get(req.specialty)
    if col is None:
        raise HTTPException(400, f"Unknown specialty '{req.specialty}'.")
    if req.horizon not in _ALLOWED_HORIZONS:
        raise HTTPException(400, f"horizon must be one of {_ALLOWED_HORIZONS}.")

    df = prepare_registry.get_df("g3")
    if df is None:
        raise HTTPException(
            409,
            {"error": "g3_not_merged",
             "message": "G3 (Clinical daily) is not merged. Build it on the Prepare page first."},
        )
    if col not in df.columns or "date" not in df.columns:
        raise HTTPException(500, f"G3 is missing required columns ('date' and '{col}').")

    s = pd.Series(
        pd.to_numeric(df[col], errors="coerce").to_numpy(),
        index=pd.to_datetime(df["date"], errors="coerce"),
    ).dropna().sort_index()

    weather_df = (df[["date"] + WEATHER_FEATURES].copy()
                  if all(c in df.columns for c in WEATHER_FEATURES) else None)
    result = _forecast_from_series(
        s, req.model, req.horizon,
        weekly=(req.resolution == "weekly"),
        start_date=req.start_date,
        weather_df=weather_df,
    )
    result["requested_model"]     = req.model
    result["requested_alias"]     = req.alias
    result["requested_horizon"]   = req.horizon
    result["requested_specialty"] = req.specialty
    result["resolution"]          = req.resolution
    _remember_run("specialty", result)
    return result


def _series_for(group: str, specialty: Optional[str]):
    """Return (series, weekly, label, target_id) for a forecast target, or raise.
    g1 = total daily arrivals; specialty = that specialty's column in G3."""
    if specialty:
        col = SPECIALTY_COLUMN.get(specialty)
        if col is None:
            raise HTTPException(400, f"Unknown specialty '{specialty}'.")
        df = prepare_registry.get_df("g3")
        if df is None:
            raise HTTPException(409, {"error": "g3_not_merged",
                                      "message": "G3 (Clinical daily) is not merged. Build it on the Prepare page first."})
        target = col
        weekly = specialty in ("Maternity", "Psychiatry")
    else:
        df = prepare_registry.get_df("g1")
        if df is None:
            raise HTTPException(409, {"error": "g1_not_merged",
                                      "message": "G1 (Daily demand) is not merged. Build it on the Prepare page first."})
        target = "total_daily_arrivals"
        weekly = False
    if target not in df.columns or "date" not in df.columns:
        raise HTTPException(500, f"Required columns missing ('date' and '{target}').")
    s = pd.Series(
        pd.to_numeric(df[target], errors="coerce").to_numpy(),
        index=pd.to_datetime(df["date"], errors="coerce"),
    ).dropna().sort_index()
    return s, weekly


# Cache live-engine accuracy so the model picker can show numbers that match the
# result without recomputing on every page load. Keyed by target + data shape.
_ENGINE_CACHE: dict = {}


@router.get("/engines")
async def engine_accuracy(group: str = "g1", specialty: Optional[str] = None) -> Dict[str, Any]:
    """Live accuracy of the two engines that actually run (SARIMAX + Gradient
    Boosting) on this target, so the picker shows what the result will show."""
    s, weekly = _series_for(group, specialty)
    key = (specialty or group, int(s.size),
           s.index[-1].strftime("%Y-%m-%d") if s.size else "-")
    if key in _ENGINE_CACHE:
        return _ENGINE_CACHE[key]

    horizon = 4 if weekly else 7
    out: Dict[str, Any] = {"target": specialty or group, "weekly": weekly, "engines": {}}
    for model in ("statistical", "ml"):
        try:
            res = _forecast_from_series(s, model, horizon, weekly=weekly, start_date=None)
            out["engines"][model] = {
                "accuracy_pct": res.get("confidence_pct"),
                "mae": res.get("mae"),
                "low_volume": res.get("low_volume", False),
            }
        except HTTPException:
            raise
        except Exception as e:
            out["engines"][model] = {"accuracy_pct": None, "mae": None, "error": str(e)}
    _ENGINE_CACHE[key] = out
    return out


@router.get("/coverage")
async def coverage(group: str = "g1", specialty: Optional[str] = None) -> Dict[str, Any]:
    """Date span available for a forecast target, so the UI can bound its
    start-date picker. group=g1 (total) or g3 (specialty). Returns nulls when
    the group isn't merged yet."""
    gid = "g3" if (group == "g3" or specialty) else "g1"
    df = prepare_registry.get_df(gid)
    if df is None or "date" not in getattr(df, "columns", []):
        return {"group": gid, "merged": False, "min_date": None, "max_date": None}
    dates = pd.to_datetime(df["date"], errors="coerce").dropna().sort_values()
    if dates.empty:
        return {"group": gid, "merged": True, "min_date": None, "max_date": None}
    return {
        "group": gid,
        "merged": True,
        "min_date": dates.iloc[0].strftime("%Y-%m-%d"),
        "max_date": dates.iloc[-1].strftime("%Y-%m-%d"),
    }


@router.get("/demo")
async def demo_forecast() -> Dict[str, Any]:
    """Returns a forecast using built-in demo data (no upload needed)."""
    import pandas as pd
    from datetime import datetime, timedelta

    np.random.seed(42)
    n = 90
    base = 180
    today = datetime.today()
    dates = [(today - timedelta(days=n-i)).strftime("%Y-%m-%d") for i in range(n)]

    # Realistic ED arrivals with weekly seasonality + trend + noise
    t = np.arange(n)
    weekly = 20 * np.sin(2 * np.pi * t / 7)
    trend  = 0.3 * t
    noise  = np.random.normal(0, 8, n)
    history = (base + weekly + trend + noise).clip(100, 320).round(0).tolist()

    return auto_forecast(history, dates, horizon=7)
