"""Prepare seed-42, app-ready CSVs from the chapter7_simulation dataset.

Reads the raw simulation outputs, filters to seed 42, recomputes per-item and
per-staff summaries from the seed-42 panels (the shipped *_summary.csv files
are combined across seeds), and writes a small curated set the web app fetches.

Output -> to_push_to_data_repo/simulation/  (push these to the data repo).
"""
from pathlib import Path
import pandas as pd
import numpy as np

SRC = Path(r"C:/Users/BIBINBUSINESS/OneDrive/Desktop/dataAnalysis/chapter7_simulation")
OUT = Path(__file__).resolve().parent.parent / "to_push_to_data_repo" / "simulation"
OUT.mkdir(parents=True, exist_ok=True)
SEED = 42

# ---------------------------------------------------------------- SUPPLY ----
items = pd.read_csv(SRC / "items_master.csv")
inv = pd.read_csv(SRC / "outputs" / "inventory_panel.csv")
inv = inv[inv["seed"] == SEED].copy()
inv["date"] = pd.to_datetime(inv["date"]).dt.strftime("%Y-%m-%d")

# Per-item seed-42 summary recomputed from the panel.
g = inv.groupby("item_id")
summ = pd.DataFrame({
    "total_consumption_units": g["daily_consumption_units"].sum(),
    "mean_daily_consumption":  g["daily_consumption_units"].mean(),
    "sd_daily_consumption":    g["daily_consumption_units"].std(),
    "orders_placed":           g["order_placed_today"].sum(),
    "units_ordered":           g["order_quantity_units"].sum(),
    "total_holding_cost_zar":  g["daily_holding_cost_zar"].sum(),
    "total_ordering_cost_zar": g["daily_ordering_cost_zar"].sum(),
    "total_stockout_cost_zar": g["daily_stockout_penalty_zar"].sum(),
    "stockout_units":          g["stockout_today_units"].sum(),
    "stockout_days":           g["stockout_today_units"].apply(lambda s: int((s > 0).sum())),
    "days":                    g["date"].nunique(),
    "avg_stock_on_hand":       g["stock_on_hand_units"].mean(),
}).reset_index()
# Service level = fraction of demanded units actually served.
summ["service_level"] = 1.0 - (summ["stockout_units"] / summ["total_consumption_units"].replace(0, np.nan))
summ["service_level"] = summ["service_level"].fillna(1.0).clip(0, 1)
summ["cv"] = (summ["sd_daily_consumption"] / summ["mean_daily_consumption"].replace(0, np.nan)).fillna(0)
summ["total_cost_zar"] = summ["total_holding_cost_zar"] + summ["total_ordering_cost_zar"] + summ["total_stockout_cost_zar"]
summ["inventory_value_zar"] = summ["avg_stock_on_hand"] * items.set_index("item_id")["unit_price_zar"].reindex(summ["item_id"]).values

supply_items = items.merge(summ, on="item_id", how="left")
keep_master = ["item_id", "item_name", "category", "abc_class", "used_by_specialty", "unit",
               "unit_price_zar", "lead_time_mean_days", "initial_stock_units", "shelf_life_months", "supplier_tender_cycle"]
supply_items = supply_items[keep_master + [c for c in summ.columns if c != "item_id"]]
supply_items = supply_items.round(3)
supply_items.to_csv(OUT / "supply_items.csv", index=False)

# Trimmed daily panel (seed 42) for the per-item charts.
panel_cols = ["date", "item_id", "daily_consumption_units", "stock_on_hand_units",
              "stock_on_order_units", "order_placed_today", "order_quantity_units",
              "stockout_today_units"]
inv[panel_cols].round(2).to_csv(OUT / "supply_panel.csv", index=False)

# ----------------------------------------------------------------- STAFF ----
staff = pd.read_csv(SRC / "staff_master.csv")
roster = pd.read_csv(SRC / "outputs_scheduling" / "roster_panel.csv")
roster = roster[roster["seed"] == SEED].copy()
roster["date"] = pd.to_datetime(roster["date"]).dt.strftime("%Y-%m-%d")
absence = pd.read_csv(SRC / "outputs_scheduling" / "absence_events.csv")
absence = absence[absence["seed"] == SEED].copy()

gs = roster.groupby("staff_id")
worked = roster[roster["shift_assigned"].notna() & (roster["shift_assigned"] != "Off")]
gw = worked.groupby("staff_id")
ssum = pd.DataFrame({
    "days_worked":     gw.size(),
    "regular_hours":   gs["regular_hours_worked"].sum(),
    "overtime_hours":  gs["overtime_hours_worked"].sum(),
    "regular_cost_zar":  gs["regular_cost_zar"].sum(),
    "overtime_cost_zar": gs["overtime_cost_zar"].sum(),
    "premium_cost_zar":  gs["shift_premium_zar"].sum(),
    "payroll_cost_zar":  gs["total_daily_cost_zar"].sum(),
}).reset_index()
# Sick / leave days from absence events.
sick = absence[absence["absence_type"] == "sick"].groupby("staff_id")["total_days_absent"].sum()
leave = absence[absence["absence_type"].isin(["annual", "annual_leave", "leave"])].groupby("staff_id")["total_days_absent"].sum()
ssum["days_sick"] = ssum["staff_id"].map(sick).fillna(0).astype(int)
ssum["days_leave"] = ssum["staff_id"].map(leave).fillna(0).astype(int)
ssum["avg_weekly_hours"] = ssum["regular_hours"] / (roster["date"].nunique() / 7.0)

# BCEA compliance: count weeks where total hours exceeded the 45h legal limit.
_d = pd.to_datetime(roster["date"])
roster["_week"] = _d.dt.isocalendar().year.astype(str) + "-W" + _d.dt.isocalendar().week.astype(str)
roster["_tot"] = roster["regular_hours_worked"] + roster["overtime_hours_worked"]
_wk = roster.groupby(["staff_id", "_week"])["_tot"].sum().reset_index()
_viol = _wk[_wk["_tot"] > 45].groupby("staff_id").size()
ssum["bcea_45h_violations"] = ssum["staff_id"].map(_viol).fillna(0).astype(int)

staff_members = staff.merge(ssum, on="staff_id", how="left").round(2)
keep_staff = ["staff_id", "staff_name", "category", "skill_level", "annual_salary_zar",
              "hourly_rate_regular_zar", "max_weekly_hours", "annual_leave_days_year"]
staff_members = staff_members[keep_staff + [c for c in ssum.columns if c != "staff_id"]]
staff_members.to_csv(OUT / "staff_members.csv", index=False)

# Daily roster summary (seed 42).
dr = pd.read_csv(SRC / "outputs_scheduling" / "daily_roster_summary.csv")
dr = dr[dr["seed"] == SEED].copy()
dr["date"] = pd.to_datetime(dr["date"]).dt.strftime("%Y-%m-%d")
dr.drop(columns=["seed"]).round(2).to_csv(OUT / "staff_daily.csv", index=False)

# Shift demand (seed 42).
sd = pd.read_csv(SRC / "outputs_scheduling" / "shift_demand_panel.csv")
sd = sd[sd["seed"] == SEED].copy()
sd["date"] = pd.to_datetime(sd["date"]).dt.strftime("%Y-%m-%d")
sd.drop(columns=["seed"]).round(2).to_csv(OUT / "staff_shifts.csv", index=False)

print("Wrote to", OUT)
for f in sorted(OUT.glob("*.csv")):
    n = sum(1 for _ in open(f)) - 1
    print(f"  {f.name:22} {n:6} rows  {f.stat().st_size/1024:6.0f} KB")
