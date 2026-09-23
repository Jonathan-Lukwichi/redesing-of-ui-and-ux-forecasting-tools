# Security model and operator guide

How HealthForecast authenticates people, what each role may do, and what an
operator has to set before a deployment is safe to point at real users.

## What this replaced

The app previously had **no authentication at all**:

- the admin area compared a string constant (`hf-admin-2026`) that shipped
  inside the public JavaScript bundle, so anyone could read it or skip it
  entirely by setting the React state;
- `CORS` was `allow_origins=["*"]`, so any page on the internet could call the
  API with a visitor's browser;
- `POST /api/reports/email` accepted an arbitrary recipient, an arbitrary PDF
  attachment and an arbitrary model context with no session and no limit — an
  open mail relay attached to the deployment's own sending reputation;
- nothing was rate limited, so the model-backed endpoints could be driven by
  anyone who found the URL.

## Roles are territory, not rank

The first version of this ranked roles on a ladder (`viewer < planner < admin`).
That is the wrong shape for a hospital: a stock manager is not *less than* a
staffing manager, they are **sideways** — different territory, comparable
authority inside it. So a role is a **set of scopes**, and each route names the
one capability it needs.

| Role | Pages | May run | Decisions | Accuracy / audit / users | Data pipeline |
|---|---|---|---|---|---|
| `admin` | All | Both plans | All | ✅ | ✅ |
| `director` | All operational | — (reviews plans) | All, incl. alerts | ❌ | ❌ |
| `staff_manager` | Dashboard, Forecast, Staffing, Optimization, Actions | Staffing plan | Staff + capacity | ❌ | ❌ |
| `stock_manager` | Dashboard, Forecast, Supply, Optimization, Actions | Supply plan | Supply + capacity | ❌ | ❌ |
| `viewer` | All operational, read-only | — | None | ❌ | ❌ |
| `planner` | *Legacy* — the old middle rung, kept so existing `AUTH_USERS` entries keep working | Both | All | ❌ | ✅ |

Two distinctions the ladder could not express, and which the code now enforces:

- **Seeing a plan and running one are different rights.** The Optimization page
  opens for anyone who may *read* either territory — a director reviewing what
  the managers decided, a visitor on the public demo pressing "Load last plan" —
  while each Run button needs the matching `:plan` scope.
- **The combined run needs both.** `POST /api/optimization/run` does the roster
  and the reorder plan together, so holding one territory is not enough.

The `capacity` action category is cross-cutting (a surge affects both halves), so
both managers see it. Nothing else crosses the line.

### Scopes

`forecast:read` · `data:read` · `data:write` · `staff:read` · `staff:plan` ·
`supply:read` · `supply:plan` · `actions:read` · `actions:decide` ·
`reports:send` · `admin` · `assistant`

An unknown scope always denies — a typo in a route's requirement must never wave
everyone through, and `require_scope` refuses to import with one.

## Enforcement posture — `AUTH_MODE`

| Mode | Behaviour |
|---|---|
| `protected` (default) | Writes, the report mailer, the AI audit log and the admin surfaces need a session. Reads stay open. This is what the public demo runs. |
| `strict` | Everything except `/api/auth/*` and `/health` needs a session. **This is the setting for a hospital deployment.** |
| `open` | No enforcement. Ignored unless `DEMO_INSECURE=1` is also set. |

Two deliberate defaults:

- **An unconfigured deployment is closed, not open.** With no accounts set,
  protected routes return `503 auth_not_configured` rather than letting anyone
  through. Products ship wide open because the opposite default is convenient;
  this one is not.
- **`AUTH_MODE=open` alone does nothing.** It needs the separate `DEMO_INSECURE=1`
  acknowledgement, so a typo or a copied `.env` can never disable security.

Strict mode is enforced in middleware rather than by decorating each read route:
a choke point cannot be forgotten, whereas a missing `Depends(...)` on a route
added next month is an open door nobody notices. Write and admin routes keep
their own explicit dependencies, so they stay closed in every mode regardless.

## Setting up accounts

There is no default user and no default password, and no self-registration.
Accounts are provisioned by an operator — the right posture where identities
come from HR rather than a sign-up form.

1. Generate a hash (the password never enters your shell history):

   ```bash
   cd api && .venv/bin/python -m core.auth hash
   ```

2. Put the accounts in `AUTH_USERS` as `user:role:hash`, separated by `;`:

   ```
   AUTH_USERS=jon:admin:scrypt$32768$8$1$<salt>$<hash>;sr.dlamini:planner:scrypt$...
   ```

3. Set a signing secret. Without it a random one is generated per process, which
   logs everyone out on restart and breaks a second instance:

   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   ```

4. On Render these are dashboard secrets (`render.yaml` marks `AUTH_USERS`
   `sync: false` and generates `AUTH_SECRET`).

`AUTH_USERS` is re-read on every request, **and the role is re-read with it**.
The session token proves identity; the store decides authority. So demoting a
user, or deleting them outright, takes effect on their very next request rather
than when their token expires — which is what an offboarding procedure has to be
able to rely on.

## How sessions work

- Passwords are stored only as **scrypt** hashes (`n=2^15, r=8, p=1`, per-user
  random salt). Nothing in the process can recover a password from what it
  stores. Parameters are stored with each hash so they can be raised later
  without invalidating existing credentials.
- Hashing is serialised behind a lock: each hash claims 32MB and the deployment
  target is a single 512MB instance. It also throttles credential stuffing to
  one guess at a time.
- Both login branches perform **exactly one** scrypt derivation — an unknown
  username is verified against a precomputed dummy hash rather than hashing a
  throwaway first — so response time does not reveal which accounts exist. Login
  returns one message for both failure cases. (An earlier version hashed twice on
  the unknown branch, which made the timing gap itself an account-enumeration
  oracle; there is a regression test for it.)
- Sessions are **HMAC-SHA256 signed tokens** carrying `sub`, `role` and `exp`,
  verified in constant time. They are delivered as `HttpOnly`, `SameSite=Strict`,
  `Secure` cookies, so page scripts — and anything injected into them — cannot
  read them.

**Revocation.** Removing or demoting an account in `AUTH_USERS` ends or reduces
its live sessions immediately, because authority is re-read per request. What is
*not* covered: a token captured elsewhere (a shared ward browser, a copied
`Authorization` header) stays usable until it expires, because signing out only
clears the cookie — there is no server-side session table. To kill every live
session at once, rotate `AUTH_SECRET`. A deployment needing per-token revocation
should add a denylist keyed on `sub` + issue time, or a per-user token epoch
mixed into the signing input.

## Rate limits

Per client, per bucket, in-process.

| Bucket | Limit |
|---|---|
| `login` | 10 per 5 minutes |
| `email` | 5 per hour |
| `ai` | 30 per minute |
| `heavy` (optimisation, backtests) | 60 per minute |

These are in-process, so they are per-instance. A multi-instance deployment
needs a shared store.

The client is identified by socket address. `X-Forwarded-For` is honoured **only**
when `TRUST_PROXY=1`, because a client can set that header freely and trusting it
unconditionally lets one attacker present as unlimited distinct clients. Set
`TRUST_PROXY=1` only where a proxy really does overwrite the header (Render does);
leave it unset when the app is reachable directly.

## The assistant is everywhere, but not a side door

The AI assistant renders on every page for every role. What it may *say* is
split in two:

- **Teaching content is universal.** All the knowledge cards — what safety stock
  is, why MASE, how an integer programme works — go to everyone. Explaining a
  concept leaks no hospital number.
- **Live numbers follow the caller's territory.** A stock manager is not offered
  the staffing tool, and the optimisation plan is split so they see only their
  half.

The reasoning: if a stock manager cannot open the Staffing page but can type
*"what's our nurse shortfall?"* into the chat box and get the answer, the role
gate is theatre. Enforcement is in two places — the tool *schemas* are filtered
so the model is never offered what it cannot use, and `execute()` refuses again
on its own, because a model can name a tool it was never shown.

The system prompt tells the assistant whose desk it is on, so out-of-area
questions get *"that sits with the staffing manager — here's what I can help
with"* rather than a blank refusal or, worse, a guess.

## What is NOT covered yet

Stated plainly rather than implied:

- **No SSO.** `authenticate()` and `user_from_token()` are the two seams where
  an OIDC provider slots in without touching any route. Hospitals will want this.
- **No per-user data partitioning.** Roles gate pages, actions and the
  assistant's tools, but not rows: two staffing managers see the same
  department's data as each other.
- **No password rotation, lockout or MFA.** Lockout is partly covered by the
  login rate limit, not by an account-level policy.
- **The Action Center decision store is SQLite on local disk.** On a container
  with no persistent volume it is lost on redeploy; set `ACTION_DB_PATH` to a
  mounted volume to keep it.

## Reporting a problem

Security issues should go to the repository owner directly rather than a public
issue.
