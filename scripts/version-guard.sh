#!/usr/bin/env bash
# version-guard — mechanical enforcement of ciphra's versioning rules.
#
# Fails (exit 1) unless ALL hold:
#   1. VERSION exists and is valid SemVer (X.Y.Z, digits only).
#   2. frontend/package.json "version" equals VERSION.
#   3. CHANGELOG.md has a `## [X.Y.Z]` section for the current VERSION
#      (a released section, not the [Unreleased] scaffold).
#   4. That section carries a release date.
#   5. If VERSION moved past the last release tag, it is at least the version
#      the commits earn (scripts/version-next.sh). Checks 1-3 only prove the
#      three places AGREE; this one is the first to ask whether the number is
#      RIGHT. Bumping further than earned is allowed (deliberate, and safe —
#      it over-signals); bumping less is not, because that is how a breaking
#      change ships looking like a patch.
#
# Run locally before pushing: scripts/version-guard.sh
# Wired into .github/workflows/ci.yml as the `version-guard` job, and the same
# SemVer check gates Release images. See docs/VERSIONING.md.
set -euo pipefail

cd "$(dirname "$0")/.."

fail() { echo "❌ version-guard: $*" >&2; exit 1; }
SEMVER='^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'

# 1 — VERSION is valid SemVer
[ -f VERSION ] || fail "VERSION file is missing at the repo root."
VERSION="$(tr -d '[:space:]' < VERSION)"
[ -n "$VERSION" ] || fail "VERSION is empty."
if ! printf '%s' "$VERSION" | grep -Eq "$SEMVER"; then
	fail "VERSION '$VERSION' is not valid SemVer (expected X.Y.Z, digits only)."
fi

# 2 — package.json agrees
PKG_VERSION="$(
	node -e "process.stdout.write(require('./frontend/package.json').version)" 2>/dev/null \
	|| grep -m1 '"version"' frontend/package.json | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/'
)"
[ "$PKG_VERSION" = "$VERSION" ] || \
	fail "frontend/package.json version '$PKG_VERSION' != VERSION '$VERSION'. Set them to the same value."

# 3 — CHANGELOG has a released section for this version
[ -f CHANGELOG.md ] || fail "CHANGELOG.md is missing."
# Match `## [X.Y.Z]` at line start; brackets are literal.
if ! grep -Eq "^##[[:space:]]+\[${VERSION//./\\.}\]" CHANGELOG.md; then
	fail "CHANGELOG.md has no section for [$VERSION]. Move the [Unreleased] notes into a '## [$VERSION] — YYYY-MM-DD' section."
fi

# 4 — that section is dated. The release workflow reads the section as the
# GitHub release body, and an undated heading is the tell for "promoted the
# [Unreleased] block and forgot to finish it".
if ! grep -Eq "^##[[:space:]]+\[${VERSION//./\\.}\][[:space:]]*[—-][[:space:]]*[0-9]{4}-[0-9]{2}-[0-9]{2}" CHANGELOG.md; then
	fail "CHANGELOG.md's [$VERSION] section has no release date. Write '## [$VERSION] — YYYY-MM-DD'."
fi

# 5 — the number is the one the commits earn.
#
# Needs tags and history: a shallow clone without tags has no baseline, and
# version-next says so rather than guessing. CI checks out with fetch-depth 0
# so this leg actually runs; locally it runs whenever you have the tags.
BASE_TAG="$(git tag -l 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname 2>/dev/null | head -1 || true)"

# Compare two X.Y.Z. Prints -1 / 0 / 1 for lt / eq / gt.
semver_cmp() {
	local a="$1" b="$2" i av bv
	IFS='.' read -r -a A <<< "$a"
	IFS='.' read -r -a B <<< "$b"
	for i in 0 1 2; do
		av="${A[$i]:-0}"; bv="${B[$i]:-0}"
		if [ "$av" -lt "$bv" ]; then echo -1; return; fi
		if [ "$av" -gt "$bv" ]; then echo 1; return; fi
	done
	echo 0
}

if [ -z "$BASE_TAG" ]; then
	echo "ℹ️  version-guard: no vX.Y.Z tag yet — skipping the computed-bump check."
	echo "    The first release tag establishes the baseline; after that this is enforced."
elif [ "${BASE_TAG#v}" = "$VERSION" ]; then
	echo "ℹ️  version-guard: VERSION is still $VERSION (the last release). Not a release change — computed-bump check does not apply."
else
	EARNED="$(./scripts/version-next.sh "$BASE_TAG")" || fail "could not compute the earned version (see above)."
	case "$(semver_cmp "$VERSION" "$EARNED")" in
		-1) fail "VERSION is $VERSION but the commits since $BASE_TAG earn $EARNED.
    A smaller bump than the commits earn hides the change from users reading
    the changelog. Either raise VERSION to $EARNED, or if a commit prefix is
    wrong, fix the prefix. docs/VERSIONING.md has the table." ;;
		 0) echo "✅ version-guard: VERSION=$VERSION matches what the commits since $BASE_TAG earn." ;;
		 1) echo "⚠️  version-guard: VERSION=$VERSION is a LARGER bump than the commits earn ($EARNED)."
		    echo "    Allowed — over-signalling is safe. Ignore this if the bump is deliberate." ;;
	esac
fi

echo "✅ version-guard: VERSION=$VERSION, package.json matches, CHANGELOG has a dated [$VERSION]."
