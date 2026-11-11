# Empty until run: design note (2026-11-10)

## Problem

On a fresh server, before anything was uploaded, pages already showed results.
The Dashboard showed supply and staffing KPIs, Staffing and Supply showed full
simulated results, and the forecast, Explore and Optimization pages could run on
hospital data that `core/bootstrap.ensure_g1` fetched from GitHub at startup.
The Action Center called the AI as soon as it opened, and the Data Hub said
"3/7 loaded" with nothing uploaded.

## Decision

Everything starts empty, locally and live. Results only ever come from a
completed pipeline run. A "Use the sample data" button runs the same pipeline on
the stored data, so people without the hospital files (an examiner on the public
site, say) can still see a working demo.

## Readiness (backend)

- `core/pipeline/job.py` owns readiness. `results_ok` becomes true when the
  Optimise stage, the last one that makes results, finishes. It becomes false
  whenever a run clears results (after Check passes, or before the sample
  loader). A run refused at Check keeps the earlier results.
- `GET /api/pipeline/status` adds `results_ready` (`results_ok` and no run
  going), `results_source` (`"upload"` or `"sample"` for the results held now),
  `run_source` (the latest run's source, null before any run) and `loading`
  (the sample loader is working). `source.mode` is `none`, `uploaded` or
  `sample`.
- The two readings differ on purpose. Recommend runs after Optimise and reads
  the results through the assistant's tools, which make HTTP calls to guarded
  routes, so the server treats results as available from the end of Optimise.
  The pages wait for the whole run to end, so they never appear half-built.
- Readiness lives in RAM, like the data, so a restart clears it.

## The guard

`security.ResultsReady` (beside `PipelineIdle`, same style) raises
`ResultsNotReady`. `main.py` turns that into 409 with this body:
`{"error": "no_results", "message": "No results yet. Upload your data on the
Data Hub and run the pipeline, or use the sample data."}`.

It is a route dependency placed after the access gate and `PipelineIdle`, so an
auth refusal or "a run is in progress" comes first. It never goes inside the
function body, because the stages call those functions directly
(`supply_compare_demo`, `staff_strategy_compare_demo`, `prepare.build`).

Guarded routes:

| Router | Routes |
|---|---|
| forecast | `POST /api/forecast`, `POST /run`, `POST /specialty`, `GET /engines`, `POST /validate`, `GET /demo` |
| task1 / task2 | `POST /api/task1/forecast`, `POST /api/task2/forecast` |
| staff | `GET /overview`, `GET /strategy-compare-demo` |
| supply | `GET /overview`, `GET /item/{id}`, `POST /compare`, `POST /sweep`, `GET /compare-demo`, `GET /sweep-demo` |
| optimization | `POST /staff`, `POST /supply`, `POST /run`, `POST /compare`, `POST /policy/tune`, `GET /forecast-options`, `GET /staff-pool` |
| explore | the whole router (router-level dependency), including its index routes |
| reports | `POST /api/reports/email` |

These stay open: datasets, prepare, the pipeline's upload, status, staged and
preflight routes, every `/last` route (before a run they already say
`available: false`), `GET/PUT /api/optimization/policy`, `GET /api/forecast/coverage`,
and the static thesis catalogues `GET /api/task1/models|metrics` and
`GET /api/task2/specialties|metrics`.

`GET /api/ai/actions` is not refused. Before readiness it returns
`{"actions": [], "results_ready": false}` and never calls the AI, with or
without `refresh`. The assistant's live-data tools return a `no_data` result
that tells the model to say there is no data yet and point to the Data Hub or
the sample button. `lookup_knowledge` still answers.

## No startup fetch

The startup hook and `core/bootstrap.py` are gone. Hospital data loads only
when someone uploads it, presses the sample button, or uses a Fetch control on
the Data Hub (which needs `data:write`).

## The sample run

`POST /api/pipeline/sample[?replace=true]` (thin route in
`routers/pipeline.py`, logic in `core/pipeline/sample.py`):

1. 409 `already_running` if a run is going.
2. 503 `sample_unavailable` if no data repo is configured.
3. Who may start it:
   - A caller without `data:write` (an anonymous visitor in protected mode):
     403 `uploaded_data` if anything came from a real upload (staged months,
     any loaded file without `sample`/`repo` provenance, or results from an
     upload run). 409 `results_exist` if results already exist. Otherwise the
     run starts.
   - A caller with `data:write`: 409 `replace_uploaded` over uploaded data
     unless `replace=true`. Both frontends turn this into an inline confirm.
4. `job.start(source="sample", prepare=sample.load)`. The loader runs in the
   job thread, after the old results are forgotten. It clears staging, the
   registry, the built groups and the published operations frames first, so
   the old and new copies are never in memory together. Then it fetches the
   seven source files through `data_source.fetch_raw` (RAM only) and
   `routers.datasets._ingest_csv`, which is the same path the Fetch buttons
   use, and loads the five demo-pack CSVs the same way. Every slot is marked
   `provenance: "sample"`. The normal eight stages then run. The pack keeps
   `data_origin=simulated` internally, but no page says so (see the addendum).
5. Failures end the run with Check failed and a plain receipt. A 401 or 403
   means the token was refused and a new read-only token is needed. Any other
   network failure reads "could not be reached". Anything else gets a generic
   "could not be loaded". No stack trace or URL is ever shown.

The Data Hub's Fetch route now marks what it fetched `provenance: "repo"`. That
is the stored copy, not a hospital upload, so the sample may replace it.

### Where the demo pack lives

The five CSVs moved from repo-root `demo-data/` to `api/data/demo-pack/`
(`git mv`, so nothing is duplicated). The Docker image copies only `api/`.
Building the pack in memory from `api/data/simulation/` was the preferred
option, but it cannot be done. `make_demo_pack.py` needs the chapter 7
`items_master.csv` and `staff_master.csv`, which are not in this repo. They
hold the ordering, holding and stockout cost columns, and the seven vacant
posts.

## Frontend

- `src/components/PipelineStatus.jsx`: AppShell reads the status once per page
  visit and shares it with the gate, the header note and the badges. It
  keeps the last answer while a new read is in flight.
- `src/components/ResultsGate.jsx` wraps the eight results pages (`gated` in
  `App.jsx`) inside `RequireScope` and BEFORE the page mounts. Until
  `results_ready`, it shows one `Card` titled "No results yet", with "Go to the
  Data Hub" (`data:write` only) and "Use the sample data". While any run is
  going it polls status every 2 s and shows "Loading the sample data…" or
  "Running step N of 8: <label>". It shows the page once the run is ready, or
  the failed stage's receipt if the run stopped. It never starts a run by
  itself.
- Sidebar badges are read only once results are ready. The header note says
  "No data yet", "Run in progress" or "Run N, <time>" (upload and sample runs
  read the same).
- On the Data Hub, "Use the sample data" sits beside "Run full pipeline", with
  the same busy gating and an inline confirm for `replace_uploaded`.

## Trade-offs

- The gate trusts the last status it read while a new page's read is in
  flight, so navigation never flashes. After a server restart mid-session, one
  page can mount on a stale "ready" status and get 409s, until the fresh read
  swaps in the gate. The server guard means no result is shown either way.
- A visitor can start the sample only on an empty server, which limits abuse
  to one run per restart. A data writer can re-run it at any time.
- A Data Hub "Run full pipeline" over sample-loaded data counts as an upload
  run, so visitors cannot restart over it. That errs on the side of
  protecting data.

## Addendum (2026-11-11): no origin labels

Jonathan reviewed the Staff and Supply Planners and decided that the app must
not say anywhere that the data is simulated: "we can specify it in speaking, but
to make the app look real don't say simulated data". Changes:

- The yellow "Inventory and staffing are simulated demonstration data." banner
  is gone from Staffing, Supply, Optimization and the Action Center.
- Page text is reworded with the same facts and numbers. The Staff hero now
  reads "Nurse rostering, coverage and payroll · 23 active nurses (of 30 posts)
  · BCEA logged, not enforced", and the Supply hero "Inventory, reorder
  behaviour and stockouts · 30 items". The 30-run spread reads "95% range: …".
  Method text says "tests many possible weeks of demand" instead of
  "Monte-Carlo simulation".
- The header note reads "Run N, <time>" for every run.
- Server text that reaches the screen no longer says simulated:
  - the Operations receipt
  - the basket labels
  - the cost basis and caveat
  - the optimization note
  - the Explore ops-link caveat, now "Treat this link as a check that the
    pipeline joins the data, not as a tested finding about the hospital."
  - the sample loader's errors
- The assistant: tool results, page contexts and teaching cards carry no origin
  label. Its prompt tells it not to volunteer the origin. If asked directly, it
  answers from a DATA ORIGIN note appended per request. The note says the
  arrivals are the hospital's anonymised data. It says the inventory and
  scheduling figures are demonstration data, or the hospital's uploaded files
  when they are.
- Staffing and Supply stay empty until a run, as before: the presenter starts
  with the descriptive analysis before the optimization.
- Internal names (`simulation_data`, `data_origin`, `SIMULATED_LABEL`), file
  names, docs and the demo-pack README keep the word.
