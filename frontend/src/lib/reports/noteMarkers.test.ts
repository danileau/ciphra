/**
 * Note markers — the shared definition behind the PDF and the pre-export
 * review.
 *
 * The contract that matters: the set the review dialog offers must be exactly
 * the set the export can print, resolved from exactly the same field. If they
 * drift, the user ticks one set of sentences and hands over another.
 */
import { describe, it, expect } from 'vitest';
import {
	isNoteMarker,
	noteMarkerText,
	noteMarkersInWindow,
	withSelectedNoteMarkers,
} from './noteMarkers';

const doc = (id: number, data: Record<string, unknown>) =>
	({ id, serverCreatedAt: '', data }) as any;

const note = (id: number, date: string, extra: Record<string, unknown> = {}) =>
	doc(id, { type: 'event', date, notes: `note ${id}`, ...extra });

describe('isNoteMarker', () => {
	it('accepts a freeform event', () => {
		expect(isNoteMarker(note(1, '2025-03-01'))).toBe(true);
	});

	it('rejects a rescue-medication administration', () => {
		// Structured clinical act — its own KPI tile and CSV columns.
		expect(isNoteMarker(doc(2, { type: 'event', kind: 'medication', date: '2025-03-01' }))).toBe(false);
	});

	it('rejects entries and diaries', () => {
		expect(isNoteMarker(doc(3, { type: 'entry', date: '2025-03-01' }))).toBe(false);
		expect(isNoteMarker(doc(4, { type: 'diary', date: '2025-03-01' }))).toBe(false);
	});

	it('tolerates junk', () => {
		expect(isNoteMarker(null)).toBe(false);
		expect(isNoteMarker(undefined)).toBe(false);
		expect(isNoteMarker({} as any)).toBe(false);
	});
});

describe('noteMarkerText', () => {
	it('prefers title over notes', () => {
		// The epilepc migration puts the short human title in `title` and the
		// long prose in `notes`; reading `notes` is why migrated markers
		// rendered as half-sentences.
		expect(noteMarkerText(doc(1, { title: 'Dosis erhöht', notes: 'Langer Fliesstext …' })))
			.toBe('Dosis erhöht');
	});

	it('falls back to notes when there is no title', () => {
		expect(noteMarkerText(doc(1, { notes: 'Grippeimpfung' }))).toBe('Grippeimpfung');
	});

	it('collapses whitespace', () => {
		expect(noteMarkerText(doc(1, { notes: 'zwei   Zeilen\n\tumgebrochen' })))
			.toBe('zwei Zeilen umgebrochen');
	});

	it('returns empty for a marker with no text at all', () => {
		expect(noteMarkerText(doc(1, { type: 'event' }))).toBe('');
	});
});

describe('noteMarkersInWindow', () => {
	const docs = [
		note(3, '2025-03-15'),
		note(1, '2025-01-04'),
		doc(9, { type: 'event', kind: 'medication', date: '2025-02-02' }),
		note(2, '2025-02-20'),
		note(8, '2024-12-31'), // before the window
		note(7, '2026-01-01'), // after the window
	];

	it('returns only in-window note markers, oldest first', () => {
		const got = noteMarkersInWindow(docs, '2025-01-01', '2025-12-31');
		expect(got.map((n) => n.id)).toEqual([1, 2, 3]);
	});

	it('excludes medication administrations', () => {
		expect(noteMarkersInWindow(docs, '2025-01-01', '2025-12-31').map((n) => n.id)).not.toContain(9);
	});

	it('excludes per-entry private markers', () => {
		// The dialog must not offer a choice the user does not have — the
		// export would drop these anyway.
		const withPrivate = [...docs, note(5, '2025-04-01', { private: true })];
		expect(noteMarkersInWindow(withPrivate, '2025-01-01', '2025-12-31').map((n) => n.id))
			.not.toContain(5);
	});

	it('skips markers with no text', () => {
		const blank = [doc(6, { type: 'event', date: '2025-05-05', notes: '   ' })];
		expect(noteMarkersInWindow(blank, '2025-01-01', '2025-12-31')).toEqual([]);
	});

	it('is inclusive on both window bounds', () => {
		const edge = [note(1, '2025-01-01'), note(2, '2025-12-31')];
		expect(noteMarkersInWindow(edge, '2025-01-01', '2025-12-31')).toHaveLength(2);
	});

	it('orders same-day markers deterministically', () => {
		const sameDay = [note(20, '2025-06-01'), note(10, '2025-06-01')];
		expect(noteMarkersInWindow(sameDay, '2025-01-01', '2025-12-31').map((n) => n.id))
			.toEqual([10, 20]);
	});

	it('tolerates null input', () => {
		expect(noteMarkersInWindow(null, '2025-01-01', '2025-12-31')).toEqual([]);
	});
});

describe('withSelectedNoteMarkers', () => {
	const entry = doc(100, { type: 'entry', date: '2025-03-01' });
	const med = doc(101, { type: 'event', kind: 'medication', date: '2025-03-01' });
	const a = note(1, '2025-03-01');
	const b = note(2, '2025-03-02');

	it('keeps only the ticked note markers', () => {
		const got = withSelectedNoteMarkers([entry, med, a, b], new Set([2]));
		expect(got.map((d: any) => d.id)).toEqual([100, 101, 2]);
	});

	it('nothing ticked removes every note marker and nothing else', () => {
		const got = withSelectedNoteMarkers([entry, med, a, b], new Set());
		expect(got.map((d: any) => d.id)).toEqual([100, 101]);
	});

	it('never touches entries or medication events', () => {
		// The opt-in governs patient prose only. Withholding recorded data
		// would silently change the clinical content of the report.
		const got = withSelectedNoteMarkers([entry, med], new Set());
		expect(got).toHaveLength(2);
	});
});
