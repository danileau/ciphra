#!/usr/bin/env bash
# changelog-section — print one release's notes from CHANGELOG.md.
#
#   scripts/changelog-section.sh 0.2.0
#
# Prints everything under `## [0.2.0] — YYYY-MM-DD` up to the next `## `
# heading, without the heading itself. The release workflow uses it as the
# GitHub release body, so what users read on the releases page is the same
# text they read in the app at /docs → Changelog — one source, no second
# summary to keep in sync.
#
# Exits 1 if the section is missing or empty, so a release cannot be minted
# with a body nobody wrote.
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="${1:-}"
[ -n "$VERSION" ] || { echo "usage: changelog-section.sh <X.Y.Z>" >&2; exit 1; }

[ -f CHANGELOG.md ] || { echo "changelog-section: CHANGELOG.md is missing." >&2; exit 1; }

BODY="$(
	awk -v want="## [$VERSION]" '
		# Start at the wanted heading, stop at the next second-level heading.
		index($0, want) == 1 { inside = 1; next }
		inside && /^## / { exit }
		# The oldest section runs to the end of the file, where the link
		# reference definitions live ("[0.1.0]: https://..."). They are
		# markdown plumbing, not release notes.
		inside && /^\[[^]]+\]:[[:space:]]*http/ { exit }
		inside { print }
	' CHANGELOG.md
)"

# Trim leading/blank-only and trailing blank lines; keep the inner shape.
BODY="$(printf '%s\n' "$BODY" | sed -e '/./,$!d' | sed -e :a -e '/^\n*$/{$d;N;};/\n$/ba')"

if [ -z "$BODY" ]; then
	echo "changelog-section: no notes found for [$VERSION] in CHANGELOG.md." >&2
	exit 1
fi

printf '%s\n' "$BODY"
