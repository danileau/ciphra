/**
 * Medication dose history in the doctor PDF and the CSV (2026-09-16).
 *
 * Before dose history, the PDF printed one adherence row per medication at
 * its CURRENT dose for the whole window — a titration from 50 to 75 mg in the
 * middle of September read as "75 mg" on every day of it — and the CSV had no
 * scheduled-medication column at all.
 *
 * Three product rules are pinned here:
 *   1. A change is a step in time: every surface reads the dose of the day.
 *   2. Stopped medications stay in the record for the days they were taken.
 *   3. Markers only. The PDF places a change on the time axis; it never sets
 *      symptoms or episodes before a change beside those after it. Per-event
 *      marks go on the DAILY chart only, never on the monthly trajectory.
 *
 * The behavioural half drives the real `generateDoctorPdf` / `exportCsv` with
 * jsPDF's `save` intercepted, and reads the text operators out of the
 * uncompressed PDF. The source-shape half follows the other pdf.*.test.ts
 * suites for the rules that have no observable output of their own.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateDoctorPdf, exportCsv } from './pdf';
import {
	adherenceRowsForWindow,
	csvDoseCell,
	csvDoseMedications,
	layoutTickLabels,
	medChangeMarksForMonth,
	medicationChangeRows,
	medicationTimeline,
	periodRangeText,
} from './pdfMedicationHistory';
import { epilepsy } from '$lib/blueprint/presets';
import type { Blueprint, MedicationSlot } from '$lib/blueprint';
import de from '$lib/i18n/de';
import en from '$lib/i18n/en';
import fr from '$lib/i18n/fr';
import itDict from '$lib/i18n/it';

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
const HELPER_SRC = readFileSync(join(__dirname, 'pdfMedicationHistory.ts'), 'utf8');

const t = (key: string, params?: Record<string, string | number>) => {
	let s = (de as Record<string, string>)[key] ?? key;
	for (const [k, v] of Object.entries(params ?? {})) s = s.replaceAll(`{${k}}`, String(v));
	return s;
};

/* ─── Fixture: a September 2026 with a titration and a switch ─────────── */

const lamotrigin: MedicationSlot = {
	id: 'lam', name: 'Lamotrigin', dose: '100 mg', schedule: '2× täglich', asNeeded: false,
	periods: [
		{ to: '2026-09-09', dose: '50 mg', schedule: '2× täglich' },
		{ from: '2026-09-10', to: '2026-09-23', dose: '75 mg', schedule: '2× täglich', note: 'Aufdosierung laut Dr. M.' },
		{ from: '2026-09-24', dose: '100 mg', schedule: '2× täglich' },
	],
};
const levetiracetam: MedicationSlot = {
	id: 'lev', name: 'Levetiracetam', dose: '500 mg', schedule: 'morgens, abends', asNeeded: false,
	periods: [{ from: '2025-11-01', to: '2026-09-11', dose: '500 mg', schedule: 'morgens, abends', endNote: 'Müdigkeit', switchedTo: 'bri' }],
};
const brivaracetam: MedicationSlot = {
	id: 'bri', name: 'Brivaracetam', dose: '50 mg', schedule: '2× täglich', asNeeded: false,
	periods: [{ from: '2026-09-12', dose: '50 mg', schedule: '2× täglich', note: 'Müdigkeit', switchedFrom: 'lev' }],
};
const stoppedLongAgo: MedicationSlot = {
	id: 'old', name: 'Valproat', dose: '300 mg', schedule: 'abends', asNeeded: false,
	periods: [{ from: '2024-01-01', to: '2024-06-30', dose: '300 mg', schedule: 'abends' }],
};
const midazolam: MedicationSlot = { id: 'midazolam_buccal', name: 'Midazolam', dose: '5 mg', schedule: '', asNeeded: true };

const MEDS = [lamotrigin, levetiracetam, brivaracetam, stoppedLongAgo, midazolam];
const bp = (medications: MedicationSlot[] = MEDS): Blueprint => ({ ...epilepsy, medications });

const entry = (date: string, extra: Record<string, unknown> = {}) => ({
	id: Number(date.replaceAll('-', '')), serverCreatedAt: '', data: { type: 'entry', date, ...extra },
});
const SEPTEMBER = [
	entry('2026-09-02'), entry('2026-09-05', { missedMedications: ['lam'] }), entry('2026-09-08'),
	entry('2026-09-11', { episodes: { focal: 1 } }), entry('2026-09-14', { missedMedications: ['bri'] }),
	entry('2026-09-20'), entry('2026-09-25', { symptoms: { tired: true } }),
];
const JANUARY = [entry('2026-01-06'), entry('2026-01-13', { episodes: { focal: 1 } })];

const SEP = { from: '2026-09-01', to: '2026-09-30' };

/* ─── Reading the generated PDF ───────────────────────────────────────── */

// jsPDF writes standard-font text as WinAnsi bytes. Latin-1 covers ä/·/×;
// only the 0x80–0x9F block differs.
const WIN_ANSI: Record<number, string> = { 0x85: '…', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x96: '–', 0x97: '—' };
function pdfTexts(raw: string): string[] {
	const out: string[] = [];
	for (const m of raw.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)) {
		const s = m[1].replace(/\\([()\\])/g, '$1');
		out.push([...s].map((ch) => WIN_ANSI[ch.charCodeAt(0)] ?? ch).join(''));
	}
	return out;
}
function doctorPdf(scope: 'month' | 'year' | '2years', month: number, docs: unknown[], medications = MEDS) {
	captured.outputs.length = 0;
	generateDoctorPdf(bp(medications), docs as never, 2026, month, t, 'de-CH', 'anna', scope);
	expect(captured.outputs).toHaveLength(1);
	return { raw: captured.outputs[0], texts: pdfTexts(captured.outputs[0]) };
}

/* ─── 1. Adherence per dose period ────────────────────────────────────── */

describe('adherence splits by dose period', () => {
	it('a titration inside the window is one row per dose, each with its own days', () => {
		const rows = adherenceRowsForWindow([lamotrigin], SEPTEMBER, SEP);
		expect(rows.map((r) => [r.period.dose, r.from, r.to, r.taken, r.total])).toEqual([
			['50 mg', '2026-09-01', '2026-09-09', 2, 3],
			['75 mg', '2026-09-10', '2026-09-23', 3, 3],
			['100 mg', '2026-09-24', '2026-09-30', 1, 1],
		]);
	});

	it('a medication stopped inside the window keeps its rows; one stopped before it has none', () => {
		const rows = adherenceRowsForWindow(MEDS, SEPTEMBER, SEP);
		const names = rows.map((r) => r.med.name);
		expect(names).toContain('Levetiracetam');
		expect(names).not.toContain('Valproat');
		const lev = rows.find((r) => r.med.id === 'lev');
		expect([lev?.from, lev?.to]).toEqual(['2026-09-01', '2026-09-11']);
	});

	it('the date range prints in the chosen format, a single day once', () => {
		const f = (iso: string) => iso.split('-').reverse().join('.');
		expect(periodRangeText('2026-09-01', '2026-09-09', f)).toBe('01.09.2026 – 09.09.2026');
		expect(periodRangeText('2026-09-09', '2026-09-09', f)).toBe('09.09.2026');
	});

	it('the PDF prints each period as its own row, dated', () => {
		const { texts } = doctorPdf('month', 8, SEPTEMBER);
		for (const s of ['Lamotrigin 50 mg', 'Lamotrigin 75 mg', 'Lamotrigin 100 mg', 'Levetiracetam 500 mg', 'Brivaracetam 50 mg']) {
			expect(texts, s).toContain(s);
		}
		expect(texts).toContain('01.09.2026 – 09.09.2026');
		expect(texts).toContain('10.09.2026 – 23.09.2026');
		// Each dose sits directly above its own dates.
		expect(texts.indexOf('01.09.2026 – 09.09.2026')).toBe(texts.indexOf('Lamotrigin 50 mg') + 1);
		// A medication stopped in 2024 is not in a September 2026 report.
		expect(texts.some((s) => s.startsWith('Valproat'))).toBe(false);
	});

	it('the section stays hidden when no medication was taken in the window', () => {
		const { texts } = doctorPdf('month', 8, SEPTEMBER, [stoppedLongAgo]);
		expect(texts).not.toContain(t('pdf.medication_adherence'));
	});

	it('uses the date format setting for the range, like every other day-precision date', () => {
		expect(PDF_SRC).toMatch(/periodRangeText\(r\.from, r\.to, \(iso\) => formatISODateChoice\(iso, blueprint\.dateFormat\)\)/);
	});
});

/* ─── 2. The changes table ────────────────────────────────────────────── */

describe('the medication changes section', () => {
	it('lists every start, change and stop in the window, in neutral words', () => {
		const rows = medicationChangeRows(MEDS, SEP, t);
		expect(rows.map((r) => [r.date, r.name, r.change])).toEqual([
			['2026-09-10', 'Lamotrigin', '50 mg · 2× täglich → 75 mg · 2× täglich'],
			['2026-09-12', 'Levetiracetam', 'Abgesetzt · Wechsel auf Brivaracetam'],
			['2026-09-12', 'Brivaracetam', 'Beginn · 50 mg · 2× täglich (ersetzt Levetiracetam)'],
			['2026-09-24', 'Lamotrigin', '75 mg · 2× täglich → 100 mg · 2× täglich'],
		]);
	});

	it('a plain start and stop read "Beginn" / "Abgesetzt"', () => {
		const rows = medicationChangeRows([stoppedLongAgo], { from: '2024-01-01', to: '2024-12-31' }, t);
		expect(rows.map((r) => r.change)).toEqual(['Beginn · 300 mg · abends', 'Abgesetzt']);
	});

	it('appears in the PDF with its rows when the window holds a change', () => {
		const { texts } = doctorPdf('month', 8, SEPTEMBER);
		expect(texts).toContain(t('pdf.medication_changes'));
		expect(texts).toContain(t('pdf.med_changes_provenance'));
		expect(texts).toContain('Abgesetzt · Wechsel auf Brivaracetam');
	});

	it('never prints the reason a person typed — free text leaves the device only by explicit choice', () => {
		const { texts } = doctorPdf('month', 8, SEPTEMBER);
		const all = texts.join('\n');
		expect(all).not.toContain('Aufdosierung laut Dr. M.');
		expect(all).not.toContain('Müdigkeit');
	});

	it('is absent when nothing changed in the window', () => {
		const { texts } = doctorPdf('month', 0, JANUARY);
		expect(texts).not.toContain(t('pdf.medication_changes'));
		// …while the adherence table still reports the regimen of that month.
		expect(texts).toContain(t('pdf.medication_adherence'));
		expect(texts).toContain('Lamotrigin 50 mg');
	});

	it('draws the arrow instead of printing a glyph Helvetica does not have', () => {
		// A raw U+2192 comes out of jsPDF as the bytes 0x21 0x92 — "!'" on paper.
		const { raw, texts } = doctorPdf('month', 8, SEPTEMBER);
		expect(raw).not.toContain('!\x92');
		expect(texts.some((s) => s.includes('→'))).toBe(false);
		expect(texts.some((s) => /50 mg · 2× täglich\s{3,}75 mg · 2× täglich/.test(s))).toBe(true);
	});
});

/* ─── 3. Marks on the daily chart ─────────────────────────────────────── */

describe('change marks on the daily chart', () => {
	it('one mark per day; a switch shares its day', () => {
		const marks = medChangeMarksForMonth(MEDS, 2026, 8, 30, t);
		expect(marks).toEqual([
			{ day: 10, labels: ['Lamotrigin 75 mg'] },
			{ day: 12, labels: ['Levetiracetam abgesetzt', 'Brivaracetam 50 mg'] },
			{ day: 24, labels: ['Lamotrigin 100 mg'] },
		]);
	});

	it('a schedule-only change is labelled with the schedule, not an unchanged dose', () => {
		const med: MedicationSlot = {
			id: 'x', name: 'Lamotrigin', dose: '50 mg', schedule: '3× täglich', asNeeded: false,
			periods: [
				{ to: '2026-09-04', dose: '50 mg', schedule: '2× täglich' },
				{ from: '2026-09-05', dose: '50 mg', schedule: '3× täglich' },
			],
		};
		expect(medChangeMarksForMonth([med], 2026, 8, 30, t)[0].labels).toEqual(['Lamotrigin 3× täglich']);
	});

	it('labels never overlap: a neighbour moves down a row, one with no room keeps a bare tick', () => {
		const placed = layoutTickLabels(
			[{ x: 50, width: 20 }, { x: 55, width: 20 }, { x: 60, width: 20 }, { x: 62, width: 20 }],
			20, 196, 3,
		);
		expect(placed.map((p) => [p.row, p.labelled])).toEqual([[0, true], [1, true], [2, true], [0, false]]);
		// Near the right edge the label flips to the left of its tick.
		const [edge] = layoutTickLabels([{ x: 190, width: 20 }], 20, 196, 3);
		expect(edge.x0 + 20).toBeLessThanOrEqual(190);
	});

	it('the month PDF draws the labels and explains the symbol', () => {
		const { texts } = doctorPdf('month', 8, SEPTEMBER);
		expect(texts).toContain('Lamotrigin 75 mg');
		expect(texts).toContain('Levetiracetam abgesetzt, Brivaracetam 50 mg');
		expect(texts).toContain(t('pdf.legend_med_change_day'));
	});

	it('drawDailyMonthChart owns the marks and the legend entry', () => {
		const i = PDF_SRC.indexOf('function drawDailyMonthChart');
		const fn = PDF_SRC.slice(i, PDF_SRC.indexOf('\n}\n', i));
		expect(fn).toContain('medMarks: DayMedMark[]');
		expect(fn).toContain("t('pdf.legend_med_change_day')");
		// A month whose only content is a change is not called empty either.
		expect(fn).toMatch(/dayMarks\.size === 0 && medMarks\.length === 0/);
	});

	it('the monthly trajectory gets no per-event medication marks', () => {
		const start = PDF_SRC.indexOf('// ── Chart: 24-month trajectory ──');
		const end = PDF_SRC.indexOf("} // end of `if (scope !== 'month')`");
		expect(start).toBeGreaterThan(0);
		const aggregate = PDF_SRC.slice(start, end);
		for (const sym of ['medChangeMarksForMonth', 'layoutTickLabels', 'medicationChanges', 'legend_med_change_day']) {
			expect(aggregate, `${sym} on an aggregate axis`).not.toContain(sym);
		}
		// And the year export prints no chart label or legend for a change.
		const { texts } = doctorPdf('year', 8, SEPTEMBER);
		expect(texts).not.toContain(t('pdf.legend_med_change_day'));
		expect(texts).not.toContain('Levetiracetam abgesetzt, Brivaracetam 50 mg');
	});
});

/* ─── 4. The timeline strip ───────────────────────────────────────────── */

describe('the medication timeline', () => {
	it('one lane per medication taken in the window, periods clipped, boundaries only at a change', () => {
		const lanes = medicationTimeline(MEDS, SEP);
		expect(lanes.map((l) => l.med.id)).toEqual(['lam', 'lev', 'bri', 'midazolam_buccal']);
		expect(lanes[0].segments.map((s) => [s.from, s.to, s.dose, s.changeAtStart])).toEqual([
			['2026-09-01', '2026-09-09', '50 mg', false],
			['2026-09-10', '2026-09-23', '75 mg', true],
			['2026-09-24', '2026-09-30', '100 mg', true],
		]);
		// A switch is a stop and a start, not a dose change inside one lane.
		expect(lanes[2].segments[0].changeAtStart).toBe(false);
	});

	it('renders on month and year scope when the window holds a change, and only then', () => {
		const title = (range: string) => t('pdf.medication_timeline_title', { range });
		expect(doctorPdf('month', 8, SEPTEMBER).texts.some((s) => s.startsWith(title('')))).toBe(true);
		expect(doctorPdf('year', 8, SEPTEMBER).texts.some((s) => s.startsWith(title('')))).toBe(true);
		expect(doctorPdf('month', 0, JANUARY).texts.some((s) => s.startsWith(title('')))).toBe(false);
	});
});

/* ─── 5. CSV: the dose of the day ─────────────────────────────────────── */

describe('CSV dose columns', () => {
	it('scheduled medications taken in the export get a column; as-needed and long-stopped ones do not', () => {
		expect(csvDoseMedications(MEDS, SEP).map((m) => m.id)).toEqual(['lam', 'lev', 'bri']);
	});

	it('the cell is the dose of that day, the missed word, or empty outside the regimen', () => {
		const cell = (med: MedicationSlot, day: string, docs = SEPTEMBER.filter((d) => d.data.date === day)) =>
			csvDoseCell(med, day, docs, 'ausgelassen', 'Genommen');
		expect(cell(lamotrigin, '2026-09-09')).toBe('50 mg');
		expect(cell(lamotrigin, '2026-09-10')).toBe('75 mg');
		expect(cell(lamotrigin, '2026-09-24')).toBe('100 mg');
		expect(cell(lamotrigin, '2026-09-05')).toBe('ausgelassen');
		expect(cell(levetiracetam, '2026-09-12')).toBe('');
		expect(cell(brivaracetam, '2026-09-11')).toBe('');
		const noDose: MedicationSlot = { id: 'n', name: 'N', dose: '', schedule: '', asNeeded: false };
		expect(cell(noDose, '2026-09-01')).toBe('Genommen');
	});

	describe('exportCsv', () => {
		let blob: Blob | null = null;
		const origCreate = URL.createObjectURL;
		const origRevoke = URL.revokeObjectURL;
		beforeEach(() => {
			blob = null;
			URL.createObjectURL = ((b: Blob) => { blob = b; return 'blob:test'; }) as typeof URL.createObjectURL;
			URL.revokeObjectURL = () => {};
			vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
		});
		afterEach(() => {
			URL.createObjectURL = origCreate;
			URL.revokeObjectURL = origRevoke;
			vi.restoreAllMocks();
		});
		const readBlob = () => new Promise<string>((resolve) => {
			const r = new FileReader();
			r.onload = () => resolve(String(r.result).replace(/^﻿/, ''));
			r.readAsText(blob as Blob);
		});

		it('carries the dose of the day across a change, and keeps the as-needed count column', async () => {
			exportCsv(bp(), SEPTEMBER as never, 2026, 8, t, 'de-CH', 'month');
			const [header, ...lines] = (await readBlob()).split('\n');
			const cols = header.split(',');
			const col = (label: string) => {
				const i = cols.indexOf(label);
				expect(i, `${label} column`).toBeGreaterThan(0);
				return i;
			};
			const lam = col('Lamotrigin — Dosis');
			const lev = col('Levetiracetam — Dosis');
			const bri = col('Brivaracetam — Dosis');
			col('Midazolam');
			expect(cols).not.toContain('Midazolam — Dosis');
			expect(cols).not.toContain('Valproat — Dosis');
			// Dose columns sit between the vitals and the as-needed counts.
			expect(lam).toBeLessThan(col('Midazolam'));

			const day = (n: number) => lines[n - 1].split(',');
			expect(lines).toHaveLength(30);
			expect(day(9)[lam]).toBe('50 mg');
			expect(day(10)[lam]).toBe('75 mg');
			expect(day(24)[lam]).toBe('100 mg');
			expect(day(5)[lam]).toBe(t('protocol.meds_missed_tag'));
			expect([day(11)[lev], day(12)[lev]]).toEqual(['500 mg', '']);
			expect([day(11)[bri], day(12)[bri], day(14)[bri]]).toEqual(['', '50 mg', t('protocol.meds_missed_tag')]);
			expect(day(12)[col('Midazolam')]).toBe('0');
		});
	});
});

/* ─── Markers only ────────────────────────────────────────────────────── */

describe('markers only — no before/after reading', () => {
	it('the medication readers never touch symptoms or episodes', () => {
		// Comments may explain the rule; code may not read the data it forbids.
		const code = HELPER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
		expect(code).not.toMatch(/episodes|symptoms|seizures/);
	});

	const DICTS: Array<[string, Record<string, string>]> = [['de', de], ['en', en], ['fr', fr], ['it', itDict]];
	const NEW_KEYS = [
		'pdf.medication_timeline_title', 'pdf.timeline_legend_period', 'pdf.timeline_legend_change',
		'pdf.timeline_legend_as_needed', 'pdf.medication_changes', 'pdf.med_changes_provenance',
		'pdf.med_change_col', 'pdf.med_change_dose', 'pdf.med_change_start',
		'pdf.med_change_start_switch', 'pdf.med_change_stop', 'pdf.med_change_stop_switch',
		'pdf.med_mark_stop', 'pdf.legend_med_change_day', 'pdf.csv_dose_col',
	];
	const EVALUATIVE = /besser|schlechter|wirk|erfolg|verbesser|verschlechter|better|worse|improv|effect|success|mieux|pire|amélior|efficac|miglior|peggior|effic/i;
	for (const [name, dict] of DICTS) {
		it(`${name}: the new strings exist and grade nothing`, () => {
			for (const k of NEW_KEYS) {
				expect(dict[k], `${name} ${k}`).toBeTruthy();
				expect(dict[k], `${name} ${k}`).not.toMatch(EVALUATIVE);
			}
		});
	}
});
