# HealthForecast AI — Product Readiness Audit

**Date:** 22 September 2026
**Scope:** optimisation engine, forecasting engine, Explore pipeline, UI/UX and design system
**Question asked:** is this a real commercial product — intuitive, premium, professional — judged
against the standards healthcare and industrial-engineering software is actually held to?

**Short answer.** The engineering underneath is genuinely strong and in several places better than
commercial products in this space. The product wrapped around it is not shippable yet. Four things
block it: there is no authentication, the headline accuracy number describes a different forecast
from the one displayed, the savings figures are measured against strawman baselines, and the design
system exists but is bypassed in 969 places. None of these is hard to fix. All of them are fatal in
a hospital procurement review.

---

## 0. Scorecard

| Area | Now | Ceiling with the fixes below |
|---|---|---|
| Optimisation engine — modelling | Good | Excellent |
| Optimisation engine — honesty of claims | **Poor** | Excellent |
| Forecasting — engineering | Good | Excellent |
| Forecasting — validation method | **Poor** | Good |
| Explore pipeline — architecture | **Excellent** | Excellent |
| Explore pipeline — statistical rigour | Adequate | Good |
| UI — information architecture | Adequate | Excellent |
| UI — visual system consistency | **Poor** | Excellent |
| UI — accessibility | **Poor** | Good |
| Security / tenancy / auth | **Absent** | Good |
| Test coverage of the maths | **Absent** | Good |

Anything marked **bold** is a commercial blocker, not a nice-to-have.

---

## 1. Optimisation engine

`api/core/optimization_engine.py` (1,401 lines), `api/core/optimization.py` (560 lines),
`api/routers/optimization.py`

### What is genuinely good

The lawfulness modelling is the best part of this codebase. The 45-hour BCEA cap is a **hard**
constraint and the 11-hour rest rule is encoded as a real precedence constraint
(`x[i,d,Night] + x[i,d+1,Day] <= 1`, line 187). Demand coverage is softened with a priced integer
slack rather than left to become infeasible, so the model always returns an answer and the answer
names the lawful shortfall instead of hiding it. The `min_cov` balance variable is a thoughtful
touch — a pure min-cost LP goes to a lop-sided corner solution and this prevents that. Most
commercial rostering tools solve for cost and let compliance be a post-hoc report; this does it the
right way round.

The evidence ladder (`_simulate_item_policy`, line 731 onward) is research-grade: negative-binomial
demand, gamma-distributed lead times, a synthesised forecast whose error grows as √h, common random
numbers across policy arms, and an oracle arm kept deliberately out of every user-facing surface.
That is more careful than most vendor benchmarks.

### BLOCKER 1 — The roster is not cost-minimal, but everything says it is

The objective function (line 160) is:

```
BIG * Σ unfilled  −  min_cov  +  Σ 0.001 · pn_short
```

There is **no cost term**. `shift_cost` is computed at line 129 and then used only once, at line 233,
to *report* the payroll of whatever roster CBC happened to return. Among all rosters that achieve the
same coverage, the solver has no reason to prefer the cheaper one, so the reported payroll is an
arbitrary artefact of the solver's branching order.

Meanwhile the docstring says "cost-minimal LAWFUL nurse roster" (line 7), the AI assistant tells
users the button "solves a cost-minimal LAWFUL nurse roster" (`api/ai/chat.py`, APP_GUIDE), the
Action Center prompt repeats it, and the defence course repeats it again.

**Fix:** add the real cost term as a secondary lexicographic objective:
`BIG·Σunfilled − W·min_cov + Σ shift_cost[i]·x[i,d,s]` with `W` sized so coverage still dominates.
This is a four-line change and it makes every downstream claim true.

### BLOCKER 2 — The budget control does nothing

`weekly_budget_zar` travels from `src/api/client.js:124` → `routers/optimization.py:175` →
`optimization_engine.py:121` and is then **never referenced again**. A user who sets a weekly budget
gets a plan that silently ignores it. In a product sold to a public hospital, a financial control
that appears to work and does not is the kind of defect that ends a pilot.

**Fix:** either add the constraint (`Σ shift_cost·x + locum_cost·Σunfilled ≤ budget`, with the slack
absorbing the difference) or remove the parameter from the API surface entirely. Do not ship it
half-wired.

### BLOCKER 3 — Savings are measured against strawmen

Both halves compare against a baseline chosen to lose:

- **Supply:** the "before" policy has **no safety stock at all** (`s_base = d_proj * L`, line 424).
  No hospital on earth runs zero safety stock. Comparing an optimised (s,S) against that guarantees
  a large number.
- **Staff:** the "before" is a flat peak-day roster applied to all seven days (line 253).
- The standing-policy planner's baseline is the `naive` arm — a flat monthly bulk order with a
  +20% buffer (line 1352).

The resulting annualised rand figure is then shown as the headline on the Optimization page and fed
to the AI assistant, the Action Center and the emailed report.

**Fix:** report savings against **current practice**. The simulation CSVs already contain the
hospital's actual realised cost (`supply_items.csv` has `total_cost_zar`, `service_level_achieved`,
`number_of_stockout_events`). Make that the primary baseline and keep the textbook naive policy as a
secondary reference line. The number will be smaller and infinitely more defensible.

### HIGH 4 — Three different optimisation engines, two of them live

| Path | Engine | Demand model | Lead time |
|---|---|---|---|
| `POST /api/optimization/supply` (the page) | `run_supply_policy` | negative binomial, shared stream | gamma, stochastic |
| `POST /api/optimization/run` (combined) | `reorder_supply` | Normal, clipped at 0 | deterministic |
| `POST /api/actions` (legacy, unused) | `core/optimization.py` | separate heuristics | — |

`CLAUDE.md` states that "all simulation consumers share `_demand_stream`, so ladder, tuner and
planner numbers agree." That is true of the ladder, the tuner and `run_supply_policy`, but
`reorder_supply` uses `rng.normal` at line 432 and shares nothing. The two live paths can return
different order quantities for the same week.

`core/optimization.py` is a 560-line near-duplicate that nothing reaches any more — the Action
Center page calls `aiApi.actions()`, not `/api/actions`. It still contains a **US dollar sign** in a
rand-denominated product (`routers/actions.py:38`, `f"${ot * 200:.0f}"`) and staffing ratios for
doctors and support staff who do not exist in the data.

**Fix:** delete `core/optimization.py` and `routers/actions.py`. Make `reorder_supply` call
`run_supply_policy` so there is exactly one supply engine.

### HIGH 5 — Normal demand and deterministic lead times in the live planner

In `reorder_supply`, demand is `Normal(d, σ)` clipped at zero (line 432). For C-class items
consuming a fraction of a unit per day this is wrong in both directions: the Normal has mass below
zero that the clip converts into upward bias, and it cannot reproduce the overdispersion that count
demand actually shows. Safety stock uses `z·σ·√L` — the textbook formula that assumes **deterministic**
lead time — while the dataset carries `lead_time_mean_days` and the whole SA public-sector context is
one of highly variable supplier lead times.

**Fix:** use the negative-binomial draw the other simulator already has, and the standard
variable-lead-time formula `σ_DL = √(L·σ_d² + d²·σ_L²)`. You need a `lead_time_sd` column; the arm
simulator already assumes `0.3 × mean` (line 1300), so adopt that until real data exists and say so.

### HIGH 6 — Monte-Carlo results reported without a confidence interval

`MC_REPS = 800` with `MC_GRID = 11` candidates, and `S*` is selected by `argmin` over noisy
estimates (line 439) — a textbook winner's-curse bias that makes the reported optimum look better
than it is. The standing-policy planner is worse: `SIM_SEEDS` has **three** replications
(line 640), and a three-replication mean is presented as an annualised rand saving.

Your own simulation data files carry `half_width_95` columns. The product should too.

**Fix:** report every simulated cost as `mean ± half-width (95%)`, raise the seed count, and use a
common-random-numbers paired difference for the saving so the interval is tight. Show it in the UI as
"R 1.2m – R 1.8m per year", not "R 1.5m".

### MEDIUM 7 — Other items

- Shelf life is modelled as an inventory cap (`cap = shelf_days · d_proj`, line 428) rather than
  age-tracked FIFO. Defensible as an approximation; say so in the UI tooltip.
- `locum_shift_cost` uses the **maximum** salary in the pool × 1.8 (line 137). Use the mean or a
  quoted agency rate; the max inflates every saving.
- `forecast_factor` scales every SKU by the same ED-level ratio. Reasonable, but it should be visible
  to the user — a paracetamol line and a trauma consumable do not scale identically with total
  arrivals.
- `DEFAULT_SIGMA_EPS = 9.35` is labelled "XGBoost residual SD" but the app runs
  `GradientBoostingRegressor`. It is only a fallback (the live value comes from the forecast MAE at
  line 547), but the comment is wrong and the Admin page repeats "XGBoost-family" to users.

---

## 2. Prediction / forecasting engine

`api/core/forecasting.py` (348 lines), `api/routers/forecast.py` (491 lines)

### What is genuinely good

Three things here are better than most commercial forecasting UIs:

1. **Weather is disabled by default with the evidence recorded in the code**
   (`routers/forecast.py:128`): calendar features moved MAE 12.55 → 11.52, adding weather moved it to
   11.92, so weather stays behind `FORECAST_WEATHER=on` until a validated gain exists. That is
   exactly the right discipline, and almost nobody does it.
2. **The model refuses to invent covariates.** Weather is used only if it covers ≥95% of history
   *and* every day of the forecast window (line 230). No silent imputation.
3. **Backtest mode is real.** Pick a past cut-off and the app forecasts forward blind, then attaches
   actuals and recomputes accuracy honestly (`routers/forecast.py:205-240`). This is the single most
   credible feature in the product and it is under-sold in the UI.

### BLOCKER 8 — The accuracy number does not describe the forecast on screen

This is the most important finding in the audit.

**Machine-learning path.** Validation MAE/MAPE is computed on `val_df` (line 246), where every row's
`lag_1`, `lag_2`, `lag_3`, `lag_7`, `roll7_mean` come from **real observed history**. That is a
**one-step-ahead** error. The forecast actually shown to the user is built by the iterative loop at
line 254, which feeds each prediction back in as the next day's lag. By day 7 the model is standing
on six of its own guesses; by day 30 it is standing on twenty-nine.

So the "accuracy" badge on a 30-day forecast is measuring a 1-day forecast.

**Statistical path.** Worse. The forecast shown comes from `SARIMAX(order, seasonal_order=(1,1,0,7))`
(line 117). The accuracy reported comes from a **non-seasonal** `ARIMA(best_order)` refitted on a
train split (line 146). Two different models. Additionally, `best_order` was selected by a grid
search over the **entire series including the holdout** (lines 105-113), so the reported error is
contaminated by the data it is evaluated against.

This is not only a scientific problem. `sigma_eps = forecast.mae` drives the staffing buffer
(line 547) and `forecast_rel_err` drives safety stock (line 523). An understated error means
**systematically under-sized safety stock and under-staffed shifts**. The optimiser is being fed an
optimistic number and converting it into operational decisions.

**Fix (the standard method, Hyndman & Athanasopoulos):** replace the single holdout with
**rolling-origin evaluation at the horizon actually requested**. Walk a cut-off forward through the
last N weeks, forecast h days ahead from each, and report MAE/MAPE per horizon step. You already have
the machinery — `routers/forecast.py` can run a blind backtest from any `start_date`; loop it. Then:

- report accuracy **per horizon** ("day 1: ±7 patients, day 7: ±14 patients"), not one number;
- derive the prediction band from the same rolling residuals instead of the arbitrary
  `1 + 0.06·i` widening at line 305;
- feed the **horizon-matched** σ into the optimiser.

Note that the arm simulator already models error growing as `target_mape · √h` (line 722). The
forecasting engine should use a measured version of the same shape, not a 6%-per-step guess.

### HIGH 9 — "100 − MAPE" is not accuracy

`_attach_confidence` (line 93) sets `confidence_pct = 100 − MAPE`. MAPE is unbounded above,
undefined at zero, and asymmetric (it punishes over-forecasts harder than under-forecasts), so
"accuracy" can go negative and is floored at 0 (line 108). The code already knows this — it falls
back to interval tightness for low-volume series and flags `low_volume`, which is good thinking.

**Fix:** lead with **MAE in patients** ("typically within 9 patients") and **MASE** against a
seasonal-naive baseline, which is the scale-free measure the forecasting literature settled on.
Keep a percentage only as a secondary, clearly-labelled figure.

### HIGH 10 — A 365-day horizon is offered with no caveat

`_ALLOWED_HORIZONS` includes 365 (line 62). An iteratively-fed gradient booster 365 steps out
converges to a near-flat line carrying no information beyond the seasonal calendar features. Offering
it next to the 1-day and 7-day options, with the same green "Validated & reliable" badge, invites a
user to plan a year's procurement on it.

**Fix:** either restrict long horizons to a clearly-labelled *seasonal profile* view (monthly totals
with wide bands, explicitly not a daily forecast), or gate it behind a warning.

### MEDIUM 11 — Category breakdown is not a forecast

`CATEGORY_WEIGHTS` (line 8) is a fixed dictionary — respiratory 26.4%, cardiac 20.6%, and so on — and
every day's `categories` field is just the daily total multiplied by those constants (lines 165, 302).
The UI renders them as per-category predictions. They are not; they are a constant split. If a user
sees "cardiac: 12" they will reasonably believe the model predicted cardiac arrivals.

**Fix:** either label it clearly ("estimated split using the historical case mix") or forecast the
categories properly — the G3 clinical-daily group exists for exactly this.

### MEDIUM 12 — Other items

- `holdout_n = max(7, len(series)//5)` then a single `forecast(steps=holdout_n)` (line 145): for three
  years of data that is a **219-step-ahead** forecast evaluated as if it were the model's typical
  error. It will be close to the series mean, so the statistical engine's accuracy is pessimistic and
  meaningless in equal measure.
- The `except` fallback at line 148 computes MAE as the mean absolute first difference of the last
  seven values — a naive-forecast proxy silently reported as model error.
- GBR hyperparameters are fixed with no tuning or early stopping. Acceptable, but a single
  `TimeSeriesSplit` grid search would cost minutes and is expected in a product.
- Prediction intervals for a count process come from Gaussian residual quantiles. Quantile gradient
  boosting (`loss="quantile"`, α=0.025/0.975) would give properly asymmetric, non-negative bands.

---

## 3. Explore pipeline

`api/core/explore/` — 8 analyzers, 17 metrics, 10 sections

### What is genuinely good — this is the best-designed subsystem in the repo

The three-layer design (GroupProfile → Analyzer → FindingPipeline) is textbook plug-in architecture
done right. Analyzers declare the **semantic roles** they need (`required_roles`, `requires_categories`,
`required_group_grain`) and the pipeline only runs the ones a given group can satisfy. Adding a
dataset means writing a profile and every existing analyzer works on it for free. Adding an analysis
means adding one file. I would keep this exactly as it is.

The `Finding` dataclass is the thing that makes this a *product* rather than a chart dump. It carries
`headline`, `summary`, **`mechanism`** and **`action`**. Most analytics tools stop at the number. Going
to "why this happens" and "what to do about it" is precisely what RELEX and Kinaxis market as their
differentiator, and you built it into the data model.

### HIGH 13 — The headline findings have no significance testing

`impact_matrix.py:52` and `metrics/calendar_drivers.py:52` do proper Welch t-tests with p-values. The
**Findings** — the cards a user sees first — do none.

`WeekendEffectAnalyzer` (weekend_effect.py:38-39) computes a percentage deviation for every specialty
and then picks `max(abs(pct_deviation))` as the headline. That is maximum selection across a dozen
simultaneous comparisons with no correction, on series that include very low-volume specialties where
a two-case difference is a 50% swing. The card is structurally biased toward surfacing noise as the
top insight.

**Fix:** every Finding should carry `n`, a confidence interval and a p-value, and should suppress
itself below a minimum effect size or sample size. Apply Benjamini-Hochberg across the family of
comparisons in one analyzer. Where a finding is not significant, say so on the card — "not
distinguishable from normal variation" is a legitimate and trust-building result.

### HIGH 14 — Mechanisms are asserted, not tested

`weekend_effect.py:53` emits, as a fixed string for any dataset:

> "Elective clinics close on weekends and route their complications to the ED. Acute trauma also
> concentrates on weekends."

That is a **causal claim the app did not test**, presented to a hospital manager as an explanation of
their own data. The same pattern runs through the other analyzers, and the `action` fields are
likewise templated ("Pre-position X consumables every Friday afternoon") with no cost-benefit behind
them.

This is the software equivalent of the fabrication rule in your thesis instructions, and an examiner
or a clinical governance reviewer will treat it the same way.

**Fix:** split the field in two. `mechanism` becomes `hypothesis`, rendered with visibly different
weight and prefaced "A likely explanation, not tested here:". Where the data *can* test it — and for
the weekend effect it can, via the G3 specialty split — run the test and promote it to a finding.

### MEDIUM 15 — Multiple comparisons in the impact matrix

`impact_matrix.py` runs a Welch t-test per driver per category and reports raw p-values (line 65). With
a dozen drivers across seven specialties that is ~84 tests; at α=0.05 roughly four will be "significant"
by chance. Correct them.

---

## 4. UI / UX and the design system

This is where the gap between "impressive project" and "commercial product" is widest.

### What is genuinely good

- The **decision-chain Optimization page** — numbered steps, plain-English model labels ("Learns from
  arrivals, calendar and weather"), safety buffer presented as Lean / Standard / Cautious rather than
  κ — is genuinely good product design. Keep this pattern and extend it.
- The **Plan C on-demand rule** (nothing heavy fires on page load, results appear only after a Run
  button, "Load last…" restores explicitly) is a mature, honest interaction model that a lot of
  analytics products get wrong.
- **Real loading / empty / offline states** on the Dashboard rather than a single em-dash standing in
  for all three.
- The **responsive CI gate** — 13 routes × 8 viewports down to 320px, failing the build on overflow,
  chart console errors, clipped text and sub-24px hit areas — already enforces WCAG 2.2's new
  Target Size (Minimum) criterion. Very few teams have this.
- `src/styles/tokens.css` is a properly-constructed Utopia-style fluid scale with rem+vw clamps so
  browser zoom keeps working (WCAG 1.4.4). The foundation is right.

### BLOCKER 16 — The design system is bypassed almost everywhere

| Measure | Count |
|---|---|
| Inline `style={{…}}` blocks in `src/` | **969** |
| Hardcoded hex colours in JSX | **873** |
| Font sizes below 12px (`fontSize: 10`/`10.5`/`11`/`11.5`) | **168** |
| `:focus-visible` rules in the whole stylesheet | **2** |

`tokens.css` defines `--accent: #0d9488`, and `Charts.jsx:33` re-declares the same value as a literal
in its own `CATEGORY_TOKEN` map, and pages then re-declare it again in local `C = { teal: '#0d9488' }`
objects. Three sources of truth for one brand colour.

The consequences are concrete and commercial:

- **You cannot theme or white-label.** Selling to a second hospital means a find-and-replace across
  873 literals.
- **You cannot ship dark mode** (see below).
- **Type is inconsistent and too small.** 10.5px and 11px labels look amateur on a high-DPI screen
  and are the first thing a design reviewer will flag. The fluid scale in `tokens.css` starts at
  `--step--2` = 12px for a reason.

`src/pages/ExploreData.jsx` is the worst case: 1,455 lines that **re-implement the entire chart
library locally** — `Spark`, `KPI`, `AreaLine`, `Bars`, `Donut`, `Legend`, `Ranked`, `ImpactMatrix`,
`Heatmap` — plus a local `Card` component (line 508) that shadows the canonical `ui/Card.jsx`
primitive, in direct contradiction of the repo's own stated contract that "new cards never use
bespoke markup".

**Fix, in order:** (1) delete the duplicate chart implementations in `ExploreData.jsx` and import from
`Charts.jsx`; (2) move the `C = {…}` colour objects into `tokens.css` and reference
`var(--…)` everywhere; (3) convert repeated inline style blocks into utility classes; (4) enforce it
with a lint rule that fails on a hex literal in JSX.

### BLOCKER 17 — "Validated & reliable" is hardcoded

`src/pages/Task1Forecast.jsx:498` and `Task2Forecast.jsx:595`:

```jsx
<div style={{ fontSize: 16, fontWeight: 800, color: '#15803d' }}>Validated &amp; reliable</div>
```

This renders in confident green **on every forecast**, regardless of horizon, confidence, data
coverage or whether a backtest was run. It is not conditional on anything. Combined with the
governance rule that hides accuracy figures from front-line users, the user is shown an unearned
assurance claim with no way to check it.

In a healthcare product this is the single most serious UI defect in the codebase. It is the kind of
unsubstantiated efficacy claim that regulators, procurement reviewers and clinical governance
committees exist to catch.

**Fix:** replace with an honest, computed status derived from `confidence_tier`, `is_backtest`,
`low_volume` and the horizon — for example "Backtested on 8 past weeks · typically within 9 patients"
when true, and "Not yet backtested at this horizon" when not. Earned assurance builds far more trust
than asserted assurance, and it is the same amount of code.

### BLOCKER 18 — No authentication, and one endpoint is an open relay

- `src/pages/Admin.jsx:11` — `const ADMIN_CODE = 'hf-admin-2026'`. A string constant compiled into
  the public JavaScript bundle, compared client-side. Anyone can read it, or simply set the React
  state. Behind it sit real model identities, accuracy figures and the AI audit log. The code is
  honest about being a placeholder; it is still live on a public URL.
- `api/main.py:53` — `allow_origins=["*"]` with no auth, so any website can call the API.
- `api/routers/reports.py:122` — `POST /api/reports/email` takes an arbitrary recipient, an arbitrary
  base64 PDF attachment and an arbitrary `context` blob, with **no authentication and no rate limit**.
  It then sends the attachment from your verified domain and pipes `context` into the LLM. That is an
  open mail relay attached to your sending reputation, a prompt-injection surface, and an unbounded
  charge against your Anthropic budget in one endpoint.
- There is no rate limiting anywhere in `api/`.

**Fix (in this order):** real auth with roles (planner / manager / admin) — an OIDC provider is a day's
work and hospitals will require SSO anyway; lock CORS to your own origin; require a session on
`/api/reports/email` and restrict recipients to a verified list; add rate limiting on every AI and
report endpoint.

### HIGH 19 — Accessibility is not at a level a public hospital can procure

| Check | Status |
|---|---|
| `<main>` landmark, skip link | **Absent** |
| `:focus-visible` keyboard indication | 2 rules total — effectively absent (WCAG 2.4.7, 2.4.11) |
| ARIA attributes across 13 pages | 21 total |
| Accessible names / `<title>`/`<desc>` on the 22 chart components | **Zero** (WCAG 1.1.1) |
| `prefers-reduced-motion` | **Absent** (WCAG 2.3.3) |
| Status conveyed by colour alone (red/amber/green, no shape or label redundancy) | **Fails** WCAG 1.4.1 |
| Target size ≥24px | **Enforced in CI** ✅ |
| Zoom-safe fluid type | **Correct** ✅ |

South African public-sector procurement, like NHS and US federal procurement, increasingly requires a
documented accessibility conformance statement. Charts with no text alternative are the hardest gap to
close later and the easiest now — `role="img"` plus a generated `aria-label` summarising the series,
and a "view as table" toggle, covers most of it.

### HIGH 20 — No dark mode, in a product that explicitly models a Night shift

There is not a single `prefers-color-scheme` rule in the stylesheet. Your optimiser rosters nurses
onto a Night shift; those nurses would be reading a pure-white dashboard at 03:00.

This is not cosmetic. The evidence base treats it as an occupational-health matter: blue light
suppresses melatonin roughly twice as long as comparable green light and shifts circadian rhythm by
about three hours rather than 1.5, which is why clinical software vendors now ship dark themes
specifically for night staff. Because `tokens.css` is already a proper token layer, dark mode is
cheap — *once finding 16 is fixed*. With 873 hardcoded hex values it is impossible. This is the
clearest illustration of why the token debt matters commercially.

### HIGH 21 — The Action Center does not remember anything

`src/pages/ActionCenter.jsx:18` — `const [state, setState] = useState({})`. Approve, snooze and
dismiss are component state. Refresh the page and every decision is gone. There is no owner, no due
date, no audit trail, no "what happened to the thing we approved last Tuesday".

Both LeanTaaS and Qventus market exactly this loop — "automated workflows drive consistency,
**accountability** and action" — and accountability is precisely the part that requires persistence.
An action list that forgets is a demo, not a product.

**Fix:** persist actions server-side with `{id, status, owner, due, decided_by, decided_at, outcome}`,
and add a closed-loop view: what we predicted → what we decided → what actually happened. That
feedback loop is also the most defensible thing you could put in front of an examiner.

### HIGH 22 — Information architecture follows the pipeline, not the job

The sidebar is Overview → Data → Forecasting → Operations → Governance: the **system's** structure.
A hospital operations manager's mental model is "what is happening → what should I do → did it work".

Eleven pages is too many, and four of them overlap confusingly. A user must work out why "Staffing"
and "Optimization → Run staff optimization" are different pages (one is descriptive simulation, the
other prescriptive planning) — a distinction that is obvious to you and opaque to everyone else.
"Total ED" and "By specialty" are the same page with a filter. Data Hub → Prepare → Explore is a
data-engineering workflow that a front-line manager will never open.

**Fix — collapse to five, organised by job:**

| Page | Replaces | Audience |
|---|---|---|
| **Today** | Dashboard | everyone, default landing |
| **Forecast** | Total ED + By specialty (scope as a filter) | manager, analyst |
| **Plan** | Staffing + Supply + Optimization, as one chain with a before/after toggle | manager |
| **Actions** | Action Center, persistent, with owners | manager, charge nurse |
| **Data & Evidence** | Data Hub + Prepare + Explore + policy ladders | analyst, admin |

Then gate them by role, so a charge nurse sees Today and Actions and nothing else. Role-based
surfaces are what separates enterprise healthcare software from a dashboard.

### MEDIUM 23 — Craft details that read as "project", not "product"

- `Charts.jsx:43` — `SERIF = '"Times New Roman", Georgia, …'` for hero numbers, to give "a boardroom
  feel". Times New Roman reads as a 1998 Word document, not as premium. Use a real editorial serif
  (Source Serif 4, Newsreader, Instrument Serif) or a strong sans with tabular figures. You already
  import Inter — `font-feature-settings: "tnum"` on hero numbers would do more for the boardroom feel
  than a serif does.
- `index.html` has no meta description, no favicon, no `theme-color`, no Open Graph tags — the landing
  page cannot be shared into WhatsApp or Slack with a preview, which for a product with a marketing
  landing page is a real miss.
- Fonts load render-blocking from Google's CDN. Hospital networks frequently block it and it is a
  GDPR/POPIA consideration. Self-host the two families.
- No PWA manifest, no offline handling. This is a tool people will open on a phone in a department
  with patchy Wi-Fi.
- No global date/week context, no search, no command palette. For a premium product in 2026 a ⌘K
  palette and a persistent "week of…" selector are table stakes.
- Duplicate nav icons: `bolt` for both Optimization and Action Center, `chart` for both Explore and
  By specialty.
- `Welcome.jsx:59` ships a password field with a hardcoded `defaultValue` of bullet characters — a
  fake login. Either make it real or remove it; a fake login on a healthcare product invites exactly
  the wrong assumption.

### MEDIUM 24 — Forecast presentation misses the two things the research says matter most

The uncertainty-visualisation literature is unusually consistent: prediction intervals are the
dominant and best-understood device (used in ~60% of surveyed COVID forecasting visualisations),
history and forecast must be separated by an explicit temporal marker, the forecast line should be
visually distinct (dashed), and greyscale ensemble displays are trusted more than colour-coded ones.

Two gaps:

1. **No driver attribution.** The user is never told *why* Thursday is high. RELEX sells exactly this
   ("this spike is due to heatwave + promotion") as its trust mechanism. You have a gradient booster
   with `feature_importances_` and holiday/day-of-week/lag features sitting right there — a per-day
   "what is pushing this up" strip is a few hours' work and would be the most persuasive thing on the
   page.
2. **No manual override.** A hospital manager knows about the taxi strike, the stadium event, the
   clinic closure. Every serious demand-planning product lets a planner adjust a forecast, records who
   changed it and why, and reports forecast-value-added — did the human's override actually help?
   HealthForecast has no override path at all, which tells an experienced planner the tool was not
   built for them.

---

## 5. Cross-cutting: the maths is untested

| Suite | Coverage |
|---|---|
| `api/tests/test_ai_guardrails.py` | 16 tests — redaction, tool loop, round caps, prompt caching |
| Forecasting engine | **0 tests** |
| Optimisation engine | **0 tests** |
| Explore analyzers | **0 tests** |
| Frontend unit tests | **0** |
| `tests/responsive.spec.js` | layout only |

The only thoroughly-tested subsystem is the AI guardrail layer. The code that decides how many nurses
work on Thursday and how many vials to order has no tests at all.

**Minimum set before any pilot:**

- **Optimiser invariants** (property tests): no nurse ever exceeds 45 hours; no Day shift follows a
  Night shift; coverage + unfilled ≥ demand for every shift; cost accounting reconciles
  (`payroll + locum == weekly_cost`).
- **Forecast sanity:** a known synthetic series with a planted weekly cycle recovers that cycle;
  reported MAE is within tolerance of recomputed rolling-origin MAE; forecasts are never negative.
- **Golden-file regression:** fix a seed, snapshot the full optimisation payload, fail the build when
  a number moves unexpectedly. This is the cheapest high-value test you can add and it protects every
  figure in your dissertation.

---

## 6. Prioritised roadmap

### Phase 1 — Truthfulness (before anyone else sees it)

1. Remove the hardcoded "Validated & reliable" badge; replace with a computed status.
2. Add rolling-origin, horizon-matched backtesting; report accuracy per horizon; feed the
   horizon-matched σ into the optimiser.
3. Add the cost term to the roster objective, or stop calling it cost-minimal everywhere.
4. Wire or remove `weekly_budget_zar`.
5. Re-baseline savings against current practice; publish confidence intervals on every simulated figure.
6. Label the category split as a historical mix, not a forecast.

### Phase 2 — Commercial viability

7. Real authentication and RBAC; lock CORS; protect and rate-limit `/api/reports/email`.
8. Persist the Action Center with owners, due dates and an audit trail; add the closed-loop view.
9. Delete `core/optimization.py` and `routers/actions.py`; collapse to one supply engine.
10. Add optimiser invariant tests and golden-file regression tests.

### Phase 3 — Premium feel

11. Kill the 873 hardcoded colours and 969 inline style blocks; one token source; lint rule to hold
    the line.
12. Delete the duplicate chart library in `ExploreData.jsx`.
13. Ship dark mode (cheap once 11 is done, and justified by the Night shift you already model).
14. Accessibility pass: `<main>`, skip link, focus-visible, chart `role="img"` + aria-labels +
    table fallback, reduced-motion, shape/label redundancy alongside colour.
15. Collapse eleven pages to five, organised by job; role-gate them.
16. Replace Times New Roman with a real editorial face or tabular-figure Inter; self-host fonts;
    add meta/OG/favicon/manifest.

### Phase 4 — Differentiation

17. Per-day forecast driver attribution ("Thursday is high because: public holiday +18, weekend −0,
    trend +4").
18. Manual forecast override with reason capture and forecast-value-added reporting.
19. Negative-binomial demand and variable lead times in the live planner.
20. Significance testing, effect-size floors and multiple-comparison correction on Explore findings;
    reframe `mechanism` as an explicit untested hypothesis.
21. Scenario save and compare on the Optimization page.

---

## 7. The one-paragraph summary

The forecasting-to-operations chain, the lawfulness-first roster model, the evidence ladder and the
Explore plug-in architecture are real engineering achievements, and the on-demand interaction model
and responsive CI gate are more disciplined than most commercial products in this space. What stops
it being a product is that the claims outrun the evidence — an accuracy number measured on a
different forecast, savings measured against baselines chosen to lose, a green "Validated & reliable"
badge that is a string constant, a budget field that does nothing — and that the shell around it has
no authentication, no persistence of decisions, no accessibility layer, and a design system that
exists but is bypassed in a thousand places. Every one of those is fixable, most of them cheaply. Fix
the truthfulness first: a smaller, honest, interval-bounded saving with a backtested accuracy figure
is worth more commercially, and far more academically, than a large number nobody can defend.

---

## Sources consulted for external benchmarking

- [NHS digital service manual — design system and service standard](https://service-manual.nhs.uk/design-system)
- [WCAG 2.2 — W3C Recommendation](https://www.w3.org/TR/WCAG22/) and [the nine new success criteria](https://www.audioeye.com/post/whats-new-with-wcag-2-2/)
- [Enhancing Uncertainty Communication in Time Series Predictions (arXiv 2408.12365)](https://arxiv.org/html/2408.12365)
- [Mapping the Landscape of COVID-19 Crisis Visualizations (arXiv 2101.04743)](https://arxiv.org/pdf/2101.04743) — prediction intervals as dominant uncertainty device
- [LeanTaaS iQueue — predictive + prescriptive hospital capacity management](https://leantaas.com/)
- [Qventus vs LeanTaaS capability comparison](https://www.rfp.wiki/specialty-industries/healthcare-life-sciences/healthcare/patient-throughput-and-capacity-management-software/qventus/leantaas)
- [RELEX demand planning — forecast driver explainability and planner override](https://www.relexsolutions.com/solutions/demand-planning-software/)
- [Kinaxis supply planning — exception routing and traceable plan deltas](https://www.kinaxis.com/en/solutions/supply-planning)
- [Dark mode for EMR — night-shift circadian evidence](https://heroemr.com/blog/dark-mode-emr)
