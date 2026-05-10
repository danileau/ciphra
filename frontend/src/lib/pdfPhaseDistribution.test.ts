import { describe, expect, it } from 'vitest';
import { aggregatePhaseDistribution } from '$lib/pdfPhaseDistribution';
import type { Blueprint } from '$lib/blueprint';
import type { CiphraDocument } from '$lib/stores/documents';

function bipolarBlueprint(): Blueprint {
	return {
		version: 1,
		conditionId: 'bipolar',
		conditionLabel: 'Bipolar',
		accentColor: '#b23c2c',
		symptomGroups: [],
		episodeTypes: [
			{ id: 'manic', label: 'episode.manic', color: '#b23c2c', multiDay: true },
			{ id: 'mixed', label: 'episode.mixed', color: '#9f630b', multiDay: true },
			{ id: 'depressive', label: 'episode.depressive', color: '#5c6b73', multiDay: true },
			{ id: 'euthymic', label: 'episode.euthymic', color: '#7f821b', multiDay: true },
		],
		triggers: [],
		vitals: [],
		medications: [],
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

describe('aggregatePhaseDistribution', () => {
	it('returns empty array when no episodeTypes are defined', () => {
		const bp = { ...bipolarBlueprint(), episodeTypes: [] };
		expect(aggregatePhaseDistribution(bp, [])).toEqual([]);
	});

	it('returns empty array when no entry docs in window', () => {
		expect(aggregatePhaseDistribution(bipolarBlueprint(), [])).toEqual([]);
	});

	it('returns empty array when all episode counts are zero', () => {
		const docs = [entryDoc(1, '2026-05-01', {})];
		expect(aggregatePhaseDistribution(bipolarBlueprint(), docs)).toEqual([]);
	});

	it('ignores non-entry docs (events, family stamps)', () => {
		const docs = [
			{ id: 9, data: { type: 'event', date: '2026-05-01', episodes: { manic: 99 } } } as unknown as CiphraDocument,
		];
		expect(aggregatePhaseDistribution(bipolarBlueprint(), docs)).toEqual([]);
	});

	it('sums counts per episode-type id across all entry docs', () => {
		const docs = [
			entryDoc(1, '2026-05-01', { manic: 1 }),
			entryDoc(2, '2026-05-03', { manic: 1, depressive: 2 }),
			entryDoc(3, '2026-05-10', { depressive: 1 }),
		];
		const result = aggregatePhaseDistribution(bipolarBlueprint(), docs);
		expect(result.find((s) => s.id === 'manic')?.count).toBe(2);
		expect(result.find((s) => s.id === 'depressive')?.count).toBe(3);
		// mixed and euthymic had zero counts → filtered out
		expect(result.find((s) => s.id === 'mixed')).toBeUndefined();
		expect(result.find((s) => s.id === 'euthymic')).toBeUndefined();
	});

	it('computes pct as fraction of total (sums to 1)', () => {
		const docs = [
			entryDoc(1, '2026-05-01', { manic: 3 }),
			entryDoc(2, '2026-05-02', { depressive: 7 }),
		];
		const result = aggregatePhaseDistribution(bipolarBlueprint(), docs);
		expect(result.find((s) => s.id === 'manic')?.pct).toBeCloseTo(0.3, 5);
		expect(result.find((s) => s.id === 'depressive')?.pct).toBeCloseTo(0.7, 5);
		const sum = result.reduce((a, s) => a + s.pct, 0);
		expect(sum).toBeCloseTo(1, 5);
	});

	it('sorts segments by count desc (bipolar load-bearing → biggest segment leads the bar)', () => {
		const docs = [
			entryDoc(1, '2026-05-01', { manic: 2, depressive: 8, mixed: 1, euthymic: 4 }),
		];
		const result = aggregatePhaseDistribution(bipolarBlueprint(), docs);
		expect(result.map((s) => s.id)).toEqual(['depressive', 'euthymic', 'manic', 'mixed']);
	});

	it('parses each EpisodeType.color hex to an RGB triple', () => {
		const docs = [entryDoc(1, '2026-05-01', { manic: 1 })];
		const result = aggregatePhaseDistribution(bipolarBlueprint(), docs);
		expect(result[0].color).toEqual([0xb2, 0x3c, 0x2c]);
	});

	it('preserves the EpisodeType.label as authored (i18n key OR literal)', () => {
		const docs = [entryDoc(1, '2026-05-01', { manic: 1 })];
		const result = aggregatePhaseDistribution(bipolarBlueprint(), docs);
		expect(result[0].label).toBe('episode.manic');
	});
});
