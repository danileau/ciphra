/**
 * Dose bands — geometry of the before/after structure (2026-09-17).
 */
import { describe, it, expect } from 'vitest';
import { binPosition, dayBins, doseBands, medsChangedIn, monthBins } from './doseBands';
import type { MedicationSlot } from '$lib/blueprint/types';

const fycompa: MedicationSlot = {
	id: 'fyc', name: 'Fycompa', dose: '8mg', schedule: 'abends', asNeeded: false,
	periods: [
		{ to: '2026-09-15', dose: '10mg', schedule: 'abends' },
		{ from: '2026-09-16', dose: '8mg', schedule: 'abends' },
	],
};
const lamotrigin: MedicationSlot = {
	id: 'lam', name: 'Lamotrigin', dose: '50 mg', schedule: '', asNeeded: false,
	periods: [
		{ to: '2026-09-04', dose: '25 mg', schedule: '' },
		{ from: '2026-09-05', dose: '50 mg', schedule: '' },
	],
};
const steady: MedicationSlot = { id: 'st', name: 'Steady', dose: '1', schedule: '', asNeeded: false };

describe('binPosition', () => {
	const sept = dayBins(2026, 8);
	it('puts a day\'s start and end on the edges of its bin', () => {
		expect(sept).toHaveLength(30);
		expect(binPosition(sept, '2026-09-01', 'start')).toBe(-0.5);
		expect(binPosition(sept, '2026-09-16', 'start')).toBe(14.5);
		expect(binPosition(sept, '2026-09-16', 'end')).toBe(15.5);
		expect(binPosition(sept, '2026-09-30', 'end')).toBe(29.5);
	});

	it('clamps dates outside the axis', () => {
		expect(binPosition(sept, '2026-08-01', 'start')).toBe(-0.5);
		expect(binPosition(sept, '2026-10-05', 'end')).toBe(29.5);
	});

	it('places a date proportionally inside a month bin', () => {
		const months = monthBins(2025, 9, 24); // Oct 2025 … Sep 2027
		expect(months[0]).toEqual({ from: '2025-10-01', to: '2025-10-31' });
		expect(months[23]).toEqual({ from: '2027-09-01', to: '2027-09-30' });
		// 16 Sept 2026 = bin 11, 15 of 30 days in.
		expect(binPosition(months, '2026-09-16', 'start')).toBeCloseTo(11 - 0.5 + 15 / 30, 10);
	});
});

describe('doseBands', () => {
	it('splits the month at the change: 10 mg before, 8 mg after, one boundary', () => {
		const { bands, boundaries } = doseBands(fycompa, dayBins(2026, 8));
		expect(bands.map((b) => [b.dose, b.start, b.end, b.index])).toEqual([
			['10mg', -0.5, 14.5, 0],
			['8mg', 14.5, 29.5, 1],
		]);
		expect(boundaries.map((b) => [b.at, b.change.kind, b.change.before?.dose, b.change.after?.dose])).toEqual([
			[14.5, 'change', '10mg', '8mg'],
		]);
	});

	it('draws nothing for a medication that did not change on this axis', () => {
		expect(doseBands(fycompa, dayBins(2026, 7))).toEqual({ bands: [], boundaries: [] });
		expect(doseBands(steady, dayBins(2026, 8))).toEqual({ bands: [], boundaries: [] });
	});

	it('a start inside the window leaves the days before it unshaded', () => {
		const started: MedicationSlot = { ...steady, periods: [{ from: '2026-09-10', dose: '1', schedule: '' }] };
		const { bands, boundaries } = doseBands(started, dayBins(2026, 8));
		expect(bands.map((b) => [b.start, b.end])).toEqual([[8.5, 29.5]]);
		expect(boundaries[0].change.kind).toBe('start');
	});
});

describe('medsChangedIn', () => {
	it('offers the changed medications, most recent change first', () => {
		expect(medsChangedIn([lamotrigin, steady, fycompa], '2026-09-01', '2026-09-30').map((m) => m.id)).toEqual(['fyc', 'lam']);
		expect(medsChangedIn([lamotrigin, fycompa], '2026-10-01', '2026-10-31')).toEqual([]);
	});
});
