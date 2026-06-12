import { test, expect } from '@playwright/test';
test('prod landing renders new release', async ({ page }) => {
	await page.goto('https://ciphra.ch/');
	await expect(page.getByText(/Wie wir das beweisen|How we prove it/i).first()).toBeVisible({ timeout: 15000 });
	await expect(page.getByRole('radiogroup').getByRole('radio', { name: /dunkel|dark/i })).toBeVisible();
	await page.screenshot({ path: 'e2e/_screenshots/prod-landing-light.png' });
});
test('prod docs/security renders SECURITY.md incl §5', async ({ page }) => {
	await page.goto('https://ciphra.ch/docs/security');
	await expect(page.getByText(/What the browser stores/i).first()).toBeVisible({ timeout: 15000 });
	await expect(page.getByText(/ciphra_focus_month/i).first()).toBeVisible();
});
test('prod dark mode applies', async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('ciphra_theme', 'dark'));
	await page.goto('https://ciphra.ch/');
	await page.waitForTimeout(1500);
	const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
	console.log('body bg:', bg);
	await page.screenshot({ path: 'e2e/_screenshots/prod-landing-dark.png' });
	if (!bg.includes('24, 19, 16')) throw new Error('dark surface not applied: ' + bg);
});
