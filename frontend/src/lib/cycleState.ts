/**
 * CIPH-855a — Shared cycle-state module.
 *
 * Extracted from Companion.svelte so Calendar can use the same
 * computation to render a phase-per-day overlay without reinventing
 * the math or duplicating the anchor-lookup + wrap logic.
 *
 * Consumed by:
 *   - `CompanionMain` (indirectly via Companion.svelte) — renders the
 *     cycle-phase card for today.
 *   - `routes/calendar/+page.svelte` — renders a 15% phase-colored
 *     background on each day cell (cycle cohort only).
 */
import type { Blueprint } from './blueprint/types';
import type { CiphraDocument } from './stores/documents';
import { DATA_1, DATA_3, DATA_4, DATA_5 } from './dataPalette';

export type Phase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal';

export const PHASE_COLORS: Record<Phase, string> = {
	menstrual: DATA_1,
	follicular: DATA_3,
	ovulation: DATA_4,
	luteal: DATA_5,
};

export interface CycleAnchor {
	/** YYYY-MM-DD of the entry the cycle_day value came from. */
	anchorDate: string | null;
	/** cycle_day at the anchor. Null when no data. */
	anchorDay: number | null;
	/** Most recent cycle_length, or 28 fallback. Always ≥1. */
	cycleLength: number;
	/** Variance of last 6 cycle_length values. */
	variance: number;
	/** True if variance > 5 days OR conditionId === 'pcos'. */
	irregular: boolean;
}

export interface PhaseBoundaries {
	endMenstrual: number;
	endFollicular: number;
	endOvulation: number;
}

export interface CycleStateToday {
	hasData: boolean;
	day?: number;
	cycleLength: number;
	phase?: Phase;
	irregular: boolean;
	endMenstrual?: number;
	endFollicular?: number;
	endOvulation?: number;
	progressPct?: number;
}

/** Does this blueprint track a cycle? */
export function hasCycleTracking(bp: Blueprint | null | undefined): boolean {
	return !!bp?.vitals?.some((v) => v.id === 'cycle_day');
}

/**
 * Derive the cycle anchor from a list of entry docs. Scans backward for
 * the most recent `cycle_day` value and `cycle_length` value
 * independently (they may live on different entries). Falls back to 28
 * when cycle_length has never been set.
 */
export function computeCycleAnchor(
	bp: Blueprint | null | undefined,
	docs: CiphraDocument[],
): CycleAnchor {
	const logs = docs
		.filter((d) => d.data.type === 'entry' && d.data.date)
		.slice()
		.sort((a, b) => String(a.data.date).localeCompare(String(b.data.date)));

	let anchorDate: string | null = null;
	let anchorDay: number | null = null;
	for (let i = logs.length - 1; i >= 0; i--) {
		const v = Number((logs[i].data.vitals || {}).cycle_day);
		if (Number.isFinite(v) && v > 0) {
			anchorDate = String(logs[i].data.date).slice(0, 10);
			anchorDay = v;
			break;
		}
	}

	let cycleLength = 28;
	for (let i = logs.length - 1; i >= 0; i--) {
		const v = Number((logs[i].data.vitals || {}).cycle_length);
		if (Number.isFinite(v) && v > 0) {
			cycleLength = v;
			break;
		}
	}
	if (cycleLength < 1) cycleLength = 28;

	const lengths: number[] = [];
	for (let i = logs.length - 1; i >= 0 && lengths.length < 6; i--) {
		const v = Number((logs[i].data.vitals || {}).cycle_length);
		if (Number.isFinite(v) && v > 0) lengths.push(v);
	}
	let variance = 0;
	if (lengths.length >= 2) {
		const mean = lengths.reduce((s, n) => s + n, 0) / lengths.length;
		variance = Math.sqrt(
			lengths.reduce((s, n) => s + (n - mean) ** 2, 0) / lengths.length,
		);
	}
	const irregular = variance > 5 || bp?.conditionId === 'pcos';

	return { anchorDate, anchorDay, cycleLength, variance, irregular };
}

/**
 * Phase thresholds scale proportionally from the 28-day canonical:
 * menstrual 1-5, follicular 6-13, ovulation 14-16, luteal 17+.
 */
export function phaseBoundaries(cycleLength: number): PhaseBoundaries {
	const scale = cycleLength / 28;
	const endMenstrual = Math.max(1, Math.round(5 * scale));
	const endFollicular = Math.max(endMenstrual + 1, Math.round(13 * scale));
	const endOvulation = Math.max(endFollicular + 1, Math.round(16 * scale));
	return { endMenstrual, endFollicular, endOvulation };
}

export function phaseForDay(day: number, cycleLength: number): Phase {
	const b = phaseBoundaries(cycleLength);
	if (day <= b.endMenstrual) return 'menstrual';
	if (day <= b.endFollicular) return 'follicular';
	if (day <= b.endOvulation) return 'ovulation';
	return 'luteal';
}

/**
 * Given an anchor and a target YYYY-MM-DD, compute the cycle day
 * (wrapping modulo cycleLength) and its phase. Returns null when the
 * anchor has no data.
 */
export function cycleStateForDate(
	anchor: CycleAnchor,
	targetDate: string,
): { day: number; phase: Phase } | null {
	if (!anchor.anchorDate || anchor.anchorDay == null) return null;
	const a = new Date(anchor.anchorDate + 'T12:00:00');
	const t = new Date(targetDate + 'T12:00:00');
	const elapsed = Math.round((t.getTime() - a.getTime()) / 86400000);
	// Signed elapsed — cycle day arithmetic must work both forward and
	// backward so calendar cells before the anchor render correctly.
	let day = anchor.anchorDay + elapsed;
	day = (((day - 1) % anchor.cycleLength) + anchor.cycleLength) %
		anchor.cycleLength + 1;
	return { day, phase: phaseForDay(day, anchor.cycleLength) };
}

/**
 * "Today" view of cycle state used by Companion dashboard. Matches the
 * previous inline implementation, wrapped in a module API.
 */
export function computeCycleStateToday(
	bp: Blueprint | null | undefined,
	docs: CiphraDocument[],
	today: Date = new Date(),
): CycleStateToday {
	if (!hasCycleTracking(bp)) {
		return { hasData: false, cycleLength: 28, irregular: false };
	}
	const anchor = computeCycleAnchor(bp, docs);
	if (anchor.anchorDate == null || anchor.anchorDay == null) {
		return {
			hasData: false,
			cycleLength: anchor.cycleLength,
			irregular: anchor.irregular,
		};
	}
	const todayKey = new Date(today.getTime());
	todayKey.setHours(12, 0, 0, 0);
	const todayStr = todayKey.toISOString().slice(0, 10);
	const state = cycleStateForDate(anchor, todayStr);
	if (!state) {
		return {
			hasData: false,
			cycleLength: anchor.cycleLength,
			irregular: anchor.irregular,
		};
	}
	const bounds = phaseBoundaries(anchor.cycleLength);
	return {
		hasData: true,
		day: state.day,
		cycleLength: anchor.cycleLength,
		phase: state.phase,
		irregular: anchor.irregular,
		endMenstrual: bounds.endMenstrual,
		endFollicular: bounds.endFollicular,
		endOvulation: bounds.endOvulation,
		progressPct: Math.max(0, Math.min(100, ((state.day - 1) / anchor.cycleLength) * 100)),
	};
}
