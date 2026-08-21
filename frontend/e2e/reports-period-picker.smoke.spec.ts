/**
 * Visual smoke for the /reports export period picker.
 *
 * Green units and a passing e2e say the logic is right; they say nothing
 * about whether the panel is legible, clipped, or invisible in dark mode.
 * Emits PNGs to `e2e/_screenshots/period-picker/` for a human look, in the
 * same spirit as visual-smoke.spec.ts / dark-smoke.spec.ts.
 *
 * Run: npx playwright test e2e/reports-period-picker.smoke.spec.ts
 */
import { test, type Page } from '@playwright/test';
import { registerNewUser, selectCohort } from './_helpers/testUser';

test.setTimeout(180_000);

const OUT = 'e2e/_screenshots/period-picker';

async function logEntryOn(page: Page, date: string, note: string) {
	await page.goto(`/log/${date}`);
	const notes = page.locator('textarea').first();
	await notes.waitFor({ timeout: 30_000 });
	await notes.fill(note);
	const save = page.locator('.log-btn-save').first();
	await save.click();
	await page.waitForTimeout(600);
}

async function seed(page: Page) {
	await registerNewUser(page);
	await selectCohort(page, /Migräne|Migraine/i);
	// Two non-adjacent years plus a couple of extra months, so the month
	// picker has enough rows to show scrolling behaviour.
	await logEntryOn(page, '2023-04-02', 'smoke 2023-04');
	await logEntryOn(page, '2023-09-14', 'smoke 2023-09');
	await logEntryOn(page, '2025-02-11', 'smoke 2025-02');
	await logEntryOn(page, '2025-07-03', 'smoke 2025-07');
}

test('period picker — light, desktop', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await seed(page);
	await page.goto('/reports');
	await page.getByTestId('export-card-year').waitFor({ timeout: 30_000 });
	await page.screenshot({ path: `${OUT}/desktop-light-cards.png`, fullPage: false });

	await page.getByTestId('export-card-year').click();
	await page.getByTestId('period-picker').waitFor();
	await page.screenshot({ path: `${OUT}/desktop-light-year-open.png`, fullPage: false });

	// Hover + focus states on a row.
	await page.getByTestId('period-option').nth(1).hover();
	await page.screenshot({ path: `${OUT}/desktop-light-year-hover.png`, fullPage: false });

	await page.keyboard.press('Escape');
	await page.getByTestId('export-card-2years').click();
	await page.getByTestId('period-picker').waitFor();
	await page.screenshot({ path: `${OUT}/desktop-light-2years-open.png`, fullPage: false });

	// The month picker has the most rows — check it scrolls rather than
	// running off the card.
	await page.keyboard.press('Escape');
	await page.getByTestId('export-card-month').click();
	await page.getByTestId('period-picker').waitFor();
	await page.screenshot({ path: `${OUT}/desktop-light-month-open.png`, fullPage: false });
});

test('period picker — dark, desktop', async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('ciphra_theme', 'dark'));
	await page.setViewportSize({ width: 1280, height: 900 });
	await seed(page);
	await page.goto('/reports');
	await page.getByTestId('export-card-year').waitFor({ timeout: 30_000 });
	await page.getByTestId('export-card-year').click();
	await page.getByTestId('period-picker').waitFor();
	await page.screenshot({ path: `${OUT}/desktop-dark-year-open.png`, fullPage: false });
});

test('period picker — mobile bottom sheet', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await seed(page);
	await page.goto('/reports');
	await page.getByTestId('export-card-year').waitFor({ timeout: 30_000 });
	await page.getByTestId('export-card-year').scrollIntoViewIfNeeded();
	await page.screenshot({ path: `${OUT}/mobile-cards.png`, fullPage: false });

	await page.getByTestId('export-card-year').click();
	await page.getByTestId('period-picker').waitFor();
	await page.waitForTimeout(400); // sheet fly-in
	await page.screenshot({ path: `${OUT}/mobile-year-sheet.png`, fullPage: false });
});
