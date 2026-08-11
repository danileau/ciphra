/**
 * INC-001 — migrating into a ciphra account that ALREADY EXISTS.
 *
 * This is the reporter's exact situation, and it was never covered by a test.
 * He registered inside the migrate flow, the fetch failed, and he was left
 * with a real ciphra account holding no data. Any retry therefore has to go
 * through "log in and continue" rather than sign-up.
 *
 * Two things make his case harder than a fresh migration, and both are
 * exercised here:
 *
 *  1. `/migrate` opens on the SIGN-UP form. Entering an existing username must
 *     produce a 409 that the page turns into the resume-login step
 *     (SignupFlow -> `username-exists` -> phase `login-existing`), keeping the
 *     URL-fragment token intact. If that path is broken the user is simply
 *     stuck, because there is no other way into the flow.
 *
 *  2. His account has NO blueprint — registration completed but the import
 *     never ran — and `/` requires one, so ciphra pushes exactly these users
 *     into `/setup`. If he completes the wizard with a non-epilepsy condition
 *     before retrying, the imported seizures land under a blueprint with no
 *     matching episode types: data present, nothing rendered. That is what
 *     `ensureEpisodeTypes` fixes, and this test is what proves it.
 *
 * Run:
 *   PLAYWRIGHT_RUN_MIGRATE=1 npx playwright test migrate-existing-account
 */
import { test, expect, type Page } from '@playwright/test';
import { TEST_PASSWORD, randUser, selectCohort } from './_helpers/testUser';
import {
	EPILEPC_HOST,
	mintMigrationLink,
	parseMigrationLink,
	readTokenRow,
	resetMigrationState,
	withSource,
} from './_helpers/epilepc';
import { allowConnectOrigins, bothSchemes } from './_support/cspRelax';

test.skip(!process.env.PLAYWRIGHT_RUN_MIGRATE, 'needs the epilepc stack');

test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);

test.use({
	launchOptions: {
		args: ['--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks'],
	},
	// Unlike the other migration specs, this one visits ciphra BEFORE the
	// migrate page (it has to: the account must already exist). That installs
	// the service worker, which then serves the /migrate document from cache
	// and bypasses page.route() — so the CSP relaxation never applies and the
	// bundle fetch is refused by the renderer. Blocking the SW keeps the test
	// measuring the migration, not the cache.
	serviceWorkers: 'block',
});

/** Register on /login — i.e. an account that exists BEFORE any migration. */
async function registerStandalone(page: Page): Promise<string> {
	const user = randUser('e2e_exist_');
	await page.goto('/login?mode=register');
	await page.locator('#signup-user').fill(user);
	await page.locator('#signup-pass').fill(TEST_PASSWORD);
	await page.locator('#signup-pass2').fill(TEST_PASSWORD);
	await page.getByTestId('register-submit').click();
	await page.getByTestId('recovery-code-display').waitFor({ timeout: 60_000 });
	await page.getByTestId('recovery-ack-checkbox').check();
	await page.getByTestId('recovery-continue').click();
	return user;
}

test('an existing account resumes via login and imports correctly', async ({ page }) => {
	test.info().annotations.push({
		type: 'scenario',
		description: 'reporter of INC-001: account already exists, non-epilepsy blueprint',
	});

	resetMigrationState();
	// Register the CSP relaxation before ANY ciphra navigation, so every
	// document this test loads carries it.
	await allowConnectOrigins(page, bothSchemes(EPILEPC_HOST));

	// ── 1. The account exists first, and has been through /setup ─────────
	const username = await registerStandalone(page);
	// Deliberately NOT epilepsy — the wizard offers whatever the user picks,
	// and a stranded migrant is pushed here before they retry.
	await selectCohort(page, /Migräne|Migraine/i);

	// ── 2. Log out, so the migrate link opens on the sign-up form ────────
	await page.getByRole('button', { name: /Log out|Abmelden/i }).click();
	// Assert the STATE (logged out), not a particular landing URL — the app
	// may send a logged-out user to / or /login depending on where they were.
	await expect(page.getByRole('button', { name: /Log out|Abmelden/i })).toHaveCount(0, {
		timeout: 30_000,
	});

	// ── 3. Open a real migration link ────────────────────────────────────
	const link = await mintMigrationLink(page);
	const { token } = parseMigrationLink(link);
	await page.goto(withSource(link, token, EPILEPC_HOST));

	// ── 4. Entering the EXISTING username must offer resume-login ────────
	await page.locator('#signup-user').fill(username);
	await page.locator('#signup-pass').fill(TEST_PASSWORD);
	await page.locator('#signup-pass2').fill(TEST_PASSWORD);
	await page.getByTestId('register-submit').click();

	await expect(
		page.getByText(/You already have an account|Du hast bereits ein Konto/i),
	).toBeVisible({ timeout: 60_000 });
	// The username is carried over so the user does not retype it.
	await expect(page.locator('#login-user')).toHaveValue(username);

	// ── 5. Log in and continue, in place ─────────────────────────────────
	await page.locator('#login-pass').fill(TEST_PASSWORD);
	await page.getByTestId('login-submit').click();

	// The fragment token survived the login — origin confirmation appears.
	const confirm = page.getByTestId('migrate-confirm-origin');
	await confirm.waitFor({ timeout: 60_000 });
	await page.locator('input[type="checkbox"]').check();
	await confirm.click();

	// ── 6. Import ────────────────────────────────────────────────────────
	const importBtn = page.getByTestId('migrate-confirm-import');
	await importBtn.waitFor({ timeout: 180_000 });
	await importBtn.click();

	const tourContinue = page.getByRole('button', {
		name: /Got it, go to home|Verstanden, zur Startseite/i,
	});
	await tourContinue.waitFor({ timeout: 180_000 });
	await tourContinue.click();

	// Server side: the export ran and the lockdown signal landed.
	const after = readTokenRow(token);
	expect(after!.usedAt, 'export ran').not.toBeNull();
	await expect
		.poll(() => readTokenRow(token)!.migrationCompletedAt, { timeout: 30_000 })
		.not.toBeNull();

	// ── 7. The imported seizures must actually RENDER ────────────────────
	// The account's blueprint is migraine, not epilepsy. Without
	// ensureEpisodeTypes the entries import and then display as nothing —
	// indistinguishable, to the user, from the migration having failed again.
	// Read the persisted blueprint out of ciphra's own warm cache
	// (idb.ts: DB `ciphra_cache`, store `decrypted_documents`).
	const blueprint = await page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const r = indexedDB.open('ciphra_cache');
			r.onsuccess = () => resolve(r.result);
			r.onerror = () => reject(r.error);
		});
		if (!db.objectStoreNames.contains('decrypted_documents')) return null;
		return new Promise<unknown>((resolve) => {
			const req = db
				.transaction('decrypted_documents', 'readonly')
				.objectStore('decrypted_documents')
				.getAll();
			req.onsuccess = () => {
				const rows = req.result as Array<{ data?: { type?: string; blueprint?: unknown } }>;
				resolve(rows.find((r) => r.data?.type === 'blueprint')?.data?.blueprint ?? null);
			};
			req.onerror = () => resolve(null);
		});
	});
	expect(blueprint, 'blueprint should be cached after the import').not.toBeNull();

	const ids = ((blueprint as { episodeTypes?: Array<{ id: string }> } | null)?.episodeTypes ?? [])
		.map((e) => e.id);
	for (const required of ['focal', 'generalized', 'absence', 'myoclonic', 'unknown']) {
		expect(
			ids,
			`blueprint must gain "${required}" or the imported seizures render as nothing`,
		).toContain(required);
	}
});

test('the login tab avoids the fake-registration detour entirely', async ({ page }) => {
	// Same starting position as the test above — an account that already
	// exists — but taking the route a user would actually want: pick "log in",
	// instead of filling in a registration whose only purpose is to be
	// rejected. That detour is what the reporter would otherwise have faced.
	resetMigrationState();
	await allowConnectOrigins(page, bothSchemes(EPILEPC_HOST));

	const username = await registerStandalone(page);
	await page.getByRole('button', { name: /Log out|Abmelden/i }).click();
	await expect(page.getByRole('button', { name: /Log out|Abmelden/i })).toHaveCount(0, {
		timeout: 30_000,
	});

	const link = await mintMigrationLink(page);
	const { token } = parseMigrationLink(link);
	await page.goto(withSource(link, token, EPILEPC_HOST));

	// Register stays the default — most migrants really are new.
	await expect(page.locator('#signup-user')).toBeVisible({ timeout: 30_000 });

	// One click to the login form: no username invented, no password typed
	// twice, no deliberate 409.
	await page.getByTestId('migrate-tab-login').click();
	await expect(page.locator('#login-user')).toBeVisible();
	await expect(page.locator('#signup-pass2')).toHaveCount(0);

	await page.locator('#login-user').fill(username);
	await page.locator('#login-pass').fill(TEST_PASSWORD);
	await page.getByTestId('login-submit').click();

	// Straight into the transfer, fragment token intact.
	const confirm = page.getByTestId('migrate-confirm-origin');
	await confirm.waitFor({ timeout: 60_000 });
	await page.locator('input[type="checkbox"]').check();
	await confirm.click();

	const importBtn = page.getByTestId('migrate-confirm-import');
	await importBtn.waitFor({ timeout: 180_000 });
	await importBtn.click();

	await page
		.getByRole('button', { name: /Got it, go to home|Verstanden, zur Startseite/i })
		.waitFor({ timeout: 180_000 });

	expect(readTokenRow(token)!.usedAt, 'export ran').not.toBeNull();
});

