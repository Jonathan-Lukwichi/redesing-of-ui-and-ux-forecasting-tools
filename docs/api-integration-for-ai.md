# Adding an AI Assistant to HealthForecast

A plan, written for hospital leadership, operations managers, charge nurses, and supply coordinators — not engineers. It explains what the AI assistant will do for the people who use HealthForecast every day, what it will never do, and the order we will roll it out.

A short technical appendix for the development team is at the end.

---

## 1. The short version

HealthForecast already does the heavy mathematics: it predicts how many patients will arrive, how many nurses and doctors we need, and how much stock to reorder. The numbers are accurate, but reading them takes training.

We will add an **AI assistant** on top of those numbers. Think of it as a clinical operations analyst who:

- **Reads the forecasts and turns them into plain English** for the morning huddle.
- **Explains why** a recommendation was made (e.g. "Order 200 more N95 masks because last winter respiratory cases jumped 18 % in the same week").
- **Answers questions** typed in normal English — "Will Thursday be busier than Friday?", "Which ward is short on supplies?".
- **Drafts the daily action list** instead of giving staff a wall of numbers.

It is an assistant. It does not make decisions, prescribe care, or change schedules on its own. A human always approves before anything happens.

---

## 2. What changes for the people on the floor

### For the hospital director / operations manager
- Open the dashboard, see a **two-paragraph daily briefing** at the top: what the week looks like, where the pressure points are, what to watch.
- Click any chart and ask **"Explain this to me"** — get a clear answer in seconds.
- Receive a weekly summary email written by the assistant.

### For the charge nurse
- The **Action Center** stops looking like a spreadsheet. Each item reads like:
  > *"Thursday afternoon shift will be tight. The forecast shows 232 patients — about 18 % above a normal Thursday. Consider adding 2 nurses to the PM shift. If we do nothing, average wait time goes up by roughly 45 minutes."*
- Each action has an **Approve / Snooze / Dismiss** button. Nothing happens until the nurse approves.

### For the supply coordinator
- Instead of reading EOQ tables, the assistant writes:
  > *"N95 masks: order 200 units this week. We have 3.2 days of stock left and our supplier takes 5 days to deliver. Last week the burn rate was 24/day, which matches the respiratory forecast."*
- They can ask: **"What if I delay the order by 3 days?"** — and get a clear answer about stock-out risk.

### For the data analyst / planner
- A **"Co-pilot" panel** on the Prepare and Explore pages reads the uploaded files and suggests next steps: which columns look unhealthy, which groups are worth building, which historical regimes (COVID, holidays) deserve a closer look. The analyst keeps full control — every suggestion is a tickbox they choose to apply.

---

## 3. What the AI assistant will **never** do

So leadership, clinical staff, and information governance can sign this off with confidence:

| Will not | Why |
|---|---|
| Make any clinical decision about a patient. | This is an operations tool, not a clinical decision support system. |
| See patient names, ID numbers, addresses, or any individual record. | Only the aggregated daily and hourly counts the platform already uses are shared with the assistant. |
| Change a staff schedule, place a supply order, or move stock on its own. | Every recommendation requires a human "Approve" click. |
| Replace the forecasting models. | The mathematics that produces the predictions stays exactly as it is today. The assistant only explains and ranks. |
| Send hospital data outside the system without a clear audit log. | Every interaction with the AI provider is recorded: what was asked, what came back, how long it took, what it cost. |

---

## 4. Where the assistant will appear, page by page

| Page in HealthForecast | What the assistant adds |
|---|---|
| **Dashboard** | A daily briefing card at the top. One paragraph for "today" and one for "the week ahead". |
| **Forecast** | A "Read this for me" button next to every chart. The assistant explains the peak day, the confidence range, and what to do with it. |
| **Staff Planner** | A plain-English rationale under the schedule: why the optimiser chose this mix of doctors and nurses, where the overtime comes from, what the savings story is. |
| **Supply Planner** | SKU-by-SKU commentary: which items drive the savings, which are at stock-out risk, what changes if lead times slip. |
| **Explore Data** | A "Brief me" button that turns the findings cards into a one-page summary tailored to the reader: executive view, charge-nurse view, or analyst view. |
| **Action Center** | The whole page is rewritten by the assistant: shorter list, plain-English reasons, duplicates merged, items ranked by real operational urgency. |
| **Prepare Data** | A "Co-pilot" panel that reads the uploaded files and proposes a step-by-step preparation plan. |
| **Anywhere** | A small "Ask" button at the bottom-right. Click it, type a question in normal English, get an answer. Like having an analyst on call. |

---

## 5. How it will feel to use — three short scenarios

### Scenario A — Monday 07:30, charge nurse arrives for shift
She opens the Action Center. Instead of a list of forty numbers, she sees:

> **Today (Monday)** — Normal volume expected (about 195 patients). Staffing is on plan.
>
> **Highest priority this week:** Thursday afternoon. The forecast is 232 patients, about 18 % above a typical Thursday, partly because of a heat-wave warning. Adding two nurses to the PM shift keeps wait times in line. Estimated cost of the extra shifts: R 8 400. Estimated cost of not doing it: longer waits, more left-without-being-seen.
>
> **Two supplies need attention:** N95 masks (3 days of stock left), IV saline (under a week). Suggested orders are ready for review on the Supply page.

She approves the Thursday staff plan with one click. The N95 order goes to the supply coordinator's queue.

### Scenario B — Wednesday 14:00, supply coordinator
He has been asked by finance why he is ordering 200 N95 masks. He opens the assistant and types:

> *"Why are we reordering N95 this week?"*

The assistant replies:

> The current stock of 78 units covers about 3.2 days at the current burn rate of 24 units per day. Our supplier takes 5 days to deliver. The forecast for respiratory cases is +12 % versus the four-week baseline, mostly because of the predicted weekend cold front. Ordering now keeps the service level at 95 %. Waiting one more day would drop the safety margin below one day of cover during the lead-time window.

He copies the answer into his email to finance.

### Scenario C — Friday 09:00, hospital director
She opens the dashboard before her executive meeting. The daily briefing reads:

> Patient volumes were 4 % above forecast this week, driven mainly by a Tuesday surge in cardiac admissions. The staffing plan absorbed it without overtime. Supply spending is 6 % below last month thanks to better reorder timing — the largest contributor is the elastic bandage SKU, where we cut excess stock by half. Next week's outlook is normal, with one peak on Thursday already covered by an approved staffing action.

That paragraph becomes the first slide of her meeting.

---

## 6. Roll-out plan — small steps, visible at every step

We will release the assistant in four phases. Each phase is useful on its own — we never have a "wait six months for everything" situation.

### Phase 1 — The assistant learns to explain (about a week)
**Goal:** every chart on the Forecast, Staff, Supply, and Explore pages gets a "Read this for me" button.

What staff will see: short, plain-English paragraphs under charts they already use. Nothing else changes. If they ignore the new buttons, the platform behaves exactly as it does today.

### Phase 2 — A smarter Action Center (about two weeks)
**Goal:** the Action Center stops showing canned text and starts being written by the assistant, grounded in the live forecast and supply numbers.

What staff will see: shorter list, clearer reasons, duplicates merged. Same Approve / Snooze / Dismiss controls.

### Phase 3 — Ask in your own words (about two weeks)
**Goal:** a small "Ask" button is always visible. Staff can type questions in normal English and get answers grounded in our data.

What staff will see: a chat panel. The assistant can look up forecasts, supply status, staffing plans, and findings on its own — but it can only read, never change anything.

### Phase 4 — Data co-pilot for analysts (about three weeks)
**Goal:** when an analyst uploads new files or opens the Prepare page, the assistant proposes a clear preparation plan they can approve step by step.

What staff will see: a "Co-pilot" panel on the Prepare and Explore pages with a tickbox plan.

---

## 7. Safety, privacy, and control

### What the assistant is allowed to see
Only the same aggregated numbers that the dashboards already show: daily and hourly arrival counts, calendar information, weather summaries, stock levels, schedules, and the metrics from our exploratory analysis. **Never** individual patient records.

### Who approves what
- The assistant **suggests**; people **approve**.
- Every approval action is recorded with the user's name and the time.
- Snoozed or dismissed actions are kept in a log so we can review later why a recommendation was set aside.

### Cost and rate limits
We will set a **daily spending cap** for the AI assistant and a per-minute rate limit. If either is reached, the assistant pauses gracefully — the rest of the platform keeps working normally. Costs are visible on an admin page so operations leadership can see what the assistant is costing per day, per week, per page.

### Audit trail
For every assistant answer we record:
- the page and the question,
- the inputs the assistant was given (always aggregated, never patient-level),
- the answer it produced,
- whether the answer was approved, snoozed, or dismissed,
- how long it took and what it cost.

This log is available to information governance on request.

### "Off switch"
A single setting in the admin panel turns the assistant off across the whole platform. The maths and the dashboards keep working without it.

---

## 8. What we expect this to be worth

Specific, measurable goals for the first six months after Phase 1 ships:

- **Action review time:** charge nurses spend 50 % less time reviewing the daily action list (today: ~12 min, target: ~6 min).
- **Stock-out events:** zero unplanned stock-outs of the top 10 SKUs.
- **Overtime spend:** 8–12 % reduction in unplanned overtime, by acting on staffing alerts 24 hours earlier.
- **Executive reporting:** the weekly operations summary is produced in minutes instead of hours.
- **Adoption:** at least 70 % of charge-nurse shifts open the Action Center, and at least 30 % of users try the "Ask" button each month.

These will be reviewed quarterly. If a metric is not moving, we will know which phase is responsible and we can adjust without rolling back the rest.

---

## 9. What we need from the hospital to start

A short list, mostly administrative:

1. **Information governance sign-off** that the aggregated data described in §7 may be sent to an AI provider for the explanation and chat features.
2. **A nominated approver** from operations who will review the assistant's recommendations during the first month of each phase.
3. **A monthly budget figure** for the AI assistant. We will start small and adjust upward only if real usage justifies it.
4. **Three to five staff volunteers** (a director, a charge nurse, a supply coordinator, an analyst) to test each phase before it goes wide.

---

## 10. Frequently asked questions

**Will the assistant ever be wrong?**
Yes — like any analyst, sometimes. We have two layers of defence. First, the assistant is only allowed to quote numbers that come from our own platform; it cannot make up a value. Second, every recommendation requires a human approval. If a number in an explanation looks off, there is a "Flag this" button — flagged answers go to a review queue and help us improve the assistant.

**Does the assistant replace any staff role?**
No. It is intended to give the existing operations team back time — particularly time spent translating dashboards into briefings, emails, and meeting slides.

**Can the assistant talk to patients?**
No. It is internal to operations. It is not connected to any patient-facing system.

**What happens if the AI provider has an outage?**
The dashboards, forecasts, optimisers, and action thresholds keep working. The "Read this for me", "Ask", and "Co-pilot" features will show a polite "the assistant is temporarily unavailable" message.

**Why do we need this if HealthForecast already works?**
Because the platform is producing the right answers in a form that still requires a trained reader. Most operational decisions are made by people who do not have time to read a chart. The assistant closes that gap.

---

## 11. Decisions we need to make before Phase 1

Three small decisions, then the team can start building.

1. **Tone of voice.** Formal ("Memorial General Hospital recommends…") or conversational ("Heads up — Thursday will be busy…"). We will draft both for review.
2. **Default reading level for the dashboard briefing.** Executive (one paragraph, no numbers in the body), Operations (numbers in the body, plain English), or Analyst (numbers and short technical context). Each user can change their own default later.
3. **Languages.** English first. Should the assistant also produce briefings in any other language used at the hospital?

---

---

# Appendix — Technical notes for the development team

This appendix is for engineers. Hospital staff can stop at section 11.

## A. Where the AI layer sits

We add a new module `api/ai/` and a single router `api/routers/ai.py`. The AI module is the **only** place the Anthropic SDK is imported, behind a thin provider interface so we can swap providers later.

```
api/
├── ai/
│   ├── client.py       provider-agnostic LLM client (Anthropic first)
│   ├── config.py       model IDs, budgets, env loading
│   ├── prompts/        one file per surface (forecast, staff, supply, …)
│   ├── context.py      builds the JSON envelope shown to the model
│   ├── tools.py        tool-use schemas wrapping existing routers
│   ├── guardrails.py   PHI scrubbing, numeric grounding, output validation
│   ├── cache.py        prompt-cache helpers + short-lived response cache
│   └── telemetry.py    per-surface token/cost logging
└── routers/
    └── ai.py
```

## B. Endpoints

| Method | Path | Phase | Purpose |
|---|---|---|---|
| GET | `/api/ai/health` | 1 | Liveness + remaining daily budget. |
| POST | `/api/ai/explain/forecast` | 1 | Narrative for `/api/forecast` output. SSE stream. |
| POST | `/api/ai/explain/staff` | 1 | Narrative for `/api/staff/optimize` output. |
| POST | `/api/ai/explain/supply` | 1 | Narrative for `/api/supply/optimize` output. |
| POST | `/api/ai/explain/findings` | 1 | Tiered briefing over the Explore findings. |
| POST | `/api/ai/actions/rank` | 2 | Ranks + rewrites candidate actions. |
| POST | `/api/ai/chat` | 3 | Tool-using chat over the existing routers. SSE stream. |
| POST | `/api/ai/copilot/prepare` | 4 | Returns a structured prep plan as JSON. |
| GET | `/api/ai/usage` | 1+ | Token / cost ring buffer for the admin tile. |

## C. Models and budgets (defaults)

- Default model: `claude-sonnet-4-6` (reasoning, tool use).
- Fast model: `claude-haiku-4-5` (short paraphrase surfaces).
- `MAX_TOKENS_PER_REQUEST = 1024`, `DAILY_BUDGET_USD = 5` (demo), `RATE_LIMIT_PER_MIN = 30`.
- Prompt caching on the shared system prompt + dataset schema metadata.

## D. Grounding rule

Every system prompt includes:

> Quote only numbers present inside `<context>...</context>`. If a value is not there, say "not available" rather than guessing.

`ai/guardrails.verify()` extracts numeric tokens from the model output and confirms each one appears within ±1 unit in the context. Failures are returned with `verified: false` and surfaced as an "Unverified" badge in the UI.

## E. Tools exposed to the chat agent

| Tool | Wraps |
|---|---|
| `get_datasets_inventory` | `/api/datasets/inventory` |
| `get_group_quality` | `/api/prepare/{id}/quality` |
| `run_forecast_demo` | `/api/forecast/demo` |
| `get_findings` | `/api/explore/findings` |
| `get_metrics` | `/api/explore/metrics?section=forecast` |
| `run_staff_optimize` | `/api/staff/optimize` |
| `run_supply_optimize` | `/api/supply/optimize` |
| `get_actions_demo` | `/api/actions/demo` |

All tools call back into the same FastAPI app server-side. No new authentication surface.

## F. First commit (Phase 1, forecast explanation only)

- [ ] Add `anthropic>=0.40` to [api/requirements.txt](../api/requirements.txt).
- [ ] Add `ANTHROPIC_API_KEY` and budget env vars to `.env.example`.
- [ ] Create the `api/ai/` skeleton listed in §A.
- [ ] Add `api/routers/ai.py` with `GET /api/ai/health` and `POST /api/ai/explain/forecast`.
- [ ] Register the new router in [api/main.py](../api/main.py).
- [ ] Add `src/api/aiClient.js` with `explainForecast(context)` returning a stream reader.
- [ ] Add `src/components/AiPanel.jsx` (small streaming card).
- [ ] Mount `<AiPanel surface="forecast" context={data} />` in [src/pages/Forecast.jsx](../src/pages/Forecast.jsx) under the existing chart.
- [ ] One pytest covering `context.build_forecast_context()` against a snapshot of `auto_forecast()` output.

Everything else in this document is incremental on top of that first commit.
