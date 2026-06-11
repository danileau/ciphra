/**
 * Shared focus-month handoff (design review 2026-06-11).
 *
 * /calendar and /reports each kept their own month state, so browsing
 * March in the calendar and tapping Reports landed on the current
 * month — the month context didn't travel exactly on the
 * calendar→reports comparison path the surfaces exist for.
 *
 * sessionStorage (not localStorage) on purpose: this is per-tab
 * navigation continuity, not a durable preference — a fresh session
 * should open on the current month. The value is a bare `YYYY-MM`
 * string (no health data).
 *
 * Consumers: `routes/calendar/+page.svelte`, `routes/reports/+page.svelte`.
 * Both recall on init and remember on every month change (including
 * jump-to-today, which writes the current month and so clears the
 * handoff naturally).
 */

const KEY = 'ciphra_focus_month';
const VALID = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Store the month (YYYY-MM) the user is looking at. Invalid input and
 *  storage-less environments (SSR, blocked storage) are no-ops. */
export function rememberFocusMonth(month: string): void {
	if (!VALID.test(month)) return;
	try {
		sessionStorage.setItem(KEY, month);
	} catch {
		/* SSR / storage blocked — continuity is best-effort */
	}
}

/** Recall the last focused month, or null when absent/invalid. */
export function recallFocusMonth(): string | null {
	try {
		const v = sessionStorage.getItem(KEY);
		return v && VALID.test(v) ? v : null;
	} catch {
		return null;
	}
}
