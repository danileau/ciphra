/**
 * Medication dose history in the doctor PDF and the CSV (2026-09-16).
 *
 * Data prep only — the drawing stays inline in pdf.ts, like the other chart
 * primitives (pdfDailyMonthChart.ts, pdfCycleStrip.ts). Every function here is
 * pure so the report's medication content is testable without jsPDF.
 *
 * The rule these readers share with the rest of dose history: a change is a
 * step in time. Days before it keep the dose they had, and a medication that
 * was stopped stays in the record for the days it was taken.
 *
 * MARKERS ONLY. Nothing here compares symptoms or episodes before and after a
 * change, and nothing may. Placing a change on the time axis documents what
 * was recorded; stating what happened around it would be an assessment — the
 * line `pdf.no-assessment.test.ts` holds for the whole document.
 */
import type { MedicationSlot } from '$lib/blueprint/types';
import { addDaysISO, medicationChanges, medPeriods, periodOn, type MedChange } from '$lib/blueprint/medicationHistory';
import { medAdherenceByPeriod, type MedPeriodAdherence } from '$lib/blueprint/medications';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;
type DayDoc = { data?: Record<string, unknown> };

export interface DateWindow {
	/** Inclusive local `YYYY-MM-DD` bounds. */
	from: string;
	to: string;
}

/** "10 mg · 2× täglich" — the same regimen text Settings shows. */
export function regimenText(p: { dose?: string; schedule?: string } | undefined): string {
	return [p?.dose, p?.schedule].map((s) => (s ?? '').trim()).filter(Boolean).join(' · ');
}

/** Whole days from `fromISO` to `toISO` (negative when `toISO` is earlier).
 *  UTC arithmetic on the Y/M/D parts, so no DST switch can shift a day. */
export function daysBetweenISO(fromISO: string, toISO: string): number {
	const utc = (iso: string) => {
		const [y, m, d] = iso.split('-').map(Number);
		return Date.UTC(y, m - 1, d);
	};
	return Math.round((utc(toISO) - utc(fromISO)) / 86400000);
}

/** Was the medication part of the regimen on any day of the window? */
export function overlapsWindow(med: MedicationSlot, win: DateWindow): boolean {
	return medPeriods(med).some((p) => (!p.from || p.from <= win.to) && (!p.to || p.to >= win.from));
}

/* ─── 1. Adherence, one row per dose period ───────────────────────────── */

export interface AdherenceRow extends MedPeriodAdherence {
	med: MedicationSlot;
}

/**
 * Adherence rows for the doctor PDF: one per dose period overlapping the
 * window, for every medication — stopped ones included, since the days they
 * were taken are still in the window. A medication with no day in the window
 * yields no row. Medications keep their Settings order; periods run oldest
 * first.
 */
export function adherenceRowsForWindow(
	meds: MedicationSlot[],
	docs: DayDoc[],
	win: DateWindow,
): AdherenceRow[] {
	const rows: AdherenceRow[] = [];
	for (const med of meds) {
		for (const row of medAdherenceByPeriod(med, docs, win)) rows.push({ med, ...row });
	}
	return rows;
}

/** "01.09.2026 – 16.09.2026", or a single date for a one-day period. */
export function periodRangeText(
	from: string | null,
	to: string | null,
	format: (iso: string) => string,
): string {
	if (from && to) return from === to ? format(from) : `${format(from)} – ${format(to)}`;
	return from ? format(from) : to ? format(to) : '';
}

/* ─── 2. The changes table ────────────────────────────────────────────── */

export interface MedChangeRow {
	date: string;
	kind: MedChange['kind'];
	name: string;
	/** Neutral description of the step: what applied before → after. */
	change: string;
	/** The reason the user gave, verbatim; '' when none. */
	reason: string;
}

/**
 * Every start, dose change and stop taking effect inside the window, as
 * table rows. Wording is descriptive only ("Abgesetzt", "10 mg → 12 mg") —
 * never why it mattered or what followed.
 *
 * A switch records one reason on both halves (the stop of A and the start of
 * B). Printed twice on adjacent rows it reads as two separate decisions, so
 * the start row drops it when the stop row on the same day already carries
 * the identical text.
 */
export function medicationChangeRows(
	meds: MedicationSlot[],
	win: DateWindow,
	t: TranslateFn,
): MedChangeRow[] {
	const nameOf = (id: string | undefined) => (id ? meds.find((m) => m.id === id)?.name ?? '' : '');
	const changes = medicationChanges(meds, win);
	return changes.map((c) => {
		let change: string;
		if (c.kind === 'change') {
			change = t('pdf.med_change_dose', { before: regimenText(c.before), after: regimenText(c.after) });
		} else if (c.kind === 'start') {
			const regimen = regimenText(c.after) || '—';
			const replaced = nameOf(c.switchedFrom);
			change = replaced
				? t('pdf.med_change_start_switch', { regimen, name: replaced })
				: t('pdf.med_change_start', { regimen });
		} else {
			const next = nameOf(c.switchedTo);
			change = next ? t('pdf.med_change_stop_switch', { name: next }) : t('pdf.med_change_stop');
		}
		let reason = c.note?.trim() ?? '';
		if (c.kind === 'start' && c.switchedFrom && reason) {
			const stopHalf = changes.find(
				(o) => o.kind === 'stop' && o.medId === c.switchedFrom && o.date === c.date,
			);
			if (stopHalf?.note?.trim() === reason) reason = '';
		}
		return { date: c.date, kind: c.kind, name: c.name, change, reason };
	});
}

/* ─── 3. Marks on the daily chart ─────────────────────────────────────── */

export interface DayMedMark {
	/** Day of month, 1-based. */
	day: number;
	/** One short label per change that day ("Lamotrigin 12 mg"). */
	labels: string[];
}

/** The short on-chart label for one change: the medication and what applies
 *  from that day. A schedule-only change shows the schedule, since the dose
 *  alone would read as no change at all. */
export function medMarkLabel(c: MedChange, t: TranslateFn): string {
	if (c.kind === 'stop') return t('pdf.med_mark_stop', { name: c.name });
	const after = c.after ?? { dose: '', schedule: '' };
	const detail = c.kind === 'change' && c.before && c.before.dose.trim() === after.dose.trim()
		? after.schedule.trim() || after.dose.trim()
		: after.dose.trim() || after.schedule.trim();
	return detail ? `${c.name} ${detail}` : c.name;
}

/**
 * One mark per DAY that holds a medication change inside the month — the
 * same one-mark-per-day rule as the note markers on that chart. Several
 * changes on one day (a switch: A stops, B starts) share the mark and list
 * their labels in the order `medicationChanges` sorts them.
 */
export function medChangeMarksForMonth(
	meds: MedicationSlot[],
	year: number,
	month: number, // 0-based
	daysInMonth: number,
	t: TranslateFn,
): DayMedMark[] {
	const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
	const win = { from: `${prefix}-01`, to: `${prefix}-${String(daysInMonth).padStart(2, '0')}` };
	const byDay = new Map<number, string[]>();
	for (const c of medicationChanges(meds, win)) {
		const day = Number(c.date.slice(8, 10));
		const labels = byDay.get(day) ?? [];
		labels.push(medMarkLabel(c, t));
		byDay.set(day, labels);
	}
	return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, labels]) => ({ day, labels }));
}

export interface PlacedLabel {
	/** Row below the axis, 0 = closest. The tick is drawn in this row only. */
	row: number;
	/** Left edge of the label text. */
	x0: number;
	/** False when no row had room: draw the tick only. The changes table
	 *  still lists the change in full. */
	labelled: boolean;
}

/**
 * Greedy row packing for tick labels under a chart. Each mark is a short tick
 * at `x` with a label of `width` to its right — or to its left when it would
 * run past `xMax`. Tick and label occupy one interval of their row, so a mark
 * takes the first row where that interval touches no other. A mark that fits
 * in no row keeps a bare tick in the first row with room for the tick alone.
 * Marks must arrive sorted by `x`.
 */
export function layoutTickLabels(
	marks: Array<{ x: number; width: number }>,
	xMin: number,
	xMax: number,
	maxRows: number,
	gap = 1.5,
	pad = 0.9,
): PlacedLabel[] {
	const rows: Array<Array<[number, number]>> = Array.from({ length: Math.max(1, maxRows) }, () => []);
	const free = (row: number, a: number, b: number) =>
		rows[row].every(([s, e]) => b + gap <= s || a >= e + gap);
	const out: PlacedLabel[] = [];
	for (const m of marks) {
		let x0 = m.x + pad;
		if (x0 + m.width > xMax) x0 = Math.max(xMin, m.x - pad - m.width);
		const a = Math.min(m.x, x0);
		const b = Math.max(m.x, x0 + m.width);
		const row = rows.findIndex((_, r) => free(r, a, b));
		if (row >= 0) {
			rows[row].push([a, b]);
			out.push({ row, x0, labelled: true });
			continue;
		}
		const tickRow = Math.max(0, rows.findIndex((_, r) => free(r, m.x, m.x)));
		rows[tickRow].push([m.x, m.x]);
		out.push({ row: tickRow, x0, labelled: false });
	}
	return out;
}

/* ─── 4. The timeline strip ───────────────────────────────────────────── */

export interface TimelineSegment {
	/** Clipped to the window, inclusive. */
	from: string;
	to: string;
	dose: string;
	schedule: string;
	/** True when this segment starts inside the window straight after the
	 *  previous period ended — a dose/schedule change, drawn as a boundary. */
	changeAtStart: boolean;
}

export interface TimelineLane {
	med: MedicationSlot;
	segments: TimelineSegment[];
}

/** One lane per medication taken on any day of the window, each holding its
 *  periods clipped to the window. Gaps between segments are days it was not
 *  taken (stopped, or before its start). */
export function medicationTimeline(meds: MedicationSlot[], win: DateWindow): TimelineLane[] {
	const lanes: TimelineLane[] = [];
	for (const med of meds) {
		const periods = medPeriods(med);
		const segments: TimelineSegment[] = [];
		periods.forEach((p, i) => {
			if (p.from && p.from > win.to) return;
			if (p.to && p.to < win.from) return;
			const from = !p.from || p.from < win.from ? win.from : p.from;
			const to = !p.to || p.to > win.to ? win.to : p.to;
			const prev = i > 0 ? periods[i - 1] : null;
			const changeAtStart = !!(
				prev?.to && p.from && p.from > win.from && addDaysISO(prev.to, 1) === p.from
			);
			segments.push({ from, to, dose: p.dose, schedule: p.schedule, changeAtStart });
		});
		if (segments.length > 0) lanes.push({ med, segments });
	}
	return lanes;
}

/* ─── 5. CSV: the dose of the day ─────────────────────────────────────── */

/** Scheduled medications taken on any day of the export: one CSV column
 *  each. As-needed medications keep their intake-count columns instead. */
export function csvDoseMedications(meds: MedicationSlot[], win: DateWindow): MedicationSlot[] {
	return meds.filter((m) => !m.asNeeded && overlapsWindow(m, win));
}

/**
 * The CSV cell for one scheduled medication on one day:
 *  - `missedWord` when an entry that day marks the dose as missed;
 *  - otherwise the dose that applied that day (`periodOn`), so a titration
 *    reads as a step down the column;
 *  - '' on a day the medication was not part of the regimen.
 * A period with no dose text falls back to its schedule, then to
 * `takenWord`, so a regimen day never looks like an empty one.
 */
export function csvDoseCell(
	med: MedicationSlot,
	dayISO: string,
	dayEntries: DayDoc[],
	missedWord: string,
	takenWord: string,
): string {
	const missed = dayEntries.some((d) => {
		const m = d.data?.missedMedications;
		return Array.isArray(m) && m.includes(med.id);
	});
	if (missed) return missedWord;
	const period = periodOn(med, dayISO);
	if (!period) return '';
	return period.dose.trim() || period.schedule.trim() || takenWord;
}
