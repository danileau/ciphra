/**
 * Before/after STRUCTURE for a medication change in the doctor PDF
 * (2026-09-17).
 *
 * Operator decisions this suite pins:
 *   1. A dose change is a step in time. The charts shade the dose periods of
 *      the medication that changed, draw a boundary at the change and label
 *      each period with its dose — the doctor compares by eye.
 *   2. Structure, never numbers or verdicts: no per-period count, rate,
 *      average, delta or better/worse wording anywhere
 *      (pdf.no-assessment.test.ts holds the vocabulary).
 *   3. Page 1 states the regimen on the report's end date (clipped to today):
 *      "seit" only for a recorded start, "vorher" only after a change.
 *   4. The day-by-day grid marks the day a medication started, changed or
 *      stopped, without touching the day rows' columns.
 *   5. The reason typed for a change never reaches the PDF.
 *
 * Behaviour is read back from the real `generateDoctorPdf` (jsPDF's `save`
 * intercepted, text operators decoded), like pdf.medication-history.test.ts.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateDoctorPdf } from './pdf';
import { doseBandLayer, gridChangeMarksForMonth, medicationsOnDate } from './pdfMedicationHistory';
import { dayBins, monthBins } from '$lib/reports/doseBands';
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
const ddmmyyyy = (iso: string) => iso.split('-').reverse().join('.');

/* ─── Fixture: a September 2026 with a titration, a switch, a stop ────── */

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
const valproat: MedicationSlot = {
	id: 'old', name: 'Valproat', dose: '300 mg', schedule: 'abends', asNeeded: false,
	periods: [{ from: '2024-01-01', to: '2024-06-30', dose: '300 mg', schedule: 'abends' }],
};
const midazolam: MedicationSlot = { id: 'midazolam_buccal', name: 'Midazolam', dose: '5 mg', schedule: '', asNeeded: true };

const MEDS = [lamotrigin, levetiracetam, brivaracetam, valproat, midazolam];
const SEP = { from: '2026-09-01', to: '2026-09-30' };

const entry = (date: string, extra: Record<string, unknown> = {}) => ({
	id: Number(date.replaceAll('-', '')), serverCreatedAt: '', data: { type: 'entry', date, ...extra },
});
const SEPTEMBER = [
	entry('2026-09-02'), entry('2026-09-08'), entry('2026-09-11', { episodes: { focal: 1 } }),
	entry('2026-09-14'), entry('2026-09-20'), entry('2026-09-25', { symptoms: { tired: true } }),
];
const JANUARY = [entry('2026-01-06'), entry('2026-01-13', { episodes: { focal: 1 } })];

/* ─── Reading the generated PDF ───────────────────────────────────────── */

const WIN_ANSI: Record<number, string> = { 0x85: '…', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x96: '–', 0x97: '—' };
function pdfTexts(raw: string): string[] {
	const out: string[] = [];
	for (const m of raw.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)) {
		const s = m[1].replace(/\\([()\\])/g, '$1');
		out.push([...s].map((ch) => WIN_ANSI[ch.charCodeAt(0)] ?? ch).join(''));
	}
	return out;
}
function doctorPdf(scope: 'month' | 'year', month: number, docs: unknown[], medications: MedicationSlot[] = MEDS) {
	captured.outputs.length = 0;
	const bp: Blueprint = { ...epilepsy, medications };
	generateDoctorPdf(bp, docs as never, 2026, month, t, 'de-CH', 'anna', scope);
	expect(captured.outputs).toHaveLength(1);
	return { raw: captured.outputs[0], texts: pdfTexts(captured.outputs[0]) };
}
/** Index where `seq` occurs as consecutive texts, or -1. */
function indexOfRun(texts: string[], seq: string[]): number {
	for (let i = 0; i + seq.length <= texts.length; i++) {
		if (seq.every((s, k) => texts[i + k] === s)) return i;
	}
	return -1;
}

/** The report's "today": after the window, so nothing is clipped unless a
 *  test says so. */
function today(date: Date) {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(date);
}
afterEach(() => vi.useRealTimers());

/* ─── 1. Dose bands ───────────────────────────────────────────────────── */

describe('dose bands on the charts', () => {
	it('shade the most recently changed medication: one label per period, the name once', () => {
		const layer = doseBandLayer(MEDS, dayBins(2026, 8), t);
		expect(layer?.med.id).toBe('lam');
		expect(layer?.bands.map((b) => [b.dose, b.start, b.end])).toEqual([
			['50 mg', -0.5, 8.5],
			['75 mg', 8.5, 22.5],
			['100 mg', 22.5, 29.5],
		]);
		expect(layer?.boundaries.map((b) => b.change.date)).toEqual(['2026-09-10', '2026-09-24']);
		expect(layer?.labels.map((l) => l.text)).toEqual(['Lamotrigin 50 mg', '75 mg', '100 mg']);
		// Levetiracetam and Brivaracetam changed too — the chart must say whose.
		expect(layer?.othersChanged).toBe(true);
	});

	it('are absent on an axis where nothing changed', () => {
		expect(doseBandLayer(MEDS, dayBins(2026, 0), t)).toBeNull();
		expect(doseBandLayer([midazolam, valproat], monthBins(2025, 9, 12), t)).toBeNull();
	});

	it('a stop leaves the rest of the axis unshaded and says so', () => {
		const layer = doseBandLayer([levetiracetam], dayBins(2026, 8), t);
		expect(layer?.bands.map((b) => [b.start, b.end])).toEqual([[-0.5, 10.5]]);
		expect(layer?.labels.map((l) => l.text)).toEqual(['Levetiracetam 500 mg', 'abgesetzt']);
		expect(layer?.othersChanged).toBe(false);
	});

	it('a schedule-only change is labelled with the schedule', () => {
		const med: MedicationSlot = {
			id: 'x', name: 'Lamotrigin', dose: '50 mg', schedule: '3× täglich', asNeeded: false,
			periods: [
				{ to: '2026-09-04', dose: '50 mg', schedule: '2× täglich' },
				{ from: '2026-09-05', dose: '50 mg', schedule: '3× täglich' },
			],
		};
		expect(doseBandLayer([med], dayBins(2026, 8), t)?.labels.map((l) => l.text)).toEqual(['Lamotrigin 50 mg', '3× täglich']);
	});

	it('the month PDF labels the periods above the daily chart and names the shaded medication', () => {
		today(new Date(2026, 9, 5, 12));
		const { texts } = doctorPdf('month', 8, SEPTEMBER);
		const run = indexOfRun(texts, ['Lamotrigin 50 mg', '75 mg', '100 mg']);
		expect(run).toBeGreaterThan(texts.indexOf(t('pdf.daily_month_chart_title', { month: 'September 2026' })));
		expect(texts).toContain(t('pdf.dose_band_caption', { name: 'Lamotrigin' }));
		// The other medications' steps keep their ticks under the axis.
		expect(texts).toContain('Levetiracetam abgesetzt, Brivaracetam 50 mg');
	});

	it('the shaded medication is not marked twice: its steps are the boundaries, not ticks', () => {
		today(new Date(2026, 9, 5, 12));
		const { texts } = doctorPdf('month', 8, SEPTEMBER, [lamotrigin]);
		expect(indexOfRun(texts, ['Lamotrigin 50 mg', '75 mg', '100 mg'])).toBeGreaterThan(-1);
		expect(texts).not.toContain(t('pdf.legend_med_change_day'));
		// One medication changed: the labels already name it, no caption.
		expect(texts.some((s) => s.startsWith('Hintergrund:'))).toBe(false);
	});

	it('the year PDF shades the trajectory and every vital trend on the same axis', () => {
		today(new Date(2026, 9, 5, 12));
		const docs = [...JANUARY, ...SEPTEMBER, entry('2026-03-03'), entry('2026-05-05')].map((d, i) => ({
			...d, data: { ...d.data, vitals: { sleep_hours: String(6 + (i % 3)) } },
		}));
		const { texts } = doctorPdf('year', 8, docs);
		const trajectory = texts.indexOf(t('pdf.episode_trend_range', { range: 'Okt. 2025 – Sept. 2026' }));
		expect(trajectory).toBeGreaterThan(-1);
		const runs = texts.filter((_, i) => indexOfRun(texts.slice(i, i + 3), ['Lamotrigin 50 mg', '75 mg', '100 mg']) === 0);
		// The trajectory plus the sleep-hours trend.
		expect(runs.length).toBe(2);
		expect(indexOfRun(texts, ['Lamotrigin 50 mg', '75 mg', '100 mg'])).toBeGreaterThan(trajectory);
		expect(texts).toContain(t('pdf.dose_band_caption', { name: 'Lamotrigin' }));
	});

	it('a month with no change renders no band, label or caption', () => {
		today(new Date(2026, 9, 5, 12));
		const { texts } = doctorPdf('month', 0, JANUARY);
		expect(texts).not.toContain('75 mg');
		expect(texts.some((s) => s.startsWith('Hintergrund:'))).toBe(false);
	});

	it('every chart draws through the shared geometry, in its own point math', () => {
		// Geometry lives in reports/doseBands.ts, shared with /reports.
		expect(PDF_SRC).toContain("from '$lib/reports/doseBands'");
		expect(PDF_SRC).toMatch(/doseBandLayer\(reportMeds, dayBins\(year, month\), t\)/);
		expect(PDF_SRC).toMatch(/monthBins\(monthBuckets\[0\]\.y, monthBuckets\[0\]\.m, MONTHS\)/);
		// Points: daily i/(N−1), trajectory + trend lines i/(MONTHS−1), bars at slot centres.
		expect(PDF_SRC).toMatch(/\(u\) => chartX \+ \(u \/ Math\.max\(1, daysInMonth - 1\)\) \* chartW/);
		expect(PDF_SRC).toMatch(/\(u\) => chartX \+ \(u \/ Math\.max\(1, MONTHS - 1\)\) \* chartW/);
		expect(PDF_SRC).toMatch(/\(u\) => cx \+ \(u \+ 0\.5\) \* barSlotW/);
		// A null layer draws nothing and moves nothing.
		for (const fn of ['drawDoseBandFills', 'drawDoseBandMarks']) {
			const i = PDF_SRC.indexOf(`function ${fn}`);
			expect(PDF_SRC.slice(i, i + 200), fn).toMatch(/if \(!plan\) return;/);
		}
		expect(PDF_SRC).toMatch(/if \(!layer\) return null;/);
	});
});

/* ─── 2. Page 1: the regimen on the end date ──────────────────────────── */

describe('page 1 states the medication on the report end date', () => {
	it('titrated, started (switch), as-needed and stopped, in neutral words', () => {
		expect(medicationsOnDate(MEDS, SEP, '2026-09-30', ddmmyyyy, t)).toEqual([
			'Lamotrigin 100 mg · seit 24.09.2026 (vorher 75 mg)',
			'Brivaracetam 50 mg · seit 12.09.2026',
			'Midazolam 5 mg · bei Bedarf',
			'Levetiracetam · abgesetzt ab 12.09.2026',
		]);
	});

	it('"seit" only for a recorded start, "vorher" only after a change', () => {
		const aug = { from: '2026-08-01', to: '2026-08-31' };
		expect(medicationsOnDate([lamotrigin, levetiracetam], aug, '2026-08-31', ddmmyyyy, t)).toEqual([
			'Lamotrigin 50 mg',
			'Levetiracetam 500 mg · seit 01.11.2025',
		]);
	});

	it('a schedule-only change states the schedule on both sides', () => {
		const med: MedicationSlot = {
			id: 'x', name: 'Lamotrigin', dose: '50 mg', schedule: '3× täglich', asNeeded: false,
			periods: [
				{ to: '2026-09-04', dose: '50 mg', schedule: '2× täglich' },
				{ from: '2026-09-05', dose: '50 mg', schedule: '3× täglich' },
			],
		};
		expect(medicationsOnDate([med], SEP, '2026-09-30', ddmmyyyy, t)).toEqual([
			'Lamotrigin 50 mg · 3× täglich · seit 05.09.2026 (vorher 2× täglich)',
		]);
	});

	it('the PDF prints the block on page 1, above the chart', () => {
		today(new Date(2026, 9, 5, 12));
		const { texts } = doctorPdf('month', 8, SEPTEMBER);
		const head = texts.indexOf(t('pdf.meds_on_date', { date: '30.09.2026' }).toUpperCase());
		expect(head).toBeGreaterThan(-1);
		for (const line of [
			'Lamotrigin 100 mg · seit 24.09.2026 (vorher 75 mg)',
			'Brivaracetam 50 mg · seit 12.09.2026',
			'Levetiracetam · abgesetzt ab 12.09.2026',
		]) {
			expect(texts.indexOf(line), line).toBeGreaterThan(head);
		}
		expect(head).toBeLessThan(texts.indexOf(t('pdf.daily_month_chart_title', { month: 'September 2026' })));
		expect(texts.some((s) => s.startsWith('Valproat'))).toBe(false);
	});

	it('clips the end date to today: a report of the running month states today', () => {
		today(new Date(2026, 8, 17, 12));
		const { texts } = doctorPdf('month', 8, SEPTEMBER);
		expect(texts).toContain(t('pdf.meds_on_date', { date: '17.09.2026' }).toUpperCase());
		expect(texts).toContain('Lamotrigin 75 mg · seit 10.09.2026 (vorher 50 mg)');
	});

	it('uses the date format setting', () => {
		expect(PDF_SRC).toMatch(/const fmtDay = \(iso: string\) => formatISODateChoice\(iso, blueprint\.dateFormat\)/);
	});
});

/* ─── 3. The day-by-day grid ──────────────────────────────────────────── */

describe('the grid marks the change day', () => {
	it('one row label per change day; a switch lists both halves', () => {
		expect(gridChangeMarksForMonth(MEDS, 2026, 8, 30, t)).toEqual([
			{ day: 10, labels: ['Lamotrigin: 50 mg → 75 mg'] },
			{ day: 12, labels: ['Levetiracetam: Abgesetzt · Wechsel auf Brivaracetam', 'Brivaracetam: Beginn · 50 mg'] },
			{ day: 24, labels: ['Lamotrigin: 75 mg → 100 mg'] },
		]);
	});

	it('prints the label directly above the day the change took effect', () => {
		today(new Date(2026, 9, 5, 12));
		const { raw, texts } = doctorPdf('month', 8, SEPTEMBER);
		// The arrow is drawn, not printed (Helvetica has none): its gap stays.
		const titration = texts.findIndex((s) => /^Lamotrigin: 50 mg\s{3,}75 mg$/.test(s));
		expect(titration).toBeGreaterThan(-1);
		expect(texts[titration + 1]).toBe('10');
		const sw = texts.indexOf('Levetiracetam: Abgesetzt · Wechsel auf Brivaracetam;   Brivaracetam: Beginn · 50 mg');
		expect(sw).toBeGreaterThan(-1);
		expect(texts[sw + 1]).toBe('12');
		expect(raw).not.toContain('!\x92');
		// The day rows and the totals are all still there, in order.
		const grid = texts.lastIndexOf(t('pdf.day'));
		let pos = grid;
		for (let day = 1; day <= 30; day++) {
			pos = texts.indexOf(String(day), pos + 1);
			expect(pos, `day ${day}`).toBeGreaterThan(grid);
		}
		expect(titration).toBeGreaterThan(grid);
		expect(texts.indexOf(t('pdf.totals'), grid)).toBeGreaterThan(sw);
	});

	it('a month without a change has no change row', () => {
		today(new Date(2026, 9, 5, 12));
		const { texts } = doctorPdf('month', 0, JANUARY);
		expect(texts.some((s) => /^[A-Za-z]+: (Beginn|Abgesetzt)|^Lamotrigin: /.test(s))).toBe(false);
	});

	it('the change row is not a day: day marks and totals index by the row map', () => {
		const i = PDF_SRC.indexOf('function drawGridSection');
		const fn = PDF_SRC.slice(i, PDF_SRC.indexOf('\n}\n', i));
		expect(fn).toMatch(/colSpan: allHeaders\.length/);
		expect(fn).toMatch(/const isTotals = rowIdx === totalsRowIdx;/);
		expect(fn).toMatch(/const day = rowDay\[data\.row\.index\];/);
		expect(fn, 'entry notes are back in the grid').not.toMatch(/data\??\.notes/);
	});
});

/* ─── 4. Typed reasons stay on the device ─────────────────────────────── */

describe('the reason typed for a change is never printed', () => {
	for (const [scope, month] of [['month', 8], ['year', 8]] as const) {
		it(`${scope}: not on page 1, the charts, the tables or the grid`, () => {
			today(new Date(2026, 9, 5, 12));
			const all = doctorPdf(scope, month, SEPTEMBER).texts.join('\n');
			expect(all).not.toContain('Aufdosierung laut Dr. M.');
			expect(all).not.toContain('Müdigkeit');
		});
	}
});
