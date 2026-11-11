# HealthForecast AI — project brief for Claude

Decision-support platform for a hospital emergency department: forecasts patient
arrivals (SARIMAX + Gradient Boosting), turns forecasts into a lawful nurse
roster (PuLP/CBC integer program) and an (s,S) supply plan (Monte-Carlo), and
explains everything through a governed AI assistant. Companion to Jonathan's
MSc dissertation. Live at https://healthforecast.jlwanalytics.com (Render,
auto-deploys on push to `main`).

## Who you're working with

Jonathan is a beginner with terminals and git. Give step-by-step, copy-paste
commands; name the terminal/window; say what success looks like. Explain
concepts in plain English before jargon.

## Commit rules (strict)

- Commits carry ONLY Jonathan's name. NEVER add a "Co-Authored-By" trailer.
- A second working copy of this repo exists elsewhere and pushes to the same
  remote. ALWAYS `git fetch` / `git pull --rebase` before pushing; expect the
  remote to be ahead. When resolving conflicts, judge which side is newer —
  the remote is often the evolved version.
- Never commit secrets. `api/.env` is gitignored and machine-local; secrets do
  not sync between copies by design (tokens must be re-pasted per machine).

## Stack & layout

| Area | Path | Notes |
|---|---|---|
| Backend | `api/` | FastAPI + Uvicorn, Python (local venv: `api/.venv`) |
| Routers (thin) | `api/routers/` | HTTP concerns only; domain logic lives in core |
| Core engines (fat) | `api/core/` | `forecasting.py`, `optimization_engine.py`, `joins.py` (G1–G4), registries |
| Explore pipeline | `api/core/explore/` | plug-in analyzers/metrics/sections — adding an analysis = adding ONE file, register in `__init__` |
| AI assistant | `api/ai/` | tool loop (read-only tools), `knowledge.py` (44 teaching cards), prompt-as-policy in `chat.py` |
| Thesis artefacts | `api/external/msc-modelling` | git SUBMODULE — if forecast pages 503, run `git submodule update --init --recursive` |
| Pipeline | `api/core/pipeline/`, `api/core/transform/`, `api/routers/pipeline.py` | One-button run: `transform/` turns a monthly register .xlsx into the four pure tables; `pipeline/` stages (check, transform, operations, consolidate, analyse, forecast, optimise, recommend) run in one background job; status at `GET /api/pipeline/status` |
| Demo data | `api/data/demo-pack/` | Five simulated CSVs (inventory items/movements, shift log, staff list, staffing daily). Upload them on the Data Hub, or the "Use the sample data" button loads them (lives under `api/` so the Docker image ships it). Simulated, but never labelled so in the app (see "No origin labels") |
| Simulation data | `api/data/simulation/` | 23-nurse pool, 30-SKU catalog, 13-month panels |
| Frontend | `src/` | React 18 + Vite SPA, hash navigation in `App.jsx` (`/#page`) |
| Charts | `src/components/Charts.jsx` | hand-rolled SVG; axis charts measure width via `useMeasuredWidth` (ResizeObserver) and thin ticks — keep this pattern |
| Design system | `src/styles.css` + `src/styles/tokens.css` | "Dash" tokens; fluid clamp() type/space scales; mobile drawer ≤820px |
| Card system | `src/components/ui/Card.jsx` | THE canonical card primitives (CardGrid + slots). New cards never use bespoke markup; contract in `docs/RESPONSIVE.md`; full framework in the `/responsive-frontend-audit` skill (`reference/card-system.md`) |
| E2E tests | `tests/responsive.spec.js` | layout assertions at 8 viewports (results pages are checked in the ready state via a mocked status, and their gate card separately) — must pass before claiming UI changes work. Real-server pipeline run: `tests/e2e/pipeline.e2e.spec.js` (`playwright.e2e.config.js`, `-g quick` or `-g full`; commands in its header) |
| Docs | `docs/` | knowledge guide PDF (regen: `node scripts/make-pdf.cjs <html> <pdf>`), defense course, plans |

## Run / build / test

```powershell
# Backend (terminal 1) — from repo root
cd api; .venv\Scripts\Activate.ps1; python main.py     # http://localhost:8000, docs at /docs

# Frontend (terminal 2)
npm run dev                                             # http://localhost:5173

# Verify
npm run build                                           # must pass before pushing frontend changes
npx playwright test                                     # responsive suite (config binds 127.0.0.1:4173)
cd api; .venv\Scripts\python.exe -c "import main"       # backend import check
```

## Architecture rules to preserve

- **Thin routers, fat core.** New endpoints validate/serialize only; logic goes in `api/core`.
- **The `/last` materialization pattern.** Forecast/optimization runs are stochastic; the last run is cached server-side (`GET /api/forecast/last`, `/api/optimization/last`, and `*-last` endpoints for evidence runs) and EVERY consumer (pages, AI tools) reads the same materialized result. Never let the AI or a page trigger its own private recompute of something shown on screen.
- **Everything computes on demand (Plan C).** No heavy endpoint fires on page load, ever — a Playwright rule fails the suite if the Optimization page loads with any POST or evidence/tune/options call. Results appear only after a Run button; "Load last …" buttons restore cached results explicitly.
- **Empty until run.** Nothing is loaded at startup (no auto-fetch). Results exist only once a pipeline run has finished in this server process (`results_ready` in `GET /api/pipeline/status`; a restart clears it). Before that, every result route answers 409 `no_results` (`security.ResultsReady`, placed after the access gate and `PipelineIdle`; never inside the function, because the stages call those functions directly), `/api/ai/actions` returns an empty list without calling the AI, and the assistant's tools return "no data yet". In the UI, `ResultsGate` (`src/components/ResultsGate.jsx`) wraps every results page BEFORE it mounts and shows one "No results yet" card. The card's "Use the sample data" button (`POST /api/pipeline/sample`) runs the same pipeline on the stored repo data plus the demo pack. A visitor may start it only on a server with no uploaded data and no results; never press it automatically. Add new result routes behind `ResultsReady` and new results pages to `gated` in `App.jsx`.
- **The standing-policy pattern.** The supply reorder policy FAMILY is a server-side standing choice (`GET/PUT /api/optimization/policy`, tuner at `POST /policy/tune`); the weekly supply run optimizes parameters WITHIN the adopted family. Evidence ladders (policy + rostering strategies) live on the Optimization page. Naive is benchmark-only; oracle exists nowhere user-facing (research access via explicit `arms=`/`strategies=` args). Staffing deploys ONLY the lawful roster — unlawful strategies are badged benchmarks by construction. All simulation consumers share `_demand_stream` (common random numbers), so ladder, tuner and planner numbers agree.
- **AI governance.** Assistant tools are read-only by construction; answers must be grounded in tool results; the public app NEVER states accuracy percentages/MAPE (admin view only); everything is audited. Scenario questions should pair live numbers with a `knowledge.py` card (stats/supply-chain/ML concepts) in plain English.
- **The Data Hub pipeline flow.** Everything is uploaded on `/#upload` (drop zone, checklist, Run full pipeline), then one background job runs the stages in order; every page reads that run's `/last` results. Uploaded months are RAM-only staging: registers are transformed in memory, only the four pure tables (no names or episode numbers) are kept, nothing is written to disk, and a restart clears them. Replacing already-staged months asks for confirmation first. Uploads from a hospital replace the stored inventory/scheduling files. Runs need a `data:write` session (the sample run excepted, see "Empty until run"), and only one run at a time (409 otherwise). The Data Hub starts at 0/7 loaded.
- **No origin labels (Jonathan, 2026-11-11).** The app does not label the inventory and scheduling data as simulated in ANY user-visible text: pages, the header note ("Run N, <date time>" for upload and sample runs alike, "No data yet" before one), tooltips, stage receipts and warnings, explore captions, the report email, and the assistant's tool results and teaching cards. No "simulat*", "seed N", "representative run", "Monte-Carlo" or "demonstration/demo data" on screen; uncertainty is worded as "95% range". The presenter discloses the origin verbally. The assistant never volunteers it, but if asked directly it answers truthfully from the DATA ORIGIN note `ai/chat.py` appends to its system prompt ("the inventory and scheduling figures are demonstration data"; for a hospital's own upload, that they are its uploaded files). Internal names, file names, docs and the demo-pack README still describe the data as simulated. `tests/test_no_origin_labels.py` and the responsive suite's FORBIDDEN check enforce this.
- **Same-origin production.** The Docker image serves the built frontend from `api/static`; both frontend API clients (`src/api/client.js` AND `src/api/aiClient.js`) use empty base in prod, localhost only in dev. If you add a new client, follow this or phones break with "Load failed".
- **Memory budget: 512MB** (Render Starter). Registries store numerics as float32/int32 (`slim_numeric`); orjson response class handles numpy types; heavy endpoints gc.collect() via middleware. Don't add unbounded caches or duplicate DataFrames; if OOM recurs, the agreed path is Railway migration, not code heroics.
- **Data privacy model.** Hospital CSVs live in a private GitHub repo, fetched with a read-only PAT (`api/.env`), held in RAM only — never written to disk. Keep it that way.

## Environment quirks (this machine)

- Windows 11, PowerShell 5.1. The working copy lives under OneDrive.
- Corporate TLS inspection: `curl`/`Invoke-WebRequest` to external HTTPS often
  fail or hang. Test network paths through the backend's own stack instead:
  `api\.venv\Scripts\python.exe` with httpx+truststore (see `core/data_source.py`).
- GitHub 401 on data fetch = the PAT was regenerated (possibly from the other
  copy). Fix: new fine-grained token (repo `Jonathan-Lukwichi-healthforecast-data`,
  Contents read-only) pasted into `api/.env` — no restart needed.

## Definition of done

Build passes, relevant tests pass, the change is verified against the running
app (not assumed), committed with a plain descriptive message, and pushed —
Render deploys `main` automatically. Report outcomes honestly: if something is
unverified or a trade-off was taken, say so.
