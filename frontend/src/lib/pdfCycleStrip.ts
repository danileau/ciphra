/**
 * CIPH-pi21-Track-B-4 — Cycle phase strip aggregation for the doctor PDF.
 *
 * Cycle cohort (endometriosis / menopause / PCOS) renders a per-day
 * horizontal strip showing the cycle phase (menstrual / follicular /
 * ovulation / luteal) for each day of the focus month. Mirrors the calendar
 * v3 cell tinting so a doctor reading the PDF sees the same phase encoding
 * the patient sees in-app.
 *
 * Aggregation lives here for unit-testing in isolation; the jsPDF rendering
 * is inline in pdf.ts (consistent with `drawDayCoverageStrip`,
 * `drawPhaseDistribution`).
 *
 * Gated by `sectionsForCohort(cohort).includes('cycle-strip')` —
 * phase/discrete/narrative/custom cohorts never call this.
 */
import type { Blueprint } from '$lib/blueprint';
import type { CiphraDocument } from '$lib/stores/documents';
import { computeCycleAnchor, cycleStateForDate, type Phase } from '$lib/cycleState';

export interface CycleStripCell {
	/** Day-of-month, 1..daysInMonth. */
	day: number;
	/** ISO YYYY-MM-DD for this cell. */
	iso: string;
	/** Resolved phase, or null when anchor has no data (silent month). */
	phase: Phase | null;
}

/**
 * 2026-06-07 clinician review P1-4 — anchor staleness threshold (days).
 * Beyond this age, the phase strip is rendered without tinting and a
 * footnote names the last recorded period date. Prevents the menopause/
 * irregular-cycle case where the strip otherwise paints a confident
 * phase pattern from purely-projected data.
 */
export const CYCLE_ANCHOR_STALE_DAYS = 60;

export interface CycleStripResult {
	cells: CycleStripCell[];
	/** ISO YYYY-MM-DD of the most-recent period entry the anchor came
	 *  from, or null when no anchor data exists. */
	anchorDate: string | null;
	/** Age in days between anchorDate and the focus-month end. Null
	 *  when no anchor. Used by the renderer to decide tinting-vs-empty. */
	anchorAgeDays: number | null;
	/** Whether anchorAgeDays exceeds CYCLE_ANCHOR_STALE_DAYS. Render
	 *  must skip phase tinting when true. */
	stale: boolean;
}

/**
 * Build the per-day phase array for the focus month plus anchor
 * provenance. Requires the user's full doc set so the anchor scan
 * can reach back beyond the focus month for the most-recent
 * `cycle_day` and `cycle_length` values.
 */
export function aggregateCycleStrip(
	blueprint: Blueprint,
	allDocs: CiphraDocument[],
	year: number,
	month: number,
	daysInMonth: number,
): CycleStripResult {
	const anchor = computeCycleAnchor(blueprint, allDocs);
	const out: CycleStripCell[] = [];
	// Anchor age is measured from the focus month's last day so a strip
	// rendered for "May" with anchor in early March reads as ~60 days
	// stale, not "30 days stale because today is May 15."
	let anchorAgeDays: number | null = null;
	if (anchor.anchorDate) {
		const anchorMs = Date.parse(anchor.anchorDate + 'T12:00:00');
		const focusEndMs = Date.parse(
			`${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}T12:00:00`,
		);
		if (!Number.isNaN(anchorMs) && !Number.isNaN(focusEndMs)) {
			anchorAgeDays = Math.max(0, Math.round((focusEndMs - anchorMs) / 86400000));
		}
	}
	const stale = anchorAgeDays !== null && anchorAgeDays > CYCLE_ANCHOR_STALE_DAYS;
	for (let day = 1; day <= daysInMonth; day++) {
		const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
		const state = cycleStateForDate(anchor, iso);
		// Stale anchor → strip the phase so the renderer paints empty
		// cells instead of confident tints. Day numbers still render.
		out.push({ day, iso, phase: stale ? null : (state?.phase ?? null) });
	}
	return {
		cells: out,
		anchorDate: anchor.anchorDate,
		anchorAgeDays,
		stale,
	};
}
