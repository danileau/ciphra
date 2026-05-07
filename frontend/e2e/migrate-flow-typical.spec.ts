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

const runMigrate = !!process.env.PLAYWRIGHT_RUN_MIGRATE;

test.skip(!runMigrate, 'set PLAYWRIGHT_RUN_MIGRATE=1 + CIPHRA_DEV_MOCKS=1 to run');

test.setTimeout(120_000);

test('migrate: dev-typical bundle → epilepsy blueprint + /today', async ({ page }) => {
    await page.goto('/migrate#migrate=dev-typical&source=localhost:5000');

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
