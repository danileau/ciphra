#!/usr/bin/env bash
# test-release-state — prove scripts/release-state.sh says the right thing.
#
# Throwaway repos per case, like test-changelog.sh and test-version-next.sh, so
# nothing depends on ciphra's own history. The two states it has to recognise
# are the two that actually happened:
#
#   - 2026-09-20: main deployed with three changelog fragments still pending,
#     so the running app reported 1.5.0 while carrying three fixes past it.
#   - 2026-09-16: v1.4.0 merged and was never tagged; every compare link in
#     the changelog users read at /docs stayed dead for three days.
#
#   scripts/test-release-state.sh
#
# Wired into CI as part of the version-guard job.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0
FAIL=0
ok()  { echo "✅ $1"; PASS=$((PASS+1)); }
bad() { echo "❌ $1"; FAIL=$((FAIL+1)); }

# A repo with a VERSION, a changelog.d/, and an "origin" it can ls-remote.
# Prints the working clone's path.
fixture() {
	local dir origin
	dir="$(mktemp -d)"
	origin="$dir/origin.git"
	(
		mkdir -p "$dir/work"
		cd "$dir/work"
		git init -q -b main .
		git config user.email t@example.com
		git config user.name t
		git config commit.gpgsign false
		mkdir -p changelog.d
		printf '# fragments\n' > changelog.d/README.md
		printf '1.5.0\n' > VERSION
		echo code > app.txt
		git add -A && git commit -qm "baseline"
		git init -q --bare "$origin"
		git remote add origin "$origin"
		git push -q origin main
	) >/dev/null 2>&1
	printf '%s' "$dir/work"
}

run() { # run <dir> <ref> — sets `out` and `RC`
	RC=0
	out="$( cd "$1" && bash "$REPO/scripts/release-state.sh" "$2" origin 2>&1 )" || RC=$?
}

# ── 1. everything released and tagged: silent ───────────────────────────────
d="$(fixture)"
( cd "$d" && git tag -a v1.5.0 -m v1.5.0 && git push -q origin v1.5.0 ) >/dev/null 2>&1
run "$d" main
if [ "$RC" -eq 0 ] && [ -z "$out" ]; then
	ok "a released, tagged commit says nothing (rc=0)"
else
	bad "clean release warned anyway (rc=$RC): $out"
fi
rm -rf "$(dirname "$d")"

# ── 2. pending fragments: the state main was in on 2026-09-20 ───────────────
d="$(fixture)"
( cd "$d" && git tag -a v1.5.0 -m v1.5.0 && git push -q origin v1.5.0 \
  && printf '### Fixed\n- A thing.\n' > changelog.d/fix-a-thing.md \
  && git add -A && git commit -qm "fix: a thing" && git push -q origin main ) >/dev/null 2>&1
run "$d" main
if [ "$RC" -eq 1 ] && printf '%s' "$out" | grep -q "fix-a-thing.md" \
   && printf '%s' "$out" | grep -q "in no release yet"; then
	ok "pending fragment is named, and the exit code says so"
else
	bad "pending fragment not reported (rc=$RC): $out"
fi
rm -rf "$(dirname "$d")"

# ── 3. VERSION with no tag: the v1.4.0 miss ─────────────────────────────────
d="$(fixture)"
run "$d" main
if [ "$RC" -eq 1 ] && printf '%s' "$out" | grep -q "v1.5.0 has no tag"; then
	ok "an unminted version is caught"
else
	bad "unminted version not caught (rc=$RC): $out"
fi
rm -rf "$(dirname "$d")"

# ── 4. both at once ─────────────────────────────────────────────────────────
d="$(fixture)"
( cd "$d" && printf '### Fixed\n- Another.\n' > changelog.d/fix-another.md \
  && git add -A && git commit -qm "fix: another" && git push -q origin main ) >/dev/null 2>&1
run "$d" main
if printf '%s' "$out" | grep -q "in no release yet" && printf '%s' "$out" | grep -q "has no tag"; then
	ok "both warnings appear together"
else
	bad "expected both warnings: $out"
fi
rm -rf "$(dirname "$d")"

# ── 5. the README in changelog.d/ is not a pending change ───────────────────
d="$(fixture)"
( cd "$d" && git tag -a v1.5.0 -m v1.5.0 && git push -q origin v1.5.0 ) >/dev/null 2>&1
run "$d" main
if ! printf '%s' "$out" | grep -q "README"; then
	ok "changelog.d/README.md is not counted as a pending entry"
else
	bad "README counted as a fragment: $out"
fi
rm -rf "$(dirname "$d")"

# ── 6. a ref that is not a commit ───────────────────────────────────────────
d="$(fixture)"
run "$d" not-a-ref
if [ "$RC" -eq 2 ] && printf '%s' "$out" | grep -q "not a commit"; then
	ok "an unknown ref exits 2 and says why"
else
	bad "unknown ref handled wrongly (rc=$RC): $out"
fi
rm -rf "$(dirname "$d")"

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
