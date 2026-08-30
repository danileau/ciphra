#!/usr/bin/env bash
# test-version-next — prove the bump table in docs/VERSIONING.md is what
# scripts/version-next.sh actually implements.
#
# Builds a throwaway git repo per case so the assertions are deterministic and
# do not depend on ciphra's own history. Run it after touching either the
# script or the table:
#
#   scripts/test-version-next.sh
#
# Wired into CI as part of the version-guard job.
set -euo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/version-next.sh"
PASS=0
FAIL=0

# One case: a baseline version, a list of commit subjects, the expected result.
case_is() {
	local name="$1" base="$2" want="$3"; shift 3
	local dir
	dir="$(mktemp -d)"
	(
		cd "$dir"
		git init -q .
		git config user.email t@example.com
		git config user.name t
		git config commit.gpgsign false
		printf '%s\n' "$base" > VERSION
		git add VERSION
		git commit -qm "chore: baseline"
		git tag -a "v$base" -m "release $base"
		for subject in "$@"; do
			# `--allow-empty` keeps the fixtures to one line each; only the
			# subject and body matter to the script.
			git commit -q --allow-empty -m "$subject"
		done
		cp "$SCRIPT" ./version-next.sh
		# The script cds to its parent's parent, so give it that shape.
		mkdir -p scripts && mv version-next.sh scripts/
		"./scripts/version-next.sh" 2>/dev/null
	) > "$dir/.out" 2>&1 || { echo "❌ $name: script exited non-zero"; FAIL=$((FAIL+1)); rm -rf "$dir"; return; }

	local got
	got="$(tail -1 "$dir/.out")"
	if [ "$got" = "$want" ]; then
		echo "✅ $name: $base → $got"
		PASS=$((PASS+1))
	else
		echo "❌ $name: expected $want, got $got"
		FAIL=$((FAIL+1))
	fi
	rm -rf "$dir"
}

echo "version-next — bump table (docs/VERSIONING.md)"
echo

case_is "feat → MINOR" 1.4.2 1.5.0 \
	"feat(reports): period picker"
case_is "fix → PATCH" 1.4.2 1.4.3 \
	"fix(auth): stop the race"
case_is "largest bump wins" 1.4.2 1.5.0 \
	"fix(auth): stop the race" "feat(reports): period picker" "docs: tidy"
case_is "feat! → MAJOR" 1.4.2 2.0.0 \
	"feat(api)!: drop the legacy document route"
case_is "BREAKING CHANGE footer → MAJOR" 1.4.2 2.0.0 \
	"$(printf 'refactor(api): rework the document contract\n\nBREAKING CHANGE: old documents no longer decode.')"
case_is "0.y.z: breaking bumps MINOR, not MAJOR" 0.1.0 0.2.0 \
	"feat(api)!: drop the legacy document route"
case_is "docs/chore/ci alone → no bump" 1.4.2 1.4.2 \
	"docs: refresh the runbook" "chore(deps): bump vite" "ci: cache npm"
case_is "perf and a11y are PATCH" 1.4.2 1.4.3 \
	"perf(journal): window the list" "a11y(modal): trap focus"
case_is "scopeless prefixes count too" 1.4.2 1.5.0 \
	"feat: family sharing"
case_is "a prefix-shaped word mid-subject does not count" 1.4.2 1.4.2 \
	"docs: explain why feat: commits earn a MINOR"

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
