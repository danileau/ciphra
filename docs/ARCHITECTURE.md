# Architecture

How ciphra is put together. For the security model specifically — threat
model, key hierarchy, what the browser caches — see
[SECURITY.md](../SECURITY.md). For local setup see
[DEVELOPING.md](DEVELOPING.md).

## The shape of it

Four containers, one bridge network:

```
browser ──► nginx :8080 ──┬──► frontend (SvelteKit) :5173
                          └──► /api/* ──► api (Flask) :5050 ──► postgres :5432
```

- **nginx** — the single entry point. Serves the app and proxies `/api/*` to
  the API. Forwards `X-Forwarded-For` / `X-Forwarded-Proto`, which the API
  relies on for rate-limiting and HSTS.
- **frontend** — SvelteKit + TypeScript. All cryptography runs here.
- **api** — Flask (Python 3.11), run under gunicorn. A thin authenticated
  store: it never decrypts anything.
- **postgres** — PostgreSQL 15.

## Zero-knowledge in one paragraph

The browser derives two keys from the password with **Argon2id**: an
`auth_key` (for login) and a `vault_key` (which encrypts a random
`master_key`). The `master_key` encrypts every health document with
**AES-256-GCM**. The server only ever receives `SHA-256(auth_key)` and opaque
ciphertext — never the password, the keys, or any plaintext. Decryption
happens exclusively in the browser. The full hierarchy, the recovery-code
path, and family sharing are documented in [SECURITY.md](../SECURITY.md).

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
IndexedDB for warm loads — see SECURITY.md for the cache's wipe semantics.

## The blueprint + cohort system

ciphra is not hard-coded to one condition. Each account has a **blueprint** — a
JSON document defining what that user tracks: symptom groups, episode types,
triggers, vitals, medications, and which columns appear in the monthly grid.
The blueprint is just another encrypted document; the server never sees it.

- **Presets** (`frontend/src/lib/blueprint/presets.ts`) — 25 condition presets
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
