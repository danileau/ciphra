/**
 * CIPH-850 — /log/[date] route line-count guard.
 *
 * After EntryComposer extraction (PI v12), +page.svelte dropped from
 * 1723 lines to a thin auth + URL + CRUD adapter. The plan capped the
 * route at ≤300 lines (target ~120). This test fails loudly if a future
 * change re-inlines form sections, handlers, or styles that belong in
 * the primitive — the most common regression mode for extractions like
 * this one.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROUTE = resolve(__dirname, '+page.svelte');
const SRC = readFileSync(ROUTE, 'utf8');

describe('CIPH-850 /log/[date] route — extraction guard', () => {
	it('keeps +page.svelte ≤ 300 lines', () => {
		const lines = SRC.split('\n').length;
		expect(
			lines,
			`+page.svelte grew to ${lines} lines. Cap is 300 — form chrome belongs in EntryComposer, ` +
				`not the route. If the limit needs raising, justify the new responsibility before bumping.`,
		).toBeLessThanOrEqual(300);
	});

	it('imports EntryComposer from $lib/components', () => {
		expect(SRC).toMatch(
			/import\s+EntryComposer(?:\s*,\s*\{[^}]*\})?\s+from\s+['"]\$lib\/components\/EntryComposer\.svelte['"]/,
		);
	});

	it('does not inline section markers', () => {
		// Regression sniff: section-symptoms / section-episodes belong inside
		// the primitive's template, never in the route.
		expect(SRC).not.toContain('section-symptoms');
		expect(SRC).not.toContain('section-episodes');
		expect(SRC).not.toContain('section-vitals');
	});

	it('does not inline the form CSS surface', () => {
		// The ~700 lines of .log-* CSS moved with the template into the primitive.
		// If `.log-card`, `.log-chip`, or `.log-multi-entry` reappear in the
		// route's <style>, the extraction has been undone.
		expect(SRC).not.toMatch(/\.log-card\s*\{/);
		expect(SRC).not.toMatch(/\.log-chip\s*\{/);
		expect(SRC).not.toMatch(/\.log-multi-entry\s*\{/);
	});
});
