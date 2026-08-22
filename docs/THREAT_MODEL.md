# ciphra — operational threat model

This is the engineering / audit companion to `/SECURITY.md`. `SECURITY.md`
describes the **protocol-layer** zero-knowledge model (what the server,
the network, and the browser can each see). This file covers the
**operational-layer** model — the adversaries introduced by the
production deploy stack (`golive/`) and how each is bounded.

If you only have time for one, read `SECURITY.md` first. This document
assumes you've read it.

**Last updated:** 2026-06-12
**Deploy stack reviewed:** `golive/` + CI/CD revision 2026-06-12
(pull-based CD, cosign-signed images, scanner edge-blocking)
**Status:** launch-readiness review, not third-party audit

---

## 1. Defense-in-depth boundary

Two layers protect the patient's plaintext data:

| Layer | Mechanism | What breaks it |
|---|---|---|
| **Protocol (strong)** | Argon2id + AES-GCM client-side, server only holds ciphertext + opaque auth hash | Forgetting password (no recovery without recovery code); browser-served JS swap |
| **Operational (weaker)** | TLS, firewall, encrypted backups, age-encrypted at-rest, ops trust | Stolen ops creds; Cloudflare compromise; sysadmin malice |

**The promise:** even if the entire operational layer is breached
(sysadmin malice + Cloudflare account takeover + R2 compromise +
Postgres dump leak — all at once), patient health data is still
encrypted at rest with keys the attacker doesn't have. They get
ciphertext, username, timestamps, and IP within retention.

**The caveat:** browser-served E2E apps cannot defend against a
server-side attacker who *swaps the JavaScript bundle*. If the
attacker controls what code runs in the browser, they can exfiltrate
keys on the next login. This is a structural limitation of every
web-based zero-knowledge product (Bitwarden, Proton, Tutanota, Standard
Notes, etc.) and is mitigated only by reproducible builds (we do not
have these yet) and source-availability (we do — public repo).

---

## 2. Adversary classes

### A. Curious or malicious ops engineer (us)

**Capabilities:** Full root on the VPS. Can read Postgres, read
nginx logs, modify served JavaScript, read browser-stored cookies
relayed via XSS-they-inject. Cannot read patient health data at
rest (it's ciphertext) without also intercepting a login session
and decrypting client-side.

**Mitigations:**
- All patient health data is ciphertext at rest (Postgres) and in
  backups (age-encrypted). Decryption requires the user's password,
  which never reaches the server.
- Login attempts trigger an audit log row (`audit_log` table). A
  sysadmin who logs in as a target user leaves a trace; they could
  also delete the trace, but the act of deletion is itself logged
  by Postgres WAL if forwarded.
- Argon2-WASM library is loaded with Subresource Integrity (SHA-384
  pinned in `frontend/src/lib/crypto.ts`). A sysadmin who swaps the
  library file breaks the SRI hash and the browser refuses to load
  it.
- **Not mitigated:** an ops engineer who swaps the *main bundle*
  (and recomputes the SRI for any imports they tamper with). This is
  the JS-swap attack. See §5.

**Residual risk: HIGH** for users with a paranoid threat model.
This is why `SECURITY.md` says "use something air-gapped if your
adversary includes us."

### B. Stolen Infomaniak account credentials

**Capabilities:** Provider-portal access. Can reset VPS root password,
re-image the VM, attach a console, dump RAM via VM-level snapshot.
Equivalent to (A) plus the ability to bypass any host-level controls.

**Mitigations:**
- Infomaniak account uses unique password (1Password / Bitwarden, not
  shared with any other service) and 2FA via TOTP (not SMS).
- VPS root key is SSH-key only, not password. Even with VM console
  access, an attacker would need to inject a new authorized_keys
  entry via single-user-mode reboot — visible in console history and
  triggers a host_metrics.sh alert (unexpected reboot).
- Account loss-of-control playbook: see `/docs/INCIDENT_RESPONSE.md`
  (not yet written — see §7 open items).

**Residual risk: MEDIUM** — protected by TOTP + SSH-key, but no
hardware key on the provider account.

### C. Stolen Cloudflare account credentials

**Capabilities:** Can repoint DNS, change TLS mode (Full strict →
Flexible), inject Worker scripts that intercept request bodies,
disable WAF, exfiltrate analytics. **Critical attack path:** dropping
TLS mode from Full(strict) → Flexible terminates TLS at Cloudflare,
meaning all login traffic is decryptable by them. The browser still
sees a valid certificate.

**Mitigations:**
- Cloudflare account uses unique password + TOTP 2FA.
- TLS mode locked at "Full (strict)" in `golive/CHECKLIST.md`
  pre-cutover step. There is currently no automated alert if it
  changes — see §7.
- HSTS preload would prevent a downgrade attack but locks the domain
  to HTTPS for 2 years; deferred until 30 days of clean prod.

**Residual risk: MEDIUM-HIGH** — Cloudflare is a single point of
trust that sits between the user and our origin. This is the cost
of using their TLS / WAF / DDoS protection.

### D. Compromised backup storage (Infomaniak Swiss Backup or Cloudflare R2)

**Capabilities:** Read access to nightly `pg_dump.age` files.

**Mitigations:**
- Every backup file is `age`-encrypted with a public key whose
  corresponding private key **lives only on paper + with a trusted
  second person + bank deposit box** (never on the VPS, never in any
  cloud).
- Patient health data inside the Postgres dump is itself ciphertext
  (per protocol-layer). So a backup leak gives the attacker
  age-encrypted ciphertext — two encryption layers to break.

**Residual risk: LOW** — the only real-world impact is
metadata leak (usernames, registration dates, IP within retention)
if both backup destinations AND the age private key are compromised.

### E. Network attacker

**Capabilities:** Passive interception, BGP hijack, malicious WiFi
hotspot, etc.

**Mitigations:**
- TLS 1.2+ enforced end-to-end (Cloudflare → origin with Full
  strict + origin cert pinned 15-year validity).
- HSTS header set by nginx; preload deferred (see C).
- The protocol model assumes a passive network attacker by default —
  see `SECURITY.md` §Threat model.

**Residual risk: LOW** for passive attackers; **MEDIUM** for active
attackers who can also obtain a fraudulent cert from a CA Cloudflare
trusts (rare but documented).

### F. Stolen / unlocked user device

**Out of scope** per `SECURITY.md`. Documented for completeness:
IndexedDB plaintext cache + localStorage JWT are both readable from
an unlocked browser profile. Logout wipes both. The Settings →
"Clear local cache" affordance (CIPH-pi20-LB-2, shipped) lets users
trigger the same wipe without logging out.

### G. Browser-extension malware

**Out of scope.** A malicious extension with `<all_urls>` permission
can read DOM, intercept fetch, inject scripts. No browser app can
defend against this; we rely on browser-vendor extension review.

### H. Targeted attacker who can swap JavaScript

The JS-swap attack. See §5 for full discussion. **Mitigated only
partially** — this is the unsolved problem of all browser-E2E
products.

---

## 3. Trust boundaries diagram

```
            ┌─────────────────────────────────────────────────┐
            │            BROWSER (TRUSTED)                    │
            │  Plaintext lives here; keys live here           │
            └─────────────────────────────────────────────────┘
                              │ HTTPS (Full strict)
                              ▼
            ┌─────────────────────────────────────────────────┐
            │       CLOUDFLARE EDGE (PARTIAL TRUST)           │
            │  Sees: request volume, IPs, headers, user-agent │
            │  Cannot see: request bodies (encrypted POSTs)   │
            │  Risk:   account takeover → JS swap or TLS strip│
            └─────────────────────────────────────────────────┘
                              │ HTTPS (origin cert pinned)
                              ▼
            ┌─────────────────────────────────────────────────┐
            │         VPS NGINX (PARTIAL TRUST)               │
            │  Sees: request bodies (ciphertext payloads)     │
            │  Logs: IP, path, status, ts                     │
            └─────────────────────────────────────────────────┘
                              │ localhost:8000
                              ▼
            ┌─────────────────────────────────────────────────┐
            │       VPS API (api/server.py) (PARTIAL)         │
            │  Sees: auth hashes, ciphertext payloads,        │
            │        usernames, JWT contents                  │
            │  Stores: nothing plaintext-health-data          │
            └─────────────────────────────────────────────────┘
                              │ socket
                              ▼
            ┌─────────────────────────────────────────────────┐
            │       POSTGRES (UNTRUSTED-AT-REST)              │
            │  Holds: ciphertexts, usernames, ts, audit logs  │
            │  Backup → age-encrypted → Swiss Backup (R2 architected)     │
            └─────────────────────────────────────────────────┘
```

**Reading guide:** the patient's password is the only artifact
that crosses the BROWSER → CLOUDFLARE boundary in non-hashed form,
and only as Argon2-derived auth bytes — never as the password
itself. The master key never leaves the BROWSER layer.

---

## 4. Attack-surface inventory (post-deploy)

| Surface | Component | Adversary | Mitigation status |
|---|---|---|---|
| Login bruteforce | API /login | E (network) | ✅ Per-account lockout (5/15min) + Cloudflare rate-limit |
| Recovery bruteforce | API /recover | E | ✅ Per-account lockout (3/15min) |
| Account enumeration | API /login, /recover, /family/claim | E | ✅ Deterministic fake-params on unknown users |
| XSS → key theft | Frontend | E + B+C compromise paths | ✅ CSP strict + no inline script + no eval |
| CSRF | API mutating endpoints | E | ✅ JWT-bearer auth (not cookie) → no automatic credential attachment |
| SQL injection | API/Postgres | E | ✅ Parameterized queries (psycopg) |
| TLS downgrade | Edge | C (CF takeover) | ⚠️ Manual lock; no automated alert |
| BGP hijack / cert fraud | Network | E (sophisticated) | ⚠️ HSTS preload deferred |
| JS swap | Server-served bundle | A, B, C | ❌ Structural — see §5 |
| Backup leak | R2 / Swiss Backup | D | ✅ age-encrypted + protocol-layer ciphertext underneath |
| Postgres dump leak | VPS compromise | A, B | ✅ Patient health data is ciphertext at rest |
| Container CVE | Docker base images | E (sophisticated) | ✅ Daily Trivy scan of repo + published ghcr images (`security-scan.yml`), fresh DB, fails on HIGH/CRITICAL |
| Supply-chain (npm/pip) | Build-time | E (sophisticated) | ⚠️ Lockfiles + `trivy fs` in CI + grouped Dependabot (majors solo-PR'd); images cosign-signed (keyless, Rekor-logged) so the registry→VPS hop is verified; SBOM not yet generated |
| Tampered deploy image | Registry → VPS | C, E | ✅ Pull-based CD digest-verifies the cosign signature (workflow identity on `main`) before restart; a tag alone cannot deploy unsigned bits |
| Side-channel (timing) | API auth verification | A, E (sophisticated) | ✅ Constant-time hash compare in auth_verify |

Legend: ✅ mitigated · ⚠️ partial / open follow-up · ❌ structural

---

## 5. The JavaScript-swap problem

The unsolved core problem of all browser-served zero-knowledge apps,
ciphra included.

**Attack:** An attacker who controls what JavaScript the browser loads
(via server compromise, Cloudflare account takeover, malicious CDN,
hostile registrar) ships a modified bundle that exfiltrates the
password or master key on the next user login. The user has no way
to detect this; the page looks identical.

**Current mitigations:**

1. **Source-availability.** ciphra's code is in a public repo. A
   suspicious user can diff what they're served against the repo —
   but this is not a defense, it's a verification ritual most users
   will not perform.
2. **Argon2-WASM SRI pinning.** The Argon2 library is loaded with a
   SHA-384 hash in the script tag. A swap of *that specific library*
   is refused by the browser. But the *main app bundle* is loaded
   via SvelteKit's normal mechanism without SRI on every chunk.
3. **No third-party CDNs for app code.** Everything is same-origin.
   This shrinks the attack to "our server" (or anyone in front of it
   — i.e. Cloudflare).
4. **CSP restricts script sources.** `default-src 'self'`. Injected
   scripts from any other origin are blocked.

**Mitigations not implemented:**

- Reproducible builds + signed releases (the proper fix). Complex
  for SvelteKit; deferred.
- SRI on every JS chunk (would require build tooling not yet wired).
- Native desktop / mobile app with signed binaries (would defeat the
  purpose for many users — web is the access model).

**Posture:** disclosed clearly in `SECURITY.md` (§What is NOT done
yet → "No reproducible-build pipeline"). Users with a threat model
that includes us-as-adversary are explicitly told to use a different
tool.

---

## 6. Backup integrity

### What gets backed up

`pg_dump -Fc` of the full `ciphra` Postgres database → gzip → `age`
encrypt with `BACKUP_PUBKEY` → rclone:
1. **Primary (active):** Infomaniak Swiss Backup (Swiss jurisdiction)
2. **Secondary (architected, NOT yet configured):** Cloudflare R2 free
   tier — the code path exists (`RCLONE_SECONDARY` in `.env`) but is
   intentionally unset for Wave 1 (10–15 migrants); single-vendor is
   the accepted posture until broader rollout. Do not assume offsite
   redundancy exists today. See OPERATIONS.md §Future work.

### Backup secret-handling

The age **private** key (`ciphra-backup.key`) is the only thing that
can decrypt backups. It lives:
- ✅ Printed on paper, in a bank deposit box
- ✅ With one trusted second person (also paper)
- ❌ NOT on the VPS (would defeat the purpose)
- ❌ NOT in any cloud storage
- ❌ NOT in 1Password / Bitwarden (those vault providers become a
  trust dependency we'd rather avoid)

### Backup integrity verification

Per `golive/CHECKLIST.md` §5, a restore drill MUST be performed
against a staging VM before the production cutover. "A backup
you've never restored from is not a backup." Re-drill scheduled
quarterly (calendar reminder, not automated).

### Backup-corruption attack

A sysadmin / Infomaniak / R2 attacker who can write to the backup
destination could overwrite valid backups with garbage. We do not
currently checksum-verify backups against a third store; the
restore drill catches this only at drill time, not in real time.
**Open follow-up (P2):** add a third tiny store (e.g. a hash log
in a Cloudflare KV write that records each backup's SHA-256 at
upload time) for tamper-evidence.

---

## 7. Open follow-ups + accepted risks

### Tracked open items

| Severity | Item | Owner |
|---|---|---|
| P1 | INCIDENT_RESPONSE.md not yet written | next docs sprint |
| P1 | Cloudflare TLS-mode drift alerting (no auto-detect for Full→Flexible) | post-launch monitoring sprint |
| P2 | Backup tamper-evidence (third hash store) | post-launch ops sprint |
| P2 | HSTS preload submission (30 days of clean prod) | 2026-07 calendar |
| ✅ done | Continuous container CVE scan — `.github/workflows/security-scan.yml` runs Trivy daily against the repo + the published ghcr images (fresh DB), fails on HIGH/CRITICAL, emails on red (2026-06-12) | — |
| P2 | SBOM generation in CI | when build moves to CI from local |
| P3 | Hardware-key 2FA for provider accounts (CF + Infomaniak) | when YubiKey arrives |
| P3 | Reproducible-build pipeline for frontend bundle | structural, no timeline |

### Accepted risks (explicit non-mitigations)

- **No third-party crypto audit.** Source-availability + this
  document is our substitute. Will commission an audit when funded.
- **No bug bounty.** Use the `security@ciphra.ch` mailbox.
- **No mobile apps.** Web-only by deliberate constraint (the
  "browser-served E2E" tradeoff is consciously accepted).
- **Single sysadmin.** No 4-eyes principle on production changes.
  Acceptable at current scale (single developer, single-digit
  early users); revisit when team grows or user count crosses 100.
- **No DAST.** Manual penetration testing pre-launch only; no
  continuous automated DAST. Deferred to post-launch monitoring
  sprint.

---

## 8. Incident-response posture (skeleton)

A full `docs/INCIDENT_RESPONSE.md` is open (§7, P1). Pending that,
the working skeleton:

1. **Detection.** ntfy push from `metrics/security_threshold.sh`,
   `metrics/host_metrics.sh`, `metrics/error_digest.sh`, plus HC.io
   missed-ping alerts.
2. **Containment.** First action on confirmed compromise:
   `systemctl stop ciphra-app.service` — keeps data plane intact
   while serving 503 to all traffic.
3. **Assessment.** journalctl + audit_log table + nginx access logs.
4. **User communication.** If patient-data exposure suspected: in-app
   banner + transparency log entry. **No silent compromise.** This is
   a published commitment, not an aspiration.
5. **Recovery.** Either restore-from-backup to a new VPS, or in-place
   patch + restart. Document the timeline.
6. **Lessons.** Postmortem within 7 days. Public summary unless it
   would aid attackers; in that case, public summary + private
   detailed version for affected users on request.

---

## 9. Review cadence

- **Pre-launch:** this document. Once.
- **Post-launch:** monthly review of audit_log anomalies +
  error_digest patterns. Update this file if assumptions change.
- **Annual:** full re-review of all adversary classes + open items.
- **Triggered:** any time the deploy stack changes materially (new
  service, new vendor, new component). Update before deploying.

---

## How to verify the claims in this document

1. **VPS layout matches §3:** `ls /opt/ciphra/golive/` should mirror
   `golive/README.md` §Layout.
2. **TLS mode is Full strict:** Cloudflare dashboard → SSL/TLS →
   Overview. Should show "Full (strict)", not "Flexible" or "Full".
3. **Backup is age-encrypted:** `file /var/backups/ciphra-*.age`
   reports "age encryption v1".
4. **Patient data is ciphertext at rest:** `psql ciphra` → `SELECT
   encrypted_data FROM encrypted_documents LIMIT 1` returns opaque
   bytes, not JSON.
5. **Audit log is filling:** `SELECT count(*) FROM audit_log WHERE
   ts > now() - interval '1 day'` returns a non-zero number after
   the first real user activity.
6. **SAST is clean:** `trivy fs . --severity HIGH,CRITICAL` on the
   repo + `trivy image ghcr.io/.../ciphra-api:<sha>` returns zero
   HIGH/CRITICAL findings.

Last verified: 2026-06-07 (trivy clean on repo, frontend deps,
api deps; secret scan clean).
