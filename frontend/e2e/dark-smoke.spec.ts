/**
 * Dark-theme visual smoke (design review 2026-06-11, Phase 7).
 *
 * Same discipline as visual-smoke.spec.ts, dark variant: registers a
 * fresh user with `ciphra_theme=dark` pre-seeded, walks the high-value
 * surfaces, and emits PNGs to `e2e/_screenshots/dark/` for a human
 * scroll-through. Catches what the token tests can't: stranded white
 * fills, alpha tints over the wrong base, illegible chart chrome.
 *
 * Run: `npx playwright test e2e/dark-smoke.spec.ts`
 */

import { test } from '@playwright/test';
import { TEST_PASSWORD } from './_helpers/testUser';

test.setTimeout(180_000);
test.describe.configure({ mode: 'serial' });

const ROUTES = ['/', '/log/today', '/journal', '/calendar', '/reports', '/settings'] as const;

test('dark smoke — discrete cohort, mobile + desktop', async ({ page }) => {
	// Pre-seed the preference so app.html applies dark before first paint.
	await page.addInitScript(() => localStorage.setItem('ciphra_theme', 'dark'));

	const user = 'dark_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto('/login?mode=register');
	await page.screenshot({ path: 'e2e/_screenshots/dark/desktop-login.png', fullPage: true });

	await page.locator('#signup-user').fill(user);
	await page.locator('#signup-pass').fill(TEST_PASSWORD);
	await page.locator('#signup-pass2').fill(TEST_PASSWORD);
	await page.getByTestId('register-submit').click();
	await page.getByTestId('recovery-code-display').waitFor({ timeout: 30_000 });
	await page.getByTestId('recovery-ack-checkbox').check();
	await page.getByTestId('recovery-continue').click();

	// Setup wizard: role step (SSR'd — retry until hydration), preset, next×N.
	await page.goto('/setup');
	const roleSelf = page.getByText(
		/track my own health|eigene gesundheit dokumentieren|documenter ma propre santé|documentare la mia salute/i,
	);
	const presetTile = page.getByText(/epilepsy|epilepsie|epilessia/i).first();
	for (let attempt = 0; attempt < 8; attempt++) {
		if (await presetTile.count()) break;
		if (await roleSelf.count()) await roleSelf.first().click();
		await page.waitForTimeout(500);
	}
	await presetTile.click();
	for (let i = 0; i < 4; i++) {
		const next = page.getByTestId('wizard-next');
		if (await next.count()) {
			await next.first().click();
			await page.waitForTimeout(150);
		}
	}
	const finish = page.getByTestId('wizard-finish');
	if (await finish.count()) await finish.first().click();
	await page.waitForTimeout(500);

	for (const vp of [
		{ name: 'mobile', width: 375, height: 812 },
		{ name: 'desktop', width: 1280, height: 900 },
	]) {
		await page.setViewportSize({ width: vp.width, height: vp.height });
		for (const route of ROUTES) {
			await page.goto(route);
			await page.waitForTimeout(800);
			const slug = route === '/' ? 'dashboard' : route.replace(/\//g, '-').replace(/^-/, '');
			await page.screenshot({
				path: `e2e/_screenshots/dark/${vp.name}-${slug}.png`,
				fullPage: true,
			});
		}
	}

	// Public landing in dark (preference persists across logout contexts).
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto('/settings');
	await page.getByRole('button', { name: /log out|abmelden/i }).first().click();
	await page.waitForTimeout(800);
	await page.goto('/');
	await page.waitForTimeout(800);
	await page.screenshot({ path: 'e2e/_screenshots/dark/desktop-landing.png', fullPage: true });
});
