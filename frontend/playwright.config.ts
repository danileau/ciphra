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
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: process.env.PLAYWRIGHT_NO_WEBSERVER
        ? undefined
        : {
              command: 'npm run dev',
              url: 'http://localhost:5173',
              reuseExistingServer: !process.env.CI,
              timeout: 120_000,
          },
});
