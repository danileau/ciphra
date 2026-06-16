/**
 * Bedarfsmedikation ("as-needed" / rescue) preset contract.
 *
 * Single-source model (CIPH-pi19): preset rescue meds are seeded directly into
 * the editable `medications` list as `asNeeded` starter entries — there is no
 * separate preset-only `rescueMedications` array anymore. The FAB picker,
 * Settings editor, and exports all read `medications`.
 *
 * Asserts:
 *   - Each opinionated preset seeds the expected count of as-needed meds.
 *   - Each is a well-formed MedicationSlot (id / name / dose / asNeeded).
 *   - Presets with no clinical rescue protocol seed zero as-needed meds — so
 *     the FAB's third mode chip stays hidden for those cohorts.
 */

import { describe, it, expect } from 'vitest';
import {
	epilepsy,
	migraine,
	asthma,
	bipolar,
	ibd,
	parkinson,
	glaucoma,
	adhd,
	custom,
} from './presets';
import { bedarfMedsForPicker } from './medications';
import type { MedicationSlot } from './types';

const SHIPS_BEDARF = [
	{ name: 'epilepsy', bp: epilepsy, expectedCount: 2 },
	{ name: 'migraine', bp: migraine, expectedCount: 2 },
	{ name: 'asthma', bp: asthma, expectedCount: 2 },
	{ name: 'bipolar', bp: bipolar, expectedCount: 2 },
	{ name: 'ibd', bp: ibd, expectedCount: 2 },
] as const;

const SKIPS_BEDARF = [
	{ name: 'parkinson', bp: parkinson },
	{ name: 'glaucoma', bp: glaucoma },
	{ name: 'adhd', bp: adhd },
	{ name: 'custom', bp: custom },
] as const;

function assertWellFormed(med: MedicationSlot, presetName: string) {
	expect(med.id, `${presetName}: id is a stable slug`).toMatch(/^[a-z][a-z0-9_]*$/);
	expect(med.name, `${presetName}: name is a plain display string`).toBeTruthy();
	expect(med.name, `${presetName}: name is NOT an i18n key`).not.toMatch(/^rescue_med\.|^vital\./);
	expect(med.dose, `${presetName}: dose is non-empty`).toBeTruthy();
	expect(med.asNeeded, `${presetName}: asNeeded`).toBe(true);
}

describe('Bedarfsmedikation preset contract', () => {
	it('no preset defines a separate rescueMedications array (single source)', () => {
		for (const { bp } of [...SHIPS_BEDARF, ...SKIPS_BEDARF]) {
			expect(bp.rescueMedications == null || bp.rescueMedications.length === 0).toBe(true);
		}
	});

	for (const { name, bp, expectedCount } of SHIPS_BEDARF) {
		it(`${name} seeds ${expectedCount} as-needed medications`, () => {
			const meds = bedarfMedsForPicker(bp);
			expect(meds.length).toBe(expectedCount);
			for (const med of meds) assertWellFormed(med, name);
		});
	}

	for (const { name, bp } of SKIPS_BEDARF) {
		it(`${name} seeds no as-needed medications (no clinical protocol)`, () => {
			expect(bedarfMedsForPicker(bp).length).toBe(0);
		});
	}

	it('all seeded medication ids are unique within their blueprint', () => {
		for (const { name, bp } of SHIPS_BEDARF) {
			const ids = bedarfMedsForPicker(bp).map((m) => m.id);
			expect(new Set(ids).size, `${name}: duplicate ids`).toBe(ids.length);
		}
	});
});

describe('medication event doc shape', () => {
	// The shape the FAB writes and the render surfaces (journal/PDF/CSV/
	// dashboard) read. `type: 'event'` + `kind: 'medication'` — the kind
	// discriminator keeps med events distinct from freeform note-marker events.
	it('a medication event has type, kind, date, time, medicationId', () => {
		const doc = {
			type: 'event' as const,
			kind: 'medication' as const,
			date: '2026-04-27',
			time: '14:23',
			medicationId: 'midazolam_buccal',
			dose: '5 mg',
		};
		expect(doc.type).toBe('event');
		expect(doc.kind).toBe('medication');
		expect(doc.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(doc.time).toMatch(/^\d{2}:\d{2}$/);
		expect(doc.medicationId).toBeTruthy();
	});

	it('dose is optional — caller may rely on the configured med dose at render time', () => {
		const doc: { type: 'event'; kind: 'medication'; date: string; time: string; medicationId: string; dose?: string } = {
			type: 'event',
			kind: 'medication',
			date: '2026-04-27',
			time: '14:23',
			medicationId: 'sumatriptan',
		};
		expect(doc.dose).toBeUndefined();
	});
});
