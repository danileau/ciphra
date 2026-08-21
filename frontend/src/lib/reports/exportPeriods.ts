/**
 * ciphra — data-backed export periods for the /reports doctor export.
 *
 * WHY THIS EXISTS
 *
 * The three export cards (month / year / 2 years) used to be gated by a
 * single global heuristic in +page.svelte:
 *
 *     dataSpanDays   = Date.now() - <oldest entry>
 *     yearAvailable  = dataSpanDays >= 60
 *     twoYearsAvail  = dataSpanDays >= 365
 *
 * That measured the AGE OF THE OLDEST ENTRY, not the span of the data.
 * Someone who logged Jan–Mar 2023 and stopped got dataSpanDays ≈ 900, so
 * "2 Jahre" unlocked and produced a 24-month PDF that was empty for 21 of
 * them. It also could not answer the question the picker needs to answer:
 * *which* periods actually hold data.
 *
 * More importantly, the export was always anchored to the month currently
 * open in /reports, so the only way to export 2023 was to page the whole
 * view back into 2023 first. There was no way to say "give me 2023".
 *
 * THE ANCHOR TRICK
 *
 * `generateDoctorPdf(bp, docs, year, month, …, scope)` already accepts an
 * arbitrary anchor, and the window is "trailing N months ENDING at the
 * anchor month" (pdf.ts:3854). So a calendar year IS a trailing-12 window
 * anchored at December, and a calendar year pair IS a trailing-24 window
 * anchored at December of the later year. Picking a period is therefore
 * just picking an anchor — no change to the PDF generator at all.
 *
 * WHAT COUNTS AS DATA
 *
 * Exactly what the export itself counts: `isExportable()` (diary and
 * per-entry `private` excluded) AND `type === 'entry'`. Anything looser
 * would offer a month of purely private entries and then export an empty
 * PDF — the drift `isExportable` exists to prevent.
 */
import type { CiphraDocument } from '$lib/stores/documents';
// `ReportScope` and the window maths live in reportWindow.ts, not in
// `$lib/pdf` — that module pulls jsPDF + autoTable (~152KB gzip) and the
// reports page defers it behind `loadPdfLib()`. Importing the type from its
// own small module removes the dependency entirely rather than relying on
// `import type` erasure to hide it.
import { SCOPE_MONTHS, type ReportScope } from './reportWindow';
import { isExportable } from '$lib/utils/exportable';

// Re-exported so existing importers keep a single entry point.
export { SCOPE_MONTHS };
export type { ReportScope };

/** `YYYY-MM`. Lexicographic order is chronological order — relied on below. */
export type MonthKey = string;

/** Month → number of distinct days that hold at least one exportable entry. */
export type MonthIndex = Map<MonthKey, number>;

export interface PeriodOption {
	scope: ReportScope;
	/** Stable identity for keyed `{#each}` and for `selectedId` comparisons. */
	id: string;
	/** Anchor for `generateDoctorPdf` — the END month of the window. */
	anchorYear: number;
	/** 0-based, as `Date#getMonth()`. Always 11 for year / 2-year windows. */
	anchorMonth: number;
	startMonth: MonthKey;
	endMonth: MonthKey;
	monthsInWindow: number;
	/** Months inside the window holding ≥1 exportable entry. */
	monthsWithData: number;
	/** Distinct days logged across the whole window. */
	daysLogged: number;
}

/** `YYYY-MM` for a possibly out-of-range month index (e.g. -3 → Oct of prev year). */
function monthKeyOf(year: number, month: number): MonthKey {
	const y = year + Math.floor(month / 12);
	const m = ((month % 12) + 12) % 12;
	return `${y}-${String(m + 1).padStart(2, '0')}`;
}

/**
 * One O(n) pass over the documents. Counts DISTINCT DAYS rather than
 * documents: a day with an entry plus an event is one day logged, and the
 * coverage number shown in the picker has to mean what a patient reads it
 * to mean.
 */
export function buildMonthIndex(docs: CiphraDocument[] | null | undefined): MonthIndex {
	const daysByMonth = new Map<MonthKey, Set<string>>();
	for (const doc of docs ?? []) {
		if (!isExportable(doc)) continue;
		const data = (doc as { data?: any })?.data;
		if (data?.type !== 'entry') continue;
		const date = String(data.date || '');
		// Same shape guard the old dataSpanDays used: `YYYY-MM-DD` only.
		if (date.length !== 10) continue;
		const month = date.slice(0, 7);
		let days = daysByMonth.get(month);
		if (!days) {
			days = new Set();
			daysByMonth.set(month, days);
		}
		days.add(date);
	}
	const index: MonthIndex = new Map();
	for (const [month, days] of daysByMonth) index.set(month, days.size);
	return index;
}

function buildOption(index: MonthIndex, scope: ReportScope, anchorYear: number, anchorMonth: number): PeriodOption {
	const months = SCOPE_MONTHS[scope];
	let daysLogged = 0;
	let monthsWithData = 0;
	for (let back = 0; back < months; back++) {
		const days = index.get(monthKeyOf(anchorYear, anchorMonth - back)) ?? 0;
		if (days > 0) {
			monthsWithData++;
			daysLogged += days;
		}
	}
	const endMonth = monthKeyOf(anchorYear, anchorMonth);
	return {
		scope,
		id: `${scope}:${endMonth}`,
		anchorYear,
		anchorMonth,
		startMonth: monthKeyOf(anchorYear, anchorMonth - (months - 1)),
		endMonth,
		monthsInWindow: months,
		monthsWithData,
		daysLogged,
	};
}

/**
 * The periods offered for a scope, newest first.
 *
 *   month   — every calendar month holding data.
 *   year    — every calendar year holding data. A gap year is simply absent:
 *             data in 2023 and 2025 offers 2023 and 2025, never 2024.
 *   2years  — sliding consecutive year pairs across the data's year range,
 *             anchored at December of the later year. Data in 2023 and 2025
 *             offers 2024–2025 and 2023–2024: both are partly empty and both
 *             are offered, because a pair straddling the gap is a legitimate
 *             thing to hand a doctor. `monthsWithData` / `daysLogged` carry
 *             the honesty — the UI shows coverage on every row rather than
 *             hiding the sparse ones.
 *             A single year of data yields no pair, so the card locks: a
 *             24-month window over one year is the year export plus 12 empty
 *             months.
 */
export function availablePeriods(index: MonthIndex, scope: ReportScope): PeriodOption[] {
	const monthsWithData = [...index.entries()]
		.filter(([, days]) => days > 0)
		.map(([month]) => month)
		.sort();
	if (monthsWithData.length === 0) return [];

	if (scope === 'month') {
		return monthsWithData
			.slice()
			.reverse()
			.map((key) => buildOption(index, 'month', Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1));
	}

	const years = monthsWithData.map((key) => Number(key.slice(0, 4)));
	const minYear = Math.min(...years);
	const maxYear = Math.max(...years);

	if (scope === 'year') {
		return [...new Set(years)]
			.sort((a, b) => b - a)
			.map((year) => buildOption(index, 'year', year, 11));
	}

	const pairs: PeriodOption[] = [];
	for (let later = maxYear; later > minYear; later--) {
		pairs.push(buildOption(index, '2years', later, 11));
	}
	return pairs;
}

/** Display label. Kept out of the component so it is unit-testable. */
export function formatPeriodLabel(option: PeriodOption, locale: string): string {
	if (option.scope === 'month') {
		return new Date(option.anchorYear, option.anchorMonth, 1, 12).toLocaleDateString(locale, {
			month: 'long',
			year: 'numeric',
		});
	}
	if (option.scope === 'year') return String(option.anchorYear);
	// En dash, matching `formatWindowRange` in reportWindow.ts.
	return `${option.anchorYear - 1}–${option.anchorYear}`;
}

/**
 * Index of the option whose window contains `month`, else -1.
 *
 * Used to pre-select the period covering the month the user is already
 * looking at, so the picker opens on the PDF the old one-click flow would
 * have produced.
 */
export function findPeriodForMonth(options: PeriodOption[], month: MonthKey): number {
	return options.findIndex((o) => month >= o.startMonth && month <= o.endMonth);
}

/** Pre-selected row: the period covering `month`, else the newest. */
export function defaultPeriodIndex(options: PeriodOption[], month: MonthKey): number {
	if (options.length === 0) return -1;
	const found = findPeriodForMonth(options, month);
	return found >= 0 ? found : 0;
}
