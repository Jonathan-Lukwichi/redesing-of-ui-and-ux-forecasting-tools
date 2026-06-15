from fastapi import APIRouter, HTTPException, Body
from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel
import numpy as np
import pandas as pd

from core.forecasting import auto_forecast, run_arima_forecast, run_ml_forecast
from core import prepare_registry

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
    """Attach confidence_pct, a qualitative tier, and a low_volume flag.

    For very low-volume series (a handful of cases per period) a daily point
    forecast is inherently imprecise — we flag it so the UI can tell planners
    to use the range rather than the single number, instead of pretending to
    a precision the data can't support."""
    pct = _confidence_from_intervals(result.get("forecast"))
    result["confidence_pct"] = pct
    result["confidence_tier"] = _confidence_tier(pct)
    result["low_volume"] = bool(hist_mean < 5.0)
    result["avg_actual"] = round(float(hist_mean), 1)


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

    if s.size < 30:
        raise HTTPException(
            422,
            f"Only {int(s.size)} valid days in G1 — need at least 30 to forecast.",
        )

    # The ARIMA path can be slow on multi-year histories; cap to the most
    # recent 730 days (~2 years) for the forecast input — still plenty of
    # signal, ~5× faster fit.
    if s.size > 730:
        s = s.iloc[-730:]

    history = s.to_numpy().round(2).tolist()
    dates   = [d.strftime("%Y-%m-%d") for d in s.index]

    try:
        if req.model == "statistical":
            result = run_arima_forecast(history, dates, req.horizon)
        else:  # ml
            result = run_ml_forecast(history, dates, req.horizon)
    except Exception as e:
        raise HTTPException(500, f"Forecast failed: {e}")

    # Annotate with what the manager asked for, in their language.
    result["requested_model"] = req.model
    result["requested_alias"] = req.alias
    result["requested_horizon"] = req.horizon
    result["history_window_days"] = int(s.size)
    result["forecast_start"] = result["forecast"][0]["date"] if result.get("forecast") else None
    result["last_actual_date"] = dates[-1] if dates else None
    _attach_confidence(result, float(s.mean()))
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

    weekly = req.resolution == "weekly"
    step_days = 7 if weekly else 1
    if weekly:
        # Sum daily specialty counts into ISO weeks; index = week-end dates.
        s = s.resample("W").sum()

    if s.size < 30:
        raise HTTPException(
            422,
            f"Only {int(s.size)} valid {'weeks' if weekly else 'days'} for {req.specialty} — need at least 30.",
        )
    # Cap daily histories to ~2 years for a fast fit; weekly stays whole.
    if not weekly and s.size > 730:
        s = s.iloc[-730:]

    history = s.to_numpy().round(2).tolist()
    dates   = [d.strftime("%Y-%m-%d") for d in s.index]

    try:
        if req.model == "statistical":
            result = run_arima_forecast(history, dates, req.horizon)
        else:
            result = run_ml_forecast(history, dates, req.horizon)
    except Exception as e:
        raise HTTPException(500, f"Forecast failed: {e}")

    # The engine emits consecutive *daily* dates. For weekly resolution, rewrite
    # the forecast dates to 7-day steps from the last actual week.
    if weekly and result.get("forecast"):
        last = pd.to_datetime(dates[-1])
        for i, day in enumerate(result["forecast"]):
            day["date"] = (last + pd.Timedelta(days=step_days * (i + 1))).strftime("%Y-%m-%d")

    result["requested_model"]    = req.model
    result["requested_alias"]    = req.alias
    result["requested_horizon"]  = req.horizon
    result["requested_specialty"] = req.specialty
    result["resolution"]         = req.resolution
    result["history_window_days"] = int(s.size)
    result["forecast_start"]     = result["forecast"][0]["date"] if result.get("forecast") else None
    result["last_actual_date"]   = dates[-1] if dates else None
    _attach_confidence(result, float(s.mean()))
    return result


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
