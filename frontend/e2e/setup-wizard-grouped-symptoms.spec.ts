/**
 * CIPH-741 / CIPH-740 — setup wizard: grouped symptoms can be toggled OFF.
 *
 * Picks a condition with grouped symptoms (asthma), drills into a symptom
 * group, toggles one item OFF, finishes the wizard, and verifies /log/today
 * no longer surfaces the disabled symptom.
 *
 * CIPH-751 — now testid-driven (register-submit, wizard-next, wizard-finish,
 * symptom-group-row, symptom-item-toggle). Unblocked by CIPH-740 drill-in fix.
 */
import { test, expect } from '@playwright/test';

test.setTimeout(120_000);

test('setup wizard: asthma grouped-symptoms toggle off (CIPH-740)', async ({ page }) => {
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

    await page.goto('/setup');

    // Pick asthma (locale-agnostic: preset label contains "asthma" across DE/EN/FR/IT).
    await page.getByText(/asthma/i).first().click();

    const groupRow = page.getByTestId('symptom-group-row').first();
    await expect(groupRow).toBeVisible();
    await groupRow.click();

    const firstItem = page.getByTestId('symptom-item-toggle').first();
    const disabledLabel = (await firstItem.textContent())?.trim() || '';
    await firstItem.click();

    // Advance through remaining wizard steps — testid-driven, no locale matching.
    for (let i = 0; i < 3; i++) {
        const next = page.getByTestId('wizard-next');
        if (await next.count()) await next.first().click();
    }
    await page.getByTestId('wizard-finish').click();

    await page.goto('/log/today');
    if (disabledLabel) {
        await expect(page.locator('body')).not.toContainText(disabledLabel);
    }
});
