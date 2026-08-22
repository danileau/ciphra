#!/usr/bin/env bash
# version-guard — mechanical enforcement of ciphra's versioning rules.
#
# Fails (exit 1) unless ALL hold:
#   1. VERSION exists and is valid SemVer (X.Y.Z, digits only).
#   2. frontend/package.json "version" equals VERSION.
#   3. CHANGELOG.md has a `## [X.Y.Z]` section for the current VERSION
#      (a released section, not the [Unreleased] scaffold).
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

echo "✅ version-guard: VERSION=$VERSION, package.json matches, CHANGELOG has [$VERSION]."
