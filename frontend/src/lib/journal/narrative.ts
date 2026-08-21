/**
 * ciphra — the journal's narrative feed.
 *
 * WHAT CHANGED AND WHY
 *
 * /journal used to render one card per logged DAY — 631 of them for a
 * two-year persona, 69,000px of page, ~110px of chrome per day to hold one
 * grey line reading `Pain level: 7 1-10 · Sleep hours: 5.1 h · Mood: 7 1-10`.
 * Every day looked identical, including the day with a migraine attack, so
 * the one entry that mattered was indistinguishable from the six around it.
 *
 * The page also had no job of its own. The dashboard answers "how am I", the
 * calendar answers "what happened on day X" and can navigate months, /reports
 * aggregates. A flat reverse-chronological list of metrics is the calendar
 * without the navigation.
 *
 * So the journal keeps what no other surface holds: **what the person wrote**.
 * Diary entries, the notes field of a daily entry, and note markers. Measured
 * values are not repeated here — they are the whole of /reports.
 *
 * THE ONE EXCEPTION, and it is deliberate: a day's EPISODES ride along as
 * context. "Aura zuerst, dann Schmerz von links" means something different
 * beside `1× Migraine with aura` than it does alone, and dropping episodes
 * entirely would have re-created the original complaint — the day that
 * mattered being invisible. Episodes are context on a written day; they never
 * make an unwritten day appear.
 */
import type { CiphraDocument } from '$lib/stores/documents';
import type { Blueprint } from '$lib/blueprint/types';

export type JournalTextKind = 'diary' | 'note' | 'marker';

export interface JournalText {
	/** Document id — identity for keyed `{#each}` and for opening the moment view. */
	id: number;
	kind: JournalTextKind;
	text: string;
	/** `HH:MM` when the document carries one. */
	time?: string;
	/** Raw doc type, so the caller can route (entry → /log/…, else → modal). */
	docType: string;
	dateISO: string;
}

export interface JournalEpisode {
	id: string;
	/** i18n key, or a literal label for custom items. */
	label: string;
	isCustom: boolean;
	count: number;
}

export interface JournalDay {
	/** `YYYY-MM-DD` */
	dayKey: string;
	/** `YYYY-MM` */
	monthKey: string;
	texts: JournalText[];
	/** Episodes recorded that day. Context only — never a reason to appear. */
	episodes: JournalEpisode[];
}

/** Collapse whitespace; empty string means "nothing written". */
function clean(v: unknown): string {
	return String(v ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * The written content of one document, or null if it carries none.
 *
 * `title` wins over `notes` for markers — the epilepc migration puts the short
 * human title in `title` and long prose in `notes`, the same preference
 * `noteMarkerText` applies for the PDF.
 */
export function textOf(doc: CiphraDocument | { id?: number; data?: any }): JournalText | null {
	const data = (doc as any)?.data;
	if (!data) return null;
	const dateISO = String(data.date || '').slice(0, 10);
	if (dateISO.length !== 10) return null;
	const base = {
		id: (doc as any).id as number,
		time: clean(data.time) || undefined,
		docType: String(data.type || ''),
		dateISO,
	};

	if (data.type === 'diary') {
		const text = clean(data.text) || clean(data.notes);
		return text ? { ...base, kind: 'diary', text } : null;
	}
	if (data.type === 'entry') {
		const text = clean(data.notes);
		return text ? { ...base, kind: 'note', text } : null;
	}
	if (data.type === 'event') {
		// Rescue-medication administrations are structured records, not prose.
		if (data.kind === 'medication') return null;
		const text = clean(data.title) || clean(data.notes);
		return text ? { ...base, kind: 'marker', text } : null;
	}
	return null;
}

/** Episodes recorded on an entry document, resolved against the blueprint. */
function episodesOf(doc: { data?: any }, blueprint: Blueprint | null): JournalEpisode[] {
	const data = doc?.data;
	if (!data || data.type !== 'entry' || !blueprint?.episodeTypes) return [];
	const counts = (data.episodes || data.seizures || {}) as Record<string, unknown>;
	const out: JournalEpisode[] = [];
	for (const ep of blueprint.episodeTypes) {
		const n = Number(counts[ep.id] || 0);
		if (n > 0) {
			out.push({
				id: ep.id,
				label: (ep as any).label ?? ep.id,
				isCustom: false,
				count: n,
			});
		}
	}
	return out;
}

export interface NarrativeFilter {
	/** Free-text match across the written content. */
	query?: string;
	/** Restrict to one kind of writing. */
	kind?: JournalTextKind | 'all';
	/** Only days that also recorded an episode. */
	withEpisodeOnly?: boolean;
	/** Inclusive `YYYY-MM-DD` bounds. */
	fromISO?: string;
	toISO?: string;
}

/**
 * Days that hold writing, newest first.
 *
 * A day qualifies on its TEXT alone. `withEpisodeOnly` narrows that set; it
 * never widens it, so an episode without a note still does not appear here —
 * that is the calendar's and /reports' job.
 */
export function buildNarrative(
	docs: CiphraDocument[] | null | undefined,
	blueprint: Blueprint | null,
	filter: NarrativeFilter = {},
): JournalDay[] {
	const q = clean(filter.query).toLowerCase();
	const kind = filter.kind && filter.kind !== 'all' ? filter.kind : null;

	const byDay = new Map<string, JournalDay>();
	const episodesByDay = new Map<string, JournalEpisode[]>();

	for (const doc of docs ?? []) {
		const data = (doc as any)?.data;
		if (!data || data.type === 'blueprint') continue;

		const dateISO = String(data.date || '').slice(0, 10);
		if (dateISO.length === 10) {
			if (filter.fromISO && dateISO < filter.fromISO) continue;
			if (filter.toISO && dateISO > filter.toISO) continue;
		}

		// Episodes are collected for EVERY in-range entry, including days with
		// no writing — a day that later qualifies through a separate diary doc
		// still needs its context.
		const eps = episodesOf(doc, blueprint);
		if (eps.length > 0) {
			const prev = episodesByDay.get(dateISO) ?? [];
			for (const e of eps) {
				const hit = prev.find((p) => p.id === e.id);
				if (hit) hit.count += e.count;
				else prev.push({ ...e });
			}
			episodesByDay.set(dateISO, prev);
		}

		const text = textOf(doc);
		if (!text) continue;
		if (kind && text.kind !== kind) continue;
		if (q && !text.text.toLowerCase().includes(q)) continue;

		let day = byDay.get(text.dateISO);
		if (!day) {
			day = {
				dayKey: text.dateISO,
				monthKey: text.dateISO.slice(0, 7),
				texts: [],
				episodes: [],
			};
			byDay.set(text.dateISO, day);
		}
		day.texts.push(text);
	}

	const days = [...byDay.values()];
	for (const day of days) {
		day.episodes = episodesByDay.get(day.dayKey) ?? [];
		// Newest moment first within a day; untimed writing sorts last so a
		// dated diary line does not jump above a timed marker.
		day.texts.sort((a, b) => (b.time ?? '').localeCompare(a.time ?? '') || a.id - b.id);
	}

	const filtered = filter.withEpisodeOnly ? days.filter((d) => d.episodes.length > 0) : days;
	return filtered.sort((a, b) => b.dayKey.localeCompare(a.dayKey));
}

/** Month buckets over an already-built narrative, preserving its order. */
export function groupByMonth(days: JournalDay[]): Array<{ monthKey: string; days: JournalDay[] }> {
	const out: Array<{ monthKey: string; days: JournalDay[] }> = [];
	for (const day of days) {
		const last = out[out.length - 1];
		if (last && last.monthKey === day.monthKey) last.days.push(day);
		else out.push({ monthKey: day.monthKey, days: [day] });
	}
	return out;
}
