# ciphra — security model

This document is the honest description of what ciphra protects, what it doesn't, and how. It is the substitute for a third-party audit (which has not been done at the time of writing). Read it skeptically, read the code, and decide for yourself.

**Last updated:** 2026-04-12

---

## Threat model

ciphra is designed to defend the **content** of your health entries against:

- A **dishonest or compromised server operator** (us, after a hack, or after a court order).
- A **passive network attacker** with TLS in place (HTTPS).
- An **opportunistic attacker** with a stolen database dump.

It is **not** designed to defend against:

- An attacker with **physical access to your unlocked device**.
- A **malicious browser** or compromised browser extension.
- A **targeted attacker** who can serve you tampered JavaScript via a compromised CDN, hosting provider, or DNS chain — though we mitigate the easy version of this with Subresource Integrity.
- A **rubber-hose** attacker who can compel you to reveal your password.

If your threat model includes any of those, ciphra is the wrong tool — use something air-gapped, paper, or a dedicated hardware-key-protected vault.

---

## What is encrypted, and how

### Primitives

- **Argon2id** for key derivation (memory-hard password hashing, OWASP recommended). Parameters: `time_cost=3`, `memory_cost=64 MiB`, `parallelism=4`, `hash_len=32 bytes`.
- **AES-256-GCM** for content encryption (NIST standard, authenticated encryption — detects tampering).
- **SHA-256** for credential verification (server stores a hash of an Argon2 output, never the password or the Argon2 output itself).

### Key hierarchy on registration (browser-side, client-only)

1. Browser generates a fresh `master_key` — 32 random bytes from `crypto.getRandomValues()`.
2. Browser derives `auth_key = Argon2id(password + ":AUTH", auth_salt)`.
3. Browser derives `vault_key = Argon2id(password + ":VAULT", vault_salt)`.
4. Browser computes `auth_hash_for_server = SHA-256(auth_key)`.
5. Browser AES-256-GCM-encrypts `master_key` with `vault_key` → `encrypted_master`.
6. Browser sends to the server: `{auth_hash_for_server, auth_params, vault_params, encrypted_master, optional_recovery_blob}`.

The server **never sees**: the password, the auth_key, the vault_key, the master_key, or the recovery code.

### Login

1. Browser asks server for `auth_params` for the username (server returns deterministic fake params for unknown users to block enumeration).
2. Browser derives `auth_key` locally.
3. Browser sends `auth_key` to server. Server hashes with SHA-256 and compares constant-time against stored `auth_hash`.
4. On success, server returns `vault_params + encrypted_master`.
5. Browser derives `vault_key`, decrypts `master_key` locally.

### Health entry encryption

Every entry (daily log, blueprint, family link, etc.) is `AES-256-GCM(JSON.stringify(entry), master_key)` with a fresh 12-byte random nonce, stored as base64. Server never sees the master_key.

### Recovery code

A 12-word code from a 300-word list (~99 bits of entropy), shown once at registration. Derives a `recovery_key` via `Argon2id(code + ":{username}:RECOVERY", recovery_salt)`. Used to wrap the master_key into a `recovery_vault` blob. Lost code = irretrievable account. We cannot reset it.

### Family sharing

Each grant is a separate AES-GCM-wrap of the patient's master_key, derived from a separate 6-word "family code." The wrapped blob is stored server-side (`family_grants.wrapped_master`). To use it, the caregiver must know the family code and present a SHA-256(family_key) proof to the server. **Important:** revoking a grant stops new server-side access but does not retract data the caregiver already downloaded — we cannot reach into their device.

---

## What the server can see

- Username (chosen by user; can be a pseudonym).
- `SHA-256(auth_key)` — not the password, not the auth_key itself.
- Argon2 salts and parameters.
- `encrypted_master`, `recovery_vault`, `wrapped_master` — opaque ciphertexts.
- Encrypted document blobs — opaque ciphertexts. We can see size and timestamp.
- IP address of each request, retained 30 days raw, then anonymized to /24, deleted at 90 days.
- An audit log of authentication events (login success/fail, lockouts, password changes, family grants created/revoked, account deletion).

We **cannot** see:
- Your password.
- The plaintext of any health entry.
- Which condition you track.
- When you had a symptom or episode (only when you uploaded a blob).
- Free-text notes.

This list is exhaustive. If we discover otherwise, we will update this document and notify users.

---

## Hardening

- **JWT secret:** required env var, ≥ 32 chars, no fallback. Server fails to start without it.
- **Argon2 WASM library:** loaded with [Subresource Integrity](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity) (SHA-384 hash pinned in `crypto.ts`). A tampered library is refused by the browser.
- **CORS:** restricted to configured origins; no wildcard.
- **CSP:** `default-src 'self'`, no inline scripts, no `eval`, `frame-ancestors 'none'`.
- **Master key in browser:** lives in `sessionStorage` only — cleared when the browser closes. Limits the XSS window to "this tab session."
- **Per-account lockout:** 5 failed login attempts → 15-minute lock; 3 failed recovery attempts → 15-minute lock.
- **JWT invalidation:** `password_version` column incremented on password change or recovery; old tokens are rejected.
- **Audit log retention:** 90 days max, IPs anonymized after 30 days, full IP cleared on account deletion.
- **No user enumeration:** `/login/init`, `/recover/init`, and family-claim endpoints return identical-shape responses for unknown users (deterministic fake parameters derived from server-side HMAC).

---

## What is NOT done (yet)

- **No formal third-party cryptographic audit** has been commissioned. The code is open source — read it yourself, or have someone you trust read it. We plan to commission one when budget allows; in the meantime, this document is our promise that what is described here matches what is implemented.
- **No bug bounty** is currently offered. If you find an issue, see "Reporting" below.
- **No reproducible-build pipeline** for the frontend bundle. A hostile server operator could ship malicious JavaScript that bypasses zero-knowledge for one session. This is a structural limitation of any browser-served E2E application; mitigations include serving the app from a domain you control, or using the source from this repo on infrastructure you trust.
- **No image upload.** Intentionally — would create a CSAM-detection problem we cannot honestly handle. May be reconsidered with mandatory client-side hash matching.
- **No mobile app.** Web only at present. Mobile would unlock biometric unlock, panic-wipe with home-screen icon hiding, OS-level secure storage for the master key.
- **No multi-device sync of in-memory state.** Each device decrypts independently using your password.

---

## Cooperation with law enforcement

See `/terms` on the live site (or `frontend/src/lib/i18n/en.ts` → `terms.cooperation_*` keys) for the exhaustive "what we can / cannot provide" breakdown.

Short version: we can provide what the server holds — username, account dates, IP within retention window, opaque ciphertexts. We cannot provide the plaintext of any health entry, your password, or your master key, because we do not have them.

---

## Reporting a vulnerability

If you find a security issue, please email `security@ciphra.ch`. We commit to:

- Acknowledging within 5 working days.
- Coordinating a fix and disclosure timeline.
- Crediting the reporter in release notes (unless they prefer not to be).

Please **do not** open a public GitHub issue for security vulnerabilities. Use email.

---

## How to verify our claims yourself

1. Read `frontend/src/lib/crypto.ts` — all browser-side crypto.
2. Read `api/server.py` — search for `verify_auth`, `hash_auth_key`, the `register`, `login`, `recover`, `family_grant_*` endpoints.
3. Open browser DevTools → Network tab on a real registration. Inspect the POST body to `/api/register`. Confirm: no plaintext password, no plaintext recovery code, just hashes and ciphertexts.
4. Repeat for `/api/login` and `/api/family/grants` — same check.

If anything in this document is contradicted by the code, please file an issue or email security. The code is the truth; this document tries to describe it accurately.
