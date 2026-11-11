# Demo pack

Five CSVs for the Data Hub inventory and scheduling upload slots:
`inventory_items.csv`, `inventory_movements.csv`, `staff_list.csv`,
`shift_log.csv`, `staffing_daily.csv`.

These files are **simulated**. They contain no patient data. `inventory_items.csv`
and `staff_list.csv` carry `data_origin=simulated`, which the app keeps as an
internal flag only. By Jonathan's decision of 2026-11-11 the app never labels
this data as simulated on screen; the presenter says so in person, and the
assistant answers truthfully if asked directly. They cover 2025-01-01 to
2026-01-31.

They hold what a hospital would have (master lists, stock movements, payroll
summary, shift log) and none of the simulator's own results.

The pack lives under `api/` because the backend uses it: the "Use the sample
data" button (`POST /api/pipeline/sample`, `api/core/pipeline/sample.py`) loads
these five files with the stored hospital files and runs the pipeline. The
Docker image copies only `api/`, so a pack at the repo root would be missing in
production. It cannot be rebuilt in memory from `api/data/simulation/`: the
ordering, holding and stockout cost columns and the seven vacant posts come from
the chapter 7 master files, which are not in this repo.

## Regenerate

From the repo root:

    api\.venv\Scripts\python.exe scripts\make_demo_pack.py --chapter7 "<path to dataAnalysis\chapter7_simulation\simulation>"

Use the `simulation` subfolder, not the `chapter7_simulation` root. The script
fails if the filled-post count is not 23 or a filled staff id has no match in
`api/data/simulation/staff_members.csv`.

## Round trip against the bundled simulation files

Deriving `supply_items` from this pack (`core/ops_derive.py`) reproduces the
bundled `api/data/simulation/supply_items.csv`. Consumption, stockout, order
and ordering/stockout-cost figures, service level, CV, average stock and
inventory value match exactly. Two figures differ slightly:

- `total_holding_cost_zar` (and so `total_cost_zar`): at most R52.83 on one
  item, 0.45 percent of that item's holding cost (0.18 percent of total cost).
  Probable cause (not isolated): the simulator accrued holding cost day by day
  on its own unrounded stock, while the app computes
  sum(recorded stock) x price x rate / 365 from the recorded column, which is
  rounded to one decimal.
- `mean_daily_consumption` and `sd_daily_consumption` agree within 0.01.

All are inside the tolerances in `tests/test_ops_derive.py`.
