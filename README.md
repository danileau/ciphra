# ciphra

**A zero-knowledge personal health notebook.** ciphra lets people living with a
chronic condition log their day in a few minutes each evening — symptoms,
episodes, triggers, vitals, medications, notes — and hand their doctor a clean
PDF at the next visit. The server stores only opaque encrypted blobs: it
mathematically cannot read a single health entry.

ciphra grew out of [epilepc](https://epilepc.ch), a Symfony epilepsy tracker
built as a diploma thesis. epilepc encrypted data *server-side* (the server
held the key) and hard-coded one condition's schema. ciphra keeps the idea —
"give your doctor a grid they can read in seconds" — and fixes both: encryption
moves entirely into the browser, and a blueprint system opens it to any
condition.

## What makes it zero-knowledge

All key derivation and encryption happen in the browser. The password never
leaves the device. The server receives a hashed credential and opaque
ciphertext, and stores exactly that. A database breach yields encrypted blobs,
nothing else. The full model — threat model, key hierarchy, what the browser
caches — is in **[SECURITY.md](SECURITY.md)**.

## Quick start

Requires Docker + Docker Compose.

```bash
git clone <repo-url> ciphra && cd ciphra
cp .env.example .env          # then fill in SECRET_KEY (≥32 chars)
docker compose up --build
```

Then open **http://localhost:8080** — nginx serves the app and proxies the API.

| Service  | URL                     | Role                          |
|----------|-------------------------|-------------------------------|
| nginx    | http://localhost:8080   | Unified entry point           |
| frontend | http://localhost:5173   | SvelteKit dev server (direct) |
| api      | http://localhost:5050   | Flask API (direct)            |
| postgres | localhost:5433          | Database                      |
| redis    | (internal)              | Rate-limit counters (prod)    |

A `SECRET_KEY` of 32+ characters is mandatory — the API refuses to start
without it. Generate one with `python -c 'import secrets; print(secrets.token_hex(32))'`.

## Documentation

| Doc | What's in it |
|-----|--------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design — services, data model, crypto, the blueprint/cohort system, the doctor PDF |
| [docs/DEVELOPING.md](docs/DEVELOPING.md)     | Local setup, seeding demo data, running tests, project layout |
| [docs/OPERATIONS.md](docs/OPERATIONS.md)     | Production ops — CI/CD pipeline, pull-based deploy, cron jobs, monitoring, backup + restore, disaster recovery |
| [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) | Operational threat model — adversary classes, attack-surface inventory, supply-chain + backup integrity, JS-swap problem |
| [docs/INCIDENT_RESPONSE.md](docs/INCIDENT_RESPONSE.md) | Incident playbook — severity model, detect→learn loop, per-scenario playbooks, the incident-record format |
| [docs/backlog.md](docs/backlog.md)           | Forward-looking backlog — the larger items (each with a ready continuation prompt), operator actions, and decisions made |
| [docs/FEATURES.md](docs/FEATURES.md)         | What ciphra does today, feature by feature |
| [CHANGELOG.md](CHANGELOG.md)                 | What changed in each release — also readable in-app at `/docs → Changelog` |
| [docs/VERSIONING.md](docs/VERSIONING.md)     | SemVer policy (what's a patch / feature / breaking change) + the release process |
| [SECURITY.md](SECURITY.md)                   | Security model — the honest description of what is and isn't protected |
| [LICENSE](LICENSE)                           | GNU Affero General Public License v3.0 — the terms ciphra is offered under |
| [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) | Third-party code that ships inside ciphra, and its licenses |
| [frontend/src/lib/components/README.md](frontend/src/lib/components/README.md) | The design-system reference (components, tokens) |
| [docs/archive/](docs/archive/)               | Retired specs and origin documents, kept for provenance |

## Tech stack

- **Frontend** — SvelteKit + TypeScript, Vite, client-side WebCrypto + Argon2id (WASM)
- **API** — Flask (Python 3.11), gunicorn (schema initialised via `api/entrypoint.sh`), JWT auth
- **Database** — PostgreSQL 15, one opaque encrypted-document table
- **Rate-limit store** — Redis (in-memory only, lives in the data plane so counters survive app restarts)
- **Deployment** — Docker Compose; nginx reverse proxy (Cloudflare-fronted in production)

ciphra is a serious tool for managing a real condition — not a wellness app.
No gamification, no email required, four languages (DE/EN/FR/IT).

## License

ciphra is free software under the **[GNU Affero General Public License v3.0](LICENSE)**
(`AGPL-3.0-only`). You may run it, study it, change it, and share it — including
commercially.

The AGPL adds one obligation beyond the GPL, and it is the reason it was chosen
here. Under **§13**, if you run a modified ciphra as a network service, you must
offer *your* users the source of the version *you* are running. Self-hosting a
patched copy privately is fine; serving it to other people while keeping your
changes closed is not.

So if you modify ciphra and put it online, point the app at your own repository:

```bash
PUBLIC_SOURCE_URL=https://git.example.org/you/ciphra
```

The app renders that URL in its footer and on the landing page's "Verify it
yourself" card. It is read at runtime, so setting it on a pulled image is
enough — no rebuild. Left unset, the app links to this repository, which is the
truth only for an unmodified deployment. A modified instance that still links
here is not compliant: it shows users code that is not what it is serving.
`frontend/src/lib/source.ts` has the details, and a test fails the build if any
component hardcodes a repository URL again.

**Zero-knowledge is a claim you should not have to take on faith.** The license
is half of what makes it checkable: it guarantees the source of a running
instance is available. The other half is the [signed release
images](SECURITY.md#how-to-verify-our-claims-yourself) — cosign-keyless via
GitHub OIDC, logged to Rekor — which tie the published source to the bytes
actually served.

**The name is not covered.** "ciphra", the wordmark, the asterisk and the icons
in `brand_assets/` are not licensed under the AGPL. Fork the code freely; call
your fork something else, so nobody mistakes your deployment for this one.
