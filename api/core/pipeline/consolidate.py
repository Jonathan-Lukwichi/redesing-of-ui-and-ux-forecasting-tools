"""The daily operations table built in stage 3: one row per date that the
arrivals (G1), the staffing summary and the stock movements all cover.

Registry frames hold float32, so every figure is summed in float64 first.
"""
from __future__ import annotations

import pandas as pd

from core.ops_derive import parse_iso_date

COLUMNS = ["date", "total_daily_arrivals", "required_nurses", "staffed_nurses",
           "locum_hours", "consumption_units", "stockout_units", "stock_value_zar"]
_STAFFING = {"total_required_nurses": "required_nurses",
             "total_staffed_nurses": "staffed_nurses",
             "total_locum_hours": "locum_hours"}


def _num(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s, errors="coerce").astype("float64")


def build_ops_daily(g1: pd.DataFrame, staffing_daily: pd.DataFrame,
                    movements: pd.DataFrame, items: pd.DataFrame) -> pd.DataFrame:
    arrivals = pd.DataFrame({
        "date": pd.to_datetime(g1["date"]).dt.strftime("%Y-%m-%d"),
        "total_daily_arrivals": _num(g1["total_daily_arrivals"]),
    }).drop_duplicates("date")

    staffing = pd.DataFrame({"date": parse_iso_date(staffing_daily["date"],
                                                    "staffing_daily")})
    for src, dst in _STAFFING.items():
        staffing[dst] = _num(staffing_daily[src]).to_numpy()
    staffing = staffing.drop_duplicates("date")

    price = _num(items["unit_price_zar"])
    price.index = items["item_id"].astype(str)
    price = price[~price.index.duplicated()]
    stock = pd.DataFrame({
        "date": parse_iso_date(movements["date"], "inventory_movements"),
        "consumption_units": _num(movements["daily_consumption_units"]),
        "stockout_units": _num(movements["stockout_today_units"]),
        "stock_value_zar": (_num(movements["recorded_stock_on_hand_units"])
                            * movements["item_id"].astype(str).map(price)),
    }).groupby("date", as_index=False).sum()

    out = arrivals.merge(staffing, on="date").merge(stock, on="date")
    return out[COLUMNS].sort_values("date").reset_index(drop=True)
