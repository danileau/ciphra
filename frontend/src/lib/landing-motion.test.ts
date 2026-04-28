/**
 * CIPH-895 — Landing motion guard.
 *
 * The landing page entrance + section reveals are handled by
 * `lib/actions/inview.ts` + scoped CSS in `routes/+page.svelte`.
 * This test locks three invariants:
 *
 *   1. The `inview` action exists and respects `prefers-reduced-motion`.
 *   2. The landing page imports the action and uses it on at least 4
 *      sections (so the motion budget actually lands across the page,
 *      not just on one section).
 *   3. The landing CSS has a `prefers-reduced-motion` block that
 *      disables the entrance + reveal animations.
 *
 * Trust-app motion budget: no motion library dependency added. Same
 * effect via `IntersectionObserver` + ~30 LOC of CSS. If a future
 * story needs orchestrated timelines (motion.dev's actual strength),
 * revisit; for landing reveals, the platform is enough.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');

describe('CIPH-895 — landing motion', () => {
	it('inview action exists and honours prefers-reduced-motion', () => {
		const src = readFileSync(
			resolve(SRC_ROOT, 'lib/actions/inview.ts'),
			'utf8',
		);
		expect(src).toContain('export function inview');
		expect(src).toContain('prefers-reduced-motion');
	});

	it('landing page imports the inview action', () => {
		const src = readFileSync(
			resolve(SRC_ROOT, 'routes/+page.svelte'),
			'utf8',
		);
		expect(src).toMatch(/import\s*\{\s*inview\s*\}\s*from\s*['"]\$lib\/actions\/inview['"]/);
	});

	it('landing page applies use:inview to at least 4 sections', () => {
		const src = readFileSync(
			resolve(SRC_ROOT, 'routes/+page.svelte'),
			'utf8',
		);
		const matches = src.match(/use:inview/g) || [];
		expect(
			matches.length,
			`Expected ≥4 use:inview consumers across landing sections; got ${matches.length}.`,
		).toBeGreaterThanOrEqual(4);
	});

	it('landing CSS declares the reveal + hero-entrance animations', () => {
		const src = readFileSync(
			resolve(SRC_ROOT, 'routes/+page.svelte'),
			'utf8',
		);
		expect(src).toContain('@keyframes heroEntrance');
		expect(src).toContain('.reveal');
		expect(src).toContain('.in-view');
	});

	it('landing CSS disables motion under prefers-reduced-motion', () => {
		const src = readFileSync(
			resolve(SRC_ROOT, 'routes/+page.svelte'),
			'utf8',
		);
		// Match the @media block AND assert it kills .hero-content + .reveal.
		const match = src.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\t\}/);
		expect(match, 'No prefers-reduced-motion block found in landing styles').not.toBeNull();
		const body = match![1];
		expect(body).toContain('.hero-content');
		expect(body).toContain('.reveal');
	});
});
