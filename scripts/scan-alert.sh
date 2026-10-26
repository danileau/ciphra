#!/usr/bin/env bash
# scan-alert — turn the daily Trivy results into one ntfy push that says WHAT.
#
# security-scan.yml used to fail and leave it at that: GitHub emails the owner,
# and the weekly digest said "CVE scan failure" with no detail. It stayed red
# for ~24 days (2026-09-30 → 10-24). This runs after the scan jobs and:
#
#   - carries the cause: package, installed → fixed version, CVE, per target,
#     plus any misconfig/secret finding (secret RULE ids only — never the
#     matched text). A scan that produced no results file is reported as
#     "did not complete", never guessed at.
#   - throttles on the condition: high priority when the scan turns red,
#     default priority on every further red day (the daily cadence is the
#     throttle), one recovery ping when it turns green, silence while green.
#
# Usage: scan-alert.sh <results-dir> <name>...
#   Each <name> expects <results-dir>/trivy-<name>.json (trivy --format json).
# Env:  PREV_CONCLUSION  conclusion of the previous completed scan run
#       RUN_URL          link to this run
#       LIVE_SHA         image tag that was scanned (informational)
#       NTFY_TOPIC_URL   unset → print only (PR/branch runs, local tests)
# Exit: 0 when the report was produced; 1 when ntfy rejected it (the job then
#       goes red with curl's own error, rather than failing silently).
set -uo pipefail

DIR="${1:?usage: scan-alert.sh <results-dir> <name>...}"; shift
[ "$#" -gt 0 ] || { echo "scan-alert: no scan names given" >&2; exit 2; }
PREV="${PREV_CONCLUSION:-}"
MAX_LINES=8   # per target, so one noisy image can't push the others out

findings=0
missing=()
report=""

for name in "$@"; do
  f="$DIR/trivy-$name.json"
  if [ ! -s "$f" ]; then
    missing+=("$name")
    continue
  fi
  if ! lines="$(jq -r '
      [ .Results[]? |
        ( .Vulnerabilities[]? |
          "\(.PkgName) \(.InstalledVersion) → \(.FixedVersion // "?")  \(.VulnerabilityID) \(.Severity)" ),
        ( .Misconfigurations[]? | select(.Status == "FAIL") |
          "misconfig \(.ID) \(.Severity): \(.Title)" ),
        ( .Secrets[]? as $s | "secret \($s.RuleID) \($s.Severity) in \(.Target)" )
      ] | unique | .[]' "$f" 2>&1)"; then
    missing+=("$name (unreadable results: ${lines:0:120})")
    continue
  fi
  [ -n "$lines" ] || continue
  n="$(printf '%s\n' "$lines" | wc -l | tr -d ' ')"
  findings=$((findings + n))
  report+=$'\n'"${name} (${n}):"$'\n'
  report+="$(printf '%s\n' "$lines" | head -n "$MAX_LINES" | sed 's/^/  /')"$'\n'
  [ "$n" -gt "$MAX_LINES" ] && report+="  … +$((n - MAX_LINES)) more"$'\n'
done

for m in "${missing[@]}"; do
  report+=$'\n'"${m}: scan did not complete — no results; see the run log"$'\n'
done

red=0; { [ "$findings" -gt 0 ] || [ "${#missing[@]}" -gt 0 ]; } && red=1

if [ "$red" -eq 1 ]; then
  title="ciphra CVE scan: red"
  head="🔴 ${findings} fixable HIGH/CRITICAL finding(s)"
  [ "${#missing[@]}" -gt 0 ] && head+=", ${#missing[@]} scan(s) incomplete"
  [ -n "${LIVE_SHA:-}" ] && head+=" — live images @ ${LIVE_SHA}"
  if [ "$PREV" = "failure" ]; then
    prio="default"; head+=" (still red)"
  else
    prio="high"; head+=" (newly red)"
  fi
  body="${head}"$'\n'"${report}"
elif [ "$PREV" = "failure" ]; then
  title="ciphra CVE scan: recovered"; prio="default"
  body="🟢 CVE scan is green again — no fixable HIGH/CRITICAL findings."
else
  echo "scan-alert: green, previous run '${PREV:-none}' — nothing to send."
  exit 0
fi

[ -n "${RUN_URL:-}" ] && body+=$'\n'"${RUN_URL}"
body="${body:0:3800}"   # ntfy caps a message at 4096 bytes

echo "$body"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  { echo '```'; echo "$body"; echo '```'; } >> "$GITHUB_STEP_SUMMARY"
fi

[ -n "${NTFY_TOPIC_URL:-}" ] || { echo "scan-alert: NTFY_TOPIC_URL unset — printed only."; exit 0; }

# Two attempts: one failed POST across a network is not a verdict.
for attempt in 1 2; do
  if err="$(curl -sS --fail-with-body --max-time 15 -o /dev/null \
        -H "Title: ${title}" -H "Priority: ${prio}" -H "Tags: shield" \
        -d "$body" "$NTFY_TOPIC_URL" 2>&1)"; then
    echo "→ ntfy sent (${prio})"; exit 0
  fi
  [ "$attempt" -eq 1 ] && sleep 5
done
echo "::error::ntfy rejected the scan alert: ${err:0:300}" >&2
exit 1
