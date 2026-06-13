#!/usr/bin/env bash
#
# Deploy ciphra by tagging a commit so the VPS auto-deploys it.
# Mirrors the manual "Standard deploy" flow in docs/OPERATIONS.md.
#
# The VPS runs ciphra-deploy.timer (every ~3 min) watching for `deploy-<sha>`
# tags → pulls the three images for that SHA → cosign-verifies → bumps .env →
# restarts → health-checks (auto-rollback on failure, ntfy on OK/FAILED).
# This script just does the laptop side: sanity-check, tag, push, then wait.
#
# Usage:
#   scripts/deploy.sh                 # deploy the current origin/main tip
#   scripts/deploy.sh <sha>           # deploy a specific commit (e.g. rollback)
#   scripts/deploy.sh --yes           # skip the interactive confirm
#   scripts/deploy.sh --no-wait       # don't poll for health after pushing
#
# Safety: refuses to deploy a commit that isn't on origin/main, or whose
# release-images build hasn't SUCCEEDED (no signed images → VPS would reject).

set -euo pipefail

REMOTE="${CIPHRA_REMOTE:-origin}"
HEALTH_URL="${CIPHRA_HEALTH_URL:-https://ciphra.ch/health}"
SW_URL="${CIPHRA_SW_URL:-https://ciphra.ch/sw.js}"

TARGET=""; ASSUME_YES=0; WAIT=1
for a in "$@"; do
  case "$a" in
    --yes|-y)   ASSUME_YES=1 ;;
    --no-wait)  WAIT=0 ;;
    -h|--help)  sed -n '2,22p' "$0"; exit 0 ;;
    -*)         echo "unknown flag: $a" >&2; exit 2 ;;
    *)          TARGET="$a" ;;
  esac
done

command -v gh  >/dev/null || { echo "✗ gh CLI required (brew install gh)" >&2; exit 1; }
command -v git >/dev/null || { echo "✗ git required" >&2; exit 1; }
git rev-parse --git-dir >/dev/null 2>&1 || { echo "✗ not a git repo" >&2; exit 1; }

echo "→ fetching $REMOTE…"
git fetch -q "$REMOTE" main 'refs/tags/*:refs/tags/*' || git fetch -q "$REMOTE" main

# Default target = the tip of origin/main.
[ -n "$TARGET" ] || TARGET="$REMOTE/main"
FULL="$(git rev-parse "$TARGET^{commit}")"
SHA="$(git rev-parse --short=7 "$FULL")"

# 1) Must be on origin/main — never deploy an unmerged/unpushed commit.
if ! git merge-base --is-ancestor "$FULL" "$REMOTE/main"; then
  echo "✗ $SHA is not on $REMOTE/main — refusing to deploy an unmerged commit." >&2
  exit 1
fi
echo "→ target: $SHA  $(git log -1 --format='%s' "$FULL")"

# 2) Images for this exact commit must be built + signed (release-images green).
echo "→ verifying release-images build for $SHA…"
INFO="$(gh run list --workflow=release-images.yml -L 40 \
          --json headSha,status,conclusion \
          -q "first(.[] | select(.headSha==\"$FULL\")) | \"\(.status) \(.conclusion)\"" \
          2>/dev/null || true)"
read -r ST CC <<<"${INFO:-}"
case "${ST:-}/${CC:-}" in
  completed/success) echo "  ✓ images built + signed on ghcr" ;;
  /|/*)  echo "✗ no release-images run found for $SHA — pushed to main and built yet?" >&2; exit 1 ;;
  completed/*) echo "✗ release-images for $SHA did NOT succeed ($CC). Fix CI before deploying." >&2; exit 1 ;;
  *)     echo "✗ release-images for $SHA still in progress ($ST). Wait for it to finish." >&2; exit 1 ;;
esac

# 3) Don't re-tag an already-deployed commit.
TAG="deploy-$SHA"
if git ls-remote --tags --quiet "$REMOTE" "refs/tags/$TAG" | grep -q .; then
  echo "✗ $TAG already exists on $REMOTE — $SHA was already deployed." >&2
  echo "  Force a redeploy by deleting it first:" >&2
  echo "    git push $REMOTE :refs/tags/$TAG && git tag -d $TAG" >&2
  exit 1
fi

# 4) Confirm (this triggers a PRODUCTION deploy).
if [ "$ASSUME_YES" -ne 1 ]; then
  if [ ! -t 0 ]; then
    echo "✗ refusing to deploy non-interactively without --yes" >&2; exit 1
  fi
  printf "Deploy %s to PRODUCTION (%s)? [y/N] " "$SHA" "$HEALTH_URL"
  read -r ans
  case "$ans" in y|Y|yes|YES) ;; *) echo "aborted."; exit 0 ;; esac
fi

# 5) Tag + push → VPS picks it up within ~3 min.
echo "→ pushing $TAG…"
git tag "$TAG" "$FULL"
git push "$REMOTE" "$TAG"
echo "  ✓ pushed. VPS deploys within ~3 min (watch: journalctl -u ciphra-deploy -f; ntfy reports OK/FAILED)."

if [ "$WAIT" -ne 1 ]; then exit 0; fi

# 6) Poll prod health (liveness; auto-rollback means a sustained 200 == good).
echo "→ waiting for rollout (polling $HEALTH_URL, up to 7 min)…"
deadline=$(( $(date +%s) + 420 ))
ok=0
while [ "$(date +%s)" -lt "$deadline" ]; do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" || true)" = "200" ]; then
    ok=$((ok+1)); [ "$ok" -ge 2 ] && break   # two clean polls in a row
  else
    ok=0
  fi
  sleep 15
done
if [ "$ok" -ge 2 ]; then
  cc="$(curl -s -D - -o /dev/null --max-time 5 "$SW_URL?x=$$" | tr -d '\r' | grep -i '^cache-control:' || true)"
  echo "  ✓ $HEALTH_URL → 200 (stable)"
  echo "  sw.js ${cc:-(no cache-control header)}"
  echo "✓ deploy $SHA is live and healthy."
else
  echo "⚠ health not stable within 7 min — check 'journalctl -u ciphra-deploy -f' on the VPS." >&2
  echo "  (the deploy auto-rolls-back on a failed health check; ntfy will say FAILED.)" >&2
  exit 1
fi
