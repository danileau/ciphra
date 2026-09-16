/**
 * Vital targets live on the encrypted blueprint; the old plaintext
 * localStorage key is migrated once and then removed.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
	clearLegacyVitalTargets,
	effectiveVitalTargets,
	legacyVitalTargetsKey,
	migrateLegacyVitalTargets,
	readLegacyVitalTargets,
} from './vitalTargets';
import { applyVitalTargetOverrides } from '$lib/pdf';
import type { Blueprint } from './types';

const bp = (over: Partial<Blueprint> = {}): Blueprint =>
	({
		version: 1,
		vitals: [{ id: 'bp_sys', label: 'vital.bp_sys', unit: 'mmHg', placeholder: '', referenceLine: { value: 140, labelKey: 'x' } }],
		...over,
	}) as Blueprint;

beforeEach(() => localStorage.clear());

describe('legacy key', () => {
	it('reads only finite, non-zero numbers', () => {
		localStorage.setItem(legacyVitalTargetsKey('hans'), '{"bp_sys":130,"weight":0,"x":"abc","hba1c":"7"}');
		expect(readLegacyVitalTargets('hans')).toEqual({ bp_sys: 130, hba1c: 7 });
		expect(readLegacyVitalTargets('eva')).toBeNull();
		expect(readLegacyVitalTargets('')).toBeNull();
	});

	it('survives malformed JSON', () => {
		localStorage.setItem(legacyVitalTargetsKey('hans'), '{nope');
		expect(readLegacyVitalTargets('hans')).toBeNull();
	});
});

describe('migrateLegacyVitalTargets', () => {
	it('folds the legacy key into a blueprint that has no targets', () => {
		localStorage.setItem(legacyVitalTargetsKey('hans'), '{"bp_sys":130}');
		expect(migrateLegacyVitalTargets(bp(), 'hans')?.vitalTargets).toEqual({ bp_sys: 130 });
	});

	it('does nothing when the blueprint already carries targets — the encrypted copy wins', () => {
		localStorage.setItem(legacyVitalTargetsKey('hans'), '{"bp_sys":130}');
		expect(migrateLegacyVitalTargets(bp({ vitalTargets: { bp_sys: 125 } }), 'hans')).toBeNull();
	});

	it('does nothing without a username (a linked patient\'s vault)', () => {
		localStorage.setItem(legacyVitalTargetsKey('hans'), '{"bp_sys":130}');
		expect(migrateLegacyVitalTargets(bp(), null)).toBeNull();
	});

	it('clearLegacyVitalTargets removes only that user\'s key', () => {
		localStorage.setItem(legacyVitalTargetsKey('hans'), '{"bp_sys":130}');
		localStorage.setItem(legacyVitalTargetsKey('eva'), '{"bp_sys":120}');
		clearLegacyVitalTargets('hans');
		expect(localStorage.getItem(legacyVitalTargetsKey('hans'))).toBeNull();
		expect(localStorage.getItem(legacyVitalTargetsKey('eva'))).not.toBeNull();
	});
});

describe('the doctor PDF reads the blueprint first', () => {
	it('blueprint targets override the reference line, even with no legacy key', () => {
		const out = applyVitalTargetOverrides(bp({ vitalTargets: { bp_sys: 125 } }), '');
		expect(out.vitals[0].referenceLine?.value).toBe(125);
	});

	it('an unmigrated blueprint falls back to the legacy key for the named user only', () => {
		localStorage.setItem(legacyVitalTargetsKey('hans'), '{"bp_sys":130}');
		expect(effectiveVitalTargets(bp(), 'hans')).toEqual({ bp_sys: 130 });
		expect(applyVitalTargetOverrides(bp(), '').vitals[0].referenceLine?.value).toBe(140);
	});
});
