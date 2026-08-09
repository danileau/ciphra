/**
 * INC-001 — the client-side www fallback, tested on its own.
 *
 * This is the path that decides the deploy order, so it needs proof rather
 * than reasoning. If it works, shipping ciphra ALONE makes an already-issued
 * link (`source=epilepc.ch`) succeed, because the client retries the `www.`
 * variant after the apex fetch is refused. That means a stranded migrant can
 * use the link they already have — no new link, no epilepc deploy, no
 * dependency on the broken epilepc session store.
 *
 * Needs only the ciphra dev server. Both hosts are simulated with route
 * interception on a `.test` TLD that can never resolve, so nothing here can
 * accidentally reach a real server.
 *
 * The trap this test has to avoid: if the browser simply FOLLOWED the 301, the
 * bundle would arrive anyway and the test would pass without the fallback ever
 * running — proving nothing. So the apex redirects to a MARKER path. If that
 * marker is ever requested, the browser followed the redirect and the result is
 * meaningless; the test asserts it never is.
 */
import { test, expect, type Page } from '@playwright/test';
import { TEST_PASSWORD, randUser } from './_helpers/testUser';
import { allowConnectOrigins } from './_support/cspRelax';

test.skip(!process.env.PLAYWRIGHT_RUN_MIGRATE, 'set PLAYWRIGHT_RUN_MIGRATE=1');

test.setTimeout(180_000);

const APEX = 'epilepc.test';
const WWW = 'www.epilepc.test';
const TOKEN = 'wwwfallbackprobe0000000000000000000000000000';
const MARKER = '/REDIRECT-WAS-FOLLOWED';

/** Smallest bundle `validateBundle` accepts, plus one seizure to import. */
const BUNDLE = {
	schema_version: '1.1',
	exported_at: '2026-08-09T10:00:00Z',
	epilepc_decommission_at: '2026-10-01T00:00:00Z',
	epilepc_user_id: 'u-inc001',
	seizures: [
		{ epilepc_id: 's1', date: '2026-07-01', time: '08:30', type_name: 'Fokaler Anfall', notes: 'probe' },
	],
	events: [],
	medications: [],
	diary: [],
};

async function registerInMigrateFlow(page: Page): Promise<void> {
	await page.locator('#signup-user').fill(randUser('e2e_wwwfb_'));
	await page.locator('#signup-pass').fill(TEST_PASSWORD);
	await page.locator('#signup-pass2').fill(TEST_PASSWORD);
	await page.getByTestId('register-submit').click();
	await page.getByTestId('recovery-code-display').waitFor({ timeout: 60_000 });
	await page.getByTestId('recovery-ack-checkbox').check();
	await page.getByTestId('recovery-continue').click();
}

test('an apex-sourced link still imports, via the www fallback', async ({ page }) => {
	const hits: string[] = [];

	// Production CSP names the real hosts; allow the simulated ones so CSP is
	// not what decides the outcome (see cspRelax for why that matters).
	await allowConnectOrigins(page, [
		`https://${APEX}`,
		`https://${WWW}`,
		`http://${APEX}`,
		`http://${WWW}`,
	]);

	// The apex: redirects, and — exactly like mod_rewrite — sends no CORS
	// headers. A browser must refuse to follow this for a cors-mode request.
	await page.route(`https://${APEX}/**`, async (route) => {
		hits.push(`apex ${new URL(route.request().url()).pathname}`);
		await route.fulfill({
			status: 301,
			headers: { location: `https://${WWW}${MARKER}` },
			body: '',
		});
	});

	// If this is ever reached, the browser followed the redirect and the run
	// proves nothing.
	await page.route(`https://${WWW}${MARKER}`, async (route) => {
		hits.push('MARKER');
		await route.fulfill({ status: 200, body: '{}' });
	});

	// The host that actually serves.
	await page.route(`https://${WWW}/api/ciphra-export/**`, async (route) => {
		hits.push(`www ${new URL(route.request().url()).pathname}`);
		await route.fulfill({
			status: 200,
			headers: {
				'content-type': 'application/json',
				'access-control-allow-origin': new URL(page.url()).origin,
			},
			body: JSON.stringify(BUNDLE),
		});
	});

	// Completion signal — must also land on the resolved base, not the apex.
	await page.route(`https://${WWW}/api/migration-complete/**`, async (route) => {
		hits.push('complete');
		await route.fulfill({
			status: 200,
			headers: { 'access-control-allow-origin': new URL(page.url()).origin },
			body: '{"ok":true}',
		});
	});

	// A link as production minted it: pointing at the apex.
	await page.goto(`/migrate#migrate=${TOKEN}&source=${APEX}`);
	await registerInMigrateFlow(page);

	await page.getByTestId('migrate-confirm-origin').waitFor({ timeout: 30_000 });
	await page.locator('input[type="checkbox"]').check();
	await page.getByTestId('migrate-confirm-origin').click();

	// The preview only appears if the bundle arrived — i.e. the fallback worked.
	await page.getByTestId('migrate-confirm-import').waitFor({ timeout: 60_000 });

	// The redirect must NOT have been followed, or this proves nothing.
	expect(hits, `browser followed the redirect — result is meaningless. hits: ${hits.join(', ')}`)
		.not.toContain('MARKER');
	// The apex was tried first...
	expect(hits.some((h) => h.startsWith('apex'))).toBe(true);
	// ...and the www variant is what delivered.
	expect(hits.some((h) => h.startsWith('www /api/ciphra-export/'))).toBe(true);

	// Import, then confirm the completion signal followed the resolved base.
	await page.getByTestId('migrate-confirm-import').click();
	await expect
		.poll(() => hits.includes('complete'), { timeout: 60_000 })
		.toBe(true);
});
