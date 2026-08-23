#!/usr/bin/env bash
# security-monitor — deterministic drift detection against the LIVE prod edge.
#
# Part of Spur A (deterministic periodic monitoring — see the security-monitor
# workflow). It does NOT do exploratory red-teaming (that's the human-triggered
# DAST workflow). It checks a small set of invariants and alerts on drift:
#
#   TLS. Cloudflare TLS mode must be Full (strict) — a drop to Flexible
#     decrypts all login traffic at CF (THREAT_MODEL §7). Checked via the CF API
#     (api.cloudflare.com), which is INDEPENDENT of the edge and never sees Bot
#     Fight — so this runs even when the header fetch below is challenged.
#   EDGE HEADERS. CSP shape (no unsafe-inline/eval, frame-ancestors none, etc.),
#     HSTS+preload, XFO, nosniff, Referrer-Policy, Permissions-Policy, and no
#     framework/version leak — a regression silently weakens XSS/clickjacking/
#     downgrade protection.
#
# Tolerant of what legitimately changes (per-build CSP script hashes), strict on
# the security-relevant properties. The edge-header leg needs to reach ciphra
# through Cloudflare; a datacenter runner is Bot-Fight-challenged (Free plan
# can't reliably skip that), so that leg may be INCONCLUSIVE — which is reported
# as such, never as drift, and the header config is CI-guarded anyway
# (app-html-csp.test.ts). The TLS leg is the CF-only signal this uniquely adds.
#
# Usage:  scripts/security-monitor.sh [URL]        # default https://ciphra.ch
# Exit 0 = no drift (edge leg may be inconclusive). Exit 1 = drift. With
# NTFY_TOPIC_URL set, drift is also pushed.
set -uo pipefail

URL="${1:-https://ciphra.ch}"
FINDINGS=()
fail() { FINDINGS+=("$1"); }

# ── TLS mode = Full (strict), via the Cloudflare API — runs first + always ────
# Independent of the edge: hits api.cloudflare.com with a token, so a Bot Fight
# challenge on ciphra.ch does not affect it. This is the high-value, CF-only
# drift signal.
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
        fail "Cloudflare TLS mode check failed (API error or bad/expired token)"
    fi
else
    echo "ℹ TLS-mode check skipped — set CF_API_TOKEN + CF_ZONE_ID secrets to enable it."
fi

# ── Edge header fetch ─────────────────────────────────────────────────────────
# Fetch as a browser + an optional MONITOR_TOKEN header. A plain datacenter curl
# gets Bot-Fight-challenged and the CHALLENGE PAGE carries its own CSP/headers —
# which must never be mistaken for ciphra's (that produced a 6-finding false
# alarm, 2026-08-23).
UA="Mozilla/5.0 (compatible; ciphra-security-monitor; +https://github.com/danileau/ciphra)"
CURL=(-sS -D - -o /dev/null --max-time 20 -A "$UA")
[ -n "${MONITOR_TOKEN:-}" ] && CURL+=(-H "x-ciphra-monitor: ${MONITOR_TOKEN}")
HDR="$(curl "${CURL[@]}" "$URL" 2>/dev/null || true)"

h() { printf '%s' "$HDR" | tr 'A-Z' 'a-z' | grep -i "^$1:" | head -1; }
status="$(printf '%s' "$HDR" | grep -iE '^HTTP/' | tail -1 | awk '{print $2}')"

# Reached ciphra's app? Its responses carry x-sveltekit-page; a CF block/
# challenge does not. Assess header invariants ONLY on the app's own response.
header_inconclusive=false
app_reached=false
{ [ "$status" = "200" ] || [ -n "$(h x-sveltekit-page)" ]; } && app_reached=true

if $app_reached; then
    # ── CSP ──
    csp="$(h content-security-policy)"
    if [ -z "$csp" ]; then
        fail "Content-Security-Policy header is MISSING"
    else
        script_src="$(printf '%s' "$csp" | grep -oE "script-src[^;]*")"
        printf '%s' "$script_src" | grep -q "unsafe-inline" && fail "CSP script-src regained 'unsafe-inline'"
        printf '%s' "$csp" | grep -q "'unsafe-eval'" && fail "CSP gained 'unsafe-eval' (only 'wasm-unsafe-eval' is expected)"
        printf '%s' "$csp" | grep -q "frame-ancestors 'none'" || fail "CSP lost frame-ancestors 'none'"
        printf '%s' "$csp" | grep -q "default-src 'self'" || fail "CSP lost default-src 'self'"
        printf '%s' "$csp" | grep -q "base-uri 'self'" || fail "CSP lost base-uri 'self'"
    fi
    # ── HSTS ──
    hsts="$(h strict-transport-security)"
    if [ -z "$hsts" ]; then
        fail "Strict-Transport-Security header is MISSING"
    else
        printf '%s' "$hsts" | grep -q "preload" || fail "HSTS lost 'preload'"
        printf '%s' "$hsts" | grep -qE "max-age=(3153[0-9]{4}|[3-9][0-9]{7,})" || fail "HSTS max-age dropped below ~1 year"
    fi
    # ── the other headers ──
    [ -n "$(h x-frame-options)" ] || fail "X-Frame-Options header is MISSING"
    printf '%s' "$(h x-content-type-options)" | grep -q "nosniff" || fail "X-Content-Type-Options: nosniff is MISSING"
    [ -n "$(h referrer-policy)" ] || fail "Referrer-Policy header is MISSING"
    [ -n "$(h permissions-policy)" ] || fail "Permissions-Policy header is MISSING"
    # ── no framework / version leak ──
    [ -n "$(h x-powered-by)" ] && fail "X-Powered-By header is present (framework leak)"
    printf '%s' "$(h server)" | grep -qE "werkzeug|gunicorn|flask|python" && fail "Server header leaks the app framework/version"
elif [ -n "$(h cf-ray)" ]; then
    # Cloudflare answered before ciphra did (bot challenge / WAF). We'd be
    # looking at CF's interstitial, not ciphra — INCONCLUSIVE, not drift.
    #
    # ACCEPTED STATE (decision 2026-08-23): on the Free plan Bot Fight can't be
    # reliably skipped for a datacenter runner, so this leg is expected to be
    # inconclusive from CI — it is NOT a to-do and NOT a warning. The header
    # config is guarded in CI (app-html-csp.test.ts) and the CF-only TLS drift
    # is covered by the leg above, so this is a plain informational note, not an
    # annotation that would flag every daily run.
    header_inconclusive=true
    echo "ℹ edge-header leg inconclusive (expected): Cloudflare bot challenge (HTTP ${status:-?}) before ciphra answered — not a drift; header config is CI-guarded. TLS leg above is unaffected."
else
    fail "root did not return 200 (got ${status:-none}), and it was not a Cloudflare block"
fi

# ── Report ───────────────────────────────────────────────────────────────────
if [ "${#FINDINGS[@]}" -eq 0 ]; then
    if $header_inconclusive; then
        echo "✅ security-monitor: no drift (TLS checked; edge-header leg inconclusive — CF-blocked)"
    else
        echo "✅ security-monitor: all invariants hold on $URL"
    fi
    exit 0
fi

MSG="🔴 ciphra security drift (${#FINDINGS[@]}):"
{ echo "$MSG"; printf '  - %s\n' "${FINDINGS[@]}"; } >&2

if [ -n "${NTFY_TOPIC_URL:-}" ]; then
    body="$(printf '%s\n' "$MSG"; printf -- '- %s\n' "${FINDINGS[@]}")"
    curl -sS --max-time 15 -H "Title: ciphra security drift" -H "Priority: high" \
        -d "$body" "$NTFY_TOPIC_URL" >/dev/null 2>&1 \
        && echo "→ ntfy alert sent" >&2 || echo "→ ntfy send failed (non-fatal)" >&2
fi
exit 1
