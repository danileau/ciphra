/**
 * CIPH-855a — cycleState module tests.
 *
 * The cycle computation was extracted from Companion.svelte so Calendar
 * can render per-day phase overlays. The extraction is lossless only
 * if the same anchor + length produces the same today-phase, so tests
 * pin both paths.
 */
import { describe, it, expect } from 'vitest';
import {
	computeCycleAnchor,
	cycleStateForDate,
	computeCycleStateToday,
	hasCycleTracking,
	phaseBoundaries,
	phaseForDay,
} from './cycleState';
import type { Blueprint } from './blueprint/types';
import type { CiphraDocument } from './stores/documents';

function mkDoc(date: string, vitals: Record<string, number>): CiphraDocument {
	return {
		id: Math.random(),
		data: { type: 'entry', date, vitals } as unknown as CiphraDocument['data'],
	} as CiphraDocument;
}

const endoBp: Blueprint = {
	version: 1,
	conditionId: 'endometriosis',
	conditionLabel: 'landing.template_endometriosis',
	accentColor: '#000',
	symptomGroups: [],
	episodeTypes: [],
	triggers: [],
	vitals: [
		{ id: 'cycle_day', label: 'vital.cycle_day', unit: 'day', placeholder: '14' },
		{ id: 'cycle_length', label: 'vital.cycle_length', unit: 'days', placeholder: '28' },
	],
	medications: [],
	gridSymptomColumns: [],
	gridEpisodeColumns: [],
	reportPreference: 'both',
};

const pcosBp: Blueprint = { ...endoBp, conditionId: 'pcos' };

describe('hasCycleTracking', () => {
	it('returns true for blueprints with cycle_day vital', () => {
		expect(hasCycleTracking(endoBp)).toBe(true);
	});
	it('returns false for blueprints without it', () => {
		const noCycle = { ...endoBp, vitals: [] };
		expect(hasCycleTracking(noCycle)).toBe(false);
	});
	it('returns false for null / undefined', () => {
		expect(hasCycleTracking(null)).toBe(false);
		expect(hasCycleTracking(undefined)).toBe(false);
	});
});

describe('phaseBoundaries + phaseForDay', () => {
	it('canonical 28-day cycle matches the classical map', () => {
		const b = phaseBoundaries(28);
		expect(b).toEqual({ endMenstrual: 5, endFollicular: 13, endOvulation: 16 });
		expect(phaseForDay(1, 28)).toBe('menstrual');
		expect(phaseForDay(5, 28)).toBe('menstrual');
		expect(phaseForDay(6, 28)).toBe('follicular');
		expect(phaseForDay(13, 28)).toBe('follicular');
		expect(phaseForDay(14, 28)).toBe('ovulation');
		expect(phaseForDay(16, 28)).toBe('ovulation');
		expect(phaseForDay(17, 28)).toBe('luteal');
		expect(phaseForDay(28, 28)).toBe('luteal');
	});

	it('scales proportionally for longer cycles', () => {
		const b = phaseBoundaries(35);
		// 35/28 = 1.25, so menstrual ≈ 6, follicular ≈ 16, ovulation ≈ 20
		expect(b.endMenstrual).toBe(6);
		expect(b.endFollicular).toBe(16);
		expect(b.endOvulation).toBe(20);
	});
});

describe('computeCycleAnchor', () => {
	it('picks the most recent cycle_day entry', () => {
		const docs = [
			mkDoc('2026-03-01', { cycle_day: 1 }),
			mkDoc('2026-03-15', { cycle_day: 15 }),
			mkDoc('2026-03-10', { cycle_day: 10 }),
		];
		const anchor = computeCycleAnchor(endoBp, docs);
		expect(anchor.anchorDate).toBe('2026-03-15');
		expect(anchor.anchorDay).toBe(15);
	});

	it('picks cycle_length independently from cycle_day', () => {
		const docs = [
			mkDoc('2026-03-01', { cycle_length: 30 }),
			mkDoc('2026-03-10', { cycle_day: 10 }),
		];
		const anchor = computeCycleAnchor(endoBp, docs);
		expect(anchor.cycleLength).toBe(30);
		expect(anchor.anchorDay).toBe(10);
	});

	it('falls back to 28 when cycle_length never logged', () => {
		const docs = [mkDoc('2026-03-10', { cycle_day: 10 })];
		expect(computeCycleAnchor(endoBp, docs).cycleLength).toBe(28);
	});

	it('flags irregular for PCOS regardless of variance', () => {
		const docs = [mkDoc('2026-03-10', { cycle_day: 5, cycle_length: 28 })];
		expect(computeCycleAnchor(pcosBp, docs).irregular).toBe(true);
	});

	it('flags irregular for variance > 5 days', () => {
		// 20, 40, 30 → mean 30, std ≈ 8.2 — clears the 5-day threshold.
		const docs = [
			mkDoc('2026-01-01', { cycle_length: 20 }),
			mkDoc('2026-02-01', { cycle_length: 40 }),
			mkDoc('2026-03-01', { cycle_length: 30 }),
			mkDoc('2026-03-10', { cycle_day: 10 }),
		];
		expect(computeCycleAnchor(endoBp, docs).irregular).toBe(true);
	});
});

describe('cycleStateForDate', () => {
	const anchor = {
		anchorDate: '2026-04-01',
		anchorDay: 1,
		cycleLength: 28,
		variance: 0,
		irregular: false,
	};

	it('returns day 1 on the anchor date', () => {
		const s = cycleStateForDate(anchor, '2026-04-01');
		expect(s).toEqual({ day: 1, phase: 'menstrual' });
	});

	it('advances forward day-by-day', () => {
		expect(cycleStateForDate(anchor, '2026-04-05')?.day).toBe(5);
		expect(cycleStateForDate(anchor, '2026-04-15')?.day).toBe(15);
		expect(cycleStateForDate(anchor, '2026-04-15')?.phase).toBe('ovulation');
	});

	it('wraps past the end of the cycle', () => {
		// 28 days after anchor → day 1 of next cycle
		expect(cycleStateForDate(anchor, '2026-04-29')?.day).toBe(1);
	});

	it('works backward from the anchor (calendar shows past months)', () => {
		// 1 day before → day 28
		expect(cycleStateForDate(anchor, '2026-03-31')?.day).toBe(28);
		expect(cycleStateForDate(anchor, '2026-03-31')?.phase).toBe('luteal');
	});

	it('returns null when anchor has no data', () => {
		const empty = { anchorDate: null, anchorDay: null, cycleLength: 28, variance: 0, irregular: false };
		expect(cycleStateForDate(empty, '2026-04-01')).toBe(null);
	});
});

describe('computeCycleStateToday (extraction parity)', () => {
	it('returns hasData=false when no entries', () => {
		const s = computeCycleStateToday(endoBp, []);
		expect(s.hasData).toBe(false);
	});

	it('computes today phase from anchor', () => {
		// Anchor: 2026-04-01, day 1. Today (test-fixed) = 2026-04-15 → day 15 → ovulation.
		const docs = [mkDoc('2026-04-01', { cycle_day: 1, cycle_length: 28 })];
		const s = computeCycleStateToday(endoBp, docs, new Date('2026-04-15T12:00:00'));
		expect(s.hasData).toBe(true);
		expect(s.day).toBe(15);
		expect(s.phase).toBe('ovulation');
	});
});
