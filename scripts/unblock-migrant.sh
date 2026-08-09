#!/usr/bin/env bash
#
# unblock-migrant.sh — hand a stranded migrant a working migration link.
#
# For users caught by INC-001: their link was minted against a host that only
# redirects, so the fetch died in the browser and nothing reached epilepc.
# Their token was never consumed, so it is still good — it just needs to point
# at a host that actually serves.
#
# This rebuilds the link against a verified source host and checks the contract
# BEFORE you send it, so nobody gets a second dead link.
#
#   scripts/unblock-migrant.sh <token> [source-host]
#
# Get <token> from the epilepc database (never from a log or an email):
#
#   SELECT mt.token, mt.expires_at, mt.used_at
#     FROM migration_token mt JOIN user u ON u.id = mt.user_id
#    WHERE u.email = '<their email>' AND mt.used_at IS NULL
#      AND mt.expires_at > NOW()
#    ORDER BY mt.created_at DESC LIMIT 1;
#
# ─────────────────────────────────────────────────────────────────────────────
# SAFETY: this script never issues a GET to /api/ciphra-export/<token>.
# In production today the token is consumed on attempt, so a "just checking"
# GET would spend the user's link and throw the bundle away — turning a
# recoverable situation into an unrecoverable one. Validation is OPTIONS-only,
# which returns before the token is ever looked at.
# ─────────────────────────────────────────────────────────────────────────────
#
set -uo pipefail

TOKEN="${1:-}"
SOURCE_HOST="${2:-${MIGRATION_EXPORT_HOST:-www.epilepc.ch}}"
CIPHRA_ORIGIN="${CIPHRA_ORIGIN:-https://ciphra.ch}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$*"; }
info() { printf '  \033[36m→\033[0m %s\n' "$*"; }

if [ -z "$TOKEN" ]; then
	echo "usage: $0 <token> [source-host]" >&2
	exit 2
fi

# Same shape config/routes.yaml accepts. Reject anything else rather than
# building a link around a malformed value.
if ! printf '%s' "$TOKEN" | grep -qE '^[A-Za-z0-9_-]{1,64}$'; then
	bad "token has an unexpected shape — refusing to build a link"
	exit 2
fi

bold "Validating the source host before we hand anything over"
if ! SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; then exit 1; fi
if ! EPILEPC_ORIGIN="$SOURCE_HOST" CIPHRA_ORIGIN="$CIPHRA_ORIGIN" \
	"$SCRIPT_DIR/verify-migration-origin.sh"; then
	bad "$SOURCE_HOST fails the origin contract — a link built on it would die too."
	info "Pick a host that serves the endpoints directly, then re-run."
	exit 1
fi

LINK="${CIPHRA_ORIGIN%/}/migrate#migrate=${TOKEN}&source=${SOURCE_HOST}"

bold "Recovery link"
echo
printf '  %s\n' "$LINK"
echo
ok "source host verified: serves directly, CORS echoes ${CIPHRA_ORIGIN}"
echo
bold "Before you send it"
cat <<'NOTES'
  1. Confirm in the DB that the token is still unused and unexpired
     (used_at IS NULL, expires_at > NOW()). This script deliberately does
     not check that over HTTP — doing so would consume the token.

  2. Tell them NOT to run the ciphra setup wizard first.
     A migrant whose first attempt failed has an account with no blueprint,
     and the dashboard pushes exactly those users into /setup. If they
     complete it with a non-epilepsy condition before importing, their
     seizures still import — but under a blueprint that has no matching
     episode types. Log in, then go straight to this link.

  3. The link is a bearer credential for their full health export. Prefer a
     channel they already control, and remind them it expires.
NOTES
