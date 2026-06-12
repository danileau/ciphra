/**
 * Focus-month handoff — contract tests. Pins the YYYY-MM validation
 * (garbage in storage must not propagate into date math) and the
 * remember/recall roundtrip.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { rememberFocusMonth, recallFocusMonth } from './focusMonth';

beforeEach(() => sessionStorage.clear());

describe('focusMonth handoff', () => {
	it('roundtrips a valid YYYY-MM', () => {
		rememberFocusMonth('2026-03');
		expect(recallFocusMonth()).toBe('2026-03');
	});

	it('rejects invalid input on write', () => {
		rememberFocusMonth('2026-13');
		rememberFocusMonth('march');
		rememberFocusMonth('2026-3');
		rememberFocusMonth('2026-03-15');
		expect(recallFocusMonth()).toBeNull();
	});

	it('rejects tampered storage on read', () => {
		sessionStorage.setItem('ciphra_focus_month', '<script>');
		expect(recallFocusMonth()).toBeNull();
	});

	it('returns null when nothing stored', () => {
		expect(recallFocusMonth()).toBeNull();
	});
});
