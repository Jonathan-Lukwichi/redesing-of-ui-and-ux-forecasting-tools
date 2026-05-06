from fastapi import APIRouter, HTTPException, Body
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import numpy as np

from core.forecasting import auto_forecast, run_arima_forecast, run_ml_forecast

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
