/**
 * CIPH-741 / CIPH-751 — epilepc → ciphra migration happy path.
 *
 * Requires the api running with `CIPHRA_DEV_MOCKS=1` so the mock bundle
 * route is available. Enable by running:
 *
 *   CIPHRA_DEV_MOCKS=1 flask run           # or however the api starts
 *   PLAYWRIGHT_RUN_MIGRATE=1 npm run test:e2e
 *
 * We skip unless PLAYWRIGHT_RUN_MIGRATE=1 is set, because the dev mock
 * route is off by default.
 */
import { test, expect } from '@playwright/test';
import { TEST_PASSWORD, randUser } from './_helpers/testUser';
import { allowConnectOrigins, bothSchemes } from './_support/cspRelax';

const runMigrate = !!process.env.PLAYWRIGHT_RUN_MIGRATE;

test.skip(!runMigrate, 'set PLAYWRIGHT_RUN_MIGRATE=1 + CIPHRA_DEV_MOCKS=1 to run');

test.setTimeout(120_000);

/**
 * INC-001 — this spec could not pass as written, and had not been able to
 * since CSP hardening (Track 3 P0 3.1) shipped.
 *
 * ciphra's `connect-src` names only the production epilepc hosts, so the
 * bundle fetch to `localhost:5000` was refused inside the renderer. It never
 * reached the mock, and it failed with the same `TypeError: Failed to fetch`
 * that a genuine source outage produces. Being gated behind
 * PLAYWRIGHT_RUN_MIGRATE, nobody saw it go quiet — which is a large part of
 * why the apex/www misconfiguration reached a real user unnoticed.
 *
 * Chromium 149 also refuses loopback fetches by default (Local Network
 * Access), reporting the refusal as a CORS error; neither restriction applies
 * to a production migration across public origins.
 */
const MOCK_SOURCE = process.env.CIPHRA_MOCK_SOURCE || 'localhost:5050';

test.use({
    launchOptions: {
        args: ['--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks'],
    },
});

test('migrate: dev-typical bundle → epilepsy blueprint + /today', async ({ page }) => {
    await allowConnectOrigins(page, bothSchemes(MOCK_SOURCE));
    await page.goto(`/migrate#migrate=dev-typical&source=${MOCK_SOURCE}`);

    // Inline SignupFlow on the migrate page (not /login) — can't reuse
    // registerNewUser which navigates to /login?mode=register.
    const user = randUser('e2e_mig_');
    const pass = TEST_PASSWORD;
    await page.locator('#signup-user').fill(user);
    await page.locator('#signup-pass').fill(pass);
    await page.locator('#signup-pass2').fill(pass);
    await page.getByTestId('register-submit').click();

    await page.getByTestId('recovery-code-display').waitFor({ timeout: 30_000 });
    await page.getByTestId('recovery-ack-checkbox').check();
    await page.getByTestId('recovery-continue').click();

    // Origin-confirmation gate.
    await page.locator('input[type="checkbox"]').check();
    await page.getByTestId('migrate-confirm-origin').click();

    // Bundle preview → import.
    await page.getByTestId('migrate-confirm-import').click();

    await expect(page).toHaveURL(/\/(log\/)?today/i, { timeout: 30_000 });
});
