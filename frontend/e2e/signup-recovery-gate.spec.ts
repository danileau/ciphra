/**
 * CIPH-741 — signup happy path with mandatory recovery-code gate.
 *
 * Visits /login, switches to the register tab, signs up a random user,
 * verifies the recovery code screen, that the Continue button is disabled
 * until the acknowledgment checkbox is ticked, then continues and lands
 * on /.
 *
 * Requires the api to be reachable at /api/* (dev server proxies).
 */
import { test, expect } from '@playwright/test';
import { TEST_PASSWORD, randUser } from './_helpers/testUser';

// argon2 vault creation in the browser can take 10–20s per sign-up in dev.
test.setTimeout(90_000);

// CIPH-751 — testid-driven selectors so this test is locale-independent.
// CIPH-pi20-LB-3 — does NOT use registerNewUser() because the test asserts
// the gate's intermediate state (button disabled before checkbox); inlining
// the registration flow lets us add those assertions between steps.
test('signup → recovery gate → /', async ({ page }) => {
    const user = randUser();
    const pass = TEST_PASSWORD;

    await page.goto('/login?mode=register');

    await page.locator('#signup-user').fill(user);
    await page.locator('#signup-pass').fill(pass);
    await page.locator('#signup-pass2').fill(pass);

    page.on('pageerror', (e) => console.log('[pageerror]', e.message));
    page.on('console', (msg) => {
        if (msg.type() === 'error') console.log('[console.error]', msg.text());
    });

    await page.getByTestId('register-submit').click();

    const code = page.getByTestId('recovery-code-display');
    await expect(code).toBeVisible({ timeout: 30_000 });

    const checkbox = page.getByTestId('recovery-ack-checkbox');
    const proceed = page.getByTestId('recovery-continue');

    await expect(proceed).toBeDisabled();
    await checkbox.check();
    await expect(proceed).toBeEnabled();
    await proceed.click();

    await expect(page).toHaveURL(/\/(\?.*)?$/, { timeout: 15_000 });
});
