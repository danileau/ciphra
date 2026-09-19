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
 * STRUCTURE ONLY. Nothing here compares symptoms or episodes before and after
 * a change, and nothing may. Placing a change on the time axis — and shading
 * the dose periods behind a chart (2026-09-17) — documents what was recorded;
 * stating what happened around it would be an assessment — the line
 * `pdf.no-assessment.test.ts` holds for the whole document.
 */
import type { MedicationPeriod, MedicationSlot } from '$lib/blueprint/types';
import { addDaysISO, medIds, medicationChanges, medPeriods, periodOn, type MedChange } from '$lib/blueprint/medicationHistory';
import { medAdherenceByPeriod, stopReasonLabel, type MedPeriodAdherence } from '$lib/blueprint/medications';
import { doseBands, medsChangedIn, type AxisBin, type DoseBand, type DoseBoundary } from '$lib/reports/doseBands';

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
}

/**
 * Every start, dose change and stop taking effect inside the window, as
 * table rows. Wording is descriptive only ("Abgesetzt", "10 mg → 12 mg") —
 * never why it mattered or what followed.
 *
 * The reason a person typed for a change is deliberately NOT a column. It is
 * free text, and free text leaves the device only by explicit choice: entry
 * notes stay out of the PDF and CSV (#159), note markers need an opt-in at
 * export. The reason stays in the app (Settings history, /reports timeline).
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
		return { date: c.date, kind: c.kind, name: c.name, change };
	});
}

/* ─── 3. Marks on the daily chart ─────────────────────────────────────── */

export interface DayMedMark {
	/** Day of month, 1-based. */
	day: number;
	/** One short label per change that day ("Lamotrigin 12 mg"). */
	labels: string[];
}

/** The short form of a regimen: its dose — or its schedule when `other`
 *  carries the same dose, since the dose alone would read as no change. */
function regimenDetail(
	p: { dose?: string; schedule?: string } | undefined,
	other?: { dose?: string; schedule?: string } | null,
): string {
	const dose = (p?.dose ?? '').trim();
	const schedule = (p?.schedule ?? '').trim();
	if (other && (other.dose ?? '').trim() === dose) return schedule || dose;
	return dose || schedule;
}

/** The short on-chart label for one change: the medication and what applies
 *  from that day. A schedule-only change shows the schedule, since the dose
 *  alone would read as no change at all. */
export function medMarkLabel(c: MedChange, t: TranslateFn): string {
	if (c.kind === 'stop') return t('pdf.med_mark_stop', { name: c.name });
	const detail = regimenDetail(c.after, c.kind === 'change' ? c.before : null);
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

/* ─── 3b. Change rows in the day-by-day grid ──────────────────────────── */

/** The grid's label for one change: "Lamotrigin: 50 mg → 75 mg",
 *  "Brivaracetam: Beginn · 50 mg", "Levetiracetam: Abgesetzt". Short forms —
 *  the changes table carries the full regimen. The arrow is the one the
 *  changes table draws as a vector (pdf.ts `vectorArrowHooks`). */
export function gridChangeLabel(c: MedChange, meds: MedicationSlot[], t: TranslateFn): string {
	let text: string;
	if (c.kind === 'change') {
		text = t('pdf.med_change_dose', {
			before: regimenDetail(c.before, c.after) || '—',
			after: regimenDetail(c.after, c.before) || '—',
		});
	} else if (c.kind === 'start') {
		text = t('pdf.med_change_start', { regimen: regimenDetail(c.after) || '—' });
	} else {
		const next = c.switchedTo ? meds.find((m) => m.id === c.switchedTo)?.name : '';
		text = next ? t('pdf.med_change_stop_switch', { name: next }) : t('pdf.med_change_stop');
	}
	return `${c.name}: ${text}`;
}

/** One entry per DAY of the month that holds a start, change or stop, with
 *  the grid label of each change that day (a switch lists both halves). */
export function gridChangeMarksForMonth(
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
		byDay.set(day, [...(byDay.get(day) ?? []), gridChangeLabel(c, meds, t)]);
	}
	return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, labels]) => ({ day, labels }));
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
	const ids = medIds(med);
	const missed = dayEntries.some((d) => {
		const m = d.data?.missedMedications;
		return Array.isArray(m) && m.some((id) => ids.includes(id));
	});
	if (missed) return missedWord;
	const period = periodOn(med, dayISO);
	if (!period) return '';
	return period.dose.trim() || period.schedule.trim() || takenWord;
}

/* ─── 6. Dose bands behind a chart ────────────────────────────────────── */

export interface DoseBandLabel {
	/** Where the labelled period (or the stop) begins, in bin units. */
	at: number;
	text: string;
}

export interface DoseBandLayer {
	/** The shaded medication. */
	med: MedicationSlot;
	bands: DoseBand[];
	boundaries: DoseBoundary[];
	/** One per band, left to right, plus one per stop that leaves the rest of
	 *  the axis unshaded. The leftmost names the medication; the rest carry
	 *  the dose alone. */
	labels: DoseBandLabel[];
	/** Another medication changed on the same axis too — the chart must say
	 *  which one its background shows. */
	othersChanged: boolean;
}

/**
 * The before/after structure for one chart: the dose periods of the
 * medication that changed most recently inside the axis (`medsChangedIn`),
 * through the shared geometry in reports/doseBands.ts. Null when no
 * medication started, changed or stopped on the axis — that chart renders
 * exactly as it would without dose history.
 *
 * STRUCTURE ONLY. The doses and dates the person recorded; nothing counted
 * per period, nothing compared (pdf.no-assessment.test.ts).
 */
export function doseBandLayer(meds: MedicationSlot[], bins: AxisBin[], t: TranslateFn): DoseBandLayer | null {
	if (bins.length === 0) return null;
	const changed = medsChangedIn(meds, bins[0].from, bins[bins.length - 1].to);
	const med = changed[0];
	if (!med) return null;
	const { bands, boundaries } = doseBands(med, bins);
	if (bands.length === 0 && boundaries.length === 0) return null;

	const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
	const items: Array<{ at: number; detail: string | null }> = bands.map((b, i) => {
		const prev = i > 0 && near(bands[i - 1].end, b.start) ? bands[i - 1] : null;
		return { at: b.start, detail: regimenDetail(b, prev) };
	});
	for (const bd of boundaries) {
		if (bd.change.kind === 'stop' && !bands.some((b) => near(b.start, bd.at))) {
			items.push({ at: bd.at, detail: null });
		}
	}
	items.sort((a, b) => a.at - b.at);
	const labels: DoseBandLabel[] = [];
	items.forEach((item, i) => {
		let text: string;
		if (item.detail === null) {
			text = i === 0 ? t('pdf.med_mark_stop', { name: med.name }) : t('pdf.dose_band_stopped');
		} else {
			text = i === 0 ? [med.name, item.detail].filter(Boolean).join(' ') : item.detail;
		}
		if (text) labels.push({ at: item.at, text });
	});
	return { med, bands, boundaries, labels, othersChanged: changed.length > 1 };
}

/* ─── 7. Page 1: the regimen on the report's end date ─────────────────── */

/** The period `p` directly follows — present only when `p` began with a
 *  change, not a start. */
function periodBefore(med: MedicationSlot, p: MedicationPeriod): MedicationPeriod | null {
	const periods = medPeriods(med);
	const i = periods.findIndex((q) => q.from === p.from && q.to === p.to);
	const prev = i > 0 ? periods[i - 1] : null;
	return prev?.to && p.from && addDaysISO(prev.to, 1) === p.from ? prev : null;
}

/**
 * One line per medication for page 1, as of `asOf` (the report window's end,
 * clipped to today by the caller):
 *   - taken that day: "Lamotrigin 100 mg · seit 24.09.2026 (vorher 75 mg)" —
 *     "seit" only when the period's start is recorded, "vorher" only when the
 *     period began with a change;
 *   - stopped inside the window: "Levetiracetam · abgesetzt ab 12.09.2026".
 * Taken first, then stopped, each in Settings order. Neutral facts only; the
 * reason typed for a change never appears.
 */
export function medicationsOnDate(
	meds: MedicationSlot[],
	win: DateWindow,
	asOf: string,
	format: (iso: string) => string,
	t: TranslateFn,
): string[] {
	const taken: string[] = [];
	const stopped: string[] = [];
	for (const med of meds) {
		const p = periodOn(med, asOf);
		if (p) {
			const prev = periodBefore(med, p);
			// A schedule-only change states the schedule on both sides.
			const now = prev && prev.dose.trim() === p.dose.trim() ? regimenText(p) : regimenDetail(p);
			const parts = [[med.name, now].filter(Boolean).join(' ')];
			if (med.asNeeded) parts.push(t('pdf.med_now_as_needed'));
			if (p.from) {
				const since = t('pdf.med_now_since', { date: historyDateText(p.from, p.fromPrecision, format) });
				const before = prev ? regimenDetail(prev, p) : '';
				parts.push(before ? `${since} ${t('pdf.med_now_before', { regimen: before })}` : since);
			}
			taken.push(parts.join(' · '));
			continue;
		}
		const stops = medicationChanges([med], { from: win.from, to: asOf }).filter((c) => c.kind === 'stop');
		const last = stops[stops.length - 1];
		if (last) stopped.push(`${med.name} · ${t('pdf.med_now_stopped', { date: format(last.date) })}`);
	}
	return [...taken, ...stopped];
}

/* ─── 7. The treatment history (2026-09-19) ───────────────────────────── */

/** A date the person gave as a month prints as a month. Anything else prints
 *  as a date in their chosen format. */
export function historyDateText(
	iso: string | undefined,
	precision: 'month' | undefined,
	format: (iso: string) => string,
): string {
	if (!iso) return '';
	return precision === 'month' ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : format(iso);
}

export interface TherapyRow {
	med: MedicationSlot;
	name: string;
	/** "03/2023 – 05/2026", "seit 01.06.2026", "Beginn nicht erfasst – 05/2026". */
	period: string;
	regimen: string;
	/** Why it ended, from the fixed list — empty when none was given. */
	reason: string;
	/** True when the person filled this period in from memory. */
	remembered: boolean;
	/** Sort key: the first day of the period, '' for an unrecorded start. */
	sortKey: string;
}

/**
 * Every dose period of every medication, oldest first — the therapy as a
 * whole, which is what a first consultation asks about. Unlike every other
 * reader here this one has no window: the history before ciphra is the point.
 *
 * STRUCTURE ONLY, like its neighbours. A row says what was taken, when, and
 * which of the fixed reasons ended it. It never says what happened while it
 * was taken.
 */
export function therapyRows(
	meds: MedicationSlot[],
	format: (iso: string) => string,
	t: TranslateFn,
): TherapyRow[] {
	const rows: TherapyRow[] = [];
	for (const med of meds) {
		for (const p of medPeriods(med)) {
			const start = p.from
				? historyDateText(p.from, p.fromPrecision, format)
				: t('pdf.therapy_start_unknown');
			const end = p.to ? historyDateText(p.to, p.toPrecision, format) : t('pdf.therapy_ongoing');
			rows.push({
				med,
				name: med.name,
				period: `${start} – ${end}`,
				regimen: [regimenText(p), med.asNeeded ? t('pdf.med_now_as_needed') : ''].filter(Boolean).join(' · '),
				// The fixed list, resolved here rather than by the caller: a
				// callback is a way for free text to reach a clinical document.
				reason: p.stopReason ? stopReasonLabel(p.stopReason, t) : '',
				remembered: !!p.reported,
				// An unrecorded start is the earliest thing there is.
				sortKey: p.from ?? '',
			});
		}
	}
	return rows.sort((a, b) => (a.sortKey === b.sortKey ? a.name.localeCompare(b.name) : a.sortKey < b.sortKey ? -1 : 1));
}

/** True when any period was filled in from memory — the provenance line only
 *  claims it when it is true. */
export function hasRememberedHistory(meds: MedicationSlot[]): boolean {
	return meds.some((med) => medPeriods(med).some((p) => p.reported));
}
