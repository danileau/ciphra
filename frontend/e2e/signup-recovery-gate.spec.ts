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

function randUser() {
    return 'e2e_' + Math.random().toString(36).slice(2, 10);
}

// argon2 vault creation in the browser can take 10–20s per sign-up in dev.
test.setTimeout(90_000);

// CIPH-751 — testid-driven selectors so this test is locale-independent.
test('signup → recovery gate → /', async ({ page }) => {
    const user = randUser();
    const pass = 'Test$12345_';

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
