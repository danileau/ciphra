/**
 * vitest stub for `$env/dynamic/public`.
 *
 * The real module is provided by the SvelteKit *server* runtime, which
 * reads `process.env` per request. Under vitest (jsdom, no server) the
 * virtual module resolves to code that dereferences a runtime object
 * that does not exist, and any test importing a component that reads
 * public env dies at import time with
 * `TypeError: Cannot read properties of undefined (reading 'env')`.
 *
 * Aliased in `vitest.config.ts`. Deliberately empty: a test must not
 * depend on ambient configuration. Code that needs to assert on a
 * *value* tests the pure resolver (`$lib/source` → `resolveSourceUrl`)
 * with an explicit argument.
 */
export const env: Record<string, string | undefined> = {};
