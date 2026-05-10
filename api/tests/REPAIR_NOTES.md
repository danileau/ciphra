# API Test Repair Notes (PI v21 LB-4b)

Audit trail for the TestLogin / TestRecovery / TestDocuments / TestAdmin /
TestHealth / TestRegister test repairs in `tests/test_api.py`. Per the PI v21
kickoff rule: **if a test reveals a real server-side bug, ticket it
separately rather than silently changing the test to match buggy code.**

## Failure-mode taxonomy

- **Mode 1 — pure fixture drift.** Server response shape or request contract
  changed; test asserts old shape. Test side is wrong, server is correct.
  Safe to update the test.
- **Mode 2 — fixture ordering drift.** Server now executes additional SQL the
  test doesn't queue (MockCursor empty/wrong order). Safe to add fixtures.
- **Mode 3 — REAL SERVER BUG.** Server logic regressed; test correctly
  asserts original contract. **Do not patch the test.** File a separate
  ticket, leave the test failing or skipped with `pytest.mark.skip(reason=)`.
- **Mode 4 — test was always wrong.** Passed accidentally before; rare. Safe
  to fix.

## CIPH-pi21-LB-4b-1 — TestLogin (6 methods)

Live failure capture (`docker compose run --rm api pytest -q tests/test_api.py::TestLogin -v`):
**5 failed, 1 passed.**

Root cause: tests pre-date the zero-knowledge auth refactor. Server now
expects `auth_key` (base64 of 32 bytes; client derives via Argon2 at
`/api/login/init`), not `password`. Tests still POST `password`. Three tests
also `@patch('server.e2e')` for a module attribute that no longer exists —
`server.verify_auth` (`server.py:372`) replaced it.

| Test | Mode | Evidence | Rationale |
|---|---|---|---|
| `test_login_success` | 1 | `server.py:541-543` (auth_key validation), `server.py:566` (verify_auth not e2e), `test_api.py:101` (dead `@patch('server.e2e')`) | Test posts `password`, patches dead attribute; server reads `auth_key` and uses `verify_auth`. Rewrite to model auth_key flow. |
| `test_login_wrong_password` | 1 | same as above; assertion `'Invalid credentials'` is still correct (`server.py:603`) | Same drift; verify path requires `auth_key` and a `verify_auth` patch. |
| `test_login_lockout_after_5_failures` | 1 | `server.py:589-597` (lockout intact); test fails on dead `e2e` patch before reaching server | Lockout-after-5 logic unchanged (server.py:590 `if attempts >= 5`). Test must reach the failure path via valid auth_key + patched `verify_auth → False`. |
| `test_login_already_locked` | 1 | `server.py:559-564` (lock check intact); test fails with 401 because no auth_key in request | Lock-check intact; test needs valid auth_key so request passes the validation gate and hits the locked-until branch. |
| `test_login_nonexistent_user` | 4 (incidental pass) | currently passes — but for the wrong reason: validation gate (`server.py:543`) returns 401 before SELECT | Currently green because `auth_key=None` short-circuits to 401, which matches the test's `assert resp.status_code == 401`. Rewrite to genuinely exercise the no-user path (queue `None` AFTER auth_key validation passes). |
| `test_login_missing_fields` | 1 | `server.py:542-543` returns 401 (auth_key missing); test expects 400 | The "missing fields" semantics were lost — the route now treats missing auth_key as invalid credentials, not malformed request. **Decision: update test to expect 401**, since the current 401 response is consistent with the anti-enumeration policy at `server.py:518` ("always returns params (fake for unknown users) to prevent enumeration"). Returning 400 on missing auth_key would leak the existence-vs-absence signal a 401 hides. |

**Mode-3 ALERT:** none. All 5 failures are test-side drift; lockout-after-5
and locked-until logic are intact in current `server.py`.

**Cross-check vs LB-8 SECURITY.md drift test:** the lockout count is stable at
5 in `server.py:590`. If the LB-8 drift test passes (vitest 865/865 baseline
includes it), that confirms doc and code agree on the lockout policy — strong
evidence the test failures are not hiding code-side regressions.

## CIPH-pi21-LB-4b-2 — TestRecovery + TestValidateRecovery

Live failure capture (pre-rewrite): 6 failed in TestRecovery, 2 failed in
TestValidateRecovery. **8 tests total → 4 pass + 4 skip after rewrite.**

Two structural findings before per-test classification:

- **`/api/validate-recovery` endpoint is gone.** No matches in `api/server.py`
  for the route name, the `validate_recovery` function, or `RecoveryCode`
  imports. Recovery-code format validation moved entirely client-side to
  `frontend/src/lib/wordlist.ts:validateRecoveryCode` (only caller:
  `frontend/src/routes/login/+page.svelte:81`).
- **`server.RecoveryCode` attribute does not exist.** `RecoveryCode` lives in
  `api/e2e_encryption.py:104` but `server.py` doesn't import it. All 4 tests
  with `@patch('server.RecoveryCode')` would AttributeError at run time.

Recovery contract changed in the same zero-knowledge refactor that hit
TestLogin: server now reads `recovery_key` (b64-32) + `auth_hash` (b64-32) +
`auth_params` + `vault_params` + `encrypted_master`. Server never sees the
recovery-code phrase or the new password — client decrypts/re-wraps locally
using `recovery_params` from `/api/recover/init`.

| Test | Mode | Evidence | Rationale |
|---|---|---|---|
| `test_recovery_success` | 1 | `server.py:801` (validation gate), `server.py:831` (verify_auth not e2e) | Tests post `recovery_code`+`new_password`; server expects `recovery_key`+`auth_hash`. Rewrite to current contract; patch `verify_auth → True`. |
| `test_recovery_missing_fields` | 1 | `server.py:801-802` returns 401 not 400 | Anti-enumeration: missing `recovery_key`/`auth_hash` collapses to 401 "Invalid credentials," same response as bad code. Update expected status. |
| `test_recovery_invalid_code_format` | 1 (skip) | `frontend/src/lib/wordlist.ts:78` | Code format validation moved client-side. No server surface to test. **Skipped** with rationale. PI v22 follow-up: vitest coverage for `validateRecoveryCode`. |
| `test_recovery_wrong_code` | 1 | `server.py:831, 846` | Patch `verify_auth → False`, queue user with `recovery_auth` set. Reaches the failed-attempt branch and returns 401 "Invalid recovery code." |
| `test_recovery_not_enabled` | 1 | `server.py:820-821` | Anti-enumeration collapsed "no recovery configured" into 401 "Invalid recovery code" (used to be 400 "not enabled"). Update test assertions to match — purpose preserved (verify the no-recovery branch reaches the collapsed response). |
| `test_recovery_short_password` | 1 (skip) | client-side; server never sees the new password | Server contract carries only `auth_hash` + re-wrapped `encrypted_master`. No password-length surface to test. **Skipped** with rationale. |
| `test_validate_valid_code` | 1 (skip) | endpoint removed | `/api/validate-recovery` gone; `RecoveryCode` not imported by server. **Skipped** at class level. |
| `test_validate_invalid_code` | 1 (skip) | endpoint removed | Same as above. |

**Mode-3 ALERT:** none. All test failures trace to the zero-knowledge
refactor; no server-side regression detected.

**Anti-enumeration policy is the load-bearing semantic change.** Two pre-PI
test assertions (`test_recovery_missing_fields` 400→401,
`test_recovery_not_enabled` "not enabled" → "Invalid recovery code") had to
update because the server deliberately collapses distinguishable error states
into one response. This is the docs-promised behavior, not a regression.

## CIPH-pi21-LB-4b-3 — TestDocuments + TestDocumentsAuth

Live failure capture (pre-rewrite): 4 failed in TestDocuments
(`test_store_document`, `test_get_documents`, `test_update_document`,
`test_delete_document`). TestDocumentsAuth fully passing.

**Single root cause across all 4 failures:** `token_required` middleware now
calls `_current_password_version` (`server.py:243-249`) which runs
`SELECT password_version` + `fetchone` **before every authenticated route
runs**. Tests written before this middleware extension queue only the
route's own rows, so the pwd_version fetchone consumes the first queued row
and the route gets `None` from its own fetchone.

This is global drift across every authenticated test. The fix is
ordering-only — every authenticated test must queue `PWD_VERSION_ROW` first.
Module-level constant `PWD_VERSION_ROW = {'password_version': 1}` introduced
to make the contract visible at the call site.

| Test | Mode | Evidence | Rationale |
|---|---|---|---|
| `test_store_document` | 2 | `server.py:243-249` (pwd_version), `server.py:626` (COUNT before INSERT) | Two extra fetchones now: token's pwd_version + new quota COUNT. Queue order: pwd_version → COUNT → INSERT. |
| `test_get_documents` | 2 | `server.py:243-249` | Token's pwd_version eats the queued list before fetchall reaches it. Queue pwd_version first. |
| `test_update_document` | 2 | `server.py:243-249` | Token eats `{'id': 5}`, UPDATE RETURNING fetchone gets None → 404. Queue pwd_version first. |
| `test_delete_document` | 2 | `server.py:243-249` | Same as update. |

**Mode-3 ALERT:** none. Pure fixture-ordering drift caused by the new token
freshness gate (PI v15 password-change → token-invalidation feature). The
quota COUNT in `test_store_document` is also new (DOC_QUOTA_PER_USER from
PI v9-era — kicks in at 8000 docs; `{'n': 0}` is sufficient fixture).

**Why 3 of 7 tests in the class were already passing:**
`test_store_document_no_data` returns 400 before any DB access (defensive
short-circuit). `test_update_document_not_found` and
`test_delete_document_not_found` queue `None` — pwd_version's `try/except`
falls back to version 1 on the type error from `None['password_version']`,
token check passes, and the route's UPDATE/DELETE fetchone gets None from
the empty queue → 404. Coincidentally correct. Updated to queue
`PWD_VERSION_ROW` explicitly so the path is no longer accidental.

## CIPH-pi21-LB-4b-4 — TestAdmin

Live failure capture (pre-rewrite): 8 of 13 failed. **All 8 are the same
Mode 2 fixture-ordering drift as LB-4b-3** — `admin_required` calls
`_decode_and_verify_token` → `_current_password_version` → fetchone before
the route runs.

The 5 currently-passing tests (`test_admin_*_requires_admin` ×2,
`test_admin_cannot_*_self` ×3) work via the `_current_password_version`
exception fallback to version 1 (`server.py:250-251`): mock_db is empty,
fetchone returns None, `int(None['password_version'])` raises, fallback
returns 1, token's `pv=1` matches. Left untouched per "don't refactor what
already works" — keeping the test surface stable minimizes diff noise.

| Test | Mode | Evidence | Rationale |
|---|---|---|---|
| `test_admin_stats_success` | 2 | `server.py:243-249` | Token's pwd_version eats first count row, leaving 7 of 8 stats queries fed → 8th fetchone returns None → 500. Queue PWD_VERSION_ROW first. |
| `test_admin_users_success` | 2 | `server.py:243-249` | pwd_version eats the user list → fetchall returns []. Queue PWD_VERSION_ROW first. |
| `test_admin_lock_user` | 2 | `server.py:243-249, 1071-1073` | pwd_version eats the user-found row → SELECT returns None → 404. Queue PWD_VERSION_ROW first. |
| `test_admin_unlock_user` | 2 | `server.py:243-249, 1093-1095` | Same pattern. |
| `test_admin_delete_user` | 2 | `server.py:243-249, 1115-1118` | Same pattern. |
| `test_admin_promote_user` | 2 | `server.py:243-249, 1140-1143` | Same pattern. |
| `test_admin_demote_user` | 2 | `server.py:243-249, 1160-1163` | Same pattern. |
| `test_admin_audit_log` | 2 | `server.py:243-249, 1185` | Same pattern. |

**Mode-3 ALERT:** none. Pure middleware-driven fixture-ordering drift; admin
route logic is unchanged across the entire class.

## CIPH-pi21-LB-4b-5 — TestRegister (TestHealth pre-passing, dropped from scope)

Live failure capture (pre-rewrite): 4 of 5 failed in TestRegister; TestHealth
fully passing.

Same zero-knowledge contract drift as TestLogin/TestRecovery: tests post
`password`; server expects a pre-built vault bundle (`auth_hash` + the four
encrypted blobs). Server never sees the password — client derives auth_hash
locally via Argon2 + ships the re-wrapped master_key.

| Test | Mode | Evidence | Rationale |
|---|---|---|---|
| `test_register_success` | 1 | `server.py:445-451` (bundle fields), `server.py:492` (response shape) | Drop dead `@patch('server.e2e')`; post `_register_bundle()`; server returns `{success, username, user_id}` — no `recovery_code` (client generates). |
| `test_register_short_username` | 1 | `server.py:453-454` | Test was failing on auth_hash validation, not username. Send valid bundle so the USERNAME_RE check is the actual short-circuit. |
| `test_register_short_password` | 1 (skip) | client-side; server never sees the password | Server contract carries only client-derived material. **Skipped** with rationale. |
| `test_register_duplicate_username` | 1 | `server.py:472-478` | Send valid bundle to reach the SELECT; queue duplicate row. Error string changed from "already exists" to generic `'registration_failed'` (anti-enumeration). |

**Mode-3 ALERT:** none. All failures trace to the same zero-knowledge vault
contract.

**TestHealth scope drop:** PI v21 plan paired TestHealth + TestRegister as
LB-4b-5 lifecycle stragglers. TestHealth was already green pre-PI; no work
needed. Out-of-scope-discipline: not touched.

---

## Sprint 1 final status

`docker compose run --rm api pytest -q tests/` → **48 passed, 5 skipped, 0 failed.**

All 5 skipped tests have explicit `pytest.mark.skip(reason=...)` documenting:
- where the surface moved (file:line in frontend/src or server.py)
- the PI v22 follow-up if a coverage gap was created (e.g. vitest for
  `validateRecoveryCode`).

**Mode-3 (real server bug) findings across all 5 stories: zero.** All 29
failing tests traced to the zero-knowledge auth refactor (TestLogin/Recovery/
Register), the new `_current_password_version` token-freshness gate
(TestDocuments/Admin), or removed surface (TestValidateRecovery,
recovery-code format / password-length client-side moves).
