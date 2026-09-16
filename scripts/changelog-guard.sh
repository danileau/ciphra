#!/usr/bin/env bash
# changelog-guard — a pull request that earns a changelog entry carries one,
# as a fragment in changelog.d/.
#
#   scripts/changelog-guard.sh <base> <head>
#
# Fails (exit 1) when either holds:
#   1. A commit in base..head is a `feat`/`fix` (optionally scoped, optionally
#      `!`) — or PR_TITLE is — and the PR adds or edits no changelog.d/*.md
#      fragment. Waived by `[skip changelog]` in that commit's message, in
#      PR_TITLE or in PR_BODY, and by a release PR (one that changes VERSION).
#   2. CHANGELOG.md itself is edited by a PR that is not a release. Direct
#      edits to that one shared file are what made every open PR conflict with
#      every other (2026-09-16: #192's entries were lost resolving one).
#      Correcting notes that already shipped is legitimate: put
#      `[changelog edit]` in a commit message or PR_BODY.
#
# This is the CI twin of the operator's local commit hook. The hook only runs
# on one laptop and never sees a conflict resolved in GitHub's web editor; CI
# binds everyone (docs/VERSIONING.md → Enforcement).
#
# PR_TITLE / PR_BODY come from the workflow's pull_request event; both are
# optional so the script also runs locally:
#   scripts/changelog-guard.sh origin/main HEAD
set -euo pipefail

BASE="${1:?usage: changelog-guard.sh <base> <head>}"
HEAD="${2:?usage: changelog-guard.sh <base> <head>}"
PR_TITLE="${PR_TITLE:-}"
PR_BODY="${PR_BODY:-}"

FEATFIX='^(feat|fix)(\([^)]*\))?!?:'
SKIP='\[skip changelog\]'
EDIT='\[changelog edit\]'

changed() {
	git diff --name-only --diff-filter="$1" "$BASE...$HEAD" -- "${@:2}"
}

fragments="$(changed AMR 'changelog.d/*.md' | grep -v '^changelog.d/README.md$' || true)"
is_release=""
[ -n "$(changed ACMR VERSION)" ] && is_release=1

needs=()
waived=""
printf '%s' "$PR_TITLE$PR_BODY" | grep -Eqi "$SKIP" && waived=1

# Merge commits carry "Merge branch 'main' into …" subjects and nothing of
# their own; the commits they bring in are already in base.
while IFS= read -r -d $'\x1e' record; do
	record="${record#$'\n'}"
	[ -n "$record" ] || continue
	sha="${record%%$'\x1f'*}"
	msg="${record#*$'\x1f'}"
	subject="$(printf '%s' "$msg" | sed -n '1p')"
	if printf '%s' "$subject" | grep -Eq "$FEATFIX"; then
		printf '%s' "$msg" | grep -Eqi "$SKIP" && continue
		needs+=("${sha:0:7} $subject")
	fi
done < <(git log --no-merges --format='%H%x1f%B%x1e' "$BASE..$HEAD")

if [ -n "$PR_TITLE" ] && printf '%s' "$PR_TITLE" | grep -Eq "$FEATFIX"; then
	needs+=("PR title: $PR_TITLE")
fi

status=0

if [ ${#needs[@]} -gt 0 ] && [ -z "$fragments" ] && [ -z "$is_release" ] && [ -z "$waived" ]; then
	status=1
	echo "❌ changelog-guard: this PR has feat/fix changes but no changelog fragment." >&2
	printf '   %s\n' "${needs[@]}" >&2
	echo "   Add changelog.d/<name>.md — format in changelog.d/README.md." >&2
	echo "   Nothing a user would notice? Put [skip changelog] in the commit message or PR description." >&2
fi

if [ -n "$(changed ACMR CHANGELOG.md)" ] && [ -z "$is_release" ]; then
	edit_ok=""
	git log --format='%B' "$BASE..$HEAD" | grep -Eqi "$EDIT" && edit_ok=1
	printf '%s' "$PR_BODY" | grep -Eqi "$EDIT" && edit_ok=1
	if [ -z "$edit_ok" ]; then
		status=1
		echo "❌ changelog-guard: CHANGELOG.md is edited, but this is not a release PR (VERSION unchanged)." >&2
		echo "   Pending entries go in changelog.d/ — every PR editing CHANGELOG.md conflicts with every other." >&2
		echo "   Correcting notes that already shipped? Put [changelog edit] in a commit message or the PR description." >&2
	fi
fi

if [ "$status" -eq 0 ]; then
	if [ -n "$fragments" ]; then
		echo "✅ changelog-guard: fragment(s): $(printf '%s' "$fragments" | tr '\n' ' ')"
	elif [ -n "$is_release" ]; then
		echo "✅ changelog-guard: release PR (VERSION changed)."
	elif [ ${#needs[@]} -gt 0 ]; then
		echo "✅ changelog-guard: feat/fix changes waived by [skip changelog]."
	else
		echo "✅ changelog-guard: no feat/fix changes — no fragment needed."
	fi
fi
exit "$status"
