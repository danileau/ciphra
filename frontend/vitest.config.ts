import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { ciphraDocs, kitConfig } from './vite.config';

export default defineConfig({
    // ciphraDocs serves `virtual:ciphra-docs`; the root layout reaches
    // lib/docs.ts through lib/seoMeta.ts, so layout tests need it too.
    plugins: [ciphraDocs(), sveltekit(kitConfig)],
    // Svelte 5 ships separate client/server builds selected via export
    // conditions. Without 'browser', vitest resolves the SERVER build and
    // every component render dies with "mount(...) is not available on the
    // server" — which silently broke all component tests after the Svelte 5
    // bump (2026-06-07). jsdom tests are browser tests; say so.
    resolve: {
        conditions: ['browser'],
        // `$app/env/public` is stubbed in src/vitest-setup.ts (vi.mock), not
        // aliased here: SvelteKit 3 registers its own `$app` alias, and Vite
        // gives plugin aliases precedence over the user's.
    },
    test: {
        include: ['src/**/*.test.ts'],
        environment: 'jsdom',
        // jsdom shims (Element.animate for Svelte 5 transitions) and the
        // `$app/env/public` stub.
        setupFiles: ['./src/vitest-setup.ts'],
    },
});
