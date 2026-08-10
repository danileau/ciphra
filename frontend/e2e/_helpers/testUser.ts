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
	// The wizard gained a step 0 ("How will you use ciphra?") after this helper
	// was written, so the condition list is one click further in than it used
	// to be. Without this the helper silently timed out on every caller.
	const ownHealth = page.getByRole('button', {
		name: /Track my own health|Meine eigene Gesundheit/i,
	});
	const presetStep = page.getByRole('heading', {
		name: /What would you like to track|Was möchtest du/i,
	});

	// NEVER gate on count() straight after goto(): it resolves before Svelte
	// has rendered, reports 0, and the step is silently skipped — which is
	// exactly how this helper failed. Wait for whichever step is showing.
	await Promise.race([
		ownHealth.first().waitFor({ timeout: 30_000 }),
		presetStep.waitFor({ timeout: 30_000 }),
	]).catch(() => { /* the assertion below reports the real problem */ });

	if (await ownHealth.first().isVisible().catch(() => false)) {
		await ownHealth.first().click();
	}
	await presetStep.waitFor({ timeout: 30_000 });
	// Match the button by its inner text. `getByRole(name:)` is unreliable
	// here: the card's accessible name is the flattened label + description,
	// and the preset heading sits in a nested <h3>.
	await page.locator('button').filter({ hasText: cohortMatch }).first().click();
	// Walk to the end. The wizard grew steps over time, so loop until the
	// finish button appears rather than assuming a fixed count — and then
	// wait for it to actually leave /setup, because a helper that returns
	// while the blueprint has not been saved makes its caller assert against
	// a state that never existed.
	const finish = page.getByTestId('wizard-finish');
	for (let i = 0; i < 10 && !(await finish.isVisible().catch(() => false)); i++) {
		const next = page.getByTestId('wizard-next');
		if (!(await next.first().isVisible().catch(() => false))) break;
		await next.first().click();
		await page.waitForTimeout(200);
	}
	if (await finish.isVisible().catch(() => false)) {
		await finish.click();
		await page.waitForURL((u) => !u.pathname.startsWith('/setup'), { timeout: 60_000 });
	}
}
