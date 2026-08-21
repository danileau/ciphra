/**
 * /reports export period picker — the reported case, end to end.
 *
 * "if there is no data in 2024, but in 2023 and 2025 onclick should show
 *  only this possibilities as available"
 *
 * Seeds entries in two non-adjacent years and asserts the year picker offers
 * exactly those two, never the empty gap year. Unit coverage for the period
 * maths lives in `src/lib/reports/exportPeriods.test.ts`; this spec exists
 * because green units are not a shipped feature — it pins that the cards
 * actually open a picker, that focus and Escape behave, and that a pick
 * produces a PDF named for the calendar period.
 *
 * Needs the api (registration) — same gate as doctor-pdf-download.spec.ts.
 */
import { test, expect, type Page } from '@playwright/test';
import { registerNewUser, selectCohort } from './_helpers/testUser';

test.setTimeout(180_000);

/**
 * Write one entry on `date`.
 *
 * The composer's save button stays disabled until something changes, so we
 * type a note first. Targeted by class rather than testid because
 * EntryComposer has none, and its label flips between `common.save` and
 * `protocol.update` depending on whether the day already has an entry.
 */
async function logEntryOn(page: Page, date: string, note: string) {
	await page.goto(`/log/${date}`);
	const notes = page.locator('textarea').first();
	await notes.waitFor({ timeout: 30_000 });
	await notes.fill(note);
	const save = page.locator('.log-btn-save').first();
	await expect(save).toBeEnabled({ timeout: 10_000 });
	await save.click();
	// The save stamp is the only reliable settle signal.
	await page.waitForTimeout(600);
}

test('year picker offers only the years that hold data', async ({ page }) => {
	await registerNewUser(page);
	await selectCohort(page, /Migräne|Migraine/i);

	await logEntryOn(page, '2023-04-02', 'e2e period picker 2023');
	await logEntryOn(page, '2025-02-11', 'e2e period picker 2025');

	await page.goto('/reports');

	const yearCard = page.getByTestId('export-card-year');
	await expect(yearCard).toBeEnabled({ timeout: 30_000 });
	// Two periods to choose from, so the card opens a picker rather than
	// exporting straight away.
	await expect(yearCard).toHaveAttribute('aria-haspopup', 'listbox');
	await expect(yearCard).toHaveAttribute('aria-expanded', 'false');

	await yearCard.click();
	await expect(page.getByTestId('period-picker')).toBeVisible();
	await expect(yearCard).toHaveAttribute('aria-expanded', 'true');

	const ids = await page.getByTestId('period-option').evaluateAll((els) =>
		els.map((el) => el.getAttribute('data-period-id')),
	);
	// Newest first, and 2024 — which holds nothing — is absent.
	expect(ids).toEqual(['year:2025-12', 'year:2023-12']);

	// Escape closes and hands focus back to the card that opened it.
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('period-picker')).toHaveCount(0);
	await expect(yearCard).toBeFocused();
});

test('2-year card offers sliding pairs, including the one straddling the gap', async ({ page }) => {
	await registerNewUser(page);
	await selectCohort(page, /Migräne|Migraine/i);

	await logEntryOn(page, '2023-04-02', 'e2e pair 2023');
	await logEntryOn(page, '2025-02-11', 'e2e pair 2025');

	await page.goto('/reports');

	const pairCard = page.getByTestId('export-card-2years');
	await expect(pairCard).toBeEnabled({ timeout: 30_000 });
	await pairCard.click();

	const ids = await page.getByTestId('period-option').evaluateAll((els) =>
		els.map((el) => el.getAttribute('data-period-id')),
	);
	// 2024–2025 and 2023–2024: both partly empty, both offered.
	expect(ids).toEqual(['2years:2025-12', '2years:2024-12']);

	// Coverage is stated as a fact about the export. No judgment label —
	// see lib/reports/no-coverage-judgment.test.ts.
	const firstRow = page.getByTestId('period-option').first();
	await expect(firstRow).toContainText(/1\s*(von|of|sur|su)\s*24/);
});

test('picking a year exports a PDF named for the calendar year', async ({ page }) => {
	await registerNewUser(page);
	await selectCohort(page, /Migräne|Migraine/i);

	await logEntryOn(page, '2023-04-02', 'e2e export 2023');
	await logEntryOn(page, '2025-02-11', 'e2e export 2025');

	await page.goto('/reports');
	await page.getByTestId('export-card-year').click();

	const [download] = await Promise.all([
		page.waitForEvent('download', { timeout: 60_000 }),
		page.locator('[data-period-id="year:2023-12"]').click(),
	]);

	// `year-2023`, not the old `year-2023-12` end-month form.
	expect(download.suggestedFilename()).toMatch(/year-2023\.pdf$/i);
});

test('a single available period keeps the old one-click export', async ({ page }) => {
	await registerNewUser(page);
	await selectCohort(page, /Migräne|Migraine/i);

	// One month of data → month card has exactly one period → no picker.
	await logEntryOn(page, '2025-02-11', 'e2e single period');

	await page.goto('/reports');
	const monthCard = page.getByTestId('export-card-month');
	await expect(monthCard).toBeEnabled({ timeout: 30_000 });
	await expect(monthCard).not.toHaveAttribute('aria-haspopup', 'listbox');

	const [download] = await Promise.all([
		page.waitForEvent('download', { timeout: 60_000 }),
		monthCard.click(),
	]);
	expect(download.suggestedFilename()).toMatch(/2025-02\.pdf$/i);
	await expect(page.getByTestId('period-picker')).toHaveCount(0);
});

test('the 2-year card locks when the data covers a single year', async ({ page }) => {
	await registerNewUser(page);
	await selectCohort(page, /Migräne|Migraine/i);

	await logEntryOn(page, '2025-02-11', 'e2e one year only');

	await page.goto('/reports');
	const pairCard = page.getByTestId('export-card-2years');
	await expect(pairCard).toBeDisabled({ timeout: 30_000 });
	// Regression: the old gate was `Date.now() - oldestEntry >= 365`, which
	// unlocked 2 years for a user with three months of stale 2023 data.
	await expect(pairCard).toContainText(
		/zwei Kalenderjahre|two calendar years|deux années civiles|due anni solari/i,
	);
});
