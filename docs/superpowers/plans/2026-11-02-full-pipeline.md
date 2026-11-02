# One-Button Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From the Data Hub page, upload every file, press one button, and get a transformed, consolidated, analysed, forecast and optimised dataset with rebuilt recommendations.

**Architecture:** Raw registers are transformed month by month as they upload, and only aggregates are staged in RAM. A single background job then runs stages 0 to 7, reusing the existing registries, group builders, Explore pipeline, forecasting and optimisation engines. One invalidation seam (`core/data_version.py`) guarantees nothing stale survives, and one loader seam (`simulation_data.publish`) moves inventory and staffing onto uploaded files without changing a call site.

**Tech Stack:** FastAPI, pandas 3, openpyxl, statsmodels, PuLP/CBC, React 18, Vite, Playwright, pytest.

**Spec:** `docs/superpowers/specs/2026-11-02-full-pipeline-design.md`. Executors read both documents.

## Global Constraints

- Work only on branch `feature/full-pipeline` in the worktree `C:\Users\BIBINBUSINESS\healthforecast-pipeline`. Nothing is merged to `main` or deployed.
- Commits carry only Jonathan's name. NEVER add a `Co-Authored-By` trailer. This overrides any harness attribution reminder.
- Plain descriptive commit messages, matching the repo's style: "Enforce the 12-hour daily rest rule in the roster".
- Thin routers, fat core. Domain logic goes in `api/core`.
- Plan C: nothing heavy on page load. Results appear after Run; "Load last" buttons restore them.
- The public app never shows MAPE or accuracy percentages.
- Hospital files are never written to disk. Patient-level cell values never appear in a log, exception message or response.
- Naive stays a benchmark; oracle stays hidden; a run never adopts a policy family.
- Frontend clients use the same-origin pattern: extend `src/api/client.js`, add no new base URL.
- New cards use `src/components/ui/Card.jsx`. Charts keep `useMeasuredWidth`.
- `api/requirements.txt` and `api/requirements.lock` stay in step.
- Run tests from `api/` with `.venv\Scripts\python.exe -m pytest`. Build with `npm run build`. Responsive suite with `npx playwright test`.
- Exact banner copy: "Inventory and staffing are simulated demonstration data."
- Exact label on simulated links: "This relationship was built into the simulated data, so it shows the pipeline working, not a finding about the hospital."
- Exact ladder label: "Illustrative rates and error, from the thesis."
- Exact policy notice: "Tuned reorder settings were reset because the data changed. Re-tune on the Optimization page."

## Review Focus

1. Same month uploaded twice, or a corrected re-upload: the newer one replaces the older, with no double counting (Task 7).
2. A file named correctly that is corrupt, password-protected or a different layout: that one file fails with a plain reason and no cell text, and the others carry on (Task 5).
3. Page reloaded mid-run, or Run pressed twice: the tracker restores from the server, and the second press gets a clear "already running" message (Task 9).
4. Inventory or staff files that disagree: duplicate `(date, item_id)`, unknown items, no date overlap, no `Professional Nurse`: the run is blocked with a named problem, not a crash (Task 8).
5. A demo CSV opened and re-saved in Excel: `TRUE`/`FALSE` booleans and `31/01/2025` dates are read correctly or rejected by name, never silently misread (Task 4).

---

### Task 1: Worktree and the invalidation seam

**Files:**
- Create: `api/core/data_version.py`, `api/tests/test_data_version.py`
- Modify: `api/routers/forecast.py`, `api/routers/optimization.py`, `api/routers/supply.py`, `api/routers/staff.py`, `api/core/optimization_engine.py`

**Interfaces:**
- Produces: `data_version.current() -> int`, `data_version.register(name: str, clear: Callable[[], None]) -> None`, `data_version.invalidate_all() -> int`, `optimization_engine.reset_tuned_params() -> bool`

- [ ] **Step 1: Create the worktree.** Use superpowers:using-git-worktrees. From the main checkout:

```powershell
git worktree add -b feature/full-pipeline C:\Users\BIBINBUSINESS\healthforecast-pipeline main
```

- [ ] **Step 2: Set up the worktree.** Copy `docs/superpowers/specs/2026-11-02-full-pipeline-design.md` and this plan into it. Then, inside it:

```powershell
git submodule update --init --recursive
Copy-Item ..\OneDrive\Desktop\redesing-of-ui-and-ux-forecasting-tools\api\.env api\.env
python -m venv api\.venv
api\.venv\Scripts\python.exe -m pip install -r api\requirements.lock pytest openpyxl
npm ci
```

Expected: `cd api; .venv\Scripts\python.exe -c "import main"` exits 0 and `npm run build` passes. Baseline: run `.venv\Scripts\python.exe -m pytest -q` and record the pass count.

- [ ] **Step 3: Write the failing tests** in `api/tests/test_data_version.py`:

```python
def test_invalidate_bumps_version_and_calls_clearers(): ...
    # register a clearer, assert it ran once and current() rose by 1
def test_clearer_failure_does_not_stop_the_others(): ...
    # first clearer raises, second still runs, the exception is re-raised after all ran
def test_invalidate_clears_every_result_cache(): ...
    # import main; set forecast._LAST_RUN, forecast._LAST_SPECIALTY["x"], forecast._ENGINE_CACHE["x"],
    # forecast._VALIDATION_CACHE["x"], optimization._LAST_TUNE["x"], optimization._FC_CACHE[("ml","open")],
    # supply._LAST_COMPARE["result"], supply._LAST_SWEEP["result"], staff._LAST_STRATEGY["result"],
    # engine._LAST["staff"]; invalidate_all(); assert all empty/None
def test_invalidate_keeps_family_but_resets_tuned_params(): ...
    # set_policy("s_q", tuned={"params_by_item":{"A":{}}, "tuned_at":"t"}); invalidate_all()
    # state["policy"]=="s_q", params_by_item is None, tuned_at is None
```

- [ ] **Step 4: Run them.** `.venv\Scripts\python.exe -m pytest tests/test_data_version.py -v`. Expected: FAIL, module not found.

- [ ] **Step 5: Implement `core/data_version.py`** with a lock, a counter and a name-keyed dict of clearers. Add `_LAST_SPECIALTY: dict[str, dict] = {}` beside `_LAST_RUN` in `forecast.py`. In each cache owner, register a clearer at module level: `forecast` (four caches), `optimization` (`_LAST_TUNE`, `_FC_CACHE`), `supply` (`_LAST_COMPARE`, `_LAST_SWEEP`), `staff` (`_LAST_STRATEGY`), `optimization_engine` (`_LAST` values to None, and `reset_tuned_params`). `reset_tuned_params` clears `params_by_item`, `tuned_at`, `lead_time_mean`, `service_level` and returns True if anything was cleared.

- [ ] **Step 6: Run tests.** Expected: PASS.

- [ ] **Step 7: Commit.** `git add -A` then `git commit -m "Add one invalidation seam for every cached result"`.

---

### Task 2: Fixes the pipeline depends on

**Files:**
- Modify: `api/routers/forecast.py:361-465`, `api/routers/optimization.py:48-57,69-148,168-185`, `api/routers/supply.py:256`, `api/routers/staff.py:130,150-162`, `api/core/optimization_engine.py:449,463,553,1268-1299,1531`, `api/core/bootstrap.py:20-23`, `src/pages/Dashboard.jsx:30-38`, `src/api/client.js`
- Test: `api/tests/test_pipeline_fixes.py`

**Interfaces:**
- Produces: `forecast.compute_total(model, horizon, start_date=None, alias=None) -> dict`, `forecast.compute_specialty(specialty, model, horizon, resolution, start_date=None, alias=None) -> dict`, `optimization._compute_week_forecast(model, start_date, strict=False)`, `optimization.week_forecast_from_result(res: dict, model: str) -> dict`, `engine.compare_staff_strategies(mean_arrivals=None, service_z=1.282, strategies=STAFF_STRATEGIES, n_active=None)`

- [ ] **Step 1: Write the failing tests:**

```python
def test_weekly_cost_with_zero_payroll_unpacks(): ...
    # staff_daily with all-zero payroll: _current_weekly_staff_cost() == (None, None)
def test_strict_week_forecast_raises_instead_of_demo_fallback(): ...
    # g1 not built: _compute_week_forecast("ml", None, strict=True) raises; strict=False returns live False
def test_strategy_compare_honours_pool_size(): ...
    # compare_staff_strategies(n_active=30) differs from default; default == STAFF_N_ACTIVE result
def test_item_cost_params_uses_observed_days(): ...
    # h with observed_days=198 is double h with 396, same totals
def test_observed_days_defaults_to_396_for_bundled_items(): ...
def test_arm_items_uses_uploaded_holding_rate(): ...
    # item with holding_cost_rate_per_year 0.3 -> 0.3; without -> 0.25
def test_bootstrap_does_not_touch_after_a_run(): ...
    # data_version.invalidate_all() then ensure_g1() fetches nothing
```

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `optimization.py:183`: `return None, None`.
  - Split `run_from_pipeline` and `run_specialty_forecast` into the sync `compute_total` and `compute_specialty`, moving the HTTP errors with them. Routes call them via `run_in_threadpool`, then `_remember_run`. Add `GET /api/forecast/specialty/last?specialty=` returning `{available, result}` from `_LAST_SPECIALTY`.
  - `week_forecast_from_result` is the `days`-to-dict block at `optimization.py:90-115`. `_compute_week_forecast` uses it. When `strict`, re-raise instead of falling back. It must also accept an existing forecast result so Task 11 can seed `_FC_CACHE`.
  - Replace `396.0` at lines 463 and 553, 1531 with `float(it.get("observed_days") or OBSERVED_PERIOD_DAYS)`.
  - `compare_staff_strategies`: `N = int(n_active or STAFF_N_ACTIVE)`.
  - `_arm_items` and the `_HOLDING_RATE` use in `supply.py`: `float(it.get("holding_cost_rate_per_year") or <existing literal>)`. The demo basket literals at `supply.py:196-208` stay.
  - `staff.py:130` and the strategy route: use `simulation_data.is_uploaded()` from Task 4; until then keep today's values. Task 4 closes this.
  - `bootstrap.ensure_g1`: return True early if `data_version.current() > 0`.
  - `Dashboard.jsx`: replace the POST with `api.forecast.last()`; show the existing empty state with a Run link when `available` is false. Add `last` to `client.js` if absent. In Dashboard map `{available, result}` onto `fc`.

- [ ] **Step 4: Run tests, then the full API suite.** Expected: PASS, with the Task 1 baseline count plus new tests.

- [ ] **Step 5: Extend the Plan C rule.** In `tests/responsive.spec.js`, generalise the `optimize` test into a loop over `['dashboard', 'optimize', 'upload']`. Run `npm run build; npx playwright test`. Expected: PASS.

- [ ] **Step 6: Commit** "Make forecasts and plans safe to run from a background job".

---

### Task 3: Demo pack and new upload slots

**Files:**
- Create: `scripts/make_demo_pack.py`, `demo-data/*.csv` (five), `demo-data/README.md`, `api/tests/test_demo_pack.py`
- Modify: `api/core/datasets.py`, `src/pages/DataHub.jsx:7-15`

**Interfaces:**
- Produces: schemas `inventory_items`, `inventory_movements`, `staff_list`, `shift_log`, `staffing_daily` in `ALL_SCHEMAS`, with `Category` extended to `"inventory" | "scheduling"`. Column lists are in spec section 6.2.

- [ ] **Step 1: Write the failing tests:**

```python
def test_pack_row_counts(): ...
    # 30, 11880, 30, 1188, 396
def test_pack_holds_no_simulator_results(): ...
    # none of total_stockout_cost_zar, service_level_achieved, total_cost_zar in any file
def test_pack_origin_is_simulated(): ...
def test_staff_list_has_23_filled_posts(): ...
def test_filled_staff_ids_match_bundled_members(): ...
def test_every_movement_item_is_in_the_catalogue(): ...
def test_new_schemas_accept_the_pack(): ...
    # each file passes _validate with schema_valid True
```

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Write `scripts/make_demo_pack.py`.** It takes `--chapter7 <path>` for `dataAnalysis/chapter7_simulation/simulation`. Sources per spec 6.2: items from that `items_master.csv`, movements from `api/data/simulation/supply_panel.csv`, staff from that `staff_master.csv` left-joined to `staff_members.csv` on `staff_id`. Fail loudly if the filled count is not 23 or any filled id has no join. Add `data_origin=simulated`. Write `demo-data/README.md`: these files are simulated, no patient data, how to regenerate.

- [ ] **Step 4: Run the script, then add the five schemas** with `required_columns` equal to their listed columns and `source_filename_hint` equal to the file name. Add icons in `ICON_BY_ID`. Check every consumer of `api.datasets.inventory`, `loaded_count` and `total`: `Grep` `src/` for them. Any logic assuming 7 slots, including Explore's four-group gate and Prepare, must count hospital and external only.

- [ ] **Step 5: Run tests.** Expected: PASS. Also `/fetch` for these slots must not be offered: hide the Fetch button where `category` is `inventory` or `scheduling`.

- [ ] **Step 6: Commit** "Add the simulated demo pack and its upload slots".

---

### Task 4: Run inventory and staffing from uploaded files

**Files:**
- Create: `api/core/ops_derive.py`, `api/tests/test_ops_derive.py`
- Modify: `api/core/simulation_data.py`, `api/routers/staff.py`, `src/pages/StaffPlanner.jsx`, `src/pages/SupplyPlanner.jsx`

**Interfaces:**
- Produces: `ops_derive.derive(items, movements, staff, shifts, daily) -> dict[str, pd.DataFrame]` keyed by the seven names `staff_members.csv`, `staff_daily.csv`, `staff_shifts.csv`, `staff_kpis.csv`, `supply_items.csv`, `supply_panel.csv`, `supply_kpis.csv`. `ops_derive.parse_bool(series) -> Series`, `ops_derive.parse_iso_date(series, label) -> Series`. `ops_derive.origin_of(items, staff) -> str`. `simulation_data.publish(frames, origin, posts=None) -> None`, `simulation_data.unpublish() -> None`, `simulation_data.origin() -> str | None`, `simulation_data.posts() -> int | None`, `simulation_data.is_uploaded() -> bool`.

- [ ] **Step 1: Write the failing tests:**

```python
def test_round_trip_reproduces_bundled_items(): ...
    # derive from demo pack vs api/data/simulation/supply_items.csv, per item
    # exact: total_consumption_units, number_of_stockout_events, total_stockout_units,
    #        total_orders_placed, total_ordering_cost_zar, total_stockout_cost_zar
    # abs<=0.01: mean_daily_consumption, sd_daily_consumption
    # within 2%: total_holding_cost_zar, avg_stock_on_hand, inventory_value_zar
def test_service_level_formula(): ...
    # 1 - stockout_units / consumption_units, rounded to 2dp; A01 -> 0.91
def test_observed_days_is_distinct_dates(): ...   # 396
def test_load_prefers_published_frames(): ...
def test_unpublish_restores_bundled_files(): ...
def test_kpi_files_are_empty_when_uploaded(): ...
    # load("staff_kpis.csv") -> 0 rows, has column "kpi"; /api/staff/overview returns ci == {}
def test_only_filled_posts_become_members(): ...
def test_excel_resaved_booleans_parse(): ...
    # "TRUE","FALSE","True","False",True,False,1,0
def test_excel_resaved_dates_are_rejected_by_name(): ...
    # "31/01/2025" raises ValueError naming the file label; never day/month-swapped
def test_money_totals_do_not_lose_precision_to_float32(): ...
```

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement `ops_derive.py`.** Convert numeric inputs to float64 first, because registry frames are float32. Formulas: `total_ordering_cost_zar = orders × ordering_cost_zar`; `total_stockout_cost_zar = stockout_units × stockout_penalty_zar`; `total_holding_cost_zar = sum(stock) × price × rate / 365`; `total_expiry_cost_zar = expiry_units × price`; `total_cost_zar` is their sum; `inventory_value_zar = avg_stock × price`; `coefficient_of_variation = sd / mean`. A stockout event is a day with `stockout_today_units > 0`. If the round-trip shows a figure outside tolerance, record the difference in `demo-data/README.md` and tighten nothing to hide it.

- [ ] **Step 4: Add `publish` and friends to `simulation_data.py`.** `load()` checks `_UPLOADED` first and never fetches when uploaded. Do not register `_UPLOADED` with `data_version`: a run invalidates results first and publishes the new frames afterwards, in stage 2.

- [ ] **Step 5: Close Task 2's staff items.** `staff.py:130`: `n_posts` is `simulation_data.posts()` when uploaded, else 30. `strategy-compare-demo`: when uploaded and `mean_arrivals` is None, use the G1 mean of `total_daily_arrivals`, and pass `n_active=len(members)`.

- [ ] **Step 6: Guard the pages.** `Grep` `\.ci\b|ci\?\.` in `src/pages/`. Staff and Supply must render with `ci == {}`, hiding the context note.

- [ ] **Step 7: Run tests.** Expected: PASS. `npm run build` passes.

- [ ] **Step 8: Commit** "Run inventory and staffing from uploaded files".

---

### Task 5: Port the monthly transformation

**Files:**
- Create: `api/core/transform/__init__.py`, `reader.py`, `extract.py`, `clinical.py`, `month.py`, `api/tests/fixtures/register_workbook.py`, `api/tests/test_transform_month.py`
- Modify: `api/requirements.txt`, `api/requirements.lock` (add `openpyxl`)

**Interfaces:**
- Produces: `transform.TransformError(public_message)`, `reader.parse_filename(name) -> tuple[int, int]`, `reader.read_sheet(raw: bytes) -> pd.DataFrame`, `month.MonthTables(year, month, sha256, daily, hourly, clinical, receipt)`, `month.transform_month(raw: bytes, filename: str) -> MonthTables`

Sources, from `C:\Users\BIBINBUSINESS\OneDrive\Desktop\data transformation pipline\healthforecast_pipeline\healthforecast_pipeline`. **Copy from the working tree, not git HEAD**, because its hardening is uncommitted: `run_pipeline.py` lines 79, 243-528, 529-731, 773-838, 881-905 and the exception classes; `scripts/extract_clinical_reasons.py` lines 60-232, 260-430, 430-483. Change only input and output.

- [ ] **Step 1: Write the fixture builder.** `build_register(year, month, days=2) -> bytes` writes with openpyxl an in-memory workbook laid out as `detect_columns` and `detect_time_columns` expect: header rows, monthly TOTALS row, per-day patient rows ending in TOTALS. Patient rows carry the fake identifiers `ZZFAKENAME`, `ZZ123456`, `9001015009087`. Read one real file's header rows to get labels, printing only header labels, never patient rows.

- [ ] **Step 2: Write the failing tests:**

```python
def test_parse_filename_ok(): ...          # Casualty_Daily_Register_2024_03.xlsx -> (2024, 3)
def test_parse_filename_rejects_others(): ...  # "Dec-24.xlsx" -> TransformError naming the convention
def test_skip_template_month_is_rejected(): ... # 2019_04 -> TransformError "skipped template"
def test_transform_month_counts(): ...      # fixture totals appear in daily.patient_count
def test_no_identifier_leaves_the_transform(caplog): ...
    # none of the three fake identifiers in any output frame, receipt or log record
def test_corrupt_file_fails_cleanly(): ...  # b"not a workbook" -> TransformError, no cell text, __cause__ None
def test_valid_xlsx_unknown_layout_fails_cleanly(): ...
    # workbook whose cells contain ZZFAKENAME but no headers: message lacks ZZFAKENAME
def test_failed_clinical_extraction_fails_the_month(): ...
    # monkeypatch extract_clinical to raise: TransformError, never zeros
def test_each_workbook_is_read_once(monkeypatch): ...
```

- [ ] **Step 3: Run them.** Expected: FAIL.

- [ ] **Step 4: Port.** Each extractor takes `(sheet, year, month, label, logger, ...)` rather than a path. Audit every copied `logger` call and `f"..."` error: strip any that embed a cell value. `transform_month`: hash, parse filename, read once, extract daily, hourly, clinical, `reconcile_daily_with_hourly`, `clean_data`. Any exception becomes `TransformError(f"{filename}: could not read the {phase} section") from None`. Delete the sheet and raw reference before returning.

- [ ] **Step 5: Test `python-calamine`.** In a scratch script, compare grids for all 81 files between readers, printing only match or mismatch and timings. If every grid is identical, use it in `read_sheet` and add it to requirements; else keep openpyxl. Record the result in the commit message.

- [ ] **Step 6: Run tests.** Expected: PASS.

- [ ] **Step 7: Commit** "Port the monthly register transformation into the app".

---

### Task 6: Assemble months and prove equivalence

**Files:**
- Create: `api/core/transform/assemble.py`, `api/tests/test_transform_assemble.py`, `api/tests/test_transform_golden.py`

**Interfaces:**
- Consumes: `MonthTables`
- Produces: `assemble.assemble(months: list[MonthTables]) -> dict[str, pd.DataFrame]` keyed `daily_arrival`, `hourly_arrival`, `clinical_daily`, `clinical_hourly`. `assemble.overlay(existing: pd.DataFrame | None, new: pd.DataFrame) -> pd.DataFrame`. `assemble.quality_checks(tables) -> list[str]`.

Sources: `run_pipeline.py:1100-1186` (`build_clinical_hourly`), lines 1264-1275 (fill then unify then aggregate, in that order), `src/purify.py:27-144`, `scripts/validate_pure_datasets.py`. Read `export_dataset` at `run_pipeline.py:992-1070` too, in case it changes columns.

- [ ] **Step 1: Write the failing tests:**

```python
def test_columns_match_the_pure_schemas(): ...   # each table validates against core/datasets.py
def test_templates_with_different_columns_combine(): ...  # missing fields become 0, not NaN
def test_overlay_replaces_whole_months_only(): ...
    # existing Jan+Feb, new Feb with 2 days: Jan untouched, Feb exactly the 2 new days
def test_overlay_with_no_history_returns_new(): ...
def test_quality_checks_warn_on_zero_days(): ...
```

And the gated golden test:

```python
@pytest.mark.skipif(not os.getenv("RAW_REGISTER_DIR"), reason="needs raw files")
def test_month_matches_pure_output(): ...
    # RAW_REGISTER_DIR and PURE_DIR env vars. RAW_GOLDEN_MONTHS comma list,
    # default "2019_06,2021_03,2023_04,2026_01" (one per template era).
    # "all" runs every file. For each table: same columns, same rows, equal values.
```

- [ ] **Step 2: Run the unit tests.** Expected: FAIL.

- [ ] **Step 3: Implement `assemble.py`.** Purify logic is applied in memory on the assembled frames. Keep the behaviour of dropping `total_` and `_all` columns, per spec section 11.

- [ ] **Step 4: Run unit tests.** Expected: PASS.

- [ ] **Step 5: Run the quick golden test.** Set `RAW_REGISTER_DIR` to `...\Casualty_Daily_Register_Dataset`, `PURE_DIR` to `...\output\pure`. Expected: PASS for four months. Fix differences by re-reading the source; do not alter expected data.

- [ ] **Step 6: Run the full golden test in the background** with `RAW_GOLDEN_MONTHS=all`. Expected: all 80 months match. Any difference is written up in `docs/superpowers/specs/2026-11-02-full-pipeline-design.md` section 11 with its cause. Record total seconds.

- [ ] **Step 7: Commit** "Prove the ported transformation matches the pure datasets".

---

### Task 7: Staging and raw upload route

**Files:**
- Create: `api/core/pipeline/__init__.py`, `api/core/pipeline/staging.py`, `api/routers/pipeline.py`, `api/tests/test_pipeline_upload.py`
- Modify: `api/main.py:41,68-81`

**Interfaces:**
- Consumes: `transform_month`, `assemble.assemble`, `TransformError`
- Produces: `staging.put(month: MonthTables)`, `staging.months() -> list[MonthTables]`, `staging.clear() -> int`, `staging.mark_applied() -> None`, `staging.unapplied() -> list[str]` of `"YYYY-MM"`. Routes: `POST /api/pipeline/registers?filename=` (raw body), `GET /api/pipeline/staged`, `DELETE /api/pipeline/staged`, `GET /api/pipeline/transformed/{dataset_id}.csv`.

- [ ] **Step 1: Write the failing tests:**

```python
def test_upload_returns_a_receipt(): ...
def test_month_is_replaced_not_doubled(): ...   # same month twice: one staged entry, newer sha
def test_identical_reupload_is_a_noop_receipt(): ...
def test_bad_file_returns_422_with_safe_message(): ...
def test_oversize_body_returns_413(): ...       # cap 25 MB
def test_requires_data_write(): ...
def test_multipart_is_not_used(): ...           # route reads request.stream
def test_download_gives_transformed_csv(): ...  # daily_arrival.csv, header matches schema
def test_download_unknown_table_404(): ...
def test_clear_empties_staging(): ...
def test_rejected_while_a_run_is_active(): ...  # 409; Task 9 supplies is_running
```

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement.** The route reads `request.stream()` into a `bytearray`, enforcing `25 * 1024 * 1024`. It runs `transform_month` in `run_in_threadpool` under a module lock, so one month is held at a time. It returns the receipt, then `gc.collect()`. Add `/api/pipeline/registers` to `_HEAVY_PREFIXES`. Include the router in `main.py`. Add `api/core/pipeline/__init__.py` with a module-level `running = False` for the 409 until Task 9 replaces it.

- [ ] **Step 4: Run tests.** Expected: PASS.

- [ ] **Step 5: Commit** "Transform registers as they upload and stage the results".

---

### Task 8: Pre-run checks

**Files:**
- Create: `api/core/pipeline/preflight.py`, `api/tests/test_preflight.py`, `api/tests/pipeline_fixtures.py`
- Modify: `api/routers/pipeline.py`

**Interfaces:**
- Consumes: `registry`, `staging`, `ops_derive.parse_iso_date`
- Produces: `preflight.run_checks() -> dict` of `{ok: bool, issues: [{level, file, message}], replaced_months: [str], arrivals_source: "raw"|"pure"|"both"|None}`. Route `GET /api/pipeline/preflight`. Test helper `pipeline_fixtures.seed_all()`, which registers small valid frames in all 12 slots, 400 days ending 2026-01-31, built from `api/data/simulation/staff_daily.csv` arrivals and `demo-data/`.

- [ ] **Step 1: Write the failing tests:**

```python
def test_complete_set_is_ok(): ...
def test_no_arrivals_source_is_an_error(): ...
def test_missing_calendar_is_an_error(): ...
def test_duplicate_date_item_is_an_error(): ...    # message names inventory_movements.csv and the count
def test_unknown_item_is_an_error(): ...           # both directions
def test_no_date_overlap_is_an_error(): ...
def test_no_professional_nurse_is_an_error(): ...
def test_bad_shift_name_is_an_error(): ...         # allowed: Day, Evening, Night
def test_bad_origin_value_is_an_error(): ...       # allowed: simulated, real
def test_arrivals_mismatch_is_a_warning(): ...     # message gives day count and largest gap
def test_coverage_past_calendar_is_a_warning(): ...
def test_replaced_months_lists_overlap_with_uploaded_history(): ...
def test_second_run_lists_only_new_months(): ...
    # slot metadata filename "transformed" + applied months: only unapplied are listed
```

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement.** Each check returns issues and never raises on bad data. Staff and inventory checks read from the registry. `replaced_months` follows this rule: if the slot's `metadata["filename"]` is not `"transformed"`, every overlapping staged month is listed; if it is, only `staging.unapplied()`.

- [ ] **Step 4: Run tests.** Expected: PASS.

- [ ] **Step 5: Commit** "Check uploaded files agree before a run".

---

### Task 9: Job runner and stages 0 to 3

**Files:**
- Create: `api/core/pipeline/job.py`, `api/core/pipeline/stages.py`, `api/core/pipeline/consolidate.py`, `api/tests/test_pipeline_job.py`
- Modify: `api/routers/pipeline.py`, `api/core/pipeline/__init__.py`

**Interfaces:**
- Consumes: `data_version.invalidate_all`, `preflight.run_checks`, `staging`, `assemble`, `ops_derive`, `simulation_data.publish`, `routers.prepare.build`
- Produces: `job.start() -> dict` (raises `job.Busy`), `job.status() -> dict`, `job.is_running() -> bool`, `job.peak_mb() -> float`, `stages.StageResult(receipt: str, warnings: list[str], status: "done"|"skipped"|"amber")`, `stages.StageFailed(message)`, `stages.STAGES: list[tuple[id, label, fn]]`, each `fn() -> StageResult`, `consolidate.build_ops_daily(g1, staffing_daily, movements, items) -> pd.DataFrame`. Routes `POST /api/pipeline/run`, `GET /api/pipeline/status`.

`status()` shape: `{data_version, running, started_at, finished_at, stages: [{id, label, status, seconds, receipt, warnings, peak_mb}], source: {mode: "default"|"uploaded", run: int, finished_at}, origin}`. Status values: `pending`, `running`, `done`, `skipped`, `amber`, `failed`.

- [ ] **Step 1: Write the failing tests:**

```python
def test_run_completes_stages_in_order(): ...       # seed_all, start, wait, statuses done
def test_second_start_while_running_is_busy(): ...  # POST gives 409 with {"error":"already_running"}
def test_failed_stage_stops_and_marks_rest_skipped(): ...
def test_failed_run_leaves_results_cleared(): ...   # /last empty, not half-replaced
def test_status_survives_a_new_client(): ...        # fresh TestClient sees the same running job
def test_transform_stage_skipped_when_no_months(): ...
def test_transform_stage_overlays_staged_months(): ...
    # slots hold "transformed" tables; staging.unapplied() empty after
def test_no_arrivals_after_transform_stops_the_run(): ...
def test_groups_built_sequentially(): ...           # g1..g4 all present
def test_ops_daily_columns(): ...
    # date, total_daily_arrivals, required_nurses, staffed_nurses, locum_hours,
    # consumption_units, stockout_units, stock_value_zar
def test_ops_daily_covers_only_shared_dates(): ...
def test_run_requires_data_write(): ...
def test_peak_memory_recorded_per_stage(): ...
```

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement `job.py`.** One `threading.Thread(daemon=True)` guarded by a lock. Sequence: `invalidate_all()`, then for each stage: mark running, call, record seconds and `peak_mb()`, `gc.collect()`. Stage failure stops. `peak_mb` uses `resource.getrusage(RUSAGE_SELF).ru_maxrss` on Linux and `PeakWorkingSetSize` from `psapi.GetProcessMemoryInfo` via ctypes on Windows, adding no dependency. It is a process high-water mark, so a stage's figure can only rise. Replace `pipeline.running` usage with `job.is_running()`.

- [ ] **Step 4: Implement stages 0 to 3 in `stages.py`.**
  - `check`: `run_checks()`, `StageFailed` listing error messages; warnings carried.
  - `transform`: `skipped` when `staging.months()` is empty. Else `assemble`, then `overlay` onto each slot, `registry.put(id, df, meta)` with `meta["filename"] = "transformed"`, then `quality_checks` warnings and `mark_applied`. Receipt: "N months, X arrivals, no patient identifiers kept".
  - `operations`: `derive` then `publish(frames, origin_of(...), posts=len(staff))`.
  - `consolidate`: for g1..g4, `asyncio.run(routers.prepare.build(BuildRequest(group=g)))`, lazily imported as `core/bootstrap.py` does; `gc.collect()` between. Then `prepare_registry.put("ops_daily", df, meta)`. Receipt gives rows per group.

- [ ] **Step 5: Run tests.** Expected: PASS.

- [ ] **Step 6: Commit** "Run the pipeline as one background job".

---

### Task 10: Analysis stage and new analyzers

**Files:**
- Create: `api/core/explore/analyzers/ops_links.py`, `api/core/explore/analyzers/seasonality_test.py`, `api/tests/test_ops_analyzers.py`
- Modify: `api/core/explore/analyzers/__init__.py`, `api/core/explore/findings.py:25-38`, `api/core/explore/metrics/stationarity.py`, `api/core/pipeline/stages.py`

**Interfaces:**
- Consumes: `prepare_registry` key `ops_daily`, `simulation_data.origin()`
- Produces: findings F9 (arrivals vs consumption), F10 (arrivals vs nurses required), F11 (stockout days vs busy days), F12 (Kruskal-Wallis). Constant `ops_links.SIMULATED_LABEL` holding the exact label from Global Constraints. `stages.analyse_stage() -> StageResult`.

Existing coverage already includes VMR (`task1.py:46`), STL, ACF, ADF (`metrics/stationarity.py`), calendar effects, regimes, outliers, specialty mix, P90 surge and hourly profiles. So only Kruskal-Wallis and KPSS are added.

- [ ] **Step 1: Write the failing tests:**

```python
def test_links_carry_the_simulated_label(): ...   # origin simulated: mechanism contains SIMULATED_LABEL
def test_links_omit_label_for_real_data(): ...    # origin real: no label
def test_links_skip_without_ops_table(): ...      # no ops_daily: no F9-F11, no failure recorded
def test_verdict_follows_the_value(): ...
    # uncorrelated random series: title says no clear link, category "stable"
def test_kruskal_verdict_follows_the_p_value(): ...
    # flat series: "no significant pattern"; strong weekly cycle: significant, H reported
def test_stationarity_reports_kpss(): ...
def test_analyse_stage_reports_counts_and_failures(): ...
    # one analyzer raises: stage amber, warning names its code
```

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement.** In `findings._build_context`, after the G1-G4 loop, add `ops_daily` as group id `"ops"` with `GroupProfile(group_id="ops", grain="daily", date="date", target="total_daily_arrivals")`, sliced like the others. Analyzers set `preferred_group_ids = ("ops",)`. F9 and F10 use Spearman rank correlation. F11 compares stockout rate on days at or above P90 arrivals with other days. F12 runs `scipy.stats.kruskal` by `day_of_week` and by month on G1, excluding `is_zero_day`. Thresholds: |rho| ≥ 0.3 is a link; p < 0.05 is significant. Register all in `DEFAULT`. `stationarity.py`: add `kpss_p` to `detail`.

- [ ] **Step 4: Add `analyse_stage`** to `STAGES`. It calls `run_findings()` and `run_metrics("all")`. Receipt: "N findings, M metrics". Amber if `recent_failures` grew. Silence statsmodels `InterpolationWarning` from KPSS.

- [ ] **Step 5: Run tests.** Expected: PASS.

- [ ] **Step 6: Commit** "Analyse patients, stock and staffing together".

---

### Task 11: Forecast and optimise stages

**Files:**
- Modify: `api/core/pipeline/stages.py`, `api/routers/optimization.py`
- Test: `api/tests/test_pipeline_plan_stages.py`

**Interfaces:**
- Consumes: `forecast.compute_total`, `compute_specialty`, `compute_validation`, `_training_window`, `_series_for`, `_remember_run`, `_LAST_SPECIALTY`, `optimization.week_forecast_from_result`, `_FC_CACHE`
- Produces: `stages.forecast_stage() -> StageResult`, `stages.optimise_stage() -> StageResult`, `optimization.run_for_pipeline(model: str) -> dict`, constants `PIPELINE_MODEL = "ml"`, `PIPELINE_HORIZON = 7`

- [ ] **Step 1: Write the failing tests:**

```python
def test_total_forecast_is_published_and_validated(): ...
    # /api/forecast/last kind=="total", validated True, carries data_version
def test_specialties_never_replace_total(): ...      # seven in _LAST_SPECIALTY, /last still total
def test_weekly_specialties_use_weekly_resolution(): ...  # Maternity, Psychiatry
def test_optimiser_uses_the_published_forecast(): ...
    # plan's forecast daily_total equals /forecast/last predicted exactly
def test_optimise_failure_when_g1_missing_is_not_a_fallback(): ...  # StageFailed, never demo
def test_run_never_adopts_a_family(): ...            # state["policy"] unchanged
def test_receipt_names_recommended_and_adopted_family(): ...
def test_receipt_gives_tuned_notice_when_settings_were_reset(): ...  # exact notice text
def test_naive_is_never_recommended(): ...
def test_every_last_payload_carries_data_version(): ...
    # forecast/last, optimization/last, supply/compare-last, staff/strategy-compare-last
```

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement `forecast_stage`.** Order matters: `compute_validation(_training_window(s, False), PIPELINE_MODEL, PIPELINE_HORIZON)` first, so the forecast finds it. Then `compute_total`, `_remember_run("total", res)`, and seed `_FC_CACHE[(PIPELINE_MODEL, "open")]` with `week_forecast_from_result`. Then each specialty, Maternity and Psychiatry with `resolution="weekly", horizon=4`, others daily at 7, into `_LAST_SPECIALTY`. Add `data_version` in `_remember_run`, in `engine._meta`, and at the three evidence `_LAST_*` writes.

- [ ] **Step 4: Implement `optimise_stage`.** `run_for_pipeline` runs the `/run` body with `RunRequest` defaults and strict forecast. Then call the route functions for `compare-demo` and `strategy-compare-demo` directly, as `core/bootstrap.py` does, so `_LAST_COMPARE` and `_LAST_STRATEGY` fill. Recommended family is the lowest-cost arm among `DEPLOYABLE_POLICIES`, read from the comparison result. Use `asyncio.run` from the job thread. Add `engine.tuned_was_reset() -> bool`, set by the Task 1 clearer on each invalidation from what `reset_tuned_params()` returned. When true, add the exact policy notice to this stage's warnings.

- [ ] **Step 5: Run tests.** Expected: PASS. Record stage durations in the commit message.

- [ ] **Step 6: Commit** "Forecast and optimise as pipeline stages".

---

### Task 12: Stored recommendations and honest provenance

**Files:**
- Modify: `api/ai/actions.py`, `api/routers/ai.py:194-225`, `api/ai/tools.py:205-240`, `api/core/pipeline/stages.py`
- Test: `api/tests/test_stored_actions.py`

**Interfaces:**
- Produces: `actions.build_and_store() -> dict`, `actions.stored() -> dict | None`, `stages.recommend_stage() -> StageResult`. `actions` registers a data_version clearer. Stored payload adds `built_at`, `data_version`.

- [ ] **Step 1: Write the failing tests:**

```python
def test_route_serves_the_stored_list_without_calling_ai(): ...
def test_route_generates_only_when_nothing_is_stored(): ...
def test_stored_list_still_gets_decisions_and_territory_filter(): ...
def test_invalidate_clears_stored_actions(): ...
def test_no_ai_key_ends_amber_and_run_completes(): ...
    # receipt "Recommendations need an AI key", run finishes
def test_ai_error_ends_amber(): ...
def test_tool_source_follows_data_origin(): ...
    # origin "real": no "SIMULATED"; default or simulated: says simulated
def test_pipeline_has_eight_stages(): ...
```

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement.** Move telemetry and audit out of the route into a helper `record_usage(out)`. Route order is unchanged for AI configuration checks, but a stored list returns before them, since it needs no AI. In `tools.py`, `get_supply_status` and `get_staff_status` build `source` from `/api/pipeline/status` `origin`, and use the real active count rather than "23-nurse". The self-call works because the job runs outside the event loop.

- [ ] **Step 4: Run tests.** Expected: PASS.

- [ ] **Step 5: Commit** "Store the rebuilt recommendations with each run".

---

### Task 13: Data Hub rework

**Files:**
- Create: `src/components/pipeline/DropZone.jsx`, `FileChecklist.jsx`, `StageTracker.jsx`, `src/components/pipeline/classify.js`
- Modify: `src/pages/DataHub.jsx`, `src/api/client.js`, `src/styles.css`, `tests/responsive.spec.js`
- Test: `tests/responsive.spec.js`

**Interfaces:**
- Consumes: routes from Tasks 7 to 9, `api.datasets.upload`
- Produces: `api.pipeline.{uploadRegister(file), staged(), clearStaged(), preflight(), run(), status(), transformedUrl(id)}`, `classify(fileName, schemas) -> {kind: "register"|"slot"|"unknown", id?}`

- [ ] **Step 1: Write the failing test** in `tests/responsive.spec.js`: with the API mocked via `page.route`, `upload @ 390px` shows the checklist's four groups and a disabled Run button; a mocked running status shows all eight stages. Extend the existing `upload` overflow checks to cover the tracker.

- [ ] **Step 2: Run it.** `npx playwright test -g "upload"`. Expected: FAIL.

- [ ] **Step 3: Implement.** Behaviour per spec section 9:
  - `classify`: `Casualty_Daily_Register_*.xlsx` is a register; an exact `source_filename_hint` match is a slot; else unknown, shown with a plain reason and not uploaded. On a slot upload 400, show the existing `best_fit` message.
  - Registers upload sequentially, showing "12 of 81" and each receipt or failure. CSVs upload through `api.datasets.upload`.
  - `uploadRegister` sends `fetch` with the `File` as body and no multipart, copying the credentials handling from the client's request helper.
  - Run shows `replaced_months` in a confirm panel inside the page. Never use `window.confirm`.
  - On load: GET `status`, `staged`, `preflight` only. Poll `status` every 2 seconds only while `running`, and resume polling after a reload.
  - On 409 from Run, show "A run is already in progress" and start polling.
  - Completion summary links to Explore, Forecast, Staffing, Supply, Optimization, Action Center.
  - The Staged panel states files are held in memory until cleared or the server restarts. It has Clear and Download transformed CSVs.
  - Existing slot tiles move into a collapsed Advanced section, unchanged.

- [ ] **Step 4: Run tests.** `npm run build; npx playwright test`. Expected: PASS at all 8 widths.

- [ ] **Step 5: Commit** "Upload everything and run the pipeline from Data Hub".

---

### Task 14: Banners, data source and consumers

**Files:**
- Create: `src/components/DataOriginBanner.jsx`
- Modify: `src/pages/StaffPlanner.jsx`, `SupplyPlanner.jsx`, `Optimization.jsx`, `ActionCenter.jsx`, `Task2Forecast.jsx`, `src/components/AppShell.jsx`, `tests/responsive.spec.js`

**Interfaces:**
- Consumes: `api.pipeline.status()`, `GET /api/forecast/specialty/last`, stored action fields `built_at`
- Produces: `<DataOriginBanner />`

- [ ] **Step 1: Write the failing test:** with a mocked status of `origin: "simulated"`, each of `staff`, `supply`, `optimize`, `actions` shows the exact banner copy, and `dashboard` does not. With `source.mode: "uploaded"`, the header note reads "Uploaded run 3, 2 Nov 2026 14:05". With `default`, it reads "Default data". The optimize ladder card shows the exact ladder label when uploaded.

- [ ] **Step 2: Run it.** Expected: FAIL.

- [ ] **Step 3: Implement.** Banner fetches status once per mount and renders nothing on failure, so the responsive suite's offline runs are unaffected. Default mode also shows the banner, because bundled inventory and staffing are simulated too; only `origin: "real"` hides it. Task2 adds a Load last run button using `specialty/last`, per Plan C. Action Center shows when the list was built.

- [ ] **Step 4: Run tests.** Expected: PASS.

- [ ] **Step 5: Commit** "Show where the data came from on every page that uses it".

---

### Task 15: Full local demo and verification

**Files:**
- Create: `tests/e2e/pipeline.e2e.spec.js`, `playwright.e2e.config.js`
- Modify: `docs/data-upload-plan.md`, `CLAUDE.md`, `api/ai/knowledge.py`

**Interfaces:**
- Consumes: everything. Uses REQUIRED SUB-SKILL superpowers:verification-before-completion.

- [ ] **Step 1: Write the E2E spec.** `playwright.e2e.config.js` targets the running dev servers at `http://localhost:5173`, with a 45-minute timeout. Env vars `E2E_RAW_DIR`, `E2E_PURE_DIR`, `E2E_EXT_DIR`. Real `setInputFiles` uploads. Quick route: four pure CSVs, calendar and weather files, the five demo CSVs, and raw months 2025_11, 2025_12 and 2026_01. Assert: all stages done or knowingly amber, and each linked page renders.

- [ ] **Step 2: Start both servers from the worktree**, backend in one terminal and frontend in another, per CLAUDE.md. Confirm `http://localhost:8000/docs` loads.

- [ ] **Step 3: Run the Quick route.** `npx playwright test -c playwright.e2e.config.js -g quick`. Expected: PASS. Note the total time and per-stage seconds and peak memory from `/api/pipeline/status`.

- [ ] **Step 4: Second run.** Edit one number in a copy of `inventory_movements.csv`, upload only that, press Run. Expected: `data_version` rose, supply figures changed, and raw months were not re-uploaded. Open each page, and ask the assistant one question, confirming the new numbers.

- [ ] **Step 5: Look at it.** Open Data Hub in a real browser at 390px and 1440px, and view the tracker, banners and summary. Fix anything wrong.

- [ ] **Step 6: Run the Full route** with all 81 files in the background. Expected: 80 months accepted, 2019_04 reported as skipped, all stages finish. Record total time and peak memory.

- [ ] **Step 7: Privacy search.** Search the backend log from Steps 3 to 6 and `api/data/ai_audit.jsonl` for: the column labels `Pt Name`, `Hosp Number`, `Episode Number`, and 13-digit runs, printing only match counts. Expected: zero value matches. Check the temp directory for no new `.xlsx`, or spooled files, during an upload.

- [ ] **Step 8: Correct the docs.** `docs/data-upload-plan.md`: replace "5 to 10 seconds" timing claims with the measured figures. `CLAUDE.md`: add the pipeline to the layout table and the rules. `api/ai/knowledge.py`: teach the assistant the Data Hub flow, simulated labels and staging, in plain English.

- [ ] **Step 9: Final checks.** `npm run build`, `npx playwright test`, `.venv\Scripts\python.exe -m pytest -q`. Expected: all pass, with counts stated.

- [ ] **Step 10: Commit** "Verify the full pipeline end to end and update the docs". Leave the branch unmerged, and report the measured results to Jonathan: times, peak memory, any amber stage, every known difference.
