# Architecture

How ciphra is put together. For the security model specifically — threat
model, key hierarchy, what the browser caches — see
[SECURITY_MODEL.md](SECURITY_MODEL.md). For local setup see
[DEVELOPING.md](DEVELOPING.md).

## The shape of it

Five containers, one bridge network:

```
browser ──► nginx :8080 ──┬──► frontend (SvelteKit) :5173
                          └──► /api/* ──► api (Flask) :5050 ──┬──► postgres :5432
                                                              └──► redis :6379
```

Ports above are the **local dev** layout. In **production** the frontend
is built to `build/index.js` (adapter-node) and listens on `:3000`;
nginx (`:443`, Cloudflare-fronted) proxies there. Images are CI-built +
cosign-signed and deployed via pull-based CD — see
[OPERATIONS.md](OPERATIONS.md) and [THREAT_MODEL.md](THREAT_MODEL.md).

- **nginx** — the single entry point. Serves the app and proxies `/api/*` to
  the API. Forwards `X-Forwarded-For` / `X-Forwarded-Proto`, which the API
  relies on for rate-limiting and HSTS. In production, also rewrites
  `$remote_addr` from the Cloudflare `CF-Connecting-IP` header and trusts the
  docker bridge gateway so the real client IP reaches the rate-limiter.
- **frontend** — SvelteKit + TypeScript. All cryptography runs here.
- **api** — Flask (Python 3.11), run under gunicorn. A thin authenticated
  store: it never decrypts anything. Schema is created at boot by
  `api/entrypoint.sh` (which calls `init_db()` once before exec-ing gunicorn,
  so workers don't race on `CREATE TABLE IF NOT EXISTS`).
- **postgres** — PostgreSQL 15.
- **redis** — rate-limit counter store for flask-limiter. **Prod only** — it
  is in the production data-plane compose, NOT in the local-dev
  `docker-compose.yml` (which runs postgres/api/frontend/nginx); locally
  `REDIS_URL` defaults to `memory://` (server.py). In-memory only
  (`--save '' --appendonly no`, 64mb LRU cap, no host port). Lives in the
  data plane next to postgres so counters survive `systemctl restart
  ciphra-app`; without persistence across app restarts, an attacker could
  reset their per-IP limit by bouncing the app. See
  `memory/project_redis_ratelimit_architecture.md` for the full rationale.

## Zero-knowledge in one paragraph

The browser derives two keys from the password with **Argon2id**: an
`auth_key` (for login) and a `vault_key` (which encrypts a random
`master_key`). The `master_key` encrypts every health document with
**AES-256-GCM**. The server only ever receives `SHA-256(auth_key)` and opaque
ciphertext — never the password, the keys, or any plaintext. Decryption
happens exclusively in the browser. The full hierarchy, the recovery-code
path, and family sharing are documented in [SECURITY_MODEL.md](SECURITY_MODEL.md).

## Data model

The database has four tables. Health content lives in exactly one of them, as
opaque ciphertext.

| Table | Holds | Server can read? |
|-------|-------|------------------|
| `users` | username, `SHA-256(auth_key)`, Argon2 params, `encrypted_master`, recovery blob, admin flag, lockout state | Metadata only — never the password or keys |
| `encrypted_documents` | `user_id`, `encrypted_data` (AES-256-GCM blob), timestamps | **No** — opaque blobs |
| `family_grants` | caregiver-sharing grants: a re-wrapped `master_key` + a family-code auth proof | No — wrapped key is opaque |
| `audit_log` | auth events, action, IP (anonymized after 30 days, purged at 90) | Yes — this is operational metadata, by design |

### Documents

Everything a user creates is an encrypted document. The plaintext is JSON with
a `type` discriminator:

| `data.type` | What it is |
|-------------|-----------|
| `entry`     | A day's log — symptoms, episodes, triggers, vitals, medications, notes, date |
| `event`     | A quick-add: a single episode or a rescue-medication, timestamped |
| `diary`     | A free-text narrative note |
| `blueprint` | The user's condition configuration (see below) — one per account |
| `family_link` | Caregiver-sharing metadata held on the caregiver's side |

Because the type lives *inside* the ciphertext, the server cannot tell a
seizure log from a diary entry from a blueprint. All filtering, aggregation,
search, and charting happen in the browser after decryption — cheap at the
scale of personal health data (hundreds of documents, not millions).

The frontend models a document as `CiphraDocument { id, serverCreatedAt, data }`
(`frontend/src/lib/stores/documents.ts`). The store keeps a decrypted copy in
IndexedDB for warm loads — see SECURITY_MODEL.md for the cache's wipe semantics.

## The blueprint + cohort system

ciphra is not hard-coded to one condition. Each account has a **blueprint** — a
JSON document defining what that user tracks: symptom groups, episode types,
triggers, vitals, medications, and which columns appear in the monthly grid.
The blueprint is just another encrypted document; the server never sees it.

- **Presets** (`frontend/src/lib/blueprint/presets.ts`) — 25 condition
  blueprints defined (22 currently offered in the setup picker; autism,
  cardiovascular and dermatology are shelved, kept for a possible re-enable)
  (epilepsy, migraine, diabetes, bipolar, hypertension, PCOS, Hashimoto, …)
  plus a `custom` from-scratch option. Setup copies one; the user can then
  customize it.
- **Cohorts** (`frontend/src/lib/blueprint/cohort.ts`) — a *computed* grouping
  (never stored) of conditions by how their UX should behave. The cohort is
  derived from the `conditionId`, so new presets stay consistent without any
  client migration:

  | Cohort | Primary surface | Example conditions |
  |--------|-----------------|--------------------|
  | `discrete`  | trend chart   | epilepsy, ADHD, diabetes, hypertension, asthma |
  | `cycle`     | calendar      | endometriosis, menopause, PCOS |
  | `phase`     | calendar bands| bipolar, MS, IBD, long-COVID, burnout |
  | `narrative` | journal       | migraine, cancer treatment, dermatology |
  | `custom`    | safe defaults | user-defined |

  The cohort drives which dashboard card, calendar mode, and PDF layout a user
  gets — see `feedback_dashboard_resolver` in the design notes.

## The doctor PDF

`generateDoctorPdf` in `frontend/src/lib/pdf.ts` builds the artifact a patient
hands their doctor — a multi-page A4 report rendered entirely in the browser
with jsPDF. It carries a KPI glance, cohort-aware trend charts, symptom /
trigger / medication tables, and a landscape day-by-day protocol grid. Export
scope (month / year / 2 years) is chosen on `/reports`.

This PDF is the moment health data leaves the device — once saved, the file is
plaintext, so the export UI says so explicitly. (History: a single-page
rewrite was attempted and retired; see `docs/archive/CLINICAL_HANDOFF.md`.)

## Frontend layout

SvelteKit, file-based routing under `frontend/src/routes/`:

| Route | Purpose |
|-------|---------|
| `/` | Public landing (logged out) / dashboard (logged in) |
| `/login` | Login + recovery-code flow |
| `/setup` | Onboarding — pick and customize a blueprint |
| `/log/[date]` | The daily entry form |
| `/journal`, `/calendar`, `/reports` | Browse, view, and export logged data |
| `/conditions`, `/conditions/[id]` | Public condition pages |
| `/settings` | Account, language, family sharing |
| `/migrate`, `/join/[grantId]` | epilepc import; family-sharing claim |
| `/admin` | Operator dashboard — metadata only |
| `/privacy`, `/terms` | Public legal pages |

Shared code lives in `frontend/src/lib/`: `stores/` (auth, documents),
`crypto.ts` (all browser-side crypto), `i18n/` (DE/EN/FR/IT), `blueprint/`
(presets, cohorts, types), `pdf.ts` (the doctor PDF), and `components/` (the
design-system primitives — see `components/README.md`).

## API surface

Flask, defined in `api/server.py`. Grouped roughly as:

- **Auth** — `register`, `login/init` + `login`, `recover/init` + `recover`,
  `change-password`, `delete-account` (GDPR self-service erasure).
- **Documents** — `GET/POST/PUT/DELETE /api/documents` — encrypted-blob CRUD.
- **Family sharing** — `family/grants` create/list/revoke, `claim/init` +
  `claim`, and `family/documents` for caregiver access.
- **Admin** — `admin/stats`, `admin/users` (+ lock/unlock/promote/demote),
  `admin/audit`.
- **`/health`** — liveness probe.

Auth is a JWT bearer token issued at login; `password_version` on the user row
invalidates old tokens after a password change or recovery.
