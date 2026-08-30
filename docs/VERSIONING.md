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

`0.y.z` caveat — **no longer in force.** While the major was `0`, a breaking
change bumped MINOR (`0.1.0 → 0.2.0`) rather than MAJOR. ciphra moved to the
`1.x` line at **1.3.0** (2026-08-30), so the table above now applies in full: a
break in the encrypted-data or API contract bumps MAJOR.

## Release process

A release is just **"bump the number and say what changed"**, then the normal
deploy. To see what the commits would suggest, ask:

```bash
scripts/version-next.sh      # suggests a version from the commits since the last release
```

It reads the commit subjects since the newest `vX.Y.Z` tag and applies the
table above, largest bump wins. `scripts/test-version-next.sh` proves it
implements that table, case by case. It prints a suggestion and changes
nothing.

1. On your feature branch, decide the bump. `scripts/version-next.sh` will
   suggest one from the commit prefixes — it is **advisory**, and nothing fails
   if you disagree with it. What a version says to a user is a judgement, and
   the operator makes it.
2. Edit [`VERSION`](../VERSION) and set `frontend/package.json` `"version"` to
   the same value.
3. Move the `## [Unreleased]` notes in [`CHANGELOG.md`](../CHANGELOG.md) into a
   new `## [X.Y.Z] — YYYY-MM-DD` section (keep an empty `[Unreleased]` on top).
4. Open the PR. The `version-guard` CI job checks that `VERSION`,
   `frontend/package.json` and the changelog agree, and that the section is
   dated. It does not second-guess the number. Merge as usual.
5. `Release images` then tags the three images `:X.Y.Z` (plus `:<sha>` and
   `:latest`) and cosign-signs them. That part is automatic — an image without
   a standardized tag is useless, and there is no judgement in it.
6. **Mint the release tag by hand**, when you decide the release is a release:
   Actions → **Release tag** → *Run workflow*. It creates the annotated
   `vX.Y.Z` tag and publishes a GitHub release whose body is that version's
   changelog section — which is what the `[X.Y.Z]` links at the bottom of
   `CHANGELOG.md` point at. Give it a `version` and `sha` to tag something
   other than the current `VERSION` on the default branch; it skips silently
   if the tag already exists, so re-running is safe.
7. Deploy with `scripts/deploy-wizard.sh` as always (the CD trigger is still the
   `deploy-<sha>` tag; the `:X.Y.Z` image tag is the human-readable name for
   that same build).

**Nothing mints a release on its own.** A merge that moves `VERSION` used to
trigger the tag; that was removed on 2026-08-30. Cutting a release is a
judgement about what the number means to a user, and "whenever VERSION happened
to change" is not that moment. Tagging also never writes to a branch, so
`main-protection` is untouched either way.

### Backfilling a release tag

The same workflow backfills a release that shipped before it existed — `0.1.0`
was never tagged, which is why the `[0.1.0]` link in `CHANGELOG.md` still
404s. Run it with version `0.1.0` and the commit that was live on 2026-06-11.

Users read what shipped at **`/docs` → Changelog** (in-app) and in
[`CHANGELOG.md`](../CHANGELOG.md) on the public repo.

## Enforcement (this is mechanical, not a convention)

- **`version-guard`** (`.github/workflows/ci.yml`, runs on every PR): fails if
  `VERSION` isn't valid SemVer, if `frontend/package.json` disagrees, or if
  `CHANGELOG.md` has no dated section for the current `VERSION`. It checks that
  the three places **agree**; it does not judge whether the number is the one
  the commits imply. That check existed briefly and was removed on 2026-08-30 —
  see the release process above.
- **`Release images`**: reads `VERSION`, **fails the build** if it isn't valid
  SemVer, and only then tags/pushes the images. No valid version → no images.
The operator additionally runs a local pre-commit guard that refuses a
`feat:`/`fix:` commit which doesn't stage `CHANGELOG.md` alongside it, so the
entry gets written *as the change is made* rather than remembered at release
time. That guard is workstation-local and not part of this repository — CI is
what binds everyone.

So an image without a standardized `X.Y.Z` tag cannot be produced, and a
version bump without a changelog entry cannot be merged.

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
