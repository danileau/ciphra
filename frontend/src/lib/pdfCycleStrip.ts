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
 * Build the per-day phase array for the focus month. Requires the user's
 * full doc set so the anchor scan can reach back beyond the focus month for
 * the most-recent `cycle_day` and `cycle_length` values.
 */
export function aggregateCycleStrip(
	blueprint: Blueprint,
	allDocs: CiphraDocument[],
	year: number,
	month: number,
	daysInMonth: number,
): CycleStripCell[] {
	const anchor = computeCycleAnchor(blueprint, allDocs);
	const out: CycleStripCell[] = [];
	for (let day = 1; day <= daysInMonth; day++) {
		const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
		const state = cycleStateForDate(anchor, iso);
		out.push({ day, iso, phase: state?.phase ?? null });
	}
	return out;
}
