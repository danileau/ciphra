/**
 * INC-001 — epilepc → ciphra migration dies at the apex redirect.
 *
 * Reported 2026-08-07 by a real migrant: registered on ciphra through the
 * migration link, saw an error he couldn't recall, no data arrived, and the
 * link then appeared unusable.
 *
 * Reconstruction. Nothing here is stubbed except the Cloudflare edge:
 *   - epilepc runs for real (LoginFormAuthenticator, CiphraMigrationController,
 *     MigrationToken, EpilepcBundleSerializer, its own CORS logic)
 *   - the token is minted through the real UI, CSRF included
 *   - ciphra runs for real, and the account is created IN the migrate flow,
 *     exactly as the reporter did it
 *   - `startApexEmulator` supplies the only missing piece: the 301 that
 *     production's apex returns without CORS headers
 *
 * The decisive assertion is not the error message — it is that
 * `migration_token.used_at` and `ip_first_seen` are STILL NULL afterwards.
 * Those columns are written inside `export()` immediately after the single-use
 * stamp, so NULL proves the controller never executed: the browser refused to
 * follow the redirect and never issued the request to the serving host. That
 * is the exact row shape found in production after the incident, and it is
 * what rules out every server-side theory (timeout, 500, token burn).
 *
 * Requires:
 *   cd ../epilepc && docker compose up -d --build
 *   docker compose exec app bin/console app:seed-demo --users=1
 *   (ciphra dev server on :5173 — Playwright starts it)
 *
 * Run:  PLAYWRIGHT_RUN_MIGRATE=1 npx playwright test migrate-apex-redirect
 */
import { test, expect, type Page } from '@playwright/test';
import { TEST_PASSWORD, randUser } from './_helpers/testUser';
import {
	EPILEPC_HOST,
	mintMigrationLink,
	parseMigrationLink,
	readTokenRow,
	resetMigrationState,
	withBrokenSourceTable,
	withSource,
} from './_helpers/epilepc';
import { startApexEmulator, type ApexEmulator } from './_support/apexRedirect';
import { allowConnectOrigins, bothSchemes } from './_support/cspRelax';

const runMigrate = !!process.env.PLAYWRIGHT_RUN_MIGRATE;
test.skip(!runMigrate, 'needs the epilepc stack: set PLAYWRIGHT_RUN_MIGRATE=1');

/** Cloudflare free tier cuts an origin off at 100s with a 524. */
const CDN_ORIGIN_TIMEOUT_S = Number(process.env.CDN_ORIGIN_TIMEOUT_S || 100);

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

/**
 * Chromium 149 enforces Local Network Access: a fetch aimed at the loopback
 * address space is refused unless permission is granted, and it reports that
 * refusal as a *CORS* error —
 *
 *   "blocked by CORS policy: Permission was denied for this request to
 *    access the `loopback` address space"
 *
 * — which is indistinguishable, from the app's point of view, from the missing
 * CORS header this test exists to prove. It blocked Vite's own HMR socket in
 * the same run, so it is an environment policy, not a property of the code.
 *
 * Production migrations cross public origins where LNA never applies, so
 * turning it off restores production semantics rather than papering over a
 * real defect. Without it the reproduction proves the wrong mechanism.
 */
test.use({
	launchOptions: {
		args: [
			'--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks',
		],
	},
});

/**
 * Register a fresh ciphra account from inside /migrate and clear the recovery
 * gate. This is the reporter's path — not /login?mode=register — and it
 * matters: the account it produces has no blueprint, which is why `/` later
 * bounces the user into /setup.
 */
async function registerInMigrateFlow(page: Page): Promise<string> {
	const user = randUser('e2e_inc001_');
	await page.locator('#signup-user').fill(user);
	await page.locator('#signup-pass').fill(TEST_PASSWORD);
	await page.locator('#signup-pass2').fill(TEST_PASSWORD);
	await page.getByTestId('register-submit').click();
	await page.getByTestId('recovery-code-display').waitFor({ timeout: 60_000 });
	await page.getByTestId('recovery-ack-checkbox').check();
	await page.getByTestId('recovery-continue').click();
	return user;
}

/**
 * Collect the browser's own account of what happened to each request.
 * `TypeError: Failed to fetch` is the same string whether the cause was CSP,
 * DNS, TLS or CORS — these events are what tell them apart, so a failing run
 * says why instead of just that.
 */
function collectNetworkDiagnostics(page: Page): { lines: string[] } {
	const lines: string[] = [];
	page.on('requestfailed', (r) => {
		lines.push(`requestfailed ${r.method()} ${r.url()} — ${r.failure()?.errorText}`);
	});
	page.on('console', (m) => {
		if (m.type() === 'error') lines.push(`console.error ${m.text()}`);
	});
	page.on('response', (r) => {
		if (r.status() >= 300 && r.status() < 400) lines.push(`redirect ${r.status()} ${r.url()}`);
	});
	return { lines };
}

/** Tick the origin-confirmation checkbox and start the bundle fetch. */
async function confirmOriginAndFetch(page: Page): Promise<void> {
	const confirm = page.getByTestId('migrate-confirm-origin');
	await confirm.waitFor({ timeout: 30_000 });
	await page.locator('input[type="checkbox"]').check();
	await confirm.click();
}

test.describe('INC-001 — apex redirect strips CORS and kills the migration', () => {
	let apex: ApexEmulator;

	// A completed migration stamps `user.migrated_at`, which hides the
	// create-link button on epilepc. Reset so each case starts from the same
	// pre-migration state the reporter was in.
	test.beforeEach(() => resetMigrationState());

	test.afterEach(async () => {
		if (apex) await apex.close();
	});

	test('RED: source=apex → fetch dies in the browser, token never consumed', async ({
		page,
	}) => {
		const net = collectNetworkDiagnostics(page);

		// ── 1. Mint a real token through the real epilepc UI ────────────────
		const link = await mintMigrationLink(page);
		const { token, source: mintedSource } = parseMigrationLink(link);

		const before = readTokenRow(token);
		expect(before, 'token row should exist after minting').not.toBeNull();
		expect(before!.usedAt, 'freshly minted token must be unused').toBeNull();
		expect(before!.ipFirstSeen).toBeNull();

		// The minted link points at whatever EPILEPC_ORIGIN says. In production
		// that is the apex, which only ever redirects — the bug in one line.
		test.info().annotations.push({
			type: 'minted-source',
			description: `EPILEPC_ORIGIN produced source=${mintedSource}`,
		});

		// ── 2. Put the production edge in front of it ───────────────────────
		apex = await startApexEmulator(EPILEPC_HOST, 'redirect-no-cors');

		// ── 3. Walk the reporter's path on ciphra ───────────────────────────
		// Mirror production's CSP posture: the source origin is allowed, so the
		// redirect is the only thing that can break the fetch.
		await allowConnectOrigins(page, [
			...bothSchemes(apex.host),
			...bothSchemes(EPILEPC_HOST),
		]);
		await page.goto(withSource(link, token, apex.host));
		await registerInMigrateFlow(page);
		await confirmOriginAndFetch(page);

		// ── 4. The failure the reporter saw ─────────────────────────────────
		// `migrate.error_fetch`. Matched in both locales: the e2e browser runs
		// EN, the reporter saw the DE string.
		await expect(
			page.getByText(
				/Could not reach the source|Verbindung zur Quelle fehlgeschlagen/i,
			),
		).toBeVisible({ timeout: 60_000 });

		// The technical detail is the browser's own words for a CORS-blocked
		// redirect, and is locale-independent. This is the line that separates
		// "the source refused us" from "the source was never asked".
		await expect(page.getByText(/Failed to fetch/i)).toBeVisible();

		// The import step is never offered, so nothing could have been written.
		await expect(page.getByTestId('migrate-confirm-import')).toHaveCount(0);

		// ── 5. The decisive evidence ────────────────────────────────────────
		// The browser DID attempt the request — it reached the edge...
		expect(
			apex.hits.some((p) => p.includes(`/api/ciphra-export/${token}`)),
			`the export request must reach the apex.\n` +
				`  apex hits: ${JSON.stringify(apex.hits, null, 2)}\n` +
				`  browser:\n    ${net.lines.join('\n    ')}`,
		).toBe(true);

		// ...and then went no further. `used_at` / `ip_first_seen` are written
		// inside export() right after the single-use stamp, so both still being
		// NULL proves the controller never ran on the serving host. This is
		// byte-for-byte the row found in production after the incident.
		const after = readTokenRow(token);
		expect(after!.usedAt, 'export() must never have executed').toBeNull();
		expect(after!.ipFirstSeen, 'no IP recorded → controller never reached').toBeNull();
		expect(after!.migrationCompletedAt).toBeNull();
	});

	test('GREEN control: source=serving host → same token completes the import', async ({
		page,
	}) => {
		// Same token lifecycle, same account-in-flow registration, only the
		// source host differs. Isolates the redirect as the sole variable.
		const link = await mintMigrationLink(page);
		const { token } = parseMigrationLink(link);
		expect(readTokenRow(token)!.usedAt).toBeNull();

		await allowConnectOrigins(page, bothSchemes(EPILEPC_HOST));
		await page.goto(withSource(link, token, EPILEPC_HOST));
		await registerInMigrateFlow(page);

		const fetchStartedAt = Date.now();
		await confirmOriginAndFetch(page);

		// Preview renders → the bundle arrived.
		const importBtn = page.getByTestId('migrate-confirm-import');
		await importBtn.waitFor({ timeout: 120_000 });
		const exportSeconds = (Date.now() - fetchStartedAt) / 1000;

		// INC-001 finding 2 — the export must fit inside the CDN's origin
		// timeout, not just PHP's set_time_limit(300).
		//
		// EpilepcBundleSerializer touches two @Encrypted fields per record and
		// defuse derives a key per field, so cost is linear and steep: measured
		// ~142 ms/record on 2026-08-09 (1365 records → 193 s). Cloudflare's
		// free tier cuts the origin off at 100 s with a 524.
		//
		// This matters far more than it looks, because export() stamps used_at
		// BEFORE serialising: a 524 burns the token and the user cannot retry.
		// So the moment the redirect is fixed, heavy accounts — the long-tenured
		// users most likely to migrate — hit a worse, unrecoverable failure.
		// Keep this assertion; it is the guard on that.
		expect(
			exportSeconds,
			`export took ${exportSeconds.toFixed(1)}s — must stay under the ` +
				`${CDN_ORIGIN_TIMEOUT_S}s CDN origin timeout or the token burns on a 524`,
		).toBeLessThan(CDN_ORIGIN_TIMEOUT_S);

		await importBtn.click();

		// A first-time browser gets the one-shot "your diary stays private"
		// tour (CIPH-761), which deliberately holds the user on /migrate until
		// they acknowledge it — so don't assert on the URL here.
		const tourContinue = page.getByRole('button', {
			name: /Got it, go to home|Verstanden, zur Startseite/i,
		});
		await tourContinue.waitFor({ timeout: 180_000 });
		await tourContinue.click();
		await expect(page).toHaveURL(/localhost:5173\/$/, { timeout: 60_000 });

		// The real signal, independent of UI copy: export() ran, so the token
		// is consumed and the caller's IP was recorded — the mirror image of
		// the RED case, with only the source host different.
		const after = readTokenRow(token);
		expect(after!.usedAt, 'export() ran → token consumed').not.toBeNull();
		expect(after!.ipFirstSeen, 'export() ran → IP recorded').not.toBeNull();

		// And the lockdown signal reached epilepc, closing the loop.
		await expect
			.poll(() => readTokenRow(token)!.migrationCompletedAt, { timeout: 30_000 })
			.not.toBeNull();
	});
});

/**
 * Fix verification.
 *
 * `public/.htaccess` now exempts the machine endpoints from the host
 * canonicalisation redirect. The dev container runs `AllowOverride None`, so
 * it cannot exercise that file directly — dev and production diverge on
 * exactly the file that caused the incident, which is itself worth knowing.
 * These cases pin the BEHAVIOUR the fix has to produce, whichever way the edge
 * ends up delivering it, and `scripts/verify-migration-origin.sh` confirms the
 * real rule against production after deploy.
 */
test.describe('INC-001 — fixed edge behaviours', () => {
	let apex: ApexEmulator;

	test.beforeEach(() => resetMigrationState());
	test.afterEach(async () => {
		if (apex) await apex.close();
	});

	test('passthrough-api: exempting the machine endpoints fixes it', async ({ page }) => {
		// This is the shipped fix: public/.htaccess no longer redirects
		// /api/ciphra-export or /api/migration-complete, so no redirect ever
		// enters the CORS chain.
		const link = await mintMigrationLink(page);
		const { token } = parseMigrationLink(link);

		apex = await startApexEmulator(EPILEPC_HOST, 'passthrough-api');
		await allowConnectOrigins(page, [
			...bothSchemes(apex.host),
			...bothSchemes(EPILEPC_HOST),
		]);
		await page.goto(withSource(link, token, apex.host));
		await registerInMigrateFlow(page);
		await confirmOriginAndFetch(page);

		// The preview only renders if the bundle actually arrived — which is
		// precisely what the redirect used to prevent.
		await page.getByTestId('migrate-confirm-import').waitFor({ timeout: 120_000 });
		expect(readTokenRow(token)!.usedAt, 'export() ran through the apex').not.toBeNull();
	});

	test('redirect-with-cors: the tempting alternative does NOT work', async ({ page }) => {
		// Keeping the redirect but adding CORS headers to it looks like the
		// smaller change. It is actively DANGEROUS, and this test records why.
		//
		// The redirect is now followed, so the request reaches PHP and the token
		// IS consumed. But when a cross-origin CORS request is redirected the
		// browser taints the follow-up request's Origin to `null`; epilepc then
		// fails its allow-list check and echoes its configured CIPHRA_ORIGIN,
		// which no longer matches — so the browser discards the response.
		// Verified directly:
		//
		//   $ curl -X OPTIONS -H 'Origin: null' .../api/ciphra-export/probe
		//   Access-Control-Allow-Origin: http://localhost:5173   ← ≠ null
		//
		// Net effect: the user sees the same error, AND their single-use link is
		// now spent, with nothing delivered. That converts INC-001 from a
		// recoverable failure into an unrecoverable one.
		//
		// Making it genuinely work would require returning
		// `Access-Control-Allow-Origin: null`, which every sandboxed or opaque
		// origin also satisfies. Not redirecting is the only correct fix.
		const link = await mintMigrationLink(page);
		const { token } = parseMigrationLink(link);

		apex = await startApexEmulator(EPILEPC_HOST, 'redirect-with-cors');
		await allowConnectOrigins(page, [
			...bothSchemes(apex.host),
			...bothSchemes(EPILEPC_HOST),
		]);
		await page.goto(withSource(link, token, apex.host));
		await registerInMigrateFlow(page);
		await confirmOriginAndFetch(page);

		// The user still gets nothing — but note WHEN. The redirect is followed,
		// so the server performs the ENTIRE export first, and only then does the
		// browser discard the response. The wait here must therefore cover a full
		// export, not just a round-trip. That wasted work is a further argument
		// against this option: maximum cost, zero delivery, token spent.
		await expect(
			page.getByText(/Could not reach the source|Verbindung zur Quelle fehlgeschlagen/i),
		).toBeVisible({ timeout: 180_000 });

		// ...but unlike the plain redirect, the server DID serve the bundle, so
		// the single-use link is now spent. This is the whole argument against
		// this option, and it must fail loudly if anyone reaches for it.
		expect(
			readTokenRow(token)!.usedAt,
			'CORS-on-redirect burns the token while delivering nothing — do not ship this',
		).not.toBeNull();
	});

	test('a failed export no longer burns the token', async ({ page }) => {
		const link = await mintMigrationLink(page);
		const { token } = parseMigrationLink(link);
		expect(readTokenRow(token)!.usedAt).toBeNull();

		// Node-side fetch: no browser, no CORS — we are testing the server's
		// consume-on-success contract, not the transport.
		const status = await withBrokenSourceTable(async () => {
			const res = await fetch(
				`http://${EPILEPC_HOST}/api/ciphra-export/${encodeURIComponent(token)}`,
				{ headers: { Origin: 'http://localhost:5173' } },
			);
			return res.status;
		});
		expect(status, 'a mid-export failure must surface as 5xx').toBeGreaterThanOrEqual(500);

		// The point of the fix: the user can still use their link.
		const after = readTokenRow(token);
		expect(after!.usedAt, 'a failed export must NOT consume the token').toBeNull();
		expect(after!.ipFirstSeen, 'but the attempt is still recorded for forensics').not.toBeNull();

		// And it genuinely still works once the fault is gone.
		const retry = await fetch(
			`http://${EPILEPC_HOST}/api/ciphra-export/${encodeURIComponent(token)}`,
			{ headers: { Origin: 'http://localhost:5173' } },
		);
		expect(retry.status, 'the same link must still be redeemable').toBe(200);
		expect(readTokenRow(token)!.usedAt, 'and NOW it is consumed').not.toBeNull();
	});
});
