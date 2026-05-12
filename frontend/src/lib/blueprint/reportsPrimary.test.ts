import { describe, it, expect } from 'vitest';
import {
	resolveReportsPrimaryCard,
	type ReportsSummary,
} from './reportsPrimary';
import type { Blueprint } from './types';

/**
 * Reports resolver pins. Distinct from dashboardPrimary:
 * - No cycle-phase / active-phase routing (no anchor blocks on /reports)
 * - Vital-pinned cohorts take precedence over episode trend
 * - Diverging-bar flag derived from primary vital's min < 0
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

function summary(overrides: Partial<ReportsSummary> = {}): ReportsSummary {
	return {
		hasAnyEntry: false,
		hasEpisodeData: false,
		hasSymptomData: false,
		presentVitalIds: new Set<string>(),
		...overrides,
	};
}

describe('resolveReportsPrimaryCard — vital-pinned cohorts (the dogfood fix)', () => {
	it('hashimoto with TSH data → vital-trend(tsh), diverging=false', () => {
		const spec = resolveReportsPrimaryCard(
			bp('hashimoto', { vitals: [{ id: 'tsh', label: 'vital.tsh', unit: 'mU/L', placeholder: '' }] }),
			summary({ hasAnyEntry: true, presentVitalIds: new Set(['tsh', 'free_t4']) }),
		);
		expect(spec?.kind).toBe('vital-trend');
		if (spec?.kind === 'vital-trend') {
			expect(spec.primaryVitalId).toBe('tsh');
			expect(spec.secondaryVitalIds).toEqual(['free_t4']);
			expect(spec.diverging).toBe(false);
		}
	});

	it('hashimoto WITHOUT TSH data → falls through to last-entries (or episode-trend if symptoms)', () => {
		// no vital → falls to step 2 (episode-trend would need episodes); hashimoto has none → step 3
		const spec = resolveReportsPrimaryCard(
			bp('hashimoto'),
			summary({ hasAnyEntry: true, hasSymptomData: true }),
		);
		expect(spec?.kind).toBe('last-entries');
	});

	it('hypertension with bp_systolic → vital-trend pinned to bp_systolic', () => {
		// Even when hypertension has hypertensive_crisis episodes logged,
		// vital-trend wins on /reports — the BP reading IS the metric.
		const spec = resolveReportsPrimaryCard(
			bp('hypertension', {
				episodeTypes: [{ id: 'hypertensive_crisis', label: '', color: '' }],
				vitals: [{ id: 'bp_systolic', label: '', unit: '', placeholder: '' }],
			}),
			summary({
				hasAnyEntry: true,
				hasEpisodeData: true,
				presentVitalIds: new Set(['bp_systolic', 'bp_diastolic']),
			}),
		);
		expect(spec?.kind).toBe('vital-trend');
		if (spec?.kind === 'vital-trend') {
			expect(spec.primaryVitalId).toBe('bp_systolic');
			expect(spec.secondaryVitalIds).toContain('bp_diastolic');
		}
	});

	it('bipolar with mood_polarity → vital-trend, diverging=true (the polar visualization)', () => {
		const spec = resolveReportsPrimaryCard(
			bp('bipolar', {
				vitals: [
					{ id: 'mood_polarity', label: '', unit: '', placeholder: '', min: -5, max: 5 },
					{ id: 'mood', label: '', unit: '', placeholder: '' },
				],
			}),
			summary({ hasAnyEntry: true, presentVitalIds: new Set(['mood_polarity', 'mood']) }),
		);
		expect(spec?.kind).toBe('vital-trend');
		if (spec?.kind === 'vital-trend') {
			expect(spec.primaryVitalId).toBe('mood_polarity');
			expect(spec.diverging).toBe(true);
			expect(spec.secondaryVitalIds).toContain('mood');
		}
	});

	it('diabetes pinned to blood_sugar', () => {
		const spec = resolveReportsPrimaryCard(
			bp('diabetes', { vitals: [{ id: 'blood_sugar', label: '', unit: '', placeholder: '' }] }),
			summary({ hasAnyEntry: true, presentVitalIds: new Set(['blood_sugar', 'hba1c']) }),
		);
		expect(spec?.kind).toBe('vital-trend');
		if (spec?.kind === 'vital-trend') expect(spec.primaryVitalId).toBe('blood_sugar');
	});

	it('parkinson pinned to tremor_intensity', () => {
		const spec = resolveReportsPrimaryCard(
			bp('parkinson', { vitals: [{ id: 'tremor_intensity', label: '', unit: '', placeholder: '' }] }),
			summary({ hasAnyEntry: true, presentVitalIds: new Set(['tremor_intensity']) }),
		);
		expect(spec?.kind).toBe('vital-trend');
	});
});

describe('resolveReportsPrimaryCard — episode cohorts', () => {
	it('epilepsy with episode data → episode-trend (dual-axis default)', () => {
		const spec = resolveReportsPrimaryCard(
			bp('epilepsy', { episodeTypes: [{ id: 'focal', label: '', color: '' }] }),
			summary({ hasAnyEntry: true, hasEpisodeData: true }),
		);
		expect(spec?.kind).toBe('episode-trend');
	});

	it('adhd / asthma / glaucoma → episode-trend with data', () => {
		const s = summary({ hasAnyEntry: true, hasEpisodeData: true });
		expect(
			resolveReportsPrimaryCard(
				bp('adhd', { episodeTypes: [{ id: 'hyperfocus', label: '', color: '' }] }),
				s,
			)?.kind,
		).toBe('episode-trend');
		expect(
			resolveReportsPrimaryCard(
				bp('asthma', { episodeTypes: [{ id: 'attack', label: '', color: '' }] }),
				s,
			)?.kind,
		).toBe('episode-trend');
		expect(
			resolveReportsPrimaryCard(
				bp('glaucoma', { episodeTypes: [{ id: 'iop_spike', label: '', color: '' }] }),
				s,
			)?.kind,
		).toBe('episode-trend');
	});

	it('symptom-only days on episode cohort → episode-trend (existing chart behavior)', () => {
		const spec = resolveReportsPrimaryCard(
			bp('epilepsy', { episodeTypes: [{ id: 'focal', label: '', color: '' }] }),
			summary({ hasAnyEntry: true, hasSymptomData: true }),
		);
		expect(spec?.kind).toBe('episode-trend');
	});
});

describe('resolveReportsPrimaryCard — fallback states', () => {
	it('cancer_treatment falls through to last-entries (journal-primary, scope cut on dashboard too)', () => {
		expect(
			resolveReportsPrimaryCard(
				bp('cancer_treatment', { episodeTypes: [{ id: 'er_visit', label: '', color: '' }] }),
				summary({ hasAnyEntry: true }),
			)?.kind,
		).toBe('last-entries');
	});

	it('migraine without episode/symptom data → last-entries', () => {
		const spec = resolveReportsPrimaryCard(
			bp('migraine', { episodeTypes: [{ id: 'attack', label: '', color: '' }] }),
			summary({ hasAnyEntry: true }),
		);
		expect(spec?.kind).toBe('last-entries');
	});

	it('custom cohort with entries → last-entries', () => {
		expect(resolveReportsPrimaryCard(bp('custom'), summary({ hasAnyEntry: true }))?.kind).toBe(
			'last-entries',
		);
	});

	it('day-1 user (no data anywhere) → null', () => {
		expect(resolveReportsPrimaryCard(bp('hashimoto'), summary())).toBeNull();
		expect(resolveReportsPrimaryCard(bp('epilepsy'), summary())).toBeNull();
		expect(resolveReportsPrimaryCard(null, summary())).toBeNull();
	});

	it('null blueprint with entries → last-entries', () => {
		expect(resolveReportsPrimaryCard(null, summary({ hasAnyEntry: true }))?.kind).toBe('last-entries');
	});
});

describe('resolveReportsPrimaryCard — Helena specifically (the dogfood case)', () => {
	it('Hashimoto + entries + TSH lab logged → vital-trend (Helena void fixed on /reports)', () => {
		const spec = resolveReportsPrimaryCard(
			bp('hashimoto'),
			summary({
				hasAnyEntry: true,
				hasSymptomData: true,
				presentVitalIds: new Set(['tsh']),
			}),
		);
		expect(spec?.kind).toBe('vital-trend');
		if (spec?.kind === 'vital-trend') {
			expect(spec.primaryVitalId).toBe('tsh');
		}
	});

	it('Hashimoto + entries but no labs yet → last-entries (graceful day-1 lab cohort)', () => {
		const spec = resolveReportsPrimaryCard(
			bp('hashimoto'),
			summary({ hasAnyEntry: true, hasSymptomData: true }),
		);
		expect(spec?.kind).toBe('last-entries');
	});
});
