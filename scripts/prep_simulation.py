"""Prepare app-ready CSVs from the CANONICAL chapter-7 simulation package
(the self-contained `simulation/` folder, 30-seed rigour run).

Headline KPIs come from the 30-seed AGGREGATED results (with 95% CIs) — the
defensible thesis numbers. Per-item / per-staff detail and time-series come from
the representative seed (42). Outputs already exist in the package, so we do not
re-run the simulation here.

Output -> to_push_to_data_repo/simulation/  (also copied to api/data/simulation/).
"""
from pathlib import Path
import pandas as pd
import numpy as np

SRC = Path(r"C:/Users/BIBINBUSINESS/OneDrive/Desktop/dataAnalysis/chapter7_simulation/simulation")
OUT = Path(__file__).resolve().parent.parent / "to_push_to_data_repo" / "simulation"
OUT.mkdir(parents=True, exist_ok=True)
SEED = 42


def _kpi_table(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)  # kpi, n_seeds, mean, sd, half_width_95, lower_95, upper_95
    return df[["kpi", "n_seeds", "mean", "half_width_95", "lower_95", "upper_95"]].round(3)


# ---- Aggregated KPIs (30-seed, with 95% CIs) --------------------------------
_kpi_table(SRC / "aggregated" / "inventory_kpi_ci.csv").to_csv(OUT / "supply_kpis.csv", index=False)
_kpi_table(SRC / "aggregated" / "scheduling_kpi_ci.csv").to_csv(OUT / "staff_kpis.csv", index=False)

# ---------------------------------------------------------------- SUPPLY ----
items = pd.read_csv(SRC / "items_master.csv")
summ = pd.read_csv(SRC / "outputs" / "items_summary.csv")
inv = pd.read_csv(SRC / "outputs" / "inventory_panel.csv")
inv = inv[inv["seed"] == SEED].copy()
inv["date"] = pd.to_datetime(inv["date"]).dt.strftime("%Y-%m-%d")

avg_stock = inv.groupby("item_id")["recorded_stock_on_hand_units"].mean()

master_cols = ["item_id", "category", "unit", "unit_price_zar",
               "lead_time_mean_days", "shelf_life_months",
               "expiry_loss_rate", "initial_stock_units"]
si = summ.merge(items[master_cols], on="item_id", how="left")
si["avg_stock_on_hand"] = si["item_id"].map(avg_stock).fillna(0)
si["inventory_value_zar"] = si["avg_stock_on_hand"] * si["unit_price_zar"]
si["total_cost_zar"] = (si["total_holding_cost_zar"] + si["total_ordering_cost_zar"]
                        + si["total_stockout_cost_zar"] + si["total_expiry_cost_zar"])
si = si.round(2)
keep = ["item_id", "item_name", "category", "abc_class", "unit", "unit_price_zar",
        "on_current_tender", "lead_time_mean_days", "shelf_life_months",
        "mean_daily_consumption", "total_consumption_units", "coefficient_of_variation",
        "service_level_achieved", "number_of_stockout_events", "total_stockout_units",
        "total_orders_placed", "total_orders_with_non_performance", "total_orders_with_payment_delay",
        "total_holding_cost_zar", "total_ordering_cost_zar", "total_stockout_cost_zar",
        "total_expiry_cost_zar", "total_cost_zar", "avg_stock_on_hand", "inventory_value_zar"]
si[keep].to_csv(OUT / "supply_items.csv", index=False)

panel_cols = ["date", "item_id", "daily_consumption_units", "recorded_stock_on_hand_units",
              "stock_on_order_units", "order_placed_today", "stockout_today_units", "expiry_today_units"]
inv[panel_cols].round(2).to_csv(OUT / "supply_panel.csv", index=False)

# ----------------------------------------------------------------- STAFF ----
staff = pd.read_csv(SRC / "staff_master.csv")
ssum = pd.read_csv(SRC / "outputs_scheduling" / "staff_summary.csv")  # 23 active rows
smaster = ["staff_id", "skill_level", "annual_salary_zar", "max_weekly_hours",
           "standard_shift_length_hours", "is_vacant", "annual_leave_days_year"]
sm = ssum.merge(staff[smaster], on="staff_id", how="left").round(2)
keep_s = ["staff_id", "category", "skill_level", "annual_salary_zar", "standard_shift_length_hours",
          "total_days_worked", "total_days_sick", "total_days_annual_leave", "total_days_burnout_absence",
          "total_regular_hours", "total_overtime_hours", "average_weekly_hours", "max_weekly_hours_observed",
          "bcea_45hour_violations_count", "bcea_11hour_rest_violations_count",
          "total_regular_cost_zar", "total_overtime_cost_zar", "total_premium_cost_zar", "total_payroll_cost_zar"]
sm[keep_s].to_csv(OUT / "staff_members.csv", index=False)

dr = pd.read_csv(SRC / "outputs_scheduling" / "daily_roster_summary.csv")
dr = dr[dr["seed"] == SEED].copy()
dr["date"] = pd.to_datetime(dr["date"]).dt.strftime("%Y-%m-%d")
dr.drop(columns=["seed"]).round(2).to_csv(OUT / "staff_daily.csv", index=False)

sd = pd.read_csv(SRC / "outputs_scheduling" / "shift_demand_panel.csv")
sd = sd[sd["seed"] == SEED].copy()
sd["date"] = pd.to_datetime(sd["date"]).dt.strftime("%Y-%m-%d")
sd.drop(columns=["seed"]).round(2).to_csv(OUT / "staff_shifts.csv", index=False)

print("Wrote to", OUT)
for f in sorted(OUT.glob("*.csv")):
    n = sum(1 for _ in open(f)) - 1
    print(f"  {f.name:22} {n:6} rows  {f.stat().st_size/1024:6.0f} KB")
