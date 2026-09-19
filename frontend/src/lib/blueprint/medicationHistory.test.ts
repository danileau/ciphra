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
	canonicalMedId,
	combineMedications,
	createMedication,
	docReferencesMed,
	duplicateGroups,
	earliestChangeDate,
	isActiveOn,
	medHistoryDays,
	medIds,
	medNameKey,
	medicationChanges,
	medicationsOverlap,
	medPeriods,
	medHistorySpan,
	medStatusOn,
	isTrackedOn,
	periodOn,
	plannedChange,
	prependPeriod,
	createPastMedication,
	removeReportedPeriod,
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

/* ─── Duplicates (the pre-dose-history workaround) ─────────────────────── */

describe('coalescing a change to what already applied', () => {
	it('reads back-to-back equal doses as one period — no "8 mg → 8 mg" step', () => {
		const med = legacy({
			periods: [
				{ to: '2026-09-15', dose: '10mg', schedule: 'abends' },
				{ from: '2026-09-16', to: '2026-09-16', dose: '8mg', schedule: 'abends' },
				{ from: '2026-09-17', dose: '8mg', schedule: 'abends' },
			],
		});
		expect(medPeriods(med)).toEqual([
			{ to: '2026-09-15', dose: '10mg', schedule: 'abends' },
			{ from: '2026-09-16', dose: '8mg', schedule: 'abends' },
		]);
		expect(medicationChanges([med]).map((c) => [c.date, c.kind])).toEqual([['2026-09-16', 'change']]);
		expect(plannedChange(med, '2026-09-16')).toBeNull();
	});

	it('a "change" to the same dose stores nothing new', () => {
		const med = legacy();
		const same = applyDoseChange(med, { from: '2026-09-17', dose: '10 mg', schedule: '2× täglich' });
		expect(medPeriods(same)).toEqual([{ dose: '10 mg', schedule: '2× täglich' }]);
	});
});

describe('duplicateGroups', () => {
	it('groups entries of the same drug, ignoring case, spacing and an embedded dose', () => {
		const meds = [
			legacy({ id: 'a', name: 'Fycompa' }),
			legacy({ id: 'b', name: 'Lamotrigin' }),
			legacy({ id: 'c', name: 'fycompa 8mg' }),
			legacy({ id: 'd', name: 'Fycomp' }),
			legacy({ id: 'e', name: 'Vitamin B12' }),
			legacy({ id: 'f', name: 'Vitamin B1' }),
		];
		expect(duplicateGroups(meds).map((g) => g.map((m) => m.id))).toEqual([['a', 'c']]);
		expect(medNameKey('Urbanyl 10 mg')).toBe(medNameKey('urbanyl'));
	});
});

describe('combineMedications — the operator\'s Fycompa case (2026-09-16)', () => {
	// The workaround: the original entry at 10 mg, a second "Fycompa" added at
	// 8 mg when the dose changed. After dose history shipped, the original was
	// changed to 8 mg from 16.09. (plus a same-dose step on 17.09.) and the
	// duplicate stopped from 17.09.
	const original = legacy({
		id: 'fyc-1', name: 'Fycompa', dose: '8mg', schedule: '15min vor dem Schlafen gehen',
		periods: [
			{ to: '2026-09-15', dose: '10mg', schedule: '15min vor dem Schlafen gehen' },
			{ from: '2026-09-16', to: '2026-09-16', dose: '8mg', schedule: '15min vor dem Schlafen gehen' },
			{ from: '2026-09-17', dose: '8mg', schedule: '15min vor dem Schlafen gehen' },
		],
	});
	const duplicate = legacy({
		id: 'fyc-2', name: 'Fycompa', dose: '8mg', schedule: '15min vor dem Schlafen gehen',
		periods: [{ to: '2026-09-16', dose: '8mg', schedule: '15min vor dem Schlafen gehen' }],
	});

	it('needs a switch date, because both entries claim the same days', () => {
		expect(medicationsOverlap(original, duplicate)).toBe(true);
	});

	it('10 mg until the duplicate took over, 8 mg since — and it continues past the duplicate\'s stop', () => {
		const combined = combineMedications(original, duplicate, { earlierId: 'fyc-1', switchDate: '2026-08-01' })!;
		expect(combined.id).toBe('fyc-1');
		expect(combined.mergedIds).toEqual(['fyc-2']);
		expect(medPeriods(combined)).toEqual([
			{ to: '2026-07-31', dose: '10mg', schedule: '15min vor dem Schlafen gehen' },
			{ from: '2026-08-01', dose: '8mg', schedule: '15min vor dem Schlafen gehen' },
		]);
		expect(isActiveOn(combined, '2026-12-01')).toBe(true);
		expect(combined.dose).toBe('8mg');
	});

	it('days logged against either id stay attached to the combined medication', () => {
		const combined = combineMedications(original, duplicate, { earlierId: 'fyc-1', switchDate: '2026-08-01' })!;
		const missedOnDuplicate = { data: { type: 'entry', date: '2026-08-10', missedMedications: ['fyc-2'] } };
		expect(docReferencesMed(missedOnDuplicate, combined)).toBe(true);
		expect(canonicalMedId([combined], 'fyc-2')).toBe('fyc-1');
		expect(canonicalMedId([combined], 'someone-else')).toBe('someone-else');
		expect(medIds(combined)).toEqual(['fyc-1', 'fyc-2']);
	});

	it('histories that do not overlap simply line up, no date needed', () => {
		const stopped = createMedication('x1', { name: 'X', dose: '10 mg', schedule: '', asNeeded: false, from: '2026-01-01' });
		const first = applyStop(stopped, '2026-05-01')!;
		const second = createMedication('x2', { name: 'X', dose: '8 mg', schedule: '', asNeeded: false, from: '2026-05-01' });
		expect(medicationsOverlap(first, second)).toBe(false);
		const combined = combineMedications(first, second, { earlierId: 'x1' })!;
		expect(medicationChanges([combined]).map((c) => [c.date, c.kind, c.after?.dose])).toEqual([
			['2026-01-01', 'start', '10 mg'],
			['2026-05-01', 'change', '8 mg'],
		]);
	});

	it('an id combined earlier stays an alias after a second combine', () => {
		const a = legacy({ id: 'a', mergedIds: ['old'] });
		const b = legacy({ id: 'b', mergedIds: ['older'] });
		expect(combineMedications(a, b, { earlierId: 'a', switchDate: '2026-01-01' })!.mergedIds).toEqual(['old', 'b', 'older']);
	});
});

/* ─── History from before ciphra (2026-09-19) ──────────────────────────── */

describe('prependPeriod — the development before the record', () => {
	it('gives a medication with no recorded start one, and keeps every later period', () => {
		const med = applyDoseChange(legacy(), { from: '2026-09-16', dose: '8 mg', schedule: '2× täglich' });
		const back = prependPeriod(med, { dose: '12 mg', schedule: '2× täglich', from: '2023-03-01', to: '2026-05-31' })!;
		expect(medPeriods(back)).toEqual([
			{ from: '2023-03-01', to: '2026-05-31', dose: '12 mg', schedule: '2× täglich', reported: true },
			{ from: '2026-06-01', to: '2026-09-15', dose: '10 mg', schedule: '2× täglich' },
			{ from: '2026-09-16', dose: '8 mg', schedule: '2× täglich' },
		]);
		// The mirror still reads the CURRENT regimen, not the remembered one.
		expect(back.dose).toBe('8 mg');
	});

	it('runs up to the day before what is already recorded when no end is given', () => {
		const med = createMedication('m', { name: 'Fycompa', dose: '8mg', schedule: 'abends', asNeeded: false, from: '2026-06-01' });
		const back = prependPeriod(med, { dose: '10mg', schedule: 'abends', from: '2025-01-01' })!;
		expect(medPeriods(back).map((p) => [p.from, p.to, p.dose])).toEqual([
			['2025-01-01', '2026-05-31', '10mg'],
			['2026-06-01', undefined, '8mg'],
		]);
	});

	it('takes a start nobody remembers, and a month as a month', () => {
		const med = createMedication('m', { name: 'Fycompa', dose: '8mg', schedule: '', asNeeded: false, from: '2026-06-01' });
		const back = prependPeriod(med, { dose: '10mg', schedule: '', to: '2026-05-31', toPrecision: 'month' })!;
		const first = medPeriods(back)[0];
		expect(first.from).toBeUndefined();
		expect([first.to, first.toPrecision, first.reported]).toEqual(['2026-05-31', 'month', true]);
	});

	it('leaves a gap alone — a pause in the therapy is not a dose', () => {
		const med = createMedication('m', { name: 'Fycompa', dose: '8mg', schedule: '', asNeeded: false, from: '2026-06-01' });
		const back = prependPeriod(med, { dose: '10mg', schedule: '', from: '2024-01-01', to: '2025-12-31' })!;
		expect(isActiveOn(back, '2026-03-01')).toBe(false);
		expect(periodOn(back, '2024-06-06')?.dose).toBe('10mg');
	});

	it('refuses dates that contradict the record', () => {
		const dated = createMedication('m', { name: 'Fycompa', dose: '8mg', schedule: '', asNeeded: false, from: '2026-06-01' });
		expect(prependPeriod(dated, { dose: '10mg', schedule: '', to: '2026-06-02' })).toBeNull();
		expect(prependPeriod(dated, { dose: '10mg', schedule: '', from: '2026-05-31', to: '2026-01-01' })).toBeNull();
		expect(prependPeriod(dated, { dose: '  ', schedule: '' })).toBeNull();
		// Nothing recorded to sit in front of, and no end given: unanswerable.
		expect(prependPeriod(legacy(), { dose: '10mg', schedule: '' })).toBeNull();
	});

	it('is not applyDoseChange with an old date — that one drops the later history', () => {
		const med = applyDoseChange(legacy(), { from: '2026-09-16', dose: '8 mg', schedule: '2× täglich' });
		const wrong = applyDoseChange(med, { from: '2024-01-01', dose: '12 mg', schedule: '2× täglich' });
		// The 8 mg the person actually takes today is gone.
		expect(medPeriods(wrong).map((p) => p.dose)).toEqual(['10 mg', '12 mg']);
		expect(periodOn(wrong, '2026-09-19')?.dose).toBe('12 mg');
		expect(medPeriods(prependPeriod(med, { dose: '12 mg', schedule: '2× täglich', to: '2026-05-31' })!)).toHaveLength(3);
	});

	it('never joins remembered history into a recorded period, equal dose or not', () => {
		const med = createMedication('m', { name: 'Fycompa', dose: '8mg', schedule: 'abends', asNeeded: false, from: '2026-06-01' });
		const back = prependPeriod(med, { dose: '8mg', schedule: 'abends', from: '2025-01-01' })!;
		expect(medPeriods(back).map((p) => [p.from, p.reported])).toEqual([
			['2025-01-01', true],
			['2026-06-01', undefined],
		]);
	});
});

describe('remembered days are not tracked days', () => {
	const med = prependPeriod(
		createMedication('m', { name: 'Fycompa', dose: '8mg', schedule: '', asNeeded: false, from: '2026-06-01' }),
		{ dose: '10mg', schedule: '', from: '2025-01-01' },
	)!;

	it('reads the dose that applied, but reports the day as untracked', () => {
		expect(periodOn(med, '2025-06-06')?.dose).toBe('10mg');
		expect(isActiveOn(med, '2025-06-06')).toBe(true);
		expect(isTrackedOn(med, '2025-06-06')).toBe(false);
		expect(isTrackedOn(med, '2026-06-06')).toBe(true);
	});

	it('still counts as a change, so the development is visible', () => {
		expect(medicationChanges([med]).map((c) => [c.date, c.kind, c.after?.dose])).toEqual([
			['2025-01-01', 'start', '10mg'],
			['2026-06-01', 'change', '8mg'],
		]);
	});
});

describe('createPastMedication — tried, and stopped again', () => {
	it('is one remembered period and reads as stopped', () => {
		const med = createPastMedication('lev', {
			name: 'Levetiracetam', dose: '1000 mg', schedule: '2× täglich', asNeeded: false,
			from: '2019-03-01', fromPrecision: 'month', to: '2022-06-30', toPrecision: 'month',
			stopReason: 'side_effects', endNote: 'Müdigkeit',
		})!;
		expect(medPeriods(med)).toEqual([{
			from: '2019-03-01', to: '2022-06-30', dose: '1000 mg', schedule: '2× täglich',
			endNote: 'Müdigkeit', reported: true, fromPrecision: 'month', toPrecision: 'month',
			stopReason: 'side_effects',
		}]);
		expect(medStatusOn(med, '2026-09-19')).toBe('stopped');
		expect(medicationChanges([med]).map((c) => [c.date, c.kind])).toEqual([
			['2019-03-01', 'start'],
			['2022-07-01', 'stop'],
		]);
	});

	it('refuses a range that runs backwards, and a medication with no end', () => {
		const input = { name: 'Levetiracetam', dose: '1000 mg', schedule: '', asNeeded: false };
		expect(createPastMedication('lev', { ...input, from: '2022-01-01', to: '2019-01-01' })).toBeNull();
		expect(createPastMedication('lev', { ...input, to: '' })).toBeNull();
	});
});

describe('removeReportedPeriod', () => {
	const med = prependPeriod(
		createMedication('m', { name: 'Fycompa', dose: '8mg', schedule: '', asNeeded: false, from: '2026-06-01' }),
		{ dose: '10mg', schedule: '', from: '2025-01-01' },
	)!;

	it('takes back a remembered period and leaves the recorded one untouched', () => {
		expect(medPeriods(removeReportedPeriod(med, 0)!)).toEqual([{ from: '2026-06-01', dose: '8mg', schedule: '' }]);
	});

	it('refuses to touch recorded history', () => {
		expect(removeReportedPeriod(med, 1)).toBeNull();
		expect(removeReportedPeriod(createMedication('m', { name: 'F', dose: '8mg', schedule: '', asNeeded: false }), 0)).toBeNull();
	});
});

describe('medHistorySpan', () => {
	const past = createPastMedication('lev', {
		name: 'Levetiracetam', dose: '1000 mg', schedule: '', asNeeded: false, from: '2019-03-01', to: '2022-06-30',
	})!;
	const current = createMedication('m', { name: 'Fycompa', dose: '8mg', schedule: '', asNeeded: false, from: '2026-06-01' });

	it('runs from the earliest recorded day to today', () => {
		expect(medHistorySpan([current, past], '2026-09-19')).toEqual({
			from: '2019-03-01', knownFrom: '2019-03-01', to: '2026-09-19',
		});
	});

	it('reaches past today when a change is already planned', () => {
		const planned = applyDoseChange(current, { from: '2026-10-01', dose: '6mg', schedule: '' });
		expect(medHistorySpan([planned], '2026-09-19').to).toBe('2026-10-01');
	});

	it('has no start when one medication predates the record, but keeps the earliest date it knows', () => {
		const span = medHistorySpan([legacy(), past], '2026-09-19');
		expect(span.from).toBeNull();
		expect(span.knownFrom).toBe('2019-03-01');
	});
});
