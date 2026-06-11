/**
 * Shared month-aggregate math (design review 2026-06-11).
 *
 * Phase-day coverage and episode-count totals were computed three times
 * independently — `monthSummaryInsight.ts` (calendar rail), inline in
 * `routes/reports/+page.svelte`, and `pdfPhaseDistribution.ts` (doctor
 * PDF) — and had already diverged on the legacy document shape:
 * migrated epilepc docs store counts under `data.seizures`, and only
 * two of the four call sites applied the fallback. A migrated user
 * could see "12 Phasentage" on one surface and 11 on another.
 *
 * This module is the single source for that math, following the
 * `effectiveColumns` precedent (screen and export must agree).
 * Rendering and presentation shaping stay at the call sites.
 *
 * Parity is pinned by `monthAggregates.test.ts` — including a fixture
 * doc in the legacy `seizures` shape that must count identically
 * everywhere.
 */
import type { Blueprint, EpisodeType } from '$lib/blueprint';
import type { CiphraDocument } from '$lib/stores/documents';

/** THE place that knows the entry-doc episode shape: `data.episodes`
 *  with the legacy migrated-epilepc `data.seizures` fallback. Non-entry
 *  docs return an empty map. */
export function episodeValuesOf(doc: CiphraDocument): Record<string, unknown> {
	if (doc?.data?.type !== 'entry') return {};
	return (doc.data.episodes || doc.data.seizures || {}) as Record<string, unknown>;
}

/** Per-multiDay-episode-type sets of dates (YYYY-MM-DD) on which the
 *  type was active (count > 0) within `docs`. Types with no multiDay
 *  flag are not returned. */
export function multiDayEpisodeDays(
	blueprint: Blueprint,
	docs: CiphraDocument[],
): Map<string, Set<string>> {
	const multiDayEps = (blueprint.episodeTypes ?? []).filter((ep) => ep.multiDay);
	const days = new Map<string, Set<string>>();
	for (const ep of multiDayEps) days.set(ep.id, new Set());
	if (multiDayEps.length === 0) return days;

	for (const d of docs) {
		const eps = episodeValuesOf(d);
		const ds = String(d?.data?.date || '');
		if (!ds) continue;
		for (const ep of multiDayEps) {
			if (Number(eps[ep.id] || 0) > 0) days.get(ep.id)!.add(ds);
		}
	}
	return days;
}

/** Number of distinct days on which ANY multiDay episode was active —
 *  the reports "Phasentage" stat. Union over `multiDayEpisodeDays`. */
export function anyPhaseDayCount(blueprint: Blueprint, docs: CiphraDocument[]): number {
	const union = new Set<string>();
	for (const set of multiDayEpisodeDays(blueprint, docs).values()) {
		for (const ds of set) union.add(ds);
	}
	return union.size;
}

/** Summed episode counts per episode-type id across `docs`. `kinds`
 *  selects which blueprint types participate. */
export function episodeCountTotals(
	blueprint: Blueprint,
	docs: CiphraDocument[],
	kinds: 'point' | 'multiDay' | 'all' = 'all',
): Map<string, number> {
	const types: EpisodeType[] = (blueprint.episodeTypes ?? []).filter((ep) =>
		kinds === 'all' ? true : kinds === 'multiDay' ? !!ep.multiDay : !ep.multiDay,
	);
	const counts = new Map<string, number>();
	for (const t of types) counts.set(t.id, 0);

	for (const d of docs) {
		const eps = episodeValuesOf(d);
		for (const t of types) {
			const v = Number(eps[t.id] || 0);
			if (v > 0) counts.set(t.id, (counts.get(t.id) ?? 0) + v);
		}
	}
	return counts;
}
