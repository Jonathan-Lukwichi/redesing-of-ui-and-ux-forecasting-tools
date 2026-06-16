"""Prepare app-ready CSVs from the CANONICAL chapter-7 simulation package.

To keep the pages internally consistent, ALL per-item / per-staff detail and the
headline KPIs come from ONE representative run (the seed whose totals sit closest
to the 30-seed mean): supply seed 1059, staff seed 10059. The 30-seed AGGREGATED
means with 95% CIs are shipped separately (supply_kpis.csv / staff_kpis.csv) and
shown on the page as a supporting 'across 30 runs' note, not mixed into the
headline. Outputs already exist in the package — we do not re-run the sim.

Output -> to_push_to_data_repo/simulation/ (also copied to api/data/simulation/).
"""
from pathlib import Path
import pandas as pd
import numpy as np

SRC = Path(r"C:/Users/BIBINBUSINESS/OneDrive/Desktop/dataAnalysis/chapter7_simulation/simulation")
OUT = Path(__file__).resolve().parent.parent / "to_push_to_data_repo" / "simulation"
OUT.mkdir(parents=True, exist_ok=True)
SEED_SUPPLY = 1059
SEED_STAFF = 10059


def _kpi_table(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    return df[["kpi", "n_seeds", "mean", "half_width_95", "lower_95", "upper_95"]].round(3)


_kpi_table(SRC / "aggregated" / "inventory_kpi_ci.csv").to_csv(OUT / "supply_kpis.csv", index=False)
_kpi_table(SRC / "aggregated" / "scheduling_kpi_ci.csv").to_csv(OUT / "staff_kpis.csv", index=False)

# ---------------------------------------------------------------- SUPPLY ----
items = pd.read_csv(SRC / "items_master.csv")
inv = pd.read_csv(SRC / "outputs" / "inventory_panel.csv")
inv = inv[inv["seed"] == SEED_SUPPLY].copy()
inv["date"] = pd.to_datetime(inv["date"]).dt.strftime("%Y-%m-%d")

g = inv.groupby("item_id")
summ = pd.DataFrame({
    "total_consumption_units":  g["daily_consumption_units"].sum(),
    "mean_daily_consumption":   g["daily_consumption_units"].mean(),
    "sd_daily_consumption":     g["daily_consumption_units"].std(),
    "number_of_stockout_events": g["stockout_today_units"].apply(lambda s: int((s > 0).sum())),
    "total_stockout_units":     g["stockout_today_units"].sum(),
    "total_holding_cost_zar":   g["daily_holding_cost_zar"].sum(),
    "total_ordering_cost_zar":  g["daily_ordering_cost_zar"].sum(),
    "total_stockout_cost_zar":  g["daily_stockout_penalty_zar"].sum(),
    "total_expiry_cost_zar":    g["daily_expiry_cost_zar"].sum(),
    "total_orders_placed":      g["order_placed_today"].sum(),
    "avg_stock_on_hand":        g["recorded_stock_on_hand_units"].mean(),
}).reset_index()
summ["coefficient_of_variation"] = (summ["sd_daily_consumption"] / summ["mean_daily_consumption"].replace(0, np.nan)).fillna(0)
summ["service_level_achieved"] = (1 - summ["total_stockout_units"] / summ["total_consumption_units"].replace(0, np.nan)).fillna(1).clip(0, 1)
summ["total_cost_zar"] = (summ["total_holding_cost_zar"] + summ["total_ordering_cost_zar"]
                          + summ["total_stockout_cost_zar"] + summ["total_expiry_cost_zar"])

master_cols = ["item_id", "item_name", "category", "abc_class", "unit", "unit_price_zar",
               "on_current_tender", "lead_time_mean_days", "shelf_life_months"]
si = items[master_cols].merge(summ, on="item_id", how="left")
si["inventory_value_zar"] = si["avg_stock_on_hand"] * si["unit_price_zar"]
si.round(2).to_csv(OUT / "supply_items.csv", index=False)

panel_cols = ["date", "item_id", "daily_consumption_units", "recorded_stock_on_hand_units",
              "stock_on_order_units", "order_placed_today", "stockout_today_units", "expiry_today_units"]
inv[panel_cols].round(2).to_csv(OUT / "supply_panel.csv", index=False)

# ----------------------------------------------------------------- STAFF ----
staff = pd.read_csv(SRC / "staff_master.csv")
ros = pd.read_csv(SRC / "outputs_scheduling" / "roster_panel.csv")
ros = ros[ros["seed"] == SEED_STAFF].copy()
ros["_d"] = pd.to_datetime(ros["date"])
ros["_tot"] = ros["regular_hours_worked"] + ros["overtime_hours_worked"]
worked = ros[ros["shift_assigned"].notna() & (ros["shift_assigned"].astype(str) != "Off")]
gw = ros.groupby("staff_id")
ssum = pd.DataFrame({
    "total_days_worked":   worked.groupby("staff_id").size(),
    "total_regular_hours": gw["regular_hours_worked"].sum(),
    "total_overtime_hours": gw["overtime_hours_worked"].sum(),
    "total_payroll_cost_zar": gw["total_daily_cost_zar"].sum(),
}).reset_index()
ndays = ros["date"].nunique()
ssum["average_weekly_hours"] = ssum["total_regular_hours"] / (ndays / 7.0)
# BCEA 45h/week breaches: use the simulation's own daily event log (logged, not
# enforced — each day the running weekly total exceeds 45h logs one violation).
bv = pd.read_csv(SRC / "outputs_scheduling" / "bcea_violations.csv")
bv = bv[bv["seed"] == SEED_STAFF]
bcea_count = bv.groupby("staff_id").size()
ssum["bcea_45hour_violations_count"] = ssum["staff_id"].map(bcea_count).fillna(0).astype(int)
ros["_wk"] = ros["_d"].dt.isocalendar().year.astype(str) + "-W" + ros["_d"].dt.isocalendar().week.astype(str)
mx = ros.groupby(["staff_id", "_wk"])["_tot"].sum().groupby("staff_id").max()
ssum["max_weekly_hours_observed"] = ssum["staff_id"].map(mx).fillna(0)
# sick days from absence events for this seed (if present)
try:
    ab = pd.read_csv(SRC / "outputs_scheduling" / "absence_events.csv")
    ab = ab[ab["seed"] == SEED_STAFF]
    sick = ab[ab["absence_type"] == "sick"].groupby("staff_id")["total_days_absent"].sum()
    ssum["total_days_sick"] = ssum["staff_id"].map(sick).fillna(0).astype(int)
except Exception:
    ssum["total_days_sick"] = 0

sm = staff[["staff_id", "category", "skill_level", "annual_salary_zar", "standard_shift_length_hours"]].merge(ssum, on="staff_id", how="inner")
sm.round(2).to_csv(OUT / "staff_members.csv", index=False)

dr = pd.read_csv(SRC / "outputs_scheduling" / "daily_roster_summary.csv")
dr = dr[dr["seed"] == SEED_STAFF].copy()
dr["date"] = pd.to_datetime(dr["date"]).dt.strftime("%Y-%m-%d")
dr.drop(columns=["seed"]).round(2).to_csv(OUT / "staff_daily.csv", index=False)

sd = pd.read_csv(SRC / "outputs_scheduling" / "shift_demand_panel.csv")
sd = sd[sd["seed"] == SEED_STAFF].copy()
sd["date"] = pd.to_datetime(sd["date"]).dt.strftime("%Y-%m-%d")
sd.drop(columns=["seed"]).round(2).to_csv(OUT / "staff_shifts.csv", index=False)

print(f"Supply seed {SEED_SUPPLY} | Staff seed {SEED_STAFF}. Wrote to", OUT)
for f in sorted(OUT.glob("*.csv")):
    n = sum(1 for _ in open(f)) - 1
    print(f"  {f.name:22} {n:6} rows")
