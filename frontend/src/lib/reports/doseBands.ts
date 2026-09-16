/**
 * Dose bands — the "before and after" structure on a chart (2026-09-17).
 *
 * A chart's background is split into one medication's dose periods: a subtle
 * shade per period, a boundary where the dose changed. The person reading it
 * (a doctor, most of all) sees the episode line before and after a change
 * against one axis — and draws their own conclusion. ciphra draws none: no
 * counts per period, no rates, no better/worse (operator decision, MDR
 * guardrail; see pdf.no-assessment.test.ts).
 *
 * Geometry only, shared by the /reports charts (Chart.js, via ChartWrapper)
 * and the doctor PDF (jsPDF): both place things along an x axis of BINS —
 * days in a month view, months in a 12/24-month view. A position is measured
 * in bin units where bin k spans [k − 0.5, k + 0.5], so it maps onto a
 * category axis (bin centres at 0, 1, 2 …) with one linear step.
 */
import type { MedicationSlot } from '$lib/blueprint/types';
import { medicationChanges, medPeriods, type MedChange } from '$lib/blueprint/medicationHistory';

/** One x-axis bin: the local dates it covers, inclusive. */
export interface AxisBin {
	from: string;
	to: string;
}

export interface DoseBand {
	/** Left and right edge, in bin units. */
	start: number;
	end: number;
	dose: string;
	schedule: string;
	/** 0, 1, 2 … in period order — callers alternate the shade on it. */
	index: number;
}

export interface DoseBoundary {
	/** Where the new state begins, in bin units. */
	at: number;
	change: MedChange;
}

function dayNumber(iso: string): number {
	const [y, m, d] = iso.split('-').map(Number);
	return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/** Position of the START (edge 'start') or END (edge 'end') of a day, in bin
 *  units. Clamped to the axis: before the first bin → its left edge, after the
 *  last → its right edge. */
export function binPosition(bins: AxisBin[], date: string, edge: 'start' | 'end'): number {
	if (bins.length === 0) return 0;
	if (date < bins[0].from) return -0.5;
	if (date > bins[bins.length - 1].to) return bins.length - 0.5;
	const i = bins.findIndex((b) => b.from <= date && date <= b.to);
	if (i < 0) return -0.5;
	const span = dayNumber(bins[i].to) - dayNumber(bins[i].from) + 1;
	const offset = dayNumber(date) - dayNumber(bins[i].from) + (edge === 'end' ? 1 : 0);
	return i - 0.5 + offset / span;
}

/** Medications whose dose started, changed or stopped inside [from, to], the
 *  most recently changed first — the order a chart offers them in, and the
 *  first is the default. */
export function medsChangedIn(meds: MedicationSlot[], from: string, to: string): MedicationSlot[] {
	const latest = new Map<string, string>();
	for (const c of medicationChanges(meds, { from, to })) {
		if (!latest.has(c.medId) || c.date > (latest.get(c.medId) as string)) latest.set(c.medId, c.date);
	}
	return meds
		.filter((m) => latest.has(m.id))
		.sort((a, b) => ((latest.get(b.id) as string) < (latest.get(a.id) as string) ? -1 : 1));
}

/** The bands and boundaries for one medication on an axis. Empty when the
 *  medication did not change inside the axis range — a single band across the
 *  whole chart would be decoration, not structure. */
export function doseBands(
	med: MedicationSlot,
	bins: AxisBin[],
): { bands: DoseBand[]; boundaries: DoseBoundary[] } {
	if (bins.length === 0) return { bands: [], boundaries: [] };
	const from = bins[0].from;
	const to = bins[bins.length - 1].to;
	const changes = medicationChanges([med], { from, to });
	if (changes.length === 0) return { bands: [], boundaries: [] };

	const bands: DoseBand[] = [];
	medPeriods(med).forEach((p) => {
		if (p.from && p.from > to) return;
		if (p.to && p.to < from) return;
		const start = binPosition(bins, !p.from || p.from < from ? from : p.from, 'start');
		const end = binPosition(bins, !p.to || p.to > to ? to : p.to, 'end');
		if (end <= start) return;
		bands.push({ start, end, dose: p.dose, schedule: p.schedule, index: bands.length });
	});
	const boundaries = changes.map((change) => ({ at: binPosition(bins, change.date, 'start'), change }));
	return { bands, boundaries };
}

/** Bins for a month view: one per day. */
export function dayBins(year: number, month0: number): AxisBin[] {
	const days = new Date(year, month0 + 1, 0).getDate();
	const prefix = `${year}-${String(month0 + 1).padStart(2, '0')}`;
	return Array.from({ length: days }, (_, i) => {
		const d = `${prefix}-${String(i + 1).padStart(2, '0')}`;
		return { from: d, to: d };
	});
}

/** Bins for a multi-month view: one per calendar month, oldest first,
 *  starting at `year`/`month0`. */
export function monthBins(year: number, month0: number, count: number): AxisBin[] {
	return Array.from({ length: count }, (_, i) => {
		const first = new Date(year, month0 + i, 1);
		const y = first.getFullYear();
		const m = first.getMonth();
		const last = new Date(y, m + 1, 0).getDate();
		const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
		return { from: `${prefix}-01`, to: `${prefix}-${String(last).padStart(2, '0')}` };
	});
}
