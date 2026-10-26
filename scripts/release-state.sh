#!/usr/bin/env bash
# release-state — is the commit about to be deployed part of a release?
#
# Two things get forgotten between merging and deploying, both silently:
#
#   1. **Changes that are in no release yet.** `changelog.d/` fragments are
#      compiled by the release PR. Deploying with fragments still pending is
#      legitimate — the app shows them under "Unreleased" — but the version
#      the app reports then understates what it is running.
#   2. **A version whose tag was never minted.** `Release tag` is a manual
#      workflow by operator decision (#179). v1.4.0 merged on 2026-09-16 and
#      was still untagged three days later, so every `compare/v1.4.0…` link in
#      the changelog users read at /docs was dead, and nothing said so.
#
# Both are warnings, never a block: this prints what it found and exits 1 when
# there is something to say, so a caller can decide. The deploy wizard prints
# it before its confirm prompt.
#
#   scripts/release-state.sh <sha> [remote]
#
# Pure git — no network beyond one `ls-remote`, no `gh`, no writes.
set -euo pipefail

SHA="${1:?usage: release-state.sh <sha> [remote]}"
REMOTE="${2:-origin}"

if [ -t 1 ]; then
	B=$'\e[1m'; DIM=$'\e[2m'; R=$'\e[0m'; YLW=$'\e[33m'
else
	B=""; DIM=""; R=""; YLW=""
fi

RESOLVED="$(git rev-parse --verify --quiet "${SHA}^{commit}" || true)"
[ -n "$RESOLVED" ] || {
	echo "release-state: '${SHA}' is not a commit in this repository." >&2
	exit 2
}
SHORT="$(git rev-parse --short "$RESOLVED")"

found=0

# 1 — fragments that no release has compiled yet.
FRAGMENTS="$(git ls-tree --name-only "$SHA" changelog.d/ 2>/dev/null | grep -v '/README\.md$' || true)"
COUNT="$(printf '%s' "$FRAGMENTS" | grep -c . || true)"
VERSION="$(git show "$SHA:VERSION" 2>/dev/null | tr -d '[:space:]' || true)"

if [ "${COUNT:-0}" -gt 0 ]; then
	found=1
	echo "${YLW}⚠ ${COUNT} changelog fragment(s) here are in no release yet.${R}"
	printf '%s\n' "$FRAGMENTS" | sed "s|^|    ${DIM}|;s|$|${R}|"
	echo "  ${DIM}The app will report ${VERSION:-its current version} while running these changes.${R}"
	echo "  ${DIM}Cut one first: ${R}${B}node scripts/changelog.mjs release X.Y.Z${R}${DIM} — scripts/version-next.sh suggests the number.${R}"
fi

# 2 — a VERSION whose tag was never minted.
if [ -n "$VERSION" ]; then
	if ! git ls-remote --tags --exit-code "$REMOTE" "refs/tags/v$VERSION" >/dev/null 2>&1; then
		found=1
		echo "${YLW}⚠ v${VERSION} has no tag — that release was never minted.${R}"
		echo "  ${DIM}Actions → ${R}${B}Release tag${R}${DIM} → version ${VERSION}, sha ${SHORT}.${R}"
		echo "  ${DIM}Until then every compare/v${VERSION}… link in the changelog users read at /docs is dead.${R}"
	fi
fi

[ "$found" -eq 0 ] && exit 0
exit 1
