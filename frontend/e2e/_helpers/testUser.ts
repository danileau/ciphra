/**
 * CIPH-pi20-LB-3 — shared E2E test-user fixtures.
 *
 * Centralises password + registration flow so a future password-floor
 * change (today: 12 chars) only touches this file. The legacy 11-char
 * `'Test$12345_'` literal scattered across specs failed the SignupFlow
 * `password.length < 12` gate (FULL_REVIEW 2026-05-05 P0.2), leaving
 * the populated-flow assertions never reached.
 */
import type { Page } from '@playwright/test';

/** Password meeting the current UI floor (`SignupFlow.svelte:83`). */
export const TEST_PASSWORD = 'Test$12345_!';

/** Random username suitable for fresh-user registration. */
export function randUser(prefix = 'e2e_'): string {
	return prefix + Math.random().toString(36).slice(2, 10);
}

/**
 * Register a fresh user and click through the recovery-code gate.
 * Lands on `/`. Returns the chosen username for subsequent steps.
 */
export async function registerNewUser(
	page: Page,
	opts: { prefix?: string } = {},
): Promise<string> {
	const user = randUser(opts.prefix);
	await page.goto('/login?mode=register');
	await page.locator('#signup-user').fill(user);
	await page.locator('#signup-pass').fill(TEST_PASSWORD);
	await page.locator('#signup-pass2').fill(TEST_PASSWORD);
	await page.getByTestId('register-submit').click();
	await page.getByTestId('recovery-code-display').waitFor({ timeout: 30_000 });
	await page.getByTestId('recovery-ack-checkbox').check();
	await page.getByTestId('recovery-continue').click();
	return user;
}

/**
 * Walk through `/setup`: pick the first cohort preset whose label
 * matches `cohortMatch`, then advance all wizard steps with default
 * toggles. Locale-agnostic via the regex.
 */
export async function selectCohort(page: Page, cohortMatch: RegExp): Promise<void> {
	await page.goto('/setup');
	await page.getByText(cohortMatch).first().click();
	for (let i = 0; i < 4; i++) {
		const next = page.getByTestId('wizard-next');
		if (await next.count()) {
			await next.first().click();
			await page.waitForTimeout(150);
		}
	}
	const finish = page.getByTestId('wizard-finish');
	if (await finish.count()) await finish.first().click();
}
