# ciphra — security model

This document is the honest description of what ciphra protects, what it doesn't, and how. It is the substitute for a third-party audit (which has not been done at the time of writing). Read it skeptically, read the code, and decide for yourself.

**Last updated:** 2026-06-07

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

## What the browser stores (and why)

The server-side promise above is the strong leg of the threat model. The local-device leg is weaker and we want you to see exactly why.

While you are logged in, three different browser storage locations hold material relevant to your data:

### 1. `sessionStorage` — `ciphra_master_key`

The 32-byte master key, base64-encoded. **Cleared automatically when the browser tab closes** — that's the whole reason it's in `sessionStorage` and not `localStorage`. If a tab reloads mid-session the key survives; if you close the browser, you'll be asked to log in again on the next visit. This shrinks the XSS-stolen-key blast radius from "forever" to "this tab session."

Code: `frontend/src/lib/stores/auth.ts:48-83`.

### 2. `localStorage` — `ciphra_auth`

A JSON blob with: JWT bearer token, username, encrypted vault metadata (auth params, vault params, encrypted master), and an admin flag.

This **persists across browser restarts** by design — without it, every visit would require a fresh login. It is, however, the broadest local-attack surface:

- An XSS hole anywhere in the app could read the JWT and call our APIs as you. Our CSP (`default-src 'self'`, no inline scripts, no `eval`) is the structural mitigation; we eliminate injection sinks rather than rely on token-storage tricks.
- Browser-profile theft (someone with disk access to your unlocked machine) gets the token and the encrypted-vault metadata. They still need your password to unlock the master key, but they have a head start.

We chose this tradeoff explicitly. An "always re-login" alternative would be more secure but materially worse UX for a daily journal. If the calculus matters for your threat model, log out manually after each session — that wipes both stores.

Code: `frontend/src/lib/stores/auth.ts:34-83`.

### 3. `IndexedDB` — `ciphra_cache` / `decrypted_documents`

This is the part most users do not realise is there.

**ciphra caches decrypted document plaintext on the device** for warm-load performance. After your first decrypt of a document, the plaintext is written to IndexedDB alongside an etag (the original ciphertext). On the next page load we can read straight from cache and skip the Argon2 + AES-GCM step — that's how the calendar / journal feel instant on revisit. The tradeoff is that **plaintext exists at rest on your device between login and logout**, in addition to the ciphertext your browser already had to download.

Code: `frontend/src/lib/idb.ts:1-90`.

**Wipe semantics** — what removes this plaintext, and when:

- **Logout** (the "Abmelden" button): wipes IndexedDB completely via `indexedDB.deleteDatabase`, and as a fallback also clears the live store contents if a tab still has the database open. Logout is `async` and the wipe is awaited before the UI confirms. Code: `frontend/src/lib/stores/auth.ts:127-149`, `frontend/src/lib/idb.ts:125-151`.
- **Browser tab close**: does **not** wipe IndexedDB. The plaintext stays. Re-opening the tab requires re-login (because the master key in `sessionStorage` is gone), but a forensic examination of the browser profile in that interval would surface the cached plaintext.
- **Browser-profile compromise on an unlocked device**: out of scope. An attacker with disk access to your unlocked browser profile can read IndexedDB. This is the same threat model as any browser-served E2E app and is one of the listed exclusions at the top of this document.
- **Caregiver / family-sharing context**: PI v13 security review caught a related bug where switching between linked vaults left the prior vault's plaintext on disk. Fixed in PI v16 (`clearAllPartitions` deletes the entire database, not just the active partition).

If you want plaintext gone right now without losing your session, log out — the wipe is awaited before the UI confirms. Or use the **"Cache jetzt leeren" button in Settings → Konto → "Daten auf diesem Gerät"** which triggers the same wipe path (IndexedDB + service-worker cache) while keeping you logged in. Code: `frontend/src/lib/stores/auth.ts:188-204` (`clearLocalCache`). The button is always available — it is your action to invoke regardless of the displayed cache count.

### 4. Service worker cache

Same wipe contract as IndexedDB on logout — every cache whose key starts with `ciphra-` is deleted. SvelteKit currently ships render-only HTML shells via the SW, so today there is no patient data sitting in this cache; the wipe is defensive against future loader-injected content. Code: `frontend/src/lib/stores/auth.ts:142-149`.

### 5. Small preference + bookkeeping keys (no health data)

A handful of plain-string keys that hold UI state, not patient data, and are not part of the wipe contract above:

- `localStorage.ciphra_theme` — `light` / `dark` / `system` display preference.
- `localStorage.ciphra_welcome_web_seen`, `ciphra_welcome_migrate_seen`, `ciphra_migrate_tour_seen` — one-shot "already saw this intro" flags (`1`).
- `localStorage.ciphra_migrate_done:<source>:<token>` — migration resume checkpoint: the list of already-imported document ids for a given import run, so an interrupted migration can continue without duplicates. Contains document *ids* and the one-time export token, no entry content; removed when the import completes.
- `sessionStorage.ciphra_focus_month` — the `YYYY-MM` month you were last browsing, so calendar and reports stay on the same month within a tab.

### What this means in practice

If your device is yours alone and locked when you walk away, the IndexedDB cache buys you faster page loads at no real-world cost. If a roommate, partner, hotel housekeeper, IT department, or border officer can sit at your unlocked browser, the cache is one of several things they can read. The structural defenses (sessionStorage-bound master key, logout wipe, "Clear local cache" button) bound the exposure; they do not eliminate it.

We will not pretend otherwise.

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
5. Open browser DevTools → Application → Storage. Confirm:
   - `localStorage` → key `ciphra_auth` contains JWT + encrypted-vault metadata, no plaintext.
   - `sessionStorage` → key `ciphra_master_key` contains a base64 32-byte string while logged in; gone after browser close.
   - `IndexedDB` → `ciphra_cache` / `decrypted_documents` contains plaintext document JSON while logged in; **the entire database is gone after clicking Abmelden**.

If anything in this document is contradicted by the code, please file an issue or email security. The code is the truth; this document tries to describe it accurately.
