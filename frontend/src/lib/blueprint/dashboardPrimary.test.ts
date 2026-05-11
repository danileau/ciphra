import { describe, it, expect } from 'vitest';
import {
	resolvePrimaryDashboardCard,
	type DashboardSummary,
} from './dashboardPrimary';
import type { Blueprint } from './types';

/**
 * Pins the routing matrix from the campfire consensus. Each test stages
 * a blueprint stub + a summary state and asserts the resolver lands on
 * the expected card kind. The cohort.ts file is the truth source for
 * cohort membership; here we just stage representative `conditionId`s.
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

function summary(overrides: Partial<DashboardSummary> = {}): DashboardSummary {
	return {
		hasAnyEntry: false,
		hasEpisodeData: false,
		hasTriggerData: false,
		hasActivePhase: false,
		presentVitalIds: new Set<string>(),
		...overrides,
	};
}

describe('resolvePrimaryDashboardCard — cohort anchors', () => {
	it('cycle cohort → cycle-phase regardless of data state', () => {
		expect(resolvePrimaryDashboardCard(bp('endometriosis'), summary())?.kind).toBe('cycle-phase');
		expect(resolvePrimaryDashboardCard(bp('menopause'), summary({ hasAnyEntry: true }))?.kind).toBe('cycle-phase');
		expect(resolvePrimaryDashboardCard(bp('pcos'), summary({ hasEpisodeData: true }))?.kind).toBe('cycle-phase');
	});

	it('phase cohort with active phase → active-phase (beats every trend)', () => {
		const s = summary({ hasActivePhase: true, hasEpisodeData: true });
		expect(resolvePrimaryDashboardCard(bp('bipolar', { episodeTypes: [{ id: 'manic', label: '', color: '', multiDay: true }] }), s)?.kind).toBe('active-phase');
		expect(resolvePrimaryDashboardCard(bp('ms'), s)?.kind).toBe('active-phase');
		expect(resolvePrimaryDashboardCard(bp('ibd'), s)?.kind).toBe('active-phase');
		expect(resolvePrimaryDashboardCard(bp('rheumatoid_arthritis'), s)?.kind).toBe('active-phase');
		expect(resolvePrimaryDashboardCard(bp('autism'), s)?.kind).toBe('active-phase');
	});

	it('cancer_treatment → treatment-cycle', () => {
		expect(resolvePrimaryDashboardCard(bp('cancer_treatment'), summary({ hasAnyEntry: true }))?.kind).toBe('treatment-cycle');
	});
});

describe('resolvePrimaryDashboardCard — trigger-hunt cohorts', () => {
	it('migraine with trigger data → top-triggers', () => {
		const spec = resolvePrimaryDashboardCard(
			bp('migraine', { triggers: [{ id: 'stress', label: '' }] }),
			summary({ hasTriggerData: true, hasAnyEntry: true }),
		);
		expect(spec?.kind).toBe('top-triggers');
	});

	it('dermatology with trigger data → top-triggers', () => {
		expect(
			resolvePrimaryDashboardCard(
				bp('dermatology', { triggers: [{ id: 'pollen', label: '' }] }),
				summary({ hasTriggerData: true, hasAnyEntry: true }),
			)?.kind,
		).toBe('top-triggers');
	});

	it('migraine WITHOUT trigger data → episode-trend if episodes exist', () => {
		const spec = resolvePrimaryDashboardCard(
			bp('migraine', {
				episodeTypes: [{ id: 'attack', label: '', color: '' }],
				triggers: [{ id: 'stress', label: '' }],
			}),
			summary({ hasEpisodeData: true, hasAnyEntry: true }),
		);
		expect(spec?.kind).toBe('episode-trend');
	});

	it('IBS / asthma stay on episode-trend even with trigger data (not in top-triggers primary set)', () => {
		const s = summary({
			hasTriggerData: true,
			hasEpisodeData: true,
			hasAnyEntry: true,
		});
		expect(
			resolvePrimaryDashboardCard(
				bp('ibs', { episodeTypes: [{ id: 'flare', label: '', color: '', multiDay: true }] }),
				s,
			)?.kind,
		).toBe('episode-trend');
		expect(
			resolvePrimaryDashboardCard(
				bp('asthma', { episodeTypes: [{ id: 'attack', label: '', color: '' }] }),
				s,
			)?.kind,
		).toBe('episode-trend');
	});
});

describe('resolvePrimaryDashboardCard — vital-primary cohorts', () => {
	it('hashimoto with TSH data → vital-trend(tsh), secondaries filtered to present', () => {
		const spec = resolvePrimaryDashboardCard(
			bp('hashimoto'),
			summary({
				hasAnyEntry: true,
				presentVitalIds: new Set(['tsh', 'free_t4']),
			}),
		);
		expect(spec?.kind).toBe('vital-trend');
		if (spec?.kind === 'vital-trend') {
			expect(spec.primaryVitalId).toBe('tsh');
			expect(spec.secondaryVitalIds).toEqual(['free_t4']);
		}
	});

	it('hashimoto with NO TSH data → falls through to last-entries when any entry exists', () => {
		const spec = resolvePrimaryDashboardCard(
			bp('hashimoto'),
			summary({ hasAnyEntry: true }),
		);
		expect(spec?.kind).toBe('last-entries');
	});

	it('hypertension + cardiovascular pinned to bp_systolic', () => {
		const s = summary({
			hasAnyEntry: true,
			presentVitalIds: new Set(['bp_systolic', 'bp_diastolic']),
		});
		const h = resolvePrimaryDashboardCard(bp('hypertension'), s);
		expect(h?.kind).toBe('vital-trend');
		if (h?.kind === 'vital-trend') {
			expect(h.primaryVitalId).toBe('bp_systolic');
			expect(h.secondaryVitalIds).toContain('bp_diastolic');
		}
		const c = resolvePrimaryDashboardCard(bp('cardiovascular'), s);
		expect(c?.kind).toBe('vital-trend');
	});

	it('diabetes pinned to blood_sugar', () => {
		const spec = resolvePrimaryDashboardCard(
			bp('diabetes'),
			summary({ hasAnyEntry: true, presentVitalIds: new Set(['blood_sugar']) }),
		);
		expect(spec?.kind).toBe('vital-trend');
		if (spec?.kind === 'vital-trend') {
			expect(spec.primaryVitalId).toBe('blood_sugar');
		}
	});

	it('parkinson pinned to tremor_intensity', () => {
		const spec = resolvePrimaryDashboardCard(
			bp('parkinson'),
			summary({ hasAnyEntry: true, presentVitalIds: new Set(['tremor_intensity']) }),
		);
		expect(spec?.kind).toBe('vital-trend');
		if (spec?.kind === 'vital-trend') {
			expect(spec.primaryVitalId).toBe('tremor_intensity');
		}
	});

	it('bipolar between flares with mood_polarity → vital-trend', () => {
		const spec = resolvePrimaryDashboardCard(
			bp('bipolar', { episodeTypes: [{ id: 'manic', label: '', color: '', multiDay: true }] }),
			summary({
				hasAnyEntry: true,
				hasActivePhase: false,
				presentVitalIds: new Set(['mood_polarity', 'sleep_hours']),
			}),
		);
		expect(spec?.kind).toBe('vital-trend');
		if (spec?.kind === 'vital-trend') {
			expect(spec.primaryVitalId).toBe('mood_polarity');
			expect(spec.secondaryVitalIds).toContain('sleep_hours');
		}
	});

	it('bipolar during active phase still routes to active-phase (priority)', () => {
		const spec = resolvePrimaryDashboardCard(
			bp('bipolar', { episodeTypes: [{ id: 'manic', label: '', color: '', multiDay: true }] }),
			summary({
				hasAnyEntry: true,
				hasActivePhase: true,
				presentVitalIds: new Set(['mood_polarity']),
			}),
		);
		expect(spec?.kind).toBe('active-phase');
	});
});

describe('resolvePrimaryDashboardCard — episode-trend fallback', () => {
	it('epilepsy with episode data → episode-trend', () => {
		const spec = resolvePrimaryDashboardCard(
			bp('epilepsy', { episodeTypes: [{ id: 'focal', label: '', color: '' }] }),
			summary({ hasAnyEntry: true, hasEpisodeData: true }),
		);
		expect(spec?.kind).toBe('episode-trend');
	});

	it('adhd / glaucoma → episode-trend with data', () => {
		const s = summary({ hasAnyEntry: true, hasEpisodeData: true });
		expect(
			resolvePrimaryDashboardCard(
				bp('adhd', { episodeTypes: [{ id: 'hyperfocus', label: '', color: '' }] }),
				s,
			)?.kind,
		).toBe('episode-trend');
		expect(
			resolvePrimaryDashboardCard(
				bp('glaucoma', { episodeTypes: [{ id: 'iop_spike', label: '', color: '' }] }),
				s,
			)?.kind,
		).toBe('episode-trend');
	});
});

describe('resolvePrimaryDashboardCard — silent + fallback states', () => {
	it('null blueprint → last-entries when any entry, null otherwise', () => {
		expect(resolvePrimaryDashboardCard(null, summary())).toBeNull();
		expect(resolvePrimaryDashboardCard(undefined, summary({ hasAnyEntry: true }))?.kind).toBe('last-entries');
	});

	it('day-1 user (no entries) on any blueprint → null (silent hero)', () => {
		expect(resolvePrimaryDashboardCard(bp('epilepsy'), summary())).toBeNull();
		expect(resolvePrimaryDashboardCard(bp('hashimoto'), summary())).toBeNull();
		expect(resolvePrimaryDashboardCard(bp('custom'), summary())).toBeNull();
	});

	it('helena specifically — Hashimoto, no labs yet, only symptom entries → last-entries (was the broken void)', () => {
		const spec = resolvePrimaryDashboardCard(
			bp('hashimoto'),
			summary({
				hasAnyEntry: true,
				hasEpisodeData: false,
				presentVitalIds: new Set<string>(),
			}),
		);
		expect(spec?.kind).toBe('last-entries');
	});

	it('custom cohort always falls through to last-entries (or silent if no entries)', () => {
		expect(resolvePrimaryDashboardCard(bp('custom'), summary({ hasAnyEntry: true }))?.kind).toBe('last-entries');
		expect(resolvePrimaryDashboardCard(bp('custom'), summary())).toBeNull();
	});

	it('phase cohort, no active phase, no episode data → last-entries (no nag)', () => {
		const spec = resolvePrimaryDashboardCard(
			bp('long_covid', { episodeTypes: [{ id: 'flare', label: '', color: '', multiDay: true }] }),
			summary({ hasAnyEntry: true }),
		);
		expect(spec?.kind).toBe('last-entries');
	});
});
