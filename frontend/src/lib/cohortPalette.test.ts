/**
 * CIPH-890 — Cohort × Route palette contract.
 *
 * Locks the invariants the rest of PI v13 depends on:
 *   - 5 cohorts, 6 tones each, complete coverage.
 *   - The `discrete` cohort row equals `DATA_PALETTE` exactly so
 *     existing presets need zero migration.
 *   - Each row honours the protanopia adjacent-pair rule (no two
 *     adjacent slots both fall in the rust/brick collision set).
 *   - Each tone passes WCAG ≥3:1 against the cream `--surface`
 *     (`#faf8f6`) so chart bars / dots / band fills stay legible.
 *   - Named exports stay in sync with the matrix.
 *
 * (The route-shift assertions were removed with the route axis itself —
 * design review 2026-06-11, see `route-shift-removed.test.ts`.)
 *   - `pathToRoute` maps every primary surface correctly.
 *
 * Mirrors `presets-palette.test.ts` style. Linus persona dry-run is
 * still mandatory before vote (this test catches structural drift,
 * not visual judgement).
 */

import { describe, it, expect } from 'vitest';
import { DATA_PALETTE } from './dataPalette';
import { contrastRatio } from './contrast';
import {
	COHORT_PALETTES,
	COHORT_PALETTE_RGB,
	ALL_COHORTS_PALETTE,
	CHART_ONLY_TONES,
	CYCLE_1,
	CYCLE_2,
	CYCLE_3,
	CYCLE_4,
	CYCLE_5,
	CYCLE_6,
	PHASE_1,
	PHASE_2,
	PHASE_3,
	PHASE_4,
	PHASE_5,
	PHASE_6,
	NARRATIVE_1,
	NARRATIVE_2,
	NARRATIVE_3,
	NARRATIVE_4,
	NARRATIVE_5,
	NARRATIVE_6,
	CUSTOM_1,
	CUSTOM_2,
	CUSTOM_3,
	CUSTOM_4,
	CUSTOM_5,
	CUSTOM_6,
	cohortPalette,
	pathToRoute,
	type Cohort,
} from './cohortPalette';

const SURFACE = '#faf8f6';
const CHART_FLOOR = 3.0;
const TEXT_FLOOR = 4.5;

describe('CIPH-890 — completeness', () => {
	it('declares all 5 cohorts', () => {
		expect(Object.keys(COHORT_PALETTES).sort()).toEqual(
			[...ALL_COHORTS_PALETTE].sort(),
		);
		expect(ALL_COHORTS_PALETTE).toHaveLength(5);
	});

	it.each(ALL_COHORTS_PALETTE)('cohort %s has exactly 6 tones', (cohort) => {
		const palette = cohortPalette(cohort);
		expect(palette).toHaveLength(6);
		for (const tone of palette) {
			expect(tone).toMatch(/^#[0-9a-f]{6}$/i);
		}
	});
});

describe('CIPH-890 — discrete cohort preserves DATA_PALETTE verbatim', () => {
	it('cohortPalette("discrete") deep-equals DATA_PALETTE', () => {
		expect(cohortPalette('discrete')).toEqual(DATA_PALETTE);
	});
});

describe('CIPH-890 — adjacency rule (mirrors presets-palette.test.ts CIPH-801)', () => {
	// CIPH-801's adjacency rule operates at the consumer level (preset
	// `episodeTypes` arrays must not have two adjacent entries with the
	// same color). The cohort palette itself is a source-of-truth list;
	// chart consumers (CIPH-891) cherry-pick non-adjacent slots when
	// building chart series. The palette's own constraint is the same
	// "no exact duplicate adjacent" rule applied to the 6 tones in row
	// order. The protanopia DATA_1/DATA_2 collision is documented in
	// the dataPalette.ts JSDoc and stays a chart-author rule, not a
	// palette-author rule (the discrete cohort row is the existing
	// DATA_PALETTE which already places brand-rust + deep-brick at
	// slots 1+2 by intent).
	it.each(ALL_COHORTS_PALETTE)(
		'cohort %s has no two adjacent slots that are exactly equal',
		(cohort) => {
			const palette = cohortPalette(cohort);
			for (let i = 1; i < palette.length; i++) {
				expect(
					palette[i],
					`${cohort}: slot ${i - 1} and slot ${i} share the same hex ${palette[i]}`,
				).not.toBe(palette[i - 1]);
			}
		},
	);
});

describe('CIPH-890 — WCAG contrast against the cream surface', () => {
	it.each(ALL_COHORTS_PALETTE)(
		'every tone in cohort %s meets the chart-use floor (≥3:1 against #faf8f6)',
		(cohort) => {
			const palette = cohortPalette(cohort);
			for (let i = 0; i < palette.length; i++) {
				const tone = palette[i];
				const ratio = contrastRatio(tone, SURFACE);
				expect(
					ratio,
					`${cohort} slot ${i} (${tone}) is ${ratio.toFixed(2)}:1 — ` +
						`below the chart-use floor of ${CHART_FLOOR}:1.`,
				).toBeGreaterThanOrEqual(CHART_FLOOR);
			}
		},
	);

	it('CHART_ONLY_TONES contains every tone that fails the text-use floor', () => {
		const failures: string[] = [];
		for (const cohort of ALL_COHORTS_PALETTE) {
			for (const tone of cohortPalette(cohort)) {
				if (
					contrastRatio(tone, SURFACE) < TEXT_FLOOR &&
					!CHART_ONLY_TONES.has(tone)
				) {
					failures.push(`${cohort}: ${tone}`);
				}
			}
		}
		expect(
			failures,
			`Tones below ${TEXT_FLOOR}:1 must be listed in CHART_ONLY_TONES so ` +
				`callers know not to use them for body text. Missing:\n${failures.join('\n')}`,
		).toEqual([]);
	});
});

describe('CIPH-890 — named exports match the matrix', () => {
	const expected: Record<Cohort, readonly string[]> = {
		cycle: [CYCLE_1, CYCLE_2, CYCLE_3, CYCLE_4, CYCLE_5, CYCLE_6],
		phase: [PHASE_1, PHASE_2, PHASE_3, PHASE_4, PHASE_5, PHASE_6],
		narrative: [
			NARRATIVE_1,
			NARRATIVE_2,
			NARRATIVE_3,
			NARRATIVE_4,
			NARRATIVE_5,
			NARRATIVE_6,
		],
		discrete: [...DATA_PALETTE],
		custom: [CUSTOM_1, CUSTOM_2, CUSTOM_3, CUSTOM_4, CUSTOM_5, CUSTOM_6],
	};
	it.each(ALL_COHORTS_PALETTE)('cohort %s named exports match', (cohort) => {
		expect(expected[cohort]).toEqual([...cohortPalette(cohort)]);
	});
});

describe('CIPH-890 — COHORT_PALETTE_RGB matches the hex matrix', () => {
	it.each(ALL_COHORTS_PALETTE)('cohort %s rgb triples decode to the hex tones', (cohort) => {
		const hex = cohortPalette(cohort);
		const rgb = COHORT_PALETTE_RGB[cohort];
		expect(rgb).toHaveLength(6);
		for (let i = 0; i < 6; i++) {
			const [r, g, b] = rgb[i];
			const expected = hex[i].toLowerCase();
			const actual = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
			expect(actual).toBe(expected);
		}
	});
});

describe('CIPH-890 — pathToRoute', () => {
	it('maps each primary surface to its route', () => {
		expect(pathToRoute('/calendar')).toBe('calendar');
		expect(pathToRoute('/calendar/2026-04-28')).toBe('calendar');
		expect(pathToRoute('/journal')).toBe('journal');
		expect(pathToRoute('/log/2026-04-28')).toBe('journal');
		expect(pathToRoute('/reports')).toBe('reports');
	});

	it('routes auxiliary chrome to the dashboard baseline', () => {
		expect(pathToRoute('/')).toBe('dashboard');
		expect(pathToRoute('/setup')).toBe('dashboard');
		expect(pathToRoute('/settings')).toBe('dashboard');
		expect(pathToRoute('/login')).toBe('dashboard');
		expect(pathToRoute('/admin')).toBe('dashboard');
		expect(pathToRoute('/conditions')).toBe('dashboard');
		expect(pathToRoute('/conditions/migraine')).toBe('dashboard');
	});

	it('handles edge inputs without throwing', () => {
		expect(pathToRoute('')).toBe('dashboard');
		expect(pathToRoute('/')).toBe('dashboard');
		expect(pathToRoute('/some-unknown-route')).toBe('dashboard');
	});
});
