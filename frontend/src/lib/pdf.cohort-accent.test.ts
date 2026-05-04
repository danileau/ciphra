/**
 * CIPH-pi18-2 Chunk 2 — Print-safe contrast for the cohort accents
 * the doctor PDF actually uses.
 *
 * `resolveCohortAccents(bp)` returns `primary` (slot 0) + `break`
 * (slot 2 with chart-only fallback). Both feed into stat-card value
 * text + trend chart line stroke + chart area fill. WCAG AA 4.5:1
 * against the warm-cream paper is the floor; doctors with print-
 * color-sensitivity glasses lose the headline numbers below that.
 *
 * The a11y review (2026-04-29) flagged cycle slot 0 `#b6306a` at
 * ~4.45:1 against `var(--surface)`. PDF paper `#faf8f6` is slightly
 * warmer so the same hue measures higher here (~5.5:1). This test
 * pins both contracts: if cohortPalette.ts ever shifts a slot 0 hex
 * below 4.5:1 against PDF paper, this test fails before regression
 * ships.
 */
import { describe, it, expect } from 'vitest';
import { ALL_COHORTS_PALETTE } from './cohortPalette';
import { presets } from './blueprint/presets';
import { resolveCohortAccents } from './pdf';
import type { Blueprint } from './blueprint';

const PAPER: [number, number, number] = [250, 248, 246];

function relLum([r, g, b]: readonly [number, number, number]): number {
	const channel = (c: number) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(
	a: readonly [number, number, number],
	b: readonly [number, number, number],
): number {
	const la = relLum(a);
	const lb = relLum(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// One concrete blueprint per cohort, picked from `presets`. cohortOf()
// derives the cohort from `conditionId`, so any preset that maps to
// the cohort works as fixture.
function fixtureFor(cohort: string): Blueprint {
	const map: Record<string, string> = {
		discrete: 'epilepsy',
		cycle: 'endometriosis',
		phase: 'bipolar',
		narrative: 'migraine',
		custom: 'custom',
	};
	const id = map[cohort];
	const found = presets.find((p) => p.id === id);
	if (!found) throw new Error(`No preset for cohort ${cohort} (id ${id})`);
	return structuredClone(found.blueprint);
}

describe('resolveCohortAccents — print-safe contrast', () => {
	it.each(ALL_COHORTS_PALETTE)(
		'%s primary clears WCAG AA 4.5:1 against PDF paper',
		(cohort) => {
			const acc = resolveCohortAccents(fixtureFor(cohort));
			expect(contrast(acc.primary, PAPER)).toBeGreaterThanOrEqual(4.5);
		},
	);

	it.each(ALL_COHORTS_PALETTE)(
		'%s break clears WCAG AA 4.5:1 against PDF paper (with chart-only fallback)',
		(cohort) => {
			const acc = resolveCohortAccents(fixtureFor(cohort));
			expect(contrast(acc.break, PAPER)).toBeGreaterThanOrEqual(4.5);
		},
	);

	it('cycle break falls back to BRAND.ochre (slot 2 clay-rose is chart-only)', () => {
		const acc = resolveCohortAccents(fixtureFor('cycle'));
		expect(acc.break).toEqual([159, 99, 11]);
	});

	it('custom break falls back to BRAND.ochre (slot 2 clay is chart-only)', () => {
		const acc = resolveCohortAccents(fixtureFor('custom'));
		expect(acc.break).toEqual([159, 99, 11]);
	});

	it('discrete break stays on slot 2 ochre (DISCRETE_TONES is verbatim)', () => {
		const acc = resolveCohortAccents(fixtureFor('discrete'));
		expect(acc.break).toEqual([159, 99, 11]);
	});

	it('discrete primary equals BRAND.brick (the universal data-accent)', () => {
		const acc = resolveCohortAccents(fixtureFor('discrete'));
		expect(acc.primary).toEqual([178, 60, 44]);
	});
});
