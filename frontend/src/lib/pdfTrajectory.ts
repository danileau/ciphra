/**
 * pi24 PDF P-PDF-2 — Cohort-aware trajectory pill.
 *
 * The pre-pi24 PDF computed a single trend label from episode-count delta
 * across two 6-month halves. That worked for episode-native cohorts
 * (epilepsy / ADHD) and silently misled every other cohort — the
 * 5-doctor agents campfire (see `feedback_pdf_clinician_lens.md`)
 * universally flagged this as the single most-cited concern across
 * specialties. Highlights:
 *
 *  - Steiner (endo): "STABIL" on a Hashimoto patient mid-titration,
 *    while TSH is clearly trending down on Page 3 — "wrong with
 *    confidence, you've spent your credibility budget."
 *  - Roth (neuro): "VERBESSERUNG" green pill on a patient with a GTC
 *    8 months ago — "ends up in a malpractice deposition."
 *  - Brunner (psych): "VERSCHLECHTERUNG" because episode count went
 *    1 → 2 in a quarter — "treats bipolar like hypertension; cry
 *    wolf on every stable patient."
 *  - Müller (cardio): "STABIL" with home BP 156/96 PM, hypertensive
 *    crisis logged — "klinisch gefährlich, lese ich als Entwarnung."
 *
 * Codex round 1 of the PDF campfire converged on the same fix:
 * "trajectory pill should stop being episode-first and become
 * primary cohort signal first" + "wrong pill is worse than no pill."
 *
 * This module returns the pill spec the PDF should draw, or `null`
 * to omit. Caller stays responsible for layout / color / i18n
 * resolution.
 *
 * Design rules baked in:
 * - Vital cohorts get NEUTRAL direction labels ("TSH: rising") — not
 *   "improving / worsening." Direction semantics depend on the
 *   underlying biology (TSH falling toward target = good for
 *   hypothyroid; TSH rising = bad). Avoid putting a value judgment
 *   in the label; let the doctor read direction + numbers and
 *   interpret. Steiner: "let me see the numbers, I'll interpret."
 * - Bipolar gets sign-aware polarity labels ("more manic" / "more
 *   depressed" / "closer to baseline"), never "improving / worsening" —
 *   direction IS the clinical question, magnitude alone is not.
 * - Sparse-data states (both halves have no values) return null
 *   instead of "stable" — that's the "wrong with confidence" mode
 *   Steiner flagged.
 */
import type { Blueprint } from './blueprint/types';
import type { CiphraDocument } from './stores/documents';
import { cohortOf } from './blueprint/cohort';

export type TrajectoryDir = 'up' | 'down' | 'flat';

export type TrajectoryPillSpec =
	| {
			kind: 'episode';
			firstAvg: number;
			lastAvg: number;
			trendDir: TrajectoryDir;
			/**
			 * Label i18n keys, picked by caller. Episode cohorts keep the
			 * pre-pi24 i18n keys (`pdf.trend_improving / stable / worsening`)
			 * so existing translations stay valid.
			 */
			labelKey: 'pdf.trend_improving' | 'pdf.trend_stable' | 'pdf.trend_worsening';
		}
	| {
			kind: 'vital';
			vitalId: string;
			vitalLabel: string;
			firstAvg: number;
			lastAvg: number;
			trendDir: TrajectoryDir;
			/**
			 * Label i18n keys for vital cohorts. Neutral wording — no
			 * value judgment. `{vital}` placeholder is the vital label.
			 */
			labelKey: 'pdf.trend_vital_rising' | 'pdf.trend_vital_falling' | 'pdf.trend_vital_stable';
		}
	| {
			kind: 'polarity';
			/**
			 * Polarity-specific labels. Direction expressed as a clinical
			 * pole-shift, not a value judgment. `more_manic` and
			 * `more_depressive` are both away-from-baseline.
			 */
			labelKey:
				| 'pdf.trend_polarity_more_manic'
				| 'pdf.trend_polarity_more_depressive'
				| 'pdf.trend_polarity_closer_to_baseline';
			firstAvg: number;
			lastAvg: number;
			/**
			 * For bipolar, direction is interpreted as polarity-pole
			 * shift, not arithmetic up/down. Caller may color accordingly.
			 */
			poleShift: 'toward_manic' | 'toward_depressive' | 'toward_baseline';
		};

/**
 * Per-cohort vital pin for the trajectory pill. Matches dashboardPrimary
 * + reportsPrimary maps (single source of truth would be ideal; today
 * the maps live in three places because they evolved per-surface).
 *
 * NOT-listed condition-ids fall through to episode-trajectory in
 * `resolveTrajectoryPill` — that's the right default for cohorts whose
 * clinical primary IS episodes (epilepsy / ADHD / asthma / glaucoma /
 * autism / phase cohorts without vital pin).
 */
const VITAL_PILL_MAP: Record<string, { primary: string }> = {
	hashimoto: { primary: 'tsh' },
	hypertension: { primary: 'bp_systolic' },
	cardiovascular: { primary: 'bp_systolic' },
	diabetes: { primary: 'blood_sugar' },
	parkinson: { primary: 'tremor_intensity' },
};

/**
 * Bipolar gets its own polarity treatment (sign + magnitude vs simple
 * monotonic trend). Separate from VITAL_PILL_MAP so the label semantics
 * don't conflict.
 */
const POLARITY_CONDITIONS = new Set<string>(['bipolar']);

interface MonthBucketLite {
	y: number;
	m: number;
}

/**
 * Compute the trajectory pill for a given blueprint + document set
 * over the same month-bucket window the trend chart uses. Returns null
 * to omit the pill entirely (sparse data, narrative cohorts whose
 * clinical primary is neither episodes nor a tracked vital).
 *
 * `monthBuckets` is the same 12 or 24-month window the chart spans —
 * pass it in so trajectory + chart axis stay synchronized.
 */
export function resolveTrajectoryPill(
	bp: Blueprint | null | undefined,
	documents: CiphraDocument[],
	monthBuckets: MonthBucketLite[],
	episodeColIds: string[],
): TrajectoryPillSpec | null {
	if (!bp || monthBuckets.length < 2) return null;
	const conditionId = bp.conditionId;
	const cohort = cohortOf(bp);
	const halfSize = Math.floor(monthBuckets.length / 2);

	// Polarity cohort path — sign+magnitude on the polar vital.
	if (POLARITY_CONDITIONS.has(conditionId)) {
		const series = aggregateVitalMonthly(documents, 'mood_polarity', monthBuckets);
		const firstHalf = series.slice(0, halfSize);
		const lastHalf = series.slice(-halfSize);
		const firstAvg = mean(firstHalf);
		const lastAvg = mean(lastHalf);
		if (firstAvg === null || lastAvg === null) return null;
		// 2026-06-07 clinician review P1-3: gate sample size to avoid
		// firing "stärker depressiv/manisch" on 1-vs-2 entries. Mirrors the
		// vital path's sparse-data null-out behaviour at the per-half level
		// rather than the across-window level. n=3 minimum per half
		// (≈ a quarter of typical bipolar episode cadence).
		const firstN = firstHalf.filter((v): v is number => v !== null).length;
		const lastN = lastHalf.filter((v): v is number => v !== null).length;
		if (firstN < 3 || lastN < 3) return null;
		const labelKey = pickPolarityLabel(firstAvg, lastAvg);
		const poleShift = pickPolarityShift(firstAvg, lastAvg);
		return { kind: 'polarity', firstAvg, lastAvg, labelKey, poleShift };
	}

	// Vital-pinned path — monotonic vital trajectory with neutral labels.
	const vp = VITAL_PILL_MAP[conditionId];
	if (vp) {
		const vital = bp.vitals?.find((v) => v.id === vp.primary);
		const series = aggregateVitalMonthly(documents, vp.primary, monthBuckets);
		const firstAvg = mean(series.slice(0, halfSize));
		const lastAvg = mean(series.slice(-halfSize));
		// Sparse-data → omit. This is the explicit "no pill" path that
		// fixes the "STABIL on a patient with no labs" malpractice case.
		if (firstAvg === null || lastAvg === null) return null;
		const trendDir = directionFromDelta(lastAvg - firstAvg, firstAvg);
		// Pick label key (no improving/worsening wording for vitals).
		const labelKey =
			trendDir === 'up'
				? 'pdf.trend_vital_rising'
				: trendDir === 'down'
					? 'pdf.trend_vital_falling'
					: 'pdf.trend_vital_stable';
		return {
			kind: 'vital',
			vitalId: vp.primary,
			vitalLabel: vital ? vital.label : vp.primary,
			firstAvg,
			lastAvg,
			trendDir,
			labelKey,
		};
	}

	// Narrative cohorts without an episodic primary metric (cancer,
	// custom) — omit. A green pill on a journal-primary cohort is the
	// same flavor of misleading as the vital case.
	if (cohort === 'narrative' && (!bp.episodeTypes || bp.episodeTypes.length === 0)) {
		return null;
	}
	if (cohort === 'custom') {
		return null;
	}

	// Episode-trajectory default — discrete-with-episodes, phase
	// cohorts, narrative cohorts WITH episodes. Same algorithm as
	// pre-pi24 but expressed through the typed spec so the caller
	// always reads `kind` to pick its render path.
	const monthlyTotals = computeMonthlyTotals(documents, monthBuckets, episodeColIds);
	const first = monthlyTotals.slice(0, halfSize);
	const last = monthlyTotals.slice(-halfSize);
	const firstAvg = first.reduce((a, b) => a + b, 0) / Math.max(1, first.length);
	const lastAvg = last.reduce((a, b) => a + b, 0) / Math.max(1, last.length);
	// Sparse-data omit: if both halves are zero counts, the cohort
	// either has no episode data in scope or doesn't track episodes
	// meaningfully — don't draw a confidence-pill on no signal.
	if (firstAvg === 0 && lastAvg === 0) return null;
	const trendDir = directionFromDelta(lastAvg - firstAvg, firstAvg);
	const labelKey =
		trendDir === 'up'
			? 'pdf.trend_worsening'
			: trendDir === 'down'
				? 'pdf.trend_improving'
				: 'pdf.trend_stable';
	return { kind: 'episode', firstAvg, lastAvg, trendDir, labelKey };
}

/* ───────── helpers (kept module-local; future surfaces that need vital
 * aggregation should factor `aggregateVitalMonthly` into a shared module). */

function aggregateVitalMonthly(
	documents: CiphraDocument[],
	vitalId: string,
	monthBuckets: MonthBucketLite[],
): (number | null)[] {
	const sums = monthBuckets.map(() => 0);
	const counts = monthBuckets.map(() => 0);
	const keyToIdx = new Map<string, number>();
	for (let i = 0; i < monthBuckets.length; i++) {
		const b = monthBuckets[i];
		keyToIdx.set(`${b.y}-${String(b.m + 1).padStart(2, '0')}`, i);
	}
	for (const d of documents) {
		if (d.data?.type !== 'entry') continue;
		const ds = String(d.data.date || '');
		if (ds.length < 7) continue;
		const idx = keyToIdx.get(ds.slice(0, 7));
		if (idx === undefined) continue;
		const vitals = (d.data.vitals || {}) as Record<string, unknown>;
		const raw = vitals[vitalId];
		if (raw === '' || raw === null || raw === undefined) continue;
		const values: number[] = [];
		if (typeof raw === 'number') values.push(raw);
		else if (typeof raw === 'string' && raw.trim() !== '') {
			const n = Number(raw);
			if (!Number.isNaN(n)) values.push(n);
		} else if (typeof raw === 'object') {
			for (const v of Object.values(raw as Record<string, unknown>)) {
				if (v === '' || v === null || v === undefined) continue;
				const n = Number(v);
				if (!Number.isNaN(n)) values.push(n);
			}
		}
		if (values.length === 0) continue;
		sums[idx] += values.reduce((a, b) => a + b, 0);
		counts[idx] += values.length;
	}
	return sums.map((s, i) => (counts[i] > 0 ? s / counts[i] : null));
}

function computeMonthlyTotals(
	documents: CiphraDocument[],
	monthBuckets: MonthBucketLite[],
	episodeColIds: string[],
): number[] {
	const totals = monthBuckets.map(() => 0);
	const keyToIdx = new Map<string, number>();
	for (let i = 0; i < monthBuckets.length; i++) {
		const b = monthBuckets[i];
		keyToIdx.set(`${b.y}-${String(b.m + 1).padStart(2, '0')}`, i);
	}
	for (const d of documents) {
		if (d.data?.type !== 'entry') continue;
		const ds = String(d.data.date || '');
		if (ds.length < 7) continue;
		const idx = keyToIdx.get(ds.slice(0, 7));
		if (idx === undefined) continue;
		const eps = (d.data.episodes || d.data.seizures || {}) as Record<string, number>;
		for (const col of episodeColIds) {
			totals[idx] += Number(eps[col] || 0);
		}
	}
	return totals;
}

function mean(values: (number | null)[]): number | null {
	const present = values.filter((v): v is number => v !== null);
	if (present.length === 0) return null;
	return present.reduce((a, b) => a + b, 0) / present.length;
}

function directionFromDelta(delta: number, firstAvg: number): TrajectoryDir {
	// Same flat-band threshold the pre-pi24 PDF used: max(0.5, 10% of
	// first-half average). For vital cohorts this is rough but
	// sufficient — a TSH change from 1.0 to 1.05 reads as flat, but
	// 1.0 to 2.0 reads as up.
	const eps = Math.max(0.5, Math.abs(firstAvg) * 0.1);
	if (delta > eps) return 'up';
	if (delta < -eps) return 'down';
	return 'flat';
}

function pickPolarityLabel(
	firstAvg: number,
	lastAvg: number,
):
	| 'pdf.trend_polarity_more_manic'
	| 'pdf.trend_polarity_more_depressive'
	| 'pdf.trend_polarity_closer_to_baseline' {
	// Polarity comparison is on absolute distance from baseline AND
	// sign shift. Bipolar trajectory means "the mean of the second
	// half is more on the manic side / depressive side / closer to 0
	// than the first half was."
	const delta = lastAvg - firstAvg;
	const eps = 0.3; // mood_polarity is -5..+5, so 0.3 is meaningful
	// If the second half is significantly closer to zero in absolute
	// terms, it's a shift toward baseline.
	if (Math.abs(lastAvg) < Math.abs(firstAvg) - eps) {
		return 'pdf.trend_polarity_closer_to_baseline';
	}
	if (delta > eps) return 'pdf.trend_polarity_more_manic';
	if (delta < -eps) return 'pdf.trend_polarity_more_depressive';
	return 'pdf.trend_polarity_closer_to_baseline';
}

function pickPolarityShift(
	firstAvg: number,
	lastAvg: number,
): 'toward_manic' | 'toward_depressive' | 'toward_baseline' {
	const delta = lastAvg - firstAvg;
	const eps = 0.3;
	if (Math.abs(lastAvg) < Math.abs(firstAvg) - eps) return 'toward_baseline';
	if (delta > eps) return 'toward_manic';
	if (delta < -eps) return 'toward_depressive';
	return 'toward_baseline';
}
