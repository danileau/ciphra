# Frontend security notes

> **ARCHIVED 2026-08-22.** Historical reasoning trail, not live state. Its
> premise — svelte 4 / vite 5.4 / esbuild 0.21 CVEs "gated on the Svelte 5
> migration" — is resolved: that migration landed (`frontend/package.json` now
> pins svelte ^5.x, vite ^8.x, @sveltejs/kit ^2.x). Kept for the record of why
> the override block existed. Was `frontend/SECURITY_NOTES.md`.

## Trivy `fs` findings (2026-04-28)

Eight medium-severity advisories surfaced in `frontend/package-lock.json`.
Six are now patched. The remaining two are **development-server only** and
have no production impact — documented here.

### Patched

| Package | From | To | Source of fix |
|---|---|---|---|
| `dompurify` | 3.3.3 | 3.4.1 | `overrides` (jspdf transitive) — covers CVE-2026-41238/41239/41240 + GHSA-39q2-94rc-95cp |
| `uuid` | 10.0.0 | 14.0.0 | `overrides` (vite-plugin-top-level-await transitive) — covers GHSA-w5hq-g745-h8pq |
| `postcss` | 8.5.8 | 8.5.12 | direct devDep bump — covers CVE-2026-41305 |

### Accepted (dev-server only, not production)

| Package | Version | Advisory | Why we're not bumping |
|---|---|---|---|
| `vite` | 5.4.21 | CVE-2026-39365 (`.map` path traversal in dev server) | Bumping to vite 6 requires `@sveltejs/vite-plugin-svelte` v4, which requires Svelte 5. Svelte 4 → 5 is a major migration (runes, props syntax). The CVE only affects `vite dev` running on a developer's local machine, never the static build served by nginx in production. Re-evaluate when the Svelte 5 migration is scheduled. |
| `esbuild` | 0.21.5 (bundled with vite 5) | GHSA-67mh-4wv8-2f99 (dev-server CSRF) | Same reasoning — dev-server only, not in production bundles. Vite 6 ships esbuild 0.24+ but is gated on the Svelte 5 migration above. |

Both `vite` and `esbuild` advisories are CVSS-medium and apply only when
an attacker can lure a developer to a malicious URL while their local
`npm run dev` is listening on `0.0.0.0`. The risk window is tiny + each
developer's individual dev session, never user-facing.

## Re-running the scan

```bash
trivy fs frontend/package-lock.json
```

Expected output: 2 MEDIUM (vite + esbuild dev-only). The 6 prod-affecting
findings should be gone.

## Cadence

Re-run quarterly OR when Svelte 5 migration lands (whichever is sooner).
The `overrides` block in `frontend/package.json` should be reviewed at
each cadence — once a transitive dep updates upstream, the override may
no longer be needed.

---

## CIPH-pi20-LB-7 — npm audit reachability triage (2026-05-08)

The FULL_REVIEW (2026-05-05) flagged 11 `npm audit` findings (1 critical, 1
high, 8 moderate, 1 low). Each classified as **reachable in production**,
**dev-only**, or **not used in our code**. Reachable findings fixed; the rest
documented with rationale.

### Fixed via `npm audit fix` (non-breaking)

| Package | Severity | Advisory | Reason fixed |
|---|---|---|---|
| `@sveltejs/kit` | **High** | GHSA-3f6h-2hrp-w5wx (unvalidated redirect DoS in `handle` hook) | We use SvelteKit hooks for routing — directly reachable. |
| `@sveltejs/kit` | **High** | GHSA-2crg-3p73-43xp (`@sveltejs/adapter-node` BODY_SIZE_LIMIT bypass) | We use `adapter-auto`, not adapter-node, but the underlying kit bump closes both. |
| `cookie` (transitive) | Low | GHSA-pxg6-pf52-xh8x (out-of-bounds chars in cookie name/path/domain) | Pulled in via `@sveltejs/kit`; resolved by the same kit bump. |

After `npm audit fix`: **0 high, 0 critical** remaining. 844/844 vitest +
0/0/317 svelte-check + clean build verified post-bump.

### Accepted as not-reachable in our code (Svelte SSR XSS — moderate × 4)

| Advisory | Affected feature | Verified absent via |
|---|---|---|
| GHSA-crpf-4hrx-3jrp | Svelte SSR attribute spreading w/ inherited prototype properties | Source-grep: zero `<svelte:element>` usage |
| GHSA-m56q-vw4c-c2cp | Svelte SSR `<svelte:element>` tag-name validation | Same — zero usage |
| GHSA-f7gr-6p89-r883 | Svelte SSR XSS via spread attributes | Same |
| GHSA-phwv-c562-gvmh | Svelte SSR XSS w/ `bind:innerText` / `bind:textContent` | Source-grep: zero usage of either binding |

The fix path is `npm audit fix --force` → `svelte@5.55.5`, a breaking major
upgrade currently gated on the Svelte 4 → 5 migration (runes / props syntax
rewrite). Since none of the vulnerable surfaces are used in our code today,
the upgrade can wait for the migration's own cadence rather than being
forced now. Source-grep guard:

```bash
grep -rn "svelte:element\|bind:innerText\|bind:textContent" frontend/src
# expected: zero matches; if any appear, the Svelte upgrade becomes a hard prereq
```

### Accepted as dev-only (esbuild / vite / vite-node / vitest / vitefu)

| Package | Severity | Advisory | Why not in production |
|---|---|---|---|
| `esbuild` | Moderate | GHSA-67mh-4wv8-2f99 (dev-server CSRF) | Bundled with vite at dev time. Production serves the static build via nginx — no esbuild process. |
| `vite` | Moderate | GHSA-4w7w-66w2-5vf9 (`.map` path traversal) | Same — vite is dev tooling. |
| `vite-node`, `vitefu`, `@sveltejs/vite-plugin-svelte`, `@sveltejs/vite-plugin-svelte-inspector`, `vitest`, `svelte-hmr` | Moderate | Transitive via vite | Same. |

These ride alongside the Svelte 5 migration trigger above — when that
migration lands, the vite 6 / esbuild 0.24+ chain comes with it.

### Net state after this triage

- **Reachable production findings:** 0
- **Dev-only findings:** 8 (all gated on the Svelte 5 migration)
- **Not-reachable findings:** 4 (Svelte SSR XSS — guarded by source-grep above)

Re-run `npm audit` quarterly or after any direct devDep bump to verify the
class boundaries still hold.
