# Developing ciphra

Local setup, demo data, tests, and project layout. For the system design see
[ARCHITECTURE.md](ARCHITECTURE.md).

## Prerequisites

- Docker + Docker Compose — the supported way to run the stack.
- For running frontend tooling directly on the host: Node.js (the repo is
  developed against Node 18). See the vitest note under [Tests](#tests).

## First run

```bash
cp .env.example .env
```

Then edit `.env` and set `SECRET_KEY` to 32+ characters — the API refuses to
start without it:

```bash
python -c 'import secrets; print(secrets.token_hex(32))'
```

`.env` also carries the Postgres credentials and `CORS_ORIGINS`. Never commit
`.env`; `.env.example` is the committed template.

```bash
docker compose up --build
```

| Service  | Host port | In-container | Notes |
|----------|-----------|--------------|-------|
| nginx    | 8080      | 80           | **Use this** — unified entry point |
| frontend | 5173      | 5173         | SvelteKit dev server, HMR |
| api      | 5050      | 5000         | Flask; host port avoids the macOS :5000 AirPlay collision |
| postgres | 5433      | 5432         | host port 5433 avoids a local Postgres clash |
| redis    | —         | 6379         | rate-limit counter store (optional in dev — falls back to `memory://` if `REDIS_URL` is unset) |

The database schema is created automatically by the API on first start.

### How schema init runs

- **Dev (`python server.py`):** Flask's built-in server triggers the
  `if __name__ == '__main__': init_db()` block at the bottom of `server.py`.
- **Production (gunicorn):** the `__main__` block never fires — gunicorn
  imports `server:app` as a module. Instead `api/entrypoint.sh` calls
  `init_db()` once and then `exec`s gunicorn, so the schema is guaranteed
  to exist before any worker accepts a request and workers don't race on
  `CREATE TABLE IF NOT EXISTS`.

Both paths are intentional. Don't remove the `__main__` block — it keeps
`python server.py` working for fast local iteration without gunicorn.

## Seeding demo data

The `api/seed_*.py` scripts create demo accounts with realistic multi-year
histories — one per persona/condition (`seed_hans_epilepsy.py`,
`seed_anna_bipolar.py`, `seed_thomas_burnout.py`, …). All use the password
`Test$12345_`.

Seeding is gated behind an env flag so it can never run by accident:

```bash
cd api && CIPHRA_ALLOW_DEMO_SEED=1 \
  DATABASE_URL='postgresql://ciphra:<password>@localhost:5433/ciphra' \
  python3 seed_hans_epilepsy.py
```

Use the host port **5433** in `DATABASE_URL` when seeding from the host. The
password is whatever you set for `POSTGRES_PASSWORD` in `.env`.

## Tests

### Frontend — vitest + svelte-check

```bash
cd frontend
npm run test      # vitest (unit/component)
npm run check     # svelte-check — type + Svelte diagnostics
```

> **Gotcha:** run vitest via `npm run test` or `./node_modules/.bin/vitest`,
> **not** `npx vitest`. A cached npx vitest can require a newer Node than the
> repo's baseline and fail confusingly. If npx was used by mistake,
> `rm -rf ~/.npm/_npx` clears the cache.

The bar before shipping: vitest green, `svelte-check` 0 errors / 0 warnings,
`vite build` clean.

### Frontend — end-to-end (Playwright)

```bash
npm run test:e2e        # full e2e suite
npm run smoke:visual    # visual smoke spec only
```

E2E tests drive a dev server on `:5173`. Some specs depend on seeded users —
see per-spec comments.

### API — pytest

The API test tooling ships only in the Docker `dev` build target:

```bash
docker compose run --rm --build api pytest -q
```

## Building for production

```bash
cd frontend && npm run build      # static SvelteKit build
docker build --target prod ./api  # minimal API image (no test tooling)
```

The Compose file uses the API's `dev` target (so `pytest` is available);
production deploys should build `--target prod`.

## Project layout

```
ciphra/
├── README.md                 project overview + quick start
├── SECURITY.md               security model
├── docker-compose.yml        the 4-service stack
├── .env.example              env template
├── docs/                     ARCHITECTURE, DEVELOPING, FEATURES, archive/
├── api/
│   ├── server.py             the whole Flask API
│   ├── seed_*.py             demo-data seed scripts
│   └── tests/                pytest suite
└── frontend/
    └── src/
        ├── routes/           SvelteKit pages
        └── lib/              crypto, stores, i18n, blueprint, pdf, components
```

## Conventions

- **Commits** — short, technical messages; no `Co-Authored-By` trailers.
- **Swiss German** — generated German copy uses `ss`, never `ß`; pinned by
  `frontend/src/lib/i18n/swiss-orthography.test.ts`.
- **Scratch stays out of the repo** — PI-cycle planning notes, review memos,
  and session hand-offs are not committed; they belong in the assistant's
  `memory/`, not the repository. The repo's `.md` files are durable
  documentation only. Enforced by `frontend/src/lib/docs-integrity.test.ts`,
  which also fails the build on a dead internal doc link or a missing
  canonical doc — so documentation rot is caught mechanically.
