"""Write the five simulated demo-pack CSVs to api/data/demo-pack/.

The files hold what a hospital would have (master lists, stock movements, a
payroll summary, a shift log) and none of the simulator's results. They are
simulated, contain no patient data, and are safe to commit.

Usage (from the repo root):
    api\\.venv\\Scripts\\python.exe scripts\\make_demo_pack.py --chapter7 <path>

<path> is dataAnalysis/chapter7_simulation/simulation (the subfolder, not the
chapter7_simulation root, whose masters are a different generation).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
BUNDLED = ROOT / "api" / "data" / "simulation"
OUT = ROOT / "api" / "data" / "demo-pack"

ITEM_COLS = [
    "item_id", "item_name", "category", "abc_class", "unit", "unit_price_zar",
    "on_current_tender", "lead_time_mean_days", "ordering_cost_zar",
    "holding_cost_rate_per_year", "stockout_penalty_zar", "shelf_life_months",
    "data_origin",
]
MOVEMENT_COLS = [
    "date", "item_id", "daily_consumption_units", "recorded_stock_on_hand_units",
    "stock_on_order_units", "order_placed_today", "stockout_today_units",
    "expiry_today_units",
]
STAFF_MASTER_COLS = [
    "staff_id", "category", "skill_level", "annual_salary_zar",
    "standard_shift_length_hours", "max_weekly_hours", "is_vacant",
]
STAFF_SUMMARY_COLS = [
    "total_days_worked", "total_regular_hours", "total_overtime_hours",
    "total_payroll_cost_zar", "average_weekly_hours",
    "bcea_45hour_violations_count", "max_weekly_hours_observed",
    "total_days_sick",
]
STAFF_COLS = STAFF_MASTER_COLS + STAFF_SUMMARY_COLS + ["data_origin"]
SHIFT_COLS = [
    "date", "shift", "arrivals_for_shift", "required_nurses",
    "filled_staff_assigned", "locum_hours_used", "locum_cost_zar",
    "shift_total_cost_zar", "unfilled_positions_after_locum",
]
DAILY_COLS = [
    "date", "day_of_week", "is_weekend", "is_public_holiday", "total_arrivals",
    "total_required_nurses", "total_staffed_nurses", "total_regular_hours",
    "total_overtime_hours", "total_locum_hours", "total_payroll_cost_zar",
    "total_unfilled_shifts", "bcea_violations_today",
]
EXPECTED_FILLED = 23


def build(chapter7: Path) -> dict[str, pd.DataFrame]:
    items = pd.read_csv(chapter7 / "items_master.csv")
    items["data_origin"] = "simulated"
    items = items[ITEM_COLS]

    movements = pd.read_csv(BUNDLED / "supply_panel.csv")[MOVEMENT_COLS]
    unknown = set(movements["item_id"]) - set(items["item_id"])
    if unknown:
        raise SystemExit(f"Movements reference items missing from the catalogue: {sorted(unknown)}")

    master = pd.read_csv(chapter7 / "staff_master.csv")
    members = pd.read_csv(BUNDLED / "staff_members.csv")
    filled = master[~master["is_vacant"].astype(bool)]
    if len(filled) != EXPECTED_FILLED:
        raise SystemExit(f"Expected {EXPECTED_FILLED} filled posts, found {len(filled)}.")
    unjoined = set(filled["staff_id"]) - set(members["staff_id"])
    if unjoined:
        raise SystemExit(f"Filled staff ids with no bundled record: {sorted(unjoined)}")

    summary = members[["staff_id"] + STAFF_SUMMARY_COLS]
    staff = master[STAFF_MASTER_COLS].merge(summary, on="staff_id", how="left")
    staff["data_origin"] = "simulated"
    staff = staff[STAFF_COLS]

    shifts = pd.read_csv(BUNDLED / "staff_shifts.csv")[SHIFT_COLS]
    daily = pd.read_csv(BUNDLED / "staff_daily.csv")[DAILY_COLS]
    return {
        "inventory_items": items,
        "inventory_movements": movements,
        "staff_list": staff,
        "shift_log": shifts,
        "staffing_daily": daily,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--chapter7", required=True, type=Path,
                    help="path to dataAnalysis/chapter7_simulation/simulation")
    args = ap.parse_args()
    frames = build(args.chapter7)
    OUT.mkdir(exist_ok=True)
    for name, df in frames.items():
        df.to_csv(OUT / f"{name}.csv", index=False)
        print(f"{name}.csv: {len(df):,} rows, {len(df.columns)} columns")
    return 0


if __name__ == "__main__":
    sys.exit(main())
