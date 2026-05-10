import { describe, expect, it } from 'vitest';
import { monthSummaryInsightFor } from '$lib/monthSummaryInsight';
import type { Blueprint } from '$lib/blueprint';
import type { CiphraDocument } from '$lib/stores/documents';

function bipolarBlueprint(): Blueprint {
	return {
		version: 1,
		conditionId: 'bipolar',
		conditionLabel: 'landing.template_bipolar',
		accentColor: '#A855F7',
		symptomGroups: [],
		episodeTypes: [
			{ id: 'hypomanic', label: 'seizure.hypomanic', color: '#F59E0B', multiDay: true },
			{ id: 'manic', label: 'seizure.manic', color: '#DC2626', multiDay: true },
			{ id: 'depressive', label: 'seizure.depressive', color: '#1E40AF', multiDay: true },
			{ id: 'mixed', label: 'seizure.mixed_ep', color: '#7C3AED', multiDay: true },
		],
		triggers: [], vitals: [], medications: [],
	} as Blueprint;
}

function epilepsyBlueprint(): Blueprint {
	return {
		version: 1,
		conditionId: 'epilepsy',
		conditionLabel: 'landing.template_epilepsy',
		accentColor: '#6366F1',
		symptomGroups: [],
		episodeTypes: [
			{ id: 'focal', label: 'seizure.focal', color: '#DC2626', trackDuration: true, trackTimeOfDay: true },
			{ id: 'generalized', label: 'seizure.generalized', color: '#B91C1C', trackDuration: true, trackTimeOfDay: true },
			{ id: 'absence', label: 'seizure.absence', color: '#EF4444', trackDuration: true, trackTimeOfDay: true },
			{ id: 'myoclonic', label: 'seizure.myoclonic', color: '#F87171', trackDuration: true, trackTimeOfDay: true },
		],
		triggers: [], vitals: [], medications: [],
	} as Blueprint;
}

function entryDoc(id: number, date: string, episodes: Record<string, number>): CiphraDocument {
	return {
		id,
		data: { type: 'entry', date, episodes },
		createdAt: new Date(date).getTime(),
		updatedAt: new Date(date).getTime(),
	} as unknown as CiphraDocument;
}

describe('monthSummaryInsightFor — phase cohort (Anna)', () => {
	it('returns phase-day-coverage with sorted segments by day count desc', () => {
		const docs = [
			entryDoc(1, '2026-05-01', { manic: 1 }),
			entryDoc(2, '2026-05-02', { manic: 1 }),
			entryDoc(3, '2026-05-03', { manic: 1, depressive: 1 }),
			entryDoc(4, '2026-05-15', { depressive: 1 }),
		];
		const insight = monthSummaryInsightFor('phase', bipolarBlueprint(), docs, 31);
		expect(insight?.kind).toBe('phase-day-coverage');
		if (insight?.kind !== 'phase-day-coverage') throw new Error();
		expect(insight.segments.map((s) => s.id)).toEqual(['manic', 'depressive']);
		expect(insight.segments[0].days).toBe(3);
		expect(insight.segments[1].days).toBe(2);
	});

	it('computes pct as days/daysInMonth', () => {
		const docs = [
			entryDoc(1, '2026-05-01', { manic: 1 }),
			entryDoc(2, '2026-05-02', { manic: 1 }),
		];
		const insight = monthSummaryInsightFor('phase', bipolarBlueprint(), docs, 31);
		if (insight?.kind !== 'phase-day-coverage') throw new Error();
		expect(insight.segments[0].pct).toBeCloseTo(2 / 31, 5);
	});

	it('only counts each day once even with multiple entries that day', () => {
		const docs = [
			entryDoc(1, '2026-05-01', { manic: 1 }),
			entryDoc(2, '2026-05-01', { manic: 1 }),  // same day, same episode
		];
		const insight = monthSummaryInsightFor('phase', bipolarBlueprint(), docs, 31);
		if (insight?.kind !== 'phase-day-coverage') throw new Error();
		expect(insight.segments[0].days).toBe(1);
	});

	it('returns null for a silent month', () => {
		expect(monthSummaryInsightFor('phase', bipolarBlueprint(), [], 31)).toBeNull();
	});

	it('returns null when blueprint has no multiDay episodes (all point-event)', () => {
		const ep_only_point = epilepsyBlueprint();
		expect(monthSummaryInsightFor('phase', ep_only_point, [], 31)).toBeNull();
	});

	it('passes through EpisodeType.color for inline rail tinting', () => {
		const docs = [entryDoc(1, '2026-05-01', { manic: 1 })];
		const insight = monthSummaryInsightFor('phase', bipolarBlueprint(), docs, 31);
		if (insight?.kind !== 'phase-day-coverage') throw new Error();
		expect(insight.segments[0].color).toBe('#DC2626');
	});
});

describe('monthSummaryInsightFor — discrete cohort (Hans)', () => {
	it('returns top point-event episode by total count', () => {
		const docs = [
			entryDoc(1, '2026-05-01', { focal: 1 }),
			entryDoc(2, '2026-05-08', { focal: 2 }),
			entryDoc(3, '2026-05-15', { focal: 1, absence: 1 }),
		];
		const insight = monthSummaryInsightFor('discrete', epilepsyBlueprint(), docs, 31);
		expect(insight?.kind).toBe('top-episode');
		if (insight?.kind !== 'top-episode') throw new Error();
		expect(insight.id).toBe('focal');
		expect(insight.count).toBe(4);
	});

	it('counts vs sums correctly when multiple seizures logged in one day', () => {
		const docs = [entryDoc(1, '2026-05-15', { focal: 5 })];
		const insight = monthSummaryInsightFor('discrete', epilepsyBlueprint(), docs, 31);
		if (insight?.kind !== 'top-episode') throw new Error();
		expect(insight.count).toBe(5);
	});

	it('falls back to legacy `seizures` field when present (PI v4 doc-shape)', () => {
		const docs = [
			{ id: 9, data: { type: 'entry', date: '2026-05-01', seizures: { focal: 3 } } } as unknown as CiphraDocument,
		];
		const insight = monthSummaryInsightFor('discrete', epilepsyBlueprint(), docs, 31);
		if (insight?.kind !== 'top-episode') throw new Error();
		expect(insight.count).toBe(3);
	});

	it('returns null for a silent month', () => {
		expect(monthSummaryInsightFor('discrete', epilepsyBlueprint(), [], 31)).toBeNull();
	});

	it('skips multiDay episodes (those are phase-cohort territory)', () => {
		const docs = [entryDoc(1, '2026-05-01', { manic: 1, focal: 2 })];
		const insight = monthSummaryInsightFor('discrete', epilepsyBlueprint(), docs, 31);
		if (insight?.kind !== 'top-episode') throw new Error();
		// Even though `manic: 1` was logged, epilepsy blueprint has no manic
		// episodeType (and even if it did, it would be filtered out as
		// multiDay). Only `focal: 2` is counted.
		expect(insight.id).toBe('focal');
		expect(insight.count).toBe(2);
	});

	it('passes through EpisodeType.color for inline rail tinting', () => {
		const docs = [entryDoc(1, '2026-05-01', { focal: 1 })];
		const insight = monthSummaryInsightFor('discrete', epilepsyBlueprint(), docs, 31);
		if (insight?.kind !== 'top-episode') throw new Error();
		expect(insight.color).toBe('#DC2626');
	});
});

describe('monthSummaryInsightFor — cohorts without an insight branch', () => {
	it('cycle / narrative / custom return null', () => {
		expect(monthSummaryInsightFor('cycle', bipolarBlueprint(), [], 31)).toBeNull();
		expect(monthSummaryInsightFor('narrative', bipolarBlueprint(), [], 31)).toBeNull();
		expect(monthSummaryInsightFor('custom', bipolarBlueprint(), [], 31)).toBeNull();
	});

	it('null is the documented contract — callers should hide the chip block', () => {
		// Pin the discriminated-union exhaustiveness so a future cohort
		// addition forces a TypeScript review here.
		const insight = monthSummaryInsightFor('cycle', bipolarBlueprint(), [], 31);
		expect(insight).toBe(null);
	});
});
