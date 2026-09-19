/**
 * The treatment history as its own document (2026-09-19).
 *
 * The first question at a new consultation is what has been tried, at what
 * dose, for how long and why it ended — a history that reaches back before
 * ciphra recorded anything. This suite pins:
 *   1. every dose period of every medication appears, oldest first, including
 *      the ones the person filled in from memory;
 *   2. a date given as a month prints as a month, never as an invented day;
 *   3. the reason a medication ended prints from the fixed list, while the
 *      free text a person typed still never leaves the app;
 *   4. the document carries no symptom, episode or day data at all — it is
 *      handed none, so nothing in it can read as a verdict on a medication.
 *
 * Read back from the real `generateTherapyPdf`, like its neighbours.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateTherapyPdf } from './pdf';
import { therapyRows, hasRememberedHistory } from './pdfMedicationHistory';
import { stopReasonLabel } from '$lib/blueprint/medications';
import { epilepsy } from '$lib/blueprint/presets';
import type { Blueprint, MedicationSlot } from '$lib/blueprint';
import de from '$lib/i18n/de';

const captured = vi.hoisted(() => ({ outputs: [] as string[] }));
vi.mock('jspdf', async (importOriginal) => {
	const mod = await importOriginal<typeof import('jspdf')>();
	class CapturingPdf extends mod.jsPDF {
		constructor(...args: ConstructorParameters<typeof mod.jsPDF>) {
			super(...args);
			(this as unknown as { save: () => unknown }).save = () => {
				captured.outputs.push(this.output());
				return this;
			};
		}
	}
	return { ...mod, jsPDF: CapturingPdf, default: CapturingPdf };
});

const PDF_SRC = readFileSync(join(__dirname, 'pdf.ts'), 'utf8');

const t = (key: string, params?: Record<string, string | number>) => {
	let s = (de as Record<string, string>)[key] ?? key;
	for (const [k, v] of Object.entries(params ?? {})) s = s.replaceAll(`{${k}}`, String(v));
	return s;
};
const fmt = (iso: string) => iso.split('-').reverse().join('.');

/* ─── Fixture: two years of titration, and a drug given up before that ── */

/** Recorded from 01.06.2026, with 12 mg and 10 mg remembered before it. */
const fycompa: MedicationSlot = {
	id: 'fyc', name: 'Fycompa', dose: '8mg', schedule: 'abends', asNeeded: false,
	periods: [
		{ from: '2023-03-01', to: '2024-12-31', dose: '12mg', schedule: 'abends', reported: true, fromPrecision: 'month', toPrecision: 'month' },
		{ from: '2025-01-01', to: '2026-05-31', dose: '10mg', schedule: 'abends', reported: true, fromPrecision: 'month', toPrecision: 'month' },
		{ from: '2026-06-01', dose: '8mg', schedule: 'abends' },
	],
};
/** Tried and given up long before ciphra, with the person's own words on it. */
const levetiracetam: MedicationSlot = {
	id: 'lev', name: 'Levetiracetam', dose: '1000 mg', schedule: '2× täglich', asNeeded: false,
	periods: [{
		from: '2019-03-01', to: '2022-06-30', dose: '1000 mg', schedule: '2× täglich',
		reported: true, fromPrecision: 'month', toPrecision: 'month',
		stopReason: 'side_effects', endNote: 'Müdigkeit und Reizbarkeit',
	}],
};
const MEDS = [fycompa, levetiracetam];

const WIN_ANSI: Record<number, string> = { 0x85: '…', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x96: '–', 0x97: '—' };
function pdfTexts(raw: string): string[] {
	const out: string[] = [];
	for (const m of raw.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)) {
		const s = m[1].replace(/\\([()\\])/g, '$1');
		out.push([...s].map((ch) => WIN_ANSI[ch.charCodeAt(0)] ?? ch).join(''));
	}
	return out;
}

function therapyPdf(medications: MedicationSlot[] = MEDS) {
	captured.outputs.length = 0;
	const bp: Blueprint = { ...epilepsy, medications };
	generateTherapyPdf(bp, t, 'de-CH', 'anna');
	expect(captured.outputs).toHaveLength(1);
	return pdfTexts(captured.outputs[0]);
}

function today(date: Date) {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(date);
}
afterEach(() => vi.useRealTimers());

/* ─── 1. The rows ─────────────────────────────────────────────────────── */

describe('therapyRows', () => {
	const rows = therapyRows(MEDS, fmt, t, (r) => stopReasonLabel(r, t));

	it('is every dose period of every medication, oldest first', () => {
		expect(rows.map((r) => [r.name, r.period, r.regimen])).toEqual([
			['Levetiracetam', '03/2019 – 06/2022', '1000 mg · 2× täglich'],
			['Fycompa', '03/2023 – 12/2024', '12mg · abends'],
			['Fycompa', '01/2025 – 05/2026', '10mg · abends'],
			['Fycompa', `01.06.2026 – ${t('pdf.therapy_ongoing')}`, '8mg · abends'],
		]);
	});

	it('marks which periods were filled in from memory', () => {
		expect(rows.map((r) => r.remembered)).toEqual([true, true, true, false]);
		expect(hasRememberedHistory(MEDS)).toBe(true);
		expect(hasRememberedHistory([{ id: 'x', name: 'X', dose: '1', schedule: '', asNeeded: false }])).toBe(false);
	});

	it('carries the reason from the fixed list, never the typed one', () => {
		expect(rows[0].reason).toBe(de['medication.stop_reason_side_effects']);
		expect(rows.every((r) => !r.reason.includes('Müdigkeit'))).toBe(true);
	});

	it('says so when a start was never recorded', () => {
		const unknown = therapyRows(
			[{ id: 'x', name: 'Lamotrigin', dose: '50 mg', schedule: '', asNeeded: false }],
			fmt, t, (r) => stopReasonLabel(r, t),
		);
		expect(unknown[0].period).toBe(`${t('pdf.therapy_start_unknown')} – ${t('pdf.therapy_ongoing')}`);
	});
});

/* ─── 2. The document ─────────────────────────────────────────────────── */

describe('the treatment-history PDF', () => {
	it('spans the whole recorded therapy and lists every period', () => {
		today(new Date('2026-09-19T12:00:00'));
		const texts = therapyPdf();
		expect(texts).toContain(t('pdf.therapy_title', { range: '01.03.2019 – 19.09.2026' }));
		expect(texts).toContain('Levetiracetam');
		// Three dose periods in the table, plus its lane on the timeline strip.
		expect(texts.filter((x) => x === 'Fycompa').length).toBeGreaterThanOrEqual(3);
		expect(texts).toContain('03/2019 – 06/2022 *');
		expect(texts).toContain(de['medication.stop_reason_side_effects']);
	});

	it('states what applies today, so the history ends where the visit starts', () => {
		today(new Date('2026-09-19T12:00:00'));
		const texts = therapyPdf();
		expect(texts).toContain(t('pdf.therapy_current_title'));
		expect(texts.some((x) => x.startsWith('Fycompa 8mg') && x.includes('01.06.2026'))).toBe(true);
	});

	it('says the history is partly remembered, and marks which rows', () => {
		today(new Date('2026-09-19T12:00:00'));
		const texts = therapyPdf();
		expect(texts).toContain(t('pdf.therapy_provenance'));
		expect(texts.some((x) => x.startsWith('*') && x.includes(de['pdf.therapy_remembered']))).toBe(true);
	});

	it('never prints the reason a person typed', () => {
		today(new Date('2026-09-19T12:00:00'));
		expect(therapyPdf().join(' ')).not.toContain('Müdigkeit');
	});

	it('holds no symptom, episode or day data — it is handed none', () => {
		const body = PDF_SRC.slice(PDF_SRC.indexOf('export function generateTherapyPdf'));
		const fn = body.slice(0, body.indexOf('\nexport function '));
		expect(fn).not.toMatch(/documents|episode|symptom|daysLogged|adherence|reduce\(/i);
		// The signature takes a blueprint and a translator, nothing else.
		expect(fn.slice(0, fn.indexOf(')'))).not.toMatch(/CiphraDocument/);
	});

	it('still writes a document when no medication was ever recorded', () => {
		today(new Date('2026-09-19T12:00:00'));
		expect(therapyPdf([])).toContain(t('pdf.therapy_empty'));
	});
});
