"""Turn the five uploaded operations files into the seven tables the staff and
supply engines already read through ``simulation_data.load``.

The uploaded files hold what a hospital would have (master lists, stock
movements, a timesheet summary, a shift log). The per-item figures that the
simulator used to ship (service level, cost totals, ...) are computed here, so
the upload is a pipeline and not a file swap.

Registry frames store numerics as float32, so every numeric input is converted
to float64 before any sum or product: money totals must not lose precision.
"""
from __future__ import annotations

import re

import numpy as np
import pandas as pd

KPI_COLUMNS = ["kpi", "n_seeds", "mean", "half_width_95", "lower_95", "upper_95"]

_TRUE = {"true", "1", "1.0", "yes"}
_FALSE = {"false", "0", "0.0", "no"}
_ISO_DATE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})(?:[ T]00:00:00(?:\.0+)?)?$")


def parse_bool(series: pd.Series) -> pd.Series:
    """Booleans as Excel re-saves them: TRUE/FALSE, True/False, bool, 1/0."""
    def one(v):
        if isinstance(v, (bool, np.bool_)):
            return bool(v)
        s = str(v).strip().lower()
        if s in _TRUE:
            return True
        if s in _FALSE:
            return False
        raise ValueError("a yes/no column holds a value that is not TRUE/FALSE or 1/0")
    return series.map(one).astype(bool)


def parse_iso_date(series: pd.Series, label: str) -> pd.Series:
    """Dates as ISO ``YYYY-MM-DD`` strings. Anything else is rejected by file
    label: a day/month order is never guessed, so 03/04/2025 cannot be swapped."""
    def one(v):
        if isinstance(v, pd.Timestamp):
            return v.strftime("%Y-%m-%d")
        m = _ISO_DATE.match(str(v).strip())
        if not m:
            raise ValueError(
                f"{label}: dates must be written YYYY-MM-DD (for example 2025-01-31). "
                "Re-save the file with that date format.")
        pd.Timestamp(f"{m.group(1)}-{m.group(2)}-{m.group(3)}")  # rejects 2025-13-45
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    return series.map(one)


def origin_of(items: pd.DataFrame, staff: pd.DataFrame) -> str:
    """``real`` only when every row of both master lists says real; anything
    simulated makes the whole set simulated."""
    vals = set(items["data_origin"].astype(str).str.strip().str.lower()) | \
           set(staff["data_origin"].astype(str).str.strip().str.lower())
    return "real" if vals == {"real"} else "simulated"


def _f64(df: pd.DataFrame, cols) -> pd.DataFrame:
    out = df.copy()
    for c in cols:
        out[c] = pd.to_numeric(out[c], errors="coerce").astype("float64")
    return out


def _supply_items(items: pd.DataFrame, movements: pd.DataFrame) -> pd.DataFrame:
    items = _f64(items, ["unit_price_zar", "lead_time_mean_days", "ordering_cost_zar",
                         "holding_cost_rate_per_year", "stockout_penalty_zar", "shelf_life_months"])
    items["on_current_tender"] = parse_bool(items["on_current_tender"])
    mv = _f64(movements, ["daily_consumption_units", "recorded_stock_on_hand_units",
                          "stock_on_order_units", "stockout_today_units", "expiry_today_units"])
    mv["order_placed_today"] = parse_bool(mv["order_placed_today"])
    observed = int(mv["date"].nunique())

    rows = []
    for _, it in items.iterrows():
        g = mv[mv["item_id"] == it["item_id"]]
        price = float(it["unit_price_zar"])
        cons = g["daily_consumption_units"]
        total = float(cons.sum())
        mean = float(cons.mean()) if len(g) else 0.0
        sd = float(cons.std(ddof=1)) if len(g) > 1 else 0.0
        so_units = float(g["stockout_today_units"].sum())
        so_events = int((g["stockout_today_units"] > 0).sum())
        orders = int(g["order_placed_today"].sum())
        stock_sum = float(g["recorded_stock_on_hand_units"].sum())
        avg_stock = float(g["recorded_stock_on_hand_units"].mean()) if len(g) else 0.0
        hold = stock_sum * price * float(it["holding_cost_rate_per_year"]) / 365.0
        order_cost = orders * float(it["ordering_cost_zar"])
        so_cost = so_units * float(it["stockout_penalty_zar"])
        exp_cost = float(g["expiry_today_units"].sum()) * price
        rows.append({
            "item_id": it["item_id"], "item_name": it["item_name"], "category": it["category"],
            "abc_class": it["abc_class"], "unit": it["unit"], "unit_price_zar": price,
            "on_current_tender": bool(it["on_current_tender"]),
            "lead_time_mean_days": it["lead_time_mean_days"], "shelf_life_months": it["shelf_life_months"],
            "total_consumption_units": total,
            "mean_daily_consumption": round(mean, 2),
            "sd_daily_consumption": round(sd, 2),
            "number_of_stockout_events": so_events,
            "total_stockout_units": so_units,
            "total_holding_cost_zar": round(hold, 2),
            "total_ordering_cost_zar": round(order_cost, 2),
            "total_stockout_cost_zar": round(so_cost, 2),
            "total_expiry_cost_zar": round(exp_cost, 2),
            "total_orders_placed": orders,
            "avg_stock_on_hand": round(avg_stock, 2),
            "coefficient_of_variation": round(sd / mean, 2) if mean > 0 else 0.0,
            "service_level_achieved": round(1 - so_units / total, 2) if total > 0 else 1.0,
            "total_cost_zar": round(hold + order_cost + so_cost + exp_cost, 2),
            "inventory_value_zar": round(avg_stock * price, 2),
            "ordering_cost_zar": float(it["ordering_cost_zar"]),
            "stockout_penalty_zar": float(it["stockout_penalty_zar"]),
            "holding_cost_rate_per_year": float(it["holding_cost_rate_per_year"]),
            "observed_days": observed,
        })
    return pd.DataFrame(rows)


def _staff_members(staff: pd.DataFrame) -> pd.DataFrame:
    vacant = parse_bool(staff["is_vacant"])
    m = staff.loc[~vacant].drop(columns=["is_vacant", "data_origin"]).copy()
    for c in ("annual_salary_zar", "standard_shift_length_hours", "max_weekly_hours",
              "total_regular_hours", "total_overtime_hours", "total_payroll_cost_zar",
              "average_weekly_hours", "max_weekly_hours_observed"):
        m[c] = pd.to_numeric(m[c], errors="coerce").astype("float64")
    for c in ("skill_level", "total_days_worked", "bcea_45hour_violations_count", "total_days_sick"):
        m[c] = pd.to_numeric(m[c], errors="coerce").round().astype("int64")
    return m.reset_index(drop=True)


def derive(items: pd.DataFrame, movements: pd.DataFrame, staff: pd.DataFrame,
           shifts: pd.DataFrame, daily: pd.DataFrame) -> dict[str, pd.DataFrame]:
    """The seven simulation tables, keyed by the file names ``load`` serves."""
    movements = movements.copy()
    movements["date"] = parse_iso_date(movements["date"], "inventory_movements")
    shifts = shifts.copy()
    shifts["date"] = parse_iso_date(shifts["date"], "shift_log")
    daily = daily.copy()
    daily["date"] = parse_iso_date(daily["date"], "staffing_daily")
    for c in ("is_weekend", "is_public_holiday"):
        daily[c] = parse_bool(daily[c])
    for c in daily.columns:
        if c not in ("date", "day_of_week", "is_weekend", "is_public_holiday"):
            daily[c] = pd.to_numeric(daily[c], errors="coerce").astype("float64")

    panel = movements.copy()
    panel["order_placed_today"] = parse_bool(panel["order_placed_today"])
    return {
        "supply_items.csv": _supply_items(items, movements),
        "supply_panel.csv": panel,
        "staff_members.csv": _staff_members(staff),
        "staff_shifts.csv": shifts,
        "staff_daily.csv": daily,
        "staff_kpis.csv": pd.DataFrame(columns=KPI_COLUMNS),
        "supply_kpis.csv": pd.DataFrame(columns=KPI_COLUMNS),
    }
