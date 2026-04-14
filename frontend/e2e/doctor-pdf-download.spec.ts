/**
 * CIPH-741 / CIPH-751 — doctor PDF export happy path: assert a PDF download.
 *
 * Signs up a fresh user, clicks the doctor PDF export on the dashboard, and
 * asserts a download is triggered. We do not parse the PDF contents.
 *
 * NOTE: the export button is disabled when there are no documents. If this
 * fails because the fresh user has no docs, the export button will be
 * disabled; create a doc first. For now, run after at least one quick-add.
 */
import { test, expect } from '@playwright/test';

test.setTimeout(120_000);

test('doctor PDF export triggers a download', async ({ page }) => {
    const user = 'e2e_' + Math.random().toString(36).slice(2, 10);
    const pass = 'Test$12345_';

    await page.goto('/login?mode=register');
    await page.locator('#signup-user').fill(user);
    await page.locator('#signup-pass').fill(pass);
    await page.locator('#signup-pass2').fill(pass);
    await page.getByTestId('register-submit').click();

    await page.getByTestId('recovery-code-display').waitFor({ timeout: 30_000 });
    await page.getByTestId('recovery-ack-checkbox').check();
    await page.getByTestId('recovery-continue').click();

    await expect(page).toHaveURL(/\/(\?.*)?$/);

    // Seed one doc so the export button enables.
    await page.getByTestId('fab-quickadd').first().click();
    await page.getByTestId('quickadd-mode-log').click();
    await page.getByTestId('quickadd-note').fill('e2e-seed-for-pdf');
    await page.getByTestId('quickadd-save').click();
    // Sheet auto-closes on save; small settle.
    await page.waitForTimeout(500);

    const exportBtn = page.getByTestId('export-doctor-pdf');
    await expect(exportBtn).toBeEnabled({ timeout: 10_000 });

    const [download] = await Promise.all([
        page.waitForEvent('download'),
        exportBtn.click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
});
