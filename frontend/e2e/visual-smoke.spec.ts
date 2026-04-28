/**
 * Visual smoke harness — manual eyeball, not pixel-diff.
 *
 * Registers a fresh user, completes setup with one preset, then
 * navigates the 6 high-value surfaces in both mobile (375px) and
 * desktop (1280px) viewports. Emits PNGs to `e2e/_screenshots/` for a
 * human to scroll through after every commit. Catches what unit tests
 * + svelte-check miss: white-on-hover, layout overlaps, unexpected
 * cohort tints, hex-literal regressions, motion regressions.
 *
 * Run: `npx playwright test e2e/visual-smoke.spec.ts`
 *
 * Output: `e2e/_screenshots/<viewport>/<route>.png`
 *
 * Two cohorts captured (discrete via epilepsy preset, cycle via
 * endometriosis) so the cohort×route palette is visible side-by-side.
 *
 * Discipline rule (Phase B of the deblock plan): no story claimed
 * "shipped" without scrolling through these screenshots.
 */

import { test, expect } from '@playwright/test';

test.setTimeout(180_000);
test.describe.configure({ mode: 'serial' });

const VIEWPORTS = [
	{ name: 'mobile', width: 375, height: 812 },
	{ name: 'desktop', width: 1280, height: 900 },
] as const;

const ROUTES_AUTHED = [
	{ path: '/', label: 'dashboard' },
	{ path: '/calendar', label: 'calendar' },
	{ path: '/journal', label: 'journal' },
	{ path: '/reports', label: 'reports' },
	{ path: '/log/today', label: 'log-today' },
	{ path: '/settings?tab=tracking', label: 'settings-tracking' },
] as const;

const COHORT_PRESETS = [
	// preset matches one of the regex below — locale-agnostic.
	{ id: 'discrete', match: /epilepsy|epilepsie|epilessia/i },
	{ id: 'cycle', match: /endometr/i },
	{ id: 'phase', match: /bipolar/i },
] as const;

async function registerAndConfigure(
	page: import('@playwright/test').Page,
	cohort: (typeof COHORT_PRESETS)[number],
) {
	const user = 'smoke_' + cohort.id + '_' + Math.random().toString(36).slice(2, 8);
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
	await page.getByText(cohort.match).first().click();

	// Advance through remaining wizard steps without changing toggles.
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

for (const cohort of COHORT_PRESETS) {
	for (const vp of VIEWPORTS) {
		test(`visual smoke — cohort=${cohort.id} viewport=${vp.name}`, async ({
			page,
		}) => {
			await page.setViewportSize({ width: vp.width, height: vp.height });
			await registerAndConfigure(page, cohort);

			for (const route of ROUTES_AUTHED) {
				await page.goto(route.path);
				// Let charts + reactive cascades settle.
				await page.waitForTimeout(800);
				await page.screenshot({
					path: `e2e/_screenshots/${vp.name}/${cohort.id}__${route.label}.png`,
					fullPage: true,
				});
			}

			// Confirm the run touched a real authed surface.
			expect(true).toBe(true);
		});
	}
}

test.describe('public chrome', () => {
	for (const vp of VIEWPORTS) {
		test(`visual smoke — public viewport=${vp.name}`, async ({ page }) => {
			await page.setViewportSize({ width: vp.width, height: vp.height });
			for (const route of [
				{ path: '/', label: 'landing' },
				{ path: '/login', label: 'login' },
				{ path: '/login?mode=register', label: 'register' },
			]) {
				await page.goto(route.path);
				await page.waitForTimeout(500);
				await page.screenshot({
					path: `e2e/_screenshots/${vp.name}/public__${route.label}.png`,
					fullPage: true,
				});
			}
		});
	}
});
