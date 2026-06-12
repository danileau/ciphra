# Operations

This is the day-to-day operations runbook for ciphra in production —
the production deploy at `ciphra.ch`. For local development setup, see
[DEVELOPING.md](DEVELOPING.md). For the security model and threat
boundaries, see [SECURITY.md](../SECURITY.md). For initial VPS
provisioning, see `golive/SECTION1_RUNBOOK.md` (gitignored).

If you arrived here because something is broken, jump to
[Troubleshooting](#troubleshooting).

## Production architecture in one diagram

```
                            Cloudflare
                                │
                       (TLS terminates here,
                        WAF + DDoS + caching)
                                │
                                ▼
                ┌───────────────────────────────┐
                │ Infomaniak VPS Lite           │
                │  4 vCPU / 4 GB / 80 GB        │
                │  Ubuntu 24.04 LTS · Geneva    │
                │                               │
                │  nftables (CF-IPs only)       │
                │   │                           │
                │   ▼                           │
                │  docker-proxy :8443           │
                │   │                           │
                │   ▼                           │
                │  ciphra-nginx                 │
                │   ├─ /api/* → ciphra-api      │
                │   └─ / → ciphra-frontend      │
                │                               │
                │  ciphra-postgres ◄── api      │
                │  ciphra-redis    ◄── api      │
                └───────────────────────────────┘
                                │
                  (nightly age-encrypted dumps)
                                │
                                ▼
                Infomaniak Swiss Backup (S3)
                infomaniak-primary:ciphra-backup/
```

Two systemd units own the stack:

- **`ciphra-data.service`** wraps `golive/docker-compose.data.yml` —
  postgres + redis. Started first; data survives `ciphra-app` restarts.
- **`ciphra-app.service`** wraps `golive/docker-compose.app.yml` —
  nginx + frontend + api. `Requires=ciphra-data.service` so app can
  never start before its data dependencies.

## Where state lives

| Kind | Location | Owner |
|---|---|---|
| Postgres data | `/var/lib/ciphra/postgres/` (host bind-mount) | host root |
| Redis | in-memory only (`--save '' --appendonly no`) | container |
| App config | `/opt/ciphra/golive/.env` | ubuntu |
| nginx TLS cert | `/opt/ciphra/golive/secrets/origin.crt` + `.key` | ubuntu |
| age PUBLIC key (in env) | `BACKUP_PUBKEY` in `.env` | ubuntu |
| age PRIVATE key | **never on VPS.** Paper-stashed (2 cards, 2 locations) + on operator's laptop at `~/ciphra-secrets/ciphra-backup.key` (0600) | operator (laptop), bank safe (paper) |
| rclone config (S3 creds) | `~ubuntu/.config/rclone/rclone.conf` | ubuntu |
| Encrypted backups | `infomaniak-primary:ciphra-backup/` (S3) | Infomaniak account |
| Cron log files | `/var/log/ciphra-*.log` | mostly ubuntu, `ciphra-fw.log` root |

## Cron — what fires when

### User crontab (run as `ubuntu`)

Installed once via:
```bash
crontab /opt/ciphra/golive/backup/crontab.example
```

Verify with `crontab -l`.

| Time (UTC) | Job | Log | What it does |
|---|---|---|---|
| `*/5 * * * *` | `backup/healthcheck.sh` | `ciphra-health.log` | Probes nginx `/health` with a CF-Connecting-IP header, pings HC.io `ciphra-liveness` on success. App-stack alive. |
| `*/5 * * * *` | `metrics/vps_pulse.sh` | `ciphra-pulse.log` | Pings HC.io `ciphra-vps-pulse`. Proves the VPS itself reaches the internet — independent of docker/app. |
| `*/15 * * * *` | `metrics/host_metrics.sh` | `ciphra-host.log` | Checks host disk/RAM/load against thresholds. Breach → ntfy push. |
| `0 * * * *` | `metrics/security_threshold.sh` | `ciphra-security.log` | Hourly: spike in LOGIN_FAILED events → ntfy push. |
| `0 2 * * *` | `metrics/metrics.sh` | `ciphra-metrics.log` | Nightly: appends a CSV row of `count(users) | count(docs) | count(audit)`. Eyeballable trend data. |
| `30 2 * * *` | `backup/backup.sh` | `ciphra-backup.log` | Nightly: pg_dump → gzip → age-encrypt → rclone copy → HC.io `ciphra-backup` ping. |
| `30 3 * * *` | `metrics/error_digest.sh` | `ciphra-errors.log` | Nightly: greps last 24h of ciphra-api + ciphra-nginx logs for error patterns → ntfy push if signal. |

### Root crontab (run as `root`)

Installed once via:
```bash
sudo crontab /opt/ciphra/golive/firewall/crontab-root.example
```

Verify with `sudo crontab -l`.

| Time (UTC) | Job | Log | What it does |
|---|---|---|---|
| `0 3 * * 0` | `firewall/cloudflare-only.sh` | `ciphra-fw.log` | Sunday: rewrites nftables CF-IP allow-list. Needs root for `nft`. |

Only one root cron task by design. Anything else that thinks it
needs root should be re-examined first.

## Health monitoring

### HC.io checks

Three checks at https://healthchecks.io/. Email on missed pings.

| Name | UUID source | Period | Grace | What "red" means |
|---|---|---|---|---|
| `ciphra-liveness` | `HEALTHCHECK_URL_LIVENESS` | 5 min | 2 min | App stack down. nginx, api, or postgres unreachable. |
| `ciphra-vps-pulse` | `HEALTHCHECK_URL_VPS_PULSE` | 5 min | 5 min | VPS itself unreachable. Host crash, network outage, kernel panic. |
| `ciphra-backup` | `HEALTHCHECK_URL` | 1 day | 6 hours | Nightly backup failed. Possibly: pg_dump error, age error, rclone upload failed. |

Read combinations:

| liveness | pulse | backup | Means |
|---|---|---|---|
| 🟢 | 🟢 | 🟢 | All healthy |
| 🔴 | 🟢 | (any) | App stack broken — `docker ps`, `journalctl -u ciphra-app`, check logs |
| 🔴 | 🔴 | (any) | VPS unreachable — check Infomaniak Manager / provider status |
| 🟢 | 🟢 | 🔴 | Backup pipeline broken — `tail -30 /var/log/ciphra-backup.log` |

### ntfy

A long-random topic at `https://ntfy.sh/<topic>` — value in `NTFY_TOPIC_URL`. Subscribed
on the operator's phone via the ntfy app. Pushes from:

- `metrics/host_metrics.sh` (disk/RAM/load threshold breach, every 15 min)
- `metrics/security_threshold.sh` (LOGIN_FAILED spike, hourly)
- `metrics/error_digest.sh` (server-error count in last 24h, nightly)

If you stop seeing these pushes for >24h: something is wrong with
either ntfy.sh upstream or your cron, regardless of HC.io. Run any
of the scripts manually to test.

## Backup + restore

### What's backed up

The full ciphra postgres database — `users`, `encrypted_documents`,
`family_grants`, `audit_log`. NOT the docker images (they're
rebuildable), NOT the nginx config (lives in `golive/` on laptop +
VPS), NOT the redis state (ephemeral by design).

### The pipeline

```
pg_dump → gzip → age (asymmetric encrypt → BACKUP_PUBKEY)
       → rclone copy → infomaniak-primary:ciphra-backup/
       → curl HEALTHCHECK_URL (HC.io ping)
```

No plaintext touches disk: `pg_dump` streams into a unix pipe.

Retention: 90 days on primary (Sunday sweep). Single-vendor for
Wave 1 (10-15 migrants); offsite secondary is wired in code but
intentionally not configured — see [Future work](#future-work).

### Manual backup (debug / pre-migration sanity)

Run as `ubuntu`, NOT root (rclone config is in ubuntu's home):

```bash
/opt/ciphra/golive/backup/backup.sh
# Expected: 3-5 sec, "backup: ... (N bytes)" + "backup OK"
```

Then verify:

```bash
rclone ls infomaniak-primary:ciphra-backup/ | tail -3
```

### Quarterly restore drill

A backup you've never restored from is not a backup. Run this every
3 months (calendar reminder) and any time the prod stack changes
materially.

This should run on a separate machine (operator's laptop preferred)
so it tests the cold-recovery path — "VPS is gone, I have only the
paper key + the Infomaniak login".

```bash
# 1. Throwaway postgres (not the dev one)
docker run --rm -d --name ciphra-restore-test \
  -e POSTGRES_USER=ciphra -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=ciphra -p 55432:5432 postgres:15-alpine
sleep 3

# 2. Pull last backup
mkdir -p /tmp/ciphra-restore-drill && cd /tmp/ciphra-restore-drill
rclone copy infomaniak-primary:ciphra-backup/ . --max-age 24h

# 3. Restore. Use whichever age private key path applies — laptop file
#    for routine drills, paper-into-temp-file for full cold drills (see
#    project_age_key_rotation_runbook.md §"Restore from a pre-rotation backup").
LATEST=$(ls -1t *.sql.gz.age | head -1)
age --decrypt -i ~/ciphra-secrets/ciphra-backup.key "$LATEST" \
  | gunzip \
  | docker exec -i ciphra-restore-test psql -U ciphra -d ciphra

# 4. Verify
docker exec ciphra-restore-test psql -U ciphra -d ciphra -c "
SELECT 'users' AS tbl, COUNT(*) FROM users
UNION ALL SELECT 'docs', COUNT(*) FROM encrypted_documents
UNION ALL SELECT 'family', COUNT(*) FROM family_grants
UNION ALL SELECT 'audit', COUNT(*) FROM audit_log;
"
# Expected: 4 tables, counts consistent with current prod state.

# 5. Cleanup
docker rm -f ciphra-restore-test
cd /tmp && rm -rf ciphra-restore-drill
```

**Acceptance:** 4 tables exist, counts are plausible for current
state. If you want to fully validate Zero-Knowledge: pick a document
ciphertext (`SELECT encrypted_data FROM encrypted_documents LIMIT 1`)
— you should see opaque base64-looking blob, not JSON.

If the drill fails at any step, escalate the failed step (don't
just retry). Common failure modes:

- `rclone copy` fails → S3 creds expired / rotated → re-config rclone
- `age --decrypt` fails → wrong private key → check `--identity` flag and key file
- `psql` errors → backup partial corruption → try previous day's backup

## Secret hygiene

### Inventory

| Secret | Where it lives | Rotation cadence |
|---|---|---|
| age private key | Paper (2 cards, 2 locations) + laptop file 0600 | Semi-annual (Jan 1 + Jul 1) + trigger-based |
| Infomaniak S3 access + secret | rclone config on VPS + restore-machine | When suspected leak |
| Cloudflare origin cert + key | nginx container bind-mount | Cert auto-rotates per CF; 15-year expiry by default |
| `SECRET_KEY` (JWT signing) | `.env` on VPS | Annual hygiene rotation (invalidates all sessions — schedule with notice) |
| Postgres password | `.env` on VPS | Only on suspected leak (changing requires restart + DB user re-auth) |
| ntfy topic URL | `.env` on VPS | When suspected leak (anyone with topic can send/spam) |

### age key rotation

Full runbook: `memory/project_age_key_rotation_runbook.md` (operator
personal memory). Summary:

1. Generate new keypair INTO A FILE (`age-keygen -o file`), never stdout
2. Tighten perms (`chmod 600`)
3. Extract pubkey: `grep "public key" newfile` (NEVER `cat`/`head` the whole file)
4. Paper-stash new private on NEW cards, destroy OLD paper, update rotation log
5. Shred old keyfile on disk
6. Update `BACKUP_PUBKEY` in VPS `.env`
7. Manual backup to validate

NEVER `cat`/`head`/`Read` a keyfile that contains the private. Use
`grep "public key"` or equivalent extractors. The private leak can
never be undone — see `memory/feedback_never_print_secret_files.md`.

### S3 credentials rotation

When the rclone config secret needs replacing:

```bash
# 1. In Infomaniak Manager UI, generate new S3 access+secret pair
# 2. Update rclone config on VPS:
rclone config
#    → e (edit) → infomaniak-primary → re-enter access + secret
# 3. Smoke:
rclone ls infomaniak-primary:ciphra-backup/ | tail -3
# 4. Manual backup:
/opt/ciphra/golive/backup/backup.sh
# 5. In Infomaniak Manager UI, REVOKE the old credentials
```

Same dance for any operator laptop that has a restore-config.

## Disaster recovery

### "The VPS is gone"

The hard case: Infomaniak issues, ransomware, anything. Recovery time
~2-4 hours including DNS propagation.

1. Provision new Ubuntu 24.04 VPS (Infomaniak or any provider). Follow
   `golive/SECTION1_RUNBOOK.md` for the VPS hardening steps.
2. Install docker + rclone + age.
3. Push the `golive/` tree from your laptop:
   `rsync -av ~/work/ciphra/golive/ <new-user>@<new-vps>:/opt/ciphra/golive/`
4. Create `/opt/ciphra/golive/.env` from `.env.example` with secrets
   from your password manager / Infomaniak / HC.io UIs.
5. Configure rclone on the new VPS with the S3 creds.
6. Restore: same as the quarterly drill but pointing at the new VPS
   instead of throwaway docker.
7. Start systemd units: `sudo systemctl start ciphra-data ciphra-app`.
8. Verify `https://<vps-public-ip>:8443/health` works (with `--resolve`
   + CF-Connecting-IP header — see healthcheck.sh).
9. Update DNS A/AAAA records at Cloudflare to point at new VPS IP.
   Propagation: ~5 min with CF.
10. Re-install crontabs (user + root).
11. Wait ~10 min, verify HC.io pings restored.

### "The laptop is gone"

Less hard but real — operator laptop is the single point for:
- age private key on disk
- rclone restore-machine config
- `golive/` canonical tree

Recovery:
1. Get a new machine.
2. Clone the ciphra repo (`golive/` is gitignored, so reconstruct it
   from the laptop backup OR from `/opt/ciphra/golive/` on the prod
   VPS via rsync).
3. Reconstruct `ciphra-secrets/ciphra-backup.key` from paper:
   ```bash
   mkdir -p ~/ciphra-secrets && chmod 700 ~/ciphra-secrets
   nano ~/ciphra-secrets/ciphra-backup.key
   # Paste the AGE-SECRET-KEY-... line from the paper card
   chmod 600 ~/ciphra-secrets/ciphra-backup.key
   ```
4. Run a restore drill to verify recovery actually works before
   moving on. Don't trust paper-copy integrity until you've seen a
   decrypt succeed.

### "I forgot the age private key" / paper destroyed

There is no recovery. The Zero-Knowledge model means even the
operator cannot decrypt backups without the key. Past backups are
permanently opaque. The running stack still works — current state in
postgres is unaffected — but past snapshots are gone forever.

This is why we do paper-stash to 2 locations and quarterly drills.

## Deploying a new version

Since 2026-06-12 CI builds and publishes images on every merge to
`main`: `ghcr.io/danileau/ciphra-{frontend,api}` tagged with the 7-char
commit SHA + `latest` (`.github/workflows/release-images.yml`). The
docs staging for `/docs` is encoded in the workflow. nginx stays
VPS-built (config lives in `golive/`, changes rarely).

Deploys remain an operator action — CI never touches the VPS.

### Standard deploy (ghcr pull)

One-time setup: in `/opt/ciphra/golive/.env` set
`CIPHRA_REGISTRY=ghcr.io/danileau`. The ghcr packages are PUBLIC
(repo is open source, images contain no secrets — .env stays on the
VPS), so pulls need no token; authenticity comes from the cosign
verify step below, not from registry auth. If the packages are ever
made private: fine-grained PAT, packages:read on this repo only,
6-month expiry bundled into the semi-annual key-rotation ritual —
do NOT build token-refresh machinery for a read-only pull credential.

```bash
# 1. note the merge SHA from the GitHub PR (7 chars), then on the VPS:
docker pull ghcr.io/danileau/ciphra-frontend:<sha>
docker pull ghcr.io/danileau/ciphra-api:<sha>
docker pull ghcr.io/danileau/ciphra-nginx:<sha>

# 2. verify the signatures (cosign binary: one-time install; helper
#    script from golive/deploy). Pins "built by the release workflow
#    of danileau/ciphra on main" against the EXACT PULLED DIGEST —
#    immune to tag re-pointing. Do NOT skip-on-red.
ciphra-verify ghcr.io/danileau/ciphra-frontend:<sha>
ciphra-verify ghcr.io/danileau/ciphra-api:<sha>
ciphra-verify ghcr.io/danileau/ciphra-nginx:<sha>

# 3. bump + restart (keep commands SHORT — long pastes split):
sed -i "s|^CIPHRA_TAG=.*|CIPHRA_TAG=<sha>|" /opt/ciphra/golive/.env
sudo systemctl restart ciphra-app
docker ps --format 'table {{.Names}}\t{{.Status}}'
```

Rollback: previous SHA in `CIPHRA_TAG` + restart (old images stay on
disk).

### Fallback deploy (build on VPS)

The pre-CI path, kept working on purpose. The prod Dockerfile lives
in-repo at `frontend/Dockerfile.prod`:

```bash
cd /opt/ciphra/src && git pull --ff-only
docker build --network=host -f/opt/ciphra/src/frontend/Dockerfile.prod \
  -t local/ciphra-frontend:<tag> frontend/
# (build context already contains docs via the repo clone? NO — stage them:)
rm -rf frontend/_docs-src && mkdir frontend/_docs-src
cp -r docs README.md SECURITY.md frontend/_docs-src/
```

(Stage docs BEFORE the build — order above shown for reference, run the
staging first. See the launch lesson: v0.1.0 shipped an empty /docs.)

### Post-deploy smoke

Browser-level, not curl — the app is client-rendered and SSR HTML is an
empty shell:

```bash
cd frontend && PLAYWRIGHT_NO_WEBSERVER=1 PLAYWRIGHT_BASE_URL=https://ciphra.ch \
  npx playwright test e2e/prod-smoke.spec.ts
```

## Common ops tasks

### Service restart

```bash
# Restart just the app plane (api/nginx/frontend) — data persists
sudo systemctl restart ciphra-app

# Restart the data plane (postgres + redis). Stops the app plane too
# via the Requires= chain. Use only when needed.
sudo systemctl restart ciphra-data
```

### Check container health

```bash
docker ps
# All containers should show "Up X (healthy)" or "Up X". "Restarting"
# or "Exited" = problem.

docker stats --no-stream
# CPU + memory. RAM usage should be well under 4 GB.
```

### Read logs

```bash
# Cron logs — usually silent (success means no output)
tail -f /var/log/ciphra-health.log    # if it has lines, healthcheck is failing
tail -f /var/log/ciphra-backup.log    # full backup output

# Container logs — actual app behavior
docker logs ciphra-api --tail=50
docker logs ciphra-nginx --tail=50
docker logs ciphra-frontend --tail=50

# Systemd
journalctl -u ciphra-app --since "1 hour ago"
journalctl -u ciphra-data --since "1 hour ago"
```

### Database access

```bash
# Read-only console
docker exec -it ciphra-postgres psql -U ciphra -d ciphra

# Or one-off query
docker exec ciphra-postgres psql -U ciphra -d ciphra -c "
SELECT COUNT(*) FROM users;
"
```

### Manual admin promote

```bash
docker exec ciphra-postgres psql -U ciphra -d ciphra -c "
UPDATE users SET is_admin = TRUE WHERE username = 'YOUR_USERNAME';
"
```

User must log out + back in for the admin flag to take effect (it's
embedded in the JWT).

### Check cron is firing

```bash
# Should show "ALIVE" + recent timestamp from logs
crontab -l | head -3
ls -la /var/log/ciphra-*.log

# Did pulse fire recently?
tail -3 /var/log/ciphra-pulse.log   # may be empty (success = silent)
# Better: check HC.io dashboard
```

If a cron job is broken: `grep "$(date -u +%Y-%m-%d)" /var/log/syslog
| grep CRON` will show what cron tried to run and any errors.

## Troubleshooting

### `ciphra-liveness` is red

Check in order:
1. `docker ps` — are all containers up?
2. `docker logs ciphra-nginx --tail=20` — recent errors?
3. `tail -20 /var/log/ciphra-health.log` — what's the script saying?
4. Manual probe:
   ```bash
   curl -k -H "CF-Connecting-IP: 127.0.0.1" \
     --resolve "ciphra.ch:8443:127.0.0.1" \
     "https://ciphra.ch:8443/health"
   # Expected: {"status":"healthy"}
   ```
5. If healthy here but cron still failing: env var problem in cron context. Verify
   `.env` is readable by `ubuntu` and contains `HEALTHCHECK_URL_LIVENESS`.

### `ciphra-vps-pulse` is red

The VPS can't reach the internet. Check Infomaniak status page. If
the VPS is reachable via SSH but pulse is red, the VPS has egress
network broken — check provider firewall.

### `ciphra-backup` is red

```bash
tail -30 /var/log/ciphra-backup.log
```

Common:
- `rclone copy` failed → S3 creds, network, bucket permissions
- `pg_dump` failed → DB connection (is postgres up?)
- `age --recipient` failed → BACKUP_PUBKEY malformed in `.env`
- `backup.sh` not finding `.env` → file permission or path issue

### Rate-limiter doesn't seem to work

Check redis is reachable from api:

```bash
docker exec ciphra-redis redis-cli ping
# Expected: PONG

docker exec ciphra-redis redis-cli keys '*' | head -5
# Should show LIMITS:LIMITER/<ip>/<route>/...
```

If keys all start with `LIMITS:LIMITER/172.18.0.1/...`: nginx is
not forwarding the real client IP. Check
`set_real_ip_from 172.16.0.0/12` is in `nginx/ciphra.conf`. See
`memory/feedback_nftables_redirect_localhost.md` for full context.

### A container won't start

```bash
docker logs <container-name> --tail=50
sudo systemctl status ciphra-app
sudo journalctl -u ciphra-app --since "5 min ago" --no-pager
```

For api specifically: if logs show `relation "users" does not exist`,
`init_db()` wasn't called. Check that `api/entrypoint.sh` is the
container CMD (not direct gunicorn). See
`memory/project_launch_complete.md` for the history.

## Future work

These are known gaps in the production posture. Not blocking 10-15
migrants but should close before broader rollout (Inselspital
announcement / Verbände).

- **CSP migration to SvelteKit hash mode** — drop `'unsafe-inline'`
  from `script-src`. See `memory/project_csp_inline_scripts_todo.md`.
  P0 before any wider user announcement.
- **Offsite backup secondary** — currently Infomaniak-only. Add a
  cross-vendor secondary (Cloudflare R2 or Backblaze B2). Set
  `RCLONE_SECONDARY` in `.env`; the rest of the code already supports it.
- **Logrotate** — `/var/log/ciphra-*.log` files grow unbounded.
  Add a `/etc/logrotate.d/ciphra` config when the security_threshold
  log starts firing regularly.
- **Calendar-driven age key rotation reminder** — currently manual.
  Add an entry to a calendar (or cron itself, sending ntfy on
  Dec 15 and Jun 15).
- **WAF rate-limits at Cloudflare** for `/api/login` — currently only
  enforced at nginx + flask-limiter. Adding a CF-level rule cuts
  bruteforce attempts at the edge, never reaching the origin.

## Operator memory references

These live in the operator's personal memory at
`~/.claude/projects/-home-danileau-work-ciphra/memory/`, NOT in the
repo. They capture lessons + runbooks beyond what's in committed docs.

- `project_launch_complete.md` — top-level launch status
- `project_redis_ratelimit_architecture.md` — redis design rationale
- `project_age_key_rotation_runbook.md` — full rotation procedure
- `project_session_handoff_20260608_evening.md` — Track 1 setup notes
- `feedback_never_print_secret_files.md` — mechanical guard for secrets
- `feedback_nftables_redirect_localhost.md` — why nginx binds 0.0.0.0
- `feedback_infomaniak_hypervisor_firewall.md` — VPS port-22 default
- `feedback_docker_build_ipv6.md` — `--network=host` trick for builds
- `feedback_golive_rsync_drift.md` — laptop is canonical, VPS isn't
