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
four respect the repo's hard rules (branch off fresh `origin/main`,
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

### 2 — Per-invite sharing scope · security/product · user-driven

Today a family grant is all-or-nothing: it re-wraps the master key, so the
linked account can decrypt everything the patient has. PR #171 stopped the app
from *showing* a caregiver the diary and the locked entries, but that is a
client-side filter — the ciphertext still arrives and the key still opens it.
This item moves the decision to the invitation and makes the server enforce it.

Driven by a real user (2026-08-30) who asked whether the doctor she had sent an
invite link to could read her diary. Both answers must be first-class: she wants
to share everything, the next person will want the diary held back.

**Operator decision 2026-08-30 — the one-bit disclosure is accepted.** The
server may learn a per-document class saying whether the user considers a
document shareable. It stays at two classes until a user asks for finer
granularity; a full per-type label would tell the server the type of every
document, which is a bigger step and is not approved. `SECURITY_MODEL.md`
§What the server can see must name the new field in the same change.

```
Goal: let the patient choose, when creating a family invitation, what that
access may see — and have the SERVER enforce the choice rather than the client
merely honouring it.

Context: a family_grant re-wraps the patient's master_key, so the linked account
decrypts everything. PR #171 filters the diary and locked entries out of the
caregiver view on the client (`isVisibleToCaregiver` in lib/utils/exportable.ts)
— honest, but not a real boundary. The server cannot filter by type: the type
lives INSIDE the ciphertext (docs/ARCHITECTURE.md §Data model). Operator
decision 2026-08-30: the server may learn ONE bit per document.

Scope:
- `encrypted_documents.share_class SMALLINT NULL` — the client stamps it at
  write time from the plaintext type, which it already knows. SMALLINT rather
  than a boolean so the partition can get finer later without a second
  migration.
- `family_grants.share_mask INT` — bitmask of permitted classes. Today: 1 =
  shareable, 2 = diary/locked; "share everything" = 3.
- `family_documents_list` filters on the mask. The caregiver never receives the
  row at all.
- FAIL CLOSED: NULL means unclassified means not shared. Any other default
  re-releases every existing diary on the day this deploys. The PATIENT's client
  backfills their corpus in ONE batch call after the next successful load
  (precedent: /api/documents/batch and the nginx api_batch zone). Until then a
  caregiver sees LESS, never more.
- Two guards: (a) a caregiver must NOT be able to reclassify — ignore
  `share_class` on the family POST/PUT path, only the owner sets it; (b)
  narrowing an existing grant has the same property as revoking one — whatever
  they already downloaded, they keep (reuse the sentence from
  `family.revoke_caveat`).
- UI in FamilySharing.svelte: two options at creation, defaulting to the
  NARROWER one ("Everything except the diary and locked entries" / "Everything,
  including the diary"). Repeat the chosen scope on the reveal step before the
  link is sent, show it per grant in the list, and allow changing it afterwards.
- i18n across 4 locales, German with 'ss'. Brand voice: say what the access
  shows, not what "we cannot" do.
- Docs: SECURITY_MODEL.md §What the server can see (name the new field),
  ARCHITECTURE.md (both tables), FEATURES.md §Family sharing, CHANGELOG as a
  MINOR (new capability, backward compatible, nothing becomes unreadable).

Out of scope: encrypting class 2 under a separate key that no grant ever
receives. That is the only variant that also protects bytes a caregiver already
holds — but it is a key-hierarchy change, so MAJOR plus a re-encryption
migration (docs/VERSIONING.md). Note it as the endgame; do not build it here.

Rules: branch off fresh origin/main; /green-gate before push; do NOT merge or
deploy (the operator does that); CHANGELOG + version-guard. The client-side
filter from PR #171 stays as defence in depth.
Acceptance: the scope is selectable at invitation time and changeable
afterwards; the server returns only permitted classes to a grant (tested
against the raw API, not just the UI); the backfill is demonstrated; fail-closed
is demonstrated; docs updated.
```

### 3 — Backup tamper-evidence (third hash store) · ops · P2

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

### 4 — SEO / SSR-landing architectural fix · product

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

- **SBOM generation in CI** — declined (Trivy already covers CVE detection; SBOM
  is provenance-only and not wanted). 2026-08-23.
- **HSTS preload list submission** — skipped; the `preload` header stays (protects
  returning visitors), no ~2-year list lock-in. 2026-08-23.
- **security-monitor edge-header leg** — accepted as inconclusive from CI
  (Free-plan Bot Fight can't be reliably skipped; the header config is CI-guarded
  and the CF-only TLS drift is covered). 2026-08-23.
