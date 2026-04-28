/**
 * CIPH-896 — Wordmark consolidation guard.
 *
 * The frontend-designer critique flagged 5 hand-rolled SVG wordmarks
 * (`+page.svelte` ×3, `+layout.svelte` ×2, `migrate/+page.svelte`,
 * `login/+page.svelte`) bypassing the brand primitive. CIPH-896
 * extracts a single `<Wordmark>` primitive and migrates every site to
 * it; this test forbids future regressions.
 *
 * Specifically: any `.svelte` file outside `Wordmark.svelte` and
 * `Asterisk.svelte` may NOT contain a hand-rolled `rotate(8)` SVG
 * fragment (which is the unique signature of the asterisk geometry).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');

const ALLOWED_FILES = new Set([
	resolve(SRC_ROOT, 'lib/components/Wordmark.svelte'),
	resolve(SRC_ROOT, 'lib/components/Asterisk.svelte'),
]);

function walk(dir: string, acc: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		if (name === 'node_modules' || name.startsWith('.')) continue;
		const full = join(dir, name);
		const s = statSync(full);
		if (s.isDirectory()) walk(full, acc);
		else if (name.endsWith('.svelte')) acc.push(full);
	}
	return acc;
}

describe('CIPH-896 — wordmark consolidation', () => {
	const files = walk(SRC_ROOT);

	it('Wordmark primitive exists at lib/components/Wordmark.svelte', () => {
		const primitive = resolve(SRC_ROOT, 'lib/components/Wordmark.svelte');
		expect(statSync(primitive).isFile()).toBe(true);
		const src = readFileSync(primitive, 'utf8');
		expect(src).toContain('rotate(8)'); // sanity: it owns the geometry
	});

	it('no svelte file outside Wordmark + Asterisk uses the rotate(8) asterisk geometry', () => {
		const offenders: string[] = [];
		for (const full of files) {
			if (ALLOWED_FILES.has(full)) continue;
			const src = readFileSync(full, 'utf8');
			if (/rotate\(8\)/.test(src)) {
				offenders.push(full.slice(SRC_ROOT.length + 1));
			}
		}
		expect(
			offenders,
			`Hand-rolled rotate(8) wordmark/asterisk found outside the canonical primitives. ` +
				`Replace with <Wordmark size={N} /> or <Asterisk />:\n${offenders.join('\n')}`,
		).toEqual([]);
	});

	it('canonical wordmark sites import Wordmark', () => {
		const SITES = [
			'routes/+layout.svelte',
			'routes/+page.svelte',
			'routes/login/+page.svelte',
			'routes/migrate/+page.svelte',
		];
		for (const rel of SITES) {
			const src = readFileSync(resolve(SRC_ROOT, rel), 'utf8');
			expect(
				src,
				`${rel} should import Wordmark and render <Wordmark>.`,
			).toContain('Wordmark');
		}
	});
});
