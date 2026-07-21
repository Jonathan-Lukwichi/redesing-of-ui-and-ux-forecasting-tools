# HealthForecast — The Defense Course

**Purpose of this document.** You built this system with AI assistance. That is a modern engineering workflow, not a weakness — but it means your defense rests entirely on one thing: *can you explain every decision in the system, why it was made, what the alternatives were, and what its limits are?* This course walks the entire project — frontend, backend, data pipeline, forecasting science, operations research, the AI layer, and the engineering process — and for every part gives you: **what it is → why it is used here → what was rejected instead → the question an examiner will ask, and the answer.**

Study it in order. Part 0 is how you open. Part 9 is the question bank you drill the night before.

---

## Part 0 — The One-Minute System Story (memorize this)

> "HealthForecast is a decision-support platform for a South African public-hospital emergency department. It has one central scientific idea: **an accurate arrivals forecast is worth money and care quality, and everything downstream should be driven by it.** The system forecasts daily patient arrivals with two engines — a classical SARIMAX time-series model and a gradient-boosting machine-learning model — validates them by backtesting, and then feeds the forecast into two operations-research optimizers: an integer program that builds the cheapest *lawful* nurse roster under Basic Conditions of Employment Act constraints, and a two-stage (s,S) inventory policy tuned by Monte-Carlo simulation. A grounded AI assistant sits on top as a retrieval tool that explains the numbers in plain English but can never act. Architecturally it is a React single-page application talking to a FastAPI backend over REST, deployed as a single Docker container."

Every sentence in that paragraph is defensible from the code. The rest of this course is the expansion of each sentence.

**The chain to draw on the whiteboard if asked "how does it fit together":**

```
raw data (arrivals, calendar, weather, clinical)
        │  join + clean  (G1 daily demand, G3 clinical daily)
        ▼
forecast engines (SARIMAX  |  Gradient Boosting)  ──backtesting──▶ accuracy
        │ daily predicted arrivals + intervals
        ├──▶ shift demand (÷ nurse ratios, + κσ buffer) ──▶ roster IP (PuLP/CBC)
        ├──▶ item demand scaling ──▶ (s,S) reorder + Monte-Carlo S*
        └──▶ AI assistant (read-only RAG) ──▶ plain-English briefings/chat
```

---

## Part 1 — Architecture: Why Three Tiers

### What it is
A **three-tier architecture**: presentation (React SPA in `src/`), application/API (FastAPI in `api/`), and data/computation (pandas registries, forecasting and optimization engines in `api/core/`). The tiers speak **REST over HTTP with JSON** bodies.

### Why here
- **Separation of concerns**: the UI never computes; the science never renders. You can rewrite the frontend without touching a forecast, and swap a forecasting engine without touching a page. This is the single most important architectural principle to articulate.
- **REST + JSON** because the consumers are a browser and (later) possibly other clients; statelessness of HTTP means every request is self-describing and the backend can be restarted or scaled without session migration.
- **A single repository, two runtimes** (Node for the frontend build, Python for everything scientific) because Python owns the data-science ecosystem (pandas, statsmodels, scikit-learn, PuLP) and JavaScript owns the browser. Trying to do the science in JS or the UI in Python (e.g., Streamlit) would sacrifice one side.

### Alternative rejected
- **Streamlit/Dash** (Python-only): faster to prototype, but no control over UX, poor design freedom, and it couples science to presentation. This project's UX *is* part of its contribution (a redesign project), so a real frontend was required.
- **Microservices**: overkill at this scale. A modular monolith (13 routers, one process) is the correct size; the router structure means it could be split later.

### Examiner question
*"Why not server-side rendering / why an SPA?"* — The app is a dashboard: highly interactive, chart-dense, session-long usage by a logged-in operator. There is no SEO requirement and no content to index. An SPA with a JSON API gives instant page switches and lets the same API later serve mobile or scripts. The production Docker build serves the compiled SPA **from FastAPI itself** (static mount + catch-all fallback), which collapses deployment to one container and removes CORS entirely in production.

---

## Part 2 — Frontend Engineering

### 2.1 React 18 + Vite

**What**: React 18 (`createRoot`, `StrictMode`), bundled by Vite 5, ESM throughout.

**Why React**: component model maps one-to-one to the UI's structure (KPI tile, day card, chart, page); declarative rendering means the UI is a function of state — when a forecast result arrives, you set state and every dependent chart re-renders correctly. It is also the industry-dominant choice, which matters for a defense: you chose the mainstream tool and can explain its model (virtual DOM diffing, one-way data flow, hooks).

**Why Vite over Create-React-App/Webpack**: Vite serves source as native ES modules in dev (near-instant startup and hot-module replacement) and uses Rollup for the production build. CRA is deprecated. Know this sentence: *"Vite exploits native browser ESM in development so there is no bundling step during dev; bundling happens only for production."*

### 2.2 The zero-dependency philosophy (your strongest frontend talking point)

The `package.json` has **no router library, no state library, no chart library, no CSS framework, no HTTP client library**. Everything is hand-built. This is not an accident — it is the fundamentals-first position:

| Instead of… | The project uses… | Justification |
|---|---|---|
| React Router | **Hash-based routing**: `window.location.hash` + a `PAGES` map in `App.jsx` | 13 flat pages, no nesting, no guards needed. The hash preserves deep-linking (`/#staff` opens Staffing) and survives static hosting without server rewrites. One `useState` replaces a whole dependency. |
| Redux / Zustand | **Local `useState` per page** + one `page` state lifted to `App.jsx` | Pages are independent data islands — the Dashboard's forecast and the Supply page's inventory never need to share client state. Global stores solve a sharing problem this app doesn't have. State that must survive (route, sidebar collapse) lives in the hash and `localStorage`. |
| Recharts / Chart.js / D3 | **Hand-rolled inline SVG** (`Charts.jsx`, ~770 lines: LineChart with confidence bands, Heatmap, StemPlot for ACF/PACF, BoxPlot, Donut, ScatterPlot…) | (1) Statistical charts the libraries don't offer well — confidence bands, ACF stem plots, diverging matrices. (2) Full control of the editorial "boardroom" aesthetic. (3) Smaller bundle. (4) It demonstrates you understand what a chart *is*: scales mapping data domain → pixel range. Be ready to explain a linear scale function in one line: `x = pad + (value - min) / (max - min) * innerWidth`. |
| Tailwind / MUI | **Custom design system**: `tokens.css` (fluid type/space scales via `clamp()`, the Utopia approach) + `styles.css` (CSS custom properties for palette and components) | The project *is* a UI/UX redesign — owning the design system is the point. Fluid `clamp()` scales mean typography interpolates smoothly between viewport sizes instead of jumping at breakpoints. |
| axios / React Query | **A `fetch` wrapper** (`src/api/client.js`) with rich error objects (`.status`, `.detail`) and `AbortController` cancellation | `fetch` is the platform standard; the wrapper adds exactly what's needed (JSON, error shaping, base-URL switching) and nothing more. Pages cancel in-flight requests on unmount — know why: setting state on an unmounted component wastes work and used to warn. |

**The honest trade-off to volunteer before being asked**: hand-rolled means more maintenance (a 770-line chart file), no free tooltips/animations, and hash routing gives no nested routes. At this scale the trade is favorable; at 50 pages it would not be. Saying this unprompted is what "intermediate engineer" sounds like.

### 2.3 Streaming AI consumption

**What**: `aiClient.js` POSTs to `/api/ai/chat|explain|briefing` and reads the response with `res.body.getReader()` + `TextDecoder`, appending each decoded chunk to React state (`setText(t => t + chunk)`); a blinking cursor shows liveness.

**Why plain-text chunked streaming, not SSE or WebSockets**: the data flows one way (server → client), per-request, with no need for reconnection semantics or event types — a chunked HTTP response is the simplest correct mechanism. SSE adds an event framing this UI doesn't need; WebSockets add bidirectional connection state for no benefit. `AbortController` gives cancellation. (If asked "what would make you switch to SSE?": typed events — e.g., separating "tool running" progress markers from answer text.)

### 2.4 Frontend defense gotchas (own them first)

- **The Admin page gate is a client-side code** (`hf-admin-2026`) — flagged in the code as a placeholder. Correct answer: "Authentication is out of scope for the prototype; the deployment plan (docs/cloud-deployment-plan.md) specifies Cognito-backed auth before any real data goes live. I know a client-side check is not security — it's a demo affordance."
- **Sidebar badges are hardcoded**; some Explore panels fall back to named mock constants when endpoints are absent. Framing: graceful degradation for demo resilience, clearly labelled in code.

---

## Part 3 — Backend Engineering

### 3.1 FastAPI + uvicorn (ASGI)

**What**: FastAPI app (`main.py`), served by uvicorn, 13 routers under `/api/*`, Pydantic models for request bodies.

**Why FastAPI**:
1. **Pydantic validation** — request bodies are typed classes; malformed input is rejected with a 422 before your code runs. Know the term "parse, don't validate."
2. **Automatic OpenAPI docs** at `/docs` — free interactive API documentation (also used as the Docker healthcheck).
3. **ASGI/async** — the AI endpoints hold long-lived streaming responses; an async server multiplexes them on one event loop. Know the distinction: WSGI (Flask) is one-request-per-worker synchronous; ASGI supports concurrent long-lived requests. Heavy synchronous work (the optimizers) is pushed to a threadpool (`run_in_threadpool`) so it never blocks the loop.
4. Python-native, so routers can import the science modules directly.

**Alternatives rejected**: Flask (no native async or validation), Django (batteries this project doesn't need — ORM, admin, templates — the data layer is pandas, not a relational schema).

### 3.2 Serialization and memory discipline

- **`NumpyJSONResponse`** (orjson with `OPT_SERIALIZE_NUMPY`): the registries store float32/int32 numpy dtypes; standard `json` can't serialize them. Solving it once at the response-class level beats casting in every endpoint. orjson is also several times faster than stdlib json.
- **`slim_numeric`** casts float64→float32, int64→int32 in the registries — halves memory for data that's display-precision anyway.
- A **gc middleware** collects after heavy endpoints (forecast, optimization, sweeps) — the deploy target is a 512 MB instance; explicit collection after large temporary DataFrames keeps the footprint stable.
- These three together are your "I thought about resources" story.

### 3.3 In-memory registries (know this limitation cold)

Datasets (7 schema slots) and analysis groups (G1–G4) live in **RLock-guarded in-memory registries** — no database. On startup, a background task (`bootstrap.ensure_g1`) rebuilds G1 from the private data repo.

**Why**: the working set is a handful of DataFrames; pandas *is* the query engine; a DB adds serialization overhead and schema friction during a research prototype's rapid iteration. The RLock matters because uvicorn serves concurrent requests — concurrent build/read of a registry must not interleave.

**The honest limit** (volunteer it): state dies on restart (the start scripts even remind you to rebuild G1/G3), and it doesn't scale beyond one process. The cloud plan already specifies the fix — Postgres + Parquet on S3 — and estimates it at 2–3 days. Knowing the migration path is what turns a limitation into a roadmap.

### 3.4 Security posture

- **CORS `allow_origins=["*"]`** in dev (commented "tighten in production"); in the production container CORS is moot because the SPA is same-origin.
- **Secrets in `.env`** (`ANTHROPIC_API_KEY`, fine-grained read-only `GITHUB_TOKEN`), loaded server-side; the token never reaches the browser. `.env` is gitignored.
- **TLS via the OS trust store** (`truststore`) — a deliberate fix for corporate networks that intercept TLS; know why: such networks re-sign certificates with a corporate CA that Python's bundled `certifi` doesn't trust, so you use the operating system's store instead.

---

## Part 4 — Data Engineering

### 4.1 Source schemas and the join pipeline

**What**: 7 typed source datasets — hospital-private (`daily_arrival` ~2,441 rows, `hourly_arrival` ~58,561 rows, `clinical_daily` with ~90 specialty columns, `clinical_hourly`) and public-external (engineered SA holiday `calendar`, Open-Meteo `weather_daily`/`weather_hourly`). Uploads validate **required vs expected columns** and suggest the best-fit schema on mismatch.

Four **analysis groups** built by explicit joins (`core/joins.py`), all keyed on normalized `YYYY-MM-DD` dates:
- **G1 Daily demand** = arrivals ⋈ calendar ⋈ weather (inner) → Task-1 target `total_daily_arrivals`
- **G3 Clinical daily** = clinical ⋈ calendar ⋈ weather → per-specialty forecasting
- G2/G4 hourly equivalents (left joins, hour-broadcast calendar)

**Why explicit named groups instead of ad-hoc merges**: reproducibility and auditability. Every build step (join, clean, slice) is recorded on an **Audit** object; a collision-safe merge (`_merge_no_collision`) prevents silent `_x/_y` duplicate columns — a classic pandas bug you can name.

### 4.2 Cleaning with domain awareness

Each build normalizes datetimes (timezone-stripped), drops empty columns, audits duplicate keys, and — the part to emphasize — tags **domain regimes**: three *schema eras* (register format changed at 2021-11-01 and 2023-04-01) and three *COVID regimes* (pre / during / post, cut at 2020-03-15 and 2022-03-01), plus a zero-arrival-day flag. **Why**: a forecaster trained blindly across a structural break learns a lie; tagging regimes lets EDA and modelling account for the distribution shift. This is the "I understand my data, not just my model" point.

### 4.3 Privacy by design

The chain is: identifiers are stripped before data enters the platform (the data-upload plan specifies a three-layer anonymisation gate — column allowlist, PII blocklist, free-text scan for SA ID numbers); the app carries **operational aggregates only** (counts per day/specialty), no patient-level records; the AI layer adds a further confidentiality scrubber (Part 7). Name-drop **POPIA** (SA's data-protection act) — the cloud plan even selects the af-south-1 Cape Town region for data-residency reasons.

---

## Part 5 — Data Science: Forecasting

This is the scientific heart. Expect the deepest questions here.

### 5.1 The fundamentals you must be fluent in

- **Time series** = observations ordered in time; the ordering *is* information. Standard train/test splitting would leak the future — hence **temporal splits** (train on the past, validate on the most recent 15–20%) and **backtesting** (train strictly before a cutoff, predict forward, compare with reality).
- **Stationarity**: statistical properties (mean/variance/autocorrelation) constant over time. ARIMA-family models assume it; **differencing** (`d=1`: model day-to-day changes) removes trend. The Explore page computes ADF stationarity tests and ACF/PACF plots — that's what those stem plots are.
- **Seasonality**: ED arrivals have a strong **weekly cycle** (Mondays look like Mondays). Every modeling choice downstream flows from this fact.
- **MAE** = mean absolute error, in patients — operationally interpretable. **MAPE** = mean absolute percentage error — scale-free, comparable across specialties, but **unstable near zero** (division by tiny actuals) — the app knows this and switches to interval-tightness confidence for low-volume specialties (mean < 5/day). Being able to explain *why MAPE breaks at low volume* is a differentiator.

### 5.2 The statistical engine: SARIMAX

**What the code does** (`core/forecasting.py`): grid-search ARIMA orders p,q ∈ {0,1,2} with d=1 fixed, select by **AIC**; then fit **SARIMAX(best_order)×(1,1,0,7)** — seasonal AR + seasonal differencing at period 7 (weekly). 95% prediction intervals come from the model's **analytic** `conf_int()`. Validation: hold out the last 20%, refit, report MAE/MAPE. Fallback to plain ARIMA if the seasonal fit fails.

**Why SARIMAX**: the S is seasonality (weekly, the dominant signal); ARIMA's components map to interpretable structure — AR (yesterday nudges today), I (differencing for trend), MA (shock correction). The X is exogenous-regressor support (weather/calendar) — used in the full thesis model. **Why AIC**: penalized likelihood — rewards fit, punishes parameters; guards against overfitting the order choice. **Why the fixed (1,1,0,7) seasonal order instead of a full seasonal grid**: compute budget — the app runs live on a small instance with a 30 s solver budget elsewhere; one well-motivated seasonal structure captures most of the signal at a fraction of the search cost. Own this as a deliberate engineering trade-off; the thesis-side model (in the modelling submodule) does the fuller search.

### 5.3 The ML engine: Gradient Boosting

**What the code does**: scikit-learn `GradientBoostingRegressor` (200 trees, depth 4, learning rate 0.05) on 10 engineered features: day-of-week, month, weekend flag; **lags** 1, 2, 3, 7; **rolling** 7-day mean/std and 14-day mean — *all rolling windows shifted by one day*. Last 15% is the validation split.

**Why boosting for this problem**: ~1,500 daily rows of tabular data with engineered features is exactly where tree ensembles beat deep nets — no scale, no images/sequences long enough for an LSTM to pay off, and the thesis leaderboard confirms it (XGBoost family on top; the deployed hybrid is SARIMAX+XGBoost). Boosting fits trees **sequentially on the residuals** of the ensemble so far — one sentence you must be able to say. Depth-4 trees = weak learners; low learning rate + many trees = smooth convergence, less overfitting.

**Why the shift on rolling features — the leakage story**: `roll7_mean` computed *including today* would hand the model part of its own answer at training time and be unavailable at prediction time. Shifting by one day means every feature uses only information available the morning of the prediction. If you explain one technical detail perfectly in the defense, make it this one — **data leakage** is the examiner's favorite trap and your code demonstrably avoids it.

**Why lag 7 specifically**: same weekday last week — the strongest single predictor given weekly seasonality.

### 5.4 Multi-step: recursive strategy

To forecast 7 days, the model predicts day 1, **appends its own prediction to history**, rebuilds features, predicts day 2, and so on. **Why recursive over direct** (a separate model per horizon): one model, lag features roll forward naturally, less to train and maintain. **The cost**: errors compound — which the code acknowledges by **widening the ML interval 6% per step**. Bonus fact from the knowledge base: day-7 is often *easier* than day-3 here, because day-7 lands on the same weekday — seasonality outweighs error accumulation at exactly one cycle.

### 5.5 Two kinds of uncertainty interval (a favorite question)

- SARIMAX: **analytic** intervals from the model's Gaussian error theory (`model_pi`).
- Gradient boosting has no predictive distribution, so the app uses **empirical residual quantiles**: take the validation residuals, use their 2.5th/97.5th percentiles as the band (`empirical`), widened with horizon. **Why this is honest**: it assumes nothing about the error distribution (robust to skew/fat tails), and it is calibrated on errors the model actually made. Known limit to volunteer: residuals are measured at 1-step and heuristically widened for multi-step rather than measured per-horizon.

### 5.6 Backtesting and honest accuracy

`start_date` triggers a backtest: train strictly pre-cutoff (≥30 points required, else 422), forecast forward, attach actuals. Metrics: per-day MAE/MAPE, accuracy = 100−MAPE, and **window-total error** — because daily noise partially cancels over a week, the total-over-window error is the operationally honest number for planning. Confidence tiers (High ≥75 …) are derived from backtest accuracy when available, interval tightness for low-volume series.

**The product decision to explain, not hide**: the public app deliberately **suppresses accuracy percentages** (prompt + tool layer + context builders all enforce it) and reveals real model identities and metrics only behind the Admin view. Justification: uncontextualized "88% accurate" invites both over-trust and under-trust from non-statistical users; operational users get the *likely range* per day, which is the actionable form of uncertainty; the full validation lives in the technical view and the thesis. This is a responsible-AI/UX decision — present it as one.

### 5.7 Live engines vs thesis models (do not let this ambush you)

The repo contains a modelling **git submodule** with the full research pipeline (ARIMA/pmdarima, SARIMAX, XGBoost with 23 consensus features + SHAP, ANN, LSTM, hybrids, rolling-origin CV). Its top-3 deployable artifacts exist, but the **live in-app engines are the simplified pair described above**, and the handover `POST /forecast` endpoints return 501 pending a `feature_builder.py` from the modelling repo. Framing: *"The webapp ships self-contained engines that reproduce the thesis's model classes at lower complexity, so the product works end-to-end today; the full thesis artifacts integrate behind stable interfaces (`/api/task1|task2`) already in place — the integration contract is documented in docs/ASK_TO_MSC_MODELLING.md."* That answer shows systems thinking: interfaces first, artifact swap second.

---

## Part 6 — Operations Research: From Forecast to Decisions

### 6.1 Roster optimization — integer programming

**The problem in plain words**: given next week's forecast arrivals, choose which of the 23 nurses works which of the 3 daily shifts, at minimum cost, without breaking labour law.

**Formulation** (`core/optimization_engine.py::solve_staff`, PuLP → CBC solver):
- **Decision variables**: binary `x[i,d,s]` (nurse i works shift s on day d); integer `unfilled[d,s]` — the *locum slack*; skills-mix slack; continuous `min_cov`.
- **Objective** (minimize): `10⁶·Σ unfilled − min_cov + 0.001·Σ pn_short` — a **lexicographic weighting**: first meet demand lawfully, then spread coverage evenly across shifts, then prefer a Professional Nurse per shift. Know the trick: multiplying the primary goal by a huge constant makes lower priorities tie-breakers.
- **Hard constraints**: **45 h/week cap** (BCEA §9: Σ 12h-shifts ≤ 45), one shift per nurse per day, **11 h rest** (BCEA §14: no Day shift after a Night shift — encoded as `x[i,d,Night] + x[i,d+1,Day] ≤ 1`).
- **Soft constraint via slack**: demand coverage `Σx + unfilled ≥ demand`. **Why soft**: with 23 nurses for 30 posts, a hard demand constraint would be *infeasible* — the solver would simply fail. The slack keeps the model always solvable and, priced at the 1.8× agency-locum premium, **turns the shortfall into a costed, visible quantity**. This is the system's central social claim made mathematical: unmet demand shows up as expensive locum hours, not as illegal overtime.

**Demand side**: the daily forecast splits across Day/Evening/Night (41/41/18%), gets a **κ·σ buffer** (κ = 1.65 ≈ one-sided 95%, σ = the forecast's MAE — *accuracy directly sizes the buffer*), and converts to nurses via NDoH patient-per-nurse ratios (4/5/6).

**Why exact IP and not a heuristic**: provable optimality on a small instance (23 nurses × 7 days × 3 shifts ≈ 500 binaries — trivially small for CBC's branch-and-cut within the 30 s limit), and constraints like the rest rule are natural as linear inequalities but awkward in greedy heuristics. Why PuLP/CBC: open-source, pip-installable, no license (vs Gurobi/CPLEX).

**Before/after story**: BEFORE = staff every day to the busiest day (peak padding); AFTER = forecast-matched. Payroll is identical (same nurses) — **the saving is avoided agency locum**, annualized ×52. The strategy-comparison endpoint tests 6 rostering policies (peak, mean, forecast-lawful ← recommended, forecast-with-overtime, stochastic, oracle) so the recommendation is benchmarked, with "oracle" bounding the value of a perfect forecast.

### 6.2 Inventory optimization — two-stage (s,S) with Monte-Carlo

**The (s,S) policy**: when stock drops to reorder point **s**, order up to level **S**. Textbook grounding: Simchi-Levi et al.

- **Stage 1, closed form**: `s* = D̄·L + z·σ·√L` — expected demand over lead time plus **safety stock**. z = 1.645 for a 95% service level. The critical detail: `σ = hypot(intrinsic_sd, D̄ · forecast_rel_err)` — total uncertainty combines natural demand noise **and the forecast's own error**, so *a better forecast mathematically shrinks safety stock*. That formula is the thesis's value-of-accuracy claim in one line.
- **Stage 2, simulation**: S* has no closed form under the full cost function, so the app simulates: **11 candidate S values × 800 Monte-Carlo replications × 90-day horizon**, choosing the argmin of expected total cost `C = K·1[order] + h·holding + p·stockout + w·wastage` (the four inventory costs — be able to name them cold: ordering, holding, stockout penalty, expiry wastage).
- **Common random numbers**: all candidate policies are simulated against the *same* random demand paths (fixed seed 42). Why: differences between policies then reflect the policies, not sampling luck — a **variance-reduction** technique; naming it is an instant credibility win.
- **Why Monte-Carlo at all**: demand is stochastic and costs are asymmetric and nonlinear (a stockout costs far more than a day of holding); averaging over hundreds of simulated futures estimates *expected* cost honestly where a single deterministic run would mislead.

**Benchmarking**: a 6-policy comparison (naive bulk, (s,Q) EOQ, periodic (R,S), static (s,S), forecast-driven dynamic base-stock per Li et al. 2022, oracle) under negative-binomial demand (dispersion 1.4 — **why negbin**: count data with variance > mean; Poisson would understate ED volatility) and Gamma lead times, swept across lead times to find the crossover where forecast-driven ordering stops paying.

**Known simplification to own**: the multi-policy benchmarks synthesize a forecast calibrated to the thesis's headline MAPE (12.6%) rather than wiring the live engine's residuals in — i.e., the demonstrated savings inherit the thesis's measured accuracy. Defensible ("the benchmark isolates policy structure from engine noise, using the empirically measured accuracy as the calibration point") but you must know it's there.

### 6.3 The simulations behind the Staffing/Supply pages

The descriptive numbers (coverage, BCEA breaches, stockout events) come from a pre-run **chapter-7 discrete-event simulation**: 30 random seeds, means with 95% confidence intervals, plus one **representative seed** (chosen closest to the 30-seed mean) for per-item/per-nurse detail. Why this design: CIs express run-to-run uncertainty honestly, while a representative single run gives the concrete detail tables a mean cannot. The descriptive sim *logs* 58 h weeks and BCEA breaches (the documented SA public-hospital reality); the prescriptive optimizer *forbids* them — reality vs prescription, and the gap between the two is the staffing-shortfall story.

---

## Part 7 — The AI Assistant Layer (RAG, done responsibly)

### 7.1 What it is
A **retrieval-augmented, read-only assistant** inside the app (`api/ai/`): Claude (Sonnet for the tool-using chat, Haiku for one-shot explainers — cost tiering) that must ground every number in retrieved content. Two retrieval sources: five **read-only tools** wrapping the app's own endpoints (forecast-as-shown, supply, staffing state, optimization plan) and a curated **knowledge base** of cited method cards (`knowledge.py`) with keyword retrieval. It explains; it never acts.

### 7.2 The design decisions and their justifications

| Decision | Justification |
|---|---|
| **Grounding rule**: only numbers from tool results / the `<context>` block may be stated | LLMs fabricate numbers fluently; in a hospital tool a fabricated number is a harm vector. Grounding + "say it's not available" beats confident invention. |
| **Read-only tool surface** | The assistant can never place an order or change a roster — human approval on the relevant page is mandatory. Aligns with WHO guidance on AI accountability. |
| **`get_forecast` returns the run shown on screen**, not a fresh run | The engines aren't perfectly deterministic; a fresh run would contradict the page. The assistant must agree with the user's screen — a trust requirement. |
| **Layered confidentiality**: prompt rule + regex scrubber over every output, with a 40-char streaming hold-back | Prompts alone are not guarantees. The scrubber re-scrubs accumulated text each chunk and withholds a tail so an identifier split across stream chunks can never be emitted. Defense-in-depth. |
| **Accuracy figures stripped at the tool layer** | The model cannot leak what it never sees — enforcement at the data layer, not just the instruction layer. Same pattern used to keep payroll/BCEA diagnostics out of chat answers. |
| **Prompt caching** (`cache_control` on the system+tools prefix) | The static prefix re-sends every tool round; caching serves it at ~10% price. Know the invariant: caching is a prefix match — any byte change invalidates downstream. |
| **Manual tool loop** (stream each round; force a final answer with `tool_choice: none` at the cap; mark failed fetches `is_error`) | Anthropic's own guidance favors simple explicit loops over frameworks. The forced final round guarantees the user never gets an empty reply. |
| **Governance**: durable JSONL audit of every interaction (+cost), daily budget cap enforced from the durable log, in-app admin audit view | Accountability (POPIA/WHO framing): what was asked, what was answered, by which model, at what cost — reconstructable after the fact. |
| **Offline eval suite** (16 tests): adversarial identifier leaks incl. char-by-char streaming, retrieval-quality cases, loop mechanics against a fake client | Guardrails you don't test are guardrails you hope. The evals caught a real retrieval bug ("ML" was being dropped by a length filter) — evidence they work. |

*"Why not embeddings/vector RAG?"* — 12 curated cards; keyword + title-boost + body-text scoring retrieves them reliably with zero infrastructure. Embeddings earn their complexity at hundreds of documents. Right-sizing retrieval is itself a defensible judgment.

---

## Part 8 — Engineering Process & Deployment

- **Git discipline**: meaningful commit messages describing intent (see `git log`), a data-repo split (private data fetched server-side at runtime via fine-grained read-only token — data never lives in the code repo), and a **git submodule** pinning the modelling repo at a known branch: reproducible cross-repo dependency, interfaces documented in `docs/ASK_TO_MSC_MODELLING.md`.
- **Environments**: Python venv per API (`api/.venv`), Node for the frontend; `.env` for secrets (gitignored); a planned second venv for the modelling artifacts to isolate conflicting dependencies (numpy<2 vs 2.x) — dependency isolation as a first-class concern.
- **Testing**: pytest guardrail evals for the AI layer (16 offline tests) + Playwright configured for E2E; a responsive-design audit (`RESPONSIVE_AUDIT.md`) mid-remediation. Honest framing: test coverage is concentrated where the risk is (AI guardrails), thinner elsewhere — say so before they do.
- **Deployment**: **two-stage Dockerfile** (node:20-alpine builds the Vite bundle → python:3.12-slim serves API + static SPA in one container — know why multi-stage: the final image carries no Node toolchain). `render.yaml` deploys it to Render with `/docs` as healthcheck; `MALLOC_ARENA_MAX=2` tames glibc memory arenas on small instances. The written **two-track cloud plan** (public demo vs POPIA-compliant hospital deployment on af-south-1 with Cognito, RDS, S3, CI/CD with manual prod approval) shows you know the distance between prototype and production.
- **On AI-assisted development** (if asked directly): "I used AI assistance the way the industry now does — as an accelerator inside a workflow I controlled: I specified the architecture and requirements (the handoff documents in docs/ are mine), reviewed and directed every change, and I can defend every design decision, which is what this defense demonstrates. The engineering judgment — what to build, what to reject, what the trade-offs are — is the human contribution." Then prove it by answering the next technical question well.

---

## Part 9 — The Question Bank (drill these)

**Architecture**
1. *Walk me through what happens when I click "Run forecast."* → React handler → `POST /api/forecast/run` (Pydantic-validated) → G1 series pulled from the registry → engine trains + predicts (recursive multi-step) → intervals + confidence attached → JSON (orjson/numpy-aware) → React state → SVG day cards re-render. Practice saying this in 45 seconds.
2. *Why REST and not GraphQL?* → Fixed, known query shapes per page; no over/under-fetching problem to solve; REST + OpenAPI gives free docs and simplicity.
3. *Where does state live?* → Client: page hash + local component state. Server: in-memory registries (+ known restart limitation and the Postgres/S3 migration plan). Durable: audit JSONL, simulation CSVs, the data repo.

**Forecasting**
4. *Why two engines?* → Interpretable classical baseline vs higher-capacity ML; their agreement/disagreement is itself information; the optimization `/compare` endpoint turns the accuracy gap into rands — the thesis question made operational.
5. *How do you know you're not overfitting?* → Temporal holdout (last 15–20%), backtesting against unseen periods, AIC-penalized order selection, shallow trees + low learning rate, leakage-safe features (shifted rolling windows).
6. *Why is your interval wider at day 7?* → Recursive prediction feeds predictions back as inputs; error compounds; the empirical band widens 6%/step to reflect it.
7. *What's wrong with MAPE?* → Explodes near zero actuals; hence interval-tightness confidence for low-volume specialties and window-total error for weekly planning.

**Operations research**
8. *Why is the demand constraint soft?* → 23 nurses cannot lawfully cover 30 posts' demand; hard constraint = infeasible model. The priced slack keeps it feasible AND measures the shortfall in currency — that number *is* the finding.
9. *Prove the roster is legal.* → Point to the constraint set: 45 h cap, ≤1 shift/day, night→day rest exclusion — each a linear inequality; CBC only returns solutions satisfying all of them.
10. *Why 800 Monte-Carlo reps? Why common random numbers?* → Enough for stable cost means on this horizon (and deterministic via fixed seed); CRN makes policy comparisons paired, cancelling demand-path noise (variance reduction). Concede: no CI reported on the cost estimate — a fair extension.

**AI layer**
11. *How do you stop the LLM inventing numbers?* → Grounding rule + tools returning trimmed authoritative data + "not available" instruction + suppression at the data layer (it never sees what it must not say) + audit trail to verify after the fact + adversarial evals.
12. *What if it's asked which hospital this is?* → Prompt forbids it; the regex scrubber (with streaming hold-back) rewrites any identifier that slips through; tested character-by-character in the eval suite.

**Gotchas — answer before they're asked**
13. Task-1/Task-2 handover `/forecast` = 501 → interfaces-first integration, contract documented, live engines carry the product meanwhile.
14. In-memory registries → known, documented, migration costed.
15. Client-side admin code → placeholder; real auth is in the deployment plan, not the prototype's scope.
16. Benchmark forecast synthesized at thesis MAPE → calibration choice, isolates policy effect; wiring live residuals is future work.

---

## Part 10 — Thirty-Second Glossary

**ASGI** async server interface; lets one process hold many concurrent (incl. streaming) requests · **AIC** fit-quality score penalizing parameter count · **Stationarity** stable statistical properties over time; ARIMA's assumption; achieved by differencing · **SARIMAX** seasonal ARIMA with exogenous regressors · **Gradient boosting** ensemble of shallow trees, each fit to the previous ensemble's residuals · **Data leakage** training-time access to information unavailable at prediction time (defeated here by shifting rolling features) · **Recursive multi-step** feed predictions back as inputs to reach further horizons · **Backtest** train strictly before a past date, predict forward, compare with what happened · **MAE/MAPE** absolute error in units / in percent (unstable near zero) · **Prediction interval** range that should contain the actual with stated probability (analytic for SARIMAX, empirical residual quantiles for ML) · **Integer programming** optimization with integer/binary decisions; solved by branch-and-bound (CBC) · **Slack variable** softens a constraint; its cost prices the violation · **(s,S) policy** reorder at s, order up to S · **Safety stock** `z·σ·√L` buffer against demand uncertainty during lead time · **Monte-Carlo** estimate expectations by averaging many simulated random futures · **Common random numbers** compare policies on identical random paths (variance reduction) · **Negative binomial** count distribution with variance > mean (overdispersed ED demand) · **RAG** retrieval-augmented generation: fetch authoritative content, answer only from it · **Prompt caching** reuse of an unchanged prompt prefix at ~10% cost · **POPIA / BCEA** SA data-protection act / labour law (45 h week, 11 h rest — the roster's hard constraints).

---

*Final advice: in every answer, give the decision, the reason, the rejected alternative, and the limit — in that order. That four-beat pattern, applied consistently, is what examiners score as mastery.*
