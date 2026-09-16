/**
 * Medication dose history (2026-09-16).
 *
 * The scenario that motivated it: 2× 10 mg daily, switching to 2× 12 mg from
 * tomorrow. Before, the only way to record that was to overwrite "10 mg" —
 * which rewrote every past day — or to delete the medication, which dropped
 * it from every report. These tests pin that a change is a step in time, that
 * days before it keep what they had, and that every step can be read back.
 */
import { describe, it, expect } from 'vitest';
import {
	addDaysISO,
	applyCorrection,
	applyDoseChange,
	applyStop,
	applySwitch,
	createMedication,
	docReferencesMed,
	earliestChangeDate,
	isActiveOn,
	medHistoryDays,
	medicationChanges,
	medPeriods,
	medStatusOn,
	periodOn,
	plannedChange,
	undoLastChange,
} from './medicationHistory';
import type { MedicationSlot } from './types';

const legacy = (over: Partial<MedicationSlot> = {}): MedicationSlot => ({
	id: 'lam', name: 'Lamotrigin', dose: '10 mg', schedule: '2× täglich', asNeeded: false, ...over,
});

describe('addDaysISO', () => {
	it('crosses month and year boundaries on local dates', () => {
		expect(addDaysISO('2026-09-30', 1)).toBe('2026-10-01');
		expect(addDaysISO('2026-01-01', -1)).toBe('2025-12-31');
		expect(addDaysISO('2028-02-28', 1)).toBe('2028-02-29');
	});
	it('is not moved by a DST switch (last Sunday of March / October in Europe)', () => {
		expect(addDaysISO('2026-03-28', 1)).toBe('2026-03-29');
		expect(addDaysISO('2026-03-29', 1)).toBe('2026-03-30');
		expect(addDaysISO('2026-10-25', -1)).toBe('2026-10-24');
	});
});

describe('medPeriods — a medication saved before dose history', () => {
	it('reads as one open-ended period carrying its dose, active on any day', () => {
		const med = legacy();
		expect(medPeriods(med)).toEqual([{ dose: '10 mg', schedule: '2× täglich' }]);
		expect(isActiveOn(med, '1999-01-01')).toBe(true);
		expect(isActiveOn(med, '2030-01-01')).toBe(true);
		expect(earliestChangeDate(med)).toBeNull();
	});
});

describe('applyDoseChange — the 10 mg → 12 mg scenario', () => {
	const changed = applyDoseChange(legacy(), { from: '2026-09-17', dose: '12 mg', schedule: '2× täglich', note: 'Aufdosierung' });

	it('keeps 10 mg on every day before the change and 12 mg from the change on', () => {
		expect(periodOn(changed, '2025-01-01')?.dose).toBe('10 mg');
		expect(periodOn(changed, '2026-09-16')?.dose).toBe('10 mg');
		expect(periodOn(changed, '2026-09-17')?.dose).toBe('12 mg');
		expect(periodOn(changed, '2027-01-01')?.dose).toBe('12 mg');
	});

	it('keeps the id, and mirrors the newest dose onto the legacy fields', () => {
		expect(changed.id).toBe('lam');
		expect(changed.dose).toBe('12 mg');
		expect(changed.periods).toEqual([
			{ to: '2026-09-16', dose: '10 mg', schedule: '2× täglich' },
			{ from: '2026-09-17', dose: '12 mg', schedule: '2× täglich', note: 'Aufdosierung' },
		]);
	});

	it('shows up as a planned change the day before, and as a change event', () => {
		expect(plannedChange(changed, '2026-09-16')).toEqual({
			date: '2026-09-17', next: changed.periods![1],
		});
		expect(plannedChange(changed, '2026-09-17')).toBeNull();
		expect(medicationChanges([changed])).toEqual([{
			date: '2026-09-17', medId: 'lam', name: 'Lamotrigin', kind: 'change',
			before: { dose: '10 mg', schedule: '2× täglich' },
			after: { dose: '12 mg', schedule: '2× täglich' },
			note: 'Aufdosierung',
		}]);
	});

	it('a second change dated earlier than a planned one replaces the plan from that day on', () => {
		const again = applyDoseChange(changed, { from: '2026-09-10', dose: '11 mg', schedule: '2× täglich' });
		expect(again.periods!.map((p) => [p.from, p.to, p.dose])).toEqual([
			[undefined, '2026-09-09', '10 mg'],
			['2026-09-10', undefined, '11 mg'],
		]);
	});
});

describe('applyStop / resume', () => {
	const started = createMedication('lam', { name: 'Lamotrigin', dose: '25 mg', schedule: '', asNeeded: false, from: '2026-06-01' });

	it('stops from the first day without the medication, keeping history before it', () => {
		const stopped = applyStop(started, '2026-09-01', { endNote: 'Nebenwirkungen' })!;
		expect(isActiveOn(stopped, '2026-08-31')).toBe(true);
		expect(isActiveOn(stopped, '2026-09-01')).toBe(false);
		expect(medStatusOn(stopped, '2026-09-05')).toBe('stopped');
		expect(medicationChanges([stopped]).map((c) => [c.kind, c.date, c.note])).toEqual([
			['start', '2026-06-01', undefined],
			['stop', '2026-09-01', 'Nebenwirkungen'],
		]);
	});

	it('refuses a stop that would leave no day taken (that is a mistaken medication)', () => {
		expect(applyStop(started, '2026-06-01')).toBeNull();
		expect(applyStop(started, '2026-05-01')).toBeNull();
		expect(earliestChangeDate(started)).toBe('2026-06-02');
	});

	it('resuming after a gap keeps the gap and records a stop + a new start', () => {
		const stopped = applyStop(started, '2026-09-01')!;
		const resumed = applyDoseChange(stopped, { from: '2026-10-01', dose: '50 mg', schedule: '' });
		expect(isActiveOn(resumed, '2026-09-15')).toBe(false);
		expect(periodOn(resumed, '2026-10-01')?.dose).toBe('50 mg');
		expect(medicationChanges([resumed]).map((c) => [c.kind, c.date])).toEqual([
			['start', '2026-06-01'],
			['stop', '2026-09-01'],
			['start', '2026-10-01'],
		]);
	});

	it('a med added with a future start is upcoming until then', () => {
		const later = createMedication('x', { name: 'X', dose: '1', schedule: '', asNeeded: false, from: '2026-10-01' });
		expect(medStatusOn(later, '2026-09-16')).toBe('upcoming');
		expect(plannedChange(later, '2026-09-16')?.date).toBe('2026-10-01');
	});
});

describe('applySwitch', () => {
	it('stops one medication and starts the other on the same day, linked both ways', () => {
		const res = applySwitch(legacy(), 'lev', { name: 'Levetiracetam', dose: '500 mg', schedule: '2× täglich', asNeeded: false, note: 'Umstellung' }, '2026-09-17')!;
		expect(isActiveOn(res.stopped, '2026-09-17')).toBe(false);
		expect(isActiveOn(res.started, '2026-09-16')).toBe(false);
		expect(isActiveOn(res.started, '2026-09-17')).toBe(true);
		const changes = medicationChanges([res.stopped, res.started]);
		expect(changes.map((c) => [c.name, c.kind, c.date, c.switchedTo, c.switchedFrom])).toEqual([
			['Lamotrigin', 'stop', '2026-09-17', 'lev', undefined],
			['Levetiracetam', 'start', '2026-09-17', undefined, 'lam'],
		]);
	});
});

describe('applyCorrection — fixing a typo is retroactive by design', () => {
	it('rewrites only the latest period, and renames', () => {
		const changed = applyDoseChange(legacy(), { from: '2026-09-17', dose: '21 mg', schedule: '2× täglich' });
		const fixed = applyCorrection(changed, { name: 'Lamotrigine', dose: '12 mg', schedule: '2× täglich', asNeeded: false });
		expect(fixed.name).toBe('Lamotrigine');
		expect(periodOn(fixed, '2026-09-16')?.dose).toBe('10 mg');
		expect(periodOn(fixed, '2026-09-17')?.dose).toBe('12 mg');
	});
});

describe('undoLastChange', () => {
	it('walks back a stop, then a change, one step at a time', () => {
		const changed = applyDoseChange(legacy(), { from: '2026-09-17', dose: '12 mg', schedule: '2× täglich' });
		const stopped = applyStop(changed, '2026-12-01')!;
		const unstopped = undoLastChange(stopped)!;
		expect(unstopped.periods).toEqual(changed.periods);
		const unchanged = undoLastChange(unstopped)!;
		expect(medPeriods(unchanged)).toEqual([{ dose: '10 mg', schedule: '2× täglich' }]);
		expect(unchanged.dose).toBe('10 mg');
		expect(undoLastChange(unchanged)).toBeNull();
	});

	it('undoing a resume after a gap leaves the earlier stop in place', () => {
		const started = createMedication('m', { name: 'M', dose: '1', schedule: '', asNeeded: false, from: '2026-01-01' });
		const resumed = applyDoseChange(applyStop(started, '2026-03-01')!, { from: '2026-05-01', dose: '2', schedule: '' });
		const undone = undoLastChange(resumed)!;
		expect(isActiveOn(undone, '2026-02-28')).toBe(true);
		expect(isActiveOn(undone, '2026-06-01')).toBe(false);
	});
});

describe('medHistoryDays — what deleting would strip', () => {
	const entry = (date: string, data: Record<string, unknown> = {}) => ({ data: { type: 'entry', date, ...data } });

	it('counts every logged day of a scheduled med (assumed taken), not just the missed ones', () => {
		const med = legacy();
		expect(medHistoryDays(med, [entry('2026-09-01'), entry('2026-09-02', { missedMedications: ['lam'] })])).toBe(2);
	});

	it('counts only explicit mentions for an as-needed med', () => {
		const med = legacy({ asNeeded: true });
		const docs = [
			entry('2026-09-01'),
			entry('2026-09-02', { medications: { lam: true } }),
			{ data: { type: 'event', date: '2026-09-03', medicationId: 'lam' } },
		];
		expect(medHistoryDays(med, docs)).toBe(2);
	});

	it('is zero for a medication added today with nothing logged against it', () => {
		const med = createMedication('n', { name: 'N', dose: '1', schedule: '', asNeeded: false, from: '2026-09-16' });
		expect(medHistoryDays(med, [entry('2026-09-15')])).toBe(0);
	});

	it('docReferencesMed ignores diary and other types', () => {
		expect(docReferencesMed({ data: { type: 'diary', date: '2026-09-01', medicationId: 'lam' } }, 'lam')).toBe(false);
	});
});
