# Demo pack

Five CSVs for the Data Hub inventory and scheduling upload slots:
`inventory_items.csv`, `inventory_movements.csv`, `staff_list.csv`,
`shift_log.csv`, `staffing_daily.csv`.

These files are **simulated**. They contain no patient data. `inventory_items.csv`
and `staff_list.csv` carry `data_origin=simulated`, which drives the app's
"Inventory and staffing are simulated demonstration data." banner. They cover
2025-01-01 to 2026-01-31.

They hold what a hospital would have (master lists, stock movements, payroll
summary, shift log) and none of the simulator's own results.

## Regenerate

From the repo root:

    api\.venv\Scripts\python.exe scripts\make_demo_pack.py --chapter7 "<path to dataAnalysis\chapter7_simulation\simulation>"

Use the `simulation` subfolder, not the `chapter7_simulation` root. The script
fails if the filled-post count is not 23 or a filled staff id has no match in
`api/data/simulation/staff_members.csv`.
