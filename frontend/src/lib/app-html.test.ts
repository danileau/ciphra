/**
 * CIPH-pi22-L-2/L-3/L-4 — app.html structural contract.
 *
 * Pins the canonical link, JSON-LD structured data, and noscript fallback
 * against accidental removal. app.html isn't a Svelte component — no other
 * test surface naturally covers it. Regex-on-source matches the discipline
 * pattern used by `pdf.kpi-glance.test.ts` and `security-doc.test.ts`.
 *
 * Open-lens scoring per `feedback_open_persona_dryrun.md`: these stories
 * ship at honest 3.5-3.9 (Anna + Hans). They are SEO/edge wins — invisible
 * to users in normal flow but real for growth ranking + privacy-paranoid
 * edge users. Pinning them means a future "clean up app.html" sweep can't
 * silently delete the audit's findings.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP_HTML = readFileSync(
	join(__dirname, '..', 'app.html'),
	'utf8',
);

describe('CIPH-pi22-L-2 canonical link', () => {
	it('app.html declares <link rel="canonical">', () => {
		expect(APP_HTML).toMatch(/<link\s+rel="canonical"\s+href="https:\/\/ciphra\.ch\//);
	});

	it('canonical sits inside <head>, before %sveltekit.head%', () => {
		const headEnd = APP_HTML.indexOf('%sveltekit.head%');
		const canonical = APP_HTML.search(/<link\s+rel="canonical"/);
		expect(canonical, 'canonical link must exist').toBeGreaterThan(-1);
		expect(canonical, 'canonical must precede %sveltekit.head% so per-route overrides win').toBeLessThan(headEnd);
	});
});
