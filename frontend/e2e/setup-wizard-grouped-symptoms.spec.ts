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
import { registerNewUser } from './_helpers/testUser';

test.setTimeout(120_000);

test('setup wizard: asthma grouped-symptoms toggle off (CIPH-740)', async ({ page }) => {
    // CIPH-pi20-LB-3 — shared registration helper. Wizard flow stays inline
    // because the test asserts mid-wizard state (group drill-in toggle).
    await registerNewUser(page);

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
