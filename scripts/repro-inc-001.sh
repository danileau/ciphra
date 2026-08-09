#!/usr/bin/env bash
#
# repro-inc-001.sh — one-command reconstruction of INC-001.
#
# INC-001: epilepc → ciphra migration failed for a real migrant on
# 2026-08-07. He registered on ciphra through the migration link, hit an
# error, no data arrived, and the link then looked dead.
#
# This script stands up BOTH real stacks, seeds a complete migration's worth
# of source data, and runs the reconstruction end to end:
#
#   RED   source = apex emulator (301, no CORS headers — production's edge)
#         → fetch dies in the browser, epilepc's export() never executes,
#           migration_token.used_at and ip_first_seen stay NULL.
#           That is the exact row shape found in production.
#
#   GREEN source = the host that actually serves
#         → the same token completes a full migration, used_at is stamped.
#
# The only variable between the two runs is the source host, which is what
# makes the redirect the proven cause rather than the leading suspect.
#
# Usage:
#   scripts/repro-inc-001.sh              # up, seed, run both cases
#   scripts/repro-inc-001.sh --seed-only  # just prepare the stacks
#   scripts/repro-inc-001.sh --down       # tear both stacks down
#
set -euo pipefail

CIPHRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EPILEPC_DIR="${EPILEPC_DIR:-$(cd "$CIPHRA_DIR/../epilepc" && pwd)}"
EPILEPC_COMPOSE="$EPILEPC_DIR/docker-compose.yml"

# Deliberately light so the GREEN control stays fast. epilepc decrypts two
# defuse-encrypted fields per record on export and each one runs its own key
# derivation, so export cost is linear and steep: measured 2026-08-09 at
# ~142 ms/record — 1365 records took 193 s. Raise SEED_SEIZURES to reproduce
# the heavy-account export budget problem (see INC-001 finding 2):
#   SEED_SEIZURES=900 SEED_DIARY=360 scripts/repro-inc-001.sh
SEED_SEIZURES="${SEED_SEIZURES:-40}"
SEED_EVENTS="${SEED_EVENTS:-5}"
SEED_MEDS="${SEED_MEDS:-3}"
SEED_DIARY="${SEED_DIARY:-20}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '  \033[36m→\033[0m %s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
die()  { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

wait_for_http() {
	local url="$1" name="$2" tries="${3:-60}"
	info "waiting for $name ($url)"
	for _ in $(seq 1 "$tries"); do
		if curl -sf -o /dev/null --max-time 3 "$url"; then ok "$name up"; return 0; fi
		sleep 2
	done
	die "$name never came up: $url"
}

preflight() {
	bold "Preflight"
	command -v docker >/dev/null || die "docker not found"
	docker compose version >/dev/null 2>&1 || die "docker compose v2 not found"
	[ -f "$EPILEPC_COMPOSE" ] || die "epilepc compose not found at $EPILEPC_COMPOSE"
	[ -f "$CIPHRA_DIR/.env" ] || die "ciphra .env missing (POSTGRES_*/SECRET_KEY required)"
	ok "docker + both compose files present"
}

teardown() {
	bold "Tearing down"
	docker compose -f "$EPILEPC_COMPOSE" down -v 2>/dev/null || true
	docker compose -f "$CIPHRA_DIR/docker-compose.yml" down 2>/dev/null || true
	ok "both stacks down"
}

up_stacks() {
	bold "Bringing up ciphra"
	# --renew-anon-volumes: a stale anonymous node_modules volume silently
	# breaks the frontend container (see PR #78).
	( cd "$CIPHRA_DIR" && docker compose up -d --renew-anon-volumes postgres api frontend )
	wait_for_http "http://localhost:5050/health" "ciphra api"
	wait_for_http "http://localhost:5173/" "ciphra frontend" 90

	bold "Bringing up epilepc"
	( cd "$EPILEPC_DIR" && docker compose up -d --build )
	wait_for_http "http://localhost:8081/de/login" "epilepc app" 90
}

seed_source_data() {
	bold "Seeding a complete migration's worth of source data"
	# --reset so repeated runs don't accumulate content on demo1 (they do
	# otherwise: the command tops up an existing user). A deterministic source
	# dataset is what makes the export-duration budget below meaningful.
	docker compose -f "$EPILEPC_COMPOSE" exec -T app \
		bin/console app:seed-demo \
			--reset \
			--users=1 \
			--seizures="$SEED_SEIZURES" \
			--events="$SEED_EVENTS" \
			--meds="$SEED_MEDS" \
			--diary="$SEED_DIARY"
	ok "demo1@epilepc.test seeded"
	show_source_counts
}

sql() {
	docker compose -f "$EPILEPC_COMPOSE" exec -T db \
		mysql -uepilepc -pepilepc epilepc -N -B -e "$1" 2>/dev/null
}

show_source_counts() {
	info "source records for demo1@epilepc.test:"
	# `event` and `user` are reserved words in MariaDB — always backtick.
	sql "SELECT CONCAT('    seizures=', (SELECT COUNT(*) FROM \`seizure\` s JOIN \`user\` u ON u.id=s.user_id WHERE u.email='demo1@epilepc.test'),
	                  ' events=',   (SELECT COUNT(*) FROM \`event\` e JOIN \`user\` u ON u.id=e.user_id WHERE u.email='demo1@epilepc.test'),
	                  ' meds=',     (SELECT COUNT(*) FROM \`medication\` m JOIN \`user\` u ON u.id=m.user_id WHERE u.email='demo1@epilepc.test'),
	                  ' diary=',    (SELECT COUNT(*) FROM \`diaryentry\` d JOIN \`user\` u ON u.id=d.user_id WHERE u.email='demo1@epilepc.test'))"
}

show_token_table() {
	bold "migration_token after the run — compare against production"
	printf '  %-22s %-22s %-16s\n' "used_at" "migration_completed_at" "ip_first_seen"
	sql "SELECT IFNULL(used_at,'NULL'), IFNULL(migration_completed_at,'NULL'), IFNULL(ip_first_seen,'NULL')
	     FROM migration_token ORDER BY created_at" |
		while IFS=$'\t' read -r u c i; do printf '  %-22s %-22s %-16s\n' "$u" "$c" "$i"; done
}

run_repro() {
	bold "Running the reconstruction"
	( cd "$CIPHRA_DIR/frontend" && \
		PLAYWRIGHT_RUN_MIGRATE=1 \
		PLAYWRIGHT_NO_WEBSERVER=1 \
		EPILEPC_COMPOSE="$EPILEPC_COMPOSE" \
		npx playwright test migrate-apex-redirect --project=chromium --reporter=list )
}

case "${1:-}" in
	--down) teardown; exit 0 ;;
	--seed-only) preflight; up_stacks; seed_source_data; ok "stacks ready"; exit 0 ;;
	"") ;;
	*) die "unknown option: $1" ;;
esac

preflight
up_stacks
seed_source_data
set +e
run_repro
RC=$?
set -e
show_token_table
[ $RC -eq 0 ] && bold "INC-001 reconstructed." || bold "Reconstruction run failed (rc=$RC)."
exit $RC
