/**
 * CIPH-852 — Cohort + primaryBrowseSurface coverage.
 *
 * Every registered preset must:
 *  - map to a known cohort (no accidental falls to 'custom' unless intended)
 *  - declare `primaryBrowseSurface` explicitly (no reliance on runtime fallback
 *    for registered presets — fallback is only for pre-852 saved blueprints)
 *  - have `primaryBrowseSurface` match the cohort's default (unless the preset
 *    is 'custom', which users override freely)
 */
import { describe, expect, it } from 'vitest';
import { presets } from './presets';
import { ALL_COHORTS, cohortOf, getCohort, getPrimaryBrowseSurface } from './cohort';

const COHORT_DEFAULT: Record<string, 'journal' | 'calendar' | 'trend'> = {
	discrete: 'trend',
	cycle: 'calendar',
	phase: 'calendar',
	narrative: 'journal',
	custom: 'journal',
};

describe('cohort mapping', () => {
	it('resolves to one of the known cohorts', () => {
		for (const c of ALL_COHORTS) {
			expect(['discrete', 'cycle', 'phase', 'narrative', 'custom']).toContain(c);
		}
	});

	it('returns custom for unknown or missing conditionId', () => {
		expect(getCohort(undefined)).toBe('custom');
		expect(getCohort('')).toBe('custom');
		expect(getCohort('not-a-real-condition')).toBe('custom');
	});
});

describe('every registered preset', () => {
	for (const p of presets) {
		describe(p.id, () => {
			it('declares primaryBrowseSurface explicitly', () => {
				expect(p.blueprint.primaryBrowseSurface).toBeDefined();
				expect(['journal', 'calendar', 'trend']).toContain(
					p.blueprint.primaryBrowseSurface,
				);
			});

			it('declared surface matches its cohort default', () => {
				const cohort = cohortOf(p.blueprint);
				// Custom is exempt — user-driven.
				if (cohort === 'custom') return;
				expect(p.blueprint.primaryBrowseSurface).toBe(COHORT_DEFAULT[cohort]);
			});

			it('getPrimaryBrowseSurface returns the declared value', () => {
				expect(getPrimaryBrowseSurface(p.blueprint)).toBe(
					p.blueprint.primaryBrowseSurface,
				);
			});
		});
	}
});

describe('getPrimaryBrowseSurface fallback', () => {
	it('falls back to cohort default when field is absent', () => {
		const epilepsyLike = { conditionId: 'epilepsy' } as any;
		expect(getPrimaryBrowseSurface(epilepsyLike)).toBe('trend');

		const endoLike = { conditionId: 'endometriosis' } as any;
		expect(getPrimaryBrowseSurface(endoLike)).toBe('calendar');

		const bipolarLike = { conditionId: 'bipolar' } as any;
		expect(getPrimaryBrowseSurface(bipolarLike)).toBe('calendar');
	});

	it('user override on blueprint takes precedence over cohort default', () => {
		// Epilepsy user who wants calendar-first anyway
		const overridden = {
			conditionId: 'epilepsy',
			primaryBrowseSurface: 'calendar',
		} as any;
		expect(getPrimaryBrowseSurface(overridden)).toBe('calendar');
	});

	it('null/undefined blueprint falls back to journal (custom default)', () => {
		expect(getPrimaryBrowseSurface(null)).toBe('journal');
		expect(getPrimaryBrowseSurface(undefined)).toBe('journal');
	});
});
