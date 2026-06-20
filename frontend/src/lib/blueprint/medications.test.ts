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
	medAdherence,
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
	it('NEVER injects into a non-empty medications list — curated/migrated data is left untouched', () => {
		// The data-loss report: an epilepc migrant who curated their meds had
		// preset Midazolam/Diazepam auto-appended on a deploy. Fold must no-op.
		const b = bp({
			medications: [slot({ id: 'urbanyl', name: 'Urbanyl' }), slot({ id: 'keppra', name: 'Keppra' })],
			rescueMedications: [
				{ id: 'midazolam_buccal', label: 'rescue_med.midazolam', unit: 'mg', defaultDose: '5' } as RescueMedication,
				{ id: 'diazepam_rectal', label: 'rescue_med.diazepam', unit: 'mg', defaultDose: '10' } as RescueMedication,
			],
		});
		// Returns null → layout does no save → the user's blueprint is untouched.
		expect(foldRescueMedications(b, t)).toBeNull();
	});
});

describe('medAdherence (assume-taken model)', () => {
	const doc = (data: Record<string, unknown>) => ({ data: { type: 'entry', ...data } });

	it('scheduled meds: assumed taken on every logged day when nothing is missed', () => {
		const med = slot({ id: 'lev', asNeeded: false });
		const docs = [doc({}), doc({}), doc({})]; // 3 logged days, no misses
		expect(medAdherence(med, docs, 3)).toEqual({ taken: 3, total: 3, pct: 100 });
	});

	it('scheduled meds: subtracts only explicitly-missed days', () => {
		const med = slot({ id: 'lev', asNeeded: false });
		const docs = [doc({ missedMedications: ['lev'] }), doc({}), doc({ missedMedications: ['other'] }), doc({})];
		// 4 logged days, 1 missed for this med → 3 taken, 75%
		expect(medAdherence(med, docs, 4)).toEqual({ taken: 3, total: 4, pct: 75 });
	});

	it('scheduled meds: legacy entries (per-day toggle, no missedMedications) read as taken', () => {
		const med = slot({ id: 'lev', asNeeded: false });
		// Old-model docs carry medications:{lev:false} but no missedMedications.
		const docs = [doc({ medications: { lev: false } }), doc({ medications: { lev: true } })];
		expect(medAdherence(med, docs, 2)).toEqual({ taken: 2, total: 2, pct: 100 });
	});

	it('as-needed meds: counts only days the taken-toggle was on', () => {
		const med = slot({ id: 'ibu', asNeeded: true });
		const docs = [doc({ medications: { ibu: true } }), doc({ medications: { ibu: false } }), doc({})];
		expect(medAdherence(med, docs, 3)).toEqual({ taken: 1, total: 3, pct: 33 });
	});

	it('zero logged days → 0% (no divide-by-zero)', () => {
		expect(medAdherence(slot({ asNeeded: false }), [], 0)).toEqual({ taken: 0, total: 0, pct: 0 });
	});
});
