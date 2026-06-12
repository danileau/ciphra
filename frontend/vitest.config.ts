import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
    plugins: [sveltekit()],
    // Svelte 5 ships separate client/server builds selected via export
    // conditions. Without 'browser', vitest resolves the SERVER build and
    // every component render dies with "mount(...) is not available on the
    // server" — which silently broke all component tests after the Svelte 5
    // bump (2026-06-07). jsdom tests are browser tests; say so.
    resolve: {
        conditions: ['browser'],
    },
    test: {
        include: ['src/**/*.test.ts'],
        environment: 'jsdom',
        // jsdom shims (Element.animate for Svelte 5 transitions).
        setupFiles: ['./src/vitest-setup.ts'],
    },
});
