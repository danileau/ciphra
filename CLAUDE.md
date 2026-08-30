# CLAUDE.md — working agreement for ciphra

Guidance for Claude Code (and any AI assistant) working in this repo. These are
conventions the team relies on; several are enforced mechanically by the
`.claude/hooks/guardrails.py` PreToolUse hook, but follow them regardless — the
hook is a backstop, not the rule.

## What ciphra is

Zero-knowledge health-tracking PWA for chronic conditions. Data is encrypted
client-side; the server never sees plaintext. **Frontend**: SvelteKit +
TypeScript (`frontend/`). **API**: Flask + Python (`api/`). **Edge**: nginx
(`nginx/`). All three ship as signed ghcr.io images; the VPS pulls them.

## Hard rules (non-negotiable)

1. **Never merge to `main`.** The operator merges. Never run `gh pr merge
   --admin` (it bypasses the required review) and never `git push origin main`.
   Push your branch, open/leave a PR, stop there. Merge only the literal ask
   "merge it" — and even then, without `--admin`.
2. **Never deploy or touch VPS state.** No SSH/SCP to prod. Deploys are
   pull-based: the operator pushes a `deploy-<7sha>` git tag and the VPS timer
   pulls + verifies + restarts. Your job is to *prepare* the exact commands and
   hand them over (the operator runs them via `!` so output returns here).
3. **Never read whole secret files.** age/ssh/gpg keys and live `.env` files
   must never be `Read`/`cat`/`head` into the transcript — that leaked the age
   private key once and forced a rotation. Extract only what you need
   (`grep "public key" …`). `.env.example` is safe.
4. **Branch off fresh `origin/main`.** Always `git fetch origin && git checkout
   origin/main -b <branch>` — never branch off a just-merged sibling (causes
   phantom conflicts).
5. **Green before push.** `svelte-check` + `vitest` + `build` (frontend) and
   `pytest` (api) must all pass before you push. Run `/green-gate` — it does
   this for you.

## Conventions

- **Commits**: short, imperative, scoped (`fix(auth): …`). **No `Co-Authored-By`
  trailer.**
- **Versioning**: SemVer, one number for the whole product in the root `VERSION`
  file (mirrored in `frontend/package.json`). A user-facing feature → MINOR, a
  fix → PATCH, a break in the encrypted-data/API contract → MAJOR. Every release
  gets a `CHANGELOG.md` entry (users read it in-app at `/docs → Changelog`). The
  `version-guard` CI job blocks a bump that skips the changelog and checks the
  three places agree — it does NOT judge the number itself.
  `scripts/version-next.sh` suggests one from the commits; it is advisory.
  `Release images` refuses to build without a valid `VERSION`; the `vX.Y.Z`
  release tag is minted by hand (Actions → Release tag). Full rules:
  `docs/VERSIONING.md`.
- **i18n**: every user-facing string is a key in all four locales
  (`de`/`en`/`fr`/`it`, `frontend/src/lib/i18n/`). `de` is the default. Parity +
  orphan-key tests will fail CI if you miss one or leave a key unused.
- **Cross-origin fetch**: any new external origin needs a matching CSP
  `connect-src` entry in the *same* change, and must hit the canonical host
  directly (apex→www redirects strip CORS).
- **Docker builds** in the sandbox: `docker build --network=host` (pip prefers
  IPv6, the default bridge has none). Trivy is available for local scans.
- **Visual smoke**: green tests ≠ shipped. UI changes need an on-device / real
  browser eyeball before they're "done" (see `frontend/e2e/visual-smoke.spec.ts`).

## Deploy ritual (operator-run — you prepare, they execute)

0. If the PR ships a user-facing change, it already bumped `VERSION` +
   `frontend/package.json` and added a `CHANGELOG.md` entry (the `version-guard`
   job enforces this — see `docs/VERSIONING.md`).
1. Operator merges the PR(s) → `Release images` CI rebuilds + signs the three
   images, tagged `:X.Y.Z` (from `VERSION`) + `:<sha>` + `:latest`. The `vX.Y.Z`
   git tag and the GitHub release are NOT automatic — the operator runs
   `Release tag` when they decide the release is one.
2. Summarise what would ship (commits since the live tag) and confirm the SHA.
3. Hand over **`scripts/deploy-wizard.sh`** — the operator runs it themselves
   via `! scripts/deploy-wizard.sh`. It is the single entry point: it lists the
   deployable commits with their signing status and which one is live, checks
   the operator's repo permission, pushes an **annotated** tag, and polls
   health afterwards. Every push needs an explicit y/N inside the wizard.
4. VPS `ciphra-deploy.timer` pulls within ~3 min (cosign-verify → `.env`
   `CIPHRA_TAG` bump → restart → health check, with auto-rollback + ntfy).
5. Post-deploy smoke (public reads, fine to run here):
   `curl -sI https://ciphra.ch/sw.js` (expect `cache-control: no-cache` + a
   fresh `last-modified`), root 200 + security headers, key routes 200.

Do NOT hand over `git tag deploy-<sha> && git push` — that raw flow is what the
wizard replaced on 2026-08-10. It produced a **lightweight** tag, and the VPS
selects by `--sort=-creatordate`, so rolling back to an older commit sorted
*older* than the tag already live and the rollback silently did nothing. The
wizard's tag is annotated, which carries its own tagger date and makes
newest-pushed win.

Rollback = run the wizard again and pick the earlier commit. Full runbook:
`docs/OPERATIONS.md`.

## Tooling reference

- Frontend: `cd frontend && npm run check` (svelte-check), `npm test` (vitest),
  `npm run build`, `npm run test:e2e` (Playwright).
- API: `cd api && python -m pytest tests/ -v`, or
  `docker compose run --rm --build api pytest -q`.
- Security: daily scheduled Trivy scan (`.github/workflows/security-scan.yml`);
  the `security-reviewer` subagent knows ciphra's threat model for deeper passes.

## Skills & agents in this repo

- `/green-gate` — run the full pre-push gate (svelte-check + vitest + build + pytest).
- `/deploy-prep` — assemble the merge→build→hand-off→smoke context for the operator.
- `security-reviewer` subagent — zero-knowledge-aware security review.
