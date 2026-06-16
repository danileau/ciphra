/**
 * Single-source medication helpers (CIPH-pi19).
 *
 * Covers the FAB picker source, the id→label resolver (configured-first with a
 * preset fallback for already-logged events), the PDF/CSV column union, and the
 * one-time fold migration for legacy blueprints.
 */
import { describe, it, expect } from 'vitest';
import {
	bedarfMedsForPicker,
	hasBedarfMeds,
	resolveMedDisplay,
	bedarfMedColumns,
	foldRescueMedications,
} from './medications';
import type { Blueprint, MedicationSlot, RescueMedication } from './types';

// Minimal translator: echoes keys, but renders the two we care about.
const t = (key: string) => {
	const dict: Record<string, string> = {
		'rescue_med.midazolam': 'Midazolam',
		'vital.unit_mg': 'mg',
	};
	return dict[key] ?? key;
};

const slot = (over: Partial<MedicationSlot> = {}): MedicationSlot => ({
	id: 'm1', name: 'Ibuprofen', dose: '400 mg', schedule: '', asNeeded: true, ...over,
});

const bp = (over: Partial<Blueprint> = {}): Blueprint =>
	({ version: 1, medications: [], ...over } as Blueprint);

describe('bedarfMedsForPicker / hasBedarfMeds', () => {
	it('returns only as-needed meds', () => {
		const b = bp({ medications: [slot({ id: 'a' }), slot({ id: 'b', asNeeded: false })] });
		expect(bedarfMedsForPicker(b).map((m) => m.id)).toEqual(['a']);
		expect(hasBedarfMeds(b)).toBe(true);
	});
	it('is false/empty when nothing is as-needed', () => {
		const b = bp({ medications: [slot({ asNeeded: false })] });
		expect(bedarfMedsForPicker(b)).toEqual([]);
		expect(hasBedarfMeds(b)).toBe(false);
		expect(hasBedarfMeds(null)).toBe(false);
	});
});

describe('resolveMedDisplay', () => {
	it('resolves a configured med to its plain name (unit empty — dose carries it)', () => {
		const b = bp({ medications: [slot({ id: 'ibu', name: 'Ibuprofen' })] });
		expect(resolveMedDisplay(b, 'ibu', t)).toEqual({ label: 'Ibuprofen', unit: '' });
	});
	it('falls back to a preset rescue med (translated label + unit) for historical events', () => {
		const b = bp({
			medications: [],
			rescueMedications: [{ id: 'midazolam_buccal', label: 'rescue_med.midazolam', unit: 'mg', defaultDose: '5' } as RescueMedication],
		});
		expect(resolveMedDisplay(b, 'midazolam_buccal', t)).toEqual({ label: 'Midazolam', unit: 'mg' });
	});
	it('configured wins over a preset with the same id', () => {
		const b = bp({
			medications: [slot({ id: 'midazolam_buccal', name: 'Midazolam 5mg buccal' })],
			rescueMedications: [{ id: 'midazolam_buccal', label: 'rescue_med.midazolam', unit: 'mg' } as RescueMedication],
		});
		expect(resolveMedDisplay(b, 'midazolam_buccal', t).label).toBe('Midazolam 5mg buccal');
	});
	it('returns the raw id when unknown, and ? for missing', () => {
		expect(resolveMedDisplay(bp(), 'ghost', t)).toEqual({ label: 'ghost', unit: '' });
		expect(resolveMedDisplay(bp(), undefined, t)).toEqual({ label: '?', unit: '' });
	});
});

describe('bedarfMedColumns', () => {
	it('unions configured as-needed meds with leftover preset ids, deduped', () => {
		const b = bp({
			medications: [slot({ id: 'ibu', name: 'Ibuprofen' })],
			rescueMedications: [{ id: 'midazolam_buccal', label: 'rescue_med.midazolam', unit: 'mg' } as RescueMedication],
		});
		const cols = bedarfMedColumns(b, t);
		expect(cols.map((c) => c.id)).toEqual(['ibu', 'midazolam_buccal']);
		expect(cols[0]).toEqual({ id: 'ibu', label: 'Ibuprofen', unit: '' });
		expect(cols[1]).toEqual({ id: 'midazolam_buccal', label: 'Midazolam', unit: 'mg' });
	});
});

describe('foldRescueMedications (one-time migration)', () => {
	it('folds legacy preset rescueMedications into the editable list and drops the field', () => {
		const b = bp({
			medications: [],
			rescueMedications: [{ id: 'midazolam_buccal', label: 'rescue_med.midazolam', unit: 'mg', defaultDose: '5' } as RescueMedication],
		});
		const out = foldRescueMedications(b, t);
		expect(out).not.toBeNull();
		expect(out!.rescueMedications).toBeUndefined();
		expect(out!.medications).toHaveLength(1);
		expect(out!.medications[0]).toMatchObject({ id: 'midazolam_buccal', name: 'Midazolam', dose: '5 mg', asNeeded: true });
	});
	it('is a no-op (returns null) for blueprints already in single-source shape', () => {
		expect(foldRescueMedications(bp({ medications: [slot()] }), t)).toBeNull();
		expect(foldRescueMedications(null, t)).toBeNull();
	});
	it('does not duplicate a med already present by id', () => {
		const b = bp({
			medications: [slot({ id: 'midazolam_buccal', name: 'Midazolam' })],
			rescueMedications: [{ id: 'midazolam_buccal', label: 'rescue_med.midazolam' } as RescueMedication],
		});
		const out = foldRescueMedications(b, t);
		// Only the rescueMedications field is dropped; no duplicate slot added.
		expect(out!.medications).toHaveLength(1);
		expect(out!.rescueMedications).toBeUndefined();
	});
});
