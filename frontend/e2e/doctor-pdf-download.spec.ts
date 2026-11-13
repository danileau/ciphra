/**
 * CIPH-741 / CIPH-751 - doctor PDF export happy path: assert a PDF download.
 *
 * Signs up a fresh user, adds one entry through quick-add, follows the
 * dashboard's "export for doctor" CTA and asserts a PDF download. We do not
 * parse the PDF contents.
 *
 * Flow history (why this is not the one-click it was written as):
 *  - The dashboard CTA only renders once the user has a blueprint AND at
 *    least one document (`canExport` in Companion.svelte), so the user picks
 *    a preset first.
 *  - pi v24-5d dropped the desktop FAB; quick-add on desktop opens from the
 *    /journal header (see `_helpers/quickAdd.ts`).
 *  - CIPH-873 turned `export-doctor-pdf` from a download button into a link to
 *    `/reports?action=export`, which scrolls to the export cards so the user
 *    picks the period. With one month of data the month card keeps the old
 *    one-click export (pinned in reports-period-picker.spec.ts).
 */
import { test, expect } from '@playwright/test';
import { registerNewUser, selectCohort } from './_helpers/testUser';
import { openQuickAddDesktop } from './_helpers/quickAdd';

test.setTimeout(120_000);

test('doctor PDF export triggers a download', async ({ page }) => {
    // CIPH-pi20-LB-3 - shared helper: 12-char password, registers + clicks
    // through the recovery-code gate, lands on `/`.
    await registerNewUser(page);
    await selectCohort(page, /epilepsy|epilepsie|epilessia/i);

    // Seed one exportable doc. It must be an `entry` (episode chip): the
    // export counts entries only (lib/reports/exportPeriods.ts - "what counts
    // as data"), so a note-only quick-add (an `event`) leaves every export
    // card disabled even though the dashboard CTA appears.
    await openQuickAddDesktop(page);
    await page.getByTestId('quickadd-mode-log').click();
    await page.locator('[data-testid^="quickadd-episode-"]').first().click();
    await page.getByTestId('quickadd-note').fill('e2e-seed-for-pdf');
    await page.getByTestId('quickadd-save').click();
    await expect(page.getByTestId('quickadd-note')).toHaveCount(0, { timeout: 10_000 });

    await page.goto('/');
    const exportCta = page.getByTestId('export-doctor-pdf');
    await expect(exportCta).toBeVisible({ timeout: 30_000 });
    await exportCta.click();
    await expect(page).toHaveURL(/\/reports/);

    const monthCard = page.getByTestId('export-card-month');
    await expect(monthCard).toBeEnabled({ timeout: 30_000 });

    const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 60_000 }),
        monthCard.click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
});
