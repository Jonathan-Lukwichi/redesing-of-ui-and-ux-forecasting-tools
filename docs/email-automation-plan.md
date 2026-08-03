# Email automation — phased plan

Three separate, currently-unbuilt "we'd want this eventually" notes were scattered
across `data-upload-plan.md`, `api-integration-for-ai.md` and `cloud-deployment-plan.md`.
This doc merges them into one roadmap, in the order they should actually be built.

**Nothing below exists in code yet.** There is no email library in
`api/requirements.txt`, no SMTP/API key in `.env.example`, and no real user
accounts (`Welcome.jsx`'s sign-in and `Admin.jsx`'s admin code are both
documented demo placeholders, not auth).

| Phase | What | Needs real auth first? | Effort |
|---|---|---|---|
| 1 | Request-access notify email | No | ~1 day |
| 2 | Weekly AI-written summary email | No | ~2–3 days |
| 3 | Auth email (verify / reset / 2FA) | **Is** the auth build | multi-week, gated on the cloud-deployment decision |

Recommendation: **build Phase 1 now** — it's cheap and gives real value (you
actually get notified instead of requests vanishing into `localStorage`).
Phase 2 is a nice dissertation demo ("the AI proactively briefs the director")
if you want it. Phase 3 should wait until the real cloud/auth migration in
`cloud-deployment-plan.md` is greenlit — bolting login emails onto the current
demo gate would be thrown-away work.

---

## Shared decision: email provider

Pick one transactional-email API — not raw SMTP. Two reasons specific to this
project:
- **Corporate TLS inspection** (see `CLAUDE.md` → Environment quirks) makes
  raw SMTP/`curl` to external hosts unreliable on this machine. A REST API
  called through the existing `httpx` + `truststore` pattern (same one
  `core/data_source.py` already uses for GitHub) sidesteps that.
- **512MB memory budget** — no local mail server, no heavy SDK.

**Recommended: Resend** (resend.com). Free tier (3,000 emails/month, 100/day)
covers this use case many times over; REST API is a single POST; a test/sandbox
sender domain works immediately (`onboarding@resend.dev`) so you don't need to
verify a custom domain until you want `noreply@healthforecast.jlwanalytics.com`
branding. SendGrid is the fallback if Resend is ever unavailable — same shape.

New file — `api/core/notify.py` (fat core, per the thin-router rule):
```python
"""Outbound transactional email. One thin wrapper so every caller (request-
access, weekly digest, future auth emails) shares one provider, one timeout,
one failure mode."""
import os
import httpx

_API_KEY = os.getenv("RESEND_API_KEY")
_FROM = os.getenv("NOTIFY_FROM_EMAIL", "onboarding@resend.dev")

def send_email(to: str, subject: str, html: str) -> bool:
    if not _API_KEY:
        return False  # not configured — caller decides how to degrade
    with httpx.Client(timeout=15) as c:
        r = c.post("https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {_API_KEY}"},
            json={"from": _FROM, "to": [to], "subject": subject, "html": html})
        return r.status_code < 300
```
New env vars (add to `api/.env.example` and `render.yaml` with `sync: false`):
`RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`, `NOTIFY_TO_EMAIL` (where access requests land).

---

## Phase 1 — Request-access notify email

**Current state.** `docs/data-upload-plan.md` Part D specs a `DataAccessGate.jsx`
page with a request-access form — but the page was never built (`src/pages/DataAccessGate.jsx`
doesn't exist, and `App.jsx` has no `'gate'` route). So this phase both builds
the form D.4 already designed **and** wires its `// wire to an email/notify
endpoint later` seam for real — no separate follow-up needed.

**Backend — new endpoint, `api/routers/datasets.py`** (fits the existing file;
no new router needed for one endpoint):
```python
class AccessRequest(BaseModel):
    name: str
    hospital: str
    email: EmailStr
    message: str | None = None

@router.post("/api/datasets/access-request")
def request_access(body: AccessRequest):
    sent = notify.send_email(
        to=os.getenv("NOTIFY_TO_EMAIL"),
        subject=f"HealthForecast access request — {body.hospital}",
        html=f"<p><b>{body.name}</b> ({body.email}) at <b>{body.hospital}</b> "
             f"requests access.</p><p>{body.message or ''}</p>")
    return {"sent": sent}
```
No patient data involved (name/hospital/work-email/message only) — this stays
inside the existing data-privacy posture.

**Frontend — build `src/pages/DataAccessGate.jsx`** per the D.4 skeleton
already written (3-state machine: `q1` on-server? → `q2` upload-or-use →
`admin` contact+form), wired into `App.jsx` as `if (page === 'gate') return
<DataAccessGate onNavigate={setPage} />`, and `Welcome.jsx`'s sign-in button
pointed at `'gate'` instead of `'dashboard'`.

**Form submit** — call `api.datasets.requestAccess(body)` (new `client.js`
entry) instead of only writing to `localStorage`; keep the `localStorage`
write too as an offline-friendly confirmation echo, but the email is now the
real notification path.

**Acceptance checklist**
- [ ] `RESEND_API_KEY` set locally in `api/.env`; test send verified via
      `api\.venv\Scripts\python.exe` (not `curl` — TLS-inspection quirk).
- [ ] Submitting the form on `/#gate` → `admin` sends a real email to
      `NOTIFY_TO_EMAIL` and shows the existing confirmation state.
- [ ] Missing `RESEND_API_KEY` degrades gracefully (form still confirms,
      `sent: false` logged) — never blocks the user-facing flow.
- [ ] `npm run build` + full Playwright suite pass (new route needs a
      no-horizontal-overflow + no-heavy-compute-on-load check, same pattern
      as every other page).
- [ ] Render env vars added with `sync: false`; redeploy; one real end-to-end
      test request sent from the live site.

---

## Phase 2 — Weekly AI-written summary email

**What it reuses.** The AI assistant's tool loop already has everything the
digest needs, read-only: `get_forecast`, `get_optimization`, `get_supply_status`,
`get_staff_status`, `lookup_knowledge` (`api/ai/tools.py`). The digest is one
more prompt through the same governed pipeline (`api/ai/chat.py`) — not a new
AI integration.

**Scheduling.** Don't run a scheduler inside the web dyno — it shares the
512MB budget and the "everything computes on demand" rule (`CLAUDE.md`) is
about to gain an explicit exception here, so keep it structurally separate.
Use a **Render Cron Job** (a second service in `render.yaml`, `type: cron`,
its own tiny container, runs once, exits — zero standing memory cost):
```yaml
  - type: cron
    name: healthforecast-weekly-digest
    runtime: docker
    schedule: "0 6 * * MON"     # 06:00 UTC every Monday
    dockerCommand: python scripts/send_weekly_digest.py
    envVars:
      - key: RESEND_API_KEY
        sync: false
      - key: NOTIFY_DIGEST_TO
        sync: false
      - key: ANTHROPIC_API_KEY
        sync: false
```
New script `api/scripts/send_weekly_digest.py`: calls the same tool functions
`ai/tools.py` exposes, feeds their output to a short fixed prompt ("write a
two-paragraph operations briefing from these numbers, no accuracy percentages"
— same public-app governance rule as chat), renders the reply into an HTML
email, sends via `notify.send_email`, and **writes one row to the existing AI
audit trail** (`api/ai/audit.py`) tagged `surface: "weekly_email"` so it shows
up in `Admin.jsx`'s audit table exactly like a chat call.

**Recipient list.** Small addition to `Admin.jsx` — a "Notifications" panel
(admin-only, same gate as the rest of that page) storing one or more
recipient emails server-side (a JSON file next to the audit log is enough;
no database needed at this scale).

**What this phase does NOT do:** no per-user subscription preferences, no
unsubscribe flow, no multi-hospital recipient targeting — single fixed list,
matching the platform's current single-tenant demo scope.

**Acceptance checklist**
- [ ] `python api/scripts/send_weekly_digest.py` run manually produces a
      correctly-formatted email with live numbers and no accuracy% leakage.
- [ ] Cron service deploys on Render; a manual "Trigger Run" from the Render
      dashboard sends a real email (cron schedules can't be tested locally —
      this is the one verification step that requires a live deploy).
- [ ] The send appears in `Admin.jsx`'s audit trail.
- [ ] Missing recipient list / missing API key: script exits cleanly, no
      Render cron failure alert spam.

---

## Phase 3 — Auth email (verification / password reset / 2FA)

**Do not start this until the cloud-deployment auth decision is made.**
`cloud-deployment-plan.md`'s "Login and access" section already plans real
accounts with email+password+2FA or SSO federation (Cognito/SAML/OIDC) as
part of the broader AWS migration — building custom verification-email
plumbing onto today's demo gate (`ADMIN_CODE = 'hf-admin-2026'` in
`Admin.jsx`, prefilled fake credentials in `Welcome.jsx`) would be thrown
away the moment that migration happens.

When that migration is greenlit, the two paths from `cloud-deployment-plan.md`
determine whether this phase needs any custom email code at all:
- **Cognito hosted UI** → AWS sends verification/reset emails natively; this
  phase becomes configuration, not code.
- **Roll-your-own** (FastAPI + users table) → reuses the same `notify.py`
  wrapper from Phase 1 for verification links and reset tokens, plus a TOTP
  library for 2FA codes.

No further action here until that decision is made — flagging it now only so
Phase 1/2 code (`notify.py`, the Resend account) is built in a way Phase 3
can reuse rather than replace.
