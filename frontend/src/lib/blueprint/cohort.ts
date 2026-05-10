/**
 * CIPH-852 — Condition cohorts.
 *
 * ciphra is configurable per-condition at the DATA layer (what you track)
 * but flows should also adapt at the UX layer. Cohorts group conditions
 * by what they need from the home dashboard and primary browse surface:
 *
 * - `discrete`   — epilepsy/ADHD/hypertension/glaucoma/asthma/diabetes/parkinson.
 *                  Episodes are point events. Trend chart is the primary signal.
 * - `cycle`      — endometriosis/menopause/PCOS. Cycle phase is the mental model.
 *                  Calendar with cycle overlay is primary.
 * - `phase`      — bipolar/MS/long-covid/IBD/IBS/chronic_pain/anxiety_depression/
 *                  burnout. Multi-day episode bands are clinically central.
 *                  Calendar with phase-bands is primary.
 * - `narrative`  — migraine. Trigger hunt + running notes; journal is primary.
 * - `custom`     — safe defaults, user drives.
 *
 * Cohort is DERIVED from conditionId (never stored) so that future preset
 * additions stay consistent without client migration.
 */
import type { Blueprint } from './types';

export type Cohort = 'discrete' | 'cycle' | 'phase' | 'narrative' | 'custom';

const COHORT_MAP: Record<string, Cohort> = {
	// Discrete-event: episodes are point-in-time, trend is the story.
	epilepsy: 'discrete',
	adhd: 'discrete',
	hypertension: 'discrete',
	glaucoma: 'discrete',
	asthma: 'discrete',
	diabetes: 'discrete',
	parkinson: 'discrete',
	// CIPH-pi24-4b — Hashimoto: lab-driven (TSH/T3/T4/TPO) over months.
	// Stable patients on Levothyroxine; symptom-days flag dose-adjust
	// conversations rather than multiDay flare patterns. Trend = primary.
	hashimoto: 'discrete',

	// Cycle-driven: monthly cycle phase is the mental model.
	endometriosis: 'cycle',
	menopause: 'cycle',
	pcos: 'cycle',

	// Phase-band: multi-day episodes are the clinical unit.
	bipolar: 'phase',
	ms: 'phase',
	long_covid: 'phase',
	ibd: 'phase',
	ibs: 'phase',
	chronic_pain: 'phase',
	anxiety_depression: 'phase',
	burnout: 'phase',

	// Narrative: trigger hunting, running notes.
	migraine: 'narrative',
	// CIPH-pi24-4a — cancer_treatment fits narrative (journal-primary).
	// Episode types are point-events (febrile_neutropenia, ER visit, dose
	// reduction, hospitalization) rather than multiDay flares; side-effects
	// + emotional load read as journal entries with narrative context.
	cancer_treatment: 'narrative',

	// Custom: user drives everything.
	custom: 'custom',
};

export function getCohort(conditionId: string | undefined): Cohort {
	if (!conditionId) return 'custom';
	return COHORT_MAP[conditionId] ?? 'custom';
}

export function cohortOf(blueprint: Blueprint | null | undefined): Cohort {
	return getCohort(blueprint?.conditionId);
}

/** Default primary browse surface per cohort. */
const COHORT_DEFAULT_SURFACE: Record<Cohort, 'journal' | 'calendar' | 'trend'> = {
	discrete: 'trend',
	cycle: 'calendar',
	phase: 'calendar',
	narrative: 'journal',
	custom: 'journal',
};

/**
 * Resolve the primary browse surface for a blueprint.
 * Priority: explicit `primaryBrowseSurface` field → cohort default → 'journal'.
 * User overrides (stored by Settings) take precedence because they write
 * directly into `blueprint.primaryBrowseSurface`.
 */
export function getPrimaryBrowseSurface(
	blueprint: Blueprint | null | undefined,
): 'journal' | 'calendar' | 'trend' {
	if (blueprint?.primaryBrowseSurface) return blueprint.primaryBrowseSurface;
	return COHORT_DEFAULT_SURFACE[cohortOf(blueprint)];
}

/**
 * All cohorts (for test coverage / UI enumeration).
 */
export const ALL_COHORTS: Cohort[] = ['discrete', 'cycle', 'phase', 'narrative', 'custom'];
