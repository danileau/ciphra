#!/usr/bin/env bash
# version-next — compute the version this release should carry.
#
# Reads the commit subjects since the last release tag and applies the
# prefix → bump table from docs/VERSIONING.md:
#
#   feat!  / fix!  / a `BREAKING CHANGE:` footer  → MAJOR
#   feat                                          → MINOR
#   fix, perf, refactor, style, a11y              → PATCH
#   docs, test, chore, build, ci                  → nothing on their own
#
# The release's bump is the LARGEST any commit contributes. While the major
# is 0 the public contract is unstable, so a breaking change bumps MINOR
# (0.1.0 → 0.2.0), not MAJOR — same carve-out the doc states.
#
# Prints the computed version on stdout and its reasoning on stderr, so
#   NEXT="$(scripts/version-next.sh)"
# is safe in a pipeline.
#
# Baseline is the highest `vX.Y.Z` tag. Before the first one exists there is
# no range to read, so this prints the current VERSION unchanged and says so
# on stderr — callers treat that as "cannot compute", not as an answer.
# Override the baseline with `scripts/version-next.sh <ref>`.
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="$(tr -d '[:space:]' < VERSION)"

# Highest v* tag by version order, not by date: a backfilled historical tag
# must not become the baseline just because it was pushed most recently.
latest_tag() {
	git tag -l 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -1
}

BASE="${1-$(latest_tag)}"

if [ -z "$BASE" ]; then
	echo "version-next: no vX.Y.Z tag yet — nothing to compute a bump from." >&2
	echo "version-next: printing the current VERSION ($VERSION) unchanged." >&2
	printf '%s\n' "$VERSION"
	exit 0
fi

if ! git rev-parse --verify --quiet "$BASE^{commit}" >/dev/null; then
	echo "version-next: baseline '$BASE' is not a commit this clone knows." >&2
	echo "version-next: fetch tags (git fetch --tags) or pass an explicit ref." >&2
	exit 1
fi

# The version the baseline tag names, which is what we bump FROM. Taking it
# from the tag rather than the VERSION file means a release PR that already
# edited VERSION still computes against the last shipped release.
BASE_VERSION="${BASE#v}"
if ! printf '%s' "$BASE_VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
	echo "version-next: baseline '$BASE' does not name a version." >&2
	exit 1
fi
IFS='.' read -r MAJOR MINOR PATCH <<< "$BASE_VERSION"

RANGE="$BASE..HEAD"
COUNT="$(git rev-list --count "$RANGE")"

# `%s` is the subject, `%b` the body. A `!` before the colon or a
# `BREAKING CHANGE:` footer marks a break; both forms are in the doc.
SUBJECTS="$(git log --format='%s' "$RANGE")"
BODIES="$(git log --format='%b' "$RANGE")"

TYPE='^[a-z]+(\([^)]*\))?'
has_break=0
has_feat=0
has_patch=0

if printf '%s\n' "$SUBJECTS" | grep -Eq "${TYPE}!:"; then has_break=1; fi
if printf '%s\n' "$BODIES"   | grep -q  'BREAKING CHANGE:';  then has_break=1; fi
if printf '%s\n' "$SUBJECTS" | grep -Eq "^feat(\([^)]*\))?:"; then has_feat=1; fi
if printf '%s\n' "$SUBJECTS" | grep -Eq "^(fix|perf|refactor|style|a11y)(\([^)]*\))?:"; then has_patch=1; fi

if [ "$has_break" = 1 ]; then
	if [ "$MAJOR" = 0 ]; then
		REASON="a breaking change, but the major is still 0 → MINOR (docs/VERSIONING.md 0.y.z caveat)"
		MINOR=$((MINOR + 1)); PATCH=0
	else
		REASON='a breaking change → MAJOR'
		MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0
	fi
elif [ "$has_feat" = 1 ]; then
	REASON='a new user-facing capability → MINOR'
	MINOR=$((MINOR + 1)); PATCH=0
elif [ "$has_patch" = 1 ]; then
	REASON='fixes only → PATCH'
	PATCH=$((PATCH + 1))
else
	REASON='nothing that earns a bump on its own (docs/chore/test/ci only)'
fi

NEXT="${MAJOR}.${MINOR}.${PATCH}"
echo "version-next: $COUNT commit(s) since $BASE — $REASON" >&2
echo "version-next: $BASE_VERSION → $NEXT" >&2
printf '%s\n' "$NEXT"
