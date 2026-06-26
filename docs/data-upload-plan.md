# Uploading Hospital Data into HealthForecast — The Plan

How we move from "an analyst runs scripts on their laptop" to "the hospital uploads data through HealthForecast and the platform takes care of the rest." Written for hospital leadership, operations, and information governance first; engineers second.

---

## 1. The short version

We have **80 monthly Casualty Daily Register spreadsheets** to load — May 2019 through January 2026 — plus a new one arriving every month from now on.

We will do this in two parts:

- **Part A — the one-time historical load.** The 80 files are loaded once, on the server, by the IT team. The hospital sees the platform "wake up" with seven years of data ready to use.
- **Part C — every month after that.** Hospital staff drop the new monthly file into a web page. The platform anonymises it, processes it in the background, and adds it to the dataset.

Both parts pass through the **same anonymisation gate**: patient names, hospital numbers, episode numbers, and transfer-in / transfer-out identifiers are stripped before the file is allowed any further into the system. No raw patient data is ever stored.

The whole flow is designed around three principles: **anonymise first, never block the user, never overwrite silently.**

---

## 2. What "anonymisation gate" means in plain English

Before the platform looks at a single number, it removes everything that could identify a patient.

**What gets removed every time, automatically:**
- Patient name and surname
- Hospital number
- Episode number
- Internal transfer-in (ITI) number
- External transfer-in (ETI) number
- Any column not on the known operational allowlist (totals, triage P1/P2/P3 counts, arrival times by hour, transfer counts, deaths, discharges, carry-overs, weather, calendar)

**What the platform sees and keeps:**
- Aggregated counts per day and per hour
- Triage breakdowns (P1, P2, P3) without any patient link
- Operational totals (admissions, discharges, transfers, deaths)
- Calendar context (day of week, holiday flags, weather)

**What is shown back to the user after every upload:**
> *"File processed safely. Five patient-identifier columns were removed before analysis: Patient Name, Hospital Number, Episode Number, ITI Number, ETI Number. 31 daily records and 744 hourly records were extracted as aggregate counts. No patient-level data was stored."*

That message also goes into an audit log that information governance can review on demand.

---

## 3. Part A — the one-time historical load (80 files)

### Why we treat this differently
80 files is roughly 5–12 minutes of pure processing time. We could ask hospital staff to do it through the browser, but on the very first try we do not want to discover that the WiFi dropped at file 47 or that one of the 2019 spreadsheets has a quirky header. The historical load is a **one-time risk** — we should take it once, in the safest place, with the IT team next to the screen.

### What happens, step by step

**Before the day**
1. Information governance signs off the anonymisation gate (§2).
2. IT confirms the server has the pipeline installed and that we have a backup location for the audit log.
3. The 80 spreadsheets are copied to a secure folder on the server. They never go through email, USB sticks, or personal drives. Recommended path: a dedicated folder readable only by the pipeline service account.

**On the day (roughly 30–60 minutes, mostly waiting)**
1. **Inventory check.** The IT team runs one command: *"how many files do you see, which months do they cover, are any duplicates."* This is the same `python run_pipeline.py --check` already in the pipeline.
2. **Dry run on one file.** Process the first file end to end — anonymisation, extraction, validation — and visually confirm the receipt. This catches any environment problem in 30 seconds rather than 30 minutes.
3. **Bulk run.** Process all 80 files. The pipeline already supports this: each file goes through the anonymisation gate, then daily + hourly extraction, then reconciliation, then validation. Progress prints to the console.
4. **Validation report.** When done, the pipeline produces a one-page report: total records, date range, total arrivals, any files that failed validation, any unexpected columns that were stripped. This report goes to information governance and to the project lead.
5. **Promotion to the platform.** A single command — `POST /api/pipeline/jobs/{job_id}/promote` — pushes the four resulting aggregate CSVs into the same dataset registry that the platform already uses today. The dashboards immediately reflect seven years of data.
6. **Cleanup.** The sanitised intermediate files are deleted. The raw 80 spreadsheets either stay in the locked source folder under a documented retention policy, or are removed — whichever information governance prefers.

### What the hospital sees
Nothing during the run — this happens on the server. When the IT team confirms it's done, leadership opens the platform and **seven years of arrivals data is already there.** The next month onwards uses Part C.

### Realistic timing for the historical load
- Preparation and sign-off: a few days, mostly waiting for approvals.
- The actual run: **30–60 minutes including the dry run and the validation review.**

### What can go wrong, and what we do about it
- *A spreadsheet has a malformed header.* The pipeline already detects headers dynamically and will either adapt or flag the file. The flagged file is set aside and reviewed manually; the other 79 finish.
- *Two files cover the same month.* The pipeline keeps the latest by date and logs the conflict — but the IT team is asked to confirm the choice rather than letting it happen silently.
- *The validation report shows an unexpected column.* This means the source spreadsheets contain something new that our allowlist does not know about. The bulk run is paused, the column is reviewed (was it PII? was it useful?), the allowlist is updated, and we resume.

---

## 4. Part C — every month afterwards (the ongoing flow)

### What this replaces
Today, when a new month's data is ready, an analyst runs the pipeline on their laptop, then uploads CSVs to a private repo. From Part C onwards, the hospital staff member who has the spreadsheet **drops it straight into HealthForecast.** No analyst in the middle.

### What the user sees, step by step

**Step 1 — open the Data Hub page**
The user clicks **Data Hub** in the sidebar. They see a drop zone: *"Drag your Casualty Daily Register file here. One month or several — both work."*

**Step 2 — drop the file (or files)**
They drag the new month's `Casualty_Daily_Register_2026_02.xlsx` into the zone. Within a second, the page shows:
> *"1 file detected. Naming pattern matches. Ready to upload."*

If the filename is wrong (typo, wrong format), the file is shown in red with a clear message before anything is sent. They fix it locally and try again.

**Step 3 — upload and anonymise (5–10 seconds)**
The file uploads. The anonymisation gate runs **in memory before anything is written to disk**. The raw file never lands on permanent storage. The user sees the receipt from §2.

**Step 4 — background processing (a few seconds per file)**
A progress card appears with the file's current phase:
- *Queued → Anonymised → Extracting daily → Extracting hourly → Reconciling → Validating → Ready.*

For a single month, this is roughly 5–10 seconds. The user can close the tab — the job continues. A small toast appears: *"Processing in background. You can leave this page."*

**Step 5 — done**
When the file is ready, the platform offers two buttons:
- **Add to dataset** — promotes the new month into the live dataset.
- **Review first** — opens a preview of what was extracted so the user can confirm before promotion.

If the new month covers dates that already exist in the dataset, the platform **asks** what to do: *"This file overlaps with data from March 2026 already in the system. Replace, skip the overlapping days, or keep both?"* — never silently overwrites.

### What if the user drops 80 files into Part C?
The same flow works for 80 files. The browser does not send one giant request — it sends **small batches of 5 files at a time**, sequentially, in the background. The progress board grows to 80 rows. Total time: roughly 10–15 minutes. The user can walk away and come back. This is why we can confidently say "one month or several — both work."

### What can go wrong, and what we do about it
- *Network drops mid-upload.* Only the batch in flight fails. The other batches keep going. A "Retry failed" button re-sends just the broken ones.
- *One file has a quirky structure.* That file lands in the progress board with a red status and a one-line reason. The other files finish normally. The user contacts support or uploads a fixed file.
- *The user uploads the same month twice.* The platform detects the duplicate by file hash and shows: *"This file looks identical to one you uploaded on 2026-02-15. Upload anyway?"*

---

## 5. Side-by-side comparison

| | **Part A — historical load (one-off)** | **Part C — monthly upload (ongoing)** |
|---|---|---|
| Who does it | IT team, on the server | Any authorised hospital staff member, in a browser |
| Where | Inside the hospital's secure server | Through the Data Hub page |
| Volume | 80 files at once | Usually 1 file; up to many at once |
| Time | 30–60 minutes including review | 5–15 seconds for a single file |
| When we use it | Once, to backfill seven years of data | Every month from then on, indefinitely |
| Anonymisation gate | Yes — same gate as Part C | Yes — same gate as Part A |
| Audit log entries produced | One per file (80 entries) | One per file (1 per month) |
| User sees a progress board | Console output for IT | Live progress card in the browser |

The pipeline code and the anonymisation gate are **the same in both parts.** Only the way the user starts the job differs.

---

## 6. Safety, privacy, and control (applies to both A and C)

1. **Anonymisation first, always.** No code path bypasses the gate. If the gate cannot identify a file's structure with confidence, the upload is rejected, not "processed cautiously."
2. **Raw files never land on persistent disk.** They live in memory through the gate and are deleted as soon as the aggregate CSVs are produced.
3. **No silent overwrites.** Any upload that touches dates already in the dataset asks the user what to do.
4. **Every upload produces a receipt** the user sees and that information governance can review.
5. **Per-user audit log.** Who uploaded, when, which file (by hash, not by raw contents), what was stripped, whether they promoted it.
6. **Disk hygiene.** Sanitised intermediate files are deleted on success. Failed jobs keep one sanitised copy for 24 hours so the IT team can debug, then it is deleted automatically.
7. **One "off switch."** A single admin setting disables the upload routes entirely without taking the rest of the platform down.
8. **Per-user permissions.** Only users in the *"Data Loader"* role can upload. Read-only users can see dashboards but cannot push data in. (This is a small addition to whatever auth setup we end up with.)

---

## 7. What we need before we start

A short, mostly administrative list.

1. **Information governance sign-off** on §2 (the anonymisation gate) and §6 (the safety controls). This is the only blocker that is not engineering.
2. **A nominated IT contact** who will be present for the Part A historical load.
3. **The 80 historical spreadsheets** copied to a secure folder on the server, by IT, before the run day.
4. **A defined retention policy** for the raw historical files: do we delete them after the load, or keep them in the locked source folder under access controls? Information governance decides.
5. **A defined retention policy** for the audit log itself: how long do we keep it, who can access it?
6. **A list of authorised "Data Loader" users** for the ongoing Part C uploads — typically 2–3 named hospital staff plus the IT contact as backup.

---

## 8. Timeline

A realistic schedule from "decision made" to "platform live with seven years of data plus an ongoing monthly upload route."

| Step | Who | Duration |
|---|---|---|
| Sign-off on the anonymisation gate and safety controls | Information governance | a few days, mostly waiting |
| Build the anonymisation gate | Engineering | 2–3 days |
| Build the upload endpoints and background job system | Engineering | 3–4 days |
| Build the Data Hub progress board (the UI) | Engineering | 2–3 days |
| Dry-run Part A on one file end-to-end | Engineering + IT | half a day |
| Execute Part A on the 80 historical files | IT, supervised by engineering | 30–60 minutes on the day |
| Review the validation report with information governance | All three | half a day |
| Open Part C to the first two authorised users for a week of "soft launch" | Authorised users | a week of normal usage |
| Open Part C to the full authorised user list | Project lead announces | one day |

End-to-end, allowing for governance, this is roughly **3 weeks of work + a week of soft launch + governance review windows.**

---

## 9. Frequently asked questions

**Can we really not just upload all 80 files in one browser action?**
Technically, yes. The browser will accept the drop and the server will accept the request. But a single 10-minute HTTP request **will** fail in practice — corporate firewalls, WiFi blips, server timeouts. The right way to support "all 80 in one go" is what Part C already does: the browser splits the drop into small batches behind the scenes, sequentially. From the user's perspective they dropped 80 files; from the network's perspective each request finishes in seconds. We get the user experience without the fragility.

**Why does Part A even exist if Part C can handle 80 files?**
Because the **first ever** time we run the pipeline against 80 spreadsheets that have lived in someone's filing system for seven years, we want the IT team next to the screen with the full validation report in front of them. After that, the ongoing flow does not need that level of supervision — but the historical backfill should have it once.

**What happens if a new spreadsheet has a column we have never seen before?**
The anonymisation gate is **default-deny**: anything not on the operational allowlist is dropped. Then the validation step flags the unknown column for engineering to review. The upload still finishes — but the unknown column is recorded so we can decide whether to keep it in future uploads or treat it as PII.

**What about files older than 2019 or newer than the current month?**
The pipeline reads the year and month from the filename. Files outside the configured range are accepted, processed the same way, and added to the dataset. No code change needed — the system is date-agnostic by design.

**Will users be allowed to delete data after upload?**
Yes, via the existing `/api/datasets/{id}` clear endpoints — but only authorised users, and every clear action is logged the same way as an upload. The audit trail is symmetrical.

**Does any of this cost more in cloud spend?**
The processing is CPU-bound for a few minutes during a bulk load and a few seconds for a monthly upload. Storage is tiny — aggregate CSVs are megabytes, not gigabytes. The cost impact is negligible compared to the AI assistant layer.

---

---

# Appendix — Technical notes for the development team

Engineers can use this as a build spec. Hospital staff can stop at section 9.

## A. New module layout

```
api/
├── pipeline/
│   ├── __init__.py
│   ├── anonymise.py       three-layer gate (allowlist + blocklist + free-text scan)
│   ├── runner.py          thin wrapper around the existing run_pipeline.py functions
│   ├── jobs.py            job table (SQLite to start; Supabase later)
│   ├── audit.py           append-only audit log writer
│   └── promote.py         pushes produced CSVs into core/registry.py
└── routers/
    └── pipeline.py        FastAPI endpoints
```

The existing pipeline code at `C:\Users\BIBINBUSINESS\OneDrive\Desktop\data transformation pipline\healthforecast_pipeline\` is added as a vendored Python package (or git submodule). We do **not** rewrite its extraction logic — we import its callable functions (`extract_daily_data`, `extract_hourly_data`, `reconcile_daily_with_hourly`, `clean_data`, `build_clinical_hourly`).

## B. Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/pipeline/upload` | Accept up to N files (`N=5` per batch from the UI). Run anonymisation gate immediately, persist sanitised files to job queue, return `batch_id` + per-file `job_id`s. |
| `GET` | `/api/pipeline/jobs/{job_id}` | Single-file status (phase, percent, error if any, anonymisation receipt). |
| `GET` | `/api/pipeline/batches/{batch_id}` | Bulk status across all files in a batch. Used by the progress board. |
| `POST` | `/api/pipeline/jobs/{job_id}/promote` | Promote a completed job's CSVs into `core/registry.py`. Triggers any dependent group rebuilds. |
| `POST` | `/api/pipeline/jobs/{job_id}/retry` | Re-run a failed job from the sanitised file (no re-upload needed). |
| `DELETE` | `/api/pipeline/jobs/{job_id}` | Discard a job and its sanitised file. Logged. |
| `GET` | `/api/pipeline/audit?from=…&to=…` | Return the audit log slice for governance review. |

For Part A, a thin CLI wrapper (`scripts/bulk_load.py`) does exactly what `POST /api/pipeline/upload` does but reads from a server folder instead of an HTTP request. Same anonymisation gate, same job records, same promotion path.

## C. Anonymisation gate (`api/pipeline/anonymise.py`)

Three layers of defence:

1. **Column allowlist.** Only headers matching the known operational schema (defined in `core/datasets.py` expected_columns + the PII-stripped operational columns from `pipeline_config.py`) survive. Everything else is dropped.
2. **Hard blocklist.** Even if the allowlist somehow accidentally permits one, the named PII columns from `pipeline_config.py:PII_COLUMNS` are explicitly blocked: `Pt Name & Surname`, `Hosp Number`, `Episode Number`, `ITI Number`, `ETI Number`.
3. **Free-text scan.** Remaining cells are scanned for: 13-digit SA ID patterns, sequences that look like hospital numbers, and any string in a column declared numeric. A hit fails the upload and surfaces a governance alert — it never silently passes.

The gate runs in memory using `openpyxl`'s read-only mode. The raw bytes never reach a `write()` call.

## D. Background processing

FastAPI `BackgroundTasks` is sufficient for current volumes (5–12 min worst case for the bulk load, seconds for monthly). State lives in a SQLite jobs table:

```
job_id, batch_id, filename, sha256, status (queued|anonymising|extracting|reconciling|validating|ready|failed),
phase_progress (0-1), error, anonymisation_receipt_json, created_at, finished_at, uploaded_by
```

If we outgrow `BackgroundTasks` (multi-tenant, larger jobs), promote to a small Redis/RQ or arq queue without changing the public endpoints.

## E. Chunked upload from the UI

The Data Hub page batches files **5 at a time**, sequentially, via `fetch`. Each batch returns its `batch_id` and the UI polls `GET /api/pipeline/batches/{batch_id}` every 2 seconds for status. No streaming protocol needed.

Upload size limit on uvicorn (`--limit-max-requests` and body size in the ASGI server) must be raised to accommodate ~50 MB batches. Default is too low.

## F. Promotion

`POST /api/pipeline/jobs/{job_id}/promote` writes each of the four produced CSVs into `core/registry.py` exactly as if they had come through `/api/datasets/{id}/upload` — including the metadata validation that already lives in `routers/datasets.py:_ingest_csv`. Any prepare groups that depend on the promoted dataset are invalidated and offered for rebuild on the Prepare page.

## G. Storage layout on the server

```
/var/healthforecast/
├── jobs/
│   ├── <batch_id>/
│   │   ├── sanitised/      Excel files after the anonymisation gate; deleted on success
│   │   └── intermediate/   produced CSVs awaiting promotion
│   └── audit.log           append-only; daily-rotated; signed if governance requires
└── pipeline.sqlite         the jobs table
```

Retention: sanitised files deleted on success, kept 24 h on failure. Intermediate CSVs deleted after promotion. The audit log retention follows whatever §7 step 5 specifies.

## H. First commit checklist (Part A only)

The minimum useful first commit, enough to run the historical load by hand:

- [ ] Vendor the pipeline package under `api/vendor/healthforecast_pipeline/`.
- [ ] Add `api/pipeline/anonymise.py` with the three-layer gate and tests against a known-PII Excel fixture.
- [ ] Add `api/pipeline/runner.py` that calls the vendored extraction functions on a single sanitised file.
- [ ] Add `api/pipeline/promote.py` that writes outputs into `core/registry.py`.
- [ ] Add `api/pipeline/audit.py` and `api/pipeline/jobs.py` with a SQLite-backed `jobs` table.
- [ ] Add `scripts/bulk_load.py` — the Part A CLI: reads files from a folder, runs the gate + runner + promote on each, prints a validation report.
- [ ] One pytest covering a known-PII fixture going in and a column-stripped DataFrame coming out.

A second PR adds the HTTP endpoints + the Data Hub UI for Part C. Same pipeline, same gate, same audit log — only the trigger differs.

---

---

# Part D — The Data Access Gate (front-of-house onboarding flow)

Everything above is about *how* data gets onto the platform. Part D is about *routing the user to the right door the moment they sign in* — so an upload-capable user lands on the upload page, a read-only user lands on the analysis, and a user whose data isn't on the server yet is sent to their administrator instead of hitting a dead end.

This is a **UI-only** addition. It changes no backend behaviour and adds no new endpoints — it reuses the dataset endpoints that already exist. The real anonymisation gate and `/api/pipeline/*` background jobs (Parts A & C) remain the follow-up work; Part D simply *leads into* the existing Data Hub when the user chooses to upload.

## D.1 The decision the gate makes

Immediately after sign-in, before the dashboard, the user is asked a short branching question with **three terminal outcomes**:

```
                  ┌─ "Is your data already on the server?" ─┐
                 YES                                        NO
                  │                                          │
   "What would you like to do?"                 ┌─ Contact the admin ─────────┐
        │                    │                  │ + Request-access form        │
   Upload new           Use existing            │ (data not on server yet,     │
   data                 analysis                │  user cannot self-serve)     │
        │                    │                  └──────────────────────────────┘
        ▼                    ▼
   Data Hub            Dashboard
   (upload → pipeline   (forecast /
    → integrated)        prediction /
                         optimization)
```

| Outcome | Where it goes | Meaning |
|---|---|---|
| **Yes → Upload new data** | Data Hub (`upload` route) | The user has a new Casualty Daily Register file to add. It is validated, fed into the pipeline, and integrated into the analysis dataset. |
| **Yes → Use existing analysis** | Dashboard (`dashboard` route) | Data is already on the server; the user just wants to consume the analysis — dashboards, forecasts, predictions, optimization. This is the "read-only configuration." |
| **No → Contact admin** | In-gate contact + request-access form | The data has not been loaded onto the server. The one-time historical load (Part A) is an admin/IT task, so the user is given contact details and a form to request access. |

## D.2 Decisions already locked for this build

1. **Placement:** the gate appears **after sign-in, on every login** (no "don't ask again" yet). Flow becomes `landing → welcome → gate → app`.
2. **Scope:** **gate UI only** in this pass. No new backend. The upload outcome leads to the existing Data Hub; the full anonymise-and-run-pipeline backend stays as the Appendix follow-up.
3. **"No data" path:** a **contact-admin screen plus a request-access form** (name, hospital, work email, optional message).

## D.3 Smart pre-answer (not a blind question)

Q1 ("is the data on the server?") is pre-answered using endpoints that already exist, then confirmed by the user:

- `GET /api/datasets/inventory` → `loaded_count` / `total` (see `api/routers/datasets.py:187`).
- `GET /api/datasets/source/status` → `configured` (see `api/routers/datasets.py:248`).

Rule: **data is considered "on the server" if `loaded_count > 0` OR `source.configured` is true.** The gate shows a detection chip ("We detected 6/7 datasets loaded, source connected") and marks the matching choice card as *Suggested* — but the user still chooses, so detection being wrong never traps them.

## D.4 Files to add / change

### New file — `src/pages/DataAccessGate.jsx`

A self-contained, full-screen page (styled like `Welcome.jsx` / `Landing.jsx`: dark gradient over `/images/login-bg1.jpg`, `btn-primary`, rounded glass cards). It is a 3-state machine:

- `q1` → "Is your data on the server?" → **Yes** goes to `q2`, **No** goes to `admin`.
- `q2` → "What would you like to do?" → **Upload** calls `onNavigate('upload')`, **Use existing** calls `onNavigate('dashboard')`.
- `admin` → contact details + request-access form.

Props: `{ onNavigate }` (same convention as every other page).

On mount it calls `api.datasets.inventory()` + `api.datasets.sourceStatus()` (both already exported in `src/api/client.js:58-69`) to compute the detection chip and the *Suggested* badge.

The request-access form has no backend yet, so on submit it appends the request to `localStorage` under `hf_access_requests` and shows a confirmation. A `// wire to an email/notify endpoint later` comment marks the seam.

Reference skeleton (full component is ~330 lines; this is the shape):

```jsx
import { useEffect, useState } from 'react';
import Icon from '../components/Icon';
import { api } from '../api/client';

export default function DataAccessGate({ onNavigate }) {
  const [step, setStep] = useState('q1');          // 'q1' | 'q2' | 'admin'
  const [detect, setDetect] = useState(null);      // {onServer, loadedCount, total, configured}

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      api.datasets.inventory(ctrl.signal),
      api.datasets.sourceStatus(ctrl.signal).catch(() => null),
    ]).then(([inv, src]) => setDetect({
      loadedCount: inv?.loaded_count ?? 0,
      total: inv?.total ?? 7,
      configured: !!src?.configured,
      onServer: (inv?.loaded_count ?? 0) > 0 || !!src?.configured,
    })).catch(() => setDetect({ loadedCount: 0, total: 7, configured: false, onServer: false }));
    return () => ctrl.abort();
  }, []);

  // q1: two ChoiceCards (Yes -> setStep('q2'), No -> setStep('admin')), detection chip from `detect`
  // q2: two ChoiceCards (Upload -> onNavigate('upload'), Use existing -> onNavigate('dashboard'))
  // admin: contact card + request-access form (localStorage 'hf_access_requests'), Back -> setStep('q1')
}
```

Building blocks to implement inside the file: `Shell` (gradient page frame + Home button), `Panel` (kicker/title/sub + optional Back), `ChoiceCard` (icon, title, desc, CTA, hover lift, *Suggested* badge), `ContactRow`, and a `Field` input helper. Use `Icon` names that already exist in the project: `check`, `settings`, `upload`, `chart`, `users`, `file`, `home`, `arrow-left`.

### Changed file — `src/App.jsx`

Add the import and route the gate as an early-return page alongside `landing`/`welcome`:

```jsx
import DataAccessGate from './pages/DataAccessGate';
// ...
if (page === 'landing') return <Landing onNavigate={setPage} />;
if (page === 'welcome') return <Welcome onNavigate={setPage} />;
if (page === 'gate')    return <DataAccessGate onNavigate={setPage} />;   // <-- add
```

(The gate lives outside `AppShell` because it is a pre-app screen, exactly like `landing` and `welcome`.)

### Changed file — `src/pages/Welcome.jsx`

Point the "Sign in" button at the gate instead of straight to the dashboard:

```jsx
// line 80, currently: onClick={() => onNavigate('dashboard')}
onClick={() => onNavigate('gate')}
```

## D.5 Data Hub follow-through (small, optional in this pass)

When a user arrives at the Data Hub *from the gate's "Upload new data" choice*, add a one-line banner on `DataHub.jsx`: *"New data uploaded here is validated and added to the analysis dataset."* This banner is also the natural seam where the real `/api/pipeline` background-job flow (Part C) plugs in later — today it just leads to the existing per-file upload tiles.

## D.6 What this pass explicitly does NOT do

- No anonymisation gate, no `/api/pipeline/*` endpoints, no background jobs, no SQLite job table — all of that stays in Parts A/C above.
- No real auth/RBAC — the gate is a routing aid, not a security boundary (same posture as the existing `Admin.jsx` demo code).
- The request-access form does not yet email anyone; it records to `localStorage` until a notify endpoint exists.

## D.7 Acceptance checklist for Part D

- [ ] After sign-in, the gate appears every time (before the dashboard).
- [ ] Q1 shows a detection chip and a *Suggested* badge driven by `inventory` + `source/status`.
- [ ] Yes → Upload navigates to the Data Hub (`upload`).
- [ ] Yes → Use existing navigates to the Dashboard (`dashboard`).
- [ ] No → shows admin contact details and a working request-access form (name/hospital/email required), with a confirmation state after submit.
- [ ] Back buttons return to Q1; Home returns to the landing page.
- [ ] No backend changes; existing endpoints only.
