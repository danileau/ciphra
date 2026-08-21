/**
 * Export filename tags.
 *
 * The /reports period picker anchors calendar periods at December, so the
 * old `${scope}-${endMonth}` form produced `year-2023-12` for what the user
 * picked as "2023". These pin the calendar-period naming without changing
 * the meaning of a non-December anchor, which really is an end month.
 */
import { describe, expect, it } from 'vitest';
import { scopeFileTag } from '$lib/pdf';

describe('scopeFileTag', () => {
	it('names a month by its own prefix', () => {
		expect(scopeFileTag('month', 2025, 2)).toBe('2025-03');
		expect(scopeFileTag('month', 2025, 11)).toBe('2025-12');
	});

	it('names a December-anchored year as the calendar year', () => {
		expect(scopeFileTag('year', 2023, 11)).toBe('year-2023');
	});

	it('names a December-anchored pair as the calendar years it spans', () => {
		expect(scopeFileTag('2years', 2025, 11)).toBe('2years-2024-2025');
	});

	it('keeps the end-month form for a non-calendar anchor', () => {
		// A trailing-12 window ending Aug 2025 is not a calendar year and must
		// not be named as one.
		expect(scopeFileTag('year', 2025, 7)).toBe('year-2025-08');
		expect(scopeFileTag('2years', 2025, 7)).toBe('2years-2025-08');
	});

	it('pads single-digit months', () => {
		expect(scopeFileTag('month', 2025, 0)).toBe('2025-01');
		expect(scopeFileTag('year', 2025, 0)).toBe('year-2025-01');
	});
});
