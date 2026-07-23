"""Daily weather for the hospital's location (Pretoria) as forecast covariates.

Open-Meteo, no API key. `daily_for_dates` returns temp max/min and
precipitation for an arbitrary list of dates by splitting them between the
archive API (past dates — recorded ERA5 weather) and the forecast API (today
to ~16 days ahead — a real weather forecast). Fail-soft: any error returns
None and the caller forecasts without weather features.

Column names match the project's weather_daily dataset so the same model
features work for training (recorded history) and inference (this module).
"""
from __future__ import annotations

import datetime as _dt
import ssl

import httpx
import pandas as pd

try:  # OS trust store first — survives corporate TLS inspection (see data_source)
    import truststore
    _CTX = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
except ImportError:  # pragma: no cover
    _CTX = True

LAT, LON = -25.7449, 28.1878  # Pretoria
_DAILY_VARS = "temperature_2m_max,temperature_2m_min,precipitation_sum"
_COLS = {"temperature_2m_max": "temp_max_C",
         "temperature_2m_min": "temp_min_C",
         "precipitation_sum": "precipitation_mm"}

_cache: dict[tuple, pd.DataFrame] = {}


def _get(url: str, params: dict) -> pd.DataFrame | None:
    r = httpx.get(url, params=params, timeout=10, verify=_CTX)
    if r.status_code != 200:
        return None
    d = r.json().get("daily") or {}
    if not d.get("time"):
        return None
    df = pd.DataFrame({"date": pd.to_datetime(d["time"])})
    for src, dst in _COLS.items():
        df[dst] = d.get(src)
    return df


def daily_for_dates(dates: list) -> pd.DataFrame | None:
    """Weather rows for the given dates (mixed past/future), or None."""
    try:
        ds = sorted(pd.to_datetime(pd.Series(list(dates))).dt.normalize().unique())
        if not len(ds):
            return None
        today = pd.Timestamp(_dt.date.today())
        key = (str(ds[0]), str(ds[-1]), str(today))
        if key in _cache:
            return _cache[key]

        past = [d for d in ds if d < today]
        future = [d for d in ds if d >= today]
        parts = []
        if past:
            # Archive lags a few days behind real time; request generously.
            parts.append(_get("https://archive-api.open-meteo.com/v1/archive", {
                "latitude": LAT, "longitude": LON, "daily": _DAILY_VARS,
                "start_date": str(pd.Timestamp(past[0]).date()),
                "end_date": str(pd.Timestamp(past[-1]).date()),
                "timezone": "Africa/Johannesburg",
            }))
        if future:
            span = (pd.Timestamp(future[-1]) - today).days + 1
            if span > 16:
                return None  # beyond any real forecast horizon
            parts.append(_get("https://api.open-meteo.com/v1/forecast", {
                "latitude": LAT, "longitude": LON, "daily": _DAILY_VARS,
                "forecast_days": max(1, span), "timezone": "Africa/Johannesburg",
            }))
        parts = [p for p in parts if p is not None]
        if not parts:
            return None
        out = pd.concat(parts, ignore_index=True).drop_duplicates("date")
        out = out[out["date"].isin(ds)].dropna()
        if len(out) < len(ds):  # a requested day is missing -> not usable
            return None
        _cache.clear()
        _cache[key] = out
        return out
    except Exception:
        return None
