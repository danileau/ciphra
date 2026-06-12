/**
 * CIPH-pi23-A3a / A3b — cohort-conditional insight for the calendar lg+ rail
 * MonthMiniSummary chip.
 *
 * Phase cohort (Anna primary): top multiDay episode types by day-coverage in
 * the focus month. Mirrors the PI v21 PDF drawPhaseDistribution but renders
 * inline in the in-app rail so the patient sees their own pattern between
 * doctor visits, not just on the printed handover.
 *
 * Discrete cohort (Hans primary): top episode type by count in the focus
 * month. Bipolar's manic/depressive day-coverage doesn't apply to epilepsy's
 * point-event seizures — a discrete cohort wants to see "12 focal seizures"
 * not "X% manic days."
 *
 * Cycle / narrative / custom: null. Future PIs add their own branches with
 * their own anchor personas.
 *
 * The helper is testable in isolation; rendering lives in MonthMiniSummary.svelte.
 */
import type { Blueprint, EpisodeType } from '$lib/blueprint';
import type { CiphraDocument } from '$lib/stores/documents';
import type { Cohort } from '$lib/blueprint/cohort';
import { multiDayEpisodeDays, episodeCountTotals } from '$lib/monthAggregates';

/** Phase-cohort insight: top-N multiDay episode types by day-coverage. */
export interface PhaseDayCoverageInsight {
	kind: 'phase-day-coverage';
	segments: Array<{
		id: string;
		/** i18n key OR literal label; caller resolves with labelOf(t, item). */
		label: string;
		/** Days in focus month with this episode active, 0..daysInMonth. */
		days: number;
		/** Fraction of focus month, 0..1. */
		pct: number;
		/** EpisodeType.color (hex). */
		color: string;
	}>;
}

/** Discrete-cohort insight: top point-event episode by total count. */
export interface TopEpisodeInsight {
	kind: 'top-episode';
	id: string;
	label: string;
	count: number;
	color: string;
}

export type MonthSummaryInsight = PhaseDayCoverageInsight | TopEpisodeInsight | null;

/**
 * Compute the cohort-appropriate insight for the focus month. Returns null
 * for cohorts without a defined insight surface (cycle, narrative, custom)
 * — caller should hide the chip section in that case rather than render
 * empty chrome.
 */
export function monthSummaryInsightFor(
	cohort: Cohort,
	blueprint: Blueprint,
	focusMonthDocs: CiphraDocument[],
	daysInMonth: number,
): MonthSummaryInsight {
	switch (cohort) {
		case 'phase':
			return phaseDayCoverage(blueprint, focusMonthDocs, daysInMonth);
		case 'discrete':
			return topEpisode(blueprint, focusMonthDocs);
		case 'cycle':
		case 'narrative':
		case 'custom':
			return null;
	}
}

function phaseDayCoverage(
	blueprint: Blueprint,
	focusMonthDocs: CiphraDocument[],
	daysInMonth: number,
): PhaseDayCoverageInsight | null {
	const multiDayEps: EpisodeType[] = (blueprint.episodeTypes ?? []).filter((ep) => ep.multiDay);
	if (multiDayEps.length === 0 || daysInMonth <= 0) return null;

	// Shared math (design review 2026-06-11) — same day-sets the doctor
	// PDF and /reports use, including the legacy `seizures`-shape
	// fallback this site previously missed.
	const dayCounts = multiDayEpisodeDays(blueprint, focusMonthDocs);

	const segments = multiDayEps
		.map((ep) => ({
			id: ep.id,
			label: ep.label,
			days: dayCounts.get(ep.id)!.size,
			pct: dayCounts.get(ep.id)!.size / daysInMonth,
			color: ep.color,
		}))
		.filter((s) => s.days > 0)
		.sort((a, b) => b.days - a.days);

	if (segments.length === 0) return null;
	return { kind: 'phase-day-coverage', segments };
}

function topEpisode(
	blueprint: Blueprint,
	focusMonthDocs: CiphraDocument[],
): TopEpisodeInsight | null {
	const pointEps: EpisodeType[] = (blueprint.episodeTypes ?? []).filter((ep) => !ep.multiDay);
	if (pointEps.length === 0) return null;

	const counts = episodeCountTotals(blueprint, focusMonthDocs, 'point');

	let topId: string | null = null;
	let topCount = 0;
	for (const [id, n] of counts) {
		if (n > topCount) { topId = id; topCount = n; }
	}
	if (!topId || topCount === 0) return null;

	const ep = pointEps.find((e) => e.id === topId)!;
	return { kind: 'top-episode', id: topId, label: ep.label, count: topCount, color: ep.color };
}
