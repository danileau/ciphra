/**
 * CIPH-920 — Dashboard insight engine.
 *
 * The dashboard was "naked": for most cohorts the 2/3 column held a single
 * episode/symptom-day line and nothing else, while the app *captures* far
 * more than it shows — per-episode time-of-day, per-episode duration, sleep
 * hours, triggers, seizure-type mix. This module crosses those signals into
 * compact, plain-language INSIGHTS (a takeaway + a small viz), not raw
 * charts (the CIPH-900 declutter lesson: insight over noise).
 *
 * Everything here is CAPABILITY-DRIVEN, never condition-hardcoded — each
 * insight gates on what the active Blueprint declares (trackTimeOfDay,
 * trackDuration, episodeTypes, a sleep vital, triggers, markerEvent) plus a
 * minimum-data threshold so day-1 / sparse users never see noise. The same
 * card therefore lights up automatically for epilepsy, migraine, parkinson,
 * diabetes, … wherever the data exists. `insightCapabilityMatrix()` exposes
 * which cards CAN fire for a given blueprint; the cross-blueprint coverage is
 * pinned by insights.test.ts.
 *
 * Pure + deterministic: every function takes the docs + blueprint (+ an
 * optional `now` for testability) and returns a typed result or `null`.
 */
import type { Blueprint, EpisodeType } from './types';

// Loosely-typed entry doc — documents.ts stores `data: any`.
export interface InsightDoc {
	data: {
		type?: string;
		date?: string;
		episodes?: Record<string, unknown>;
		seizures?: Record<string, unknown>;
		symptoms?: Record<string, unknown>;
		triggers?: unknown;
		vitals?: Record<string, unknown>;
		episodeTimes?: Record<string, string>;
		episodeDurations?: Record<string, string>;
		[k: string]: unknown;
	};
}

/** Lookback window for correlation/distribution insights (streak is all-time). */
export const INSIGHT_WINDOW_DAYS = 180;

/** Clinical short-sleep threshold (hours) for the sleep↔episode link. */
const SHORT_SLEEP_H = 6;

// ─────────────────────────────────────────────────────────────────────────
// Shared extraction helpers
// ─────────────────────────────────────────────────────────────────────────

function isEntry(d: InsightDoc): boolean {
	return d.data?.type === 'entry';
}

function dayKey(d: InsightDoc): string {
	return String(d.data?.date || '').slice(0, 10);
}

/** Episodes are stored under `episodes` (or legacy `seizures`) as id→count. */
function episodeMap(d: InsightDoc): Record<string, unknown> {
	return (d.data?.episodes || d.data?.seizures || {}) as Record<string, unknown>;
}

function episodeCount(d: InsightDoc, epIds: string[]): number {
	const m = episodeMap(d);
	let n = 0;
	for (const id of epIds) n += Number(m[id] || 0) || 0;
	return n;
}

/**
 * Triggers carry a dual write shape — array (DayDetail) or object map
 * (EntryComposer, Record<string,boolean>). EntryComposer's spread-merge can
 * graft list ids onto numeric keys with truthy string values, so for the
 * object shape we only trust known blueprint ids (mirrors Companion.svelte).
 */
function triggersOnDay(d: InsightDoc, triggerIds: string[]): Set<string> {
	const out = new Set<string>();
	const trs = d.data?.triggers as unknown;
	if (Array.isArray(trs)) {
		for (const t of trs) if (typeof t === 'string') out.add(t);
	} else if (trs && typeof trs === 'object') {
		const obj = trs as Record<string, unknown>;
		for (const id of triggerIds) if (obj[id] === true) out.add(id);
	}
	return out;
}

/** Numeric reading for a vital — handles number, numeric string, and the
 *  multi-entry time-keyed object shape (averaged). Returns null if absent. */
function vitalNumber(d: InsightDoc, vitalId: string): number | null {
	const raw = (d.data?.vitals || {})[vitalId];
	if (raw === '' || raw === null || raw === undefined) return null;
	if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
	if (typeof raw === 'string') {
		const n = Number(raw);
		return raw.trim() !== '' && !Number.isNaN(n) ? n : null;
	}
	if (typeof raw === 'object') {
		const vals: number[] = [];
		for (const v of Object.values(raw as Record<string, unknown>)) {
			if (v === '' || v === null || v === undefined) continue;
			const n = Number(v);
			if (!Number.isNaN(n)) vals.push(n);
		}
		return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
	}
	return null;
}

function daysAgo(now: Date, n: number): Date {
	return new Date(now.getFullYear(), now.getMonth(), now.getDate() - n);
}

/** Entry docs within the lookback window, most-recent first not guaranteed. */
function windowedEntries(docs: InsightDoc[], now: Date): InsightDoc[] {
	const floor = daysAgo(now, INSIGHT_WINDOW_DAYS);
	const floorKey = `${floor.getFullYear()}-${String(floor.getMonth() + 1).padStart(2, '0')}-${String(floor.getDate()).padStart(2, '0')}`;
	return docs.filter((d) => isEntry(d) && dayKey(d) >= floorKey);
}

function pct(n: number): number {
	return Math.round(n * 100);
}

// ─────────────────────────────────────────────────────────────────────────
// Capability predicates — what the blueprint CAN support
// ─────────────────────────────────────────────────────────────────────────

function episodeIds(bp: Blueprint): string[] {
	return (bp.episodeTypes || []).map((e) => e.id);
}

function timedEpisodeTypes(bp: Blueprint): EpisodeType[] {
	return (bp.episodeTypes || []).filter((e) => e.trackTimeOfDay);
}

function durationEpisodeTypes(bp: Blueprint): EpisodeType[] {
	return (bp.episodeTypes || []).filter((e) => e.trackDuration);
}

/** All trackable symptom items across the blueprint's groups. */
function symptomItems(bp: Blueprint): { id: string; label: string }[] {
	const out: { id: string; label: string }[] = [];
	for (const g of bp.symptomGroups || []) {
		for (const it of g.items || []) out.push({ id: it.id, label: it.label });
	}
	return out;
}

function hasSymptoms(bp: Blueprint): boolean {
	return symptomItems(bp).length > 0;
}

/** A day with any symptom logged (mirrors Companion's symptom-day count). */
function symptomDay(d: InsightDoc): boolean {
	const s = d.data?.symptoms || {};
	for (const v of Object.values(s)) if (v) return true;
	return false;
}

/** Minimum adverse-outcome days in-window for a correlation card to run. */
const MIN_OUTCOME_DAYS = 3;

/**
 * Pick the adverse-outcome predicate for the correlation cards (sleep,
 * trigger) from the DATA, not just the blueprint shape.
 *
 * Episode cohorts normally key off "a day with an episode". But some
 * blueprints declare episode types that are RARE emergencies — hypertensive
 * crisis, orthostatic drop — which in a 180-day window barely occur. Keying
 * off them starves every card and leaves the dashboard empty (the Klaus
 * case). When the episode signal is too thin, fall back to "a day with any
 * symptom" so the same correlation still surfaces. Episodeless blueprints
 * (custom, hashimoto, …) skip straight to the symptom outcome.
 */
function resolveOutcome(
	entries: InsightDoc[],
	bp: Blueprint,
): { adverse: (d: InsightDoc) => boolean; outcome: 'episode' | 'symptom' } | null {
	const epIds = episodeIds(bp);
	if (epIds.length > 0) {
		let epDays = 0;
		for (const e of entries) if (episodeCount(e, epIds) > 0) epDays++;
		if (epDays >= MIN_OUTCOME_DAYS)
			return { adverse: (d) => episodeCount(d, epIds) > 0, outcome: 'episode' };
	}
	if (hasSymptoms(bp)) {
		let sDays = 0;
		for (const e of entries) if (symptomDay(e)) sDays++;
		if (sDays >= MIN_OUTCOME_DAYS) return { adverse: symptomDay, outcome: 'symptom' };
	}
	return null;
}

/** Sleep-hours vital, if the blueprint tracks one (id convention + unit). */
function sleepVitalId(bp: Blueprint): string | null {
	const v = (bp.vitals || []).find(
		(x) => x.id === 'sleep_hours' || (x.unit === 'h' && /sleep|schlaf/i.test(x.id)),
	);
	return v ? v.id : null;
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Trigger lift — which triggers coincide with more episode days
// ─────────────────────────────────────────────────────────────────────────

export interface TriggerLiftRow {
	triggerId: string;
	label: string;
	/** Episode-incidence on days the trigger was present (0..1). */
	rateWith: number;
	/** Episode-incidence on days it was absent (0..1). */
	rateWithout: number;
	/** Relative lift in %, or null when baseline is zero (only-on shown instead). */
	liftPct: number | null;
	daysWith: number;
}

export interface TriggerLiftInsight {
	kind: 'trigger-lift';
	/** 'episode' or 'symptom' — drives the outcome noun in the UI. */
	outcome: 'episode' | 'symptom';
	rows: TriggerLiftRow[];
}

export function computeTriggerLift(
	docs: InsightDoc[],
	bp: Blueprint,
	now: Date = new Date(),
): TriggerLiftInsight | null {
	const triggerIds = (bp.triggers || []).map((t) => t.id);
	if (triggerIds.length === 0) return null;

	const entries = windowedEntries(docs, now);
	if (entries.length < 8) return null;

	const resolved = resolveOutcome(entries, bp);
	if (!resolved) return null;
	const { adverse, outcome } = resolved;

	const labelOf = new Map((bp.triggers || []).map((t) => [t.id, t.label]));
	const rows: TriggerLiftRow[] = [];
	for (const id of triggerIds) {
		let withDays = 0;
		let withEpisode = 0;
		let withoutDays = 0;
		let withoutEpisode = 0;
		for (const e of entries) {
			const present = triggersOnDay(e, triggerIds).has(id);
			const hasEp = adverse(e);
			if (present) {
				withDays++;
				if (hasEp) withEpisode++;
			} else {
				withoutDays++;
				if (hasEp) withoutEpisode++;
			}
		}
		// Need enough trigger-present days to say anything.
		if (withDays < 3) continue;
		const rateWith = withEpisode / withDays;
		const rateWithout = withoutDays > 0 ? withoutEpisode / withoutDays : 0;
		// Only surface triggers that coincide with MORE episodes, not fewer.
		if (rateWith <= rateWithout) continue;
		const liftPct = rateWithout > 0 ? Math.round((rateWith / rateWithout - 1) * 100) : null;
		rows.push({
			triggerId: id,
			label: labelOf.get(id) || id,
			rateWith,
			rateWithout,
			liftPct,
			daysWith: withDays,
		});
	}
	if (rows.length === 0) return null;
	// Strongest signal first: known lift desc, then "only-on" rows by incidence.
	rows.sort((a, b) => {
		const al = a.liftPct ?? Number.POSITIVE_INFINITY;
		const bl = b.liftPct ?? Number.POSITIVE_INFINITY;
		if (al !== bl) return bl - al;
		return b.rateWith - a.rateWith;
	});
	return { kind: 'trigger-lift', outcome, rows: rows.slice(0, 4) };
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Sleep ↔ episodes
// ─────────────────────────────────────────────────────────────────────────

export interface SleepLinkInsight {
	kind: 'sleep-link';
	/** 'episode' or 'symptom' — drives the outcome noun in the UI. */
	outcome: 'episode' | 'symptom';
	thresholdH: number;
	shortRate: number; // adverse-outcome incidence on short-sleep days (0..1)
	adequateRate: number; // adverse-outcome incidence on adequate-sleep days
	liftPct: number | null;
	shortDays: number;
	adequateDays: number;
}

export function computeSleepEpisodeLink(
	docs: InsightDoc[],
	bp: Blueprint,
	now: Date = new Date(),
): SleepLinkInsight | null {
	const vid = sleepVitalId(bp);
	if (!vid) return null;

	const entries = windowedEntries(docs, now);
	const resolved = resolveOutcome(entries, bp);
	if (!resolved) return null;
	const { adverse, outcome } = resolved;

	let shortDays = 0;
	let shortEp = 0;
	let adeqDays = 0;
	let adeqEp = 0;
	let totalEp = 0;
	for (const e of entries) {
		const sleep = vitalNumber(e, vid);
		if (sleep === null) continue;
		const hasEp = adverse(e);
		if (hasEp) totalEp++;
		if (sleep < SHORT_SLEEP_H) {
			shortDays++;
			if (hasEp) shortEp++;
		} else {
			adeqDays++;
			if (hasEp) adeqEp++;
		}
	}
	// Need both buckets populated and a real episode signal.
	if (shortDays < 4 || adeqDays < 4 || totalEp < 3) return null;
	const shortRate = shortEp / shortDays;
	const adequateRate = adeqEp / adeqDays;
	if (shortRate <= adequateRate) return null; // only surface the "short sleep is worse" direction
	const liftPct = adequateRate > 0 ? Math.round((shortRate / adequateRate - 1) * 100) : null;
	return {
		kind: 'sleep-link',
		outcome,
		thresholdH: SHORT_SLEEP_H,
		shortRate,
		adequateRate,
		liftPct,
		shortDays,
		adequateDays: adeqDays,
	};
}

// ─────────────────────────────────────────────────────────────────────────
// 3. Circadian — when in the day episodes cluster
// ─────────────────────────────────────────────────────────────────────────

export type DaypartKey = 'night' | 'morning' | 'afternoon' | 'evening';

export interface CircadianInsight {
	kind: 'circadian';
	buckets: { key: DaypartKey; count: number }[];
	total: number;
	topKey: DaypartKey;
	topPct: number;
}

const DAYPARTS: { key: DaypartKey; from: number; to: number }[] = [
	{ key: 'night', from: 0, to: 6 },
	{ key: 'morning', from: 6, to: 12 },
	{ key: 'afternoon', from: 12, to: 18 },
	{ key: 'evening', from: 18, to: 24 },
];

function daypartOf(hour: number): DaypartKey {
	const slot = DAYPARTS.find((d) => hour >= d.from && hour < d.to);
	return slot ? slot.key : 'night';
}

export function computeCircadian(
	docs: InsightDoc[],
	bp: Blueprint,
	now: Date = new Date(),
): CircadianInsight | null {
	const timed = timedEpisodeTypes(bp);
	if (timed.length === 0) return null;
	const timedIds = timed.map((e) => e.id);

	const entries = windowedEntries(docs, now);
	const counts: Record<DaypartKey, number> = { night: 0, morning: 0, afternoon: 0, evening: 0 };
	let total = 0;
	for (const e of entries) {
		const times = e.data?.episodeTimes || {};
		const epMap = episodeMap(e);
		for (const id of timedIds) {
			const t = times[id];
			const n = Number(epMap[id] || 0) || 0;
			if (!t || n <= 0) continue;
			const hour = Number(String(t).slice(0, 2));
			if (!Number.isFinite(hour) || hour < 0 || hour > 23) continue;
			// One logged time per type/day; weight by that day's count for that type.
			counts[daypartOf(hour)] += n;
			total += n;
		}
	}
	if (total < 6) return null;
	const buckets = DAYPARTS.map((d) => ({ key: d.key, count: counts[d.key] }));
	let topKey: DaypartKey = 'night';
	let topCount = -1;
	for (const b of buckets) if (b.count > topCount) { topCount = b.count; topKey = b.key; }
	return { kind: 'circadian', buckets, total, topKey, topPct: pct(topCount / total) };
}

// ─────────────────────────────────────────────────────────────────────────
// 4. Episode-type mix
// ─────────────────────────────────────────────────────────────────────────

export interface TypeMixSlice {
	id: string;
	label: string;
	color: string;
	count: number;
	pct: number;
}

export interface TypeMixInsight {
	kind: 'type-mix';
	slices: TypeMixSlice[];
	total: number;
}

export function computeTypeMix(
	docs: InsightDoc[],
	bp: Blueprint,
	now: Date = new Date(),
): TypeMixInsight | null {
	const types = bp.episodeTypes || [];
	if (types.length < 2) return null;

	const entries = windowedEntries(docs, now);
	const counts = new Map<string, number>();
	let total = 0;
	for (const e of entries) {
		const m = episodeMap(e);
		for (const ty of types) {
			const n = Number(m[ty.id] || 0) || 0;
			if (n <= 0) continue;
			counts.set(ty.id, (counts.get(ty.id) || 0) + n);
			total += n;
		}
	}
	const withData = [...counts.keys()];
	// Needs a real mix: ≥2 types present and enough volume to be meaningful.
	if (total < 5 || withData.length < 2) return null;
	const slices: TypeMixSlice[] = types
		.filter((ty) => counts.has(ty.id))
		.map((ty) => ({
			id: ty.id,
			label: ty.label,
			color: ty.color,
			count: counts.get(ty.id) || 0,
			pct: pct((counts.get(ty.id) || 0) / total),
		}))
		.sort((a, b) => b.count - a.count);
	return { kind: 'type-mix', slices, total };
}

// ─────────────────────────────────────────────────────────────────────────
// 5. Duration signal (incl. the >5min status threshold)
// ─────────────────────────────────────────────────────────────────────────

export interface DurationInsight {
	kind: 'duration';
	under1: number;
	oneToFive: number;
	overFive: number;
	total: number;
	/** Any episode logged at the >5min (status) bucket in the window. */
	hasProlonged: boolean;
}

export function computeDurationSignal(
	docs: InsightDoc[],
	bp: Blueprint,
	now: Date = new Date(),
): DurationInsight | null {
	if (durationEpisodeTypes(bp).length === 0) return null;
	const durIds = durationEpisodeTypes(bp).map((e) => e.id);

	const entries = windowedEntries(docs, now);
	let under1 = 0;
	let oneToFive = 0;
	let overFive = 0;
	for (const e of entries) {
		const durs = e.data?.episodeDurations || {};
		const m = episodeMap(e);
		for (const id of durIds) {
			const n = Number(m[id] || 0) || 0;
			const d = durs[id];
			if (n <= 0 || !d) continue;
			if (d === '<1min') under1 += n;
			else if (d === '1-5min') oneToFive += n;
			else if (d === '>5min') overFive += n;
		}
	}
	const total = under1 + oneToFive + overFive;
	if (total < 3) return null;
	return { kind: 'duration', under1, oneToFive, overFive, total, hasProlonged: overFive > 0 };
}

// ─────────────────────────────────────────────────────────────────────────
// 7. Top symptoms — frequency, for episodeless blueprints (custom/lab)
// ─────────────────────────────────────────────────────────────────────────

export interface TopSymptomRow {
	id: string;
	label: string;
	count: number;
	pct: number; // share of logged days in the window (0..100)
}

export interface TopSymptomsInsight {
	kind: 'top-symptoms';
	rows: TopSymptomRow[];
	loggedDays: number;
}

export function computeTopSymptoms(
	docs: InsightDoc[],
	bp: Blueprint,
	now: Date = new Date(),
): TopSymptomsInsight | null {
	// Universal low-priority backstop (last in INSIGHT_ORDER): episode cohorts
	// fill the card cap with their richer episode-based cards first, so this
	// only surfaces when there's spare room — which is exactly the sparse /
	// episodeless case where the dashboard would otherwise be naked.
	const items = symptomItems(bp);
	if (items.length === 0) return null;

	const entries = windowedEntries(docs, now);
	if (entries.length < 8) return null;

	const counts = new Map<string, number>();
	let loggedDays = 0;
	for (const e of entries) {
		loggedDays++;
		const syms = e.data?.symptoms || {};
		for (const it of items) if (syms[it.id]) counts.set(it.id, (counts.get(it.id) || 0) + 1);
	}
	const rows: TopSymptomRow[] = items
		.filter((it) => (counts.get(it.id) || 0) > 0)
		.map((it) => ({
			id: it.id,
			label: it.label,
			count: counts.get(it.id) || 0,
			pct: pct((counts.get(it.id) || 0) / loggedDays),
		}))
		.sort((a, b) => b.count - a.count);
	// Need a real signal: the top symptom on at least a few days.
	if (rows.length === 0 || rows[0].count < 3) return null;
	return { kind: 'top-symptoms', rows: rows.slice(0, 5), loggedDays };
}

// ─────────────────────────────────────────────────────────────────────────
// Orchestration + capability matrix
// ─────────────────────────────────────────────────────────────────────────

export type Insight =
	| TriggerLiftInsight
	| SleepLinkInsight
	| CircadianInsight
	| TypeMixInsight
	| DurationInsight
	| TopSymptomsInsight;

export type InsightKind = Insight['kind'];

/** Priority order for the dashboard — most clinically actionable first. */
export const INSIGHT_ORDER: InsightKind[] = [
	'sleep-link',
	'trigger-lift',
	'circadian',
	'type-mix',
	'duration',
	// Last: a universal backstop so sparse / episodeless cohorts never show a
	// naked dashboard, without displacing richer episode cards when they exist.
	'top-symptoms',
];

/** Max cards rendered at once — keeps the column rich but not a wall (CIPH-900). */
export const MAX_INSIGHT_CARDS = 4;

/**
 * Compute every applicable insight for a blueprint + its data, ordered by
 * clinical priority and capped. Returns [] when nothing qualifies (the
 * section then renders nothing — no gaslighting empty state).
 */
export function computeInsights(
	docs: InsightDoc[],
	bp: Blueprint | null | undefined,
	now: Date = new Date(),
): Insight[] {
	if (!bp) return [];
	const all: (Insight | null)[] = [
		computeSleepEpisodeLink(docs, bp, now),
		computeTriggerLift(docs, bp, now),
		computeTopSymptoms(docs, bp, now),
		computeCircadian(docs, bp, now),
		computeTypeMix(docs, bp, now),
		computeDurationSignal(docs, bp, now),
	];
	const present = all.filter((x): x is Insight => x !== null);
	present.sort((a, b) => INSIGHT_ORDER.indexOf(a.kind) - INSIGHT_ORDER.indexOf(b.kind));
	return present.slice(0, MAX_INSIGHT_CARDS);
}

/**
 * Static capability matrix: which insight kinds a blueprint CAN ever show,
 * independent of how much data the user has logged. This is the
 * "analysis for every blueprint" surface — pinned by insights.test.ts so a
 * new preset's coverage is a conscious decision, not an accident.
 */
export function insightCapabilityMatrix(bp: Blueprint): Record<InsightKind, boolean> {
	const hasEpisodes = (bp.episodeTypes || []).length > 0;
	const symptoms = hasSymptoms(bp);
	// Correlation cards key off an adverse-outcome day: an episode day when the
	// blueprint logs episodes, else (or when episodes are too rare in-window —
	// decided at compute time by resolveOutcome) a symptom day.
	const outcomeAvailable = hasEpisodes || symptoms;
	return {
		'sleep-link': !!sleepVitalId(bp) && outcomeAvailable,
		'trigger-lift': (bp.triggers || []).length > 0 && outcomeAvailable,
		'top-symptoms': symptoms,
		circadian: timedEpisodeTypes(bp).length > 0,
		'type-mix': (bp.episodeTypes || []).length >= 2,
		duration: durationEpisodeTypes(bp).length > 0,
	};
}
