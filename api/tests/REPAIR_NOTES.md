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

(pending — Sprint 1)

## CIPH-pi21-LB-4b-4 — TestAdmin

(pending — Sprint 1)

## CIPH-pi21-LB-4b-5 — TestHealth + TestRegister

(pending — Sprint 1; brings full file to 45/45 green at PI v21 close)
