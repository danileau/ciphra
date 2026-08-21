/**
 * ciphra — note markers, the freeform annotations a user writes.
 *
 * Shared deliberately. The doctor PDF prints these and the pre-export review
 * asks which of them may be printed; if the two disagreed about what counts
 * as a note marker or about which field holds its text, the user would tick
 * one set of sentences and hand over another. That is the failure this module
 * exists to make impossible.
 *
 * It lives here rather than in `$lib/pdf` because that module pulls jsPDF +
 * autoTable (~152KB gzip) and `/reports` defers it behind `loadPdfLib()`.
 *
 * A note marker is a `type: 'event'` document that is NOT a rescue-medication
 * administration. Med administrations are structured clinical acts with their
 * own KPI tile and CSV columns; note markers are patient narrative and are the
 * only export content authored as free prose.
 */
import type { CiphraDocument } from '$lib/stores/documents';
import { isExportable } from '$lib/utils/exportable';

export interface NoteMarker {
	/** Document id — the identity the review dialog selects on. */
	id: number;
	/** `YYYY-MM-DD`. */
	dateISO: string;
	/** Display text, whitespace-collapsed. Never truncated here. */
	text: string;
}

/** True for a document that is a freeform note marker (not a med administration). */
export function isNoteMarker(doc: CiphraDocument | { data?: any } | null | undefined): boolean {
	const data = (doc as { data?: any })?.data;
	if (!data || data.type !== 'event') return false;
	return data.kind !== 'medication';
}

/**
 * The text a note marker shows.
 *
 * PREFERS `title`. The epilepc migration keeps the short human title in
 * `title` and the long prose description in `notes`
 * (migration/epilepcMapping.ts). Reading `notes` is why migrated markers
 * rendered as half-sentences; `EntryPreview` already preferred `title`.
 */
export function noteMarkerText(doc: CiphraDocument | { data?: any }): string {
	const data = (doc as { data?: any })?.data ?? {};
	return String(data.title || data.notes || '').replace(/\s+/g, ' ').trim();
}

/**
 * Note markers inside `[startISO, endISO]`, oldest first.
 *
 * Applies `isExportable` so a per-entry private marker never reaches either
 * caller — the review dialog must not offer to include something the export
 * would drop anyway, and must not imply the user has a choice they don't.
 */
export function noteMarkersInWindow(
	docs: CiphraDocument[] | null | undefined,
	startISO: string,
	endISO: string,
): NoteMarker[] {
	const out: NoteMarker[] = [];
	for (const doc of docs ?? []) {
		if (!isExportable(doc) || !isNoteMarker(doc)) continue;
		const dateISO = String((doc as any).data?.date || '');
		if (dateISO.length !== 10 || dateISO < startISO || dateISO > endISO) continue;
		const text = noteMarkerText(doc);
		if (!text) continue;
		out.push({ id: (doc as any).id, dateISO, text });
	}
	return out.sort((a, b) => a.dateISO.localeCompare(b.dateISO) || a.id - b.id);
}

/**
 * Drop the note markers the user did not tick.
 *
 * Everything else passes through untouched — entries, med administrations,
 * and any note marker whose id is selected. Filtering the document set is
 * what keeps `generateDoctorPdf` free of a selection concept: the export
 * simply never sees a note the user withheld.
 */
export function withSelectedNoteMarkers(
	docs: CiphraDocument[],
	selectedIds: ReadonlySet<number>,
): CiphraDocument[] {
	return docs.filter((doc) => (isNoteMarker(doc) ? selectedIds.has((doc as any).id) : true));
}
