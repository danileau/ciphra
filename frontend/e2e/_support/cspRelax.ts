/**
 * INC-001 — let the test's local source origins through CSP.
 *
 * ciphra ships a real Content-Security-Policy (svelte.config.js, `mode:
 * 'hash'`) whose `connect-src` names the production epilepc hosts:
 *
 *     connect-src 'self' https://cloudflareinsights.com
 *                 https://www.epilepc.ch https://epilepc.ch
 *                 https://direct.epilepc.ch
 *
 * The dev server emits it too. So in a test, a bundle fetch to
 * `http://127.0.0.1:<port>` is refused by the renderer before a packet leaves
 * the browser — it never reaches the network layer, never reaches the source,
 * and surfaces as the same `TypeError: Failed to fetch` that a CORS failure
 * produces. Identical symptom, completely different cause.
 *
 * That collision is not hypothetical: it is why `migrate-flow-typical.spec.ts`
 * (`source=localhost:5000`) and the manual matrix in
 * `api/fixtures/epilepc/README.md` cannot pass. They have been inert since CSP
 * hardening shipped, which is a large part of why INC-001 reached a user.
 *
 * In PRODUCTION, CSP allows `https://epilepc.ch` — verified against the live
 * header — so CSP plays no part in the incident. Relaxing it here restores
 * production's posture for the test: the source origin is permitted, and the
 * ONLY thing that can break the fetch is the redirect's missing CORS header.
 * Without this the reproduction would prove the wrong mechanism.
 */
import type { Page } from '@playwright/test';

/**
 * Append `origins` to the `connect-src` directive of every document response.
 * Call before the first `page.goto`.
 */
export async function allowConnectOrigins(page: Page, origins: string[]): Promise<void> {
	if (origins.length === 0) return;
	const extra = origins.join(' ');

	const debug = !!process.env.CSP_RELAX_DEBUG;
	let rewritten = 0;

	await page.route('**/*', async (route) => {
		if (route.request().resourceType() !== 'document') {
			return route.fallback();
		}
		try {
			const response = await route.fetch();
			const headers = { ...response.headers() };

			for (const key of [
				'content-security-policy',
				'content-security-policy-report-only',
			]) {
				const value = headers[key];
				if (!value) continue;
				headers[key] = value.includes('connect-src')
					? value.replace(/connect-src ([^;]*)/, `connect-src $1 ${extra}`)
					: `${value}; connect-src 'self' ${extra}`;
				rewritten++;
			}

			// Pass status and body explicitly rather than relying on `response`
			// merge semantics — those differ across Playwright versions, and a
			// silent no-op here makes CSP look like a CORS failure.
			await route.fulfill({
				status: response.status(),
				headers,
				body: await response.body(),
			});
			if (debug) {
				// eslint-disable-next-line no-console
				console.log(`[cspRelax] ${route.request().url()} → rewrites=${rewritten}`);
			}
		} catch (e) {
			if (debug) {
				// eslint-disable-next-line no-console
				console.log(`[cspRelax] FAILED on ${route.request().url()}: ${String(e)}`);
			}
			await route.fallback();
		}
	});
}

/** Both schemes for a `host:port`, since ciphra tries https before http. */
export function bothSchemes(host: string): string[] {
	return [`http://${host}`, `https://${host}`];
}
