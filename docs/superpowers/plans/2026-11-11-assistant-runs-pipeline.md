# The Assistant Runs the Pipeline: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in user with `data:write` can ask the analyst assistant to run any pipeline step (or the whole pipeline, or the sample run). The assistant checks the files and quotes a server-computed estimate. The run starts only after the user's explicit yes. The chat shows progress, opens the results page and posts a short summary grounded in `/last`. Each page unlocks once its own step has finished.

**Architecture:** Readiness becomes a set of finished steps held by the pipeline job (`core/pipeline/job.py`). The job learns to run a plan, meaning a list of stage ids drawn from the same stage functions. A new planner (`core/pipeline/steps.py`) turns requested steps into a plan with prerequisites, downstream re-runs and estimates. The assistant gets three run tools. `propose_run` never runs anything. It stores the plan under a short-lived, single-use token tied to the user, and the token travels to the browser in a stream trailer that the model never sees. Only the chat's Run button, or a typed yes that the browser recognises, posts that token to `POST /api/ai/run`. That endpoint starts the job.

**Tech Stack:** FastAPI + Python 3 (pytest), React 18 + Vite, Playwright (route mocks), Anthropic tool loop (`api/ai/chat.py`).

**Spec:** `docs/superpowers/specs/2026-11-11-assistant-runs-pipeline-design.md`

## Global Constraints

- Commits carry ONLY Jonathan's name. NEVER add a `Co-Authored-By` trailer. Messages are plain and descriptive.
- Backend tests: `cd api; .venv\Scripts\python.exe -m pytest tests` (never bare `pytest`). Frontend: `npm run build` must pass. Layout suite: `npx playwright test --workers 1` (one worker on this machine).
- Thin routers, fat core: action logic lives in `api/core/pipeline/` and `api/ai/`. Routers validate and serialize only.
- `/last` materialization: every assistant-started run goes through `job.start` and the stage functions in `api/core/pipeline/stages.py`, and writes the same `/last` results. Summaries read those results. There is no private recompute.
- Plan C: nothing heavy fires on page load. The page switch after a run only opens the page.
- Chat-started steps use the pipeline's settings: `PIPELINE_MODEL = "ml"`, `PIPELINE_HORIZON = 7`, the standing policy family. Custom options stay on the pages' own Run buttons, which are unchanged.
- Who may run: a signed-in user holding `data:write`, for every chat-started step including the sample run. In `AUTH_MODE=open` (with `DEMO_INSECURE=1`) that is everyone, as user `demo`. Signed-out visitors get "sign in to run steps".
- One pipeline run at a time: a second start answers 409 with `security.PIPELINE_BUSY`.
- The sample run from the chat is allowed only when `sample.refusal(True, False)` is `None`. `replace=true` is never reachable from an assistant action.
- The assistant never decides. It never adopts a policy (`PUT /api/optimization/policy`), never records an Action Center decision (`POST /api/actions/decision`), and never clears or replaces data or changes settings.
- Estimates are numbers the server returns (`core/pipeline/timings.py`). The model never invents one.
- No accuracy percentages or MAPE in the public app. The assistant never calls the data "simulated" in its own words.
- Memory budget is 512 MB, so no unbounded caches. The proposal store is capped at 64 entries. Timings are keyed by stage id only.
- Same-origin clients: new browser calls go through `src/api/aiClient.js` (`API_BASE`) or `src/api/client.js`.
- Hospital data stays RAM-only. The only file written is the existing AI audit log, and no row in it ever contains a token.
- Real-server verification uses ONLY backend `127.0.0.1:8012` and Vite `127.0.0.1:5176`. Never touch 8000, 5173, 5174 or 8010.

## Readiness vocabulary (used by every task)

`READY_STEPS = ("arrivals", "staff", "supply", "forecast", "optimise", "recommend")`, defined in `api/core/pipeline/__init__.py`.

| Ready step | Produced by stage(s) | Pages it unlocks (`src/App.jsx` `step`) | Server routes it guards |
|---|---|---|---|
| `arrivals` | `analyse`, `analyse_arrivals` | Explore (`explore`) | whole `/api/explore` router |
| `staff` | `analyse`, `analyse_staff` | Staffing (`staff`) | `GET /api/staff/overview` |
| `supply` | `analyse`, `analyse_supply` | Supply (`supply`) | `GET /api/supply/overview`, `GET /api/supply/item/{id}` |
| `forecast` | `forecast` | Total ED, By specialty, Dashboard forecast | `POST /api/forecast`, `/run`, `/specialty`, `/validate`, `GET /engines`, `/demo`, `POST /api/task1/forecast`, `POST /api/task2/forecast`, `POST /api/reports/email` |
| `optimise` | `optimise` | Optimization (`optimize`) | all 7 guarded `/api/optimization/*` routes, `GET /api/staff/strategy-compare-demo`, `POST /api/supply/compare`, `/sweep`, `GET /compare-demo`, `/sweep-demo` |
| `recommend` | `recommend` | Action Center (`actions`) | `GET /api/ai/actions` (empty list + `results_ready: false`) |

The Dashboard uses `step: 'any'`: it opens once any step is ready and reads only the parts that are ready.

User-facing steps for the planner: `STEPS = ("prepare", "arrivals", "staff", "supply", "forecast", "optimise", "recommend")`, plus the runs `"full"` and `"sample"`. `prepare` is the stages `check, transform, operations, consolidate`.

## Decisions where the spec left room (binding for every task)

- **Scopes.** One rule applies to every chat-started step: `data:write`. This comes from "Settled after the builder check" and overrides the Access section's "the scopes the forecast and optimization Run buttons already require".
- **Data check.** The data check is read-only. It is the `check_data` tool (no token, no job), and it is also the Check stage at the head of data preparation.
- **Analysis: staff / supply.** These areas have no computation of their own: the overviews are computed on request from the Operations stage's tables. `analyse_staff` and `analyse_supply` build the overview once, so the step proves it works and marks the step ready.
- **Re-runs downstream.** These happen only for steps that currently hold a result, and only after a step whose output changes on a re-run (`prepare`, `forecast`, `optimise`). The analyses are deterministic on unchanged data, so re-running them changes nothing downstream. A first run of a step adds only what it needs.
- **"Inputs change".** This means data preparation re-runs (everything is wiped) or an upstream step re-runs. Uploading a file stages it and locks nothing; a later plan sees the changed fingerprint and adds data preparation.
- **When a re-made step becomes visible.** Inside a run, pages see a step that run re-makes only once the run ends. This is today's rule, and it keeps page loads off the 512 MB server while stages fit models. Steps the run does not touch stay visible throughout.
- **Page after a run.** The page shown is the page of the last step the user asked for. `full` and `sample` open the Dashboard. A data-preparation-only run opens the Data Hub.

## Review Focus

- Double confirmation (a double click on Run, or Run followed by a typed yes) must start exactly one run. The second post answers 409 `proposal_unknown`. Tests: Task 6 `test_token_is_single_use`, Task 8 "double click".
- A proposal confirmed after new data arrived, or after another run changed readiness, must run nothing and say "ask again". Test: Task 6 `test_a_stale_proposal_runs_nothing`.
- An expired offer (TTL passed mid-demo) must give a plain chat message, never a silent no-op. Tests: Task 6 `test_an_expired_token_is_refused`, Task 8 "expired offer".
- "yes" typed when no live offer exists (or "yes, but only staff") must go to the assistant as an ordinary message and run nothing. Test: Task 8 "yes with no offer".
- A user looking at a page whose step is being re-run must see the gate with progress and then the refreshed page, never a 409 error card. Tests: Task 2 `test_a_subset_run_hides_only_what_it_reproduces`, Task 8 "page whose step re-runs".

---

### Task 1: Stages for each step, and clearing only what a step owns

**Files:**
- Modify: `api/core/pipeline/__init__.py` (add `READY_STEPS`)
- Modify: `api/core/data_version.py` (add `invalidate`)
- Modify: `api/core/optimization_engine.py:1418-1432` (split the clearer)
- Modify: `api/core/pipeline/stages.py:195-205` and `:390-400` (analysis split, catalogue maps)
- Modify: `api/tests/test_ops_analyzers.py:186-230` (the three `analyse_stage()` calls become `analyse_arrivals()`; the assertions stay)
- Test: `api/tests/test_step_stages.py` (new)

**Interfaces:**
- Produces:
  - `core.pipeline.READY_STEPS: tuple[str, ...]` (values above)
  - `data_version.invalidate(names: Iterable[str]) -> int`: runs only the named clearers (in registration order), bumps the version and returns it. Raises `ValueError` naming any unknown name before running any clearer. It re-raises the first clearer error after running all of them, like `invalidate_all`.
  - `optimization_engine._clear_plan() -> None`: `_clear_last()` and `_TUNED_WAS_RESET = False`. It is registered as `"optimization_plan"` BEFORE `"optimization_engine"`, so `invalidate_all` still ends with the reset result.
  - `stages.analyse_arrivals() -> StageResult`: the current `analyse_stage` body, unchanged.
  - `stages.analyse_staff() -> StageResult`: `asyncio.run(routers.staff.overview())` (lazy import). Receipt: `f"{n_active_staff} active staff over {days_covered} days"`. An `HTTPException` becomes `StageFailed("The staff tables are missing, so there is no staffing overview.")`.
  - `stages.analyse_supply() -> StageResult`: `asyncio.run(routers.supply.overview())`. Receipt: `f"{n_items} items, {items_at_risk} at risk of stockout"`. An `HTTPException` becomes `StageFailed("The stock tables are missing, so there is no supply overview.")`.
  - `stages.analyse_stage() -> StageResult`: calls the three module-level functions by name, in the order arrivals, staff, supply. Receipt is `"; ".join(receipts)` in the order staff, supply, arrivals, so it still ends with `" metrics"`. Warnings are concatenated. Status is `"amber"` if any part is amber. `STAGES` keeps its 8 entries.
  - `stages.EXTRA_STAGES = [("analyse_arrivals", "Analyse arrivals", analyse_arrivals), ("analyse_staff", "Analyse staff", analyse_staff), ("analyse_supply", "Analyse supply", analyse_supply)]`
  - `stages.stage_entry(stage_id: str) -> tuple[str, str, Callable[[], StageResult]]`: searches `STAGES` first (read at call time, so tests that monkeypatch it work), then `EXTRA_STAGES`. Raises `ValueError` for an unknown id.
  - `stages.PRODUCES = {"analyse": ("arrivals", "staff", "supply"), "analyse_arrivals": ("arrivals",), "analyse_staff": ("staff",), "analyse_supply": ("supply",), "forecast": ("forecast",), "optimise": ("optimise",), "recommend": ("recommend",)}`
  - `stages.CLEARS = {"forecast": ("forecast", "optimization"), "optimise": ("optimization_plan", "staff", "supply"), "recommend": ("actions",)}`
  - `stages.PREP_STAGE_IDS = ("transform", "operations", "consolidate")`

- [ ] **Step 1: Write the failing tests** in `api/tests/test_step_stages.py`. Save and restore `engine._POLICY_STATE`, the registry, `prepare_registry` and `simulation_data` the way the `world` fixture in `tests/test_pipeline_plan_stages.py` does.

```python
def test_invalidate_runs_only_the_named_clearers_and_bumps_the_version(monkeypatch):
    calls = []
    monkeypatch.setattr(data_version, "_CLEARERS", {"a": lambda: calls.append("a"),
                                                     "b": lambda: calls.append("b")})
    before = data_version.current()
    assert data_version.invalidate(["b"]) == before + 1
    assert calls == ["b"]

def test_invalidate_refuses_an_unknown_name(monkeypatch):
    monkeypatch.setattr(data_version, "_CLEARERS", {"a": lambda: None})
    with pytest.raises(ValueError, match="nope"):
        data_version.invalidate(["a", "nope"])

def test_re_running_the_optimisation_keeps_tuned_settings(saved_policy):
    engine.set_policy("s_q", tuned={"params_by_item": {"X": {"s_mult": 1.0, "q_mult": 1.0}},
                                    "tuned_at": "2026-01-01T00:00:00"})
    data_version.invalidate(stages.CLEARS["optimise"])
    assert engine.get_policy_state()["tuned_at"] == "2026-01-01T00:00:00"
    assert engine.tuned_was_reset() is False
    assert asyncio.run(optimization.last())["status"] == "no_solution_yet"

def test_new_data_still_resets_tuned_settings(saved_policy):
    engine.set_policy("s_q", tuned={"params_by_item": {"X": {"s_mult": 1.0, "q_mult": 1.0}},
                                    "tuned_at": "2026-01-01T00:00:00"})
    data_version.invalidate_all()
    assert engine.tuned_was_reset() is True

def test_every_cleared_name_is_a_registered_clearer():
    import main  # noqa: F401  (registers every clearer)
    names = {n for ns in stages.CLEARS.values() for n in ns}
    assert names <= set(data_version._CLEARERS)

def test_stages_produce_exactly_the_ready_steps():
    assert {s for ss in stages.PRODUCES.values() for s in ss} == set(READY_STEPS)

def test_stage_entry_reads_the_pipeline_then_the_extra_stages(monkeypatch):
    assert stages.stage_entry("forecast")[2] is stages.forecast_stage
    assert stages.stage_entry("analyse_staff")[2] is stages.analyse_staff
    stub = lambda: stages.StageResult("x")
    monkeypatch.setattr(stages, "STAGES", [("forecast", "Forecast", stub)])
    assert stages.stage_entry("forecast")[2] is stub
    with pytest.raises(ValueError):
        stages.stage_entry("nope")

def test_the_full_analysis_runs_all_three_areas(monkeypatch):
    monkeypatch.setattr(stages, "analyse_arrivals", lambda: stages.StageResult("3 findings, 4 metrics"))
    monkeypatch.setattr(stages, "analyse_staff", lambda: stages.StageResult("5 active staff over 9 days"))
    monkeypatch.setattr(stages, "analyse_supply", lambda: stages.StageResult("2 items, 1 at risk of stockout", ["w"], "amber"))
    r = stages.analyse_stage()
    assert r.receipt == "5 active staff over 9 days; 2 items, 1 at risk of stockout; 3 findings, 4 metrics"
    assert r.status == "amber" and r.warnings == ["w"]

def test_staff_and_supply_analyses_read_the_operations_tables(seeded):
    stages.operations()
    assert re.fullmatch(r"\d+ active staff over \d+ days", stages.analyse_staff().receipt)
    assert re.fullmatch(r"\d+ items, \d+ at risk of stockout", stages.analyse_supply().receipt)
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd api; .venv\Scripts\python.exe -m pytest tests\test_step_stages.py -v`
Expected: FAIL (`AttributeError: module 'core.data_version' has no attribute 'invalidate'`, and so on).

- [ ] **Step 3: Implement the interfaces above.** In `test_ops_analyzers.py`, change the three `stages.analyse_stage()` calls (lines 189, 195, 222, 230) to `stages.analyse_arrivals()`. Those tests check the findings analyses, which moved.

- [ ] **Step 4: Run the new tests, the analyzer tests and the plan-stage tests**

Run: `cd api; .venv\Scripts\python.exe -m pytest tests\test_step_stages.py tests\test_ops_analyzers.py tests\test_pipeline_plan_stages.py tests\test_data_version.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```powershell
git add api/core/pipeline/__init__.py api/core/data_version.py api/core/optimization_engine.py api/core/pipeline/stages.py api/tests/test_ops_analyzers.py api/tests/test_step_stages.py
git commit -m "Give each pipeline step its own stage and its own caches"
```

---

### Task 2: Readiness per step, and runs of a stage plan, in the job

**Files:**
- Modify: `api/core/pipeline/job.py` (state, `start`, `_prepare`, `_run`, `status`, docstring)
- Modify: `api/core/pipeline/preflight.py` (add `inputs_fingerprint`)
- Modify: `api/tests/conftest.py:15-17`, `api/tests/test_empty_until_run.py:215,409,416` (`results_ok` becomes `ready`)
- Modify: `api/tests/pipeline_fixtures.py` (shared fixtures `stub_stages`, `hold_in`, `fail_in`, `seeded`, imported by the test modules that use them)
- Test: `api/tests/test_step_readiness.py` (new)

**Interfaces:**
- Consumes: Task 1's `READY_STEPS`, `stages.stage_entry`, `PRODUCES`, `CLEARS`, `PREP_STAGE_IDS`, `data_version.invalidate`.
- Produces:
  - `_State`: `results_ok` is removed. New fields: `ready: set[str]` (server-side readiness), `producing: frozenset[str]` (steps the current run will make), `prepared_fingerprint: str | None`.
  - `job.start(source: str = "upload", prepare: Callable[[], None] | None = None, plan: Sequence[str] | None = None, on_finish: Callable[[dict], None] | None = None) -> dict`. `plan=None` means every id in `stages.STAGES`. Each id is resolved with `stage_entry` BEFORE the thread starts, and an unknown id raises `ValueError` with nothing changed.
  - `job.ready_steps() -> frozenset[str]`, `job.step_ready(step: str) -> bool`, `job.prepared_fingerprint() -> str | None`.
  - `job.results_available() -> bool`: kept, meaning `bool(ready)`. `job.results_source()` is kept, giving the source while anything is ready.
  - `status()` adds `"ready_steps": list[str]` (the visible steps, in `READY_STEPS` order). `"results_ready"` becomes `bool(ready_steps)`. Every other key is unchanged.
  - `preflight.inputs_fingerprint() -> str`: a sha256 hex of `sorted((sid, meta.get("signature_hash"), meta.get("rows"), meta.get("filename")) for sid in registry.loaded_ids())` plus `sorted((m.year, m.month, m.sha256) for m in staging.months())`.

Rules the job follows. They replace `RESULTS_STAGE` and the old end-of-run special case:
1. `wipes = plan is None or prepare is not None or any(s in PREP_STAGE_IDS for s in plan)`.
2. `producing = set(READY_STEPS) if wipes else union(PRODUCES.get(s, ()) for s in plan)`. It is set when the run starts.
3. At the existing clearing point (`_prepare` for a loader, otherwise before the first stage that is not Check), remove `producing` from `ready`. If `wipes`, call `data_version.invalidate_all()` and set `prepared_fingerprint = None`. Otherwise collect `names = union(CLEARS.get(s, ()) for s in plan)`, and if any exist call `data_version.invalidate(names)`. A clearing failure behaves as today (`CLEAR_FAILED`).
4. After a stage ends `done` or `amber`, add `PRODUCES.get(sid, ())` to `ready` and set `results_source = source`. After `consolidate` ends, set `prepared_fingerprint = preflight.inputs_fingerprint()`.
5. A successful run with `plan is None` ends with `ready = set(READY_STEPS)`.
6. In `finally`, set `producing = frozenset()` and `running = False`. Then, outside the lock, call `on_finish(status())` if it was given. An exception there is logged by type name only.
7. `status()` shows `ready - producing` while running, and `ready` otherwise. A run refused at Check therefore keeps earlier results visible once it ends.

- [ ] **Step 1: Write the failing tests** in `api/tests/test_step_readiness.py`. Use a fresh `job._State()`. The `stub_stages` fixture replaces `stages.STAGES` with stubs that carry the real ids (`check`, `transform`, `operations`, `consolidate`, `analyse`, `forecast`, `optimise`, `recommend`) and `stages.EXTRA_STAGES` with stub `analyse_*` entries. `hold_in(sid)` is a context manager that makes that stub block on an Event until the block exits. `fail_in(sid)` makes that stub raise `StageFailed("stop")`. `_run(plan=None)` calls `job.start(plan=plan)`, waits, and returns `job.status()`. `seeded` is the save, `fx.seed_all()` and restore fixture from `test_pipeline_job.py`. Tasks 5 to 7 reuse these fixtures, so move them into `api/tests/pipeline_fixtures.py`.

```python
def test_a_full_run_makes_every_step_ready(stub_stages):
    s = _run()
    assert s["ready_steps"] == list(READY_STEPS) and s["results_ready"] is True

def test_a_subset_run_marks_only_its_steps(stub_stages):
    job._STATE.ready = {"arrivals"}
    s = _run(plan=["forecast", "optimise"])
    assert s["ready_steps"] == ["arrivals", "forecast", "optimise"]

def test_a_subset_run_hides_only_what_it_reproduces(stub_stages, hold_in):
    job._STATE.ready = set(READY_STEPS)
    with hold_in("forecast"):
        job.start(plan=["forecast", "optimise", "recommend"])
        assert job.status()["ready_steps"] == ["arrivals", "staff", "supply"]
        assert job.step_ready("forecast") is False and job.step_ready("staff") is True
    assert job.wait(10) and job.status()["ready_steps"] == list(READY_STEPS)

def test_a_subset_run_clears_only_the_caches_it_owns(stub_stages, monkeypatch):
    seen = []
    monkeypatch.setattr(data_version, "invalidate", lambda names: seen.append(tuple(names)) or 0)
    monkeypatch.setattr(data_version, "invalidate_all", lambda: pytest.fail("wiped everything"))
    _run(plan=["forecast"])
    assert seen == [("forecast", "optimization")]

def test_an_analysis_only_run_clears_no_cache(stub_stages):
    before = data_version.current()
    _run(plan=["analyse_staff"])
    assert data_version.current() == before

def test_a_plan_with_data_preparation_wipes_everything(stub_stages, monkeypatch):
    job._STATE.ready = set(READY_STEPS)
    wiped = []
    monkeypatch.setattr(data_version, "invalidate_all", lambda: wiped.append(1) or 0)
    s = _run(plan=["check", "transform", "operations", "consolidate", "analyse_arrivals"])
    assert wiped == [1] and s["ready_steps"] == ["arrivals"]

def test_a_failed_step_stays_unready_and_others_survive(stub_stages, fail_in):
    job._STATE.ready = {"arrivals", "forecast"}
    with fail_in("forecast"):
        s = _run(plan=["forecast"])
    assert s["ready_steps"] == ["arrivals"]

def test_on_finish_gets_the_final_status_once(stub_stages):
    got = []
    job.start(plan=["forecast"], on_finish=got.append)
    assert job.wait(10)
    assert len(got) == 1 and got[0]["running"] is False

def test_an_on_finish_error_never_breaks_the_job(stub_stages):
    job.start(plan=["forecast"], on_finish=lambda s: 1 / 0)
    assert job.wait(10) and job.status()["ready_steps"] == ["forecast"]

def test_an_unknown_stage_is_refused_before_starting(stub_stages):
    with pytest.raises(ValueError):
        job.start(plan=["forecast", "nope"])
    assert job.is_running() is False

def test_consolidate_records_the_inputs_fingerprint(stub_stages):
    _run(plan=["check", "transform", "operations", "consolidate"])
    assert job.prepared_fingerprint() == preflight.inputs_fingerprint()

def test_the_fingerprint_changes_when_a_file_changes(seeded):
    a = preflight.inputs_fingerprint()
    e = registry.get("calendar")
    registry.put("calendar", e.df, {**e.metadata, "signature_hash": "sha256:other"})
    assert preflight.inputs_fingerprint() != a
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd api; .venv\Scripts\python.exe -m pytest tests\test_step_readiness.py -v`
Expected: FAIL (`TypeError: start() got an unexpected keyword argument 'plan'`).

- [ ] **Step 3: Implement the rules above.** Update the module docstring to the per-step model. In `conftest.py`, use `monkeypatch.setattr(job._STATE, "ready", set(READY_STEPS), raising=False)`. In `test_empty_until_run.py`, line 215 becomes `job._STATE.ready = set(READY_STEPS)`, and lines 409 and 416 become `job._State(ready=set(READY_STEPS), results_source=..., successful_runs=1)`.

- [ ] **Step 4: Run the job-related suites**

Run: `cd api; .venv\Scripts\python.exe -m pytest tests\test_step_readiness.py tests\test_empty_until_run.py tests\test_pipeline_job.py tests\test_pipeline_guard.py tests\test_no_origin_labels.py tests\test_nurse_names.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```powershell
git add api/core/pipeline/job.py api/core/pipeline/preflight.py api/tests/conftest.py api/tests/test_empty_until_run.py api/tests/test_step_readiness.py
git commit -m "Track results step by step and let the job run a plan of stages"
```

---

### Task 3: The server guard and the assistant's "no data" replies read per-step readiness

**Files:**
- Modify: `api/core/security.py:314-340` (remove `require_results_ready` and `ResultsReady`; add the per-step guard)
- Modify: every route in the "Server routes it guards" column: `api/routers/forecast.py`, `task1.py`, `task2.py`, `staff.py`, `supply.py`, `optimization.py`, `explore.py`, `reports.py`
- Modify: `api/routers/ai.py:202` (`/actions` checks `pipeline_job.step_ready("recommend")`)
- Modify: `api/ai/tools.py:159-192` (no-data reply per tool step)
- Modify: `api/tests/test_empty_until_run.py:60-130` (`GUARDED` gains a step column)

**Interfaces:**
- Consumes: `job.step_ready`, `READY_STEPS`.
- Produces:
  - `security.require_step_ready(step: str) -> Callable[[], None]`: raises `ValueError` at import time for a step not in `READY_STEPS` (import `READY_STEPS` from `core.pipeline`, whose `__init__` has no heavy imports). It raises `ResultsNotReady` when `not job.step_ready(step)`. The 409 body stays `RESULTS_NOT_READY`, unchanged.
  - `security.ReadyFor(step: str)` returns `Depends(require_step_ready(step))`. Routes use `_ready=security.ReadyFor("forecast")`. The explore router uses `dependencies=[security.ReadyFor("arrivals")]`.
  - `tools.TOOL_STEP = {"get_forecast": "forecast", "get_supply_status": "supply", "get_staff_status": "staff", "get_optimization": "optimise", "get_explore_findings": "arrivals"}`
  - `tools.no_data(step: str) -> dict` returns `{"error": ..., "no_data": True, "step": step}`, where error is exactly: `f"No {WHAT[step]} yet: that step has not run on this server, so there are no figures to report. Say exactly that. If you may run steps for this user, offer to run it with propose_run; otherwise ask them to upload their data on the Data Hub and run the pipeline, or to press 'Use the sample data' on any results page. Do not estimate or quote any number."` Here `WHAT = {"forecast": "forecast", "supply": "supply analysis", "staff": "staffing analysis", "optimise": "optimization plan", "arrivals": "patient-arrivals analysis"}`. Remove `NO_DATA` and `_results_ready`.

- [ ] **Step 1: Write the failing tests** in `test_empty_until_run.py`. Turn `GUARDED` into `(method, path, body, step)` rows with the steps from the table. The existing "refused before a run" test unpacks and ignores the step. Add:

```python
@pytest.mark.parametrize("method,path,body,step", GUARDED)
def test_each_result_route_waits_for_its_own_step(open_client, not_ready, method, path, body, step):
    job._STATE.ready = set(READY_STEPS) - {step}
    r = open_client.request(method, path, json=body)
    assert r.status_code == 409 and r.json() == NO_RESULTS, path

def test_a_route_answers_once_its_own_step_is_ready(open_client, not_ready):
    job._STATE.ready = {"staff"}
    assert open_client.get("/api/staff/overview").status_code == 200
    assert open_client.get("/api/supply/overview").status_code == 409
    job._STATE.ready = {"arrivals"}
    assert open_client.get("/api/explore/findings/index").status_code == 200

def test_the_action_center_waits_for_the_recommendations(open_client, not_ready, monkeypatch):
    from ai import actions, config
    monkeypatch.setattr(config, "configured", lambda: True)
    monkeypatch.setattr(actions, "build_and_store", lambda: pytest.fail("AI asked"))
    job._STATE.ready = set(READY_STEPS) - {"recommend"}
    body = open_client.get("/api/ai/actions").json()
    assert body["actions"] == [] and body["results_ready"] is False

@pytest.mark.parametrize("name,step", list(tools.TOOL_STEP.items()))
def test_each_tool_waits_for_its_own_step(not_ready, monkeypatch, name, step):
    monkeypatch.setattr(tools, "_get", lambda path: pytest.fail(f"{name} read {path}"))
    job._STATE.ready = set(READY_STEPS) - {step}
    out = tools.execute(name, {})
    assert out["no_data"] is True and out["step"] == step
    assert "Data Hub" in out["error"] and "sample data" in out["error"]
    assert not any(ch.isdigit() for ch in out["error"])

def test_an_unknown_step_fails_at_import():
    with pytest.raises(ValueError):
        security.require_step_ready("nope")
```

`test_assistant_tools_have_no_numbers_before_a_run` keeps its assertions and also passes with `out["step"]` present.

- [ ] **Step 2: Run them to see them fail**

Run: `cd api; .venv\Scripts\python.exe -m pytest tests\test_empty_until_run.py -v`
Expected: the new tests FAIL (`AttributeError: ... has no attribute 'TOOL_STEP'` / 200 instead of 409).

- [ ] **Step 3: Implement.** Swap every `security.ResultsReady` for `security.ReadyFor(<step from the table>)`. Update the comment block above the guard in `security.py` to describe per-step readiness.

- [ ] **Step 4: Run the guard tests and the full backend suite**

Run: `cd api; .venv\Scripts\python.exe -m pytest tests` and `rg -n "ResultsReady|require_results_ready" api --glob "!**/.venv/**"`
Expected: the suite PASSES, and rg prints nothing.

- [ ] **Step 5: Commit**

```powershell
git add api/core/security.py api/routers api/ai/tools.py api/tests/test_empty_until_run.py
git commit -m "Guard each result route by the step that makes its result"
```

---

### Task 4: Pages unlock step by step

**Files:**
- Modify: `src/components/PipelineStatus.jsx` (helpers)
- Modify: `src/components/ResultsGate.jsx` (`step` prop, hint)
- Modify: `src/App.jsx:23-35,59-61` (`step` per page replaces `gated`)
- Modify: `src/components/AppShell.jsx:288-307` (badges per step)
- Modify: `src/components/DataOriginBanner.jsx:23-30` (`noteText`)
- Modify: `src/pages/Dashboard.jsx:31-50` (reads only the ready parts)
- Modify: `tests/responsive.spec.js:91-102` (`dhStatus` adds `ready_steps`) plus the new tests

**Interfaces:**
- Consumes: `status.ready_steps` (Task 2).
- Produces:
  - `readySteps(status) -> string[]` returns `status?.ready_steps || []`.
  - `isStepReady(status, step) -> boolean`: for `'any'` it means at least one step is ready, otherwise the list includes `step`. Both are exported from `PipelineStatus.jsx`.
  - `STEP_LABEL = { arrivals: 'the patient-arrivals analysis', staff: 'the staff analysis', supply: 'the supply analysis', forecast: 'the prediction', optimise: 'the optimization', recommend: 'the recommendations' }`, exported from `ResultsGate.jsx`.
  - `PAGES[...].step`: dashboard `'any'`, explore `'arrivals'`, forecast-total and forecast-specialty `'forecast'`, staff `'staff'`, supply `'supply'`, optimize `'optimise'`, actions `'recommend'`. A page with a `step` renders inside `<ResultsGate key={page} step={entry.step}>`.
  - The gate's title and description are unchanged. Only when at least one OTHER step is ready, it adds `<div className="pl-note">This page appears once {STEP_LABEL[step]} has run. Ask the assistant to run it, or run the full pipeline on the Data Hub.</div>`.
  - `noteText(status)`: running gives `'Run in progress'`; no ready steps gives `'No data yet'`; otherwise the existing `Run N, stamp`.
  - AppShell fetches `api.staff.overview` only when `'staff'` is ready and `api.supply.overview` only when `'supply'` is ready. The effect depends on `[staffReady, supplyReady, version]`.
  - Dashboard reads `usePipelineContext()` and calls the supply and staff overviews only when their steps are ready. `forecast.last` is read as today.

- [ ] **Step 1: Write the failing Playwright tests.** In `dhStatus`, add `ready_steps: ready ? ['arrivals', 'staff', 'supply', 'forecast', 'optimise', 'recommend'] : []`. Then add:

```js
test('per-step pages @ 390px — with only the prediction ready, Total ED opens and Staffing waits', async ({ page }) => {
  const seen = recordApi(page);
  await mockGate(page, { status: { ...dhStatus({ done: 8 }), ready_steps: ['forecast'] } });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#forecast-total');
  await expect(page.getByTestId('results-gate')).toHaveCount(0);
  await page.goto('/#staff');
  await expect(page.getByTestId('results-gate')).toContainText('This page appears once the staff analysis has run.');
  await page.goto('/#dashboard');
  await expect(page.getByTestId('results-gate')).toHaveCount(0);
  await page.waitForTimeout(800);
  expect(seen.filter((s) => /\/api\/(staff|supply)\/overview/.test(s))).toHaveLength(0);
});

test('per-step pages @ 390px — before any run the gate shows no step hint', async ({ page }) => {
  await mockGate(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#staff');
  await expect(page.getByTestId('results-gate')).not.toContainText('This page appears once');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run build; npx playwright test --workers 1 -g "per-step pages"`
Expected: FAIL (the Total ED gate is still shown, because `results_ready` gates everything).

- [ ] **Step 3: Implement the interfaces above.** Update the comment in `PipelineStatus.jsx` that says `results_ready` is the server's word.

- [ ] **Step 4: Build and run the whole responsive suite**

Run: `npm run build; npx playwright test --workers 1`
Expected: the build passes and every test passes, including the existing gate, badge and header-note tests.

- [ ] **Step 5: Commit**

```powershell
git add src/components/PipelineStatus.jsx src/components/ResultsGate.jsx src/App.jsx src/components/AppShell.jsx src/components/DataOriginBanner.jsx src/pages/Dashboard.jsx tests/responsive.spec.js
git commit -m "Unlock each page when its own step has finished"
```

---

### Task 5: The step planner and server-side estimates

**Files:**
- Create: `api/core/pipeline/timings.py`
- Create: `api/core/pipeline/steps.py`
- Modify: `api/core/pipeline/job.py` (`_run` and `_prepare` record timings)
- Test: `api/tests/test_step_plans.py` (new)

**Interfaces:**
- Consumes: `job.start(plan=..., on_finish=...)`, `job.ready_steps`, `job.prepared_fingerprint`, `preflight.run_checks`, `preflight.inputs_fingerprint`, `sample.refusal`, `sample.holds_uploaded_data`, `sample.load`.
- Produces, in `timings.py`:
  - `DEFAULT_SECONDS = {"load": 20, "check": 2, "transform": 3, "operations": 3, "consolidate": 5, "analyse": 8, "analyse_arrivals": 6, "analyse_staff": 1, "analyse_supply": 1, "forecast": 20, "optimise": 6, "recommend": 25}`
  - `scale_for(stage_id: str) -> float`: `transform` gives `max(1, len(staging.months()))`; `load` gives `1.0`; anything else gives the row count of `registry.get_df("daily_arrival")`, or `1.0` when it is absent.
  - `record(stage_id: str, seconds: float, scale: float) -> None`: stores only ids in `DEFAULT_SECONDS`, keeping the latest value per id in `_RECORDED: dict[str, tuple[float, float]]` (seconds, scale).
  - `estimate(stage_id: str) -> int`: if a value was recorded, `ceil(seconds * scale_for(id) / scale)`, otherwise the default. Clamped to 1..900, and 5 for an unknown id.
  - `reset() -> None`
  - Job hook: before `fn()`, `scale = timings.scale_for(sid)`. After a `done` or `amber` result, `timings.record(sid, seconds, scale)`. In `_prepare`, a successful loader records `"load"`. Failed stages are never recorded.
- Produces, in `steps.py`:
  - `STEPS`, `RUNS = ("full", "sample")`, `STEP_STAGES = {"prepare": ("check", "transform", "operations", "consolidate"), "arrivals": ("analyse_arrivals",), "staff": ("analyse_staff",), "supply": ("analyse_supply",), "forecast": ("forecast",), "optimise": ("optimise",), "recommend": ("recommend",)}`
  - `NEEDS = {"arrivals": ("prepare",), "staff": ("prepare",), "supply": ("prepare",), "forecast": ("prepare",), "optimise": ("forecast",), "recommend": ("optimise", "staff", "supply")}`
  - `RERUN_TRIGGERS = ("prepare", "forecast", "optimise")`. These are the steps whose result changes on a re-run.
  - `LABEL = {"prepare": "Data preparation", "arrivals": "Analysis: patient arrivals", "staff": "Analysis: staff", "supply": "Analysis: supply", "forecast": "Prediction", "optimise": "Optimization", "recommend": "Recommendations", "full": "Full pipeline", "sample": "Sample data, then the full pipeline"}`
  - `PAGE = {"prepare": "upload", "arrivals": "explore", "staff": "staff", "supply": "supply", "forecast": "forecast-total", "optimise": "optimize", "recommend": "actions", "full": "dashboard", "sample": "dashboard"}`
  - `@dataclass(frozen=True) class PlannedStep: id: str; label: str; reason: str; seconds: int`, where reason is `"asked" | "needed" | "rerun"`.
  - `@dataclass(frozen=True) class Plan: kind: str; steps: tuple[PlannedStep, ...]; stage_ids: tuple[str, ...]; stage_seconds: tuple[tuple[str, int], ...]; total_seconds: int; page: str; fingerprint: str; ready_at_plan: frozenset[str]; data_version: int`, with `def public(self) -> dict` returning `{"kind", "page", "total_seconds", "steps": [{"id", "label", "reason", "seconds"}], "stages": [{"id", "seconds"}]}`.
  - `class Refused(Exception)` with `.code: str`, `.message: str` and `.missing: list[dict]` (preflight error issues, `{file, message}`).
  - `needs_preparation() -> bool`: True when `job.prepared_fingerprint()` is None, differs from `preflight.inputs_fingerprint()`, or `prepare_registry.get_df("g1")` is None.
  - `plan(requested: Sequence[str]) -> Plan`: raises `Refused` or `ValueError` (unknown step, empty list, or `full`/`sample` mixed with steps).
  - `still_valid(p: Plan) -> bool`: the fingerprint, `job.ready_steps()` and `data_version.current()` all equal what the plan recorded.
  - `start(p: Plan, on_finish: Callable[[dict], None] | None = None) -> dict`: raises `Refused("proposal_stale", STALE)` when `not still_valid(p)`. For `kind == "sample"` it re-checks `sample.refusal(True, False)` (Refused with that body's code and message) and calls `job.start(source="sample", prepare=sample.load, on_finish=on_finish)`. `kind == "full"` calls `job.start(source=_source(), on_finish=on_finish)`. `kind == "steps"` calls `job.start(source=_source(), plan=list(p.stage_ids), on_finish=on_finish)`. Here `_source()` is `"upload" if sample.holds_uploaded_data() else "sample"`. `job.Busy` propagates.
  - Copy: `STALE = "Something changed since this was proposed (new data, or another run). Ask again and the assistant will re-check."` and `SAMPLE_HINT = " The sample data can replace it only from the Data Hub's 'Use the sample data' button."`

Planner algorithm. The signature does not determine it:
1. If `job.is_running()`, raise `Refused("already_running", security.PIPELINE_BUSY["message"])`.
2. `full` or `sample`: for `sample`, `r = sample.refusal(True, False)`. When it is not None, raise `Refused(r[1]["error"], r[1]["message"] + SAMPLE_HINT)`. For `full`, apply the step 6 files check. Then `stage_ids` is every id in `stages.STAGES`, `stage_seconds` includes `("load", estimate("load"))` first for `sample`, and `steps` is a single `PlannedStep(kind, LABEL[kind], "asked", total)`.
3. Steps: `ready = job.ready_steps()`, `prep = "prepare" in requested or needs_preparation()`, `chosen = {s: "asked"}`. If `prep`, every step in `ready` is added as `"rerun"` (preparation wipes them), and dependencies are resolved as if nothing were ready.
4. Repeat until nothing changes. (a) Prerequisites: for each chosen step and each `n` in `NEEDS[s]`: `n == "prepare"` is added as `"needed"` only when `prep`; any other `n` is added as `"needed"` when it is not ready (or `prep`) and not chosen. (b) Downstream: for each chosen step in `RERUN_TRIGGERS`, every step whose `NEEDS` contains it, and which is in `ready`, is added as `"rerun"`.
5. Order by `STEPS`. `stage_ids` is the concatenation of `STEP_STAGES`. Each step's `seconds` is the sum of `timings.estimate` over its stages. `total_seconds` is the sum. `page` is `PAGE` of the last `"asked"` step in `STEPS` order.
6. If any planned stage is `check`, run `preflight.run_checks()`. When it is not `ok`, raise `Refused("files_missing", "Some files are missing or inconsistent, so the data cannot be prepared: " + "; ".join(f"{i['file']}: {i['message']}" for errors) + ". Upload them on the Data Hub.", missing=errors)`.

- [ ] **Step 1: Write the failing tests** in `api/tests/test_step_plans.py`. Use stub stages (as in Task 2). Use `monkeypatch.setattr(steps, "needs_preparation", lambda: False)` unless a test says otherwise. Make `preflight.run_checks` return `{"ok": True, "issues": [], ...}` by default, and call `timings.reset()` per test.

```python
def ids(p): return [s.id for s in p.steps]
def reasons(p): return {s.id: s.reason for s in p.steps}

def test_a_prepared_server_runs_only_the_forecast(ready):
    ready({"arrivals"})
    p = steps.plan(["forecast"])
    assert ids(p) == ["forecast"] and p.stage_ids == ("forecast",)

def test_the_optimisation_brings_its_forecast(ready):
    ready(set())
    assert reasons(steps.plan(["optimise"])) == {"forecast": "needed", "optimise": "asked"}

def test_recommendations_bring_everything_they_need(ready):
    ready(set())
    assert ids(steps.plan(["recommend"])) == ["staff", "supply", "forecast", "optimise", "recommend"]

def test_rerunning_the_forecast_reruns_what_depends_on_it(ready):
    ready(set(READY_STEPS))
    assert reasons(steps.plan(["forecast"])) == {"forecast": "asked", "optimise": "rerun", "recommend": "rerun"}

def test_rerunning_an_analysis_reruns_nothing_after_it(ready):
    ready(set(READY_STEPS))
    assert ids(steps.plan(["staff"])) == ["staff"]

def test_data_preparation_runs_only_when_the_data_changed(ready, monkeypatch):
    ready({"arrivals", "forecast"})
    monkeypatch.setattr(steps, "needs_preparation", lambda: True)
    p = steps.plan(["supply"])
    assert reasons(p) == {"prepare": "needed", "arrivals": "rerun", "supply": "asked", "forecast": "rerun"}
    assert p.stage_ids[:4] == ("check", "transform", "operations", "consolidate")

def test_needs_preparation_follows_the_fingerprint(seeded_groups):
    job._STATE.prepared_fingerprint = preflight.inputs_fingerprint()
    assert steps.needs_preparation() is False
    job._STATE.prepared_fingerprint = "old"
    assert steps.needs_preparation() is True

def test_missing_files_refuse_a_plan_that_prepares(monkeypatch, ready):
    ready(set()); monkeypatch.setattr(steps, "needs_preparation", lambda: True)
    monkeypatch.setattr(preflight, "run_checks", lambda: {"ok": False, "issues": [
        {"level": "error", "file": "inventory_items.csv", "message": "Missing file. Upload it before running."}]})
    with pytest.raises(steps.Refused) as e:
        steps.plan(["forecast"])
    assert e.value.code == "files_missing" and "inventory_items.csv" in e.value.message
    assert e.value.missing[0]["file"] == "inventory_items.csv"

def test_the_sample_is_refused_over_uploaded_data(monkeypatch):
    monkeypatch.setattr(sample, "refusal", lambda can_write, replace: (409, sample.REPLACE_UPLOADED))
    with pytest.raises(steps.Refused) as e:
        steps.plan(["sample"])
    assert e.value.code == "replace_uploaded" and "Data Hub" in e.value.message

def test_full_and_sample_cover_every_stage():
    every = tuple(sid for sid, _l, _f in stages.STAGES)
    assert steps.plan(["full"]).stage_ids == every
    assert steps.plan(["sample"]).stage_seconds[0][0] == "load"

def test_plans_are_refused_while_a_run_is_going(hold_in): ...   # code == "already_running"

@pytest.mark.parametrize("bad", [[], ["nope"], ["full", "forecast"]])
def test_unknown_or_mixed_steps_raise(bad):
    with pytest.raises(ValueError):
        steps.plan(bad)

@pytest.mark.parametrize("req,page", [(["forecast"], "forecast-total"), (["optimise"], "optimize"),
    (["arrivals", "staff"], "staff"), (["full"], "dashboard"), (["prepare"], "upload")])
def test_the_page_follows_the_last_asked_step(ready, req, page):
    ready(set(READY_STEPS))
    assert steps.plan(req).page == page

def test_estimates_use_the_defaults_on_a_fresh_server(ready):
    ready({"arrivals"})
    assert steps.plan(["forecast"]).total_seconds == 20

def test_estimates_follow_recorded_seconds_scaled_by_history(seeded):
    rows = len(registry.get_df("daily_arrival"))
    timings.record("forecast", 30.0, rows / 2)
    assert timings.estimate("forecast") == 60

def test_a_run_records_its_stage_seconds(stub_stages):
    job.start(plan=["forecast"]); assert job.wait(10)
    assert "forecast" in timings._RECORDED

def test_a_plan_goes_stale_when_data_or_readiness_changes(ready):
    ready({"arrivals"}); p = steps.plan(["forecast"])
    assert steps.still_valid(p)
    job._STATE.ready = {"arrivals", "staff"}
    assert not steps.still_valid(p)

def test_start_runs_the_planned_stages_through_the_job(ready, stub_stages):
    ready(set(READY_STEPS))
    steps.start(steps.plan(["forecast"])); assert job.wait(10)
    assert [s["id"] for s in job.status()["stages"]] == ["forecast", "optimise", "recommend"]
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd api; .venv\Scripts\python.exe -m pytest tests\test_step_plans.py -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'core.pipeline.steps'`).

- [ ] **Step 3: Implement `timings.py`, `steps.py` and the job hook** as specified.

- [ ] **Step 4: Run the planner and job suites**

Run: `cd api; .venv\Scripts\python.exe -m pytest tests\test_step_plans.py tests\test_step_readiness.py tests\test_pipeline_job.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```powershell
git add api/core/pipeline/timings.py api/core/pipeline/steps.py api/core/pipeline/job.py api/tests/test_step_plans.py
git commit -m "Plan which steps to run, with prerequisites, re-runs and real-time estimates"
```

---

### Task 6: Run tools, the confirmation token, the run endpoint and the audit trail

**Confirmation mechanism (decided):**
1. `propose_run` builds a plan and stores it in `ai/proposals.py` under `secrets.token_urlsafe(16)`, bound to the acting username, the exact plan, and the plan's fingerprint, readiness and data version. The token has a 600 s lifetime, is single-use, and a newer proposal to the same user revokes the earlier one. The tool result the MODEL sees has no token.
2. The token reaches the browser only in a trailer that the router appends after the model's text: `"\x1e" + json.dumps({"proposal": {...public, "token", "expires_at"}, "navigate": ...})`. Model deltas have every `\x1e` stripped, so the model cannot forge a trailer.
3. Only the browser posts `{"token", "via": "button" | "typed"}` to `POST /api/ai/run`. That endpoint (`DataWriteAccess`, `PipelineIdle`, heavy rate limit) checks the token belongs to this user, is unexpired and unused, and that the plan is still valid. Only then does it call `steps.start`.

**Files:**
- Create: `api/ai/run_tools.py`
- Create: `api/ai/proposals.py`
- Modify: `api/core/security.py` (add `acting_username`)
- Modify: `api/ai/chat.py:1-15,23-69,176-178,229-300` (docstring, APP_GUIDE line, prompt, `stream_chat`)
- Modify: `api/routers/ai.py:144-192` (chat caller and trailer) plus the new `/run` route
- Test: `api/tests/test_assistant_runs.py` (new)

**Interfaces:**
- Consumes: `steps.plan`, `steps.start`, `steps.Refused`, `steps.needs_preparation`, `preflight.run_checks`, `job.status`, `job.Busy`, `audit.log_event`.
- Produces:
  - `security.acting_username(request) -> str | None`: `"demo"` in open mode, otherwise `current_user(request).username`, or `None` when signed out.
  - `run_tools.TRAILER_MARK = "\x1e"`, `run_tools.NAMES = frozenset({"check_data", "propose_run", "get_run_status"})`, `run_tools.SCHEMAS: list[dict]`. `propose_run`'s input is `{"steps": array of enum [*STEPS, "full", "sample"], minItems 1}`, and each step is described in plain words.
  - `@dataclass class run_tools.Caller: username: str | None; can_run: bool; trailer: dict = field(default_factory=dict)`
  - `run_tools.execute(name: str, args: dict, caller: Caller) -> dict`:
    - `check_data`: `{"ok", "missing": [{file, message}] (errors), "warnings": [...], "ready_steps": [...], "running": bool, "needs_preparation": bool, "can_run": bool}`. When `not ok and caller.can_run`, it sets `caller.trailer["navigate"] = "upload"`.
    - `propose_run`: a signed-out caller gets `{"error": SIGN_IN, "sign_in_required": True}`; a caller without the scope gets `{"error": NO_SCOPE}`; a `Refused` gives `{"error": message, "refused": code}` (and navigates to `"upload"` for `files_missing`); otherwise `caller.trailer["proposal"] = proposals.issue(caller.username, p)` and the result is `{"proposed": True, **p.public(), "note": PROPOSED_NOTE}`.
    - `get_run_status`: `{"running", "finished_at", "ready_steps", "stages": [{label, status, receipt, warnings}]}` from `job.status()`.
  - Copy: `SIGN_IN = "Running steps needs a signed-in account. Tell the user plainly: sign in to run steps. They can still ask questions."` `NO_SCOPE = "This account cannot run pipeline steps: that needs permission to upload data. Tell the user, and suggest asking an administrator."` `PROPOSED_NOTE = "Nothing has started. Tell the user what will run, any step added or re-run and why, and the estimate in words; then say they can press Run below or reply yes."`
  - `proposals.TTL_SECONDS = 600`, `proposals.MAX_PENDING = 64` (the oldest is evicted), `proposals.reset()`, the store `proposals._PENDING: dict[str, _Pending]` (keyed by token), and the clock `proposals._now() -> float` (`time.time()`, so tests can move it).
  - `class proposals.ProposalError(Exception)` with `.status: int`, `.code: str`, `.message: str`.
  - `proposals.issue(username: str, p: steps.Plan) -> dict` returns `p.public() | {"token", "expires_at"}`, revokes the user's earlier pending proposal, and audits `assistant_proposal`.
  - `proposals.start_confirmed(token: str, username: str, via: str) -> dict` returns `{"status": job.status(), "proposal": public}`. Errors: unknown or used gives 409 `proposal_unknown` "That offer is no longer valid. Ask again and the assistant will re-check."; expired gives 409 `proposal_expired` "That offer has expired. Ask again and the assistant will re-check."; another user's token gives 403 `proposal_not_yours` "That offer was made to someone else."; `Refused` gives 409 with its code and message (`proposal_stale` included); `job.Busy` gives 409 `already_running` with the `PIPELINE_BUSY` message. The token is consumed on a successful start, on stale and on expiry. It is kept on busy and on not-yours.
  - Audit rows (model `"none"`, zero tokens, `extra` always has `"user"` and `"proposal_id": sha256(token).hexdigest()[:12]`, never the token): `assistant_proposal` (`steps`, `stage_ids`, `total_seconds`), `assistant_confirm` (`via`), `assistant_confirm_refused` (`via`, `code`), `assistant_run_start` (`stage_ids`), `assistant_run_outcome` (`outcome: "done" | "failed"`, `stages: [{id, status}]`, `failed_stage`). The outcome row comes from the `on_finish` callback passed to `steps.start`.
  - `chat.stream_chat(messages, user=None, caller: run_tools.Caller | None = None)`. With a caller, the schemas are `tools.schemas_for(user) + run_tools.SCHEMAS`, and run-tool names go to `run_tools.execute` (both the Claude and the Gemini paths). After the stream it yields `("trailer", dict(caller.trailer))` when the trailer is non-empty, before `("model", ...)` and `("usage", ...)`. With no caller, nothing changes.
  - Route `POST /api/ai/run`. The body is `class RunRequest(BaseModel): token: str = Field(min_length=8, max_length=64); via: Literal["button", "typed"] = "button"; model_config = ConfigDict(extra="forbid")`. The dependencies, in order, are `user=security.DataWriteAccess, _idle=security.PipelineIdle, _rl=Depends(security.rate_limit("heavy"))`. It returns `start_confirmed(...)` and maps `ProposalError` to `{"error", "message"}`.
  - The chat route builds `Caller(username=acting_username(request), can_run=acting_username(request) is not None and security.caller_can(request, "data:write"))`. It strips `"\x1e"` from deltas, keeps the trailer, and yields `TRAILER_MARK + json.dumps(trailer)` as the last chunk.
  - `CHAT_SYSTEM`: replace the final "You can ONLY read..." paragraph with this exact block, and change the APP_GUIDE "You (this Ask assistant)..." line to add ", and, for signed-in users who may upload data, run pipeline steps after they confirm":

```text
RUNNING STEPS: you may START the app's own pipeline steps for the user; you never decide anything.
- When the user asks you to run something, call check_data first. If files are missing, name each missing file exactly and say it is uploaded on the Data Hub (the app opens it); you cannot upload files.
- If the request is ambiguous ('run the analysis'), ask which they want: patient arrivals, staff or supply; or the prediction, the optimization, the recommendations, or the whole pipeline.
- Then call propose_run with the step ids. Say in one or two sentences what will run, any step added first or re-run and why (the tool's reason), and the estimate exactly as the tool returned it, in words (e.g. 'about a minute'). Never make up an estimate. Then say they can press Run below or reply yes. Nothing has started until they do: never say it is running.
- If propose_run refuses, say why in plain words (for a signed-out user: sign in to run steps).
- When the user says the run has finished or stopped, call get_run_status and the data tools for the steps that ran, then summarise in 3 to 5 plain sentences using only numbers those tools returned. If a step failed, give its receipt in plain words and what to do. End with the decision that is the user's, if any (for example: to adopt the reorder policy the evidence favours, open Optimization and press Adopt; to act on a recommendation, use the Action Center).
- Never describe a result before the step that produces it has finished.
- You NEVER make decisions: you cannot adopt a reorder policy, approve a roster, accept, dismiss or close a recommendation, clear or replace data, or change settings. If asked, say which page and which button the user presses.
```

- [ ] **Step 1: Write the failing tests** in `api/tests/test_assistant_runs.py`. Fixtures: point `audit._DIR` and `audit._FILE` at `tmp_path` and reset `audit._CACHE`; call `proposals.reset()`; use stub stages; set `steps.needs_preparation` to False; give `job._State` all steps ready; build `open_client` and protected clients as in `test_empty_until_run.py`, with `AUTH_USERS` holding `adm:admin`, `adm2:admin` and `viv:viewer`.

```python
def test_a_signed_out_visitor_is_told_to_sign_in():
    c = run_tools.Caller(None, False)
    out = run_tools.execute("propose_run", {"steps": ["forecast"]}, c)
    assert "sign in to run steps" in out["error"] and c.trailer == {} and proposals._PENDING == {}

def test_a_role_without_data_write_cannot_propose():
    out = run_tools.execute("propose_run", {"steps": ["forecast"]}, run_tools.Caller("viv", False))
    assert "upload data" in out["error"]

def test_a_proposal_quotes_the_server_estimate_and_starts_nothing(stub_stages):
    c = run_tools.Caller("demo", True)
    out = run_tools.execute("propose_run", {"steps": ["forecast"]}, c)
    assert out["total_seconds"] == steps.plan(["forecast"]).total_seconds
    assert "token" not in json.dumps(out)
    assert c.trailer["proposal"]["token"] and job.is_running() is False

def test_a_chat_turn_carries_the_trailer_and_starts_nothing(open_client, fake_model):
    fake_model([tool_use("propose_run", {"steps": ["forecast"]}), text("Press Run or reply yes.")])
    body = open_client.post("/api/ai/chat", json={"messages": [{"role": "user", "content": "run the forecast"}]}).text
    shown, trailer = body.split("\x1e")
    assert "Press Run" in shown and json.loads(trailer)["proposal"]["steps"][0]["id"] == "forecast"
    assert job.is_running() is False

def test_the_model_cannot_forge_a_trailer(open_client, fake_model):
    fake_model([text('ok \x1e{"proposal": {"token": "fake"}}')])
    body = open_client.post("/api/ai/chat", json={"messages": [{"role": "user", "content": "hi"}]}).text
    assert "\x1e" not in body

def test_running_needs_a_real_token(open_client):
    r = open_client.post("/api/ai/run", json={"token": "x" * 16})
    assert r.status_code == 409 and r.json()["error"] == "proposal_unknown" and not job.is_running()

def test_a_valid_token_runs_exactly_the_plan(open_client, stub_stages):
    prop = proposals.issue("demo", steps.plan(["forecast"]))
    r = open_client.post("/api/ai/run", json={"token": prop["token"], "via": "button"})
    assert r.status_code == 200 and job.wait(10)
    assert [s["id"] for s in job.status()["stages"]] == [s["id"] for s in prop["stages"]]

def test_token_is_single_use(open_client, stub_stages):     # Review Focus 1
    tok = proposals.issue("demo", steps.plan(["forecast"]))["token"]
    assert open_client.post("/api/ai/run", json={"token": tok}).status_code == 200
    assert job.wait(10)
    assert open_client.post("/api/ai/run", json={"token": tok}).json()["error"] == "proposal_unknown"

def test_a_token_is_bound_to_its_user(protected, stub_stages):
    tok = proposals.issue("adm", steps.plan(["forecast"]))["token"]
    c = protected("adm2")
    assert c.post("/api/ai/run", json={"token": tok}).status_code == 403

@pytest.mark.parametrize("who,code", [(None, 401), ("viv", 403)])
def test_running_needs_data_write(protected, who, code):
    assert protected(who).post("/api/ai/run", json={"token": "x" * 16}).status_code == code

def test_an_expired_token_is_refused(open_client, monkeypatch):     # Review Focus 3
    tok = proposals.issue("demo", steps.plan(["forecast"]))["token"]
    monkeypatch.setattr(proposals, "_now", lambda: time.time() + proposals.TTL_SECONDS + 1)
    assert open_client.post("/api/ai/run", json={"token": tok}).json()["error"] == "proposal_expired"

def test_a_stale_proposal_runs_nothing(open_client, seeded):        # Review Focus 2
    tok = proposals.issue("demo", steps.plan(["forecast"]))["token"]
    e = registry.get("calendar")
    registry.put("calendar", e.df, {**e.metadata, "signature_hash": "sha256:new"})
    r = open_client.post("/api/ai/run", json={"token": tok})
    assert r.status_code == 409 and r.json()["error"] == "proposal_stale" and not job.is_running()

def test_one_run_at_a_time(open_client, hold_in):
    tok = proposals.issue("demo", steps.plan(["forecast"]))["token"]
    with hold_in("analyse"):
        job.start()
        r = open_client.post("/api/ai/run", json={"token": tok})
        assert r.status_code == 409 and r.json() == security.PIPELINE_BUSY

def test_a_new_proposal_revokes_the_earlier_one(): ...  # the first token answers proposal_unknown

def test_extra_fields_are_rejected(open_client):
    assert open_client.post("/api/ai/run", json={"token": "x" * 16, "replace": True}).status_code == 422

def test_every_action_is_audited_without_the_token(open_client, stub_stages, audit_rows):
    tok = proposals.issue("demo", steps.plan(["forecast"]))["token"]
    open_client.post("/api/ai/run", json={"token": tok, "via": "typed"}); job.wait(10)
    rows = audit_rows()
    assert [r["surface"] for r in rows] == ["assistant_proposal", "assistant_confirm",
                                           "assistant_run_start", "assistant_run_outcome"]
    assert rows[1]["via"] == "typed" and rows[3]["outcome"] == "done"
    assert all(r["user"] == "demo" and tok not in json.dumps(r) for r in rows)

def test_a_refused_confirmation_is_audited(open_client, audit_rows): ...  # surface assistant_confirm_refused

def test_check_data_names_missing_files_and_opens_the_data_hub(monkeypatch): ...
    # preflight error on inventory_items.csv -> missing[0]["file"]; trailer navigate "upload" only when can_run

def test_run_status_reports_plain_receipts(stub_stages): ...

def test_the_prompt_carries_the_running_rules():
    assert "RUNNING STEPS" in chat.CHAT_SYSTEM and "You NEVER make decisions" in chat.CHAT_SYSTEM
    assert "You can ONLY read" not in chat.CHAT_SYSTEM
```

`fake_model` reuses the `_FakeClient`/`_Msg`/`_Block` pattern from `tests/test_ai_guardrails.py`, with `config.configured` set to True and `telemetry.over_budget` set to False.

- [ ] **Step 2: Run them to see them fail**

Run: `cd api; .venv\Scripts\python.exe -m pytest tests\test_assistant_runs.py -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'ai.run_tools'`).

- [ ] **Step 3: Implement the interfaces above.** Update the docstrings of `chat.py` and `tools.py`: the read tools stay read-only, and the run tools only propose.

- [ ] **Step 4: Run the assistant suites and the full backend suite**

Run: `cd api; .venv\Scripts\python.exe -m pytest tests`
Expected: all PASS, including `test_ai_guardrails.py` (the prompt phrases are kept) and `test_assistant_scope.py`.

- [ ] **Step 5: Commit**

```powershell
git add api/ai/run_tools.py api/ai/proposals.py api/ai/chat.py api/routers/ai.py api/core/security.py api/tests/test_assistant_runs.py
git commit -m "Let the assistant propose pipeline steps that run only on the user's confirmation"
```

---

### Task 7: Pin "the assistant never decides", and update the governance rule and the card

**Files:**
- Create: `api/tests/test_assistant_cannot_decide.py`
- Modify: `CLAUDE.md` (the "AI assistant" table row, the "AI governance" rule, the "Data Hub pipeline flow" rule)
- Modify: `api/ai/knowledge.py:666-690` (the `data_hub_pipeline` card)

**Interfaces:**
- Consumes: `tools.TOOL_SCHEMAS`, `run_tools.SCHEMAS`, `steps.plan`, `steps.STEP_STAGES`, `stages.stage_entry`, `main.app.routes`.

- [ ] **Step 1: Write the tests**

```python
ALLOWED_TOOLS = {"get_forecast", "get_supply_status", "get_staff_status", "get_optimization",
                 "get_explore_findings", "lookup_knowledge", "check_data", "propose_run", "get_run_status"}

def test_the_assistant_has_exactly_these_tools():
    assert {t["name"] for t in tools.TOOL_SCHEMAS + run_tools.SCHEMAS} == ALLOWED_TOOLS

def test_the_assistant_router_can_change_nothing_but_start_a_run():
    import main
    writes = {(m, r.path) for r in main.app.routes if getattr(r, "path", "").startswith("/api/ai")
              for m in (r.methods or set()) - {"GET", "HEAD"}}
    assert writes == {("POST", "/api/ai/explain/forecast"), ("POST", "/api/ai/explain"),
                      ("POST", "/api/ai/briefing"), ("POST", "/api/ai/chat"), ("POST", "/api/ai/run")}

@pytest.mark.parametrize("req", [[s] for s in steps.STEPS] + [["full"], ["sample"]])
@pytest.mark.parametrize("ready,prep", [(set(), True), (set(READY_STEPS), False)])
def test_every_stage_a_plan_reaches_is_a_pipeline_stage(monkeypatch, req, ready, prep):
    ...  # set readiness/needs_preparation/refusal None; every stage_entry(sid)[2] is one of
         # the functions in the real stages.STAGES or stages.EXTRA_STAGES (identity check)

def test_no_assistant_run_reaches_a_decision(open_client, seeded, monkeypatch):
    for target, attr in [(engine, "set_policy"), (action_store, "record"), (registry, "clear_all"),
                         (prepare_registry, "clear_all"), (staging, "clear"), (sample, "load")]:
        monkeypatch.setattr(target, attr, lambda *a, **k: pytest.fail(f"{attr} was called"))
    policy = engine.get_policy_state()["policy"]
    tok = proposals.issue("demo", steps.plan(["full"]))["token"]   # real stages, AI unconfigured
    assert open_client.post("/api/ai/run", json={"token": tok}).status_code == 200
    assert job.wait(300) and job.status()["stages"][-1]["status"] in ("done", "amber")
    assert engine.get_policy_state()["policy"] == policy

def test_the_assistant_modules_hold_no_decision_calls():
    forbidden = ("set_policy", "action_store", "/api/actions", "replace=True", "clear_all",
                 "/api/datasets", "/api/prepare", ".put(", ".delete(")
    for mod in (tools, run_tools, proposals, steps):
        src = inspect.getsource(mod)
        assert not [w for w in forbidden if w in src], mod.__name__
    assert inspect.getsource(tools).count("_post(") == 1      # the helper is defined, never called
```

For the dynamic test, use the seeded `world` save and restore pattern from `test_pipeline_plan_stages.py`, set `ai.config.configured` to False (Recommend ends amber), and give `job._State()` a fresh state.

- [ ] **Step 2: Run them.** Any failure means an assistant path reaches a decision. Fix the code, never the test.

Run: `cd api; .venv\Scripts\python.exe -m pytest tests\test_assistant_cannot_decide.py -v`
Expected: PASS.

- [ ] **Step 3: Update the docs.** In `CLAUDE.md`, the AI assistant row becomes "tool loop (read-only data tools; run tools that only propose)". The AI governance rule becomes this text:

```text
- **AI governance.** The assistant's data tools are read-only and its answers must be grounded in tool results. It may START computations: the pipeline's own steps, through the same job and `/last` results as the buttons, but only for a signed-in user with `data:write` (everyone in open auth mode), and only after the user's explicit yes. `propose_run` stores a short-lived, single-use token bound to that user and that exact step list; only the chat's Run button (or a yes the user types) posts it to `POST /api/ai/run`. It never DECIDES: no adopting a policy, approving a roster, accepting/dismissing/closing actions, clearing or replacing data, or changing settings (`api/tests/test_assistant_cannot_decide.py` pins this). The public app NEVER states accuracy percentages/MAPE (admin view only); every answer, proposal, confirmation, run start and outcome is audited. Scenario questions should pair live numbers with a `knowledge.py` card (stats/supply-chain/ML concepts) in plain English.
```

Then add to the Data Hub rule: "Readiness is per step (`ready_steps` in `GET /api/pipeline/status`): each page unlocks when the step that makes its result has finished; the server guard (`security.ReadyFor`), the shell, `ResultsGate` and the assistant read the same set."

In the `data_hub_pipeline` card, add the keywords `assistant chat run step steps unlock page` and replace its last sentence with: "Each page unlocks as soon as the step that makes its result has finished: Explore after the patient-arrivals analysis, Staffing and Supply after theirs, the forecast pages after the prediction, Optimization after the optimization, and the Action Center after the recommendations; a full run unlocks them all, and 'Use the sample data' loads the stored files and runs the same eight steps. If you are signed in and may upload data, you can also ask the assistant to run any step: it checks the files, says how long it will take, and starts only after you press Run or reply yes. It never adopts a policy, approves a roster or acts on a recommendation; those decisions stay yours."

- [ ] **Step 4: Run the full backend suite**

Run: `cd api; .venv\Scripts\python.exe -m pytest tests`
Expected: all PASS.

- [ ] **Step 5: Commit**

```powershell
git add api/tests/test_assistant_cannot_decide.py CLAUDE.md api/ai/knowledge.py
git commit -m "Pin that the assistant can run steps but never decide, and document the rule"
```

---

### Task 8: The chat runs a step: Run button, typed yes, progress, page switch, summary

**Files:**
- Modify: `src/api/aiClient.js` (add `chatTurn` and `runProposal`)
- Modify: `src/components/AskChat.jsx`
- Modify: `src/components/AppShell.jsx:339` (`<AskChat onNavigate={navigate} />`)
- Modify: `tests/responsive.spec.js` (new `describe('assistant runs steps')`)

**Interfaces:**
- Consumes: the trailer and `POST /api/ai/run` (Task 6), `api.pipeline.status`, `runProgress` and `usePipelineContext().setStatus` (`PipelineStatus.jsx`).
- Produces:
  - `aiApi.chatTurn(messages, onText, signal) -> Promise<{ proposal: object | null, navigate: string | null }>`. `onText(visible)` receives the whole visible text so far, which is everything before the first `\x1e`. The trailer JSON is parsed once the stream ends.
  - `aiApi.runProposal(token, via) -> Promise<object>`. A non-2xx answer throws an `Error` with `.status`, `.code` (`body.error`) and the server's `message`.
  - `AskChat({ onNavigate })`. Messages are `{ role, content, hidden?, proposal?, run? }`. Only `{role, content}` is sent to the server, and hidden messages are sent but not rendered.
  - Constants in `AskChat.jsx`:
    - `POLL_MS = 2000`
    - `YES_RE = /^\s*(yes|y|yeah|yep|ok|okay|sure|go|go ahead|run|run it|do it|please do|yes please)\s*[.!]*\s*$/i`
    - `FINISHED_PROMPT = 'The run I confirmed has finished. Check its status and results, then summarise them for me.'`
    - `STOPPED_PROMPT = 'The run I confirmed stopped before the end. Check its status and tell me plainly what went wrong and what to do.'`
    - `fmt(s)` gives `` `${s} s` `` under 60, otherwise `` `${m} min` `` or `` `${m} min ${r} s` ``.

Behaviour:
1. A trailer proposal attaches to its assistant message as a card (`data-testid="chat-proposal"`). Any earlier card turns inactive.
2. The card shows `Ready to run · about {fmt(total_seconds)}`, then one row per step: the label, the reason note (`needed` shows "needed first", `rerun` shows "re-run so every page matches") and `~{fmt(seconds)}`. It has buttons **Run** (primary) and **Not now**.
3. Run, or a message matching `YES_RE` while the LAST assistant message holds an active card, disables the card at once and calls `runProposal(token, 'button' | 'typed')`. A typed yes is shown as a user bubble and makes no `/api/ai/chat` call.
4. An error shows the server message inside the card (`role="status"`). The card stays active only for `already_running`.
5. On success, the progress line (`data-testid="chat-run-progress"`, `role="status"`, `aria-live="polite"`) shows `runProgress(s)` plus ` · about ${fmt(remaining)} left`. It polls `api.pipeline.status` every `POLL_MS` and passes each answer to `setStatus`. `remaining` is the sum of `proposal.stages[].seconds` over stages whose status entry is not `done`, `amber`, `skipped` or `failed`. `load` counts only while `s.loading` is true or no stage has started yet.
6. When `!s.running`: with no failed stage, call `onNavigate(proposal.page)`, then send the hidden `FINISHED_PROMPT` turn. With a failed stage, show `Stopped at {label}`, stay on the page and send `STOPPED_PROMPT`. The card ends with "Finished" or "Stopped at …".
7. A trailer `navigate` (missing files) calls `onNavigate(navigate)` when the reply ends.
8. "New chat" is disabled while a run is being followed. The panel stays mounted and open across the page switch.

- [ ] **Step 1: Write the failing Playwright tests.** A helper mocks an admin `me` (scopes include `data:write`), a phased `/api/pipeline/status`, and `/api/ai/chat` returning `text/plain` bodies by call count (proposal turns end in `'\x1e' + JSON.stringify({ proposal })`). It records `/api/ai/run` request bodies. The proposal is `{ token: 'tok-1', kind: 'steps', page: 'optimize', total_seconds: 6, steps: [{ id: 'optimise', label: 'Optimization', reason: 'asked', seconds: 6 }], stages: [{ id: 'optimise', seconds: 6 }] }`.

```js
test('chat @ 390px — an offer runs only after Run, shows progress, opens the page and summarises', async ({ page }) => {
  // phases: idle (ready: arrivals..forecast) -> running (stages [optimise running]) -> done (all ready)
  await openChatAndAsk(page, 'run the optimization');
  await expect(page.getByTestId('chat-proposal')).toContainText('Ready to run · about 6 s');
  await page.waitForTimeout(500);
  expect(runPosts).toHaveLength(0);
  await page.getByTestId('chat-proposal').getByRole('button', { name: 'Run' }).click();
  expect(runPosts).toEqual([{ token: 'tok-1', via: 'button' }]);
  phase = 'running';
  await expect(page.getByTestId('chat-run-progress')).toContainText('Running step 1 of 1: Optimise');
  phase = 'done';
  await expect(page).toHaveURL(/#optimize$/);
  await expect(page.getByPlaceholder('Ask a question…')).toBeVisible();   // chat still open
  await expect.poll(() => chatBodies.at(-1)?.messages.at(-1).content).toBe(FINISHED_PROMPT);
  await expect(page.getByText('The plan covers the week from 3 Nov.')).toBeVisible();
  const heavy = seen.filter((s) => (s.startsWith('POST ') && !/\/api\/ai\/(chat|run)$/.test(s))
    || /forecast-options|compare-demo|sweep-demo|strategy-compare|policy\/tune(?!\/last)/.test(s));
  expect(heavy).toHaveLength(0);
});

test('chat @ 390px — typing yes confirms the offer without asking the assistant', ...);
  // after the offer: type "yes" + Enter -> runPosts [{token:'tok-1', via:'typed'}], chatBodies.length stays 1

test('chat @ 390px — yes with no offer goes to the assistant and runs nothing', ...);   // Review Focus 4
  // first reply has no trailer; "yes" -> chatBodies.length 2, runPosts 0

test('chat @ 390px — an expired offer says so and runs nothing', ...);   // Review Focus 3
  // /api/ai/run -> 409 {error:'proposal_expired', message:'That offer has expired. Ask again and the assistant will re-check.'}
  // card shows that message; its Run button is gone or disabled

test('chat @ 390px — a double click on Run starts one run', ...);   // Review Focus 1
  // dblclick Run -> runPosts length 1

test('chat @ 390px — a page whose step re-runs shows the gate with progress, then returns', ...);   // Review Focus 5
  // start on #forecast-total (all ready), offer forecast; Run; running phase ready_steps ['arrivals','staff','supply'],
  // stages [forecast running] -> results-gate contains 'Running step 1 of 1: Forecast'; done -> gate count 0

test('chat @ 390px — missing files open the Data Hub', ...);
  // trailer {navigate:'upload'} -> URL #upload
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run build; npx playwright test --workers 1 -g "chat @ 390px"`
Expected: FAIL (no `chat-proposal` element).

- [ ] **Step 3: Implement** `chatTurn`, `runProposal`, the AskChat behaviour above (inline styles, matching the file) and the AppShell prop. Update the header comment ("Read-only") to say that the assistant reads, and that it runs steps only after the user's confirmation.

- [ ] **Step 4: Build and run the whole responsive suite**

Run: `npm run build; npx playwright test --workers 1`
Expected: the build passes and every test passes.

- [ ] **Step 5: Commit**

```powershell
git add src/api/aiClient.js src/components/AskChat.jsx src/components/AppShell.jsx tests/responsive.spec.js
git commit -m "Run confirmed steps from the chat, follow their progress and open the results"
```

---

### Task 9: Full verification, then drive the real app end to end

**Files:**
- Create (scratch only, never committed): `<scratchpad>\drive-chat.cjs` and the screenshots `<scratchpad>\shots\*.png`

- [ ] **Step 1: Run every automated check**

Run: `cd api; .venv\Scripts\python.exe -m pytest tests` then `cd ..; npm run build; npx playwright test --workers 1`
Expected: every backend test passes, the build passes, and every responsive test passes.

- [ ] **Step 2: Start the backend on 8012** (background terminal, from `api`):

```powershell
$env:PORT='8012'; $env:AUTH_MODE='open'; $env:DEMO_INSECURE='1'; $env:CORS_ORIGINS='http://127.0.0.1:5176'
.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8012
```

`main.py` hard-codes port 8000, so use uvicorn directly. `PORT` must be set, because the assistant's tools call `127.0.0.1:$PORT`.
Check: `api\.venv\Scripts\python.exe -c "import httpx; print(httpx.get('http://127.0.0.1:8012/api/ai/health').json()['configured'])"`. Expected: `True`. If it prints `False`, `api/.env` has no AI key: stop and report it, because the chat cannot be verified without a key.

- [ ] **Step 3: Start Vite on 5176** (a second background terminal, repo root):

```powershell
$env:VITE_API_BASE_URL='http://127.0.0.1:8012'; npx vite --port 5176 --strictPort --host 127.0.0.1
```

- [ ] **Step 4: Drive the chat.** Write `drive-chat.cjs`, which loads `const { chromium } = require(require.resolve('@playwright/test', { paths: [process.cwd()] }))` and honours `PW_CHROMIUM_PATH`, and run it with `node <scratchpad>\drive-chat.cjs` from the repo root. At 1440×900 it does the following:
  1. Open `/#dashboard`. Screenshot `01-gate.png`.
  2. Open the chat and send "please run the analysis". Screenshot `02-first-reply.png`. Expected: the assistant checks the data, then asks which area, or names missing files and opens the Data Hub.
  3. Send "Use the sample data and run the whole pipeline". Wait for `chat-proposal`. Screenshot `03-proposal.png`.
  4. Click Run. Screenshot `04-progress.png` after 3 s. Wait up to 5 min for the summary. Screenshot `05-summary.png`. Expected URL: `#dashboard`.
  5. Send "Run the prediction again" and wait for the card. Screenshot `06-rerun-proposal.png`. Expected: Prediction, plus Optimization and Recommendations as re-runs. Click Run, wait, and check the URL is `#forecast-total`. Screenshot `07-forecast-page.png`.
  6. Read `GET /api/optimization/policy`, then send "Adopt the reorder policy the evidence recommends". Screenshot `08-decision-refused.png`. Read the policy again: it must be unchanged.
  7. Resize to 390×844. Screenshot `09-mobile-chat.png`.
  8. Print the surfaces from `GET http://127.0.0.1:8012/api/ai/audit?n=50`. Expected: `assistant_proposal`, `assistant_confirm`, `assistant_run_start` and `assistant_run_outcome` for both runs.

  If the sample load fails with the token message, that is the PAT problem described in CLAUDE.md. Report it as is, and do not work around it.

- [ ] **Step 5: Look at every screenshot** with the Read tool. Check that the card text is readable, that the estimate is shown, that the Run button sits inside the panel at 390 px with no horizontal overflow, that the summary has 3 to 5 sentences and no accuracy figure, and that the decision reply names the page and the button.

- [ ] **Step 6: Stop both background servers** (only the 8012 and 5176 processes this task started). Report honestly what was verified and what was not.

- [ ] **Step 7: Hand over** with superpowers:finishing-a-development-branch. Before any push: `git fetch` and `git pull --rebase` (the remote is often ahead), and no `Co-Authored-By` trailer anywhere.
