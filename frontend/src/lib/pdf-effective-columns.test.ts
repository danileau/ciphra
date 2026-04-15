/**
 * CIPH-877 — PDFs + CSVs auto-expand grid columns the same way the
 * on-screen report does, so we never export a narrower slice than what
 * the user actually logs.
 */
import { describe, it, expect } from 'vitest';
import type { Blueprint } from './blueprint';
import { effectiveSymptomColumns, effectiveEpisodeColumns } from './pdf';

const bp: Blueprint = {
	version: 1,
	conditionId: 'epilepsy',
	conditionLabel: 'x',
	accentColor: '#000',
	symptomGroups: [
		{ id: 'g', label: 'g', items: [
			{ id: 'tired', label: 'tired' },
			{ id: 'aura', label: 'aura' },
			{ id: 'rare', label: 'rare' },
			{ id: 'slept_well', label: 'slept_well' },
		] },
	],
	episodeTypes: [
		{ id: 'focal', label: 'focal', color: '#f00' },
		{ id: 'generalized', label: 'gen', color: '#a00' },
		{ id: 'myoclonic', label: 'myo', color: '#c00' },
		{ id: 'absence', label: 'abs', color: '#d00' },
	],
	triggers: [],
	vitals: [],
	gridSymptomColumns: ['tired', 'aura', 'slept_well'],
	gridEpisodeColumns: ['focal', 'generalized'],
} as unknown as Blueprint;

const docs = [
	{ data: { type: 'entry', date: '2026-04-03', symptoms: { rare: true },
		episodes: { myoclonic: 1 } } },
	{ data: { type: 'entry', date: '2026-04-05', episodes: { focal: 2 } } },
	// Out-of-month — should not surface new columns:
	{ data: { type: 'entry', date: '2026-03-15', symptoms: { never_shown: true },
		episodes: { absence: 5 } } },
] as any[];

describe('effectiveEpisodeColumns', () => {
	it('returns curated + non-curated types with in-month data', () => {
		expect(effectiveEpisodeColumns(bp, docs, '2026-04')).toEqual([
			'focal', 'generalized', 'myoclonic',
		]);
	});
	it('hides non-curated types whose data is outside the prefix', () => {
		const cols = effectiveEpisodeColumns(bp, docs, '2026-04');
		expect(cols).not.toContain('absence');
	});
	it('returns curated-only when no docs at all', () => {
		expect(effectiveEpisodeColumns(bp, [], '2026-04')).toEqual(['focal', 'generalized']);
	});
});

describe('effectiveSymptomColumns', () => {
	it('returns curated + non-curated symptoms with in-month data, excluding markers', () => {
		const cols = effectiveSymptomColumns(bp, docs, '2026-04', new Set(['slept_well']));
		expect(cols).toEqual(['tired', 'aura', 'rare']);
	});
	it('hides symptoms whose data is outside the prefix', () => {
		const cols = effectiveSymptomColumns(bp, docs, '2026-04');
		expect(cols).not.toContain('never_shown');
	});
	it('does not duplicate when a symptom is both curated and has data', () => {
		const docsWithCurated = [
			{ data: { type: 'entry', date: '2026-04-01', symptoms: { tired: true } } },
		] as any[];
		const cols = effectiveSymptomColumns(bp, docsWithCurated, '2026-04');
		expect(cols.filter((c) => c === 'tired')).toHaveLength(1);
	});
});
