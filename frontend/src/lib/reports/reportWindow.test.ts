/**
 * The exported report's time window.
 *
 * The contract these pin: a label may only claim a calendar period when the
 * window actually IS one, and a multi-month window must state both ends. A
 * relative phrase ("Letzte 12 Monate") is not a valid label for a document
 * that outlives the moment it was generated.
 */
import { describe, it, expect } from 'vitest';
import {
	reportWindow,
	formatWindowRange,
	scopeFileTag,
	SCOPE_MONTHS,
} from './reportWindow';

describe('reportWindow — boundaries', () => {
	it('a month window is that month', () => {
		const w = reportWindow('month', 2025, 2); // March 2025
		expect(w.startISO).toBe('2025-03-01');
		expect(w.endISO).toBe('2025-03-31');
		expect(w.days).toBe(31);
		expect(w.months).toBe(SCOPE_MONTHS.month);
	});

	it('a December-anchored year is the calendar year', () => {
		const w = reportWindow('year', 2023, 11);
		expect(w.startISO).toBe('2023-01-01');
		expect(w.endISO).toBe('2023-12-31');
		expect(w.days).toBe(365);
	});

	it('a December-anchored pair is the two calendar years', () => {
		const w = reportWindow('2years', 2025, 11);
		expect(w.startISO).toBe('2024-01-01');
		expect(w.endISO).toBe('2025-12-31');
		expect(w.days).toBe(731); // 2024 is a leap year
	});

	it('a non-December anchor is a trailing window', () => {
		const w = reportWindow('year', 2025, 7); // Aug 2025
		expect(w.startISO).toBe('2024-09-01');
		expect(w.endISO).toBe('2025-08-31');
	});

	it('does not slip a day in a positive-offset timezone', () => {
		// `.toISOString()` is UTC; a local-midnight construction in CET/CEST
		// lands on the previous day and would drop the month's last day.
		expect(reportWindow('month', 2025, 0).endISO).toBe('2025-01-31');
		expect(reportWindow('month', 2024, 1).endISO).toBe('2024-02-29');
		expect(reportWindow('month', 2025, 1).endISO).toBe('2025-02-28');
	});
});

describe('reportWindow — kind', () => {
	it('names a December anchor as the calendar period it is', () => {
		expect(reportWindow('year', 2023, 11).kind).toBe('calendar-year');
		expect(reportWindow('2years', 2025, 11).kind).toBe('calendar-years');
	});

	it('refuses to call any other anchor a calendar period', () => {
		// A trailing-12 window ending August 2025 is not a calendar year.
		expect(reportWindow('year', 2025, 7).kind).toBe('trailing');
		expect(reportWindow('2years', 2025, 7).kind).toBe('trailing');
		expect(reportWindow('year', 2025, 0).kind).toBe('trailing');
	});

	it('a month is always a month, December included', () => {
		expect(reportWindow('month', 2025, 11).kind).toBe('month');
	});
});

describe('formatWindowRange', () => {
	it('states a single month plainly', () => {
		expect(formatWindowRange(reportWindow('month', 2023, 0), 'de-CH')).toBe('Januar 2023');
		expect(formatWindowRange(reportWindow('month', 2023, 0), 'en-GB')).toBe('January 2023');
	});

	it('states both ends of a calendar year', () => {
		const label = formatWindowRange(reportWindow('year', 2023, 11), 'de-CH');
		expect(label).toBe('Jan. 2023 – Dez. 2023');
	});

	it('repeats the year on both ends so a clipped scan still reads', () => {
		// Never compressed to "Jan – Dez 2023".
		const label = formatWindowRange(reportWindow('year', 2023, 11), 'en-GB');
		expect(label.match(/2023/g)).toHaveLength(2);
	});

	it('states both ends of a calendar pair', () => {
		expect(formatWindowRange(reportWindow('2years', 2025, 11), 'en-GB')).toBe(
			'Jan 2024 – Dec 2025',
		);
	});

	it('states a trailing window as what it is, never as a year', () => {
		// en-GB abbreviates September as "Sept" — the ICU short form, not a typo.
		const label = formatWindowRange(reportWindow('year', 2025, 7), 'en-GB');
		expect(label).toBe('Sept 2024 – Aug 2025');
		expect(label).not.toMatch(/^\d{4}$/);
	});

	it('uses an en dash, matching the picker', () => {
		expect(formatWindowRange(reportWindow('year', 2023, 11), 'en-GB')).toContain('–');
	});

	it('never emits a relative phrase in any locale', () => {
		const RELATIVE = /letzte|last|derniers|ultimi|vorige|past/i;
		for (const locale of ['de-CH', 'en-GB', 'fr-CH', 'it-CH']) {
			for (const w of [
				reportWindow('month', 2023, 5),
				reportWindow('year', 2023, 11),
				reportWindow('2years', 2025, 11),
				reportWindow('year', 2025, 7),
			]) {
				expect(formatWindowRange(w, locale)).not.toMatch(RELATIVE);
			}
		}
	});
});

describe('scopeFileTag — same rule as the label', () => {
	it('names a month by its own prefix', () => {
		expect(scopeFileTag('month', 2025, 2)).toBe('2025-03');
	});

	it('names December-anchored windows as calendar periods', () => {
		expect(scopeFileTag('year', 2023, 11)).toBe('year-2023');
		expect(scopeFileTag('2years', 2025, 11)).toBe('2years-2024-2025');
	});

	it('keeps the end-month form for a trailing window', () => {
		expect(scopeFileTag('year', 2025, 7)).toBe('year-2025-08');
		expect(scopeFileTag('2years', 2025, 7)).toBe('2years-2025-08');
	});

	it('agrees with the window kind — filename and label cannot drift', () => {
		for (const [scope, y, m] of [
			['month', 2025, 2],
			['year', 2023, 11],
			['2years', 2025, 11],
			['year', 2025, 7],
		] as const) {
			const w = reportWindow(scope, y, m);
			const isCalendar = w.kind === 'calendar-year' || w.kind === 'calendar-years';
			// A calendar tag has no month component after the scope prefix.
			const tagNamesCalendar = /^(year-\d{4}|2years-\d{4}-\d{4})$/.test(
				scopeFileTag(scope, y, m),
			);
			expect(tagNamesCalendar).toBe(isCalendar);
		}
	});
});
