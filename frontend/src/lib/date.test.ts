import { describe, it, expect } from 'vitest';
import { toLocalISODate, todayISO } from './date';

describe('toLocalISODate', () => {
	it('formats a date as local YYYY-MM-DD', () => {
		// Construct via local Y/M/D so the assertion is timezone-independent.
		expect(toLocalISODate(new Date(2026, 5, 1, 0, 30))).toBe('2026-06-01');
		expect(toLocalISODate(new Date(2026, 0, 9, 23, 59))).toBe('2026-01-09');
		expect(toLocalISODate(new Date(2026, 11, 31, 12))).toBe('2026-12-31');
	});

	it('does NOT slip to the previous day at local-midnight (the UTC bug)', () => {
		// A local-midnight date in a positive-offset tz would become the prior
		// day via .toISOString(); the local helper must stay on the local day.
		const d = new Date(2026, 5, 15, 0, 0, 0);
		expect(toLocalISODate(d)).toBe('2026-06-15');
		// sanity: matches what a manual local format would produce
		const manual = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		expect(toLocalISODate(d)).toBe(manual);
	});

	it('todayISO equals the local format of now', () => {
		const now = new Date();
		const manual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
		expect(todayISO()).toBe(manual);
	});
});
