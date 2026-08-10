#!/usr/bin/env bash
#
# ciphra deploy wizard — the single entry point for deploying ciphra.
#
# It answers the two questions the raw `git tag deploy-<sha>` flow doesn't,
# then does the deploy itself (tag → push → health poll):
#   1. WHICH image?  → lists the deployable commits on origin/main, annotated
#      with their release-images signing status, whether they're already
#      deployed, and which one is currently live. You pick from a menu instead
#      of hunting for a 7-char SHA (the `fatal: Failed to resolve` trap).
#   2. AM I ALLOWED?  → reads your GitHub permission on the repo. The deploy
#      gate is repo *write* access (the trigger is `git push` of a tag —
#      "repo write = operator", per ciphra-autodeploy). Read-only collaborators
#      get a view-only wizard with the deploy actions disabled and explained.
#
# Safety (mirrors the old scripts/deploy.sh, now folded in): only commits that
# are on origin/main AND have a green+signed release-images build are offered;
# the tag is ANNOTATED (so rollback to an older commit still sorts newest — the
# VPS selects by `--sort=-creatordate`); every push needs an explicit y/N.
#
# The VPS side (ciphra-deploy.timer → golive/deploy/ciphra-autodeploy, ~3 min)
# pulls the three images for the tagged SHA → cosign-verifies → bumps .env →
# restarts → health-checks (auto-rollback + ntfy on OK/BLOCKED/FAILED).
#
# Usage:
#   scripts/deploy-wizard.sh            # interactive
#   scripts/deploy-wizard.sh -n 25      # widen the candidate window to 25 commits
#
# Nothing is pushed without an explicit menu choice + a y/N confirm.

set -euo pipefail

# ----- config ---------------------------------------------------------------
REMOTE="${CIPHRA_REMOTE:-origin}"
HEALTH_URL="${CIPHRA_HEALTH_URL:-https://ciphra.ch/health}"
SW_URL="${CIPHRA_SW_URL:-https://ciphra.ch/sw.js}"
WINDOW=15                                   # how many recent main commits to show

# ----- pretty ---------------------------------------------------------------
if [ -t 1 ]; then
  B=$'\e[1m'; DIM=$'\e[2m'; R=$'\e[0m'
  RED=$'\e[31m'; GRN=$'\e[32m'; YLW=$'\e[33m'; BLU=$'\e[34m'; CYN=$'\e[36m'
else
  B=""; DIM=""; R=""; RED=""; GRN=""; YLW=""; BLU=""; CYN=""
fi
die() { echo "${RED}✗ $*${R}" >&2; exit 1; }
hr()  { printf '%s\n' "${DIM}────────────────────────────────────────────────────────────${R}"; }

# do_deploy <sha> — the actual production trigger. Assumes the caller already
# established that <sha> is on origin/main, has signed images, and (for a fresh
# deploy) isn't tagged yet / (for rollback) has had its old tag removed.
#   - ANNOTATED tag: the VPS selects the live deploy via --sort=-creatordate.
#     A lightweight tag's creatordate is the *commit's* date, so a rollback to
#     an older commit would sort below the current one and never get picked.
#     An annotated tag carries its own tagger date → newest-pushed always wins.
#   - Then polls prod health (two clean 200s) — the deploy auto-rolls-back on a
#     failed health check, so a sustained 200 means the new SHA took.
do_deploy() {
  local sha="$1" tag="deploy-$1"
  echo "${DIM}→ pushing ${tag} (annotated)…${R}"
  git tag -m "deploy $sha" "$tag" "$sha"
  git push "$REMOTE" "$tag"
  echo "  ${GRN}✓${R} pushed. VPS deploys within ~3 min (watch: journalctl -u ciphra-deploy -f; ntfy reports OK/FAILED)."

  echo "${DIM}→ waiting for rollout (polling ${HEALTH_URL}, up to 7 min)…${R}"
  local deadline=$(( $(date +%s) + 420 )) ok=0 code
  while [ "$(date +%s)" -lt "$deadline" ]; do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" || true)"
    if [ "$code" = "200" ]; then ok=$((ok+1)); [ "$ok" -ge 2 ] && break; else ok=0; fi
    sleep 15
  done
  if [ "$ok" -ge 2 ]; then
    local cc
    cc="$(curl -s -D - -o /dev/null --max-time 5 "$SW_URL?x=$$" | tr -d '\r' | grep -i '^cache-control:' || true)"
    echo "  ${GRN}✓${R} ${HEALTH_URL} → 200 (stable)"
    echo "  ${DIM}sw.js ${cc:-(no cache-control header — expected: no-cache)}${R}"
    echo "${GRN}✓ deploy ${sha} is live and healthy.${R}"
  else
    echo "${YLW}⚠ health not stable within 7 min — check 'journalctl -u ciphra-deploy -f' on the VPS.${R}" >&2
    echo "  ${DIM}(the deploy auto-rolls-back on a failed health check; ntfy will say FAILED.)${R}" >&2
    exit 1
  fi
}

# ----- args -----------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    -n) WINDOW="${2:?-n needs a number}"; shift 2 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) die "unknown arg: $1" ;;
  esac
done

# ----- preflight ------------------------------------------------------------
command -v gh   >/dev/null || die "gh CLI required (https://cli.github.com)"
command -v git  >/dev/null || die "git required"
command -v curl >/dev/null || die "curl required"
git rev-parse --git-dir >/dev/null 2>&1 || die "not a git repo"
gh auth status >/dev/null 2>&1 || die "not logged in to gh — run: gh auth login"

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)" \
  || die "could not resolve repo via gh (is a GitHub remote configured?)"
ACTOR="$(gh api user -q .login 2>/dev/null || echo '?')"

echo "${B}ciphra deploy wizard${R}  ${DIM}· repo ${REPO} · you: ${ACTOR}${R}"
hr

# ----- 1) permission gate ---------------------------------------------------
# The one bit that matters is push access — the deploy trigger IS a tag push.
PERMS="$(gh api "repos/$REPO" -q \
  '[.permissions.admin, .permissions.maintain, .permissions.push, .permissions.triage, .permissions.pull] | @tsv' \
  2>/dev/null || echo $'false\tfalse\tfalse\tfalse\tfalse')"
IFS=$'\t' read -r P_ADMIN P_MAINTAIN P_PUSH P_TRIAGE P_PULL <<<"$PERMS"

ROLE="read-only"; CAN_DEPLOY=0
if   [ "$P_ADMIN"    = "true" ]; then ROLE="admin";    CAN_DEPLOY=1
elif [ "$P_MAINTAIN" = "true" ]; then ROLE="maintain"; CAN_DEPLOY=1
elif [ "$P_PUSH"     = "true" ]; then ROLE="write";    CAN_DEPLOY=1
elif [ "$P_TRIAGE"   = "true" ]; then ROLE="triage"
elif [ "$P_PULL"     = "true" ]; then ROLE="read"
fi

if [ "$CAN_DEPLOY" -eq 1 ]; then
  echo "${GRN}● permission: ${ROLE}${R} — you can push deploy tags (operator)."
else
  echo "${YLW}● permission: ${ROLE}${R} — ${B}view-only${R}: no repo write, so deploy actions are disabled."
  echo "  ${DIM}To deploy, ask an operator with write access, or get push access to ${REPO}.${R}"
fi
hr

# ----- 2) fetch fresh main + tags ------------------------------------------
echo "${DIM}→ fetching ${REMOTE}…${R}"
git fetch -q "$REMOTE" main 'refs/tags/*:refs/tags/*' 2>/dev/null \
  || git fetch -q "$REMOTE" main || die "git fetch failed"

# Currently-targeted deploy = newest deploy-* tag by creatordate (what the VPS
# timer picks). This is what SHOULD be live right now.
LIVE_TAG="$(git tag --sort=-creatordate -l 'deploy-*' | head -1 || true)"
LIVE_SHA="${LIVE_TAG#deploy-}"

# Live health probe (best-effort; view-only users still get this).
HEALTH="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" 2>/dev/null || echo '000')"
if [ "$HEALTH" = "200" ]; then HSTR="${GRN}healthy (200)${R}"; else HSTR="${RED}not 200 (${HEALTH})${R}"; fi
if [ -n "$LIVE_SHA" ]; then
  echo "${B}Currently deployed:${R} ${CYN}${LIVE_SHA}${R}  ${DIM}$(git log -1 --format='%s' "$LIVE_SHA" 2>/dev/null || echo '(commit not local)')${R}"
else
  echo "${B}Currently deployed:${R} ${DIM}(no deploy-* tag found)${R}"
fi
echo "${B}Live health:${R} ${HSTR}  ${DIM}${HEALTH_URL}${R}"
hr

# ----- 3) gather deployable candidates -------------------------------------
# Batch-fetch release-images run status once, map sha→status.
echo "${DIM}→ reading release-images signing status…${R}"
declare -A RUN_ST
while IFS=$'\t' read -r sha st cc; do
  [ -n "$sha" ] && RUN_ST["${sha:0:7}"]="$st/$cc"
done < <(gh run list --workflow=release-images.yml -L 60 \
           --json headSha,status,conclusion \
           -q '.[] | [.headSha, .status, .conclusion] | @tsv' 2>/dev/null || true)

# Existing deploy tags (so we can flag already-deployed commits).
declare -A DEPLOYED
while read -r t; do [ -n "$t" ] && DEPLOYED["${t#deploy-}"]=1; done \
  < <(git tag -l 'deploy-*' | sed 's/^deploy-//')

# Walk the last WINDOW commits on origin/main.
mapfile -t COMMITS < <(git log --format='%H' -n "$WINDOW" "$REMOTE/main")

echo "${B}Deployable commits on ${REMOTE}/main${R} ${DIM}(newest first):${R}"
echo
printf "   ${DIM} %-3s %-9s %-11s %-10s %s${R}\n" "#" "sha" "images" "state" "subject"

declare -a IDX_SHA IDX_OK
i=0; DEFAULT=""; past_live=0   # past_live=1 once we've walked past the live row
for full in "${COMMITS[@]}"; do
  sha="${full:0:7}"
  subj="$(git log -1 --format='%s' "$full")"
  status="${RUN_ST[$sha]:-}"

  # Pad the plain label to a fixed width FIRST, then wrap in colour, so the
  # non-printing ANSI codes never throw printf's column count off.
  case "$status" in
    completed/success) img="$GRN$(printf '%-11s' 'signed')$R";   ok=1 ;;
    completed/*)       img="$RED$(printf '%-11s' 'BUILD-FAIL')$R"; ok=0 ;;
    "")                img="$DIM$(printf '%-11s' 'none')$R";      ok=0 ;;
    *)                 img="$YLW$(printf '%-11s' 'building')$R";  ok=0 ;;
  esac

  if [ -n "${DEPLOYED[$sha]:-}" ]; then
    if [ "$sha" = "$LIVE_SHA" ]; then state="$CYN$(printf '%-10s' 'LIVE')$R"; else state="$DIM$(printf '%-10s' 'deployed')$R"; fi
  else
    state="$(printf '%-10s' '-')"
  fi

  i=$((i+1))
  IDX_SHA[$i]="$sha"; IDX_OK[$i]="$ok"
  # Recommend the newest signed + undeployed commit that is NEWER than what's
  # live (i.e. above the live row in this newest-first list). Never point the
  # default backwards to an old commit that just happened to never ship — that
  # would suggest a regression. Rolling back to older commits stays a manual
  # choice via `r`.
  if [ -z "$DEFAULT" ] && [ "$past_live" -eq 0 ] && [ "$ok" -eq 1 ] && [ -z "${DEPLOYED[$sha]:-}" ]; then
    DEFAULT="$i"; mark="${B}${GRN}»${R}"
  else
    mark=" "
  fi
  printf " %b %-3s ${CYN}%-9s${R} %b %b %s\n" "$mark" "$i" "$sha" "$img" "$state" "${subj:0:48}"
  [ "$sha" = "$LIVE_SHA" ] && past_live=1
done
echo
if [ -n "$DEFAULT" ]; then
  echo "${DIM}» = recommended (newest signed commit not yet deployed)${R}"
else
  echo "${GRN}✓ up to date — the live commit is the newest signed build. Nothing new to deploy.${R}"
  echo "${DIM}  (You can still redeploy or roll back with 'r'.)${R}"
fi
hr

# View-only users stop here.
if [ "$CAN_DEPLOY" -ne 1 ]; then
  echo "${YLW}View-only — nothing to select.${R} Above is the current deploy state and what's deployable."
  exit 0
fi

# ----- 4) selection menu ----------------------------------------------------
echo "${B}Choose an action:${R}"
echo "   ${B}<number>${R}  deploy that commit"
[ -n "$DEFAULT" ] && echo "   ${B}<enter>${R}   deploy the recommended commit (${CYN}${IDX_SHA[$DEFAULT]}${R})"
echo "   ${B}r${R}         rollback / redeploy an already-deployed commit"
echo "   ${B}q${R}         quit"
printf "> "
read -r choice

case "$choice" in
  q|Q|"") [ "$choice" = "" ] && [ -n "$DEFAULT" ] && choice="$DEFAULT" || { echo "aborted."; exit 0; } ;;
esac

# ----- rollback / redeploy branch ------------------------------------------
if [ "$choice" = "r" ] || [ "$choice" = "R" ]; then
  echo
  echo "${B}Previously-deployed commits (rollback / force-redeploy):${R}"
  mapfile -t RB < <(git tag --sort=-creatordate -l 'deploy-*' | sed 's/^deploy-//' | head -20)
  j=0
  for sha in "${RB[@]}"; do
    j=$((j+1))
    subj="$(git log -1 --format='%s' "$sha" 2>/dev/null || echo '(not local)')"
    tag="$([ "$sha" = "$LIVE_SHA" ] && echo "${CYN}● LIVE${R}" || echo "")"
    printf "   %-3s ${CYN}%-9s${R} %-18b %s\n" "$j" "$sha" "$tag" "${subj:0:50}"
  done
  printf "> pick # to make live (or q): "
  read -r rbc
  case "$rbc" in q|Q|"") echo "aborted."; exit 0 ;; esac
  [[ "$rbc" =~ ^[0-9]+$ ]] && [ "$rbc" -ge 1 ] && [ "$rbc" -le "${#RB[@]}" ] || die "invalid selection"
  TARGET="${RB[$((rbc-1))]}"
  echo
  echo "${YLW}Rollback/redeploy re-points the deploy tag so the VPS re-pulls ${TARGET}.${R}"
  echo "${DIM}The tag deploy-${TARGET} exists, so it must be recreated with a fresh timestamp"
  echo "(the VPS picks the newest deploy tag by creatordate).${R}"
  printf "Recreate & push deploy-%s? [y/N] " "$TARGET"
  read -r ans; case "$ans" in y|Y|yes|YES) ;; *) echo "aborted."; exit 0 ;; esac
  # Delete the old tag (local+remote) so do_deploy re-tags with a fresh date.
  git push "$REMOTE" ":refs/tags/deploy-$TARGET" >/dev/null 2>&1 || true
  git tag -d "deploy-$TARGET" >/dev/null 2>&1 || true
  do_deploy "$TARGET"
  exit 0
fi

# ----- deploy branch --------------------------------------------------------
[[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "$i" ] || die "invalid selection: $choice"
SEL_SHA="${IDX_SHA[$choice]}"
if [ "${IDX_OK[$choice]}" -ne 1 ]; then
  echo "${RED}✗ ${SEL_SHA} has no signed images — release-images isn't green for it.${R}"
  echo "  ${DIM}The VPS would refuse it (cosign verify fails). Wait for CI or pick a signed commit.${R}"
  exit 1
fi
if [ -n "${DEPLOYED[$SEL_SHA]:-}" ]; then
  echo "${YLW}${SEL_SHA} is already deployed.${R} Use ${B}r${R} (rollback/redeploy) to re-point the tag."
  exit 1
fi

echo
echo "${B}Deploy ${CYN}${SEL_SHA}${R}${B} to PRODUCTION${R} ${DIM}($(git log -1 --format='%s' "$SEL_SHA"))${R}"
printf "This pushes deploy-%s and triggers a live rollout. Proceed? [y/N] " "$SEL_SHA"
read -r ans; case "$ans" in y|Y|yes|YES) ;; *) echo "aborted."; exit 0 ;; esac
do_deploy "$SEL_SHA"
