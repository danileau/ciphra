# Frontend security notes

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
