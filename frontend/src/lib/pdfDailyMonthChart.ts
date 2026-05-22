/**
 * CIPH-pi21-Track-B-5 — Daily-month chart aggregation.
 *
 * When `scope === 'month'` the doctor PDF replaces the implicit 24-month
 * trajectory with a per-day chart for the focus month. This module owns
 * the data prep so the test surface is a pure transform; the rendering
 * stays inline in pdf.ts (consistent with the other chart primitives).
 *
 * Per-day arrays are returned in 1..daysInMonth order so the consumer can
 * map index → day-of-month directly.
 */
import type { CiphraDocument } from '$lib/stores/documents';

export interface DailyMonthSeries {
	dailyTotals: number[];        // length === daysInMonth; episode count per day
	dailySymptomDays: number[];   // length === daysInMonth; 0 or 1 per day
	dailySymptomCounts: number[]; // length === daysInMonth; symptom count per day
}

/**
 * Walk all entry docs once. For each focus-month entry: increment that day's
 * episode-total by the sum across `episodeCols`, and tick that day's symptom
 * flag if any symptom is truthy.
 *
 * `episodeCols` is the cohort's episode-type id list (per `blueprint.episodeTypes`)
 * — same list the 24-month aggregation walks. Passing it in keeps the daily
 * + monthly aggregations on identical column semantics so the line chart in
 * month-scope and year-scope reads the same data.
 */
export function aggregateDailyMonthSeries(
	documents: CiphraDocument[],
	year: number,
	month: number,
	daysInMonth: number,
	episodeCols: string[],
): DailyMonthSeries {
	const dailyTotals = new Array(daysInMonth).fill(0);
	const dailySymptomDays = new Array(daysInMonth).fill(0);
	const dailySymptomCounts = new Array(daysInMonth).fill(0);

	const focusPrefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
	for (const d of documents) {
		if (d?.data?.type !== 'entry') continue;
		const date = String(d.data?.date || '');
		if (!date.startsWith(focusPrefix)) continue;
		const day = parseInt(date.slice(8, 10), 10);
		if (!Number.isFinite(day) || day < 1 || day > daysInMonth) continue;
		const idx = day - 1;
		const eps = (d.data?.episodes || {}) as Record<string, unknown>;
		const seizures = ((d.data as Record<string, unknown>)?.seizures || {}) as Record<string, unknown>;
		for (const col of episodeCols) {
			dailyTotals[idx] += Number(eps[col] || seizures[col] || 0);
		}
		const syms = (d.data?.symptoms || {}) as Record<string, unknown>;
		const symCount = Object.values(syms).filter((v) => !!v).length;
		dailySymptomCounts[idx] += symCount;
		if (symCount > 0) dailySymptomDays[idx] = 1;
	}

	return { dailyTotals, dailySymptomDays, dailySymptomCounts };
}
