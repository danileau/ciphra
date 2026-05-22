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

A `SECRET_KEY` of 32+ characters is mandatory — the API refuses to start
without it. Generate one with `python -c 'import secrets; print(secrets.token_hex(32))'`.

## Documentation

| Doc | What's in it |
|-----|--------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design — services, data model, crypto, the blueprint/cohort system, the doctor PDF |
| [docs/DEVELOPING.md](docs/DEVELOPING.md)     | Local setup, seeding demo data, running tests, project layout |
| [docs/FEATURES.md](docs/FEATURES.md)         | What ciphra does today, feature by feature |
| [SECURITY.md](SECURITY.md)                   | Security model — the honest description of what is and isn't protected |
| [frontend/src/lib/components/README.md](frontend/src/lib/components/README.md) | The design-system reference (components, tokens) |
| [docs/archive/](docs/archive/)               | Retired specs and origin documents, kept for provenance |

## Tech stack

- **Frontend** — SvelteKit + TypeScript, Vite, client-side WebCrypto + Argon2id (WASM)
- **API** — Flask (Python 3.11), gunicorn, JWT auth
- **Database** — PostgreSQL 15, one opaque encrypted-document table
- **Deployment** — Docker Compose; nginx reverse proxy

ciphra is a serious tool for managing a real condition — not a wellness app.
No gamification, no email required, four languages (DE/EN/FR/IT).
