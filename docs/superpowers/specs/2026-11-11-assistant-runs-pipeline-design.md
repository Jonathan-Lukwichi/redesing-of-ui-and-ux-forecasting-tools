# The analyst assistant runs the pipeline — design

Date: 2026-11-11. Status: draft for Jonathan's approval.

## Intent

Jonathan demos HealthForecast AI live. He wants the demo to flow as a
conversation: he types to the analyst assistant ("please run the analysis"),
and the assistant checks the data, asks what he wants, runs the right pipeline
steps, says how long each will take, switches the screen to the page with the
results, and gives a short plain summary. Every step of the pipeline must be
runnable from the chat. The assistant advises; the user decides.

Today the assistant is read-only by construction (CLAUDE.md, "AI governance").
This design deliberately changes that rule: the assistant may now *start
computations* on the user's behalf, but it still cannot *decide* anything.

## What a session looks like (Jonathan's description)

1. User: "please run the analysis".
2. The assistant checks the data: is everything uploaded? If something is
   missing it names the exact file and points to the Data Hub (it cannot
   upload files itself; a browser only lets a person pick files).
3. If the data is complete, it asks which analysis the user wants: patient
   arrivals, staff, or supply.
4. The user can also ask it to run the prediction, the optimization and the
   recommendations, or the whole pipeline.
5. Before each step it gives a time estimate; while it runs it shows
   progress; when it finishes it switches the screen to the results page and
   gives a brief summary of the results.

## Goals

- Every pipeline step can be started from the chat: data check, transform +
  consolidate (data preparation), the descriptive analysis (patient arrivals,
  staff, supply), the forecast (total ED and specialties), the optimization
  (roster + supply plan), the recommendations, and the full pipeline in one go,
  including the sample-data run.
- The assistant checks readiness first (which files are present, what is
  missing) using the same preflight the Data Hub uses.
- It asks which analysis area when the user's request is ambiguous ("run the
  analysis").
- Time estimate before each run, from real timings; live progress during it.
- When a run finishes: the screen switches to the results page, and the
  assistant posts a brief summary built only from computed results.
- Suggestions grounded in results ("the evidence favours (s,Q) because …"),
  never guessed, never invented. If a result doesn't exist yet, it says so and
  offers to run the step that produces it.

## Non-goals

- The assistant never makes decisions. It never adopts a reorder-policy family
  (`PUT /api/optimization/policy`), never approves a roster, never accepts,
  dismisses or closes an Action Center recommendation, never clears or
  replaces data, never changes settings. For those it says which page and
  which button the user should press. (Jonathan: "the final decision will
  remain in the hand of the user.")
- It does not upload files.
- No new analytics, models or optimizers — it drives the existing engines.
- No public (signed-out) running of steps — see Access.

## Anti-goals (would make it a failure even if it works)

- The assistant stating a number that no computed result contains, or
  describing a result before the step that produces it has finished.
- An action the user didn't ask for, or one started without the user's yes.
- A page or the assistant triggering its own private recompute of something
  already shown on screen (breaks the `/last` materialization rule).
- Accuracy percentages / MAPE in the public app (still forbidden).
- Calling the data "simulated" in its own words (2026-11-11 rule stays); it
  answers honestly only if asked directly.

## Access (Jonathan: "for people who sign in")

- Running a step requires a signed-in user with the same scope the equivalent
  button needs (`data:write` for pipeline runs; the scopes the forecast and
  optimization Run buttons already require for those). The server enforces
  this; the assistant's prompt is not the gate.
- Signed-out visitors can still chat and ask questions; when they ask it to
  run something, it says they need to sign in.
- In open auth mode (the local demo, `AUTH_MODE=open`), everyone has those
  scopes, so Jonathan can run everything locally.
- The existing rules still hold: one pipeline run at a time (409 otherwise),
  the Busy/idle guard, the readiness guard, the sample run's protection of
  uploaded data, the AI daily budget cap, rate limits.

## Behaviour (decided with Jonathan unless marked as my call)

- **Decisions stay with the user** (Jonathan). Runs and suggests only.
- **Signed-in only** (Jonathan).
- **The assistant switches the page** when a step finishes (Jonathan): e.g.
  Explore after the arrivals analysis, Staffing after the staff analysis,
  Supply after the supply analysis, Total ED after the forecast, Optimization
  after the optimization, Action Center after the recommendations, Data Hub
  for missing files. The chat stays open across the page switch.
- **Confirm before running** (my call): the assistant states what it will run
  and the estimate, then waits for the user's yes. A one-click "Run" button on
  that chat message is the yes; typing "yes" also works. Nothing starts
  without it.
- **Estimates from real timings** (my call): each step's estimate comes from
  how long that stage actually took on this server (the stage `seconds` the
  job already records, kept per stage), scaled by how much data is loaded
  (e.g. number of months, items); on a fresh server, sensible defaults taken
  from the measured runs in this project (forecast ~15–25 s, optimise ~5–7 s,
  recommend ~15–35 s, full pipeline ~1 min on the pure tables, longer with
  many registers). Never invented on the fly by the model: the estimate is a
  number the server returns, and the assistant quotes it.
- **Live progress** (my call): while a run is going, the chat shows the
  current step and the remaining estimate, updated by polling the existing
  status endpoint.
- **Prerequisites** (my call): if a step needs an earlier one (optimization
  needs a forecast; recommendations need the optimization; everything needs
  the data check and consolidation), the assistant says so and offers to run
  them together, with the combined estimate, in one confirmation.
- **Summary at the end** (my call on format): 3–5 plain sentences built from
  the finished step's `/last` result, ending with the decision that is the
  user's to make, if any (e.g. "To adopt (s,Q), open Optimization and press
  Adopt").
- **Failures** (my call): a failed step is explained in plain words with what
  to do (e.g. a missing or wrongly named file), using the stage's existing
  plain receipt, never a stack trace.
- **Audit** (unchanged rule, extended): every action the assistant proposes,
  every confirmation, every run it starts and its outcome are recorded in the
  AI audit log against the user.

## Pages unlock step by step (Jonathan, 2026-11-11)

Results readiness becomes per step instead of one switch for the whole app.
Each page unlocks when the step that produces its result has finished:

| Step finished | Pages that unlock |
|---|---|
| Analysis: patient arrivals | Explore |
| Analysis: staff | Staffing |
| Analysis: supply | Supply |
| Prediction (forecast) | Total ED, By specialty, and the Dashboard's forecast |
| Optimization | Optimization |
| Recommendations | Action Center |

Until then each page keeps showing the existing "No results yet" card. The
Dashboard shows whatever parts are ready. The full pipeline (Data Hub "Run full pipeline" or
the sample run) still runs every step and so unlocks every page. The server
guard, the shell's badges and header note, `ResultsGate`, and the assistant's
"no data yet" replies all read the same per-step readiness. A step's
readiness is cleared when that step re-runs or its inputs change, and a
restart clears everything (RAM-only data, as today).

## Settled after the builder check (my calls)

- **Code path.** Chat-started steps run the pipeline's own stage functions
  (`api/core/pipeline/stages.py`) through the job, so they are tracked in
  `/api/pipeline/status`, timed, one-at-a-time, and write the same `/last`
  results. They use the pipeline's settings (best ML model, 7-day horizon,
  standing policy family). Custom options (horizon, statistical model, service
  level) stay on the pages' own Run buttons, which are unchanged.
- **Who may run.** A signed-in user holding `data:write` (in practice the
  admin; in open auth mode, everyone). One rule for every chat-started step,
  including the sample run. Signed-out visitors get "sign in to run steps".
- **Sample data from the chat.** Only on an empty server or one already
  holding sample data. If uploaded hospital data or its results exist, the
  assistant does not replace them; it points to the Data Hub button.
  (`replace=true` is never reachable from an assistant action.)
- **Re-running a step.** A step re-runs everything after it that depends on
  it, in the same confirmed run (e.g. forecast → optimise → recommend), with
  the combined estimate, so no page shows a result that no longer matches.
  Data preparation (check, transform, operations, consolidate) re-runs only
  when the data changed since it last ran.

## Architecture constraints (from CLAUDE.md, still binding)

- Thin routers, fat core: action logic lives in `api/core` (e.g. a new
  `api/core/pipeline/` capability to run a subset of stages), routers only
  validate and serialize.
- `/last` materialization: every run the assistant starts goes through the
  same job / engines the buttons use and writes the same `/last` results the
  pages read. Summaries read those `/last` results. No private recompute.
- Plan C: nothing heavy on page load. The page switch after a run only opens
  the page; the page shows the already-materialized result (it must not
  trigger a new run).
- Same-origin clients; 512 MB memory budget; RAM-only hospital data.
- Standing-policy pattern: the optimization runs within the adopted family;
  the assistant can report what the evidence recommends but cannot adopt.

## What exists today (for the builder)

- `api/core/pipeline/job.py`: one background thread runs all of
  `stages.STAGES` (check, transform, operations, consolidate, analyse,
  forecast, optimise, recommend) in order; `start(source, prepare)`,
  `status()`, `Busy`. There is no way yet to run a subset of stages.
- `api/core/pipeline/preflight.py`: what's present/missing (Data Hub uses it).
- `api/core/pipeline/sample.py` + `POST /api/pipeline/sample`.
- Forecast and optimization also have their own Run endpoints used by the
  pages (task1/task2/forecast, optimization routers) that write `/last`.
- `api/ai/chat.py`: tool loop (`stream_chat`, `_MAX_TOOL_ROUNDS = 4`),
  read-only tools in `api/ai/tools.py` (`get_forecast`, `get_supply_status`,
  `get_staff_status`, `get_optimization`, `get_explore_findings`,
  `lookup_knowledge`), which call the app's own API at `SELF_BASE_URL` or
  `127.0.0.1:$PORT` (locally the backend must be started with `PORT` set to
  its real port).
- Chat UI: `src/components/AskChat.jsx`, `src/components/AiPanel.jsx`,
  `src/api/aiClient.js`; hash navigation in `src/App.jsx`.
- Models: `claude-sonnet-4-6` (reasoning) / `claude-haiku-4-5` (fast), from
  `api/ai/config.py`; Gemini fallback.

## Left to the builder

- How a subset of stages runs (a stage plan passed to the job, or step
  runners in core that reuse the stage functions), as long as it is the same
  code the full pipeline runs, one-at-a-time, and writes the same results.
- How the "analysis" step splits into patient arrivals (Explore findings /
  analyse stage), staff and supply (their descriptive overviews), given that
  the analyse stage runs all analyzers at once today.
- The shape of action tools (e.g. `check_data`, `estimate`, `run_steps`) and
  of the confirmation round-trip between chat and server (the server must not
  run anything on the model's say-so alone: the user's confirmation reaches
  the server explicitly).
- How the chat learns that a run finished and posts the summary (polling from
  the panel, then a follow-up assistant turn grounded in `/last`).
- How the page switch is signalled (e.g. the chat emits a navigation event
  the app shell handles via the hash router).
- Updating CLAUDE.md's "AI governance" rule and the relevant knowledge card to
  the new rule: the assistant can start computations for signed-in users with
  the right scope, after the user's confirmation; it never makes decisions.
- Tests: backend tests for scope enforcement, confirmation required,
  one-at-a-time, no decision endpoints reachable from assistant actions,
  estimates returned by the server; Playwright for the chat confirm button,
  progress and page switch; keep the responsive suite and Plan C rules green.
