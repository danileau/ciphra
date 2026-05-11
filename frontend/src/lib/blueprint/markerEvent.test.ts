/**
 * CIPH-pi24-5c — markerEvent preset discipline.
 *
 * Pins two invariants so future preset additions can't silently break the
 * dashboard gap-trend sparkline:
 *   1. Every preset that declares `markerEvent` references at least one
 *      `episodeId` that exists on its own `episodeTypes` list.
 *   2. The 10 cleanly-episodic presets agreed in the kickoff DO declare it
 *      (epilepsy, migraine, bipolar, MS, long-COVID, asthma, RA, IBD, IBS,
 *      diabetes). Adding a marker to a chronic-flare preset (chronic_pain,
 *      burnout, anxiety_depression, hashimoto, hypertension, etc.) requires
 *      removing it here too — the marker conflicts with Klara's prior
 *      objection at Companion.svelte:124 for those cohorts.
 */
import { describe, it, expect } from 'vitest';
import { presets } from './presets';

const EXPECTED_MARKER_presets = [
	'epilepsy',
	'migraine',
	'bipolar',
	'ms',
	'long_covid',
	'asthma',
	'rheumatoid_arthritis',
	'ibd',
	'ibs',
	'diabetes',
] as const;

describe('CIPH-pi24-5c — markerEvent preset discipline', () => {
	it('every declared markerEvent references real episodeTypes ids', () => {
		for (const info of presets) {
			const bp = info.blueprint;
			if (!bp.markerEvent) continue;
			const realIds = new Set(bp.episodeTypes.map((e) => e.id));
			for (const id of bp.markerEvent.episodeIds) {
				expect(realIds.has(id), `preset "${bp.conditionId}" markerEvent.episodeIds references unknown episode "${id}"`).toBe(true);
			}
		}
	});

	it('exactly the 10 cleanly-episodic presets declare markerEvent', () => {
		const declared = presets.filter((p) => p.blueprint.markerEvent).map((p) => p.blueprint.conditionId).sort();
		const expected = [...EXPECTED_MARKER_presets].sort();
		expect(declared).toEqual(expected);
	});

	it('every markerEvent.nounKey starts with marker_noun. prefix', () => {
		for (const info of presets) {
			const bp = info.blueprint;
			if (!bp.markerEvent) continue;
			expect(bp.markerEvent.nounKey.startsWith('marker_noun.'), `preset "${bp.conditionId}" nounKey "${bp.markerEvent.nounKey}" must use marker_noun. prefix`).toBe(true);
		}
	});
});
