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
deploy. You do not have to work the bump out by hand — ask:

```bash
scripts/version-next.sh      # prints the version the commits since the last release earn
```

It reads the commit subjects since the newest `vX.Y.Z` tag and applies the
table above, largest bump wins. `scripts/test-version-next.sh` proves it
implements that table, case by case.

1. On your feature branch, run `scripts/version-next.sh` — that is the bump.
2. Edit [`VERSION`](../VERSION) and set `frontend/package.json` `"version"` to
   the same value.
3. Move the `## [Unreleased]` notes in [`CHANGELOG.md`](../CHANGELOG.md) into a
   new `## [X.Y.Z] — YYYY-MM-DD` section (keep an empty `[Unreleased]` on top).
4. Open the PR. The `version-guard` CI job checks all three agree, that the
   changelog section is dated, and that the number is **at least** what the
   commits earn. Merge as usual.
5. On merge, two things happen without you:
   - `Release images` tags the three images `:X.Y.Z` (plus `:<sha>` and
     `:latest`) and cosign-signs them.
   - `Release tag` creates the annotated **`vX.Y.Z` git tag** and publishes a
     GitHub release whose body is that version's changelog section. This is
     what the `[X.Y.Z]` links at the bottom of `CHANGELOG.md` point at.
6. Deploy with `scripts/deploy-wizard.sh` as always (the CD trigger is still the
   `deploy-<sha>` tag; the `:X.Y.Z` image tag is the human-readable name for
   that same build).

Nothing in that automation writes to `main`. Creating a tag is not a branch
push, so `main-protection` is untouched and no bot needs a bypass — the bump
still arrives the way every other change does, through a reviewed PR.

### Backfilling a release tag

`Release tag` also runs on `workflow_dispatch` with an explicit version and
commit, for a release that shipped before the workflow existed (0.1.0). Actions
→ *Release tag* → *Run workflow*, give it `0.1.0` and the commit that shipped
it. It skips silently if the tag already exists.

Users read what shipped at **`/docs` → Changelog** (in-app) and in
[`CHANGELOG.md`](../CHANGELOG.md) on the public repo.

## Enforcement (this is mechanical, not a convention)

- **`version-guard`** (`.github/workflows/ci.yml`, runs on every PR): fails if
  `VERSION` isn't valid SemVer, if `frontend/package.json` disagrees, if
  `CHANGELOG.md` has no dated section for the current `VERSION`, or if the
  number is **smaller than the commits earn**. The first three only prove the
  three places agree; the last is the one that asks whether the number is
  right. A *larger* bump than earned passes with a warning — over-signalling is
  safe, under-signalling is how a breaking change ships looking like a patch.
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

## The database schema has its own version

The product version above says what changed *for a user*. It says nothing about
whether a given database can be read by a given image — and that question has a
real answer here, because the deploy rolls back on its own when a health check
fails. A release that adds a column and then fails leaves the **previous** image
running against the **newer** schema.

So the schema carries its own counter, independent of `VERSION`:

- **`api/server.py` → `MIGRATIONS`** — a numbered, ordered ledger. Each entry is
  `(number, name, sql, compatible)`. `SCHEMA_VERSION` is the highest number, and
  is what an image advertises.
- **`schema_meta`** — one row in the database recording `version` (how far it has
  been migrated) and `min_app_schema` (the lowest image that may still read it).
- **`init_db()`** applies everything above the recorded version, in order, and
  stamps the result. Statements stay idempotent because databases that predate
  the ledger record `0` while already carrying every column.

`compatible` is the whole point:

| | Meaning | Effect on an older image |
|---|---|---|
| `True` | additive — a nullable column, a new index | It runs. Code that predates the column never selects it. A warning is logged, because it means a rollback happened. |
| `False` | destructive or semantic — the old code would misread it | It **refuses to start**, and says to roll forward or restore from the pre-release backup. |

Refusing on *any* mismatch would be the wrong reflex: it would turn the
auto-rollback safety net into an outage, since the rollback target would refuse
to boot on the schema the failed release had already applied.

`GET /health` reports both numbers (`schema` from the database, `app_schema`
from the image), so "which schema is prod at" is answerable without a shell on
the box. A mismatch there is the tell that a rollback left an older image on a
newer schema.

**To add a migration:** append with the next number, set `compatible` honestly,
bump `SCHEMA_VERSION`. Never renumber or edit a shipped migration — databases in
the field have already recorded it. `api/tests/test_schema_version.py` enforces
the contiguity, the idempotence, and the compatibility behaviour.
