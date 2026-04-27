/**
 * CIPH-881 — Rescue medication blueprint + doc shape contract.
 *
 * Asserts:
 *   - Each opinionated preset that ships rescueMedications has the
 *     expected count and well-formed entries.
 *   - The RescueMedication shape (id / label / unit / defaultDose) is
 *     respected — labels are i18n keys, units are raw display strings,
 *     ids are stable slugs that the FAB / journal / PDF / CSV / dashboard
 *     all key off.
 *   - Presets with no clinical rescue protocol (e.g. parkinson, glaucoma,
 *     adhd, custom) deliberately omit the field — so the FAB's third mode
 *     chip stays hidden for those cohorts.
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
import type { RescueMedication } from './types';

const SHIPS_RESCUE = [
	{ name: 'epilepsy', bp: epilepsy, expectedCount: 2 },
	{ name: 'migraine', bp: migraine, expectedCount: 2 },
	{ name: 'asthma', bp: asthma, expectedCount: 2 },
	{ name: 'bipolar', bp: bipolar, expectedCount: 2 },
	{ name: 'ibd', bp: ibd, expectedCount: 2 },
] as const;

const SKIPS_RESCUE = [
	{ name: 'parkinson', bp: parkinson },
	{ name: 'glaucoma', bp: glaucoma },
	{ name: 'adhd', bp: adhd },
	{ name: 'custom', bp: custom },
] as const;

function assertWellFormed(med: RescueMedication, presetName: string) {
	expect(med.id, `${presetName}: id`).toMatch(/^[a-z][a-z0-9_]*$/);
	expect(med.label, `${presetName}: label is an i18n key`).toMatch(/^rescue_med\./);
	if (med.unit !== undefined) {
		expect(med.unit, `${presetName}: unit is a raw display string`).not.toMatch(/^vital\.|^unit\./);
	}
	if (med.defaultDose !== undefined) {
		expect(med.defaultDose, `${presetName}: defaultDose is non-empty`).toBeTruthy();
	}
}

describe('CIPH-881 rescue-medication preset contract', () => {
	for (const { name, bp, expectedCount } of SHIPS_RESCUE) {
		it(`${name} ships ${expectedCount} rescue medications`, () => {
			expect(bp.rescueMedications).toBeDefined();
			expect(bp.rescueMedications!.length).toBe(expectedCount);
			for (const med of bp.rescueMedications!) {
				assertWellFormed(med, name);
			}
		});
	}

	for (const { name, bp } of SKIPS_RESCUE) {
		it(`${name} omits rescueMedications (no clinical protocol)`, () => {
			expect(bp.rescueMedications == null || bp.rescueMedications.length === 0).toBe(true);
		});
	}

	it('all rescue medication ids are unique within their blueprint', () => {
		for (const { name, bp } of SHIPS_RESCUE) {
			const ids = bp.rescueMedications!.map((m) => m.id);
			expect(new Set(ids).size, `${name}: duplicate ids`).toBe(ids.length);
		}
	});
});

describe('CIPH-881 medication event doc shape', () => {
	// Minimal contract test that documents the shape the FAB writes and the
	// render surfaces (journal/PDF/CSV/dashboard) read. The doc itself is
	// `type: 'event'` + `kind: 'medication'` — the kind discriminator keeps
	// rescue-med events distinct from the freeform note-marker events the
	// log mode writes.
	it('a medication event has type, kind, date, time, medicationId', () => {
		const doc = {
			type: 'event' as const,
			kind: 'medication' as const,
			date: '2026-04-27',
			time: '14:23',
			medicationId: 'midazolam_buccal',
			dose: '5',
		};
		expect(doc.type).toBe('event');
		expect(doc.kind).toBe('medication');
		expect(doc.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(doc.time).toMatch(/^\d{2}:\d{2}$/);
		expect(doc.medicationId).toBeTruthy();
	});

	it('dose is optional — caller may rely on the preset defaultDose at render time', () => {
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
