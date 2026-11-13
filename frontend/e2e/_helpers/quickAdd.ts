/**
 * Open the global quick-add sheet the way a desktop user does.
 *
 * The specs that use this run on Desktop Chrome (1280px). There the mobile
 * BottomNav - and its centre `fab-quickadd` button - is `md:hidden`, and the
 * separate desktop FAB was removed on purpose in pi v24-5d (8d87637). Its
 * replacement is the `+ Add` button in the /journal header (`journal-add`,
 * `hidden md:inline-flex`), which opens the very same sheet via the
 * `quickAddOpen` store. Driving that button keeps these specs on the real
 * desktop path instead of forcing a mobile viewport.
 */
import { expect, type Page } from '@playwright/test';

export async function openQuickAddDesktop(page: Page): Promise<void> {
	if (!new URL(page.url()).pathname.startsWith('/journal')) {
		await page.goto('/journal');
	}
	const add = page.getByTestId('journal-add');
	await expect(add).toBeVisible({ timeout: 30_000 });
	await add.click();
	await expect(page.getByTestId('quickadd-mode-log')).toBeVisible();
}
