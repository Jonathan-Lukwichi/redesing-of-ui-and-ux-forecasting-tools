# HealthForecast AI — project status and next steps

**Last updated:** 26 September 2026
**Branch:** `claude/relaxed-brown-4cn9tb` (merged to `main`)
**Head commit at time of writing:** `cc61f58`
**Live site:** https://healthforecast.jlwanalytics.com (Render, auto-deploys `main`)

This file is the handover record for the commercial-readiness work carried out on
the platform. It exists so that neither Jonathan nor any future session has to
reconstruct what changed, why it changed, what was verified, and what is still
outstanding. Read it together with `docs/PRODUCT-READINESS-AUDIT.md`, which holds
the underlying evidence and the reasoning behind each finding.

---

## 1. Where the project stands

Ten commits were added on top of `cb96330`. They fall into four groups:
truthfulness of the numbers the app publishes, access control, persistence, and
the visual/accessibility layer. The work was driven by an audit against
healthcare and industrial-engineering software practice, recorded in
`docs/PRODUCT-READINESS-AUDIT.md`.

### Verification state

| Suite | Count | Command | Status |
|---|---|---|---|
| Backend (pytest) | 234 passed, 1 skipped | `cd api && .venv/bin/python -m pytest -q` | green (135s) |
| Responsive layout (Playwright) | 165 assertions, 8 viewports | `npx playwright test` | green |
| Visual regression | 78 baselines (13 routes x 3 viewports x 2 themes) | `VISUAL=1 npx playwright test --project=visual` | stable |
| Frontend build | — | `npm run build` | passes |
| Backend import + memory | 175MB of the 512MB budget | `cd api && .venv/bin/python -c "import main"` | passes |

The backend suite grew from 16 tests to 234. That is the single most important
number in this document: before this work, almost nothing in the optimisation or
forecasting path had a test asserting it produced a correct answer.

Two caveats on the suites:

- Visual baselines are **machine-specific** (font rendering, GPU). They are a
  separate Playwright project and are deliberately opt-in so they can never fail
  someone else's CI. If Jonathan runs them on his Windows machine for the first
  time, every baseline will differ; regenerate with `--update-snapshots` on that
  machine and commit those as his own baselines, or leave them alone and rely on
  the responsive suite.
- The visual suite masks `<video>` and `<canvas>` (`mask: [page.locator('video'),
  page.locator('canvas')]`). The landing hero contains a video and an animated
  canvas fallback whose frame timing is not deterministic. **The video is not
  removed and must not be removed** — masking is how the screenshots stay stable
  while the video stays on the page.

---

## 2. What each commit changed

### `d87358f` — Add product readiness audit
`docs/PRODUCT-READINESS-AUDIT.md`, 720 lines. Section 8 is an addendum recording
four places where the audit's own first findings were wrong and were corrected
after testing. That addendum is not decoration: it is the record of which claims
survived verification.

### `ceaee54` — Make the roster cost-minimal and re-baseline savings
Two defects, both of which made the app publish a number it had not earned.

**The rostering objective contained no cost term at all.** It minimised unfilled
demand and skills shortfall and maximised the worst-covered slot, then stopped.
Any roster that covered demand was as good as any other, so CBC returned
whichever feasible roster it happened to reach first. The app then reported the
payroll of that arbitrary roster as an optimised cost. Replaced with a normalised
lexicographic objective:

```python
prob += (1e6 * (unfilled_expr / total_demand)
         + 1e4 * (lpSum(pn_short.values()) / n_slots)
         - 1e2 * min_cov
         + 1e1 * (over_budget / cost_scale)
         + 1e0 * (payroll_expr / cost_scale))
```

Priority order: coverage, then skills mix, then balance, then budget, then cost.
**Clinical safety sits deliberately above budget.** Each term is divided by its
own scale so the weights express priority rather than accidentally reflecting
unit magnitudes.

**The `weekly_budget_zar` parameter was accepted by the API and never used.** It
is now a soft constraint with an explicit penalty variable, so an infeasible
budget produces a costed overrun rather than an infeasible solve:

```python
if weekly_budget_zar is not None and float(weekly_budget_zar) > 0:
    prob += (payroll_expr + locum_shift_cost * unfilled_expr
             <= float(weekly_budget_zar) + over_budget)
else:
    prob += over_budget == 0
```

**Savings were measured against a strawman.** Added `_staff_current_practice()`,
which reconstructs the hospital's actual observed practice over
`OBSERVED_PERIOD_DAYS = 396.0` within a comparable demand band
(`_COMPARABLE_DEMAND_BAND = (0.85, 1.18)`), and reports paired savings across
`REPORT_SEEDS` (10 seeds) with a 95% interval. Results carry a `cost_basis` tag
of `"realised"` or `"synthetic"` so a reader always knows which they are looking
at.

### `ac7831e` — Add rolling-origin backtesting and feed its error to the optimiser
`api/core/validation.py`. The app reported accuracy from a single hold-out split
at an unstated horizon, which tells you nothing about how the forecast performs
at the horizon the roster is actually built for. The new evaluator walks forward
over folds and reports `mae`, `mase`, `seasonal_naive_mae`,
`beats_seasonal_naive`, `pi_coverage_pct` and `per_step`.

Two design notes worth keeping:
- `horizon_mae` is the **window mean**, not the last step. Per-step buckets hold
  one observation per fold, which is far too noisy to report.
- MASE against a seasonal-naive benchmark is reported honestly. On a clean weekly
  cycle the ML engine currently **loses** to seasonal-naive (MASE 1.01–1.41).
  That is a real result, and the tests assert it rather than asserting a flattering
  one. See §6 for what to do about it.

### `3e096af` — Replace the asserted reliability badge with a derived one
The UI displayed "Validated & reliable" as a hardcoded string. It is now derived
from the backtest (`src/components/ForecastTrust.jsx`), with the maths tested.
If the model does not beat the benchmark, the badge says so.

### `6641f00` — Add real authentication, close an unauthenticated file read, persist decisions
Three separate problems.

**There was no authentication.** `src/pages/Admin.jsx` compared a hardcoded
string (`hf-admin-2026`) in the browser. That constant shipped inside the public
JavaScript bundle; anyone could read it, or skip it entirely by setting the React
state. Behind it sat model identities, accuracy figures and the AI audit log.
CORS was `["*"]`. `POST /api/reports/email` accepted an arbitrary recipient and
an arbitrary PDF attachment, making it an open mail relay attached to the
deployment's own sending reputation. Now: scrypt password hashing
(n=2^15, r=8, p=1, explicit `maxmem`), HMAC-SHA256 signed stateless session
tokens, HttpOnly/SameSite=Strict/Secure cookies, no default account and no
default password. `api/core/auth.py` and `api/core/security.py`.

**The SPA fallback was an unauthenticated arbitrary file read.** Reproduced
before fixing: `GET //etc/passwd` returned `root:x:0:0...`. Fixed by resolving
the candidate path and containing it:

```python
_STATIC_ROOT = _STATIC_DIR.resolve()
candidate = (_STATIC_ROOT / full_path.lstrip("/")).resolve()
if candidate.is_relative_to(_STATIC_ROOT) and candidate.is_file():
```

**The Action Center was ephemeral.** Approvals lived in browser state and
vanished on refresh, so nothing could be audited. Now `api/core/action_store.py`
(SQLite) with `api/routers/action_items.py`. `decided_by` is taken from the
session, never from the request body, and `action_key` is recomputed server-side
so a client cannot decide an action it invented.

Also deleted here: `api/core/optimization.py` (a duplicate engine),
`api/routers/actions.py` and `api/routers/kpis.py` (dead routers).

### `3c21e11` — Make roles territory rather than rank
The first role model was a ladder (viewer → planner → admin). Jonathan corrected
the design: a stock manager is not a junior director, and a staff manager should
not see the pharmacy's plan. Roles became **territory, not rank**. See §3.

### `f1c262a` — Add a visual regression safety net
`tests/visual.spec.js`, written and its baselines captured **before** any styling
change, so the styling work could be proven pixel-identical rather than assumed
to be. Threshold is an absolute `maxDiffPixels: 120`; an earlier
`maxDiffPixelRatio: 0.002` was tested with a deliberate canary and let 37 of 39
changed screenshots through, which makes it worse than no net at all.

### `8017574` — Move the colour layer onto tokens, pixel for pixel
Nine duplicated `const C = {...}` palettes across page components were replaced
by one `src/styles/palette.js` whose values are all `var(--token)`. 716 colour
literals moved. Verified pixel-identical against the baselines from `f1c262a`.

### `7c7eedb` — Add a dark theme for the night shift, and fix an invisible icon
Full dark theme in `src/styles.css`, declared under two selectors so the OS
preference and an explicit toggle both work:
`@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and
`:root[data-theme="dark"]`. `src/components/ThemeToggle.jsx`.

The icon fix is a mistake worth recording: a new `alert` icon name did not exist
in the icon map, so the component rendered `<path d={undefined}>` — an invisible
element, no console error. Added sun/moon/alert and a
`ICONS[name] || ICONS.bell` fallback so a future typo degrades visibly instead of
silently.

### `cc61f58` — Make an unconfigured deployment safe, and run the accessibility pass
See §4 for the unconfigured-deployment posture.

Accessibility: contrast failures went from 7 of 9 passing to 9 of 9.
`--text-4: #6c7787` (was `#94a3b8`, 2.56:1 → 4.54:1) and `--warning: #b36204`
(was `#d97706`, 3.19:1 → 4.50:1), with `--c3` matched. Added `describeSeries()`
and `chartA11y()` in `src/components/Charts.jsx` and applied them to 11 chart
components, so each SVG carries `role="img"` and a text description of its own
series rather than being invisible to a screen reader. Also
`prefers-reduced-motion` handling and `:where()`-based focus rules.

---

## 3. The role model (territory, not rank)

Defined in `api/core/auth.py`. A route asks for a **scope**; a role is a set of
scopes. There is no ordering between roles.

| Role | Sees | Can act on | Deliberately excluded |
|---|---|---|---|
| `admin` | everything | everything | — |
| `director` | every page, every operational number, all alerts | decide actions, send reports, run backtests | accuracy figures, model identities, the AI audit log |
| `staff_manager` | forecasts, staffing | run the staff optimisation, decide staff + capacity actions | anything in supply |
| `stock_manager` | forecasts, supply | run the supply optimisation, set the standing policy, decide supply + capacity actions | anything in staffing |
| `viewer` | all read-only pages | nothing | all write scopes |
| `planner` | legacy middle rung of the old ladder | kept so existing `AUTH_USERS` entries keep working | admin |

Three points that were explicit design decisions, not accidents:

1. **The director does not see accuracy figures.** The governance rule in
   `CLAUDE.md` is that the public app never states accuracy percentages or MAPE —
   that is admin-only. A director is a front-line user of the app, so the rule
   applies to them. Model identities and the AI audit log stay with `admin` for
   the same reason.
2. **The AI assistant is available to every role**, per Jonathan's instruction
   that it "must appear in all the part to assist users with explanation and
   guidance". It is scope-aware: it will not read a page the signed-in user
   cannot see, which closed a side-door where the assistant could narrate data
   the UI had hidden.
3. **`capacity` actions are visible to both managers.** A surge in arrivals
   affects staffing and supply simultaneously, so `ROLE_ACTION_CATEGORIES` gives
   `capacity` to both. Nothing else crosses the territory line.

The `analyst` role was folded into `admin` rather than kept separate: it owned
the data pipeline, and `data:write` is the scope that mutates server state.

---

## 4. The unconfigured-deployment posture

The site must keep working as a public demonstration when no accounts have been
configured, but it must not hand an anonymous visitor real authority. When
`AUTH_USERS` is unset, `UNCONFIGURED_SCOPES` is granted to anonymous requests:

**Open when unconfigured:** `forecast:read`, `forecast:validate`, `data:read`,
`staff:read`, `supply:read`, `staff:plan`, `supply:plan`, `actions:read`,
`assistant` — reads, plus the two planning runs, which are compute-only and
write nothing durable.

**Closed even when unconfigured:**
- `reports:send` — sends real email from a verified domain.
- `admin` — the AI audit log, model identities, the user list.
- `data:write` — uploads and pipeline builds mutate server state and are an easy
  resource-exhaustion vector on a 512MB instance.

The moment `AUTH_USERS` is set, this stops applying entirely and every route goes
back to asking the signed-in user's role. This is enforced at a single middleware
choke point in `api/main.py`, not per-route, so a new route cannot forget it.

### Deploy runbook

To turn on real sign-in, set these in the Render dashboard:

```bash
# 1. Generate a hash for each user's password (reads the password from stdin)
cd api && .venv/bin/python -m core.auth hash

# 2. AUTH_USERS — semicolon-separated username:role:scrypt_hash entries
AUTH_USERS="jonathan:admin:<hash>;matron:staff_manager:<hash>;pharmacy:stock_manager:<hash>"

# 3. AUTH_SECRET — signs the session tokens. If unset, a random secret is
#    generated per process: safe, but every restart logs everyone out.
AUTH_SECRET="<64+ random characters>"

# 4. Only if Render terminates TLS ahead of the app (it does)
TRUST_PROXY=1
```

`TRUST_PROXY` matters for rate limiting: `_client_key()` honours
`X-Forwarded-For` only when it is set, because trusting that header
unconditionally lets any caller forge their own rate-limit bucket.

---

## 5. Open problem: the Render deploy failure

Commit `cc61f58` failed to build on Render. The previous deploy remains live, so
**the site is up** — it is serving older code.

Everything reproducible in this sandbox passes:

- `npm ci` — clean
- Vite build in an isolated, Docker-like context — clean
- `import main` — clean, 175MB resident
- Server start and `GET /health` — 200
- Submodule `api/external/msc-modelling`, branch
  `claude/review-dissertation-repos-UQtqT` — exists and is reachable

Docker itself could not be tested: the CLI is present in the sandbox but there is
no daemon, so the container build is the one stage that was never reproduced
locally. That makes it the prime suspect.

**Leading hypothesis: unpinned dependencies plus a Python version mismatch.**
`api/requirements.txt` has 18 entries, and every one uses `>=`. Each Render build
therefore resolves the newest release of all 18, so a build that worked yesterday
can fail today with no repository change. The Dockerfile uses
`python:3.12-slim`; local development runs 3.11.15, so the resolved wheel set is
not the one that was tested. There is already one scar from this class of
problem in the file: `supabase` is commented out because a transitive
`pyiceberg` dependency failed to build on Python 3.14.

A related signal from the test run: PuLP now emits
`PULP_CBC_CMD is deprecated and will be removed in PuLP 4.0`. `api/core/
optimization_engine.py:304` calls `PULP_CBC_CMD(msg=0, timeLimit=30)`, and
`pulp>=2.7` will happily resolve to 4.x the day it ships. That is a future
hard failure sitting in the requirements file today.

**Next step when the Render build log is available:** read the log first rather
than guessing. If it is a dependency resolution or wheel-build error, the fix is
to pin the full resolved set. Suggested method, run against Python 3.12 to match
the image:

```bash
# produces an exact, reproducible set
pip install pip-tools
pip-compile api/requirements.txt -o api/requirements.lock
# then point the Dockerfile at requirements.lock
```

Pin `pulp` to `>=2.7,<3` explicitly regardless, and either move the Dockerfile to
`python:3.11-slim` to match the tested environment or move local development to
3.12 to match the image. Do not leave them different.

---

## 6. What still needs doing

### Blocking the deploy
1. **Diagnose and fix the `cc61f58` build failure** (§5). Nothing else in this
   list reaches users until this is resolved.
2. **Pin the 18 unpinned dependencies** and reconcile the Python version. This is
   both the likely fix and the way to stop the problem recurring.

### Two design questions that need Jonathan's decision
These are genuine trade-offs, not bugs, so they were left open rather than
decided unilaterally:

1. **`POST /api/forecast/run` is unauthenticated but writes shared `_LAST_RUN`
   state.** Under the `/last` materialisation pattern, every consumer — pages and
   AI tools alike — reads that one cached result. So an anonymous visitor can
   change what a signed-in director sees on screen. Options: (a) leave it, and
   accept that the demo is shared; (b) require `forecast:read` for the run while
   keeping the read of `/last` open; (c) keep a per-session cache. Option (b) is
   the recommendation.
2. **`/api/forecast/engines` serves `accuracy_pct` anonymously.** This directly
   contradicts the governance rule that the public app never states accuracy
   figures. Either the field is removed from the anonymous response and served
   only under the `admin` scope, or the rule needs amending. The rule as written
   says remove it.

### Engineering work, in priority order

**High — correctness of published numbers**
- **Collapse the two supply engines.** `reorder_supply`
  (`optimization_engine.py:501`) and `run_supply_policy` (`:1453`) coexist with
  cost bases that differ by a factor of 52, because one is weekly and the other
  annual. Any reader comparing the two pages sees numbers that cannot both be
  right. One engine, one basis.
- **Give the live planner a realistic demand model.** `reorder_supply` still uses
  `rng.normal` (`:582`) and a deterministic lead time. Hospital consumption is
  count data and often intermittent; lead times in SA public procurement are
  variable and that variability is most of the stockout risk. Move to a negative
  binomial demand with a variable lead time. The evidence ladder already does the
  more careful thing, so the planner is currently the weaker of the two.
- **Address the seasonal-naive result.** The ML engine loses to seasonal-naive on
  a clean weekly cycle (MASE 1.01–1.41). Either improve the model until it wins,
  or state plainly in the app and the dissertation that the benchmark wins on
  this data and explain why the ML path is still worth having (for example that
  it handles holidays and level shifts the naive model cannot). Reporting the
  MASE honestly, as now, is the minimum; leaving it unexplained is not enough.
- **Add significance testing to Explore findings**, with a multiple-comparison
  correction. The pipeline currently surfaces every difference it finds, so with
  enough analysers some findings are noise by construction.
- **Reframe the Explore `mechanism` field as an untested hypothesis.** It
  currently reads as an established causal explanation. It is not one.

**Medium — product**
- **Per-day driver attribution on the forecast.** A manager asked to trust a
  number wants to know why Tuesday is high.
- **Manual forecast override, with forecast-value-added tracking.** Planners will
  override; the honest design records the override and measures whether it
  helped.
- **Scenario save and compare.** Currently every run destroys the previous one.

**Low — cleanliness**
- **~376 hardcoded colour literals remain** in `src/**/*.jsx`. The largest
  clusters are `#475569` (34 uses) and `#cbd5e1` (34), which are semantic
  (muted body text and hairline borders respectively) and deserve named tokens
  rather than a mechanical substitution.
- **Merge the forecast pages.** `src/pages/Task1Forecast.jsx` (40KB) and
  `Task2Forecast.jsx` (39KB) duplicate 14 identically-named components across
  roughly 1,750 lines. Any fix has to be made twice, and eventually will not be.
- The stale module docstring in `api/core/auth.py` — which still described the
  ordered-role ladder that commit `3c21e11` replaced — was corrected in the same
  commit as this file. Noted here because the lesson generalises: when the shape
  of a model changes, the prose above it is part of the change.

### Two things needed from Jonathan
1. **Allow `healthforecast.jlwanalytics.com` through the sandbox Network access
   settings** if a future session should verify the live site directly. The egress
   proxy currently blocks it, so every claim about production has to be inferred
   rather than observed.
2. **Set `AUTH_USERS` and `AUTH_SECRET` in Render** when real sign-in is wanted
   (§4). The site works without them, in demo posture.

---

## 7. Rules that governed this work and must stay in force

From `CLAUDE.md`, restated here because they are easy to lose across sessions:

- Commits carry **only Jonathan's name**. No `Co-Authored-By` trailer.
- A second working copy pushes to the same remote. **Always `git fetch` /
  `git pull --rebase` before pushing**, and expect the remote to be ahead. When
  resolving a conflict, judge which side is newer.
- Never commit secrets. `api/.env` is gitignored and machine-local by design.
- Hospital CSVs live in a private repo, fetched with a read-only PAT, **held in
  RAM only, never written to disk**.
- Memory budget is **512MB**. Registries store numerics as float32/int32; no
  unbounded caches, no duplicate DataFrames. If OOM recurs, the agreed path is a
  Railway migration, not code heroics.
- **The public app never states accuracy percentages or MAPE.** Admin view only.
- Thin routers, fat core. New endpoints validate and serialise; logic goes in
  `api/core`.
- Nothing heavy fires on page load. Results appear only after a Run button.
- The `/last` materialisation pattern: one cached run, every consumer reads it.
  Never let a page or the AI trigger its own private recompute of something
  already on screen.
- Definition of done: build passes, tests pass, **verified against the running
  app rather than assumed**, committed with a plain message, pushed.
