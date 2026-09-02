# Incident response

How ciphra handles a production incident: detect → triage → contain → assess →
recover → communicate → learn. This is the full playbook the
[`THREAT_MODEL.md`](THREAT_MODEL.md) §8 skeleton pointed to.

Two ground truths shape everything here:

- **ciphra is zero-knowledge.** The server stores ciphertext; it cannot read,
  and therefore cannot leak, plaintext health data. A server or database
  compromise exposes *ciphertext + metadata* (who has an account, when they
  logged docs, sizes), never the contents. That narrows what "data breach"
  means here — see [Playbook D](#playbook-d--suspected-data-exposure).
- **One operator.** There is no on-call rotation. "Escalate" means *you*, now.
  The mechanical steps are in [`OPERATIONS.md`](OPERATIONS.md); this file is the
  decision layer on top of them.

## Severity

Set severity from **impact**, not cause. It decides how fast you drop
everything else.

| Sev | Meaning | Examples | Response |
|---|---|---|---|
| **SEV1** | Data at risk, or the ZK guarantee in doubt | suspected VPS/key compromise, tampered deploy image, plaintext-leak path found | Drop everything. Contain first, ask questions second. |
| **SEV2** | Prod down or a core flow 100% broken | site 5xx, login broken, migration unusable ([INC-001](incidents/INC-001.md) was SEV2) | Same hour. Contain/roll back, then root-cause. |
| **SEV3** | Degraded / one non-core surface broken | one route errors, backup failed once, a cohort's report wrong | Same day. |
| **SEV4** | Cosmetic / no user impact | copy bug, a stale doc, a flaky alert | Normal queue. |

When unsure between two levels, take the higher one until you know better.

## The loop

### 1. Detect

Signals that should reach you without looking (all wired in
[`OPERATIONS.md` §Health monitoring](OPERATIONS.md#health-monitoring)):

- **HC.io missed-ping email** — `ciphra-liveness` (app down), `ciphra-vps-pulse`
  (host unreachable), `ciphra-backup` (nightly backup failed).
- **ntfy push** — `security_threshold.sh` (LOGIN_FAILED spike), `host_metrics.sh`
  (disk/RAM/load), `error_digest.sh` (server errors in last 24h).
- **A user report** on the support channel — how [INC-001](incidents/INC-001.md)
  surfaced. A single credible report of a broken core flow is an incident even
  if every dashboard is green (see [§Why nothing detected it](incidents/INC-001.md)).

### 2. Triage

Answer three questions, in order:

1. **Is data or the ZK guarantee at risk?** → SEV1, jump to
   [Contain](#3-contain) now.
2. **What's the blast radius?** one user / one route / everyone.
3. **Did it just change?** `git log origin/main`, the live `CIPHRA_TAG`, the
   last deploy time. A fresh deploy is the first suspect — but **verify before
   rolling back** (INC-001 was a redirect on the *source* host, not our deploy;
   the /reports 502 on 2026-08-22 was an nginx buffer, not the shipped code).
4. **Did the box change *itself*?** If nothing was deployed and nothing was
   configured, read the machine's own package history:
   ```bash
   grep -B3 -A8 '<date>' /var/log/apt/history.log
   zgrep -h -B3 -A8 '<date>' /var/log/apt/history.log.*.gz
   ```
   The VPS runs `unattended-upgrades`, so it is the only component that changes
   production with no deploy tag and no notification. On 2026-09-01 a `zlib1g`
   upgrade at 06:34 broke git's HTTP/2 and killed pull-based CD for a day while
   every health check stayed green. An overnight onset with no deploy is the
   tell — ask this question early, not after the obvious suspects are exhausted.
   The nightly digest now reports self-patches, so this is usually already on
   your phone.

### 3. Contain

Stop the bleeding before understanding it.

- **Bad deploy →** roll back: `scripts/deploy-wizard.sh`, pick the previous
  known-good commit ([`OPERATIONS.md` §Deploying](OPERATIONS.md#deploying-a-new-version)).
  Rollback is a normal deploy of an earlier SHA — the images are still on disk.
- **Suspected compromise (SEV1) →** take the app offline, keep data intact:
  ```
  sudo systemctl stop ciphra-app.service     # nginx+api+frontend down; postgres/redis stay up
  ```
  All traffic gets 503. This buys time without touching the database or
  destroying forensic state.
- **Edge-level abuse (scanning/bruteforce) →** tighten at Cloudflare (WAF rule /
  rate-limit) before origin; origin already has flask-limiter + per-account
  lockout + the nginx `api_login` zone.
- **Never** `docker system prune` / delete volumes / re-provision during
  containment — you destroy the evidence you need for step 4 and the data you
  need for step 5.

### 4. Assess

- `journalctl -u ciphra-app -u ciphra-data --since '2 hours ago'`
- `docker logs --since 3h ciphra-api` / `ciphra-nginx` (5xx, tracebacks)
- The **`audit_log`** table — `LOGIN_SUCCESS`/`LOGIN_FAILED`, admin actions,
  grant claims. This is the authoritative record of *who did what*.
- nginx access logs for the source IPs and the exact requests.
- For a suspected breach: what could the attacker reach? Ciphertext + metadata
  + `audit_log`, **not** plaintext (ZK). Confirm the master-key material never
  lived server-side (it doesn't — [`SECURITY_MODEL.md`](SECURITY_MODEL.md)).

### 5. Eradicate & recover

- **Code/config fault →** fix on a branch, PR, green CI, deploy. Do not hotfix
  on the VPS (laptop is canonical — see the golive rsync-drift note).
- **Compromise →** rebuild the VPS from scratch, restore Postgres from the
  latest good backup ([`OPERATIONS.md` §Disaster recovery](OPERATIONS.md#disaster-recovery)),
  and **rotate every secret that could have been exposed** — see
  [Playbook E](#playbook-e--key--secret-compromise).
- Verify recovery against [`OPERATIONS.md` §Post-deploy smoke](OPERATIONS.md#post-deploy-smoke)
  before declaring resolved.

### 6. Communicate

- **The commitment: no silent compromise.** If patient-data exposure is ever
  *possible*, affected users are told — in-app notice + a transparency entry.
  This is published in [`SECURITY_MODEL.md`](SECURITY_MODEL.md), not optional.
- **A broken flow for known users** (the INC-001 shape): reach them directly.
  The reply-template pattern lives in
  [`docs/incidents/INC-001-reply-de.md`](incidents/INC-001-reply-de.md) — Swiss
  German, `du`, state what broke / what it means for their data / what to do,
  no blame-shifting, no over-apologising, no personal data committed.
- **Scope honestly.** "We don't yet know" is a valid status; a wrong "you're
  fine" is not.

### 7. Learn

- **Postmortem within 7 days**, as `docs/incidents/INC-NNN.md`, following the
  [INC-001](incidents/INC-001.md) shape: summary table (reported / confirmed /
  severity / data loss / resolved / status), impact, what the user experienced,
  root cause, timeline, prevention (with the *mechanical* guard that stops the
  recurrence — INC-001 added an e2e test and a pre-deploy origin check).
- Blameless: the target is the system that let it happen, not the person.
- Feed prevention back into code (a test, a guard, a CI gate), not just prose.

## Playbooks

### Playbook A — suspected server / VPS compromise (SEV1)

1. `systemctl stop ciphra-app.service` (contain; data plane stays up for
   forensics).
2. Snapshot before you touch anything: `journalctl` export, `docker logs`,
   `audit_log` dump, nginx logs, `last`/`auth.log` for SSH.
3. Assume the JWT `SECRET_KEY`, TLS origin cert/key, and any S3/rclone creds on
   the box are exposed → [Playbook E](#playbook-e--key--secret-compromise).
4. The **age *private* key is never on the VPS** — a VPS breach does not expose
   it, so existing backups stay confidential. Confirm, don't assume.
5. Rebuild the VPS clean; restore Postgres from backup; rotate secrets; bring up
   behind the CF-only firewall; smoke-test; then re-open.
6. Communicate per §6 — a breach that exposed ciphertext + metadata still
   triggers the no-silent-compromise notice.

### Playbook B — tampered deploy image / supply chain (SEV1)

- The pull-based CD **digest-verifies the cosign signature** (workflow identity
  on `main`) before restart, so an unsigned image can't deploy. If verification
  *failed* and the VPS refused to restart, that's the control working — not an
  incident by itself.
- If a *signed but malicious* build is suspected (compromised CI): freeze
  deploys, audit the `release-images.yml` run + Rekor log for the digest, and
  roll back to a known-good SHA. Rotate `GITHUB_TOKEN`/CI secrets.

### Playbook C — account loss-of-control (user side)

The [`THREAT_MODEL.md`](THREAT_MODEL.md) §5.4 pointer. A user who lost their
recovery code, or suspects their account is accessed by someone else:

- **Lost recovery code + forgotten password →** by design, unrecoverable. The
  server cannot reset a vault it cannot read. Confirm the user understands this
  is the ZK trade-off, not a bug; offer a fresh account + re-import if they have
  a device still logged in that can export.
- **Suspected takeover →** changing the password bumps `password_version`, which
  invalidates existing JWTs (verified in `_decode_and_verify_token`). Walk them
  through password change; review `audit_log` for the account's recent
  `LOGIN_SUCCESS` rows + IPs.
- **Family-grant misuse →** grants are revocable (`/api/family/grants` DELETE /
  revoke-all); a revoked grant cannot re-wrap.

### Playbook D — suspected data exposure

- **What CANNOT leak from the server:** plaintext health data, the master key,
  the password. These never exist server-side in readable form.
- **What CAN:** ciphertext blobs, and **metadata** — usernames, account
  existence, document counts/sizes/timestamps, `audit_log`. Treat a metadata
  leak as real (it can reveal *that* someone tracks a condition).
- Confirm scope from what was actually reachable (a Postgres dump = ciphertext +
  metadata; a VPS shell = also secrets, → Playbook E). Then §6.

### Playbook E — key / secret compromise

Rotate what was exposed. Runbooks in
[`OPERATIONS.md` §Secret hygiene](OPERATIONS.md#secret-hygiene):

| Secret | Impact if exposed | Action |
|---|---|---|
| JWT `SECRET_KEY` | forged sessions | rotate in `.env` → restart; all tokens invalidate |
| TLS origin cert/key | MITM behind CF | reissue origin cert; update `golive/secrets/` |
| S3 / rclone creds | backup store access (still age-encrypted) | rotate at provider + `rclone.conf` |
| age **private** key | read all backups | not on the VPS; rotate per `age_key_rotation_runbook` only if the paper/laptop copy is compromised |
| `BACKUP_PUBKEY` | none (public) | — |

## The incident record

Every SEV1–SEV3 gets a `docs/incidents/INC-NNN.md`, numbered sequentially
([INC-001](incidents/INC-001.md) is the worked example and the format to copy).
It is a public, blameless record — no personal data, no filled-in credentials.
SEV4s don't need their own file; fix and move on.

## Cross-references

- [`OPERATIONS.md`](OPERATIONS.md) — the mechanical runbook (restart, restore,
  rotation, deploy/rollback, troubleshooting).
- [`THREAT_MODEL.md`](THREAT_MODEL.md) — adversary classes and the attack-surface
  inventory this playbook responds to.
- [`SECURITY_MODEL.md`](SECURITY_MODEL.md) — what is and isn't protected; the
  no-silent-compromise commitment.
- [`docs/incidents/`](incidents/) — the record of what has actually happened.
