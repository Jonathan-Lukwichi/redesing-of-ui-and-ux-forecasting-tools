# Deploying HealthForecast to the Cloud — The Plan

How we get HealthForecast off a laptop and onto the internet, in a way that is safe for hospital data, affordable, and easy to operate. Written for hospital leadership, IT, and information governance first; engineers second.

---

## 1. The short version

We will deploy HealthForecast in **two tracks running side by side**:

- **Track 1 — the Demo site.** A public URL like `demo.healthforecast.app` with **no real hospital data**. This is for leadership presentations, supplier meetings, conference demos. Cheap (around US $20 / month), fast to set up, and uses the platform's built-in demo data.
- **Track 2 — the Hospital site.** A private URL like `app.healthforecast.hospital.ac.za`, hosted **inside South Africa**, used by authorised staff with real anonymised data. More expensive (US $150–300 / month at first), takes longer to provision because of governance, but is the real platform.

The demo can go live in **about a week**. The hospital site takes **3–6 weeks** because of cloud-region setup, information-governance sign-off, and a controlled hand-over from the analyst's laptop to the cloud.

This document explains both tracks, what each costs, what each is for, and what we need from leadership and IT to start.

---

## 2. Why two tracks and not one

The honest reason: **a public demo site and a real-data site have completely different requirements.**

| | Demo site | Hospital site |
|---|---|---|
| Audience | Anyone with the link — investors, board, journalists | Named hospital staff only |
| Data | The platform's built-in demo data only — no patient files ever | Anonymised aggregate data produced by the pipeline |
| Where it physically lives | A US/EU cloud is fine (cheaper, faster setup) | A South African data centre (POPIA + data residency) |
| Login | None or a simple shared password | Per-user accounts, role-based access |
| Cost | ~$20/month | $150–300/month at our scale |
| Time to launch | ~1 week | 3–6 weeks |
| Who owns it | Engineering | The hospital, via a service agreement |

Trying to make one URL do both jobs ends badly: either we under-secure the real-data site, or we over-engineer the demo and slow ourselves down. Two tracks lets each be the right size.

---

## 3. What "in the cloud" actually means for this platform

HealthForecast has three moving parts that need a home:

1. **The website itself** — the pages, charts, and buttons users see. These are just files (HTML, CSS, JavaScript) built from the React code in `src/`. They go on a **content-delivery network** (CDN) that serves them from servers close to the user. Fast and cheap.
2. **The backend API** — the FastAPI Python code in `api/` that does the forecasting, the optimisation, the data work. This needs a **server that runs Python** and can scale up when many people use it at once.
3. **The data** — datasets, prepared groups, audit logs, user accounts. These need **proper storage** that survives a server restart. Today these all live in the Python process's memory, which is fine on a laptop but the cloud requires real storage — a database for structured records, object storage (like an S3 bucket) for the CSV files.

Plus, when the AI assistant and the upload pipeline ship, there are two extra pieces:

4. **An outbound connection to Anthropic** for the AI calls. Just an API key on the server — no extra infrastructure.
5. **A background job runner** for the pipeline (so large file uploads don't tie up the website). Comes "for free" with most cloud platforms.

---

## 4. Track 1 — The Demo site

### What it's for
Showing the platform to anyone who hasn't seen it. Board meetings, vendor demos, recruitment, conferences, leadership briefings. The platform has demo endpoints already (`/api/forecast/demo`, `/api/staff/demo`, `/api/supply/demo`, `/api/kpis/demo`, `/api/actions/demo`) that produce realistic-looking output with no real patient data. The demo site uses only these.

### Where it lives
- **Frontend:** Vercel or Netlify (free tier covers this).
- **Backend:** Render, Railway, or Fly.io (around US $7–20/month for a small always-on instance).
- **Region:** US or EU is fine — there is no PII involved.

### What we need to set up
1. A domain name (something like `demo.healthforecast.app`) — about US $12/year.
2. A Vercel/Netlify account, free.
3. A Render/Railway/Fly account, paid tier so the backend doesn't go to sleep.
4. **The AI assistant turned off by default** on the demo site — it would cost money for every visitor's curiosity. Optional: turn on with a demo-only key that has a tiny daily cap.

### What it costs
- Domain: ~US $1/month
- Frontend hosting: free
- Backend: US $7–20/month
- AI (optional): up to whatever cap we set; suggest US $10/month if enabled
- **Total: under US $30/month**

### Timeline
- Day 1–2: Set up the accounts, register the domain, configure DNS.
- Day 3–4: Connect the GitHub repo to Vercel and Render. Push triggers an automatic deploy.
- Day 5: Configure environment variables, test the demo endpoints.
- Day 6–7: Soft launch with the project team. Public URL ready.

### What it does NOT do
- Does **not** accept file uploads of any kind.
- Does **not** store any user data.
- Does **not** connect to any hospital system.
- Does **not** persist anything between deploys.

This keeps the demo site simple and safe — there is nothing on it that could be sensitive, ever.

---

## 5. Track 2 — The Hospital site

### What it's for
The platform that hospital staff actually use. Anonymised aggregate data from the pipeline lives here. The AI assistant runs against real (anonymised) numbers. Charge nurses approve actions from real forecasts. Supply coordinators reorder against real stock levels.

### Where it lives — the data-residency question
South Africa's POPIA law strongly prefers — and for some categories requires — that personal information stays in South Africa. Even though we anonymise before upload, the **safest answer** is to host the hospital site inside the country. Two realistic options:

**Option B1 — AWS Cape Town (af-south-1).**
Mature, well-known to most IT teams, signed Business Associate / Data Processing agreements available. Around US $150–250/month at our scale.

**Option B2 — Azure Johannesburg (South Africa North).**
Also South African, often easier for hospitals that already use Microsoft 365. Similar pricing.

**Option B3 — On-premise inside the hospital network.**
The platform runs on a server the hospital owns. Best data control, no cross-border concerns at all, but IT must operate it (backups, security patches, monitoring). Lower running cost but higher operational burden.

**My recommendation:** start with **B1 (AWS Cape Town)**. Mature ecosystem, predictable cost, and we can move to B3 later if information governance prefers it.

### The pieces, in plain English
| Piece | What it does | Cost guide |
|---|---|---|
| **Frontend hosting** (CloudFront + S3) | Serves the website to users worldwide | ~US $5/month |
| **Backend container** (ECS Fargate or AppRunner) | Runs the FastAPI server, scales up under load | ~US $40–80/month |
| **Database** (RDS PostgreSQL, small instance) | Stores user accounts, audit logs, job state, prepared-group metadata | ~US $25–40/month |
| **Object storage** (S3 bucket in af-south-1) | Stores the aggregate CSVs and validated outputs | ~US $5–10/month |
| **Background worker** (a second small container) | Runs the pipeline jobs from data uploads | ~US $20/month |
| **Secrets manager** | Holds the Anthropic API key, database password | ~US $1/month |
| **Logs + monitoring** (CloudWatch) | Audit trail, error alerts | ~US $10/month |
| **Domain + certificate** | The HTTPS URL | ~US $1/month |
| **AI assistant calls** (Anthropic) | Daily budget cap, see [docs/api-integration-for-ai.md](api-integration-for-ai.md) | US $5–50/month |
| **Total** | | **US $115–260/month** |

This is real money but a fraction of one nurse's overtime hour per month.

### What we need to set up
1. **An AWS account in the South African Cape Town region** — set up by IT or the engineering team. About 1 day.
2. **A Data Processing Addendum** signed between AWS and the hospital. AWS provides a standard form. Usually a few days through hospital legal.
3. **A domain name** the hospital owns — e.g. `app.healthforecast.hospital.ac.za`. The hospital's IT controls the DNS record.
4. **Two databases:** the application database (Postgres) and the audit log database. Same instance, separate schemas.
5. **Three buckets:** one for aggregate CSVs, one for temporary sanitised uploads (auto-deleted after 24h), one for daily backups.
6. **A pipeline of automatic deploys** from GitHub: every commit to the `main` branch triggers a build + deploy. We add a manual approval gate for the production deploy.
7. **A monitoring dashboard** for the hospital IT team — uptime, error rate, daily AI spend, recent uploads, recent audit log entries. One screen they check daily.

### Login and access
- Each authorised user has their own account.
- Roles: **Viewer** (read dashboards only), **Data Loader** (can upload files via Part C), **Approver** (can approve actions in the Action Center), **Admin** (manages users and settings).
- Login via the hospital's existing single sign-on (SSO) if available, otherwise email + password with two-factor authentication required.

### Timeline (3–6 weeks total)
| Week | What happens |
|---|---|
| 1 | Information governance starts the data-residency and DPA paperwork. Engineering provisions the AWS account in Cape Town. |
| 2 | Backend deployed to a staging environment. Database, buckets, secrets manager configured. Frontend deployed. |
| 3 | Single sign-on integration. Roles and permissions. First two test users invited. AI assistant turned on with a low daily cap. |
| 4 | The historical 80-file load is performed on the staging environment (this is the rehearsal of [docs/data-upload-plan.md Part A](data-upload-plan.md)). Validation report reviewed by information governance. |
| 5 | Production environment provisioned (a clone of staging with stricter access). Historical load executed on production. |
| 6 | Soft launch to the named user list. Monitoring watched daily. After a stable week, full launch. |

If sign-offs come quickly we are at the bottom of that range. If governance needs more rounds, the top.

---

## 6. The technical change we need to make first

There is one honest engineering issue to flag: today the platform stores its loaded datasets and prepared groups **in the Python process's memory** (see `api/core/registry.py` and `api/core/prepare_registry.py`). On a laptop that is fine. In the cloud, every restart wipes that memory, and we restart for every deployment.

Before Track 2 ships, we move three things from process memory to real storage:

1. **Loaded datasets** → stored as CSV files in the af-south-1 S3 bucket, indexed by an entry in the Postgres database. On startup, the API rebuilds its registry from storage.
2. **Prepared groups** → same pattern: CSV in S3, metadata in Postgres.
3. **Job state** for the upload pipeline → already planned for Postgres in [docs/data-upload-plan.md](data-upload-plan.md).

This is about 2–3 days of work and is the **only** structural change cloud deployment requires. It does not change anything the user sees.

---

## 7. Safety, privacy, and control (Track 2 specifically)

The cloud version inherits every safety control from the data-upload plan and adds the cloud-level ones:

1. **All traffic is HTTPS.** The site refuses plain HTTP connections.
2. **Database and bucket are not on the public internet.** Only the backend can reach them.
3. **The Anthropic API key lives in a secrets manager**, not in code or environment variables that anyone can read.
4. **Audit log is append-only.** Even an admin cannot delete an entry — only add a "this entry is disputed" note.
5. **Daily backups** of the database and the aggregate CSVs to a second S3 bucket in the same region. Restorable to any point in the last 30 days.
6. **The off switch from the upload plan is wired in.** Admin can disable uploads, disable the AI assistant, or put the platform in read-only mode from a single settings page.
7. **No PII ever reaches the cloud in unanonymised form.** This is enforced by the anonymisation gate (see [docs/data-upload-plan.md §2](data-upload-plan.md)). The cloud platform does not even contain code that knows how to read raw patient files — only the gate does.
8. **Quarterly access review.** A scheduled job emails the admin a list of every user, their role, and their last login. Inactive users are deactivated.

---

## 8. What we need from the hospital before starting

A short, mostly administrative list. Track 1 (demo) needs none of this. Track 2 needs all of it.

1. **A decision on cloud region:** AWS Cape Town, Azure Johannesburg, or on-premise. (Recommendation: AWS Cape Town.)
2. **Sign-off** on the DPA between AWS and the hospital.
3. **A hospital-owned domain name** for the application (e.g. `app.healthforecast.hospital.ac.za`).
4. **A nominated IT contact** who will hold the admin credentials and review the monitoring dashboard daily.
5. **The list of initial authorised users**, with their roles.
6. **A monthly cloud budget figure** — we suggest starting with US $300/month and adjusting after three months of real usage.
7. **Decision on single sign-on:** does the hospital have an SSO system (Microsoft Entra, Google Workspace, Okta) we should integrate with? Otherwise we use email + 2FA.
8. **Decision on backup retention:** 30 days, 90 days, or longer? (Recommendation: 90 days for the aggregate CSVs, 1 year for the audit log.)

---

## 9. Frequently asked questions

**Why not just use one of those "deploy with one click" platforms?**
For the demo site, that is exactly what we will do (Track 1). For the hospital site, those platforms do not let us choose a South African region, do not sign the data-processing agreement the hospital needs, and would put us in a position where POPIA compliance is unclear. The extra setup of AWS Cape Town is worth it for the real platform.

**What if the cloud provider has an outage?**
The dashboards go offline until the cloud provider recovers — typically minutes, occasionally hours. No data is lost (daily backups, real-time database replication). The forecasting models and the math are not affected; they come back the moment the server does. We will publish a status page so users know the platform is being worked on.

**What if the hospital's internet goes down?**
The platform remains running in the cloud. Hospital users can reach it from any other internet connection (mobile data, home). This is one of the side benefits of a cloud deployment — the platform is not tied to the hospital's physical network.

**Can we move to on-premise later?**
Yes. The platform is a standard Python + React stack with PostgreSQL. Moving from AWS to an on-premise server is straightforward — usually a weekend of work. We are not locked in.

**How is this different from putting the platform on a hospital laptop?**
Three things: (1) it is reachable from any authorised device, not just the one laptop; (2) it survives that laptop being lost, stolen, or broken; (3) it has proper backups and monitoring. A laptop deployment was right for the prototype phase; the cloud is right for the platform phase.

**Will deployment slow down development?**
The opposite. We will set up automatic deploys: every change pushed to the code repository builds the new version and deploys it to staging within minutes. A human approval gate then ships it to production. Engineers spend less time deploying, not more.

---

## 10. The simplest sentence we can promise leadership

> *"The platform will live on a South African cloud, under our control, behind a login, with daily backups, a clear audit trail of every action, and an off switch for the AI assistant — for under R 5,000 per month."*

That is the whole proposition in one line.

---

---

# Appendix — Technical notes for the development team

Engineers can use this as a build spec. Hospital staff can stop at section 10.

## A. Track 1 — Demo deployment

### Frontend (Vercel or Netlify)
- Connect the GitHub repository.
- Build command: `npm run build`.
- Output directory: `dist/`.
- Environment variables: `VITE_API_BASE_URL`, `VITE_AI_ENABLED=false` by default.
- Auto-deploy on push to `main`.
- A separate preview deploy per pull request.

### Backend (Render or Fly.io)
- A single Python service. Dockerfile based on `python:3.12-slim`.
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`.
- Requirements installed from `api/requirements.txt`.
- Environment variables: `CORS_ALLOWED_ORIGINS` set to the demo frontend's URL, `ANTHROPIC_API_KEY` only if AI is enabled, `AI_DAILY_BUDGET_USD=5`.
- Healthcheck on `GET /` — returns `{"status": "running"}` as the existing root route does.
- Always-on (no auto-sleep), 512 MB RAM, 0.5 vCPU is enough for the demo.

### What the demo does NOT have
- No database — demo endpoints return computed data.
- No file uploads — the `POST /api/datasets/{id}/upload` and pipeline endpoints are disabled via a feature flag `ALLOW_UPLOADS=false`.
- No persistent state — restart is harmless.

## B. Track 2 — Hospital deployment on AWS Cape Town (`af-south-1`)

### Network and account
- Dedicated AWS account, separate from any other workload, in `af-south-1`.
- AWS Organizations + SCP locking the account to that region only.
- Sign the AWS Data Processing Addendum and enable HIPAA-eligible services list (the South African equivalent processes are documented separately).

### Compute
- **Frontend:** CloudFront distribution backed by an S3 bucket (`healthforecast-frontend-prod`). The Vite build output is synced to this bucket on deploy.
- **Backend API:** ECS Fargate service, 1 vCPU / 2 GB to start, autoscaling 1–4 tasks. Behind an Application Load Balancer with a TLS cert from ACM.
- **Background worker:** A second ECS Fargate service running the same Docker image with a different entry command (`python -m api.pipeline.worker`). 1 vCPU / 2 GB. Reads jobs from the SQS queue or Postgres `jobs` table.

### Storage
- **Postgres:** RDS PostgreSQL 16, `db.t4g.small`, single-AZ to start, encrypted at rest, daily snapshots retained 30 days. Multi-AZ when usage warrants.
- **S3 buckets:**
  - `healthforecast-data-prod` — aggregate CSVs after pipeline processing. Versioned, lifecycle rules for cold storage after 1 year.
  - `healthforecast-uploads-prod` — sanitised intermediate files. Lifecycle rule deletes after 24 h.
  - `healthforecast-backups-prod` — daily DB + data backups. 90-day retention.
- **Secrets Manager:** stores `ANTHROPIC_API_KEY`, `DATABASE_URL`, JWT signing key.

### State migration from in-memory registries
The current `api/core/registry.py` and `api/core/prepare_registry.py` must persist. Concretely:

1. New tables `datasets` and `prepared_groups` in Postgres holding the metadata each registry already exposes (`id`, `filename`, `rows`, `signature_hash`, `metadata`, `created_at`).
2. The corresponding DataFrames stored as Parquet in the `data-prod` S3 bucket under `datasets/{id}/{signature_hash}.parquet` and `groups/{id}/{built_at}.parquet`.
3. `registry.put()` and `prepare_registry.put()` write both the row and the Parquet file.
4. `registry.get_df()` lazily loads the Parquet file into memory on first access, then caches in-process for that worker (LRU, capped at, say, 8 datasets).
5. On worker startup, no datasets are loaded — they are pulled on demand. This makes warm-up fast and restart-safe.

About 2–3 days of work. No public API changes — the existing routers in `api/routers/datasets.py`, `prepare.py`, `explore.py` keep working unchanged.

### Auth
- Cognito user pool for email + password + TOTP 2FA, OR
- SAML / OIDC federation with the hospital's identity provider, OR
- Both, with Cognito federating to the hospital IdP.
- Backend validates the Cognito-issued JWT on every request via a FastAPI dependency. Public routes (`/`, `/api/ai/health`) bypass.

### CI/CD
- GitHub Actions on push to `main`: lint → test → build frontend → build backend Docker image → push to ECR → deploy to staging ECS service.
- Manual approval gate (GitHub Environment) → deploy to production ECS service.
- A scheduled GitHub Action runs the bulk anonymisation tests nightly against a synthetic PII fixture, in case the gate's allowlist accidentally regresses.

### Monitoring
- CloudWatch dashboard with: API latency (p50/p99), error rate, daily Anthropic spend (custom metric from `ai/telemetry.py`), pipeline job throughput, audit log write rate.
- Alerts: 5xx rate over 1%, Anthropic spend > 80% of daily cap, database CPU > 80%, S3 4xx rate non-zero (sign of a misconfigured client).
- Audit log shipped to a separate CloudWatch log group with read-only IAM policy.

### Disaster recovery
- RTO 4 hours, RPO 24 hours. Achievable with daily RDS snapshots + S3 versioning.
- Quarterly restore drill: spin up a clone from yesterday's snapshot, verify the dataset registries rebuild correctly.

### Cost optimisations (after launch)
- Reserved capacity on RDS once usage stabilises (~30% saving).
- Fargate Spot for the background worker (the work is idempotent and retry-safe).
- CloudFront cache rules tuned per route — the dataset preview endpoints rarely change between uploads and can be cached for minutes, not seconds.

## C. First commit (Track 1 only)

Minimum useful first commit, enough to get the demo site online:

- [ ] Add a `Dockerfile` to the `api/` directory.
- [ ] Add `.dockerignore`.
- [ ] Add a `render.yaml` (or `fly.toml`) describing the backend service.
- [ ] Add a Vercel config (`vercel.json`) pointing at the Vite build.
- [ ] Add a `VITE_API_BASE_URL` environment variable to the frontend; default to `http://127.0.0.1:8000` in dev.
- [ ] Add a feature flag in `api/main.py` reading `ALLOW_UPLOADS` and `AI_ENABLED` from env.
- [ ] Add a `.env.example` listing every recognised variable.
- [ ] Add a one-page `docs/demo-deployment.md` with the URLs and how to redeploy.

Track 2 is its own series of commits and is gated on the in-memory-to-Postgres migration described in §B.
