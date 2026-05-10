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

describe('CIPH-pi22-L-3 JSON-LD structured data', () => {
	it('app.html ships exactly one application/ld+json block', () => {
		const matches = APP_HTML.match(/<script\s+type="application\/ld\+json">/g) || [];
		expect(matches.length).toBe(1);
	});

	it('JSON-LD parses as valid JSON', () => {
		const m = APP_HTML.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/);
		expect(m, 'JSON-LD block must be present').toBeTruthy();
		expect(() => JSON.parse(m![1])).not.toThrow();
	});

	it('JSON-LD declares schema.org @context + WebSite + Organization', () => {
		const m = APP_HTML.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/)!;
		const data = JSON.parse(m[1]);
		expect(data['@context']).toBe('https://schema.org');
		const types = (data['@graph'] || []).map((n: { '@type': string }) => n['@type']);
		expect(types).toContain('WebSite');
		expect(types).toContain('Organization');
	});

	it('JSON-LD does NOT declare MedicalWebPage / MedicalApplication (regulatory deferral)', () => {
		// Per Hans's L-1 persona-dry-run: Schema.org medical markers may
		// invite MDR/MepV classification scrutiny. Re-introduce only after
		// the explicit regulatory check at project_medical_device_assessment.md.
		const m = APP_HTML.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/)!;
		expect(m[1]).not.toMatch(/MedicalWebPage|MedicalApplication|MedicalEntity|MedicalCondition/);
	});

	it('JSON-LD declares the four supported locales in inLanguage', () => {
		const m = APP_HTML.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/)!;
		const data = JSON.parse(m[1]);
		const website = (data['@graph'] || []).find((n: { '@type': string }) => n['@type'] === 'WebSite');
		expect(website?.inLanguage).toEqual(['de', 'en', 'fr', 'it']);
	});
});

describe('CIPH-pi22-L-4 noscript fallback', () => {
	it('app.html ships a <noscript> block', () => {
		expect(APP_HTML).toMatch(/<noscript>[\s\S]+<\/noscript>/);
	});

	it('noscript block points users at /privacy', () => {
		const m = APP_HTML.match(/<noscript>([\s\S]+?)<\/noscript>/);
		expect(m, 'noscript block must exist').toBeTruthy();
		expect(m![1]).toMatch(/href="\/privacy"/);
	});

	it('noscript block sits inside <body> before %sveltekit.body%', () => {
		const noscriptStart = APP_HTML.indexOf('<noscript>');
		const sveltekitBody = APP_HTML.indexOf('%sveltekit.body%');
		expect(noscriptStart, 'noscript must be present').toBeGreaterThan(-1);
		expect(noscriptStart, 'noscript must precede the SvelteKit body slot').toBeLessThan(sveltekitBody);
	});

	it('noscript explains the JS requirement positively (no "we cant" framing)', () => {
		// Per feedback_brand_voice.md — frame encryption as an act, not as
		// a denial. The copy says "your password derives the encryption key
		// in this browser tab" — not "we can't read your data without JS."
		const m = APP_HTML.match(/<noscript>([\s\S]+?)<\/noscript>/);
		expect(m![1]).not.toMatch(/we (cannot|can't|never)|not even (admins?|we)/i);
	});
});
