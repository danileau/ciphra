import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    plugins: [sveltekit()],
    // Svelte 5 ships separate client/server builds selected via export
    // conditions. Without 'browser', vitest resolves the SERVER build and
    // every component render dies with "mount(...) is not available on the
    // server" — which silently broke all component tests after the Svelte 5
    // bump (2026-06-07). jsdom tests are browser tests; say so.
    resolve: {
        conditions: ['browser'],
        alias: {
            // `$env/dynamic/public` is a SvelteKit *server*-runtime module.
            // Under vitest it resolves to code that dereferences a runtime
            // object that isn't there, so importing any component which reads
            // public env fails at import time. Point it at an empty stub —
            // see src/lib/testing/env-dynamic-public.ts.
            '$env/dynamic/public': fileURLToPath(
                new URL('./src/lib/testing/env-dynamic-public.ts', import.meta.url),
            ),
        },
    },
    test: {
        include: ['src/**/*.test.ts'],
        environment: 'jsdom',
        // jsdom shims (Element.animate for Svelte 5 transitions).
        setupFiles: ['./src/vitest-setup.ts'],
    },
});
