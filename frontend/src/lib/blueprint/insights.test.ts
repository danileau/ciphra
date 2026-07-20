/**
 * CIPH-920 — Dashboard insight engine coverage.
 *
 * Two jobs:
 *  1. Behavioural unit tests for each compute fn (gating + correctness).
 *  2. A cross-blueprint capability SNAPSHOT — the "analysis for every
 *     blueprint" made durable. The inline snapshot below is the human-
 *     readable table of which insight cards CAN fire per preset; adding a
 *     preset (or changing its episode/vital/trigger shape) forces a
 *     conscious snapshot update in review.
 */
import { describe, expect, it } from 'vitest';
import { presets } from './presets';
import {
	computeCircadian,
	computeDurationSignal,
	computeInsights,
	computeSleepEpisodeLink,
	computeTopSymptoms,
	computeTriggerLift,
	computeTypeMix,
	insightCapabilityMatrix,
	type InsightDoc,
} from './insights';
import { epilepsy } from './presets';
import type { Blueprint } from './types';

// Episodeless blueprint (custom/lab shape): symptoms + sleep vital + triggers,
// no episode types. Exercises the symptom-day fallback mode.
const EPISODELESS: Blueprint = {
	...epilepsy,
	conditionId: 'custom',
	episodeTypes: [],
	markerEvent: undefined,
	episodeNoun: undefined,
};

// Fixed clock so windowing math is deterministic.
const NOW = new Date(2026, 5, 14); // 2026-06-14

function entry(date: string, data: Partial<InsightDoc['data']> = {}): InsightDoc {
	return { data: { type: 'entry', date, ...data } };
}
/** ISO date `offset` days before NOW. */
function dayBefore(offset: number): string {
	const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - offset);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('computeTriggerLift', () => {
	it('returns null below the data floor', () => {
		const docs = [entry(dayBefore(1), { episodes: { focal: 1 }, triggers: { stress: true } })];
		expect(computeTriggerLift(docs, epilepsy, NOW)).toBeNull();
	});

	it('ranks the trigger that coincides with more episode days', () => {
		const docs: InsightDoc[] = [];
		// 6 stress days, 5 with a seizure → high incidence.
		for (let i = 0; i < 6; i++) {
			docs.push(entry(dayBefore(i + 1), { triggers: { stress: true }, episodes: { focal: i < 5 ? 1 : 0 } }));
		}
		// 8 non-stress days, 1 with a seizure → low baseline.
		for (let i = 0; i < 8; i++) {
			docs.push(entry(dayBefore(i + 20), { triggers: {}, episodes: { focal: i < 1 ? 1 : 0 } }));
		}
		const res = computeTriggerLift(docs, epilepsy, NOW);
		expect(res).not.toBeNull();
		expect(res!.rows[0].triggerId).toBe('stress');
		expect(res!.rows[0].liftPct).toBeGreaterThan(0);
		expect(res!.rows[0].rateWith).toBeGreaterThan(res!.rows[0].rateWithout);
	});

	it('omits triggers that coincide with fewer episodes', () => {
		const docs: InsightDoc[] = [];
		for (let i = 0; i < 6; i++) docs.push(entry(dayBefore(i + 1), { triggers: { weather: true }, episodes: {} }));
		for (let i = 0; i < 8; i++) docs.push(entry(dayBefore(i + 20), { triggers: {}, episodes: { focal: 1 } }));
		expect(computeTriggerLift(docs, epilepsy, NOW)).toBeNull();
	});
});

describe('computeSleepEpisodeLink', () => {
	it('surfaces the short-sleep direction with a lift', () => {
		const docs: InsightDoc[] = [];
		// short sleep (5h): 5 days, 4 seizures
		for (let i = 0; i < 5; i++) docs.push(entry(dayBefore(i + 1), { vitals: { sleep_hours: 5 }, episodes: { focal: i < 4 ? 1 : 0 } }));
		// adequate sleep (8h): 6 days, 1 seizure
		for (let i = 0; i < 6; i++) docs.push(entry(dayBefore(i + 20), { vitals: { sleep_hours: 8 }, episodes: { focal: i < 1 ? 1 : 0 } }));
		const res = computeSleepEpisodeLink(docs, epilepsy, NOW);
		expect(res).not.toBeNull();
		expect(res!.shortRate).toBeGreaterThan(res!.adequateRate);
		expect(res!.thresholdH).toBe(6);
	});

	it('returns null when buckets are too sparse', () => {
		const docs = [entry(dayBefore(1), { vitals: { sleep_hours: 5 }, episodes: { focal: 1 } })];
		expect(computeSleepEpisodeLink(docs, epilepsy, NOW)).toBeNull();
	});
});

describe('computeCircadian', () => {
	it('buckets logged episode times by daypart', () => {
		const docs: InsightDoc[] = [];
		for (let i = 0; i < 6; i++) {
			docs.push(entry(dayBefore(i + 1), { episodes: { focal: 1 }, episodeTimes: { focal: '03:30' } }));
		}
		docs.push(entry(dayBefore(20), { episodes: { focal: 1 }, episodeTimes: { focal: '14:00' } }));
		const res = computeCircadian(docs, epilepsy, NOW);
		expect(res).not.toBeNull();
		expect(res!.topKey).toBe('night');
		expect(res!.total).toBe(7);
	});

	it('returns null when no episode types track time of day', () => {
		const noTime = { ...epilepsy, episodeTypes: epilepsy.episodeTypes.map((e) => ({ ...e, trackTimeOfDay: false })) };
		const docs = [entry(dayBefore(1), { episodes: { focal: 1 }, episodeTimes: { focal: '03:30' } })];
		expect(computeCircadian(docs, noTime, NOW)).toBeNull();
	});

	it('buckets each occurrence by its OWN time when episodeInstances is present', () => {
		// One day, three focal episodes at distinct times — two at night, one
		// in the afternoon. The per-occurrence path must count all three by
		// their own timestamp, not collapse onto a single day-level time.
		const docs: InsightDoc[] = [
			entry(dayBefore(1), {
				episodes: { focal: 3 },
				episodeInstances: {
					focal: [{ time: '02:00' }, { time: '03:30' }, { time: '15:00' }],
				},
			}),
			entry(dayBefore(2), {
				episodes: { focal: 3 },
				episodeInstances: {
					focal: [{ time: '01:00' }, { time: '04:00' }, { time: '23:30' }],
				},
			}),
		];
		const res = computeCircadian(docs, epilepsy, NOW);
		expect(res).not.toBeNull();
		expect(res!.total).toBe(6);
		expect(res!.topKey).toBe('night');
	});
});

describe('computeTypeMix', () => {
	it('returns slices sorted by count', () => {
		const docs: InsightDoc[] = [
			entry(dayBefore(1), { episodes: { focal: 3, generalized: 1 } }),
			entry(dayBefore(2), { episodes: { focal: 2 } }),
		];
		const res = computeTypeMix(docs, epilepsy, NOW);
		expect(res).not.toBeNull();
		expect(res!.slices[0].id).toBe('focal');
		expect(res!.total).toBe(6);
		expect(res!.slices[0].pct).toBeGreaterThan(res!.slices[1].pct);
	});

	it('needs ≥2 distinct types present', () => {
		const docs = [entry(dayBefore(1), { episodes: { focal: 9 } })];
		expect(computeTypeMix(docs, epilepsy, NOW)).toBeNull();
	});
});

describe('computeDurationSignal', () => {
	it('flags a prolonged (>5min) episode', () => {
		const docs: InsightDoc[] = [
			entry(dayBefore(1), { episodes: { focal: 1 }, episodeDurations: { focal: '>5min' } }),
			entry(dayBefore(2), { episodes: { focal: 1 }, episodeDurations: { focal: '1-5min' } }),
			entry(dayBefore(3), { episodes: { focal: 1 }, episodeDurations: { focal: '<1min' } }),
		];
		const res = computeDurationSignal(docs, epilepsy, NOW);
		expect(res).not.toBeNull();
		expect(res!.hasProlonged).toBe(true);
		expect(res!.total).toBe(3);
	});

	it('counts each occurrence duration when episodeInstances is present', () => {
		const docs: InsightDoc[] = [
			entry(dayBefore(1), {
				episodes: { focal: 3 },
				episodeInstances: {
					focal: [{ duration: '>5min' }, { duration: '<1min' }, { duration: '1-5min' }],
				},
			}),
		];
		const res = computeDurationSignal(docs, epilepsy, NOW);
		expect(res).not.toBeNull();
		expect(res!.total).toBe(3);
		expect(res!.under1).toBe(1);
		expect(res!.oneToFive).toBe(1);
		expect(res!.overFive).toBe(1);
	});
});

describe('computeInsights orchestration', () => {
	it('orders by clinical priority and caps the count', () => {
		const docs: InsightDoc[] = [];
		for (let i = 0; i < 10; i++) {
			docs.push(
				entry(dayBefore(i + 1), {
					vitals: { sleep_hours: i % 2 ? 5 : 8 },
					triggers: { stress: i % 2 === 0 },
					episodes: { focal: i % 2 === 0 ? 2 : 0, generalized: i === 0 ? 1 : 0 },
					episodeTimes: { focal: '03:00' },
					episodeDurations: { focal: '>5min' },
				}),
			);
		}
		const out = computeInsights(docs, epilepsy, NOW);
		expect(out.length).toBeGreaterThan(0);
		expect(out.length).toBeLessThanOrEqual(4);
		// priority: sleep-link before trigger-lift before circadian.
		const kinds = out.map((o) => o.kind);
		if (kinds.includes('sleep-link') && kinds.includes('circadian')) {
			expect(kinds.indexOf('sleep-link')).toBeLessThan(kinds.indexOf('circadian'));
		}
	});

	it('returns [] for a null blueprint', () => {
		expect(computeInsights([], null, NOW)).toEqual([]);
	});
});

describe('symptom-day fallback (episodeless blueprints)', () => {
	it('computeTopSymptoms ranks symptom frequency', () => {
		const docs: InsightDoc[] = [];
		for (let i = 0; i < 10; i++) {
			docs.push(entry(dayBefore(i + 1), { symptoms: { tired: i < 7, headache: i < 3 } }));
		}
		const res = computeTopSymptoms(docs, EPISODELESS, NOW);
		expect(res).not.toBeNull();
		expect(res!.rows[0].id).toBe('tired');
		expect(res!.rows[0].count).toBe(7);
		expect(res!.rows[0].count).toBeGreaterThan(res!.rows[1].count);
	});

	it('computeTopSymptoms backstops episode blueprints too (with symptom data)', () => {
		// Relaxed from "episodeless only" to a universal low-priority backstop:
		// an episode blueprint can still surface top symptoms when it has the
		// data (it just ranks last, so richer episode cards win the card cap).
		const docs: InsightDoc[] = [];
		for (let i = 0; i < 10; i++) docs.push(entry(dayBefore(i + 1), { symptoms: { tired: i < 5 } }));
		const res = computeTopSymptoms(docs, epilepsy, NOW);
		expect(res).not.toBeNull();
		expect(res!.rows[0].id).toBe('tired');
	});

	it('episode blueprint with too-rare episodes falls back to the symptom outcome', () => {
		// Hypertension-like (the Klaus case): declares episode types, but none
		// occur in the window; rich symptom + trigger data instead. The
		// correlation card must still fire, on symptom-days.
		const docs: InsightDoc[] = [];
		for (let i = 0; i < 7; i++) docs.push(entry(dayBefore(i + 1), { triggers: { stress: true }, symptoms: { tired: true } }));
		for (let i = 0; i < 8; i++) docs.push(entry(dayBefore(i + 20), { triggers: {}, symptoms: { tired: i < 1 } }));
		const res = computeTriggerLift(docs, epilepsy, NOW); // epilepsy declares episodes; none logged here
		expect(res).not.toBeNull();
		expect(res!.outcome).toBe('symptom');
		expect(res!.rows[0].triggerId).toBe('stress');
	});

	it('sleep-link falls back to symptom-day outcome', () => {
		const docs: InsightDoc[] = [];
		for (let i = 0; i < 5; i++) docs.push(entry(dayBefore(i + 1), { vitals: { sleep_hours: 5 }, symptoms: { tired: i < 4 } }));
		for (let i = 0; i < 6; i++) docs.push(entry(dayBefore(i + 20), { vitals: { sleep_hours: 8 }, symptoms: { tired: i < 1 } }));
		const res = computeSleepEpisodeLink(docs, EPISODELESS, NOW);
		expect(res).not.toBeNull();
		expect(res!.outcome).toBe('symptom');
		expect(res!.shortRate).toBeGreaterThan(res!.adequateRate);
	});

	it('trigger-lift falls back to symptom-day outcome', () => {
		const docs: InsightDoc[] = [];
		for (let i = 0; i < 6; i++) docs.push(entry(dayBefore(i + 1), { triggers: { stress: true }, symptoms: { tired: i < 5 } }));
		for (let i = 0; i < 8; i++) docs.push(entry(dayBefore(i + 20), { triggers: {}, symptoms: { tired: i < 1 } }));
		const res = computeTriggerLift(docs, EPISODELESS, NOW);
		expect(res).not.toBeNull();
		expect(res!.outcome).toBe('symptom');
		expect(res!.rows[0].triggerId).toBe('stress');
	});

	it('epilepsy keeps the episode outcome', () => {
		const docs: InsightDoc[] = [];
		for (let i = 0; i < 6; i++) docs.push(entry(dayBefore(i + 1), { triggers: { stress: true }, episodes: { focal: i < 5 ? 1 : 0 } }));
		for (let i = 0; i < 8; i++) docs.push(entry(dayBefore(i + 20), { triggers: {}, episodes: { focal: i < 1 ? 1 : 0 } }));
		const res = computeTriggerLift(docs, epilepsy, NOW);
		expect(res!.outcome).toBe('episode');
	});
});

describe('cross-blueprint capability matrix', () => {
	it('every preset declares all insight keys', () => {
		for (const p of presets) {
			const m = insightCapabilityMatrix(p.blueprint);
			expect(Object.keys(m).sort()).toEqual(
				['circadian', 'duration', 'sleep-link', 'top-symptoms', 'trigger-lift', 'type-mix'].sort(),
			);
		}
	});

	it('matrix is internally consistent with blueprint shape', () => {
		for (const p of presets) {
			const bp = p.blueprint;
			const m = insightCapabilityMatrix(bp);
			if (m.circadian) expect(bp.episodeTypes.some((e) => e.trackTimeOfDay)).toBe(true);
			if (m.duration) expect(bp.episodeTypes.some((e) => e.trackDuration)).toBe(true);
			if (m['type-mix']) expect(bp.episodeTypes.length).toBeGreaterThanOrEqual(2);
		}
	});

	it('coverage snapshot (analysis for every blueprint)', () => {
		const table = presets
			.map((p) => {
				const m = insightCapabilityMatrix(p.blueprint);
				const on = Object.entries(m)
					.filter(([, v]) => v)
					.map(([k]) => k)
					.sort()
					.join(',');
				return `${p.id}: ${on || '—'}`;
			})
			.join('\n');
		expect(table).toMatchInlineSnapshot(`
			"epilepsy: circadian,duration,sleep-link,top-symptoms,trigger-lift,type-mix
			migraine: circadian,duration,sleep-link,top-symptoms,trigger-lift,type-mix
			ms: sleep-link,top-symptoms,trigger-lift,type-mix
			adhd: sleep-link,top-symptoms,trigger-lift,type-mix
			burnout: sleep-link,top-symptoms,trigger-lift,type-mix
			anxiety_depression: sleep-link,top-symptoms,trigger-lift,type-mix
			diabetes: top-symptoms,trigger-lift,type-mix
			chronic_pain: sleep-link,top-symptoms,trigger-lift,type-mix
			long_covid: sleep-link,top-symptoms,trigger-lift,type-mix
			asthma: circadian,duration,sleep-link,top-symptoms,trigger-lift,type-mix
			hypertension: circadian,sleep-link,top-symptoms,trigger-lift,type-mix
			ibs: top-symptoms,trigger-lift,type-mix
			cancer_treatment: top-symptoms,trigger-lift,type-mix
			endometriosis: sleep-link,top-symptoms,trigger-lift,type-mix
			menopause: circadian,sleep-link,top-symptoms,trigger-lift,type-mix
			pcos: top-symptoms,trigger-lift,type-mix
			bipolar: sleep-link,top-symptoms,trigger-lift,type-mix
			glaucoma: circadian,duration,sleep-link,top-symptoms,trigger-lift,type-mix
			parkinson: circadian,duration,sleep-link,top-symptoms,trigger-lift,type-mix
			ibd: circadian,top-symptoms,trigger-lift,type-mix
			hashimoto: top-symptoms,trigger-lift
			rheumatoid_arthritis: sleep-link,top-symptoms,trigger-lift,type-mix
			custom: —"
		`);
	});
});
