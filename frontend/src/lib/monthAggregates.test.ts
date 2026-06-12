/**
 * Shared month-aggregate math — parity tests (design review 2026-06-11).
 *
 * Pins the property that motivated the extraction: the calendar-rail
 * insight, the /reports stat block, and the doctor PDF must compute the
 * same numbers from the same docs — INCLUDING migrated epilepc docs in
 * the legacy `data.seizures` shape, which previously counted on two of
 * the four call sites and not the others.
 */
import { describe, it, expect } from 'vitest';
import {
	episodeValuesOf,
	multiDayEpisodeDays,
	anyPhaseDayCount,
	episodeCountTotals,
} from './monthAggregates';
import { monthSummaryInsightFor } from './monthSummaryInsight';
import { aggregatePhaseDistribution } from './pdfPhaseDistribution';
import type { Blueprint } from '$lib/blueprint';
import type { CiphraDocument } from '$lib/stores/documents';

const bp = {
	conditionId: 'bipolar',
	episodeTypes: [
		{ id: 'manic', label: 'ep.manic', color: '#b23c2c', multiDay: true },
		{ id: 'depressive', label: 'ep.depressive', color: '#5e4a8a', multiDay: true },
		{ id: 'panic', label: 'ep.panic', color: '#9f630b' },
	],
} as unknown as Blueprint;

function entry(date: string, episodes: Record<string, number>): CiphraDocument {
	return { id: date, data: { type: 'entry', date, episodes } } as unknown as CiphraDocument;
}

/** Migrated epilepc shape — counts live under `seizures`. */
function legacyEntry(date: string, seizures: Record<string, number>): CiphraDocument {
	return { id: date, data: { type: 'entry', date, seizures } } as unknown as CiphraDocument;
}

const docs: CiphraDocument[] = [
	entry('2026-03-02', { manic: 1 }),
	entry('2026-03-03', { manic: 1, panic: 2 }),
	entry('2026-03-04', { depressive: 1 }),
	legacyEntry('2026-03-05', { manic: 1, panic: 1 }), // the divergence fixture
	entry('2026-03-06', {}),
	{ id: 'ev', data: { type: 'event', date: '2026-03-07', episodes: { manic: 9 } } } as unknown as CiphraDocument,
];

describe('episodeValuesOf — the one shape reader', () => {
	it('reads episodes, falls back to legacy seizures, ignores non-entries', () => {
		expect(episodeValuesOf(entry('2026-03-02', { manic: 1 }))).toEqual({ manic: 1 });
		expect(episodeValuesOf(legacyEntry('2026-03-05', { manic: 1 }))).toEqual({ manic: 1 });
		expect(
			episodeValuesOf({ id: 'x', data: { type: 'event', episodes: { manic: 9 } } } as unknown as CiphraDocument),
		).toEqual({});
	});
});

describe('core aggregates', () => {
	it('multiDayEpisodeDays counts the legacy doc like a modern one', () => {
		const days = multiDayEpisodeDays(bp, docs);
		expect([...days.get('manic')!].sort()).toEqual(['2026-03-02', '2026-03-03', '2026-03-05']);
		expect([...days.get('depressive')!]).toEqual(['2026-03-04']);
		expect(days.has('panic')).toBe(false); // point type, not multiDay
	});

	it('anyPhaseDayCount is the union (reports Phasentage)', () => {
		expect(anyPhaseDayCount(bp, docs)).toBe(4); // 02, 03, 04, 05
	});

	it('episodeCountTotals sums per kind and skips the event doc', () => {
		expect(episodeCountTotals(bp, docs, 'all').get('manic')).toBe(3);
		expect(episodeCountTotals(bp, docs, 'point').get('panic')).toBe(3);
		expect(episodeCountTotals(bp, docs, 'multiDay').has('panic')).toBe(false);
	});
});

describe('parity across the three consumer surfaces', () => {
	it('calendar-rail insight matches the shared day-sets', () => {
		const insight = monthSummaryInsightFor('phase', bp, docs, 31);
		expect(insight?.kind).toBe('phase-day-coverage');
		if (insight?.kind !== 'phase-day-coverage') throw new Error('unreachable');
		const manic = insight.segments.find((s) => s.id === 'manic')!;
		// 3 manic days — including the legacy-shape 2026-03-05, which this
		// surface previously dropped.
		expect(manic.days).toBe(3);
		expect(manic.pct).toBeCloseTo(3 / 31);
	});

	it('doctor-PDF distribution matches the shared totals', () => {
		const segments = aggregatePhaseDistribution(bp, docs);
		const total = segments.reduce((a, s) => a + s.count, 0);
		const manic = segments.find((s) => s.id === 'manic')!;
		expect(manic.count).toBe(3); // includes the legacy doc
		expect(segments.reduce((a, s) => a + s.pct, 0)).toBeCloseTo(1);
		expect(total).toBe(3 + 1 + 3); // manic + depressive + panic
	});

	it('discrete-cohort top episode matches the shared point totals', () => {
		const insight = monthSummaryInsightFor('discrete', bp, docs, 31);
		expect(insight?.kind).toBe('top-episode');
		if (insight?.kind !== 'top-episode') throw new Error('unreachable');
		expect(insight.id).toBe('panic');
		expect(insight.count).toBe(3);
	});
});
