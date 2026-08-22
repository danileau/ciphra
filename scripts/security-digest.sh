#!/usr/bin/env bash
# security-digest — one consolidated weekly security posture summary.
#
# Spur A's anti-alert-fatigue layer. The daily jobs (Trivy security-scan,
# security-monitor edge drift) alert on RED per-run; this AGGREGATES their
# latest status into a single weekly message and — crucially — sends a green
# HEARTBEAT when all is well. Silence otherwise means "all clear" AND "the
# monitor is broken" indistinguishably; a weekly digest tells them apart.
#
# It does NOT re-scan (that would duplicate Trivy). It reads the latest run
# conclusion of each security workflow via the GitHub API, counts open
# Dependabot PRs, and composes. Cheap, deterministic, one channel.
#
# Needs `gh` authenticated (GITHUB_TOKEN in Actions, gh login locally).
# Posts to ntfy when NTFY_TOPIC_URL is set. Writes the GH job summary when run
# in Actions. Exit 0 always — it is a report + heartbeat, not a gate; the daily
# jobs remain the blocking alerts.
set -uo pipefail

REPO="${GH_REPO:-danileau/ciphra}"

# conclusion → emoji. Empty/none = not run yet (⚪), not a failure.
emoji() {
  case "$1" in
    success) echo "🟢" ;;
    failure|timed_out|cancelled|startup_failure) echo "🔴" ;;
    *) echo "⚪" ;;
  esac
}

last_conclusion() {
  gh run list --repo "$REPO" --workflow "$1" --branch main --limit 1 \
    --json conclusion,createdAt -q '.[0].conclusion' 2>/dev/null || true
}
last_when() {
  gh run list --repo "$REPO" --workflow "$1" --branch main --limit 1 \
    --json createdAt -q '.[0].createdAt' 2>/dev/null | cut -dT -f1 || true
}

scan="$(last_conclusion security-scan.yml)"
mon="$(last_conclusion security-monitor.yml)"
ci="$(last_conclusion ci.yml)"
dep="$(gh pr list --repo "$REPO" --author 'app/dependabot' --state open --json number -q 'length' 2>/dev/null || echo '?')"
ver="$(tr -d '[:space:]' < VERSION 2>/dev/null || echo '?')"

dep_emoji="🟢"; [ "$dep" != "0" ] && dep_emoji="🟡"

# Overall: red if any security signal is red; amber if any is unknown or deps
# are pending; green otherwise.
overall="🟢"
case "$scan$mon" in *failure*|*timed_out*|*cancelled*) overall="🔴" ;; esac
if [ "$overall" != "🔴" ]; then
  { [ -z "$scan" ] || [ -z "$mon" ] || [ "$dep" != "0" ]; } && overall="🟡"
fi

read -r -d '' BODY <<EOF || true
${overall} ciphra security digest — v${ver}

$(emoji "$scan") CVE scan (Trivy)      ${scan:-not-run} $( [ -n "$scan" ] && echo "($(last_when security-scan.yml))" )
$(emoji "$mon") Edge drift monitor    ${mon:-not-run} $( [ -n "$mon" ] && echo "($(last_when security-monitor.yml))" )
$(emoji "$ci") CI on main            ${ci:-not-run}
${dep_emoji} Dependabot PRs open    ${dep}

Daily jobs alert on red on their own; this is the weekly consolidated view +
heartbeat. 🔴 = act now · 🟡 = check (unknown status or pending deps) · 🟢 = clear.
EOF

echo "$BODY"

# GitHub Actions job summary
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  { echo '```'; echo "$BODY"; echo '```'; } >> "$GITHUB_STEP_SUMMARY"
fi

# ntfy — one push a week. Priority default (this is a heartbeat, not an alarm);
# the daily jobs carry the high-priority red alerts.
if [ -n "${NTFY_TOPIC_URL:-}" ]; then
  prio="default"; [ "$overall" = "🔴" ] && prio="high"
  curl -sS --max-time 15 -H "Title: ciphra security digest" -H "Priority: $prio" \
    -d "$BODY" "$NTFY_TOPIC_URL" >/dev/null 2>&1 \
    && echo "→ ntfy digest sent" || echo "→ ntfy send failed (non-fatal)"
fi

exit 0
