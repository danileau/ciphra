# Backlog

The open work that isn't in flight. Small, well-understood items get fixed as
they come up; this file holds the **larger items that each deserve their own
session**, plus the operator-only actions and the decisions already made (so
nothing gets re-proposed).

Last reviewed: 2026-08-30. Day-to-day state lives in git + the operator's
memory; this is the forward-looking list.

---

## Larger items — each is its own project

Every prompt below is self-contained: paste it to start a fresh session. All
three respect the repo's hard rules (branch off fresh `origin/main`,
`/green-gate` before push, never merge/deploy — the operator does that, CHANGELOG
+ `version-guard` for user-facing changes).

### 1 — Reproducible builds (JS-swap mitigation) · security · HIGH residual

The one structural HIGH residual risk in [`THREAT_MODEL.md`](THREAT_MODEL.md)
(§2.H / §5 / §7 P3). Highest-value security investment left.

```
Goal: make ciphra's frontend build byte-reproducible and publish a verifiable
bundle digest, so the JavaScript actually served can be checked against the
public source.

Context: ciphra is a browser-served zero-knowledge PWA (SvelteKit + adapter-node,
Node 24, Vite 8). THREAT_MODEL.md §2.H/§5 names the JS-swap attack as the ONLY
structural residual gap rated HIGH: a server-side attacker who swaps the bundle
can exfiltrate keys on the next login. The mitigation is reproducible builds plus
published, signed hashes, so third parties and watchdogs can detect a swap.
cosign (keyless) already signs the images; CSP runs in mode:'hash'.

Scope (design first — a short concept, then build):
- Eliminate non-determinism in the Vite/SvelteKit output (timestamps, build ids,
  chunk order). Proof: two clean builds of the same commit are byte-identical,
  or the remaining non-determinism is documented.
- A signed manifest of bundle hashes per release (cosign attest), plus a verify
  procedure: rebuild from the tagged commit and compare.
- Wire SRI onto every JS chunk where feasible (THREAT_MODEL notes "not yet
  wired"). CSP must not loosen in the process.
- Draw the line honestly: real per-user enforcement needs the user. What is
  achievable is "source-available + reproducible + published hashes", which
  makes a swap detectable.

Rules: branch off fresh origin/main; /green-gate before push; do NOT merge or
deploy (the operator does that); CHANGELOG entry for anything user-visible;
respect version-guard and the changelog guardrail. Update THREAT_MODEL.md §7 P3
"Reproducible-build pipeline" when done.
Acceptance: a reproducible build demonstrated, the verify procedure documented,
SRI wired as far as feasible.
```

### 2 — Backup tamper-evidence (third hash store) · ops · P2

[`THREAT_MODEL.md`](THREAT_MODEL.md) §2.D / §7 P2. Medium size, code-side buildable.

```
Goal: tamper-evidence for ciphra's backups — an independent, append-only hash
log that lets any backup be verified as unaltered.

Context: THREAT_MODEL.md §2.D + §7 P2. Backups run pg_dump → gzip → age-encrypt
→ rclone to RCLONE_PRIMARY (Infomaniak Swiss Backup) and RCLONE_SECONDARY
(cross-vendor, active since 2026-08). The gap: no tamper-evidence — a swapped or
truncated backup only surfaces at restore time. The script is
golive/backup/backup.sh (gitignored, runs on the VPS; the laptop copy is
canonical and is rsynced to the VPS).

Scope:
- Extend backup.sh: after the age-encrypted dump, write its SHA-256 to an
  append-only log in a THIRD location, INDEPENDENT of both backup stores (a
  separate provider, a transparency-style append log, an HC.io or ntfy archive).
  Independence is the whole point — not Infomaniak, not R2/B2.
- Add a verify step to the quarterly restore drill: check the restored dump's
  hash against the log.
- Keep it workable for a solo operator; the age PRIVATE key stays off the VPS.

Rules: golive/ is gitignored, so prepare the script and hand it over — the
OPERATOR installs and rsyncs it (the assistant never SSHes to the VPS). Update
OPERATIONS.md (backup section) and THREAT_MODEL.md §7 P2 when done (P2 → done).
Acceptance: backup.sh writes one hash per run to the independent store; the
verify step exists; docs updated.
```

### 3 — SEO / SSR-landing architectural fix · product

The biggest product lever. A prior SSR landing was shipped then reverted because
it broke registration (operator memory `project_seo_state`).

```
Goal: server-render or prerender the public landing page (and the public docs)
for SEO, WITHOUT breaking the client-side zero-knowledge registration and auth
flow.

Context: memory project_seo_state — an SSR landing was shipped once and then
REVERTED because it broke registration. The SEO foundation is shipped (PR #40).
Stack: SvelteKit + adapter-node; crypto and registration run client-side by
design (WebCrypto / Argon2 WASM).

Scope (design first — start by establishing why the earlier attempt was
reverted, from the git history):
- Likely cause: SSR of the landing touched auth stores or browser-only crypto
  during render, or a hydration mismatch. Verify before building.
- Approach: public routes (landing, /docs, /conditions, /privacy, /terms) →
  prerender or SSR; app routes (/setup, /login, /dashboard, …) → CSR via
  `export const ssr = false` per route. The landing is largely static, so
  prerendering is the safest option: no runtime SSR, no auth interference.
- CSP must not loosen; no new origins without a matching connect-src entry.
Verification: registration and login demonstrably intact (e2e); the landing HTML
contains indexable content and meta tags; visual smoke (green ≠ shipped — a real
browser eyeball, e2e/visual-smoke.spec.ts).

Rules: branch off fresh origin/main; /green-gate and visual smoke before push;
do NOT merge or deploy; i18n parity across 4 locales and a CHANGELOG entry for
anything user-visible. This is a product change, not a security one.
Acceptance: the public landing is prerendered/SSR with indexable content; the
registration and login flow is intact per e2e; CSP unchanged; documented.
```

---

## Operator-only actions (no code — the assistant can't do these)

- **Age-key rotation reminder** — currently manual; add a calendar entry or a
  cron→ntfy (Dec 15 / Jun 15). [`OPERATIONS.md`](OPERATIONS.md) Future work.
- **Hardware-key 2FA** for the Cloudflare + Infomaniak accounts
  ([`THREAT_MODEL.md`](THREAT_MODEL.md) §7 P3) — "when the YubiKey arrives".
- **Verify logrotate is installed** on the VPS (rotated `ciphra-*.log.1` files
  suggest it runs; confirm `/etc/logrotate.d/ciphra` exists).

## Decided — do NOT re-propose

- **Per-invite sharing scope** — built and merged (#176, 2026-08-30). The owner
  picks at invitation time whether a family grant may read the diary and locked
  entries, and the server enforces it via one metadata bit per document. The
  operator approved that one-bit disclosure; **a full per-type label is NOT
  approved** — it would tell the server the type of every document. Encrypting
  the personal class under a separate key remains the unbuilt endgame (MAJOR:
  key hierarchy + re-encryption migration).

- **SBOM generation in CI** — declined (Trivy already covers CVE detection; SBOM
  is provenance-only and not wanted). 2026-08-23.
- **HSTS preload list submission** — skipped; the `preload` header stays (protects
  returning visitors), no ~2-year list lock-in. 2026-08-23.
- **security-monitor edge-header leg** — accepted as inconclusive from CI
  (Free-plan Bot Fight can't be reliably skipped; the header config is CI-guarded
  and the CF-only TLS drift is covered). 2026-08-23.
