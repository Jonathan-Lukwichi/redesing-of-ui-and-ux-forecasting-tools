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
| AI assistant | `api/ai/` | tool loop (read-only tools), `knowledge.py` (32 teaching cards), prompt-as-policy in `chat.py` |
| Thesis artefacts | `api/external/msc-modelling` | git SUBMODULE — if forecast pages 503, run `git submodule update --init --recursive` |
| Simulation data | `api/data/simulation/` | 23-nurse pool, 30-SKU catalog, 13-month panels |
| Frontend | `src/` | React 18 + Vite SPA, hash navigation in `App.jsx` (`/#page`) |
| Charts | `src/components/Charts.jsx` | hand-rolled SVG; axis charts measure width via `useMeasuredWidth` (ResizeObserver) and thin ticks — keep this pattern |
| Design system | `src/styles.css` + `src/styles/tokens.css` | "Dash" tokens; fluid clamp() type/space scales; mobile drawer ≤820px |
| E2E tests | `tests/responsive.spec.js` | 112 layout assertions at 8 viewports — must pass before claiming UI changes work |
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
- **The `/last` materialization pattern.** Forecast/optimization runs are stochastic; the last run is cached server-side (`GET /api/forecast/last`, `/api/optimization/last`) and EVERY consumer (pages, AI tools) reads the same materialized result. Never let the AI or a page trigger its own private recompute of something shown on screen.
- **AI governance.** Assistant tools are read-only by construction; answers must be grounded in tool results; the public app NEVER states accuracy percentages/MAPE (admin view only); everything is audited. Scenario questions should pair live numbers with a `knowledge.py` card (stats/supply-chain/ML concepts) in plain English.
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
