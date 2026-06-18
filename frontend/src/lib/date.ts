/**
 * Local-date helpers.
 *
 * Entry/diary/event dates are stored as LOCAL `YYYY-MM-DD` strings. Computing
 * "today" via `new Date().toISOString().slice(0, 10)` is a bug: ISO is UTC, so
 * for any positive-offset timezone (CET/CEST = all of Switzerland) between
 * local midnight and ~01:00–02:00 it returns *yesterday* — wrong "today"
 * highlights, and an entry created just after midnight filed under the previous
 * day. Always derive the local day from the local Y/M/D.
 */

/** Local `YYYY-MM-DD` for the given date (default: now). */
export function toLocalISODate(d: Date = new Date()): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

/** Today as a local `YYYY-MM-DD` string. */
export function todayISO(): string {
	return toLocalISODate();
}
