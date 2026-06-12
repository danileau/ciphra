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
import {
	applyDateFormatChoice,
	applyPrimarySurfaceChoice,
	applyWelcomeDismissed,
} from './preferences';
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
