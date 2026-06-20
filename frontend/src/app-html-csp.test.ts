/**
 * Track 3 P0 (3.1) — CSP script-src hardening guard.
 *
 * script-src dropped `'unsafe-inline'` (svelte.config.js → kit.csp, mode
 * 'hash'). SvelteKit hashes its OWN inline hydration bootstrap automatically,
 * but it does NOT hash the author-written inline <script>s in src/app.html
 * (the dark-mode pre-paint init + the service-worker registration). Their
 * sha256 hashes are pinned by hand in kit.csp.directives['script-src'].
 *
 * This test recomputes those hashes from app.html and asserts each is present
 * in svelte.config.js — so editing either inline script without updating the
 * CSP hash fails CI instead of silently breaking the script in production
 * (blocked inline script → e.g. white flash for OS-dark users, no SW).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = resolve(__dirname, '..');
const appHtml = readFileSync(resolve(ROOT, 'src/app.html'), 'utf8');
const svelteConfig = readFileSync(resolve(ROOT, 'svelte.config.js'), 'utf8');

// Bare `<script> … </script>` (no attributes) = executable inline scripts that
// CSP script-src governs. `type="application/ld+json"` etc. carry an attribute,
// are not executed, and are not subject to script-src — the attribute-less
// match correctly skips them.
function inlineScriptHashes(html: string): string[] {
	const re = /<script>([\s\S]*?)<\/script>/g;
	const out: string[] = [];
	let m: RegExpExecArray | null;
	while ((m = re.exec(html))) {
		out.push('sha256-' + createHash('sha256').update(m[1], 'utf8').digest('base64'));
	}
	return out;
}

describe('Track 3 P0 — app.html inline scripts pinned in CSP', () => {
	it('every executable inline <script> in app.html has its hash in script-src', () => {
		const hashes = inlineScriptHashes(appHtml);
		expect(hashes.length).toBeGreaterThan(0);
		for (const h of hashes) {
			expect(
				svelteConfig,
				`app.html inline script hash ${h} is not in svelte.config.js. ` +
					`script-src dropped 'unsafe-inline' (Track 3 P0 / 3.1), so each author ` +
					`inline script must be hashed — add '${h}' to kit.csp.directives['script-src'].`,
			).toContain(h);
		}
	});

	it("script-src does not allow 'unsafe-inline'", () => {
		const m = svelteConfig.match(/'script-src':\s*\[([\s\S]*?)\]/);
		expect(m, "kit.csp script-src directive not found in svelte.config.js").toBeTruthy();
		expect(m![1]).not.toContain('unsafe-inline');
	});
});
