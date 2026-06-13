import { defineConfig, devices } from '@playwright/test';

/**
 * ciphra — Playwright config (CIPH-741).
 *
 * By default we drive a local dev server on :5173. In CI we expect the
 * dev server to already be running (the workflow brings it up). Locally
 * you can `npm run dev` in one shell and `npm run test:e2e` in another.
 *
 * Tests that depend on the api (migrate flow, seeded users) have their
 * own skip gates — see per-spec comments.
 */
export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: 'list',
    use: {
        baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
        trace: 'retain-on-failure',
        // Allow driving the self-signed HTTPS dev server (DEV_HTTPS=1) used for
        // on-device crypto testing. Harmless for the default http baseURL.
        ignoreHTTPSErrors: true,
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        // Mobile Safari (WebKit) — the engine real iPhone users run, where
        // iOS-only layout bugs (safe-area, 100vw, font-scaling overflow) that
        // Desktop Chrome never shows actually surface. Scoped to the mobile
        // overflow hunt so it doesn't double the whole e2e suite.
        {
            name: 'mobile-webkit',
            testMatch: /mobile-overflow\.spec\.ts/,
            use: { ...devices['iPhone 13'] },
        },
    ],
    webServer: process.env.PLAYWRIGHT_NO_WEBSERVER
        ? undefined
        : {
              command: 'npm run dev',
              url: 'http://localhost:5173',
              reuseExistingServer: !process.env.CI,
              timeout: 120_000,
          },
});
