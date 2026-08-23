#!/usr/bin/env bash
# security-monitor — deterministic drift detection against the LIVE prod edge.
#
# Part of Spur A (deterministic periodic monitoring — see the security-monitor
# workflow). It does NOT do exploratory red-teaming (that's the human-triggered
# DAST workflow). It asserts a small set of security invariants that must always
# hold on https://ciphra.ch, and alerts when one drifts:
#
#   1. Edge security headers (CSP shape, HSTS+preload, XFO, nosniff,
#      Referrer-Policy, Permissions-Policy) — a regression here silently weakens
#      XSS/clickjacking/downgrade protection.
#   2. No framework/version/debug leakage.
#   3. TLS mode is Full (strict) — via the Cloudflare API when CF_API_TOKEN +
#      CF_ZONE_ID are set. A drop to Flexible decrypts all login traffic at CF
#      (THREAT_MODEL §7 P1). Skipped-with-notice when the secrets are absent, so
#      the check never fails red just because it isn't provisioned yet.
#
# Tolerant of what legitimately changes (the per-build CSP script hashes),
# strict on the security-relevant properties.
#
# Usage:  scripts/security-monitor.sh [URL]        # default https://ciphra.ch
# Exit 0 = all invariants hold. Exit 1 = drift (details on stderr). If
# NTFY_TOPIC_URL is set and there is drift, a push is sent too.
set -uo pipefail

URL="${1:-https://ciphra.ch}"
FINDINGS=()
fail() { FINDINGS+=("$1"); }

# ── Fetch headers once ───────────────────────────────────────────────────────
# Fetch as a browser. A plain datacenter curl (e.g. a GitHub runner) gets
# challenged by Cloudflare Bot Fight, and the CHALLENGE PAGE carries its own
# CSP/headers — which must never be mistaken for ciphra's (that produced a
# 6-finding false alarm on the first scheduled run, 2026-08-23). The reliable
# way through is MONITOR_TOKEN paired with a CF WAF skip rule; the browser UA is
# best-effort for the common case.
UA="Mozilla/5.0 (compatible; ciphra-security-monitor; +https://github.com/danileau/ciphra)"
CURL=(-sS -D - -o /dev/null --max-time 20 -A "$UA")
[ -n "${MONITOR_TOKEN:-}" ] && CURL+=(-H "x-ciphra-monitor: ${MONITOR_TOKEN}")
HDR="$(curl "${CURL[@]}" "$URL" 2>/dev/null)" || { echo "❌ could not reach $URL" >&2; exit 1; }

# lower-case header names for matching
h() { printf '%s' "$HDR" | tr 'A-Z' 'a-z' | grep -i "^$1:" | head -1; }
status="$(printf '%s' "$HDR" | grep -iE '^HTTP/' | tail -1 | awk '{print $2}')"

# Did we actually reach ciphra's app? Its responses carry x-sveltekit-page; a
# Cloudflare block/challenge does not. Assess ONLY the app's own response.
app_reached=false
{ [ "$status" = "200" ] || [ -n "$(h x-sveltekit-page)" ]; } && app_reached=true

if ! $app_reached; then
    if [ -n "$(h cf-ray)" ]; then
        # Cloudflare answered before ciphra did (bot challenge / WAF). We are
        # looking at CF's interstitial, not ciphra — INCONCLUSIVE, not drift.
        echo "::warning::security-monitor blocked at the Cloudflare edge (HTTP ${status:-?}) — could not assess ciphra's own headers."
        {
          echo "ℹ INCONCLUSIVE: Cloudflare returned ${status:-?} (bot challenge / WAF)"
          echo "  before ciphra answered — this is NOT a ciphra security drift."
          echo "  To let the monitor through: set MONITOR_TOKEN (repo secret) and add a"
          echo "  Cloudflare WAF rule that Skips Bot Fight for requests carrying header"
          echo "  'x-ciphra-monitor: <that token>'. See docs/OPERATIONS.md."
        } >&2
        exit 0
    fi
    # No Cloudflare edge marker → a genuine app-level non-200 (outage/misconfig).
    fail "root did not return 200 (got ${status:-none}), and it was not a Cloudflare block"
fi

# ── 1. Content-Security-Policy ───────────────────────────────────────────────
csp="$(h content-security-policy)"
if [ -z "$csp" ]; then
    fail "Content-Security-Policy header is MISSING"
else
    # script-src must not have regained 'unsafe-inline' (the whole point of the
    # hash-mode migration). Check within the script-src directive only.
    script_src="$(printf '%s' "$csp" | grep -oE "script-src[^;]*")"
    printf '%s' "$script_src" | grep -q "unsafe-inline" && \
        fail "CSP script-src regained 'unsafe-inline'"
    printf '%s' "$csp" | grep -q "'unsafe-eval'" && \
        fail "CSP gained 'unsafe-eval' (only 'wasm-unsafe-eval' is expected)"
    printf '%s' "$csp" | grep -q "frame-ancestors 'none'" || \
        fail "CSP lost frame-ancestors 'none'"
    printf '%s' "$csp" | grep -q "default-src 'self'" || \
        fail "CSP lost default-src 'self'"
    printf '%s' "$csp" | grep -q "base-uri 'self'" || \
        fail "CSP lost base-uri 'self'"
    printf '%s' "$csp" | grep -q "object-src 'none'\|default-src 'self'" || \
        fail "CSP has no object-src/default-src restriction"
fi

# ── 2. HSTS with preload ─────────────────────────────────────────────────────
hsts="$(h strict-transport-security)"
if [ -z "$hsts" ]; then
    fail "Strict-Transport-Security header is MISSING"
else
    printf '%s' "$hsts" | grep -q "preload" || fail "HSTS lost 'preload'"
    printf '%s' "$hsts" | grep -qE "max-age=(3153[0-9]{4}|[3-9][0-9]{7,})" || \
        fail "HSTS max-age dropped below ~1 year"
fi

# ── 3. The other edge headers ────────────────────────────────────────────────
[ -n "$(h x-frame-options)" ] || fail "X-Frame-Options header is MISSING"
printf '%s' "$(h x-content-type-options)" | grep -q "nosniff" || \
    fail "X-Content-Type-Options: nosniff is MISSING"
[ -n "$(h referrer-policy)" ] || fail "Referrer-Policy header is MISSING"
[ -n "$(h permissions-policy)" ] || fail "Permissions-Policy header is MISSING"

# ── 4. No framework / version / debug leakage ────────────────────────────────
[ -n "$(h x-powered-by)" ] && fail "X-Powered-By header is present (framework leak)"
printf '%s' "$(h server)" | grep -qE "werkzeug|gunicorn|flask|python" && \
    fail "Server header leaks the app framework/version"

# ── 5. TLS mode = Full (strict), via the Cloudflare API (optional) ───────────
if [ -n "${CF_API_TOKEN:-}" ] && [ -n "${CF_ZONE_ID:-}" ]; then
    mode="$(curl -sS --max-time 20 \
        -H "Authorization: Bearer ${CF_API_TOKEN}" \
        "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/settings/ssl" \
        2>/dev/null | grep -oE '"value":"[a-z_]+"' | head -1 | cut -d'"' -f4)"
    if [ "$mode" = "strict" ]; then
        echo "✓ Cloudflare TLS mode: strict (Full)"
    elif [ -n "$mode" ]; then
        fail "Cloudflare TLS mode is '$mode', expected 'strict' (Full) — a drop to flexible/full decrypts origin traffic at CF"
    else
        fail "Cloudflare TLS mode check failed (API error or bad token)"
    fi
else
    echo "ℹ TLS-mode check skipped — set CF_API_TOKEN + CF_ZONE_ID secrets to enable it."
fi

# ── Report ───────────────────────────────────────────────────────────────────
if [ "${#FINDINGS[@]}" -eq 0 ]; then
    echo "✅ security-monitor: all invariants hold on $URL"
    exit 0
fi

MSG="🔴 ciphra security drift on ${URL} (${#FINDINGS[@]}):"
{ echo "$MSG"; printf '  - %s\n' "${FINDINGS[@]}"; } >&2

if [ -n "${NTFY_TOPIC_URL:-}" ]; then
    body="$(printf '%s\n' "$MSG"; printf -- '- %s\n' "${FINDINGS[@]}")"
    curl -sS --max-time 15 -H "Title: ciphra security drift" -H "Priority: high" \
        -d "$body" "$NTFY_TOPIC_URL" >/dev/null 2>&1 \
        && echo "→ ntfy alert sent" >&2 || echo "→ ntfy send failed (non-fatal)" >&2
fi
exit 1
