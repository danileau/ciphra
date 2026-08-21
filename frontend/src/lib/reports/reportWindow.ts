/**
 * ciphra — the exported report's time window, as one object.
 *
 * WHY THIS EXISTS
 *
 * The doctor PDF titled itself "Letzte 12 Monate" / "Letzte 24 Monate" on
 * every multi-month export. That was written when the anchor month was
 * always the current month, so "the last 12 months" and "the window this
 * report covers" were the same sentence.
 *
 * The /reports period picker decoupled them: it anchors calendar periods at
 * December, so a report can cover Jan–Dec 2023 and be generated in 2026.
 * The relative phrase then sits next to "Exportiert: 21. Aug. 2026" and a
 * reader decodes Aug 2025 – Aug 2026 — a document that contradicts its own
 * x-axis two centimetres below.
 *
 * It is worse than context-dependent. A patient exporting their 2023 report
 * in March 2024 hands over "Letzte 12 Monate · Exportiert: 12. März 2024",
 * which decodes to Mär 2023 – Mär 2024: a quarter off, and into the wrong
 * year. Since the picker anchors every year and every pair at December,
 * that is the normal case, not the edge case.
 *
 * THE RULE WAS ALREADY WRITTEN DOWN
 *
 *   docs/archive/PDF_DESIGN_SPEC.md §15 — "The date range must appear on
 *     page 1." (§9 source and date range visible; §16 the footer carries
 *     the range or enough continuation context)
 *   docs/archive/PDF_TEMPLATE.md §6 — page 1 carries the "report window"
 *   docs/archive/CLINICAL_HANDOFF.md:73 — "Export period: {range}"
 *
 * And a stated-period-vs-actual-content mismatch is the documented reason
 * the previous renderer was deleted (CLINICAL_HANDOFF.md:6-8: the export
 * showed "last 90 days (count: 1)" when the user had selected 2 years).
 *
 * `scopeFileTag` already implemented the calendar-vs-trailing distinction
 * correctly — but only for the filename. This module generalises that one
 * rule so the header, the footer, the section titles and the filename
 * finally describe the same window.
 */

/** Report length. Owned here so `pdf.ts` and `exportPeriods.ts` share it. */
export type ReportScope = 'month' | 'year' | '2years';

/** Window length per scope. */
export const SCOPE_MONTHS: Record<ReportScope, number> = {
	month: 1,
	year: 12,
	'2years': 24,
};

/**
 * What shape the window happens to be.
 *
 * `calendar-*` requires a December anchor — a trailing-12 window ending
 * August 2025 is NOT a calendar year and must never be named as one. That
 * sentence is already the written rule in pdfScopeFileTag.test.ts.
 */
export type WindowKind = 'month' | 'calendar-year' | 'calendar-years' | 'trailing';

export interface ReportWindow {
	scope: ReportScope;
	/** Anchor = the END month of the window. 0-based, as `Date#getMonth()`. */
	anchorYear: number;
	anchorMonth: number;
	kind: WindowKind;
	months: number;
	/** `YYYY-MM-DD`, first day of the first month. */
	startISO: string;
	/** `YYYY-MM-DD`, last day of the anchor month. */
	endISO: string;
	/** Inclusive day count across the window. */
	days: number;
}

const DECEMBER = 11;

function kindOf(scope: ReportScope, anchorMonth: number): WindowKind {
	if (scope === 'month') return 'month';
	if (anchorMonth !== DECEMBER) return 'trailing';
	return scope === 'year' ? 'calendar-year' : 'calendar-years';
}

/**
 * Derive the window from the same three inputs `generateDoctorPdf` takes.
 *
 * Noon anchor on the Date constructions: `.toISOString()` is UTC, so a
 * local-midnight date in any positive-offset timezone (CET/CEST) slips to
 * the previous day — which would shift the whole window back a day and drop
 * the last day of the month. Same reasoning as the original inline code.
 */
export function reportWindow(
	scope: ReportScope,
	anchorYear: number,
	anchorMonth: number,
): ReportWindow {
	const months = SCOPE_MONTHS[scope];
	const end = new Date(anchorYear, anchorMonth + 1, 0, 12);
	const start = new Date(anchorYear, anchorMonth + 1 - months, 1, 12);
	return {
		scope,
		anchorYear,
		anchorMonth,
		kind: kindOf(scope, anchorMonth),
		months,
		startISO: start.toISOString().slice(0, 10),
		endISO: end.toISOString().slice(0, 10),
		days: Math.round((end.getTime() - start.getTime()) / 86400000) + 1,
	};
}

/**
 * The window as a self-contained, absolute label for the document.
 *
 * A single month is already an unambiguous statement of its own range, so
 * it stays "Januar 2023". Everything longer prints both ends:
 *
 *   calendar-year   Jan 2023 – Dez 2023
 *   calendar-years  Jan 2024 – Dez 2025
 *   trailing        Sep 2024 – Aug 2025
 *
 * The year is repeated on BOTH ends rather than compressed to
 * "Jan – Dez 2023": a scan or photocopy that clips the right edge still
 * leaves a dated start. This document is expected to be printed, filed,
 * faxed and re-read long after the moment it was generated.
 *
 * Month names rather than numerics on purpose — "Jan 2023" cannot be
 * misread day-first in any locale, and a numeric range would inherit an
 * obligation to honour `Blueprint.dateFormat` (four options incl. `us`),
 * which the PDF does not do today.
 */
export function formatWindowRange(w: ReportWindow, locale: string): string {
	const end = new Date(w.anchorYear, w.anchorMonth, 1, 12);
	if (w.kind === 'month') {
		return end.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
	}
	const start = new Date(w.anchorYear, w.anchorMonth - (w.months - 1), 1, 12);
	const fmt = (d: Date) => d.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
	// En dash, matching the separator the picker uses for year pairs.
	return `${fmt(start)} – ${fmt(end)}`;
}

/**
 * Filename tag for a window.
 *
 * Moved here from pdf.ts so the naming rule and the labelling rule cannot
 * drift apart — they are the same rule. A December anchor is named as the
 * calendar period it is; any other anchor keeps the end-month form, which
 * is what it actually means.
 */
export function scopeFileTag(scope: ReportScope, year: number, month: number): string {
	const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
	if (scope === 'month') return monthPrefix;
	if (month === DECEMBER) {
		return scope === 'year' ? `year-${year}` : `2years-${year - 1}-${year}`;
	}
	return `${scope}-${monthPrefix}`;
}
