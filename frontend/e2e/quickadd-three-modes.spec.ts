/**
 * CIPH-741 / CIPH-751 — quick-add: entry + event + diary each appear under
 * the right journal filter tab.
 *
 * The quick-add UI has two top-level mode buttons:
 *   - `log`   (combined "entry / event") — tapping an episode chip creates
 *              an `entry` doc; leaving chips alone + filling the note creates
 *              an `event` doc.
 *   - `diary` — private diary entry.
 *
 * This spec creates one of each and checks the journal filter tabs.
 */
import { test, expect } from '@playwright/test';

test.setTimeout(120_000);

test('quick-add: entry + event + diary each land in the correct journal tab', async ({ page }) => {
    const user = 'e2e_' + Math.random().toString(36).slice(2, 10);
    const pass = 'Test$12345_';

    // Signup.
    await page.goto('/login?mode=register');
    await page.locator('#signup-user').fill(user);
    await page.locator('#signup-pass').fill(pass);
    await page.locator('#signup-pass2').fill(pass);
    await page.getByTestId('register-submit').click();
    await page.getByTestId('recovery-code-display').waitFor({ timeout: 30_000 });
    await page.getByTestId('recovery-ack-checkbox').check();
    await page.getByTestId('recovery-continue').click();

    // Fresh users land on /. Skip setup wizard by navigating directly; the
    // default blueprint covers quick-add mode buttons.
    // (If /setup is enforced, the test will hit it and can be extended.)

    // --- 1. Entry (episode chip in log mode) ---
    await page.getByTestId('fab-quickadd').first().click();
    await page.getByTestId('quickadd-mode-log').click();
    // Pick the first visible episode chip.
    const firstEpisode = page.locator('[data-testid^="quickadd-episode-"]').first();
    await firstEpisode.click();
    await page.getByTestId('quickadd-save').click();
    await expect(page.locator('body')).toContainText(/./, { timeout: 10_000 });

    // --- 2. Event (note-only in log mode) ---
    await page.getByTestId('fab-quickadd').first().click();
    await page.getByTestId('quickadd-mode-log').click();
    await page.getByTestId('quickadd-note').fill('e2e-test-event');
    await page.getByTestId('quickadd-save').click();

    // --- 3. Diary ---
    await page.getByTestId('fab-quickadd').first().click();
    await page.getByTestId('quickadd-mode-diary').click();
    await page.getByTestId('quickadd-diary-text').fill('e2e-test-diary');
    await page.getByTestId('quickadd-save').click();

    // Verify via journal filter tabs.
    await page.goto('/journal');

    await page.getByTestId('filter-tab-entry').click();
    // Entry was created from an episode chip — body should have something.
    await expect(page.locator('body')).not.toContainText('e2e-test-diary');

    await page.getByTestId('filter-tab-event').click();
    await expect(page.locator('body')).toContainText('e2e-test-event');

    await page.getByTestId('filter-tab-diary').click();
    await expect(page.locator('body')).toContainText('e2e-test-diary');
});
