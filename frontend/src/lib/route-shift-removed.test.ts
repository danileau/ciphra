/**
 * Design review 2026-06-11 — route-shift removal guard.
 *
 * The CIPH-890 per-route HSL modulation (`--route-l-shift` /
 * `--route-s-shift` CSS vars + `applyRouteShift*` TS helpers) shipped
 * for ~6 weeks with zero consumers: the `hsl(from …)` composition
 * pattern only ever existed in comments, the TS helpers were only
 * referenced by their own tests, and the two sides had drifted apart
 * (CSS reports −10% S vs TS −4% S). The one attempt to wire the CSS
 * pattern produced the PI v13 hover-white bug class (unsupported
 * `hsl(from …)` rules are dropped wholesale by older browsers).
 *
 * Decision: route identity comes from content + the CIPH-892 rhythm
 * tokens (`--rhythm-*`, keyed off `data-route`); cohort identity keeps
 * the `--accent-*` system. This test keeps the dead pattern from
 * creeping back. If a future PI wants per-route color modulation,
 * delete this test in the same commit that ships an actual consumer.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else if (/\.(svelte|css|ts)$/.test(name) && !name.endsWith('.test.ts')) out.push(p);
	}
	return out;
}

describe('route-shift stays removed', () => {
	const files = walk(SRC);

	it('no --route-l-shift / --route-s-shift custom properties anywhere', () => {
		const offenders = files.filter((f) => {
			const body = readFileSync(f, 'utf-8');
			// Declarations or var() reads — comments mentioning the history
			// are fine, actual `--route-…-shift:` or `var(--route-…)` are not.
			return /--route-[ls]-shift\s*:/.test(body) || /var\(\s*--route-[ls]-shift/.test(body);
		});
		expect(offenders).toEqual([]);
	});

	it('no hsl(from …) relative-color syntax outside comments', () => {
		const offenders = files.filter((f) => {
			const body = readFileSync(f, 'utf-8')
				.replace(/\/\*[\s\S]*?\*\//g, '') // strip block comments
				.replace(/^\s*\/\/.*$/gm, '') // strip line comments
				.replace(/<!--[\s\S]*?-->/g, ''); // strip HTML comments
			return body.includes('hsl(from');
		});
		expect(offenders).toEqual([]);
	});

	it('the dead TS helpers are gone from cohortPalette', () => {
		const body = readFileSync(join(SRC, 'lib/cohortPalette.ts'), 'utf-8');
		expect(body).not.toMatch(/export function applyRouteShift/);
		expect(body).not.toMatch(/export function routeShift\(/);
		// pathToRoute survives — it drives the rhythm tokens.
		expect(body).toMatch(/export function pathToRoute/);
	});
});
