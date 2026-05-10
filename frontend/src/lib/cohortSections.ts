/**
 * CIPH-pi21-Track-B-3 — typed cohort × section gate for the doctor PDF.
 *
 * Single source of truth for which sections render per cohort. Replaces
 * scattered `if (cohort === 'foo')` branches in pdf.ts. New cohort-conditional
 * sections (drawCycleStrip, drawPhaseDistribution, drawTriggerFrequency in
 * Track B Story 4) MUST be added here, not as inline conditionals.
 *
 * Decisions encoded per PDF_REWRITE.md §2-3 (architecture B: cohort-conditional
 * with mandatory spine):
 * - cycle cohort gets `cycle-strip`; phase cohort gets `phase-distribution`;
 *   narrative cohort gets `trigger-frequency`. Mutually exclusive — bipolar
 *   never sees a cycle strip, endometriosis never sees a phase distribution.
 * - data-conditional sections (rescue-med timeline, medication adherence)
 *   are NOT gated here — they live inline in pdf.ts because their gate is
 *   `blueprint.rescueMedications?.length`, not cohort.
 */
import type { Cohort } from '$lib/blueprint/cohort';

export type PdfSectionKey =
	| 'header'
	| 'disclaimer'
	| 'doctor-glance'
	| 'trend'
	| 'cycle-strip'
	| 'phase-distribution'
	| 'trigger-frequency'
	| 'day-coverage-strip'
	| 'condition-aware-bullets'
	| 'symptom-grid'
	| 'footer';

/**
 * Mandatory spine (PDF_REWRITE.md §3) — every cohort renders these in this
 * exact order. The doctor reading two patient PDFs sees identical page-1
 * chrome regardless of cohort; only what falls between `trend` and
 * `day-coverage-strip` differs.
 */
export const SPINE: readonly PdfSectionKey[] = Object.freeze([
	'header',
	'disclaimer',
	'doctor-glance',
	'trend',
] as const);

/** Universal tail — appears after the cohort-gated middle for every cohort. */
const TAIL: readonly PdfSectionKey[] = Object.freeze([
	'day-coverage-strip',
	'condition-aware-bullets',
	'symptom-grid',
	'footer',
] as const);

/**
 * Resolve the ordered section list for a cohort. Use at PDF generation time:
 *
 *     const sections = sectionsForCohort(cohortOf(blueprint));
 *     for (const key of sections) { renderers[key](doc, ctx); }
 *
 * Order matches PDF_REWRITE.md §3's array literal.
 */
export function sectionsForCohort(cohort: Cohort): PdfSectionKey[] {
	const middle: PdfSectionKey[] = (() => {
		switch (cohort) {
			case 'cycle':
				return ['cycle-strip'];
			case 'phase':
				return ['phase-distribution'];
			case 'narrative':
				return ['trigger-frequency'];
			case 'discrete':
			case 'custom':
				return [];
		}
	})();
	return [...SPINE, ...middle, ...TAIL];
}
