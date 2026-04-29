/**
 * CIPH-892 / CIPH-893 / CIPH-894 — Sprint 2 audit.
 *
 * Three surgical UX-differentiation stories share a single audit file.
 * Each test locks one structural invariant so a future refactor can't
 * silently undo the differentiation:
 *
 *   - CIPH-892 — every browse-route scope in app.css declares the four
 *     `--rhythm-*` tokens, AND `.card` consumes `--rhythm-card-radius`.
 *     Calendar / journal / reports / dashboard each read distinct.
 *
 *   - CIPH-893 — JournalEmpty + ReportsEmpty primitives exist, are
 *     consumed by their respective routes, and follow the inventory
 *     discipline (README entry per primitive).
 *
 *   - CIPH-894 — PhaseContextCard carries the emphasis density treatment
 *     (heavier accent rail + cohort-tinted background gradient).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');
const APP_CSS = readFileSync(resolve(SRC_ROOT, 'app.css'), 'utf8');

describe('CIPH-892 — per-route silhouette rhythm tokens', () => {
	const ROUTES = ['calendar', 'journal', 'reports', 'dashboard'];
	const RHYTHM_TOKENS = [
		'--rhythm-card-padding',
		'--rhythm-card-gap',
		'--rhythm-card-radius',
		'--rhythm-section-gap',
	];

	it.each(ROUTES)(
		'[data-route="%s"] declares all four rhythm tokens',
		(route) => {
			const re = new RegExp(`\\[data-route="${route}"\\]\\s*\\{([\\s\\S]*?)\\}`);
			const match = APP_CSS.match(re);
			expect(match, `Missing [data-route="${route}"] block`).not.toBeNull();
			const body = match![1];
			for (const token of RHYTHM_TOKENS) {
				expect(
					body,
					`[data-route="${route}"] missing ${token}`,
				).toContain(token);
			}
		},
	);

	it('.card consumes --rhythm-card-radius so each route gets a distinct silhouette', () => {
		// The .card rule appears once in app.css; assert its border-radius
		// reads from the rhythm token (with the documented fallback).
		expect(APP_CSS).toMatch(/\.card\s*\{[\s\S]*?border-radius:\s*var\(--rhythm-card-radius/);
	});

	it('.card-rhythmic consumes --rhythm-card-padding (honest CIPH-892 fix)', () => {
		// The frontend-designer critique flagged that --rhythm-card-padding
		// was declared but never read. The .card-rhythmic opt-in modifier
		// closes that gap. Tested separately from .card itself so existing
		// Tailwind p-4/p-5 utility callers don't conflict.
		expect(APP_CSS).toMatch(/\.card-rhythmic\s*\{[\s\S]*?padding:\s*var\(--rhythm-card-padding/);
	});

	it('at least two real consumers reference card-rhythmic', () => {
		// Search the source tree for `card-rhythmic` references outside
		// app.css + the test files themselves. The honest fix only counts
		// if it's actually consumed at canonical surfaces.
		// CIPH-902 — the journal redesigned away from per-route card
		// rhythm into its own timeline pattern (.journal-card with a
		// 2px type-color rail). The dashboard rail picked up the slack:
		// CompanionMain (howAreYou hero) + CompanionRail (reports CTA)
		// keep card-rhythmic consumed at canonical surfaces.
		const sources = [
			'lib/components/CompanionMain.svelte',
			'lib/components/CompanionRail.svelte',
		];
		for (const rel of sources) {
			const src = readFileSync(resolve(SRC_ROOT, rel), 'utf8');
			expect(
				src,
				`${rel} should consume \`card-rhythmic\` so the rhythm tokens land visibly.`,
			).toContain('card-rhythmic');
		}
	});

	it('routes have distinct rhythm-card-radius values (no four-way tie)', () => {
		const values: string[] = [];
		for (const route of ROUTES) {
			const re = new RegExp(
				`\\[data-route="${route}"\\][\\s\\S]*?--rhythm-card-radius:\\s*([^;]+);`,
			);
			const m = APP_CSS.match(re);
			expect(m, `[data-route="${route}"] missing --rhythm-card-radius`).not.toBeNull();
			values.push(m![1].trim());
		}
		// At least 3 distinct values across the 4 routes — proves the
		// rhythm differentiation lands. (Allowing 1 collision keeps room
		// for future "dashboard = journal" if intentional.)
		const distinct = new Set(values);
		expect(
			distinct.size,
			`Expected ≥3 distinct radius values across the 4 routes; got ${[...distinct].join(', ')}`,
		).toBeGreaterThanOrEqual(3);
	});
});

describe('CIPH-893 — per-surface empty primitives', () => {
	const PRIMITIVES = [
		{
			name: 'JournalEmpty.svelte',
			path: 'lib/components/JournalEmpty.svelte',
			testid: 'journal-empty',
			consumer: 'routes/journal/+page.svelte',
		},
		{
			name: 'ReportsEmpty.svelte',
			path: 'lib/components/ReportsEmpty.svelte',
			testid: 'reports-empty',
			consumer: 'routes/reports/+page.svelte',
		},
	];

	it.each(PRIMITIVES)('$name exists and exposes data-testid="$testid"', ({ path, testid }) => {
		const src = readFileSync(resolve(SRC_ROOT, path), 'utf8');
		expect(src).toContain(`data-testid="${testid}"`);
	});

	it.each(PRIMITIVES)('$name is consumed by $consumer', ({ name, consumer }) => {
		const src = readFileSync(resolve(SRC_ROOT, consumer), 'utf8');
		const stem = name.replace('.svelte', '');
		// Either imported or referenced as a tag.
		expect(src).toContain(`<${stem}`);
		expect(src).toContain(stem);
	});

	it('README inventory references both new empty primitives', () => {
		const readme = readFileSync(
			resolve(SRC_ROOT, 'lib/components/README.md'),
			'utf8',
		);
		expect(readme).toContain('JournalEmpty.svelte');
		expect(readme).toContain('ReportsEmpty.svelte');
	});
});

describe('CIPH-894 — PhaseContextCard emphasis density', () => {
	const PCC = readFileSync(
		resolve(SRC_ROOT, 'lib/components/PhaseContextCard.svelte'),
		'utf8',
	);

	it('declares data-density="emphasis" on the section element', () => {
		expect(PCC).toContain('data-density="emphasis"');
	});

	it('uses a thicker accent left rail than the standard .card-anchor', () => {
		// Look for an explicit border-left-width override in the scoped
		// <style>. .card-anchor's default is 2px; emphasis bumps it.
		expect(PCC).toMatch(/border-left-width:\s*[3-9]px/);
	});

	it('applies a cohort-tinted background gradient via --accent-rgb', () => {
		expect(PCC).toMatch(/rgba\(var\(--accent-rgb\),/);
	});
});
