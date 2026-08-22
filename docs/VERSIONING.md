# Versioning & releases

ciphra uses [Semantic Versioning](https://semver.org): **`MAJOR.MINOR.PATCH`**.
One version number covers the whole product (frontend + API + nginx ship
together as one release — they are versioned in lockstep, never independently).

The single source of truth is the [`VERSION`](../VERSION) file at the repo
root. `frontend/package.json` mirrors it, and CI fails if they disagree
(see *Enforcement*).

## What each bump means

The question that decides the bump is **"what does this change do to a user's
data or workflow?"** — not how much code moved.

### MAJOR (`X`) — breaking

Bump MAJOR when an existing user must do something, or could lose access to
data, if they don't. In a zero-knowledge app that is a high bar, and most of it
is about the encrypted data contract:

- A change to the **encryption scheme, key hierarchy, or Argon2 parameters**
  that old vaults can't read without a migration.
- A **document/blueprint schema change** that isn't backward compatible (old
  documents no longer decode, or a migration must run).
- Removing or renaming an **API endpoint or its request/response contract** in
  a way that breaks an already-deployed client.
- Anything that **invalidates existing sessions, recovery codes, or family
  grants**.

MAJOR releases must name the required user/operator action in the changelog.

### MINOR (`Y`) — feature, backward compatible

Bump MINOR for a **new user-facing capability** that older data keeps working
under:

- A new blueprint/condition preset, a new export, a new page or surface.
- A new opt-in setting or a new field that defaults to today's behaviour.
- A new API endpoint that doesn't change existing ones.

If a user would notice "ciphra can now do X", it's a MINOR.

### PATCH (`Z`) — fix, no new capability

Bump PATCH for changes that make the **same** product work correctly or
better:

- Bug fixes, security fixes, performance, accessibility.
- Copy / i18n / styling changes.
- Docs, tests, refactors, dependency bumps, CI.

If a user would say "that bug is gone" or notice nothing, it's a PATCH.

## Commit prefix → bump

ciphra commits are scoped and imperative (`fix(auth): …`). The prefix signals
the bump the change *contributes*; the release's overall bump is the largest
contributed since the last release:

| Prefix | Bump it contributes |
|---|---|
| `feat` | MINOR |
| `feat!` / `fix!` / a `BREAKING CHANGE:` footer | MAJOR |
| `fix` | PATCH |
| `perf`, `refactor`, `style`, `a11y` | PATCH |
| `docs`, `test`, `chore`, `build`, `ci` | none on their own (fold into the next release) |

`0.y.z` caveat: while the major is `0`, the public API is still considered
unstable — a breaking change bumps MINOR (`0.1.0 → 0.2.0`), not MAJOR. The
first `1.0.0` is the point we commit to the contract above.

## Release process

A release is just **"bump the number and say what changed"**, then the normal
deploy:

1. On your feature branch, decide the bump from the rules above.
2. Edit [`VERSION`](../VERSION) and set `frontend/package.json` `"version"` to
   the same value.
3. Move the `## [Unreleased]` notes in [`CHANGELOG.md`](../CHANGELOG.md) into a
   new `## [X.Y.Z] — YYYY-MM-DD` section (keep an empty `[Unreleased]` on top).
4. Open the PR. The `version-guard` CI job checks all three agree and that the
   changelog has the section. Merge as usual.
5. `Release images` CI tags the three images `:X.Y.Z` (plus `:<sha>` and
   `:latest`) and cosign-signs them.
6. Deploy with `scripts/deploy-wizard.sh` as always (the CD trigger is still the
   `deploy-<sha>` tag; the `:X.Y.Z` image tag is the human-readable name for
   that same build).

Users read what shipped at **`/docs` → Changelog** (in-app) and in
[`CHANGELOG.md`](../CHANGELOG.md) on the public repo.

## Enforcement (this is mechanical, not a convention)

- **`version-guard`** (`.github/workflows/ci.yml`, runs on every PR): fails if
  `VERSION` isn't valid SemVer, if `frontend/package.json` disagrees, or if
  `CHANGELOG.md` has no section for the current `VERSION`.
- **`Release images`**: reads `VERSION`, **fails the build** if it isn't valid
  SemVer, and only then tags/pushes the images. No valid version → no images.
- **`.claude/hooks/guardrails.py`** (pre-commit, assistant-side): blocks a
  `feat:`/`fix:` commit that doesn't stage `CHANGELOG.md` in the same commit —
  the per-commit companion to `version-guard`. chore/docs/test/refactor/ci are
  exempt; `[skip changelog]` in the message overrides. CI binds everyone; the
  hook binds the assistant so the entry is written *as the change is made*.

So an image without a standardized `X.Y.Z` tag cannot be produced, a version
bump without a changelog entry cannot be merged, and a feature/fix commit
without a changelog line is caught at commit time.
