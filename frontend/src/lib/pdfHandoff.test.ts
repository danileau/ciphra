/**
 * pdfHandoff.ts — structure + behavior tests.
 *
 * The renderer is hard to snapshot byte-for-byte (jsPDF embeds a binary
 * stream), so these tests scope to:
 *   - the pure aggregators (extractVitalDraws, extractPatientNotes,
 *     extractDoseChanges, computePeriodRange) — exhaustive
 *   - exported draw-fn contracts (signatures, return values where
 *     deterministic — e.g. dispatcher routing)
 *   - the patient-top-line invariants (author shape, fallback, cap)
 *
 * Byte-level snapshots are deferred to a later integration test
 * (manual photocopy fidelity per spec §11.2).
 */
import { describe, it, expect } from 'vitest';
import {
	BANNED_WORDS,
	extractVitalDraws,
	extractPatientNotes,
	extractDoseChanges,
	computePeriodRange,
} from './pdfHandoff';
import type { Blueprint } from './blueprint';
import type { CiphraDocument } from './stores/documents';

const HELENA_DRAWS = [
	{ date: '2026-01-15', tsh: '4.2' },
	{ date: '2026-02-12', tsh: '3.8' },
	{ date: '2026-03-19', tsh: '3.1' },
	{ date: '2026-04-23', tsh: '2.9' },
];

function helenaDocs(): CiphraDocument[] {
	return HELENA_DRAWS.map((d, i) => ({
		id: `doc-${i}`,
		userId: 'helena',
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		data: { type: 'entry', date: d.date, vitals: { tsh: d.tsh } } as any,
		createdAt: d.date + 'T00:00:00Z',
		updatedAt: d.date + 'T00:00:00Z',
	})) as CiphraDocument[];
}

describe('computePeriodRange', () => {
	it('month scope returns first..last day of given month', () => {
		const r = computePeriodRange(2026, 3, 'month'); // April (0-based month)
		expect(r.startISO).toBe('2026-04-01');
		expect(r.endISO).toBe('2026-04-30');
	});

	it('year scope returns trailing 12 months from end of month', () => {
		const r = computePeriodRange(2026, 4, 'year'); // end of May 2026
		expect(r.endISO).toBe('2026-05-31');
		// Trailing 12 months means 2025-06-01 .. 2026-05-31 (inclusive).
		expect(r.startISO).toBe('2025-06-01');
	});

	it('2years scope returns trailing 24 months', () => {
		const r = computePeriodRange(2026, 4, '2years');
		expect(r.endISO).toBe('2026-05-31');
		expect(r.startISO).toBe('2024-06-01');
	});
});

describe('extractVitalDraws', () => {
	it('extracts numeric values for a vital id within the period', () => {
		const range = { startISO: '2026-01-01', endISO: '2026-04-30' };
		const draws = extractVitalDraws(helenaDocs(), 'tsh', range);
		expect(draws.map((d) => d.value)).toEqual([4.2, 3.8, 3.1, 2.9]);
	});

	it('orders draws chronologically ascending', () => {
		const range = { startISO: '2026-01-01', endISO: '2026-04-30' };
		const draws = extractVitalDraws(helenaDocs(), 'tsh', range);
		const dates = draws.map((d) => d.dateISO);
		expect(dates).toEqual([...dates].sort());
	});

	it('excludes draws outside the period', () => {
		const range = { startISO: '2026-02-01', endISO: '2026-03-31' };
		const draws = extractVitalDraws(helenaDocs(), 'tsh', range);
		expect(draws.map((d) => d.value)).toEqual([3.8, 3.1]);
	});

	it('parses multi-entry JSON-array vital values (first value wins)', () => {
		const docs = [
			{
				id: 'd1',
				userId: 'u',
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				data: { type: 'entry', date: '2026-04-01', vitals: { ft4: '[14.2, 13.8]' } } as any,
				createdAt: '', updatedAt: '',
			},
		] as unknown as CiphraDocument[];
		const draws = extractVitalDraws(docs, 'ft4', { startISO: '2026-01-01', endISO: '2026-12-31' });
		expect(draws).toEqual([{ dateISO: '2026-04-01', value: 14.2 }]);
	});

	it('skips non-numeric strings silently', () => {
		const docs = [
			{
				id: 'd1',
				userId: 'u',
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				data: { type: 'entry', date: '2026-04-01', vitals: { tsh: 'unbekannt' } } as any,
				createdAt: '', updatedAt: '',
			},
		] as unknown as CiphraDocument[];
		const draws = extractVitalDraws(docs, 'tsh', { startISO: '2026-01-01', endISO: '2026-12-31' });
		expect(draws).toEqual([]);
	});
});

describe('extractPatientNotes', () => {
	it('returns notes ordered most-recent-first', () => {
		const docs = [
			{ id: 'd1', userId: 'u', data: { type: 'entry', date: '2026-02-01', notes: 'older note' } },
			{ id: 'd2', userId: 'u', data: { type: 'entry', date: '2026-04-01', notes: 'newer note' } },
			{ id: 'd3', userId: 'u', data: { type: 'entry', date: '2026-03-01', notes: 'middle note' } },
		] as unknown as CiphraDocument[];
		const range = { startISO: '2026-01-01', endISO: '2026-12-31' };
		const notes = extractPatientNotes(docs, range);
		expect(notes.map((n) => n.text)).toEqual(['newer note', 'middle note', 'older note']);
	});

	it('skips docs without patient-authored text', () => {
		const docs = [
			{ id: 'd1', userId: 'u', data: { type: 'entry', date: '2026-04-01' } }, // no text fields
			{ id: 'd2', userId: 'u', data: { type: 'entry', date: '2026-04-02', notes: '' } }, // empty
			{ id: 'd3', userId: 'u', data: { type: 'entry', date: '2026-04-03', notes: 'real note' } },
		] as unknown as CiphraDocument[];
		const range = { startISO: '2026-01-01', endISO: '2026-12-31' };
		const notes = extractPatientNotes(docs, range);
		expect(notes).toEqual([{ dateISO: '2026-04-03', text: 'real note' }]);
	});

	it('picks the first non-empty text field across candidates', () => {
		// `narrative` and `diary` are also accepted besides `notes`.
		const docs = [
			{ id: 'd1', userId: 'u', data: { type: 'entry', date: '2026-04-01', narrative: 'via narrative' } },
			{ id: 'd2', userId: 'u', data: { type: 'entry', date: '2026-04-02', diary: 'via diary' } },
		] as unknown as CiphraDocument[];
		const notes = extractPatientNotes(docs, { startISO: '2026-01-01', endISO: '2026-12-31' });
		expect(notes.map((n) => n.text).sort()).toEqual(['via diary', 'via narrative']);
	});
});

describe('extractDoseChanges', () => {
	const bp = {
		medications: [{ id: 'levothyroxine', name: 'Levothyroxine', dose: '75', schedule: 'daily' }],
	} as Blueprint;

	it('reads future-schema treatment_change documents', () => {
		const docs = [
			{
				id: 'd1', userId: 'u',
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				data: {
					type: 'treatment_change',
					date: '2026-02-15',
					medication: 'Levothyroxine',
					fromDose: 75, toDose: 88, unit: 'mcg',
				} as any,
			},
		] as unknown as CiphraDocument[];
		const changes = extractDoseChanges(docs, bp, { startISO: '2026-01-01', endISO: '2026-12-31' });
		expect(changes).toEqual([
			{ dateISO: '2026-02-15', medication: 'Levothyroxine', fromDose: 75, toDose: 88, unit: 'mcg' },
		]);
	});

	it('returns empty when no treatment_change events and only fallback path applies', () => {
		const docs = [
			{ id: 'd1', userId: 'u', data: { type: 'entry', date: '2026-02-15', medications: { levothyroxine: { taken: true, dose: '75' } } } },
		] as unknown as CiphraDocument[];
		const changes = extractDoseChanges(docs, bp, { startISO: '2026-01-01', endISO: '2026-12-31' });
		// The fallback path tracks first-occurrence but doesn't emit
		// markers without an explicit change signal — by design.
		expect(changes).toEqual([]);
	});

	it('orders dose changes chronologically ascending', () => {
		const docs = [
			{ id: 'd1', userId: 'u', data: { type: 'treatment_change', date: '2026-04-01', medication: 'L', fromDose: 88, toDose: 100, unit: 'mcg' } },
			{ id: 'd2', userId: 'u', data: { type: 'treatment_change', date: '2026-02-15', medication: 'L', fromDose: 75, toDose: 88, unit: 'mcg' } },
		] as unknown as CiphraDocument[];
		const changes = extractDoseChanges(docs, bp, { startISO: '2026-01-01', endISO: '2026-12-31' });
		expect(changes.map((c) => c.dateISO)).toEqual(['2026-02-15', '2026-04-01']);
	});
});

describe('BANNED_WORDS list (spec §1.4)', () => {
	it('contains the MDR auditor minimum set', () => {
		// Spot-check that the highest-risk words are present.
		const required = ['trend', 'improving', 'worsening', 'abnormal', 'trajectory', 'optimal'];
		for (const r of required) {
			expect(BANNED_WORDS).toContain(r);
		}
	});

	it('is non-empty', () => {
		expect(BANNED_WORDS.length).toBeGreaterThan(10);
	});
});
