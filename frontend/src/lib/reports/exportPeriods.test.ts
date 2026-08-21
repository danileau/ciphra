/**
 * Data-backed export periods for /reports.
 *
 * These are behavioural tests over pure functions, deliberately not the
 * source-grep style used by the older reports tests (`expect(SOURCE)
 * .toContain(...)`) — that style only exists because the logic was trapped
 * inline in a 2100-line component, and it pins the text rather than the
 * contract. Extracting the logic is what makes real assertions possible.
 */
import { describe, it, expect } from 'vitest';
import {
	buildMonthIndex,
	availablePeriods,
	formatPeriodLabel,
	findPeriodForMonth,
	defaultPeriodIndex,
	SCOPE_MONTHS,
	type MonthIndex,
} from './exportPeriods';

let nextId = 1;
const entry = (date: string, extra: Record<string, unknown> = {}) => ({
	id: nextId++,
	serverCreatedAt: `${date}T10:00:00Z`,
	data: { type: 'entry', date, ...extra },
});

/** Build an index directly, so period tests don't depend on doc plumbing. */
const index = (spec: Record<string, number>): MonthIndex => new Map(Object.entries(spec));

describe('buildMonthIndex', () => {
	it('counts distinct DAYS, not documents', () => {
		const docs = [
			entry('2025-03-04'),
			entry('2025-03-04'), // same day, second entry
			entry('2025-03-05'),
		] as any;
		expect(buildMonthIndex(docs).get('2025-03')).toBe(2);
	});

	it('excludes diary documents', () => {
		const docs = [{ id: 1, serverCreatedAt: '', data: { type: 'diary', date: '2025-03-04' } }] as any;
		expect(buildMonthIndex(docs).size).toBe(0);
	});

	it('excludes per-entry private documents', () => {
		const docs = [entry('2025-03-04', { private: true })] as any;
		expect(buildMonthIndex(docs).size).toBe(0);
	});

	it('a month of only-private entries is not offered at all', () => {
		const docs = [entry('2025-03-04', { private: true }), entry('2025-04-01')] as any;
		const idx = buildMonthIndex(docs);
		expect(idx.has('2025-03')).toBe(false);
		expect(idx.get('2025-04')).toBe(1);
	});

	it('ignores non-entry document types', () => {
		const docs = [{ id: 1, serverCreatedAt: '', data: { type: 'event', date: '2025-03-04' } }] as any;
		expect(buildMonthIndex(docs).size).toBe(0);
	});

	it('ignores malformed and missing dates', () => {
		const docs = [entry('2025-3-4'), entry(''), { id: 9, serverCreatedAt: '', data: { type: 'entry' } }] as any;
		expect(buildMonthIndex(docs).size).toBe(0);
	});

	it('tolerates null/undefined input', () => {
		expect(buildMonthIndex(null).size).toBe(0);
		expect(buildMonthIndex(undefined).size).toBe(0);
	});
});

describe('availablePeriods — month', () => {
	it('offers every month holding data, newest first', () => {
		const opts = availablePeriods(index({ '2025-01': 3, '2024-11': 2, '2025-03': 1 }), 'month');
		expect(opts.map((o) => o.endMonth)).toEqual(['2025-03', '2025-01', '2024-11']);
	});

	it('anchors on the month itself and spans exactly one month', () => {
		const [opt] = availablePeriods(index({ '2025-03': 4 }), 'month');
		expect(opt.anchorYear).toBe(2025);
		expect(opt.anchorMonth).toBe(2); // 0-based March
		expect(opt.startMonth).toBe('2025-03');
		expect(opt.endMonth).toBe('2025-03');
		expect(opt.monthsInWindow).toBe(SCOPE_MONTHS.month);
		expect(opt.daysLogged).toBe(4);
	});

	it('skips months without data', () => {
		const opts = availablePeriods(index({ '2025-01': 1, '2025-03': 1 }), 'month');
		expect(opts.map((o) => o.endMonth)).not.toContain('2025-02');
	});
});

describe('availablePeriods — year (the reported case)', () => {
	// "if there is no data in 2024, but in 2023 and 2025 onclick should show
	// only this possibilities as available"
	const gapYear = index({ '2023-04': 5, '2023-09': 3, '2025-02': 7 });

	it('offers only years that hold data, newest first', () => {
		expect(availablePeriods(gapYear, 'year').map((o) => o.anchorYear)).toEqual([2025, 2023]);
	});

	it('never offers the empty gap year', () => {
		expect(availablePeriods(gapYear, 'year').map((o) => o.anchorYear)).not.toContain(2024);
	});

	it('anchors at December so the trailing-12 window is the calendar year', () => {
		const [y2025] = availablePeriods(gapYear, 'year');
		expect(y2025.anchorMonth).toBe(11);
		expect(y2025.startMonth).toBe('2025-01');
		expect(y2025.endMonth).toBe('2025-12');
		expect(y2025.monthsInWindow).toBe(12);
	});

	it('reports real coverage for the year', () => {
		const [, y2023] = availablePeriods(gapYear, 'year');
		expect(y2023.daysLogged).toBe(8); // 5 + 3
		expect(y2023.monthsWithData).toBe(2);
	});
});

describe('availablePeriods — 2 years (sliding pairs, partly empty offered)', () => {
	const gapYear = index({ '2023-04': 5, '2025-02': 7 });

	it('slides consecutive year pairs across the data range, newest first', () => {
		const labels = availablePeriods(gapYear, '2years').map((o) => formatPeriodLabel(o, 'de-CH'));
		expect(labels).toEqual(['2024–2025', '2023–2024']);
	});

	it('offers pairs that straddle the gap, carrying their coverage', () => {
		const [latest, earlier] = availablePeriods(gapYear, '2years');
		// 2024–2025: only 2025 has data.
		expect(latest.monthsWithData).toBe(1);
		expect(latest.daysLogged).toBe(7);
		// 2023–2024: only 2023 has data.
		expect(earlier.monthsWithData).toBe(1);
		expect(earlier.daysLogged).toBe(5);
	});

	it('spans 24 months ending in December of the later year', () => {
		const [latest] = availablePeriods(gapYear, '2years');
		expect(latest.anchorYear).toBe(2025);
		expect(latest.anchorMonth).toBe(11);
		expect(latest.startMonth).toBe('2024-01');
		expect(latest.endMonth).toBe('2025-12');
		expect(latest.monthsInWindow).toBe(24);
	});

	it('offers nothing when the data covers a single year', () => {
		expect(availablePeriods(index({ '2025-02': 7, '2025-08': 4 }), '2years')).toEqual([]);
	});

	it('regression: stale data no longer unlocks a 2-year export', () => {
		// The old gate was `Date.now() - oldestEntry >= 365`, so a user who
		// logged three months in 2023 and stopped got "2 Jahre" unlocked and
		// a PDF empty for 21 of 24 months.
		const stale = index({ '2023-01': 4, '2023-02': 6, '2023-03': 2 });
		expect(availablePeriods(stale, '2years')).toEqual([]);
		expect(availablePeriods(stale, 'year').map((o) => o.anchorYear)).toEqual([2023]);
	});
});

describe('availablePeriods — empty', () => {
	it('returns no options for every scope when there is no data', () => {
		const empty = index({});
		expect(availablePeriods(empty, 'month')).toEqual([]);
		expect(availablePeriods(empty, 'year')).toEqual([]);
		expect(availablePeriods(empty, '2years')).toEqual([]);
	});

	it('ignores months whose count fell to zero', () => {
		expect(availablePeriods(index({ '2025-01': 0 }), 'month')).toEqual([]);
	});
});

describe('formatPeriodLabel', () => {
	const idx = index({ '2025-03': 2, '2024-06': 2 });

	it('names a month in the active locale', () => {
		const [march] = availablePeriods(idx, 'month');
		expect(formatPeriodLabel(march, 'de-CH')).toBe('März 2025');
		expect(formatPeriodLabel(march, 'en-GB')).toBe('March 2025');
	});

	it('names a calendar year as the bare year', () => {
		const [y2025] = availablePeriods(idx, 'year');
		expect(formatPeriodLabel(y2025, 'de-CH')).toBe('2025');
	});

	it('names a pair with an en dash', () => {
		const [pair] = availablePeriods(idx, '2years');
		expect(formatPeriodLabel(pair, 'de-CH')).toBe('2024–2025');
	});
});

describe('pre-selection', () => {
	const idx = index({ '2023-04': 1, '2025-02': 1, '2025-07': 1 });

	it('finds the period containing the viewed month', () => {
		const years = availablePeriods(idx, 'year');
		expect(findPeriodForMonth(years, '2023-04')).toBe(1);
		expect(findPeriodForMonth(years, '2025-07')).toBe(0);
	});

	it('matches on window containment, not just on months holding data', () => {
		// Nov 2025 has no entries but falls inside the 2025 calendar year.
		expect(findPeriodForMonth(availablePeriods(idx, 'year'), '2025-11')).toBe(0);
	});

	it('returns -1 when the viewed month falls outside every option', () => {
		expect(findPeriodForMonth(availablePeriods(idx, 'year'), '2021-05')).toBe(-1);
	});

	it('defaults to the newest option when the viewed month is uncovered', () => {
		const years = availablePeriods(idx, 'year');
		expect(defaultPeriodIndex(years, '2021-05')).toBe(0);
		expect(defaultPeriodIndex(years, '2023-04')).toBe(1);
	});

	it('defaults to -1 when there are no options at all', () => {
		expect(defaultPeriodIndex([], '2025-01')).toBe(-1);
	});
});

describe('end-to-end from documents', () => {
	it('turns a document set into the reported case', () => {
		const docs = [
			entry('2023-04-02'),
			entry('2023-04-03'),
			entry('2025-02-11'),
			entry('2024-06-01', { private: true }), // the only 2024 data is private
		] as any;
		const idx = buildMonthIndex(docs);
		expect(availablePeriods(idx, 'year').map((o) => o.anchorYear)).toEqual([2025, 2023]);
		expect(availablePeriods(idx, 'month').map((o) => o.endMonth)).toEqual(['2025-02', '2023-04']);
	});
});
