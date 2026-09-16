#!/usr/bin/env bash
# test-changelog — prove scripts/changelog-guard.sh and
# `scripts/changelog.mjs release` do what changelog.d/README.md says.
#
# Builds a throwaway git repo per case, like test-version-next.sh, so nothing
# depends on ciphra's own history. The compiler itself is unit-tested by
# frontend/src/lib/changelogFragments.test.ts; this covers the git-facing
# guard and the release command end to end.
#
#   scripts/test-changelog.sh
#
# Wired into CI as part of the version-guard job.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0
FAIL=0

ok()   { echo "✅ $1"; PASS=$((PASS+1)); }
bad()  { echo "❌ $1"; FAIL=$((FAIL+1)); }

# A repo on `main` with VERSION + CHANGELOG.md + the scripts, then a `pr`
# branch. Prints its path.
fixture() {
	local dir
	dir="$(mktemp -d)"
	(
		cd "$dir"
		git init -q -b main .
		git config user.email t@example.com
		git config user.name t
		git config commit.gpgsign false
		mkdir -p scripts changelog.d frontend/src/lib
		cp "$REPO/scripts/changelog-guard.sh" "$REPO/scripts/changelog.mjs" scripts/
		cp "$REPO/frontend/src/lib/changelogFragments.js" "$REPO/frontend/src/lib/changelogFragmentFiles.js" frontend/src/lib/
		printf '{\n  "name": "fixture",\n  "version": "1.3.0",\n  "type": "module"\n}\n' > frontend/package.json
		printf '1.3.0\n' > VERSION
		cat > CHANGELOG.md <<'MD'
# Changelog

## [Unreleased]

<!-- Nothing yet. Pending entries live in changelog.d/ — see changelog.d/README.md. -->

## [1.3.0] — 2026-08-30

### Added
- Old.

[Unreleased]: https://github.com/danileau/ciphra/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/danileau/ciphra/releases/tag/v1.3.0
MD
		printf '# fragments\n' > changelog.d/README.md
		echo "code" > app.txt
		git add -A && git commit -qm "chore: baseline"
		git checkout -qb pr
	) >/dev/null
	printf '%s' "$dir"
}

commit() { # commit <dir> <message> [file content]
	local dir="$1" msg="$2"
	( cd "$dir" && echo "$RANDOM" >> app.txt && git add -A && git commit -qm "$msg" )
}

guard() { # guard <dir> → exit status of the guard
	( cd "$1" && PR_TITLE="${PR_TITLE:-}" PR_BODY="${PR_BODY:-}" scripts/changelog-guard.sh main pr >/dev/null 2>&1 )
}

expect_guard() { # expect_guard <name> <want: pass|fail> <dir>
	local name="$1" want="$2" dir="$3" got=pass
	guard "$dir" || got=fail
	[ "$got" = "$want" ] && ok "guard: $name ($got)" || bad "guard: $name — expected $want, got $got"
	rm -rf "$dir"
}

# ── guard ────────────────────────────────────────────────────────────────
d="$(fixture)"; commit "$d" "fix(api): batch import"
expect_guard "fix without a fragment" fail "$d"

d="$(fixture)"; commit "$d" "feat(reports): picker"
printf '### Added\n- A picker.\n' > "$d/changelog.d/feat-picker.md"; commit "$d" "docs: fragment"
expect_guard "feat with a fragment in a later commit" pass "$d"

d="$(fixture)"; commit "$d" "feat!: rotate keys"
expect_guard "breaking feat without a fragment" fail "$d"

d="$(fixture)"; commit "$d" "chore(deps): bump vite"; commit "$d" "docs: typo"
expect_guard "no feat/fix — nothing needed" pass "$d"

d="$(fixture)"; commit "$d" "fix(ci): flaky test [skip changelog]"
expect_guard "[skip changelog] in the commit" pass "$d"

d="$(fixture)"; commit "$d" "fix(ci): flaky test"
PR_BODY="internal only [skip changelog]" expect_guard "[skip changelog] in the PR body" pass "$d"

d="$(fixture)"; commit "$d" "chore: tidy"
PR_TITLE="fix(api): something users see" expect_guard "feat/fix PR title without a fragment" fail "$d"

d="$(fixture)"; commit "$d" "fix(api): batch import"
( cd "$d" && sed -i 's/^<!-- Nothing yet.*$/### Fixed\n- Batch import./' CHANGELOG.md && git commit -qam "docs: changelog" )
expect_guard "fix that edits CHANGELOG.md instead of a fragment" fail "$d"

d="$(fixture)"
( cd "$d" && sed -i 's/^- Old\.$/- Old, corrected./' CHANGELOG.md && git commit -qam "docs(changelog): fix a shipped note [changelog edit]" )
expect_guard "[changelog edit] corrects released notes" pass "$d"

d="$(fixture)"; commit "$d" "fix(api): batch import"
( cd "$d" && printf '1.4.0\n' > VERSION && sed -i 's/^<!-- Nothing yet.*$/### Fixed\n- Batch import./' CHANGELOG.md && git commit -qam "release: 1.4.0" )
expect_guard "release PR edits CHANGELOG.md and VERSION" pass "$d"

d="$(fixture)"; commit "$d" "fix(api): batch import"
printf 'no heading here\n' > "$d/changelog.d/fix-batch.md"; commit "$d" "docs: fragment"
( cd "$d" && node scripts/changelog.mjs check >/dev/null 2>&1 ) && bad "check: invalid fragment accepted" || ok "check: invalid fragment rejected"
rm -rf "$d"

# Merge commits from "Update branch" don't count as the PR's own feat/fix.
d="$(fixture)"
( cd "$d" && git checkout -q main && echo x >> app.txt && git commit -qam "fix(main): already released elsewhere [skip changelog]" \
  && git checkout -q pr && echo y > other.txt && git add other.txt && git commit -qm "docs: notes" \
  && git merge -q --no-edit main )
expect_guard "merge from main brings no requirement" pass "$d"

# ── release end to end ───────────────────────────────────────────────────
d="$(fixture)"
printf '### Added\n- **Dose history.** A change keeps\n  earlier days.\n' > "$d/changelog.d/feat-dose.md"
printf '### Fixed\n- A failed save said "Saved".\n\n### Security\n- Locked offline entries synced as shareable.\n' > "$d/changelog.d/fix-sync.md"
if ( cd "$d" && node scripts/changelog.mjs release 1.4.0 --date 2026-09-20 >/dev/null ); then
	c="$d/CHANGELOG.md"
	checks=(
		"grep -q '^## \[1.4.0\] — 2026-09-20$' '$c'"
		"grep -q 'Dose history' '$c'"
		"grep -q 'Locked offline entries' '$c'"
		"grep -q '^\[1.4.0\]: https://github.com/danileau/ciphra/releases/tag/v1.4.0$' '$c'"
		"grep -q 'compare/v1.4.0...HEAD' '$c'"
		"[ \"\$(cat '$d/VERSION')\" = 1.4.0 ]"
		"grep -q '\"version\": \"1.4.0\"' '$d/frontend/package.json'"
		"[ ! -e '$d/changelog.d/feat-dose.md' ] && [ ! -e '$d/changelog.d/fix-sync.md' ]"
		"[ -e '$d/changelog.d/README.md' ]"
		"awk '/^### /{print \$2}' '$c' | head -3 | tr '\n' ' ' | grep -q '^Added Fixed Security'"
	)
	all=1
	for c_ in "${checks[@]}"; do eval "$c_" || { bad "release: failed check: $c_"; all=0; }; done
	[ "$all" = 1 ] && ok "release: section, links, VERSION, package.json, fragments removed, section order"
else
	bad "release: command failed"
fi
rm -rf "$d"

d="$(fixture)"
( cd "$d" && node scripts/changelog.mjs release 1.4.0 >/dev/null 2>&1 ) && bad "release: empty release accepted" || ok "release: refuses when nothing is pending"
rm -rf "$d"

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
