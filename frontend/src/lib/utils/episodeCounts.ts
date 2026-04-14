// Episode-counting helpers shared across analytics views.
//
// ciphra has two document types: `entry` (any structured health log —
// full form or quick-add) and `event` (narrative marker). Episode data
// lives on `entry` docs only.

import type { CiphraDocument } from '$lib/stores/documents';

/** True if this document contributes to episode counts. */
export function isEpisodeBearing(doc: CiphraDocument): boolean {
	return doc?.data?.type === 'entry';
}

/** Per-id episode counts across entry docs in window. */
export function countEpisodesInWindow(
	docs: CiphraDocument[],
	episodeIds: string[],
	startISO: string,
	endISO: string
): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const id of episodeIds) counts[id] = 0;
	for (const d of docs) {
		if (!isEpisodeBearing(d)) continue;
		const date = String(d.data?.date || '');
		if (!date || date < startISO || date > endISO) continue;
		const eps = (d.data?.episodes || d.data?.seizures || {}) as Record<string, number>;
		for (const id of episodeIds) {
			counts[id] += Number(eps[id] || 0);
		}
	}
	return counts;
}

/** Total episode count (sum across episodeIds) within window. */
export function totalEpisodesInWindow(
	docs: CiphraDocument[],
	episodeIds: string[],
	startISO: string,
	endISO: string
): number {
	const counts = countEpisodesInWindow(docs, episodeIds, startISO, endISO);
	return Object.values(counts).reduce((a, b) => a + b, 0);
}

/** YYYY-MM-DD set of dates with at least one episode in the window. */
export function daysWithEpisodes(
	docs: CiphraDocument[],
	episodeIds: string[],
	startISO: string,
	endISO: string
): Set<string> {
	const days = new Set<string>();
	for (const d of docs) {
		if (!isEpisodeBearing(d)) continue;
		const date = String(d.data?.date || '');
		if (!date || date < startISO || date > endISO) continue;
		const eps = (d.data?.episodes || d.data?.seizures || {}) as Record<string, number>;
		if (episodeIds.some((id) => Number(eps[id] || 0) > 0)) {
			days.add(date);
		}
	}
	return days;
}
