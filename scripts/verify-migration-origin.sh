#!/usr/bin/env bash
#
# verify-migration-origin.sh — INC-001 preflight.
#
# The migration link epilepc mints points at $EPILEPC_ORIGIN. If that host
# redirects instead of serving, every migration dies in the browser before it
# reaches PHP: a 301 in a `mode: 'cors'` fetch must itself carry
# Access-Control-Allow-Origin or the browser refuses to follow it. Nothing is
# logged server-side, and the token is never consumed — which is exactly how
# INC-001 stayed invisible until a user complained.
#
# This probes with OPTIONS on purpose. CiphraMigrationController::export()
# answers OPTIONS *before* the rate limiter and before any token lookup, so
# the check is free: no rate-limit budget spent, no token touched.
#
# Run before any deploy that touches EPILEPC_ORIGIN, CIPHRA_ORIGIN, DNS, or
# the CDN, and after any of them change upstream.
#
#   scripts/verify-migration-origin.sh
#   EPILEPC_ORIGIN=epilepc.ch scripts/verify-migration-origin.sh   # fails today
#
set -uo pipefail

EPILEPC_ORIGIN="${EPILEPC_ORIGIN:-www.epilepc.ch}"
CIPHRA_ORIGIN="${CIPHRA_ORIGIN:-https://ciphra.ch}"

FAIL=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$*"; FAIL=1; }
info() { printf '  \033[36m→\033[0m %s\n' "$*"; }

printf '\033[1mMigration origin contract\033[0m\n'
info "source host : $EPILEPC_ORIGIN"
info "ciphra origin: $CIPHRA_ORIGIN"
echo

for path in /api/ciphra-export/probe /api/migration-complete/probe; do
	url="https://${EPILEPC_ORIGIN}${path}"
	printf '\033[1m%s\033[0m\n' "$path"

	# -s no progress, -o discard body, -D - dump headers, no -L: we WANT to
	# see a redirect rather than silently follow it.
	headers="$(curl -s -o /dev/null -D - --max-time 15 \
		-X OPTIONS \
		-H "Origin: ${CIPHRA_ORIGIN}" \
		-H "Access-Control-Request-Method: GET" \
		"$url" 2>/dev/null)"

	if [ -z "$headers" ]; then
		bad "no response from $url"
		echo
		continue
	fi

	status="$(printf '%s' "$headers" | awk 'NR==1{print $2}')"
	location="$(printf '%s' "$headers" | grep -i '^location:' | tr -d '\r' | head -1)"
	acao="$(printf '%s' "$headers" | grep -i '^access-control-allow-origin:' | tr -d '\r' | head -1)"

	# 1. Must not redirect. A 3xx here is INC-001.
	case "$status" in
		3*)
			bad "HTTP $status — the host REDIRECTS instead of serving"
			[ -n "$location" ] && info "${location}"
			info "a cross-origin fetch aborts here; PHP is never reached"
			;;
		2*) ok "HTTP $status — served directly, no redirect" ;;
		*)  bad "HTTP $status — unexpected" ;;
	esac

	# 2. Must echo the ciphra origin back.
	if [ -z "$acao" ]; then
		bad "no Access-Control-Allow-Origin — browser will discard the response"
	elif printf '%s' "$acao" | grep -qi "$CIPHRA_ORIGIN"; then
		ok "${acao}"
	else
		bad "${acao} does not match ${CIPHRA_ORIGIN}"
	fi
	echo
done

# 3. The apex is a common mis-set value — say so explicitly if it redirects.
apex="${EPILEPC_ORIGIN#www.}"
if [ "$apex" != "$EPILEPC_ORIGIN" ]; then
	printf '\033[1mapex cross-check (%s)\033[0m\n' "$apex"
	apex_status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://${apex}/api/ciphra-export/probe" 2>/dev/null)"
	case "$apex_status" in
		3*) info "apex returns $apex_status — EPILEPC_ORIGIN must NOT be set to '$apex'" ;;
		*)  info "apex returns $apex_status" ;;
	esac
	echo
fi

if [ "$FAIL" -eq 0 ]; then
	printf '\033[32m\033[1mPASS\033[0m — migration links minted against %s will work.\n' "$EPILEPC_ORIGIN"
	exit 0
fi
printf '\033[31m\033[1mFAIL\033[0m — migration links minted against %s will die in the browser.\n' "$EPILEPC_ORIGIN"
exit 1
