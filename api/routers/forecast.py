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
    family and a horizon — that's it."""
    model: Literal["statistical", "ml"] = "statistical"
    horizon: int = 7


@router.post("/run")
async def run_from_pipeline(req: RunRequest) -> Dict[str, Any]:
    if req.horizon not in (7, 14, 30):
        raise HTTPException(400, "horizon must be 7, 14, or 30 days.")

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
    result["requested_horizon"] = req.horizon
    result["history_window_days"] = int(s.size)
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
