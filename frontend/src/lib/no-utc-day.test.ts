/**
 * Guard — a calendar day is never taken from `toISOString()`.
 *
 * Entry, diary and event dates are LOCAL `YYYY-MM-DD` strings. ISO is UTC, so
 * `new Date().toISOString().slice(0, 10)` is yesterday for the first one to two
 * hours after midnight in Switzerland (lib/date.ts documents it). The FAB
 * quick-add did exactly that next to a local time: everything logged between
 * 00:00 and ~02:00 landed on — and merged into — the previous day's entry.
 * /reports, the journal range filter and the trigger card made the same slip.
 *
 * Use `todayISO()` / `toLocalISODate(d)` from `$lib/date`.
 *
 * The remaining calls are allow-listed below, per file and by count, each
 * with the reason it is correct. The usual one is the noon anchor: a Date
 * built at 12:00 local time is the same calendar day in UTC for every
 * timezone within ±11h, so date arithmetic on it may format via ISO. A new
 * call — in a new file or an allow-listed one — fails until it is either
 * converted or argued for here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC_ROOT = join(__dirname, '..');

const UTC_DAY = /\.toISOString\(\)\s*\.\s*(?:slice\(\s*0\s*,\s*10\s*\)|substring\(\s*0\s*,\s*10\s*\)|substr\(\s*0\s*,\s*10\s*\)|split\(\s*['"]T['"]\s*\)\s*\[\s*0\s*\])/g;

const ALLOWED: Record<string, { count: number; why: string }> = {
	'lib/date.ts': { count: 1, why: 'the header comment describing the bug' },
	'lib/cycleState.ts': { count: 1, why: 'todayKey.setHours(12) — noon anchor' },
	'lib/pdf.ts': { count: 7, why: 'scope/prev windows and the CSV day loop are built at 12:00 — noon anchor' },
	'lib/reports/reportWindow.ts': { count: 2, why: 'window ends built at 12:00 — noon anchor' },
	'lib/components/Companion.svelte': { count: 3, why: 'today.setHours(12) and T12:00:00 cursors — noon anchor' },
	'lib/components/EntryComposer.svelte': { count: 1, why: 'streak walk from `T12:00:00` — noon anchor' },
	'routes/calendar/+page.svelte': { count: 2, why: 'prev/next day from `T12:00:00` — noon anchor' },
	'routes/log/[date]/+page.svelte': { count: 2, why: 'prev/next day from `T12:00:00` — noon anchor' },
	'routes/reports/+page.svelte': { count: 1, why: 'changeMonth steps from `T12:00:00` — noon anchor' },
	'routes/settings/+page.svelte': { count: 1, why: 'export FILE NAME only, not a stored date — tracked as a follow-up' },
};

function walk(dir: string, acc: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) {
			if (name === 'node_modules' || name.startsWith('.')) continue;
			walk(full, acc);
		} else if ((name.endsWith('.ts') || name.endsWith('.svelte')) && !name.endsWith('.test.ts')) {
			acc.push(full);
		}
	}
	return acc;
}

describe('no UTC calendar days', () => {
	const found = new Map<string, number>();
	for (const f of walk(SRC_ROOT)) {
		const n = (readFileSync(f, 'utf8').match(UTC_DAY) || []).length;
		if (n > 0) found.set(relative(SRC_ROOT, f), n);
	}

	it('every toISOString() day is allow-listed with a reason', () => {
		const offenders = [...found].filter(([file, n]) => n > (ALLOWED[file]?.count ?? 0));
		expect(
			offenders,
			`toISOString() used for a calendar day — use todayISO()/toLocalISODate() from $lib/date, ` +
				`or add a justified entry to ALLOWED:\n  ` +
				offenders.map(([f, n]) => `${f}: ${n} (allowed ${ALLOWED[f]?.count ?? 0})`).join('\n  '),
		).toEqual([]);
	});

	it('the allow-list does not outlive the code it excuses', () => {
		const stale = Object.entries(ALLOWED).filter(([file, { count }]) => (found.get(file) ?? 0) < count);
		expect(stale.map(([f]) => f), 'lower or remove these ALLOWED counts').toEqual([]);
	});

	it('"now" is never formatted through UTC outside the allow-list', () => {
		const nowUtc = /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/;
		const offenders = walk(SRC_ROOT)
			.map((f) => relative(SRC_ROOT, f))
			.filter((f) => f !== 'lib/date.ts' && f !== 'routes/settings/+page.svelte')
			.filter((f) => nowUtc.test(readFileSync(join(SRC_ROOT, f), 'utf8')));
		expect(offenders).toEqual([]);
	});
});
