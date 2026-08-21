/**
 * CIPH-pi18-3 — Unset-discriminator contract for the two settings-driven
 * blueprint preferences.
 *
 * Both `dateFormat` and `primaryBrowseSurface` use the same persistence
 * contract: picking the default value DELETES the field rather than
 * writing the default verbatim. Untouched blueprints stay minimal in
 * the persisted JSON. Linus dry-run #1 caught that 852 shipped without
 * a test for this; we cover both helpers here.
 */
import { describe, it, expect } from 'vitest';
import { presets } from './presets';
import { applyDateFormatChoice, applyPrimarySurfaceChoice, applyWelcomeDismissed, formatDateChoice, formatISODateChoice } from './preferences';
import type { Blueprint } from './types';

const fixtureBlueprint = () => structuredClone(presets[0]);

describe('applyDateFormatChoice', () => {
	it('writes a non-default choice explicitly', () => {
		const bp = fixtureBlueprint();
		const next = applyDateFormatChoice(bp, 'iso');
		expect(next.dateFormat).toBe('iso');
	});

	it('writes us / uk choices explicitly', () => {
		const bp = fixtureBlueprint();
		expect(applyDateFormatChoice(bp, 'us').dateFormat).toBe('us');
		expect(applyDateFormatChoice(bp, 'dd/mm/yyyy').dateFormat).toBe('dd/mm/yyyy');
	});

	it('deletes the field when the user reverts to the default', () => {
		const bp = fixtureBlueprint();
		bp.dateFormat = 'iso';
		const next = applyDateFormatChoice(bp, 'dd.mm.yyyy');
		expect('dateFormat' in next).toBe(false);
	});

	it('does not mutate the input blueprint', () => {
		const bp = fixtureBlueprint();
		applyDateFormatChoice(bp, 'iso');
		expect(bp.dateFormat).toBeUndefined();
	});
});

describe('applyPrimarySurfaceChoice', () => {
	it('writes a non-auto choice explicitly', () => {
		const bp = fixtureBlueprint();
		const next = applyPrimarySurfaceChoice(bp, 'calendar');
		expect(next.primaryBrowseSurface).toBe('calendar');
	});

	it('deletes the field on auto', () => {
		const bp = fixtureBlueprint();
		bp.primaryBrowseSurface = 'trend';
		const next = applyPrimarySurfaceChoice(bp, 'auto');
		expect('primaryBrowseSurface' in next).toBe(false);
	});

	it('does not mutate the input blueprint', () => {
		const bp = fixtureBlueprint();
		bp.primaryBrowseSurface = 'trend';
		applyPrimarySurfaceChoice(bp, 'journal');
		expect(bp.primaryBrowseSurface).toBe('trend');
	});
});

describe('applyWelcomeDismissed (2026-06-12 — durable welcome dismissal)', () => {
	const bp = { conditionId: 'epilepsy', episodeTypes: [] } as unknown as Blueprint;

	it('records a variant without mutating the input', () => {
		const next = applyWelcomeDismissed(bp, 'migrate');
		expect(next.dismissedWelcome).toEqual(['migrate']);
		expect((bp as Blueprint).dismissedWelcome).toBeUndefined();
	});

	it('is idempotent and accumulates both variants sorted', () => {
		let next = applyWelcomeDismissed(bp, 'migrate');
		next = applyWelcomeDismissed(next, 'migrate');
		next = applyWelcomeDismissed(next, 'web');
		expect(next.dismissedWelcome).toEqual(['migrate', 'web']);
	});
});

describe('formatDateChoice — the canonical day-precision formatter', () => {
	const d = new Date(2026, 7, 4, 12); // 4 August 2026

	it('renders each choice', () => {
		expect(formatDateChoice(d, 'dd.mm.yyyy')).toBe('04.08.2026');
		expect(formatDateChoice(d, 'dd/mm/yyyy')).toBe('04/08/2026');
		expect(formatDateChoice(d, 'iso')).toBe('2026-08-04');
		expect(formatDateChoice(d, 'us')).toBe('08/04/2026');
	});

	it('falls back to the Swiss default when unset', () => {
		// `dateFormat` is deleted from the blueprint when the user picks the
		// default, so `undefined` is the common case, not an error case.
		expect(formatDateChoice(d, undefined)).toBe('04.08.2026');
	});

	it('pads single digits so columns align in a printed table', () => {
		expect(formatDateChoice(new Date(2026, 0, 1, 12), 'dd.mm.yyyy')).toBe('01.01.2026');
	});

	it('every choice carries the year', () => {
		// The PDF drops locale month names in favour of this, so the year has
		// to come from the format itself — a 2-year report spans two.
		for (const c of ['dd.mm.yyyy', 'dd/mm/yyyy', 'iso', 'us'] as const) {
			expect(formatDateChoice(d, c)).toContain('2026');
		}
	});

	it('formatISODateChoice does not slip a day in a positive-offset zone', () => {
		// Noon anchor: parsing `YYYY-MM-DD` as UTC midnight lands on the
		// previous day in CET/CEST.
		expect(formatISODateChoice('2026-08-04', 'iso')).toBe('2026-08-04');
		expect(formatISODateChoice('2026-01-01', 'dd.mm.yyyy')).toBe('01.01.2026');
	});
});
