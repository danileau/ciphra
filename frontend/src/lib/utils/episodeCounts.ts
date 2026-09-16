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

type EpisodeInstanceLike = { time?: string; duration?: string; note?: string };

/**
 * A day entry with one more (`+1`) or one fewer (`-1`) occurrence of
 * `episodeId`, or `null` when there is nothing to remove.
 *
 * The count (`episodes[id]`) and the per-occurrence rows
 * (`episodeInstances[id]`) have to move together. EntryComposer PREFERS the
 * rows whenever an entry has any, so the /reports grid bumping only the count
 * was undone by the next save of that day in /log. The rules mirror the
 * composer's own save (see EntryComposer `saveEntry` /
 * `synthesizeEpisodeInstances`):
 *
 * - An entry with rows: `+1` appends an untimed row; `-1` removes the last
 *   untimed row, or the last row if every row has a time. The count is the
 *   row count. The first-occurrence time/duration mirrors are refreshed when
 *   the first row went, the joined note when a noted row went.
 * - A count-only entry (saved before rows existed) stays count-only; the
 *   composer synthesises its rows from the count.
 *
 * A legacy `seizures` map is carried into `episodes` whole, so no other
 * episode's count is lost when the entry is rewritten.
 */
export function withEpisodeCountChanged(data: any, episodeId: string, delta: 1 | -1): any | null {
	const counts: Record<string, number> = { ...(data?.episodes || data?.seizures || {}) };
	const stored = data?.episodeInstances?.[episodeId];
	const rows: EpisodeInstanceLike[] | null = Array.isArray(stored) && stored.length > 0 ? [...stored] : null;

	if (!rows) {
		const current = Number(counts[episodeId] || 0) || 0;
		if (delta < 0 && current <= 0) return null;
		const next = current + delta;
		if (next > 0) counts[episodeId] = next;
		else delete counts[episodeId];
		return { ...data, episodes: counts };
	}

	const next: any = { ...data };
	if (delta > 0) {
		rows.push({});
	} else {
		let idx = -1;
		for (let i = rows.length - 1; i >= 0; i--) {
			if (!rows[i]?.time) { idx = i; break; }
		}
		if (idx < 0) idx = rows.length - 1;
		const [removed] = rows.splice(idx, 1);
		if (idx === 0) {
			next.episodeTimes = { ...(data.episodeTimes || {}), [episodeId]: rows[0]?.time || '' };
			next.episodeDurations = { ...(data.episodeDurations || {}), [episodeId]: rows[0]?.duration || '' };
		}
		if (removed?.note) {
			next.episodeNotes = {
				...(data.episodeNotes || {}),
				[episodeId]: rows.map((r) => r.note).filter(Boolean).join(' · '),
			};
		}
	}

	const instances = { ...(data.episodeInstances || {}) };
	if (rows.length > 0) {
		instances[episodeId] = rows;
		counts[episodeId] = rows.length;
	} else {
		delete instances[episodeId];
		delete counts[episodeId];
	}
	next.episodeInstances = instances;
	next.episodes = counts;
	return next;
}
