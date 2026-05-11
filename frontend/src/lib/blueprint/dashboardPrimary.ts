/**
 * pi24 dashboard rework — primary card resolver.
 *
 * Decides which card occupies the 2/3 column's primary slot on `/` for a
 * given blueprint + the user's current data state. Replaces the old hard
 * gate `bp.episodeTypes?.length > 0 && (totalEpisodes || totalSymptomDays)`
 * which left Helena (Hashimoto) and any day-1 / sparse user with an
 * empty grid void next to a rendered rail.
 *
 * Codex + Claude campfire consensus (2026-05-12) anchors the routing.
 * Key rules baked in:
 *
 *  - Cohort-pinned first, data-aware second. The dashboard should answer
 *    the blueprint's core question, not whichever metric has the longest
 *    run. Data availability only decides between populated and sparse
 *    states *within* a pinned primitive.
 *  - No dashboard chip selector for multi-vital cohorts: pin one
 *    clinically recognizable default, optionally hand a small list of
 *    secondaries to the card for sparkline rendering.
 *  - Day-1 / no-data = silent. If no primary card applies AND there's
 *    nothing to mirror back, return null and let Companion render just
 *    the hero. No "nothing recorded yet" copy. See
 *    `feedback_no_gaslight_good_days`.
 *  - Migraine top-triggers is OBSERVATIONAL ("Top recorded triggers"),
 *    never "Your triggers" / "Causes" — copy discipline lives in i18n,
 *    not here.
 *  - Autism (phase cohort) framing in i18n MUST stay "overload /
 *    regulation episodes", not "flare". Codex's caveat on the campfire.
 */
import type { Blueprint } from './types';
import { cohortOf } from './cohort';

export type DashboardCardKind =
	| 'episode-trend'
	| 'vital-trend'
	| 'cycle-phase'
	| 'active-phase'
	| 'top-triggers'
	| 'treatment-cycle'
	| 'last-entries';

export type DashboardCardSpec =
	| { kind: 'episode-trend' }
	| { kind: 'vital-trend'; primaryVitalId: string; secondaryVitalIds: string[] }
	| { kind: 'cycle-phase' }
	| { kind: 'active-phase' }
	| { kind: 'top-triggers' }
	| { kind: 'treatment-cycle' }
	| { kind: 'last-entries' };

/**
 * Shape the resolver consumes. Build once in Companion.svelte from
 * `$documents` + the blueprint, hand to the resolver, hand its spec to
 * CompanionMain which switches on `kind`.
 */
export interface DashboardSummary {
	/** Any entry doc (any type, any date) exists for this user. */
	hasAnyEntry: boolean;
	/** At least one entry has a positive episodeType count. */
	hasEpisodeData: boolean;
	/** At least one entry recorded a trigger (array or object-map shape). */
	hasTriggerData: boolean;
	/** A multiDay phase episode is currently ongoing today. */
	hasActivePhase: boolean;
	/**
	 * Vital ids that have at least one non-empty value across any entry.
	 * Used by the vital-primary routing — a cohort with a pinned default
	 * vital only renders the vital-trend card once that vital has data.
	 */
	presentVitalIds: Set<string>;
}

/**
 * Per-condition vital pin. Each entry names the clinically recognizable
 * primary vital + a short list of secondaries the card may render as
 * sparkline companions. Pinned NOT chip-selectable — the dashboard has
 * an opinion. Detail views (settings, /reports) can offer selection.
 */
const VITAL_PRIMARY_MAP: Record<string, { primary: string; secondaries: string[] }> = {
	// Hashimoto: TSH is the clinical anchor. T3/T4/TPO follow as companions
	// when present. Lab-driven cohort — usually quarterly entries.
	hashimoto: {
		primary: 'tsh',
		secondaries: ['free_t4', 'free_t3', 'tpo_antibodies'],
	},
	// Hypertension: systolic BP is the standard, diastolic + pulse follow.
	hypertension: {
		primary: 'bp_systolic',
		secondaries: ['bp_diastolic', 'pulse'],
	},
	// Cardiovascular (newly mapped to discrete): same BP pin as hypertension.
	cardiovascular: {
		primary: 'bp_systolic',
		secondaries: ['bp_diastolic', 'pulse'],
	},
	// Diabetes: blood sugar primary, HbA1c follow (slower-moving).
	diabetes: {
		primary: 'blood_sugar',
		secondaries: ['hba1c'],
	},
	// Parkinson: tremor intensity is the patient-facing metric; off-time
	// hours is the clinically central one. Tremor primary because it's
	// more immediate; off-time as secondary.
	parkinson: {
		primary: 'tremor_intensity',
		secondaries: ['off_time_hours'],
	},
	// Bipolar: mood polarity (-5..+5) is the bipolar trend question
	// between flares. Sleep + mood-magnitude as companions. Phase cohort,
	// so active-phase card takes priority; vital-trend kicks in when
	// nothing is actively flaring.
	bipolar: {
		primary: 'mood_polarity',
		secondaries: ['mood', 'sleep_hours'],
	},
};

/**
 * Conditions where top-triggers belongs in the PRIMARY slot when the
 * user has logged any trigger. Codex flagged that causal-implying
 * trigger drilldowns are risky as primary for many chronic cohorts; we
 * keep this set narrow: only conditions whose clinical workflow IS
 * trigger-hunting.
 *
 * Other trigger-rich cohorts (IBS, asthma) keep triggers in secondary
 * surfaces — /reports glance, journal — not on the dashboard.
 */
const TOP_TRIGGERS_PRIMARY_CONDITIONS = new Set<string>([
	'migraine',
	'dermatology',
]);

/**
 * Resolve which primary card the dashboard should show. Returns `null`
 * when no card has enough signal AND there's no last-entries fallback
 * — the dashboard renders just the hero (silent empty state).
 */
export function resolvePrimaryDashboardCard(
	bp: Blueprint | null | undefined,
	summary: DashboardSummary,
): DashboardCardSpec | null {
	if (!bp) {
		return summary.hasAnyEntry ? { kind: 'last-entries' } : null;
	}
	const cohort = cohortOf(bp);
	const conditionId = bp.conditionId;

	// 1) Cycle cohort: cycle phase card is the cohort's anchor.
	if (cohort === 'cycle') {
		return { kind: 'cycle-phase' };
	}

	// 2) Active multiDay phase: the most actionable state. Beats every
	//    long-range trend while a flare is ongoing today.
	if (cohort === 'phase' && summary.hasActivePhase) {
		return { kind: 'active-phase' };
	}

	// 3) Cancer treatment: dedicated treatment-arc card. Distinct from
	//    every other narrative cohort because the regimen IS the story.
	if (conditionId === 'cancer_treatment') {
		return { kind: 'treatment-cycle' };
	}

	// 4) Trigger-hunt cohorts: top-triggers primary, gated on having any
	//    trigger data. Observational copy is enforced in the i18n keys
	//    used by TopTriggersCard, never in the resolver.
	if (TOP_TRIGGERS_PRIMARY_CONDITIONS.has(conditionId) && summary.hasTriggerData) {
		return { kind: 'top-triggers' };
	}

	// 5) Vital-primary cohorts: vital-trend when the pinned primary vital
	//    has any logged value. Secondary ids are filtered to those that
	//    also have data, so a Hashimoto user with only TSH logged gets a
	//    single trend, not three empty sparklines.
	const vp = VITAL_PRIMARY_MAP[conditionId];
	if (vp && summary.presentVitalIds.has(vp.primary)) {
		const secondaries = vp.secondaries.filter((id) => summary.presentVitalIds.has(id));
		return {
			kind: 'vital-trend',
			primaryVitalId: vp.primary,
			secondaryVitalIds: secondaries,
		};
	}

	// 6) Episode trend: any blueprint with episodes AND episode data.
	//    Covers epilepsy / adhd / asthma / glaucoma (discrete cohorts
	//    without a vital pin) and phase cohorts between flares.
	if (bp.episodeTypes?.length && summary.hasEpisodeData) {
		return { kind: 'episode-trend' };
	}

	// 7) Final fallback: last-entries strip if anything has been logged.
	//    No copy header, no "nothing recorded yet" — the strip simply
	//    mirrors what the user has done.
	if (summary.hasAnyEntry) {
		return { kind: 'last-entries' };
	}

	// 8) Silent empty state. Day-1 brand-new user, OR an existing user
	//    whose blueprint has no episodes / no vital pin / no triggers
	//    AND no entries yet. Companion renders only the greeting hero.
	return null;
}
