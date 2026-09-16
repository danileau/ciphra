# changelog.d — pending changelog entries

Every change a user would notice gets an entry in [`CHANGELOG.md`](../CHANGELOG.md)
(users read it in the app at `/docs → Changelog`). Until the change is released,
that entry lives **here, as a file of its own** — not in `CHANGELOG.md`.

## Why a file per change

Every pull request used to add its lines under `CHANGELOG.md`'s `## [Unreleased]`
heading — the same few lines of the same file — so any two PRs open at the same
time conflicted, whatever they said. Resolving prose conflicts is easy to get
wrong: on 2026-09-16 an "Update branch" merge silently dropped all seven entries
of #192. A new file cannot conflict with another new file.

## Writing one

Add `changelog.d/<name>.md` in the same PR as the change. Use a name no other
open PR will pick — the branch name is a good default (`fix/offline-sync` →
`fix-offline-sync.md`). Lowercase, kebab-case, `.md`.

The content is written exactly like a slice of the changelog — one or more
`### Section` headings with `- ` entries under them:

```markdown
### Added
- **Medication changes now have a history.** When a dose changes, choose
  *Change* on the medication, say what is changing and from when.

### Fixed
- Deleting a medication you had logged against removed it from your reports.
```

- Sections: `Added`, `Changed`, `Fixed`, `Security`, `Deprecated`, `Removed`
  (which one earns which version bump: [`docs/VERSIONING.md`](../docs/VERSIONING.md)).
- Indent continuation lines. Nothing outside an entry — text that belongs to no
  section would be lost.
- Write for the person using ciphra, not for a commit log: "Reports export now
  offers a period picker", not "add exportPeriods.ts".
- Edit your fragment freely while the PR is open; it is yours alone.

## What checks it

- `node scripts/changelog.mjs check` — every fragment parses (CI).
- `scripts/changelog-guard.sh` — a PR with `feat`/`fix` commits carries a
  fragment, and only a release PR edits `CHANGELOG.md` (CI). Nothing to tell
  users? Put `[skip changelog]` in the commit message or PR description.
  Correcting notes that already shipped? `[changelog edit]`.
- `node scripts/changelog.mjs preview` — what the next release would say.

## Releasing

The release PR runs `node scripts/changelog.mjs release X.Y.Z`: pending entries
(from here and from any left under `[Unreleased]`) become the dated `## [X.Y.Z]`
section, the fragments are deleted, and `VERSION` + `frontend/package.json` are
set. The full process is in [`docs/VERSIONING.md`](../docs/VERSIONING.md).

Until then the app already shows pending entries under **Unreleased** at
`/docs → Changelog`, so a change that is deployed but not yet released is not
invisible to the people using it.
