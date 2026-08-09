/**
 * INC-001 — production verification, safe to run before AND after the deploy.
 *
 * The question this answers is precisely the one that matters: *from a real
 * browser on ciphra.ch, under the real CSP, can the export endpoint actually
 * be reached?* `curl` cannot answer it — curl has no CSP, no same-origin
 * policy, and will happily follow a redirect that a browser refuses.
 *
 * How it stays safe:
 *   - It uses a deliberately INVALID token, so no real user's link is touched.
 *     (On production today the token is consumed on attempt, so probing with a
 *     real one would destroy it.)
 *   - It needs no ciphra account: the fetch runs via page.evaluate() on an
 *     already-public page, which inherits the same origin and the same CSP the
 *     migrate page would.
 *   - It only reads. Nothing is written on either side.
 *
 * The signal is the difference between two failures:
 *
 *   BEFORE  →  "THREW: Failed to fetch"   the browser refused the redirect;
 *                                         the request never reached PHP
 *   AFTER   →  404                        the request reached PHP, which
 *                                         correctly rejected a bogus token
 *
 * A 404 here is SUCCESS. It proves the whole transport works — DNS, TLS, no
 * redirect, CORS accepted by the browser — and that the only thing wrong with
 * the request was the token we made up.
 *
 * Run:
 *   PLAYWRIGHT_PROD_VERIFY=1 npx playwright test migrate-prod-verify
 */
import { test, expect } from '@playwright/test';

test.skip(
	!process.env.PLAYWRIGHT_PROD_VERIFY,
	'production probe — set PLAYWRIGHT_PROD_VERIFY=1 to run',
);

const CIPHRA = process.env.PROD_CIPHRA_ORIGIN || 'https://ciphra.ch';

/** Matches config/routes.yaml `[A-Za-z0-9_-]{1,64}`, so it reaches the
 *  controller and gets a real `unknown_token` answer rather than a routing
 *  404. Obviously fake by construction. */
const PROBE_TOKEN = 'INC001verifyprobe-not-a-real-token-0000000000';

/** Every host a migration link could plausibly name. */
const HOSTS = (process.env.PROD_EPILEPC_HOSTS || 'epilepc.ch,www.epilepc.ch,direct.epilepc.ch')
	.split(',')
	.map((h) => h.trim())
	.filter(Boolean);

type Probe = { host: string; result: number | string };

test('migration export is reachable from a real browser on ciphra.ch', async ({ page }) => {
	// Any public ciphra page: same origin, same CSP as /migrate.
	await page.goto(CIPHRA, { waitUntil: 'domcontentloaded' });

	const results: Probe[] = [];
	for (const host of HOSTS) {
		const result = await page.evaluate(
			async ([h, tok]) => {
				try {
					const res = await fetch(`https://${h}/api/ciphra-export/${tok}`, {
						method: 'GET',
						mode: 'cors',
						credentials: 'omit',
					});
					return res.status;
				} catch (e) {
					// The browser's own words. `Failed to fetch` here means the
					// request was refused locally — redirect, CSP or CORS — and
					// never left for the server.
					return `THREW: ${e instanceof Error ? e.message : String(e)}`;
				}
			},
			[host, PROBE_TOKEN] as const,
		);
		results.push({ host, result });
	}

	// eslint-disable-next-line no-console
	console.log(
		'\nINC-001 production probe\n' +
			results
				.map(({ host, result }) => {
					const verdict =
						result === 404
							? 'REACHABLE (404 = bogus token rejected by PHP — correct)'
							: typeof result === 'number'
								? `reached PHP, unexpected status ${result}`
								: 'UNREACHABLE — request never left the browser';
					return `  ${host.padEnd(22)} ${String(result).padEnd(28)} ${verdict}`;
				})
				.join('\n') +
			'\n',
	);

	// The host migration links are actually minted against must be reachable.
	const minted = process.env.PROD_MINTED_HOST || 'www.epilepc.ch';
	const mintedResult = results.find((r) => r.host === minted)?.result;
	expect(
		mintedResult,
		`${minted} must be reachable from the browser — a 404 for a bogus token is the healthy answer`,
	).toBe(404);

	// After the .htaccess fix every host should be reachable. Before it, only
	// www is — so this assertion is the one that flips on deploy.
	const unreachable = results.filter((r) => typeof r.result !== 'number').map((r) => r.host);
	expect(
		unreachable,
		`still unreachable from a browser (redirect not yet exempted?): ${unreachable.join(', ')}`,
	).toEqual([]);
});
