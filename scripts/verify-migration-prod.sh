#!/usr/bin/env bash
#
# verify-migration-prod.sh — INC-001 deploy gate.
#
# Run it BEFORE the deploy and AFTER it, then diff the two reports. Passing
# after having failed before is the proof that the fix landed — and the point
# at which it is safe to tell an affected user to try again.
#
#   scripts/verify-migration-prod.sh before
#   # ... deploy ...
#   scripts/verify-migration-prod.sh after
#   diff .inc001/before.txt .inc001/after.txt
#
# Two layers, because they answer different questions:
#
#   1. HTTP contract (curl, OPTIONS only — free, touches no token)
#      Does the host serve these paths directly, with the right CORS origin?
#
#   2. Browser reality (Playwright on ciphra.ch, bogus token)
#      Can a REAL browser, under the REAL CSP, actually complete the request?
#      curl cannot answer this: it has no CSP and follows redirects a browser
#      refuses. This layer is what would have caught INC-001.
#
# Safe by construction: read-only, no account needed, and the probe token is
# invalid on purpose so no real user's link is ever spent.
#
set -uo pipefail

LABEL="${1:-run}"
CIPHRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${INC001_OUT_DIR:-$CIPHRA_DIR/.inc001}"
OUT="$OUT_DIR/${LABEL}.txt"

HOSTS="${PROD_EPILEPC_HOSTS:-epilepc.ch,www.epilepc.ch,direct.epilepc.ch}"
CIPHRA_ORIGIN="${CIPHRA_ORIGIN:-https://ciphra.ch}"

mkdir -p "$OUT_DIR"

{
	echo "INC-001 migration verification — label: $LABEL"
	echo "date:   $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
	echo "ciphra: $CIPHRA_ORIGIN"
	echo "hosts:  $HOSTS"
	echo
	echo "=============================================================="
	echo "LAYER 1 — HTTP contract (OPTIONS, no token touched)"
	echo "=============================================================="
	IFS=',' read -ra HOST_LIST <<< "$HOSTS"
	for h in "${HOST_LIST[@]}"; do
		h="$(echo "$h" | xargs)"
		echo
		echo "--- $h ---"
		EPILEPC_ORIGIN="$h" CIPHRA_ORIGIN="$CIPHRA_ORIGIN" \
			"$CIPHRA_DIR/scripts/verify-migration-origin.sh" 2>&1 |
			sed 's/\x1b\[[0-9;]*m//g'
	done

	echo
	echo "=============================================================="
	echo "LAYER 2 — real browser on $CIPHRA_ORIGIN (bogus token)"
	echo "=============================================================="
	echo "A 404 is the HEALTHY answer: the request reached PHP, which"
	echo "correctly rejected a token we made up. 'Failed to fetch' means"
	echo "the browser refused before the request ever left."
	echo
	(
		cd "$CIPHRA_DIR/frontend" &&
			PLAYWRIGHT_PROD_VERIFY=1 \
			PLAYWRIGHT_NO_WEBSERVER=1 \
			PROD_CIPHRA_ORIGIN="$CIPHRA_ORIGIN" \
			PROD_EPILEPC_HOSTS="$HOSTS" \
			npx playwright test migrate-prod-verify --project=chromium --reporter=list 2>&1
	) | sed -n '/INC-001 production probe/,/^$/p;/passed\|failed/p' |
		sed 's/\x1b\[[0-9;]*m//g'
} | tee "$OUT"

echo
echo "report written: $OUT"
if [ -f "$OUT_DIR/before.txt" ] && [ -f "$OUT_DIR/after.txt" ]; then
	echo
	echo "compare with:  diff $OUT_DIR/before.txt $OUT_DIR/after.txt"
fi
