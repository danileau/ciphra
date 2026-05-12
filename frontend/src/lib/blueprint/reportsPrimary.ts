/**
 * pi24 reports rework — primary trend resolver for /reports.
 *
 * Sibling to `dashboardPrimary.ts` but with a different contract.
 * Dashboard answers "what matters today" (glance, condensed); reports
 * answers "what pattern do I show my clinician" (forensic, full window).
 * Same resolver IDEA, different routing priorities and different
 * granularity of result.
 *
 * Codex + Claude campfire consensus (2026-05-12, /reports round 2).
 *
 * Routing priority (clinician-pattern context):
 *
 * 1. Vital-pinned cohort + pinned vital has data → 'vital-trend'.
 *    Hashimoto / hypertension / cardiovascular / diabetes / parkinson /
 *    bipolar. /reports is a forensic surface, so the vital trend is
 *    the right primary regardless of what's happening on the dashboard.
 *    This is the bug fix: pre-pi24 reports skipped the chart entirely
 *    when episodeTypes was empty (Hashimoto) or when the user only
 *    logged vitals (Klaus / hypertension).
 *
 * 2. Episode cohort + episode-or-symptom data → 'episode-trend'.
 *    The dual-axis episodes + symptom-days chart. Default for
 *    epilepsy / adhd / asthma / glaucoma. Codex's campfire round 2
 *    conceded that this IS the right primary for episode cohorts —
 *    just not the universal centerpiece.
 *
 * 3. Any entry exists → 'last-entries'. Universal fallback. Same
 *    pattern as dashboard — silence > nag when nothing fits.
 *
 * 4. Else null. Day-1 user, no data.
 *
 * Cycle / phase / narrative cohorts intentionally fall through to
 * episode-trend (step 2) or last-entries (step 3) in this initial
 * version. Their dedicated primaries (cycle-phase summary, flare list,
 * top-triggers + journal feed) are deferred to P-later — the dual-axis
 * chart still works for those cohorts (not ideal, but not broken). The
 * dogfood-fixing scope of P1 is the vital-trend dimension.
 */
import type { Blueprint } from './types';

export type ReportsCardKind =
	| 'episode-trend'
	| 'vital-trend'
	| 'last-entries';

export type ReportsCardSpec =
	| { kind: 'episode-trend' }
	| {
			kind: 'vital-trend';
			primaryVitalId: string;
			secondaryVitalIds: string[];
			/**
			 * True when the primary vital's reference range crosses zero
			 * (`min < 0`). Signals to the renderer that diverging-bar
			 * presentation is clinically correct (e.g. mood_polarity in
			 * bipolar). Line charts overstate continuity for sign+magnitude
			 * data; bars centered on the zero baseline read as "how much
			 * mania vs how much depression" at a glance.
			 */
			diverging: boolean;
		}
	| { kind: 'last-entries' };

export interface ReportsSummary {
	hasAnyEntry: boolean;
	hasEpisodeData: boolean;
	hasSymptomData: boolean;
	presentVitalIds: Set<string>;
}

/**
 * Per-condition vital pins for /reports. Same primary as the dashboard
 * map in `dashboardPrimary.ts` — the cohort's clinical anchor doesn't
 * change between surfaces. Secondaries are broader on /reports because
 * the surface has room: small multiples / chip selector handle them.
 */
const VITAL_PRIMARY_MAP: Record<string, { primary: string; secondaries: string[] }> = {
	hashimoto: {
		primary: 'tsh',
		// Reports surface shows the full lab panel — 4-up chip row when
		// all four have data, otherwise filtered to those with data.
		secondaries: ['free_t4', 'free_t3', 'tpo_antibodies'],
	},
	hypertension: {
		primary: 'bp_systolic',
		secondaries: ['bp_diastolic', 'pulse'],
	},
	cardiovascular: {
		primary: 'bp_systolic',
		secondaries: ['bp_diastolic', 'pulse', 'spo2'],
	},
	diabetes: {
		primary: 'blood_sugar',
		secondaries: ['hba1c', 'insulin', 'carbs'],
	},
	parkinson: {
		primary: 'tremor_intensity',
		// off_time_hours is the clinically central second metric.
		secondaries: ['off_time_hours', 'sleep_hours'],
	},
	bipolar: {
		// mood_polarity is the diverging primary (min < 0). The vital
		// definition in presets.ts carries min: -5, max: 5; the resolver
		// reads that via the diverging flag below.
		primary: 'mood_polarity',
		secondaries: ['mood', 'sleep_hours'],
	},
};

export function resolveReportsPrimaryCard(
	bp: Blueprint | null | undefined,
	summary: ReportsSummary,
): ReportsCardSpec | null {
	if (!bp) {
		return summary.hasAnyEntry ? { kind: 'last-entries' } : null;
	}
	const conditionId = bp.conditionId;

	// 1) Vital-pinned cohorts come FIRST on /reports. Dashboard puts
	//    cycle/active-phase anchors above the vital trend; reports has
	//    no anchor blocks, so the vital trend goes straight to primary
	//    when it has data. This is the bug fix for the Hashimoto + Klaus
	//    dogfood findings.
	const vp = VITAL_PRIMARY_MAP[conditionId];
	if (vp && summary.presentVitalIds.has(vp.primary)) {
		const secondaries = vp.secondaries.filter((id) => summary.presentVitalIds.has(id));
		const primaryVital = bp.vitals?.find((v) => v.id === vp.primary);
		const diverging = typeof primaryVital?.min === 'number' && primaryVital.min < 0;
		return {
			kind: 'vital-trend',
			primaryVitalId: vp.primary,
			secondaryVitalIds: secondaries,
			diverging,
		};
	}

	// 2) Episode trend: any blueprint with episodes AND (episode OR
	//    symptom data). Covers epilepsy / adhd / asthma / glaucoma plus
	//    phase / cycle / narrative cohorts in this initial pass.
	if (bp.episodeTypes?.length && (summary.hasEpisodeData || summary.hasSymptomData)) {
		return { kind: 'episode-trend' };
	}

	// 3) Universal fallback when anything has been logged.
	if (summary.hasAnyEntry) {
		return { kind: 'last-entries' };
	}

	// 4) Day-1 / no-data → silent. Caller renders only KPI scaffolding
	//    + empty state, no chart card.
	return null;
}
