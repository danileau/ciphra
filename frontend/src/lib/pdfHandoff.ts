/**
 * pdfHandoff.ts — ciphra clinical-handoff PDF renderer (v2).
 *
 * Binding spec: `frontend/src/lib/CLINICAL_HANDOFF.md`.
 * Workflow: R1–R5 campfire + 7-split tribunal, 2026-05-21.
 *
 * Hard 1-page A4. MDR-safe. Single artifact, no bundle, no appendix.
 * Cohort shell is identical across all cohort families; only the
 * primary block swaps. See spec §3 for cohort variants.
 *
 * This file is the new path. The legacy `pdf.ts` (4110 lines) remains
 * the active renderer until this file is feature-complete across all
 * 23 cohorts and wired into `/reports`. Both paths coexist during the
 * rewrite. No call sites yet — see `routes/reports/+page.svelte`.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Blueprint } from '$lib/blueprint';
import { applyVitalTargetOverrides, applyBlueprintCustomizations, type ReportScope } from '$lib/pdf';
import { cohortOf } from '$lib/blueprint/cohort';
import type { CiphraDocument } from '$lib/stores/documents';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export interface ClinicalHandoffOptions {
	/** Patient-authored free-text quote for the top line (≤180 chars per spec §4). */
	topLineText?: string;
	/** ISO date (YYYY-MM-DD) the patient authored the quote. Defaults to export date. */
	topLineDate?: string;
}

/**
 * Codified geometry per spec §2 + §6.4. mm units (jsPDF default).
 * A4 = 210 × 297. 15mm margins → 180 × 267 content area.
 */
const GEO = {
	pageW: 210,
	pageH: 297,
	marginX: 15,
	marginTop: 15,
	marginBottom: 15,
	contentW: 180,
	// Block heights (target — actual height returned by each draw fn).
	headerH: 12,
	topLineH: 18,
	identityH: 10,
	primaryH: 110,
	notesMaxH: 25,
	scopeH: 15,
};

/** Type scale (§6.4). B&W safe. */
const TYPE = {
	compact: 7,
	table: 8,
	body: 9,
	head: 11,
	topLine: 11,
	axis: 6,
};

/** Neutral-only palette. No category color, ever. */
const INK = {
	primary: [0, 0, 0] as [number, number, number],
	muted: [110, 110, 110] as [number, number, number],
	hairline: [180, 180, 180] as [number, number, number],
};

/**
 * Hard banned-word list (spec §1.4). Pinned by vitest in
 * `pdfHandoff.banned-words.test.ts`. Patient-authored free text is
 * exempt — the test scopes only to generated copy.
 */
export const BANNED_WORDS: readonly string[] = [
	'trend',
	'improvement',
	'improving',
	'worsening',
	'abnormal',
	'elevated',
	'response',
	'recommendation',
	'significant',
	'stable',
	'trajectory',
	'control',  // banned only in clinical sense ("good control"); kept here as floor
	'suboptimal',
	'optimal',
	'adherence',
	'poor',
	'concerning',
	'notable',
	'spike',
	'cluster',
	'pattern',
];

/**
 * Main entry. Mirrors `generateDoctorPdf` signature so the swap at the
 * call site is one line. Renders one A4 PDF and saves it.
 */
export function generateClinicalHandoff(
	blueprintIn: Blueprint,
	documents: CiphraDocument[],
	year: number,
	month: number, // 0-based
	t: TranslateFn,
	locale: string,
	username: string = '',
	scope: ReportScope = 'month',
	options: ClinicalHandoffOptions = {},
): void {
	// Apply user-side blueprint customizations (vital targets +
	// hidden-symptom filter) the same way the legacy renderer does.
	const blueprint = applyBlueprintCustomizations(applyVitalTargetOverrides(blueprintIn, username));

	const doc = new jsPDF({ format: 'a4', unit: 'mm', orientation: 'portrait' });

	// Single page. No paintPaper background (§1.5 — white fill only).
	const exportDate = new Date(year, month, 1);
	const periodRange = computePeriodRange(year, month, scope);

	let cursorY = GEO.marginTop;

	cursorY = drawHandoffHeader(doc, exportDate, locale, t);
	cursorY = drawPatientTopLine(
		doc,
		blueprint,
		username,
		options.topLineText ?? '',
		options.topLineDate ?? formatDateISO(exportDate),
		t,
		locale,
		cursorY,
	);
	cursorY = drawIdentityBlock(doc, blueprint, username, periodRange, locale, t, cursorY);

	// Primary block — dispatch on cohort. Returns the bottom Y.
	cursorY = drawPrimaryBlock(doc, blueprint, documents, periodRange, t, locale, cursorY);

	// Secondary patient-notes block (§2 block 5). Narrative + custom
	// cohorts ABSORB the notes into their primary block (entries ARE
	// the page), so the secondary block stays suppressed for them.
	if (!cohortAbsorbsNotes(blueprint)) {
		cursorY = drawPatientNotes(doc, blueprint, documents, periodRange, t, locale, cursorY);
	}

	// Scope statement at the bottom. Drawn from the page edge upward
	// regardless of where cursorY landed — §5 mandates bottom placement.
	drawScopeStatement(doc, t, locale);

	const fname = `ciphra-handoff-${formatDateISO(exportDate)}.pdf`;
	doc.save(fname);
}

/* ─── Shell blocks (constant across all cohorts) ─── */

/** §2 block 1 — Header line. Returns new cursorY. */
export function drawHandoffHeader(
	doc: jsPDF,
	exportDate: Date,
	locale: string,
	t: TranslateFn,
): number {
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.compact);
	doc.setTextColor(...INK.muted);
	const left = `${t('handoff.brand_label')} · ${t('handoff.artifact_label')} · ${formatDateLocale(exportDate, locale)}`;
	doc.text(left, GEO.marginX, GEO.marginTop + 4);
	return GEO.marginTop + GEO.headerH;
}

/** §2 block 2 — Patient top line. Free-text quote with author + date. */
export function drawPatientTopLine(
	doc: jsPDF,
	blueprint: Blueprint,
	username: string,
	text: string,
	dateISO: string,
	t: TranslateFn,
	locale: string,
	y: number,
): number {
	// Author display: first name if available, else username, else
	// blueprint condition label as a last resort.
	const author = firstNameOrFallback(username, blueprint, t);
	const dateLabel = formatDateLocale(new Date(dateISO), locale);

	const hasText = text.trim().length > 0;
	const safeText = hasText ? text.trim().slice(0, 180) : t('handoff.no_note_provided');
	const prefix = `${author} ${t('handoff.wrote_on')} (${dateLabel}): `;

	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.topLine);
	doc.setTextColor(...INK.primary);

	// Prefix and quoted text concatenated; quote shown when there's
	// real content, fallback string shown plain when empty.
	const fullText = hasText ? `${prefix}"${safeText}"` : `${prefix}${safeText}`;
	const wrapped = doc.splitTextToSize(fullText, GEO.contentW);
	doc.text(wrapped, GEO.marginX, y + 5);

	return y + GEO.topLineH;
}

/** §2 block 3 — Identity + scope (cohort label, period, locale). */
export function drawIdentityBlock(
	doc: jsPDF,
	blueprint: Blueprint,
	username: string,
	periodRange: { startISO: string; endISO: string },
	locale: string,
	t: TranslateFn,
	y: number,
): number {
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.compact);
	doc.setTextColor(...INK.muted);

	const conditionLabel = blueprint.conditionLabel
		? t(blueprint.conditionLabel)
		: blueprint.conditionId;
	const periodLabel = `${formatDateLocale(new Date(periodRange.startISO), locale)} – ${formatDateLocale(new Date(periodRange.endISO), locale)}`;

	const left = [
		`${t('handoff.patient_label')}: ${username || '—'}`,
		`${t('handoff.notebook_label')}: ${conditionLabel}`,
		`${t('handoff.locale_label')}: ${locale.toUpperCase()}`,
	].join('  ·  ');
	doc.text(left, GEO.marginX, y + 3);

	const right = `${t('handoff.period_label')}: ${periodLabel}`;
	doc.text(right, GEO.pageW - GEO.marginX, y + 3, { align: 'right' });

	// Single hairline separator below identity row.
	doc.setDrawColor(...INK.hairline);
	doc.setLineWidth(0.15);
	doc.line(GEO.marginX, y + GEO.identityH - 2, GEO.pageW - GEO.marginX, y + GEO.identityH - 2);

	return y + GEO.identityH;
}

/** §2 block 5 — Patient notes (3 most recent, dated, quoted). */
export function drawPatientNotes(
	doc: jsPDF,
	blueprint: Blueprint,
	documents: CiphraDocument[],
	periodRange: { startISO: string; endISO: string },
	t: TranslateFn,
	locale: string,
	y: number,
): number {
	const notes = extractPatientNotes(documents, periodRange);
	if (notes.length === 0) return y;

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.compact);
	doc.setTextColor(...INK.primary);
	doc.text(t('handoff.notes_section'), GEO.marginX, y + 4);

	let yi = y + 8;
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.compact);
	doc.setTextColor(...INK.primary);

	const shown = notes.slice(0, 3);
	for (const n of shown) {
		const dateLabel = formatDateLocale(new Date(n.dateISO), locale);
		const truncated = n.text.length > 120 ? n.text.slice(0, 117) + '…' : n.text;
		const line = `${dateLabel} · "${truncated}"`;
		const wrapped = doc.splitTextToSize(line, GEO.contentW);
		doc.text(wrapped, GEO.marginX, yi);
		yi += wrapped.length * 3.6;
	}

	if (notes.length > 3) {
		doc.setTextColor(...INK.muted);
		const overflow = t('handoff.notes_truncated', { n: String(notes.length - 3) });
		doc.text(overflow, GEO.marginX, yi);
		yi += 4;
	}

	return yi + 2;
}

/** §5 — Scope statement at the bottom of the page (mandatory). */
export function drawScopeStatement(doc: jsPDF, t: TranslateFn, _locale: string): void {
	const text = t('handoff.scope_statement');
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.compact);
	doc.setTextColor(...INK.muted);
	const wrapped = doc.splitTextToSize(text, GEO.contentW);
	const lineH = 3.4;
	const totalH = wrapped.length * lineH;
	const yStart = GEO.pageH - GEO.marginBottom - totalH;
	doc.text(wrapped, GEO.marginX, yStart);
}

/* ─── Primary block dispatcher (§3) ─── */

function drawPrimaryBlock(
	doc: jsPDF,
	blueprint: Blueprint,
	documents: CiphraDocument[],
	periodRange: { startISO: string; endISO: string },
	t: TranslateFn,
	locale: string,
	y: number,
): number {
	// Vital-pinned is a property of the BLUEPRINT, not the cohort family
	// (Hashimoto / Hypertension / Diabetes T1 / Bipolar / Parkinson all
	// declare `primaryBrowseSurface = 'trend'`). It wins over cohort
	// dispatch because the primary signal is the lab/vital, regardless
	// of whether the cohort family is 'phase' (bipolar) or 'discrete'.
	if (blueprint.primaryBrowseSurface === 'trend') {
		return drawVitalCohortPrimary(doc, blueprint, documents, periodRange, t, locale, y);
	}
	const cohort = cohortOf(blueprint);
	switch (cohort) {
		case 'discrete':
			return drawEpisodeCohortPrimary(doc, blueprint, documents, periodRange, t, locale, y);
		case 'cycle':
			return drawCycleCohortPrimary(doc, blueprint, documents, periodRange, t, locale, y);
		case 'phase':
			return drawPhaseCohortPrimary(doc, blueprint, documents, periodRange, t, locale, y);
		case 'narrative':
			return drawNarrativeCohortPrimary(doc, blueprint, documents, periodRange, t, locale, y);
		default:
			return drawCustomCohortPrimary(doc, blueprint, documents, periodRange, t, locale, y);
	}
}

/* ─── Vital cohort (§3.1) — Hashimoto / Hypertension / Diabetes T1 / etc. ─── */

export function drawVitalCohortPrimary(
	doc: jsPDF,
	blueprint: Blueprint,
	documents: CiphraDocument[],
	periodRange: { startISO: string; endISO: string },
	t: TranslateFn,
	locale: string,
	y: number,
): number {
	// Pick up to 2 chartable vitals to show on page 1. `excludeFromTrends`
	// flags vitals like `cycle_day` that don't trend meaningfully — they
	// stay off page 1 by blueprint declaration. Additional vitals beyond
	// 2 are truncated with a "+N more" suffix per §1.1.
	const vitals = (blueprint.vitals ?? []).filter((v) => !v.excludeFromTrends);
	const shown = vitals.slice(0, 2);
	let yi = y + 2;

	for (const v of shown) {
		yi = drawVitalRow(doc, v, documents, periodRange, t, locale, yi);
		yi += 4;
	}

	if (vitals.length > shown.length) {
		doc.setFont('helvetica', 'italic');
		doc.setFontSize(TYPE.compact);
		doc.setTextColor(...INK.muted);
		doc.text(
			t('handoff.vitals_truncated', { n: String(vitals.length - shown.length) }),
			GEO.marginX,
			yi,
		);
		yi += 4;
	}

	// Separator before dose-change strip.
	doc.setDrawColor(...INK.hairline);
	doc.setLineWidth(0.15);
	doc.line(GEO.marginX, yi - 1, GEO.pageW - GEO.marginX, yi - 1);
	yi += 3;

	yi = drawDoseChangeStrip(doc, blueprint, documents, periodRange, t, locale, yi);

	return Math.max(yi, y + GEO.primaryH);
}

function drawVitalRow(
	doc: jsPDF,
	vital: { id: string; label: string; unit?: string },
	documents: CiphraDocument[],
	periodRange: { startISO: string; endISO: string },
	t: TranslateFn,
	locale: string,
	y: number,
): number {
	const draws = extractVitalDraws(documents, vital.id, periodRange);

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.body);
	doc.setTextColor(...INK.primary);
	const labelText = vital.unit
		? `${t(vital.label) || vital.label} (${vital.unit})`
		: t(vital.label) || vital.label;
	doc.text(labelText, GEO.marginX, y + 4);

	if (draws.length === 0) {
		doc.setFont('helvetica', 'italic');
		doc.setFontSize(TYPE.compact);
		doc.setTextColor(...INK.muted);
		doc.text(t('handoff.no_values_in_period'), GEO.marginX, y + 10);
		return y + 12;
	}

	// Side-by-side raw values (Last · This) per draw row — never a
	// computed delta. §3.1 + tribunal split 6 + MDR rule.
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.compact);
	doc.setTextColor(...INK.primary);
	let yi = y + 9;
	let prev: number | null = null;
	for (const d of draws) {
		const dateLabel = formatDateLocale(new Date(d.dateISO), locale);
		const prevText = prev === null ? '—' : prev.toString();
		const line = `${dateLabel}    ${t('handoff.last')}: ${prevText}  ·  ${t('handoff.this')}: ${d.value}`;
		doc.text(line, GEO.marginX + 2, yi);
		yi += 4;
		prev = d.value;
	}

	// Dots-only sparkline (no connecting lines per tribunal split 2).
	// Right-aligned, 40mm wide × 12mm tall (§3.1).
	const sparkW = 40;
	const sparkH = 12;
	const sparkX = GEO.pageW - GEO.marginX - sparkW;
	const sparkY = y + 4;
	drawDotsOnlySparkline(doc, draws.map((d) => d.value), sparkX, sparkY, sparkW, sparkH);

	return yi;
}

/**
 * Tribunal split 2: dots only, no connecting line, no reference range.
 * Each dot represents a measured draw. No interpolation, no clinical
 * framing via positioning.
 */
export function drawDotsOnlySparkline(
	doc: jsPDF,
	values: number[],
	x: number,
	y: number,
	w: number,
	h: number,
): void {
	if (values.length === 0) return;
	const vMin = Math.min(...values);
	const vMax = Math.max(...values);
	const vRange = vMax - vMin || 1;

	doc.setFillColor(...INK.primary);
	const n = values.length;
	for (let i = 0; i < n; i++) {
		const px = n === 1 ? x + w / 2 : x + (i / (n - 1)) * w;
		const py = y + h - ((values[i] - vMin) / vRange) * h;
		doc.circle(px, py, 0.7, 'F');
	}
}

/**
 * §3.1 — Dose-change strip BELOW the vital data, on a separate axis.
 * Vertical alignment by date for visual coincidence, never overlaid.
 * Tribunal split 5: per-draw absolute dates on the strip's labels.
 */
export function drawDoseChangeStrip(
	doc: jsPDF,
	blueprint: Blueprint,
	documents: CiphraDocument[],
	periodRange: { startISO: string; endISO: string },
	t: TranslateFn,
	locale: string,
	y: number,
): number {
	const changes = extractDoseChanges(documents, blueprint, periodRange);
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.compact);
	doc.setTextColor(...INK.primary);
	doc.text(t('handoff.dose_changes_label'), GEO.marginX, y + 3);

	if (changes.length === 0) {
		doc.setFont('helvetica', 'italic');
		doc.setFontSize(TYPE.compact);
		doc.setTextColor(...INK.muted);
		doc.text(t('handoff.no_dose_changes_in_period'), GEO.marginX, y + 8);
		return y + 12;
	}

	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.compact);
	doc.setTextColor(...INK.primary);
	let yi = y + 8;
	for (const c of changes.slice(0, 5)) {
		const dateLabel = formatDateLocale(new Date(c.dateISO), locale);
		// Filled circle marker + dose-change description.
		doc.setFillColor(...INK.primary);
		doc.circle(GEO.marginX + 1, yi - 1, 0.8, 'F');
		const line = `${dateLabel}    ${c.medication} ${c.fromDose} → ${c.toDose} ${c.unit}`;
		doc.text(line, GEO.marginX + 4, yi);
		yi += 4;
	}
	if (changes.length > 5) {
		doc.setTextColor(...INK.muted);
		const overflow = t('handoff.dose_changes_truncated', { n: String(changes.length - 5) });
		doc.text(overflow, GEO.marginX, yi);
		yi += 4;
	}
	return yi;
}

/* ─── Other cohort primary blocks (stubs — to be filled in next sessions) ─── */

/**
 * §3.2 — Episode cohort primary block.
 * B&W calendar over the trailing 90 days. Empty cells = calm days
 * (thin black border, white fill). Event days = black marker + 2-letter
 * code. Same-day same-type collisions compress to `SZ x3`; multi-type
 * collisions show the most-frequent code + `+N` suffix.
 * Counts side-by-side below: `Previous: X · This: Y` over equal-length
 * windows (no labeled delta).
 */
function drawEpisodeCohortPrimary(
	doc: jsPDF,
	blueprint: Blueprint,
	documents: CiphraDocument[],
	periodRange: { startISO: string; endISO: string },
	t: TranslateFn,
	locale: string,
	y: number,
): number {
	// Calendar window: trailing 90 days ending at periodRange.endISO, but
	// never extending before periodRange.startISO. For month scope this
	// collapses to the month; for year scope it caps at 90 days.
	const window = computeCalendarWindow(periodRange, 90);
	const previous = computePreviousWindow(window);
	const eventsByDay = aggregateEpisodesByDay(documents, blueprint, window);
	const thisCount = countEpisodesInWindow(documents, blueprint, window);
	const prevCount = countEpisodesInWindow(documents, blueprint, previous);
	const thisDaysWithEvents = countDaysWithEpisodes(documents, blueprint, window);
	const prevDaysWithEvents = countDaysWithEpisodes(documents, blueprint, previous);

	// Heading.
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.head);
	doc.setTextColor(...INK.primary);
	doc.text(t('handoff.episodes_title'), GEO.marginX, y + 4);

	// Calendar grid.
	const gridX = GEO.marginX;
	const gridY = y + 10;
	const labelColW = 20;
	const cellW = (GEO.contentW - labelColW) / 7;
	const cellH = 7.5;
	drawEpisodeCalendar(doc, gridX, gridY, labelColW, cellW, cellH, window, eventsByDay, locale, t);

	// Counts row.
	const calendarBottomY = gridY + 5 /* header */ + numWeeksInWindow(window) * cellH + 4;
	let yi = calendarBottomY;

	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.compact);
	doc.setTextColor(...INK.primary);
	const row1 = `${t('handoff.episodes_recorded')}    ${t('handoff.previous')}: ${prevCount}  ·  ${t('handoff.this_window')}: ${thisCount}`;
	doc.text(row1, GEO.marginX, yi);
	yi += 4;
	const row2 = `${t('handoff.days_with_events')}    ${t('handoff.previous')}: ${prevDaysWithEvents}  ·  ${t('handoff.this_window')}: ${thisDaysWithEvents}`;
	doc.text(row2, GEO.marginX, yi);
	yi += 4;

	return Math.max(yi, y + GEO.primaryH);
}

interface DayCell {
	codeBuckets: Map<string, number>;
}

function drawEpisodeCalendar(
	doc: jsPDF,
	x: number,
	y: number,
	labelColW: number,
	cellW: number,
	cellH: number,
	window: { startISO: string; endISO: string },
	eventsByDay: Map<string, DayCell>,
	locale: string,
	_t: TranslateFn,
): void {
	// Header row: weekday names (M T W T F S S). Always 7 cells.
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.axis);
	doc.setTextColor(...INK.muted);
	const headerY = y + 3;
	const weekdayInitials = computeWeekdayInitials(locale);
	for (let i = 0; i < 7; i++) {
		const cellX = x + labelColW + i * cellW;
		doc.text(weekdayInitials[i], cellX + cellW / 2, headerY, { align: 'center' });
	}

	const gridTopY = y + 5;
	const startDate = parseISO(window.startISO);
	const endDate = parseISO(window.endISO);

	// Pad startDate back to the previous Monday so column = day-of-week
	// alignment holds across the whole grid. Padded cells are drawn as
	// dimmed empty placeholders.
	const startDow = (startDate.getDay() + 6) % 7; // Mon=0..Sun=6
	const gridStart = new Date(startDate);
	gridStart.setDate(gridStart.getDate() - startDow);

	const weeks = numWeeksInWindow(window);
	doc.setDrawColor(...INK.hairline);
	doc.setLineWidth(0.15);

	for (let w = 0; w < weeks; w++) {
		const rowY = gridTopY + w * cellH;

		// Row label: first day of the week (Mon).
		const rowDate = new Date(gridStart);
		rowDate.setDate(rowDate.getDate() + w * 7);
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(TYPE.axis);
		doc.setTextColor(...INK.muted);
		doc.text(formatMonDayLocale(rowDate, locale), x + labelColW - 2, rowY + cellH / 2 + 1, { align: 'right' });

		// 7 day cells.
		for (let d = 0; d < 7; d++) {
			const cellX = x + labelColW + d * cellW;
			const cellY = rowY;
			const dayDate = new Date(gridStart);
			dayDate.setDate(dayDate.getDate() + w * 7 + d);
			const dayISO = formatDateISOFromDate(dayDate);

			const isInWindow = dayISO >= window.startISO && dayISO <= window.endISO;
			if (!isInWindow) {
				// Out-of-window pad cell — leave blank (no border).
				continue;
			}

			// Cell border (calm-day affordance, §1.5 + §3.2).
			doc.setDrawColor(...INK.hairline);
			doc.setLineWidth(0.15);
			doc.rect(cellX + 0.3, cellY + 0.3, cellW - 0.6, cellH - 0.6, 'S');

			// Event content, if any.
			const dayCell = eventsByDay.get(dayISO);
			if (!dayCell || dayCell.codeBuckets.size === 0) continue;

			// In-cell label: the most-frequent code (collision compress).
			const sortedCodes = Array.from(dayCell.codeBuckets.entries()).sort((a, b) => b[1] - a[1]);
			const [topCode, topN] = sortedCodes[0];
			const extraTypes = sortedCodes.length - 1;
			let label = topN > 1 ? `${topCode} x${topN}` : topCode;
			if (extraTypes > 0) label += ` +${extraTypes}`;

			doc.setFont('helvetica', 'bold');
			doc.setFontSize(TYPE.axis);
			doc.setTextColor(...INK.primary);
			doc.text(label, cellX + cellW / 2, cellY + cellH / 2 + 1, { align: 'center' });

			// Filled black dot to the left of the label (event marker
			// affordance, B&W safe per §1.5 + tribunal split 2 spirit).
			doc.setFillColor(...INK.primary);
			doc.circle(cellX + 1.4, cellY + cellH / 2, 0.7, 'F');
		}
	}
}

export function computeCalendarWindow(
	periodRange: { startISO: string; endISO: string },
	maxDays: number,
): { startISO: string; endISO: string } {
	const end = parseISO(periodRange.endISO);
	const minStart = parseISO(periodRange.startISO);
	const trailing = new Date(end);
	trailing.setDate(trailing.getDate() - (maxDays - 1));
	const start = trailing > minStart ? trailing : minStart;
	return { startISO: formatDateISOFromDate(start), endISO: periodRange.endISO };
}

export function computePreviousWindow(window: { startISO: string; endISO: string }): { startISO: string; endISO: string } {
	const start = parseISO(window.startISO);
	const end = parseISO(window.endISO);
	const lengthDays = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
	const prevEnd = new Date(start);
	prevEnd.setDate(prevEnd.getDate() - 1);
	const prevStart = new Date(prevEnd);
	prevStart.setDate(prevStart.getDate() - (lengthDays - 1));
	return { startISO: formatDateISOFromDate(prevStart), endISO: formatDateISOFromDate(prevEnd) };
}

function numWeeksInWindow(window: { startISO: string; endISO: string }): number {
	const start = parseISO(window.startISO);
	const end = parseISO(window.endISO);
	const startDow = (start.getDay() + 6) % 7;
	const padded = new Date(start);
	padded.setDate(padded.getDate() - startDow);
	const days = Math.round((end.getTime() - padded.getTime()) / (24 * 60 * 60 * 1000)) + 1;
	return Math.ceil(days / 7);
}

export function aggregateEpisodesByDay(
	documents: CiphraDocument[],
	blueprint: Blueprint,
	window: { startISO: string; endISO: string },
): Map<string, DayCell> {
	const map = new Map<string, DayCell>();
	const epTypes = blueprint.episodeTypes ?? [];

	for (const d of documents) {
		const data = d.data as Record<string, unknown> & { date?: string; type?: string; episodes?: Record<string, unknown> };
		const dateISO = String(data?.date || '');
		if (!dateISO || dateISO < window.startISO || dateISO > window.endISO) continue;
		const eps = data?.episodes;
		if (!eps || typeof eps !== 'object') continue;

		let cell = map.get(dateISO);
		if (!cell) {
			cell = { codeBuckets: new Map() };
			map.set(dateISO, cell);
		}

		for (const ep of epTypes) {
			const raw = (eps as Record<string, unknown>)[ep.id];
			const n = Number(raw);
			if (!Number.isFinite(n) || n <= 0) continue;
			const code = shortCodeForEpisode(ep.id, ep.label);
			cell.codeBuckets.set(code, (cell.codeBuckets.get(code) ?? 0) + n);
		}
	}

	return map;
}

export function countEpisodesInWindow(
	documents: CiphraDocument[],
	blueprint: Blueprint,
	window: { startISO: string; endISO: string },
): number {
	const epIds = (blueprint.episodeTypes ?? []).map((e) => e.id);
	let total = 0;
	for (const d of documents) {
		const data = d.data as Record<string, unknown> & { date?: string; episodes?: Record<string, unknown> };
		const dateISO = String(data?.date || '');
		if (!dateISO || dateISO < window.startISO || dateISO > window.endISO) continue;
		const eps = data?.episodes;
		if (!eps || typeof eps !== 'object') continue;
		for (const id of epIds) {
			const n = Number((eps as Record<string, unknown>)[id]);
			if (Number.isFinite(n) && n > 0) total += n;
		}
	}
	return total;
}

export function countDaysWithEpisodes(
	documents: CiphraDocument[],
	blueprint: Blueprint,
	window: { startISO: string; endISO: string },
): number {
	const epIds = (blueprint.episodeTypes ?? []).map((e) => e.id);
	const days = new Set<string>();
	for (const d of documents) {
		const data = d.data as Record<string, unknown> & { date?: string; episodes?: Record<string, unknown> };
		const dateISO = String(data?.date || '');
		if (!dateISO || dateISO < window.startISO || dateISO > window.endISO) continue;
		const eps = data?.episodes;
		if (!eps || typeof eps !== 'object') continue;
		for (const id of epIds) {
			const n = Number((eps as Record<string, unknown>)[id]);
			if (Number.isFinite(n) && n > 0) {
				days.add(dateISO);
				break;
			}
		}
	}
	return days.size;
}

/**
 * Derive a 2-letter event code for an episode type.
 * - `tonic_clonic` → `TC`
 * - `focal_aware` → `FA`
 * - `migraine` → `MI`
 * - `aura` → `AU`
 * Underscore-separated → initials of first two parts; single word →
 * first two letters. Always uppercase. Collisions within a blueprint
 * are possible but acceptable for the first-glance read; the doctor
 * resolves on the day-by-day list which lives in the patient app.
 */
export function shortCodeForEpisode(id: string, _label: string): string {
	const parts = id.split('_').filter((p) => p.length > 0);
	if (parts.length >= 2) {
		return (parts[0][0] + parts[1][0]).toUpperCase();
	}
	return (parts[0] ?? id).slice(0, 2).toUpperCase();
}

function computeWeekdayInitials(locale: string): string[] {
	// Mon..Sun. Use the locale's short weekday label, take the first
	// character (uppercase). Sunday is the last column per ISO 8601.
	const out: string[] = [];
	const base = new Date(2026, 0, 5); // Monday 2026-01-05
	for (let i = 0; i < 7; i++) {
		const d = new Date(base);
		d.setDate(d.getDate() + i);
		const short = d.toLocaleDateString(locale, { weekday: 'short' });
		out.push((short[0] ?? '·').toUpperCase());
	}
	return out;
}

function parseISO(iso: string): Date {
	const [y, m, d] = iso.split('-').map(Number);
	return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function formatDateISOFromDate(d: Date): string {
	return formatDateISO(d);
}

function formatMonDayLocale(d: Date, locale: string): string {
	return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

/**
 * §3.3 — Cycle cohort primary block.
 * Per-month horizontal strip showing bleeding-vs-calm days. Bleeding
 * days = filled black dots; calm days = empty cells with thin black
 * border. Side-by-side counts below: `Cycles: P · T` and `Bleeding
 * days: P · T`. No interpretation of regularity.
 *
 * Bleeding-day detection: `vitals.bleeding_intensity > 0` OR
 * `symptoms.heavy_bleeding === true` OR `triggers.menstruation`.
 */
function drawCycleCohortPrimary(
	doc: jsPDF,
	_blueprint: Blueprint,
	documents: CiphraDocument[],
	periodRange: { startISO: string; endISO: string },
	t: TranslateFn,
	locale: string,
	y: number,
): number {
	const window = computeCalendarWindow(periodRange, 90);
	const previous = computePreviousWindow(window);
	const bleedingDays = aggregateBleedingDays(documents, window);
	const prevBleedingDays = aggregateBleedingDays(documents, previous);
	const cyclesThis = countCycles(bleedingDays);
	const cyclesPrev = countCycles(prevBleedingDays);

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.head);
	doc.setTextColor(...INK.primary);
	doc.text(t('handoff.cycle_title'), GEO.marginX, y + 4);

	const stripsY = y + 10;
	const labelColW = 14;
	const monthsInWindow = enumerateMonthsInWindow(window);
	const stripH = 6;

	for (let i = 0; i < monthsInWindow.length; i++) {
		const m = monthsInWindow[i];
		const stripY = stripsY + i * (stripH + 2);
		drawCycleMonthStrip(
			doc,
			GEO.marginX,
			stripY,
			labelColW,
			GEO.contentW - labelColW,
			stripH,
			m,
			bleedingDays,
			locale,
		);
	}

	const stripsBottomY = stripsY + monthsInWindow.length * (stripH + 2) + 4;
	let yi = stripsBottomY;

	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.compact);
	doc.setTextColor(...INK.primary);
	const row1 = `${t('handoff.cycles_in_period')}    ${t('handoff.previous')}: ${cyclesPrev}  ·  ${t('handoff.this_window')}: ${cyclesThis}`;
	doc.text(row1, GEO.marginX, yi);
	yi += 4;
	const row2 = `${t('handoff.bleeding_days_count')}    ${t('handoff.previous')}: ${prevBleedingDays.size}  ·  ${t('handoff.this_window')}: ${bleedingDays.size}`;
	doc.text(row2, GEO.marginX, yi);
	yi += 4;

	return Math.max(yi, y + GEO.primaryH);
}

function drawCycleMonthStrip(
	doc: jsPDF,
	x: number,
	y: number,
	labelColW: number,
	stripW: number,
	stripH: number,
	month: { year: number; month: number; daysInMonth: number },
	bleedingDays: Set<string>,
	locale: string,
): void {
	// Month label (left of strip).
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.axis);
	doc.setTextColor(...INK.muted);
	const monthLabel = new Date(month.year, month.month, 1).toLocaleDateString(locale, { month: 'short' });
	doc.text(monthLabel, x, y + stripH / 2 + 1);

	// Day cells.
	const cellW = stripW / 31; // pad to 31 for consistent width across months
	for (let d = 1; d <= month.daysInMonth; d++) {
		const cellX = x + labelColW + (d - 1) * cellW;
		const dayISO = `${month.year}-${String(month.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
		const isBleeding = bleedingDays.has(dayISO);

		// Cell border (calm-day affordance).
		doc.setDrawColor(...INK.hairline);
		doc.setLineWidth(0.15);
		doc.rect(cellX + 0.2, y + 0.2, cellW - 0.4, stripH - 0.4, 'S');

		if (isBleeding) {
			doc.setFillColor(...INK.primary);
			doc.circle(cellX + cellW / 2, y + stripH / 2, Math.min(cellW, stripH) * 0.28, 'F');
		}
	}
}

export function aggregateBleedingDays(
	documents: CiphraDocument[],
	window: { startISO: string; endISO: string },
): Set<string> {
	const days = new Set<string>();
	for (const d of documents) {
		const data = d.data as Record<string, unknown> & { date?: string };
		const dateISO = String(data?.date || '');
		if (!dateISO || dateISO < window.startISO || dateISO > window.endISO) continue;

		const vitals = (data as Record<string, unknown>).vitals as Record<string, unknown> | undefined;
		const bi = parseFirstNumber(vitals?.bleeding_intensity);
		if (bi !== null && bi > 0) {
			days.add(dateISO);
			continue;
		}

		const symptoms = (data as Record<string, unknown>).symptoms as Record<string, unknown> | undefined;
		if (symptoms?.heavy_bleeding === true || symptoms?.heavy_bleeding === 1) {
			days.add(dateISO);
			continue;
		}

		const triggers = (data as Record<string, unknown>).triggers;
		if (Array.isArray(triggers) && triggers.includes('menstruation')) {
			days.add(dateISO);
		} else if (triggers && typeof triggers === 'object') {
			const trig = triggers as Record<string, unknown>;
			if (trig.menstruation === true || trig.menstruation === 1) days.add(dateISO);
		}
	}
	return days;
}

/**
 * Count menstrual cycles by detecting bleeding-day runs separated by
 * at least 14 calm days. A cycle is one bleeding episode; runs of
 * consecutive bleeding days count as a single cycle.
 */
export function countCycles(bleedingDays: Set<string>): number {
	if (bleedingDays.size === 0) return 0;
	const sorted = Array.from(bleedingDays).sort();
	let cycles = 1;
	for (let i = 1; i < sorted.length; i++) {
		const prev = parseISO(sorted[i - 1]);
		const cur = parseISO(sorted[i]);
		const gapDays = Math.round((cur.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000));
		if (gapDays > 14) cycles += 1;
	}
	return cycles;
}

function enumerateMonthsInWindow(
	window: { startISO: string; endISO: string },
): { year: number; month: number; daysInMonth: number }[] {
	const out: { year: number; month: number; daysInMonth: number }[] = [];
	const start = parseISO(window.startISO);
	const end = parseISO(window.endISO);
	const cur = new Date(start.getFullYear(), start.getMonth(), 1);
	while (cur <= end) {
		const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
		const daysInMonth = Math.round((next.getTime() - cur.getTime()) / (24 * 60 * 60 * 1000));
		out.push({ year: cur.getFullYear(), month: cur.getMonth(), daysInMonth });
		cur.setMonth(cur.getMonth() + 1);
	}
	return out;
}

/**
 * §3.4 — Phase cohort primary block.
 * The spec's "stripe-band timeline" (active/transition/baseline) is
 * aspirational: the data schema does not yet support patient-authored
 * phase labels. Per §1.3 software MUST NOT derive phase from symptoms.
 * Until a phase-logging UI lands, phase cohorts reuse the episode
 * calendar primitive — the patient's logged episode events are the
 * most-honest available signal. Mirrors §3.2 exactly; only the
 * section heading differs.
 */
function drawPhaseCohortPrimary(
	doc: jsPDF,
	blueprint: Blueprint,
	documents: CiphraDocument[],
	periodRange: { startISO: string; endISO: string },
	t: TranslateFn,
	locale: string,
	y: number,
): number {
	const window = computeCalendarWindow(periodRange, 90);
	const previous = computePreviousWindow(window);
	const eventsByDay = aggregateEpisodesByDay(documents, blueprint, window);
	const thisCount = countEpisodesInWindow(documents, blueprint, window);
	const prevCount = countEpisodesInWindow(documents, blueprint, previous);
	const thisDaysWithEvents = countDaysWithEpisodes(documents, blueprint, window);
	const prevDaysWithEvents = countDaysWithEpisodes(documents, blueprint, previous);

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.head);
	doc.setTextColor(...INK.primary);
	doc.text(t('handoff.phase_title'), GEO.marginX, y + 4);

	const gridX = GEO.marginX;
	const gridY = y + 10;
	const labelColW = 20;
	const cellW = (GEO.contentW - labelColW) / 7;
	const cellH = 7.5;
	drawEpisodeCalendar(doc, gridX, gridY, labelColW, cellW, cellH, window, eventsByDay, locale, t);

	const calendarBottomY = gridY + 5 + numWeeksInWindow(window) * cellH + 4;
	let yi = calendarBottomY;

	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.compact);
	doc.setTextColor(...INK.primary);
	doc.text(
		`${t('handoff.episodes_recorded')}    ${t('handoff.previous')}: ${prevCount}  ·  ${t('handoff.this_window')}: ${thisCount}`,
		GEO.marginX,
		yi,
	);
	yi += 4;
	doc.text(
		`${t('handoff.days_with_events')}    ${t('handoff.previous')}: ${prevDaysWithEvents}  ·  ${t('handoff.this_window')}: ${thisDaysWithEvents}`,
		GEO.marginX,
		yi,
	);
	yi += 4;

	return Math.max(yi, y + GEO.primaryH);
}

/**
 * §3.5 — Narrative cohort primary block.
 * Top 5 dated patient-authored entries, reverse-chronological. No
 * derivation, no ranking, no frequency counts on the primary surface.
 * Software does not curate — entries shown in the order the patient
 * wrote them (newest first), truncated at 280 chars per entry.
 */
function drawNarrativeCohortPrimary(
	doc: jsPDF,
	_blueprint: Blueprint,
	documents: CiphraDocument[],
	periodRange: { startISO: string; endISO: string },
	t: TranslateFn,
	locale: string,
	y: number,
): number {
	const notes = extractPatientNotes(documents, periodRange);

	// Section heading is the only "label" we add — no count, no summary.
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.head);
	doc.setTextColor(...INK.primary);
	doc.text(t('handoff.diary_entries_title'), GEO.marginX, y + 4);

	if (notes.length === 0) {
		doc.setFont('helvetica', 'italic');
		doc.setFontSize(TYPE.body);
		doc.setTextColor(...INK.muted);
		doc.text(t('handoff.no_entries_in_period'), GEO.marginX, y + 12);
		return y + GEO.primaryH;
	}

	let yi = y + 10;
	const shown = notes.slice(0, 5);
	for (const n of shown) {
		const dateLabel = formatDateLocale(new Date(n.dateISO), locale);
		// Date row — bold, small.
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(TYPE.compact);
		doc.setTextColor(...INK.primary);
		doc.text(dateLabel, GEO.marginX, yi);
		yi += 4;

		// Entry body — quoted, wrapped, truncated to 280 chars.
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(TYPE.body);
		doc.setTextColor(...INK.primary);
		const truncated = n.text.length > 280 ? n.text.slice(0, 277) + '…' : n.text;
		const wrapped = doc.splitTextToSize(`"${truncated}"`, GEO.contentW - 6);
		doc.text(wrapped, GEO.marginX + 3, yi);
		yi += wrapped.length * 4.2 + 3;

		// Guard against running off the page area allotted to the
		// primary block. If we exceed, truncate the remaining entries
		// with a "+N not printed" suffix.
		if (yi > y + GEO.primaryH - 6) {
			const remaining = shown.length - (shown.indexOf(n) + 1) + (notes.length - shown.length);
			if (remaining > 0) {
				doc.setFont('helvetica', 'italic');
				doc.setFontSize(TYPE.compact);
				doc.setTextColor(...INK.muted);
				doc.text(
					t('handoff.entries_truncated', { n: String(remaining) }),
					GEO.marginX,
					y + GEO.primaryH - 2,
				);
			}
			return y + GEO.primaryH;
		}
	}

	if (notes.length > shown.length) {
		doc.setFont('helvetica', 'italic');
		doc.setFontSize(TYPE.compact);
		doc.setTextColor(...INK.muted);
		doc.text(
			t('handoff.entries_truncated', { n: String(notes.length - shown.length) }),
			GEO.marginX,
			yi + 2,
		);
		yi += 6;
	}

	return Math.max(yi, y + GEO.primaryH);
}

/**
 * Cohorts whose primary block already contains the patient-authored
 * entries (narrative diaries, custom inventory). They suppress the
 * secondary `drawPatientNotes` block at the page bottom so we don't
 * duplicate the same content.
 */
function cohortAbsorbsNotes(blueprint: Blueprint): boolean {
	// Vital-pinned blueprints always use the vital primary block, even
	// if their cohort family happens to be 'narrative' (none today, but
	// future presets might). The vital block does not include the notes.
	if (blueprint.primaryBrowseSurface === 'trend') return false;
	const c = cohortOf(blueprint);
	return c === 'narrative' || c === 'custom';
}

/**
 * §3.6 — Custom cohort primary block.
 * Inventory table (`Type · Entries · Date span`) + 5 most recent
 * dated patient-authored entries. Safe fallback: no chart, no
 * aggregate beyond raw counts. The system does not pretend to know
 * the clinical shape of an unknown notebook.
 */
function drawCustomCohortPrimary(
	doc: jsPDF,
	blueprint: Blueprint,
	documents: CiphraDocument[],
	periodRange: { startISO: string; endISO: string },
	t: TranslateFn,
	locale: string,
	y: number,
): number {
	// Inventory — fixed categories present in every blueprint. Each row
	// is a raw count + date span over the selected period. No ranking,
	// no derivation.
	const inventory = computeCustomInventory(documents, blueprint, periodRange);

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.head);
	doc.setTextColor(...INK.primary);
	doc.text(t('handoff.inventory_title'), GEO.marginX, y + 4);

	let yi = y + 10;

	// Inventory header row.
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.compact);
	doc.setTextColor(...INK.primary);
	doc.text(t('handoff.inv_col_type'), GEO.marginX, yi);
	doc.text(t('handoff.inv_col_count'), GEO.marginX + 90, yi);
	doc.text(t('handoff.inv_col_span'), GEO.marginX + 115, yi);
	yi += 1.5;

	doc.setDrawColor(...INK.hairline);
	doc.setLineWidth(0.15);
	doc.line(GEO.marginX, yi, GEO.pageW - GEO.marginX, yi);
	yi += 4;

	// Inventory body — raw counts, never ranked.
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.compact);
	for (const row of inventory) {
		doc.setTextColor(...INK.primary);
		doc.text(t(row.labelKey), GEO.marginX, yi);
		doc.text(String(row.count), GEO.marginX + 90, yi);
		if (row.count > 0 && row.firstISO && row.lastISO) {
			const span = `${formatDateLocale(new Date(row.firstISO), locale)} – ${formatDateLocale(new Date(row.lastISO), locale)}`;
			doc.text(span, GEO.marginX + 115, yi);
		} else {
			doc.setTextColor(...INK.muted);
			doc.text('—', GEO.marginX + 115, yi);
		}
		yi += 4;
	}

	yi += 4;
	doc.setDrawColor(...INK.hairline);
	doc.setLineWidth(0.15);
	doc.line(GEO.marginX, yi, GEO.pageW - GEO.marginX, yi);
	yi += 5;

	// Recent entries — same selection as the narrative block but capped
	// at 5 with a shorter per-entry truncation since the inventory has
	// already eaten part of the primary-block height budget.
	const notes = extractPatientNotes(documents, periodRange);
	if (notes.length > 0) {
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(TYPE.compact);
		doc.setTextColor(...INK.primary);
		doc.text(t('handoff.recent_entries_title'), GEO.marginX, yi);
		yi += 5;

		doc.setFont('helvetica', 'normal');
		doc.setFontSize(TYPE.compact);
		doc.setTextColor(...INK.primary);
		const shown = notes.slice(0, 5);
		for (const n of shown) {
			const dateLabel = formatDateLocale(new Date(n.dateISO), locale);
			const truncated = n.text.length > 120 ? n.text.slice(0, 117) + '…' : n.text;
			const wrapped = doc.splitTextToSize(`${dateLabel} · "${truncated}"`, GEO.contentW);
			doc.text(wrapped, GEO.marginX, yi);
			yi += wrapped.length * 3.6 + 1;
			if (yi > y + GEO.primaryH - 6) break;
		}
		if (notes.length > shown.length) {
			doc.setFont('helvetica', 'italic');
			doc.setTextColor(...INK.muted);
			doc.text(
				t('handoff.entries_truncated', { n: String(notes.length - shown.length) }),
				GEO.marginX,
				yi,
			);
			yi += 4;
		}
	}

	return Math.max(yi, y + GEO.primaryH);
}

interface InventoryRow {
	labelKey: string;
	count: number;
	firstISO?: string;
	lastISO?: string;
}

export function computeCustomInventory(
	documents: CiphraDocument[],
	blueprint: Blueprint,
	periodRange: { startISO: string; endISO: string },
): InventoryRow[] {
	// One row per data category: entries (logs), episodes (count),
	// vitals (any value), triggers (any logged), notes (patient text).
	const rows: InventoryRow[] = [];
	const inPeriod = (iso: string): boolean =>
		iso.length === 10 && iso >= periodRange.startISO && iso <= periodRange.endISO;

	let entriesCount = 0;
	let episodesCount = 0;
	let vitalsCount = 0;
	let triggersCount = 0;
	let notesCount = 0;
	const dateSpans: Record<string, { first: string; last: string }> = {
		entries: { first: '', last: '' },
		episodes: { first: '', last: '' },
		vitals: { first: '', last: '' },
		triggers: { first: '', last: '' },
		notes: { first: '', last: '' },
	};

	function updateSpan(category: string, iso: string): void {
		const s = dateSpans[category];
		if (!s.first || iso < s.first) s.first = iso;
		if (!s.last || iso > s.last) s.last = iso;
	}

	for (const d of documents) {
		const data = d.data as Record<string, unknown> & { date?: string; type?: string };
		const dateISO = String(data?.date || '');
		if (!inPeriod(dateISO)) continue;
		if (data?.type !== 'entry') continue;

		entriesCount += 1;
		updateSpan('entries', dateISO);

		const episodes = (data as Record<string, unknown>).episodes;
		if (episodes && typeof episodes === 'object') {
			const total = Object.values(episodes as Record<string, unknown>)
				.map((v) => Number(v))
				.filter((n) => Number.isFinite(n) && n > 0)
				.reduce((a, b) => a + b, 0);
			if (total > 0) {
				episodesCount += total;
				updateSpan('episodes', dateISO);
			}
		}

		const vitals = (data as Record<string, unknown>).vitals;
		if (vitals && typeof vitals === 'object') {
			for (const v of Object.values(vitals as Record<string, unknown>)) {
				if (parseFirstNumber(v) !== null) {
					vitalsCount += 1;
					updateSpan('vitals', dateISO);
					break;
				}
			}
		}

		const triggers = (data as Record<string, unknown>).triggers;
		if (triggers && Array.isArray(triggers) && triggers.length > 0) {
			triggersCount += 1;
			updateSpan('triggers', dateISO);
		} else if (triggers && typeof triggers === 'object') {
			const anyOn = Object.values(triggers as Record<string, unknown>).some((v) => !!v);
			if (anyOn) {
				triggersCount += 1;
				updateSpan('triggers', dateISO);
			}
		}

		for (const k of ['notes', 'narrative', 'diary', 'text']) {
			const v = (data as Record<string, unknown>)[k];
			if (typeof v === 'string' && v.trim().length > 0) {
				notesCount += 1;
				updateSpan('notes', dateISO);
				break;
			}
		}
	}

	rows.push({ labelKey: 'handoff.inv_row_entries', count: entriesCount, firstISO: dateSpans.entries.first || undefined, lastISO: dateSpans.entries.last || undefined });
	if (blueprint.episodeTypes && blueprint.episodeTypes.length > 0) {
		rows.push({ labelKey: 'handoff.inv_row_episodes', count: episodesCount, firstISO: dateSpans.episodes.first || undefined, lastISO: dateSpans.episodes.last || undefined });
	}
	if (blueprint.vitals && blueprint.vitals.length > 0) {
		rows.push({ labelKey: 'handoff.inv_row_vitals', count: vitalsCount, firstISO: dateSpans.vitals.first || undefined, lastISO: dateSpans.vitals.last || undefined });
	}
	if (blueprint.triggers && blueprint.triggers.length > 0) {
		rows.push({ labelKey: 'handoff.inv_row_triggers', count: triggersCount, firstISO: dateSpans.triggers.first || undefined, lastISO: dateSpans.triggers.last || undefined });
	}
	rows.push({ labelKey: 'handoff.inv_row_notes', count: notesCount, firstISO: dateSpans.notes.first || undefined, lastISO: dateSpans.notes.last || undefined });
	return rows;
}

/* ─── Aggregators (pure, testable) ─── */

interface PatientNote {
	dateISO: string;
	text: string;
}

export function extractPatientNotes(
	documents: CiphraDocument[],
	periodRange: { startISO: string; endISO: string },
): PatientNote[] {
	const out: PatientNote[] = [];
	for (const d of documents) {
		const data = d.data as Record<string, unknown> & { date?: string };
		const dateISO = String(data?.date || '');
		if (!dateISO || dateISO < periodRange.startISO || dateISO > periodRange.endISO) continue;
		// Pull patient-authored free text from common fields. Each doc
		// may have notes / narrative / diary depending on cohort.
		const candidates = ['notes', 'narrative', 'diary', 'text'];
		for (const key of candidates) {
			const v = data?.[key];
			if (typeof v === 'string' && v.trim().length > 0) {
				out.push({ dateISO, text: v.trim() });
				break;
			}
		}
	}
	// Most recent first.
	out.sort((a, b) => b.dateISO.localeCompare(a.dateISO));
	return out;
}

interface VitalDraw {
	dateISO: string;
	value: number;
}

export function extractVitalDraws(
	documents: CiphraDocument[],
	vitalId: string,
	periodRange: { startISO: string; endISO: string },
): VitalDraw[] {
	const out: VitalDraw[] = [];
	for (const d of documents) {
		const data = d.data as Record<string, unknown> & { date?: string; vitals?: Record<string, unknown> };
		const dateISO = String(data?.date || '');
		if (!dateISO || dateISO < periodRange.startISO || dateISO > periodRange.endISO) continue;
		const vitals = (data?.vitals || {}) as Record<string, unknown>;
		const raw = vitals[vitalId];
		const numeric = parseFirstNumber(raw);
		if (numeric === null) continue;
		out.push({ dateISO, value: numeric });
	}
	out.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
	return out;
}

function parseFirstNumber(raw: unknown): number | null {
	if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
	if (typeof raw !== 'string') return null;
	// Multi-entry vitals may be stored as JSON array of values.
	if (raw.startsWith('[')) {
		try {
			const arr = JSON.parse(raw);
			if (Array.isArray(arr) && arr.length > 0) {
				const n = Number(arr[0]);
				return Number.isFinite(n) ? n : null;
			}
		} catch { /* fall through */ }
	}
	const n = parseFloat(raw);
	return Number.isFinite(n) ? n : null;
}

interface DoseChange {
	dateISO: string;
	medication: string;
	fromDose: number | string;
	toDose: number | string;
	unit: string;
}

/**
 * Detects medication-dose changes from the document stream. Looks for
 * `treatment_change` events (future schema, §12.4) and falls back to
 * day-over-day diff of the medication log in current schema.
 */
export function extractDoseChanges(
	documents: CiphraDocument[],
	blueprint: Blueprint,
	periodRange: { startISO: string; endISO: string },
): DoseChange[] {
	const out: DoseChange[] = [];
	// Future-schema path.
	for (const d of documents) {
		const data = d.data as Record<string, unknown> & { type?: string; date?: string };
		if (data?.type !== 'treatment_change') continue;
		const dateISO = String(data?.date || '');
		if (!dateISO || dateISO < periodRange.startISO || dateISO > periodRange.endISO) continue;
		const med = String((data as Record<string, unknown>).medication ?? '');
		const fromDose = (data as Record<string, unknown>).fromDose;
		const toDose = (data as Record<string, unknown>).toDose;
		const unit = String((data as Record<string, unknown>).unit ?? '');
		if (!med) continue;
		out.push({
			dateISO,
			medication: med,
			fromDose: typeof fromDose === 'number' || typeof fromDose === 'string' ? fromDose : '—',
			toDose: typeof toDose === 'number' || typeof toDose === 'string' ? toDose : '—',
			unit,
		});
	}

	// Fallback: scan medication-log entries for first-occurrence per
	// medication + dose pair. Each unique (med, dose) pair within the
	// period is counted as a marker.
	const seen = new Set<string>();
	const meds = blueprint.medications ?? [];
	for (const d of documents) {
		const data = d.data as Record<string, unknown> & { date?: string; medications?: Record<string, unknown> };
		const dateISO = String(data?.date || '');
		if (!dateISO || dateISO < periodRange.startISO || dateISO > periodRange.endISO) continue;
		const medMap = (data?.medications || {}) as Record<string, unknown>;
		for (const med of meds) {
			const entry = medMap[med.id];
			if (!entry || typeof entry !== 'object') continue;
			const dose = (entry as Record<string, unknown>).dose;
			if (typeof dose !== 'string' && typeof dose !== 'number') continue;
			const key = `${med.id}:${String(dose)}`;
			if (seen.has(key)) continue;
			seen.add(key);
			// Skip the very first dose record; we only show CHANGES.
		}
	}

	out.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
	return out;
}

/* ─── Date/period helpers ─── */

export function computePeriodRange(
	year: number,
	month: number,
	scope: ReportScope,
): { startISO: string; endISO: string } {
	const end = new Date(year, month + 1, 0); // last day of month
	let start: Date;
	if (scope === 'year') {
		start = new Date(end);
		start.setFullYear(start.getFullYear() - 1);
		start.setDate(start.getDate() + 1);
	} else if (scope === '2years') {
		start = new Date(end);
		start.setFullYear(start.getFullYear() - 2);
		start.setDate(start.getDate() + 1);
	} else {
		start = new Date(year, month, 1);
	}
	return { startISO: formatDateISO(start), endISO: formatDateISO(end) };
}

function formatDateISO(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

function formatDateLocale(d: Date, locale: string): string {
	return d.toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function firstNameOrFallback(username: string, blueprint: Blueprint, t: TranslateFn): string {
	if (username && username.trim().length > 0) {
		// Capitalize first letter; leave the rest as the user wrote it.
		const u = username.trim();
		return u.charAt(0).toUpperCase() + u.slice(1);
	}
	if (blueprint.conditionLabel) return t(blueprint.conditionLabel);
	return t('handoff.author_fallback');
}

// Silence unused-import warning when autoTable is later wired in.
void autoTable;
