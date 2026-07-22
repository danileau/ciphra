---
name: green-gate
description: Run ciphra's full pre-push gate — frontend svelte-check + vitest + build, and api pytest — and report a single pass/fail summary. Use before pushing any branch, or when asked "is it green?".
disable-model-invocation: true
---

# green-gate

The rule: **nothing pushes until it's green** (svelte-check + vitest + build for
the frontend, pytest for the api). This skill runs that gate and gives one clear
verdict so you never push a red branch.

## Steps

Run these from the repo root. Report each result; if any step fails, STOP and
surface the failing output — do not proceed to later steps' "pass" as if the
gate passed.

1. **Frontend type-check**
   ```bash
   cd frontend && npm run check
   ```
   Expect `0 errors, 0 warnings`. Warnings count as failures for this gate —
   the project holds a 0-warning bar.

2. **Frontend unit tests**
   ```bash
   cd frontend && npm test
   ```
   Expect all vitest suites passing.

3. **Frontend production build**
   ```bash
   cd frontend && npm run build
   ```
   Expect a clean build (adapter-node, no unresolved imports).

4. **API tests** (only if `api/` changed, or on request)
   ```bash
   cd api && python -m pytest tests/ -q
   ```
   If a local Python env isn't set up, fall back to
   `docker compose run --rm --build api pytest -q`.

## Output

Finish with a compact table:

| Gate | Result |
|------|--------|
| svelte-check | ✅ 0/0 or ❌ N errors |
| vitest | ✅ N passed or ❌ |
| build | ✅ clean or ❌ |
| pytest | ✅ N passed / ⏭ skipped |

Then state plainly: **GREEN — safe to push** or **RED — do not push**, with the
one thing to fix if red. Never soften a red result.
