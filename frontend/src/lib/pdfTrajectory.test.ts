import { describe, it, expect } from 'vitest';
import { resolveTrajectoryPill } from './pdfTrajectory';
import type { Blueprint } from './blueprint/types';
import type { CiphraDocument } from './stores/documents';

/**
 * Pins the malpractice-class cases the 5-doctor agents flagged:
 *  - Helena: STABIL on Hashimoto mid-titration is wrong; the pill must
 *    pivot to TSH trajectory OR omit.
 *  - Hans: VERBESSERUNG green on a patient with a GTC 8 months ago is
 *    dangerous; episode trajectory keeps the existing labels but the
 *    new neutral wording requires the right label key to fire.
 *  - Anna: VERSCHLECHTERUNG on a bipolar patient with normal-rhythm
 *    1 hypomanic + 1 depressive quarter is wrong; the pill must use
 *    polarity-aware labels.
 *  - Klaus: STABIL with BP 156/96 PM is dangerous; the pill must
 *    pivot to bp_systolic trajectory.
 */

function bp(conditionId: string, overrides: Partial<Blueprint> = {}): Blueprint {
	return {
		version: 1,
		conditionId,
		conditionLabel: `landing.template_${conditionId}`,
		accentColor: '#000',
		symptomGroups: [],
		episodeTypes: [],
		triggers: [],
		vitals: [],
		medications: [],
		gridSymptomColumns: [],
		gridEpisodeColumns: [],
		streamFilters: [],
		reportPreference: 'analytics',
		...overrides,
	};
}

function mb(count: number): { y: number; m: number }[] {
	// Build `count` consecutive months ending May 2026 (matches typical
	// production scope).
	const buckets: { y: number; m: number }[] = [];
	for (let i = count - 1; i >= 0; i--) {
		const d = new Date(2026, 4 - i, 1);
		buckets.push({ y: d.getFullYear(), m: d.getMonth() });
	}
	return buckets;
}

function entry(date: string, data: Record<string, unknown>): CiphraDocument {
	return {
		id: `doc-${date}-${Math.random()}`,
		data: { type: 'entry', date, ...data } as CiphraDocument['data'],
	} as CiphraDocument;
}

describe('resolveTrajectoryPill — Helena (Hashimoto, the headline malpractice case)', () => {
	const helena = bp('hashimoto', {
		vitals: [{ id: 'tsh', label: 'vital.tsh', unit: 'mU/L', placeholder: '' }],
	});

	it('Hashimoto with TSH trending down → vital kind, "TSH falling" label', () => {
		const buckets = mb(12);
		const docs: CiphraDocument[] = [
			entry('2025-06-15', { vitals: { tsh: '3.8' } }),
			entry('2025-11-15', { vitals: { tsh: '2.6' } }),
			entry('2026-02-15', { vitals: { tsh: '2.1' } }),
			entry('2026-04-15', { vitals: { tsh: '1.9' } }),
		];
		const spec = resolveTrajectoryPill(helena, docs, buckets, []);
		expect(spec?.kind).toBe('vital');
		if (spec?.kind === 'vital') {
			expect(spec.vitalId).toBe('tsh');
			expect(spec.trendDir).toBe('down');
			expect(spec.labelKey).toBe('pdf.trend_vital_falling');
		}
	});

	it('Hashimoto with TSH trending up → "TSH rising" label (no value judgment)', () => {
		const buckets = mb(12);
		const docs: CiphraDocument[] = [
			entry('2025-06-15', { vitals: { tsh: '1.5' } }),
			entry('2025-11-15', { vitals: { tsh: '2.0' } }),
			entry('2026-02-15', { vitals: { tsh: '3.0' } }),
			entry('2026-04-15', { vitals: { tsh: '4.5' } }),
		];
		const spec = resolveTrajectoryPill(helena, docs, buckets, []);
		expect(spec?.kind).toBe('vital');
		if (spec?.kind === 'vital') {
			expect(spec.labelKey).toBe('pdf.trend_vital_rising');
		}
	});

	it('Hashimoto with NO TSH data → null (omit pill, NOT "stable") — fixes the malpractice case', () => {
		const buckets = mb(12);
		const docs: CiphraDocument[] = [
			entry('2026-04-15', { symptoms: { tired: true } }),
		];
		expect(resolveTrajectoryPill(helena, docs, buckets, [])).toBeNull();
	});

	it('Hashimoto with TSH only in last half → null (no first-half avg to compare)', () => {
		const buckets = mb(12);
		const docs: CiphraDocument[] = [
			entry('2026-04-15', { vitals: { tsh: '1.9' } }),
		];
		expect(resolveTrajectoryPill(helena, docs, buckets, [])).toBeNull();
	});
});

describe('resolveTrajectoryPill — Klaus (hypertension, the second malpractice case)', () => {
	const klaus = bp('hypertension', {
		vitals: [
			{ id: 'bp_systolic', label: 'vital.bp_systolic', unit: 'mmHg', placeholder: '' },
		],
	});

	it('hypertension with BP rising → vital kind, "rising" label, bp_systolic vital id', () => {
		const buckets = mb(12);
		const docs: CiphraDocument[] = [
			entry('2025-06-15', { vitals: { bp_systolic: '135' } }),
			entry('2025-11-15', { vitals: { bp_systolic: '140' } }),
			entry('2026-02-15', { vitals: { bp_systolic: '150' } }),
			entry('2026-04-15', { vitals: { bp_systolic: '156' } }),
		];
		const spec = resolveTrajectoryPill(klaus, docs, buckets, []);
		expect(spec?.kind).toBe('vital');
		if (spec?.kind === 'vital') {
			expect(spec.vitalId).toBe('bp_systolic');
			expect(spec.labelKey).toBe('pdf.trend_vital_rising');
		}
	});

	it('hypertension with hypertensive_crisis episodes but no BP → null (omit, do NOT show "stable" off 0/1 episodes)', () => {
		const klausWithCrises = bp('hypertension', {
			episodeTypes: [{ id: 'hypertensive_crisis', label: '', color: '' }],
			vitals: [
				{ id: 'bp_systolic', label: 'vital.bp_systolic', unit: 'mmHg', placeholder: '' },
			],
		});
		const buckets = mb(12);
		// One crisis logged, no BP readings — historically the algorithm
		// would compute "0 vs 0.16 avg" and show STABIL.
		const docs: CiphraDocument[] = [
			entry('2026-04-10', { episodes: { hypertensive_crisis: 1 } }),
		];
		// Vital path: BP absent → omit. Caller (pdf.ts) would NOT fall
		// through to episode trajectory for vital-pinned cohorts — that's
		// the whole point of pinning.
		expect(resolveTrajectoryPill(klausWithCrises, docs, buckets, ['hypertensive_crisis'])).toBeNull();
	});
});

describe('resolveTrajectoryPill — Anna (bipolar, the polarity case)', () => {
	const anna = bp('bipolar', {
		vitals: [
			{
				id: 'mood_polarity',
				label: 'vital.mood_polarity',
				unit: '-5..+5',
				placeholder: '',
				min: -5,
				max: 5,
			},
		],
	});

	it('bipolar shifting toward mania → "more_manic" label', () => {
		const buckets = mb(12);
		const docs: CiphraDocument[] = [
			entry('2025-06-15', { vitals: { mood_polarity: '-1' } }),
			entry('2025-11-15', { vitals: { mood_polarity: '-1' } }),
			entry('2026-02-15', { vitals: { mood_polarity: '2' } }),
			entry('2026-04-15', { vitals: { mood_polarity: '3' } }),
		];
		const spec = resolveTrajectoryPill(anna, docs, buckets, []);
		expect(spec?.kind).toBe('polarity');
		if (spec?.kind === 'polarity') {
			expect(spec.labelKey).toBe('pdf.trend_polarity_more_manic');
			expect(spec.poleShift).toBe('toward_manic');
		}
	});

	it('bipolar shifting toward depression → "more_depressive" label', () => {
		const buckets = mb(12);
		const docs: CiphraDocument[] = [
			entry('2025-06-15', { vitals: { mood_polarity: '1' } }),
			entry('2025-11-15', { vitals: { mood_polarity: '0' } }),
			entry('2026-02-15', { vitals: { mood_polarity: '-2' } }),
			entry('2026-04-15', { vitals: { mood_polarity: '-3' } }),
		];
		const spec = resolveTrajectoryPill(anna, docs, buckets, []);
		expect(spec?.kind).toBe('polarity');
		if (spec?.kind === 'polarity') {
			expect(spec.labelKey).toBe('pdf.trend_polarity_more_depressive');
			expect(spec.poleShift).toBe('toward_depressive');
		}
	});

	it('bipolar stabilizing toward baseline → "closer_to_baseline" label (the stable-on-lithium case)', () => {
		const buckets = mb(12);
		const docs: CiphraDocument[] = [
			entry('2025-06-15', { vitals: { mood_polarity: '-3' } }),
			entry('2025-11-15', { vitals: { mood_polarity: '-2' } }),
			entry('2026-02-15', { vitals: { mood_polarity: '0' } }),
			entry('2026-04-15', { vitals: { mood_polarity: '0' } }),
		];
		const spec = resolveTrajectoryPill(anna, docs, buckets, []);
		expect(spec?.kind).toBe('polarity');
		if (spec?.kind === 'polarity') {
			expect(spec.labelKey).toBe('pdf.trend_polarity_closer_to_baseline');
			expect(spec.poleShift).toBe('toward_baseline');
		}
	});

	it('bipolar with no polarity data → null (omit pill)', () => {
		const buckets = mb(12);
		const docs: CiphraDocument[] = [
			entry('2026-04-15', { symptoms: { irritable: true } }),
		];
		expect(resolveTrajectoryPill(anna, docs, buckets, [])).toBeNull();
	});
});

describe('resolveTrajectoryPill — Hans (epilepsy, episode trajectory keeps current behavior)', () => {
	const hans = bp('epilepsy', {
		episodeTypes: [
			{ id: 'focal', label: '', color: '' },
			{ id: 'generalized', label: '', color: '' },
		],
	});

	it('epilepsy with declining episodes → episode kind, "improving" label', () => {
		const buckets = mb(12);
		// 6 events first half, 1 in last half — should fire as "improving"
		const docs: CiphraDocument[] = [
			entry('2025-06-15', { episodes: { focal: 2 } }),
			entry('2025-07-20', { episodes: { focal: 2 } }),
			entry('2025-09-04', { episodes: { generalized: 1 } }),
			entry('2025-10-15', { episodes: { focal: 1 } }),
			entry('2026-03-20', { episodes: { focal: 1 } }),
		];
		const spec = resolveTrajectoryPill(hans, docs, buckets, ['focal', 'generalized']);
		expect(spec?.kind).toBe('episode');
		if (spec?.kind === 'episode') {
			expect(spec.labelKey).toBe('pdf.trend_improving');
		}
	});

	it('epilepsy with rising episodes → "worsening"', () => {
		const buckets = mb(12);
		const docs: CiphraDocument[] = [
			entry('2025-06-15', { episodes: { focal: 1 } }),
			entry('2026-02-15', { episodes: { focal: 3 } }),
			entry('2026-03-15', { episodes: { focal: 3 } }),
			entry('2026-04-15', { episodes: { generalized: 1 } }),
		];
		const spec = resolveTrajectoryPill(hans, docs, buckets, ['focal', 'generalized']);
		expect(spec?.kind).toBe('episode');
		if (spec?.kind === 'episode') {
			expect(spec.labelKey).toBe('pdf.trend_worsening');
		}
	});

	it('epilepsy with no episodes in scope → null (omit, do NOT show "stable" off 0/0)', () => {
		const buckets = mb(12);
		const docs: CiphraDocument[] = [
			entry('2026-04-15', { symptoms: { tired: true } }),
		];
		expect(resolveTrajectoryPill(hans, docs, buckets, ['focal', 'generalized'])).toBeNull();
	});
});

describe('resolveTrajectoryPill — narrative + custom cohorts', () => {
	it('cancer_treatment (narrative WITH episodes) — uses episode trajectory', () => {
		const cancer = bp('cancer_treatment', {
			episodeTypes: [{ id: 'er_visit', label: '', color: '' }],
		});
		const buckets = mb(12);
		const docs: CiphraDocument[] = [
			entry('2025-08-15', { episodes: { er_visit: 1 } }),
			entry('2026-03-15', { episodes: { er_visit: 1 } }),
		];
		const spec = resolveTrajectoryPill(cancer, docs, buckets, ['er_visit']);
		// Either episode kind or null is acceptable — the test pins that
		// we don't blow up; current routing falls to episode-trajectory.
		expect(spec === null || spec.kind === 'episode').toBe(true);
	});

	it('custom cohort → always null (no clinical primary to assume)', () => {
		const custom = bp('custom', {
			episodeTypes: [{ id: 'foo', label: '', color: '' }],
		});
		const buckets = mb(12);
		const docs: CiphraDocument[] = [
			entry('2026-04-15', { episodes: { foo: 5 } }),
		];
		expect(resolveTrajectoryPill(custom, docs, buckets, ['foo'])).toBeNull();
	});

	it('null blueprint → null', () => {
		expect(resolveTrajectoryPill(null, [], mb(12), [])).toBeNull();
	});

	it('too few buckets → null', () => {
		expect(resolveTrajectoryPill(bp('epilepsy'), [], mb(1), [])).toBeNull();
	});
});
