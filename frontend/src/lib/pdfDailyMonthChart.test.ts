import { describe, expect, it } from 'vitest';
import { aggregateDailyMonthSeries } from '$lib/pdfDailyMonthChart';
import type { CiphraDocument } from '$lib/stores/documents';

function entryDoc(id: number, date: string, body: Record<string, unknown>): CiphraDocument {
	return {
		id,
		data: { type: 'entry', date, ...body },
		createdAt: new Date(date).getTime(),
		updatedAt: new Date(date).getTime(),
	} as unknown as CiphraDocument;
}

describe('aggregateDailyMonthSeries', () => {
	it('returns arrays of length daysInMonth', () => {
		const result = aggregateDailyMonthSeries([], 2026, 4, 31, ['manic']);
		expect(result.dailyTotals).toHaveLength(31);
		expect(result.dailySymptomDays).toHaveLength(31);
	});

	it('returns days-in-month tick count for any month length', () => {
		// Acceptance criterion from kickoff: tick count = days-in-month for
		// scope='month', ≠ 24 for scope='year'. The aggregation owns the
		// length contract — caller wires that to the x-axis tick generator.
		expect(aggregateDailyMonthSeries([], 2026, 1, 28, []).dailyTotals.length).toBe(28);
		expect(aggregateDailyMonthSeries([], 2024, 1, 29, []).dailyTotals.length).toBe(29);  // leap
		expect(aggregateDailyMonthSeries([], 2026, 3, 30, []).dailyTotals.length).toBe(30);
		expect(aggregateDailyMonthSeries([], 2026, 4, 31, []).dailyTotals.length).toBe(31);
	});

	it('zero-fills both arrays when no docs match', () => {
		const result = aggregateDailyMonthSeries([], 2026, 4, 31, ['x']);
		expect(result.dailyTotals.every((v) => v === 0)).toBe(true);
		expect(result.dailySymptomDays.every((v) => v === 0)).toBe(true);
	});

	it('ignores docs from other months', () => {
		const docs = [
			entryDoc(1, '2026-04-15', { episodes: { manic: 5 } }),  // wrong month
			entryDoc(2, '2026-05-15', { episodes: { manic: 3 } }),  // focus month
		];
		const result = aggregateDailyMonthSeries(docs, 2026, 4, 31, ['manic']);  // month=4 → May
		expect(result.dailyTotals[14]).toBe(3);  // day 15 (idx 14)
		expect(result.dailyTotals.reduce((a, b) => a + b, 0)).toBe(3);
	});

	it('ignores non-entry docs (events, family stamps)', () => {
		const docs = [
			{ id: 9, data: { type: 'event', date: '2026-05-10', episodes: { manic: 99 } } } as unknown as CiphraDocument,
		];
		const result = aggregateDailyMonthSeries(docs, 2026, 4, 31, ['manic']);
		expect(result.dailyTotals.every((v) => v === 0)).toBe(true);
	});

	it('sums episode counts across the requested columns', () => {
		const docs = [
			entryDoc(1, '2026-05-03', { episodes: { manic: 2, depressive: 1 } }),
		];
		const result = aggregateDailyMonthSeries(docs, 2026, 4, 31, ['manic', 'depressive']);
		expect(result.dailyTotals[2]).toBe(3);
	});

	it('falls back to legacy `seizures` field when present', () => {
		// Pre-CIPH-700 entries used `seizures` instead of `episodes`. The
		// aggregation must read either so legacy data still charts.
		const docs = [
			entryDoc(1, '2026-05-04', { seizures: { tonic: 4 } }),
		];
		const result = aggregateDailyMonthSeries(docs, 2026, 4, 31, ['tonic']);
		expect(result.dailyTotals[3]).toBe(4);
	});

	it('marks symptom day as 1 when any symptom is truthy (not the count)', () => {
		const docs = [
			entryDoc(1, '2026-05-10', { symptoms: { headache: true, fatigue: true } }),
			entryDoc(2, '2026-05-11', { symptoms: { headache: false } }),
		];
		const result = aggregateDailyMonthSeries(docs, 2026, 4, 31, []);
		expect(result.dailySymptomDays[9]).toBe(1);   // 2 symptoms → 1 (binary day flag)
		expect(result.dailySymptomDays[10]).toBe(0);  // all falsy → 0
	});

	it('dailySymptomCounts is the per-day count of truthy symptoms', () => {
		// The daily-month chart plots this as a line, so it needs the count
		// (a curve), not the 0/1 day flag (a square wave).
		const docs = [
			entryDoc(1, '2026-05-10', { symptoms: { headache: true, fatigue: true, nausea: true } }),
			entryDoc(2, '2026-05-11', { symptoms: { headache: false } }),
		];
		const result = aggregateDailyMonthSeries(docs, 2026, 4, 31, []);
		expect(result.dailySymptomCounts[9]).toBe(3);   // 3 truthy
		expect(result.dailySymptomCounts[10]).toBe(0);  // all falsy
		expect(result.dailySymptomCounts).toHaveLength(31);
	});

	it('clamps stray dates outside 1..daysInMonth (defensive)', () => {
		// Malformed date components shouldn't write past the array end.
		const docs = [
			entryDoc(1, '2026-05-32', { episodes: { manic: 1 } }),  // day 32 invalid
			entryDoc(2, '2026-05-00', { episodes: { manic: 1 } }),  // day 0 invalid
		];
		const result = aggregateDailyMonthSeries(docs, 2026, 4, 31, ['manic']);
		expect(result.dailyTotals.reduce((a, b) => a + b, 0)).toBe(0);
	});
});
