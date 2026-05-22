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

/** Neutral palette + brand-identity tokens (never value-encoded). */
const INK = {
	primary: [0, 0, 0] as [number, number, number],
	muted: [110, 110, 110] as [number, number, number],
	hairline: [180, 180, 180] as [number, number, number],
	/** Brick — used ONLY for the brand asterisk. Never on data. */
	brandAsterisk: [178, 60, 44] as [number, number, number],
	/** Olive — used for brand chrome (patient-quote left rule). */
	brandOlive: [127, 130, 27] as [number, number, number],
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
	// The 90-day window is the universal data window across every
	// cohort primary block — it's what the doctor actually sees in the
	// density strip / sparkline / calendar. The identity block shows
	// this window so the header matches the data below it (R4 design).
	const dataWindow = computeCalendarWindow(periodRange, 90);

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
	cursorY = drawIdentityBlock(doc, blueprint, username, dataWindow, locale, t, cursorY);

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

/**
 * §2 block 1 — Header line. ciphra brand mark on the left, artifact
 * label + date in muted weight to the right.
 *
 * The asterisk is rendered as a brick-colored "*" glyph immediately
 * after "ciphra" with no space, matching the app's wordmark. Full path-
 * drawn asterisk with 8° tilt is a future upgrade (see §15 / brand
 * identity). For now the glyph achieves brand presence at all locales.
 */
export function drawHandoffHeader(
	doc: jsPDF,
	exportDate: Date,
	locale: string,
	t: TranslateFn,
): number {
	const baselineY = GEO.marginTop + 5;

	// "ciphra" wordmark — bold, textPrimary.
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.body);
	doc.setTextColor(...INK.primary);
	const brandText = t('handoff.brand_label');
	doc.text(brandText, GEO.marginX, baselineY);

	// Asterisk in brick, immediately after the wordmark (no space).
	const brandTextW = doc.getTextWidth(brandText);
	doc.setTextColor(...INK.brandAsterisk);
	doc.setFont('helvetica', 'bold');
	doc.text('*', GEO.marginX + brandTextW + 0.4, baselineY);

	// Artifact label + date — muted, separated by ·.
	const asteriskW = doc.getTextWidth('*');
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.compact);
	doc.setTextColor(...INK.muted);
	const labelText = `  ${t('handoff.artifact_label')}`;
	doc.text(labelText, GEO.marginX + brandTextW + asteriskW + 1, baselineY);

	const dateText = formatDateLocale(exportDate, locale);
	doc.text(dateText, GEO.pageW - GEO.marginX, baselineY, { align: 'right' });

	return GEO.marginTop + GEO.headerH;
}

/**
 * §2 block 2 — Patient top line. Free-text quote with author + date,
 * rendered with a 3pt olive left rule running the full block height.
 *
 * If the patient passed no text, the block collapses entirely (returns
 * y unchanged). R4 convergence: software does NOT narrate absence;
 * "[no note provided]" leads the page with failure and was killed.
 */
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
	const hasText = text.trim().length > 0;
	if (!hasText) {
		// Collapse the block. Caller's cursor stays put; downstream
		// blocks shift upward and white space accumulates at the bottom.
		return y;
	}

	const author = firstNameOrFallback(username, blueprint, t);
	const dateLabel = formatDateLocale(new Date(dateISO), locale);
	const safeText = text.trim().slice(0, 180);

	// Olive 3pt left rule running the full block height (~16mm).
	const ruleX = GEO.marginX;
	const ruleY1 = y + 1;
	const ruleY2 = y + GEO.topLineH - 1;
	doc.setDrawColor(...INK.brandOlive);
	doc.setLineWidth(1.06); // 3pt ≈ 1.06mm
	doc.line(ruleX, ruleY1, ruleX, ruleY2);

	// Reset line width for downstream renderers.
	doc.setLineWidth(0.2);

	// Content indented 4mm past the rule for breathing room.
	const textX = GEO.marginX + 4;
	const textW = GEO.contentW - 4;

	// Header line: "Hans schrieb am 18. Mai 2026:" — 11pt bold.
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.topLine);
	doc.setTextColor(...INK.primary);
	doc.text(`${author} ${t('handoff.wrote_at')} ${dateLabel}:`, textX, y + 5);

	// Quote body — 11pt italic regular, wrapped within textW.
	doc.setFont('helvetica', 'italic');
	const wrapped = doc.splitTextToSize(`„${safeText}"`, textW);
	doc.text(wrapped, textX, y + 11);
	doc.setFont('helvetica', 'normal'); // reset

	return y + GEO.topLineH;
}

/**
 * §2 block 3 — Identity (brand-voice line + capitalized name).
 *
 * Two lines, 8pt muted. Brand-voice phrasing (Notizbuch / Zeitraum)
 * instead of admin-clinical labels (Patient / Locale). The locale tag
 * was dropped — clinically irrelevant, looked like raw debug output.
 */
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

	// Line 1 — notebook + period in brand voice.
	const line1 = `${t('handoff.notebook_label')}: ${conditionLabel}  ·  ${t('handoff.period_label')}: ${periodLabel}`;
	doc.text(line1, GEO.marginX, y + 3);

	// Line 2 — capitalized name only. No DOB (ciphra doesn't store it).
	const displayName = capitalizeName(username);
	if (displayName) {
		doc.text(displayName, GEO.marginX, y + 7);
	}

	return y + GEO.identityH;
}

function capitalizeName(raw: string): string {
	if (!raw) return '';
	return raw
		.split(/\s+/)
		.map((part) => (part.length === 0 ? '' : part[0].toUpperCase() + part.slice(1).toLowerCase()))
		.join(' ')
		.trim();
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
 * §3.2 — Episode cohort primary block. v2 design (campfire v2 R4
 * convergence, 2026-05-22). Density strip + Ereignisliste, NOT the
 * 91-cell calendar grid the v1 spec used.
 *
 * Why the change: rendering Hans through v1 produced a page that read
 * as EMPTY (91 hairline cells dominate the visual weight; 2 real events
 * become visual dust). All three campfire v2 buddies independently
 * diagnosed this. The fix is a horizontal density strip + a separate
 * Ereignisliste section with full German event labels, not 2-letter
 * codes inside cells.
 *
 * Layout:
 *   - Section title: "ANFÄLLE — Letzte 90 Tage (Anzahl: N)" 11pt bold.
 *   - Horizontal density strip: 90-day axis with filled markers at
 *     proportional date positions. Each marker is ~0.7mm radius black.
 *   - Ereignisliste: 7pt bold heading + one row per event in 8pt:
 *     "{date}  {full label}".
 *   - Comparison row at 7pt muted: "Vorher: P · Diese Periode: T".
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
	const window = computeCalendarWindow(periodRange, 90);
	const previous = computePreviousWindow(window);
	const events = extractEpisodeEvents(documents, blueprint, window, t);
	const thisCount = events.length;
	const prevCount = countEpisodesInWindow(documents, blueprint, previous);

	// Section title with inline count (Split 2 = Option A INLINE).
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.head);
	doc.setTextColor(...INK.primary);
	const titleText = `${t('handoff.episodes_title_base').toUpperCase()} — ${t('handoff.last_90_days')} (${t('handoff.count_label')}: ${thisCount})`;
	doc.text(titleText, GEO.marginX, y + 4);

	// Density strip — horizontal axis with markers.
	const stripTopY = y + 14;
	drawDensityStrip(doc, GEO.marginX, stripTopY, GEO.contentW, window, events, locale);
	const stripBottomY = stripTopY + 14; // axis + marker zone + labels

	// Ereignisliste section.
	let yi = stripBottomY + 4;
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.compact);
	doc.setTextColor(...INK.primary);
	doc.text(t('handoff.events_list_title'), GEO.marginX, yi);
	yi += 4;

	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.table);
	doc.setTextColor(...INK.primary);
	if (events.length === 0) {
		doc.setFont('helvetica', 'italic');
		doc.setTextColor(...INK.muted);
		doc.text(t('handoff.no_episodes_in_period'), GEO.marginX, yi);
		yi += 4;
		doc.setFont('helvetica', 'normal');
		doc.setTextColor(...INK.primary);
	} else {
		// Cap at 8 events for the page-1 list. Surplus events overflow with
		// a "+N not printed on this page" suffix per §1.1.
		const shown = events.slice(0, 8);
		for (const ev of shown) {
			const dateLabel = formatDateLocale(new Date(ev.dateISO), locale);
			doc.text(`${dateLabel}    ${ev.label}`, GEO.marginX, yi);
			yi += 4;
		}
		if (events.length > shown.length) {
			doc.setFont('helvetica', 'italic');
			doc.setFontSize(TYPE.compact);
			doc.setTextColor(...INK.muted);
			doc.text(
				t('handoff.events_truncated', { n: String(events.length - shown.length) }),
				GEO.marginX,
				yi,
			);
			yi += 4;
		}
	}

	// Comparison row — 7pt muted, plain text. No banned-word derivation.
	yi += 2;
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.compact);
	doc.setTextColor(...INK.muted);
	doc.text(
		`${t('handoff.previous_short')}: ${prevCount}  ·  ${t('handoff.this_window_short')}: ${thisCount}`,
		GEO.marginX,
		yi,
	);
	yi += 4;

	return Math.max(yi, y + GEO.primaryH);
}

interface EpisodeEvent {
	dateISO: string;
	/** i18n-resolved full label (e.g. "Anfall mit Bewusstseinsverlust"). */
	label: string;
}

/**
 * Flatten patient-logged episodes into a chronological event stream
 * (instead of grouping by day like the legacy calendar aggregator).
 * Each non-zero `episodes[id]` count contributes that many events,
 * each carrying the resolved full label. Same-day same-type events
 * share a date — the density strip handles spatial overlap via
 * marker rendering, not the data structure.
 */
export function extractEpisodeEvents(
	documents: CiphraDocument[],
	blueprint: Blueprint,
	window: { startISO: string; endISO: string },
	t: TranslateFn,
): EpisodeEvent[] {
	const out: EpisodeEvent[] = [];
	const epTypes = blueprint.episodeTypes ?? [];

	for (const d of documents) {
		const data = d.data as Record<string, unknown> & { date?: string; episodes?: Record<string, unknown> };
		const dateISO = String(data?.date || '');
		if (!dateISO || dateISO < window.startISO || dateISO > window.endISO) continue;
		const eps = data?.episodes;
		if (!eps || typeof eps !== 'object') continue;

		for (const ep of epTypes) {
			const raw = (eps as Record<string, unknown>)[ep.id];
			const n = Number(raw);
			if (!Number.isFinite(n) || n <= 0) continue;
			const label = (ep.label && t(ep.label)) || ep.label || ep.id;
			for (let i = 0; i < n; i++) {
				out.push({ dateISO, label });
			}
		}
	}
	out.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
	return out;
}

/**
 * Horizontal density strip. Renders a thin axis line from window start
 * to window end, with filled black circles at each event's proportional
 * date position. Date labels at the two endpoints; per-marker dates are
 * picked up by the Ereignisliste section below, not duplicated here.
 */
export function drawDensityStrip(
	doc: jsPDF,
	x: number,
	y: number,
	w: number,
	window: { startISO: string; endISO: string },
	events: EpisodeEvent[],
	locale: string,
): void {
	const start = parseISO(window.startISO);
	const end = parseISO(window.endISO);
	const totalMs = end.getTime() - start.getTime() || 1;

	// Axis line.
	doc.setDrawColor(...INK.primary);
	doc.setLineWidth(0.5);
	const axisY = y + 4;
	doc.line(x, axisY, x + w, axisY);

	// Endpoint date labels — small, muted, just above the axis line.
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.axis);
	doc.setTextColor(...INK.muted);
	doc.text(formatDateLocale(start, locale), x, axisY - 1.5);
	doc.text(formatDateLocale(end, locale), x + w, axisY - 1.5, { align: 'right' });

	// Event markers — proportional position, filled black circles.
	doc.setFillColor(...INK.primary);
	for (const ev of events) {
		const evDate = parseISO(ev.dateISO);
		const fraction = (evDate.getTime() - start.getTime()) / totalMs;
		const cx = x + Math.max(0, Math.min(1, fraction)) * w;
		doc.circle(cx, axisY, 0.9, 'F');
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

function parseISO(iso: string): Date {
	const [y, m, d] = iso.split('-').map(Number);
	return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function formatDateISOFromDate(d: Date): string {
	return formatDateISO(d);
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
 * Until a phase-logging UI lands, phase cohorts reuse the v2 episode
 * primitives (density strip + Ereignisliste) — the patient's logged
 * episode events are the most-honest available signal.
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
	const events = extractEpisodeEvents(documents, blueprint, window, t);
	const thisCount = events.length;
	const prevCount = countEpisodesInWindow(documents, blueprint, previous);

	// Section title (uses phase wording instead of "ANFÄLLE").
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.head);
	doc.setTextColor(...INK.primary);
	const titleText = `${t('handoff.phase_title').toUpperCase()} (${t('handoff.count_label')}: ${thisCount})`;
	doc.text(titleText, GEO.marginX, y + 4);

	// Density strip + Ereignisliste (same primitive as episode cohort).
	const stripTopY = y + 14;
	drawDensityStrip(doc, GEO.marginX, stripTopY, GEO.contentW, window, events, locale);
	const stripBottomY = stripTopY + 14;

	let yi = stripBottomY + 4;
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.compact);
	doc.setTextColor(...INK.primary);
	doc.text(t('handoff.events_list_title'), GEO.marginX, yi);
	yi += 4;

	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.table);
	doc.setTextColor(...INK.primary);
	if (events.length === 0) {
		doc.setFont('helvetica', 'italic');
		doc.setTextColor(...INK.muted);
		doc.text(t('handoff.no_episodes_in_period'), GEO.marginX, yi);
		yi += 4;
	} else {
		const shown = events.slice(0, 8);
		for (const ev of shown) {
			const dateLabel = formatDateLocale(new Date(ev.dateISO), locale);
			doc.text(`${dateLabel}    ${ev.label}`, GEO.marginX, yi);
			yi += 4;
		}
		if (events.length > shown.length) {
			doc.setFont('helvetica', 'italic');
			doc.setFontSize(TYPE.compact);
			doc.setTextColor(...INK.muted);
			doc.text(
				t('handoff.events_truncated', { n: String(events.length - shown.length) }),
				GEO.marginX,
				yi,
			);
			yi += 4;
		}
	}

	yi += 2;
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.compact);
	doc.setTextColor(...INK.muted);
	doc.text(
		`${t('handoff.previous_short')}: ${prevCount}  ·  ${t('handoff.this_window_short')}: ${thisCount}`,
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

/**
 * German-style date: "22. Mai 2026". Uses month NAME (short form),
 * not digits — the v2 design treats this as part of brand voice. The
 * legacy "5/22/2026" US locale leak was an experience-crushing detail
 * surfaced in the v2 R1 critique.
 */
function formatDateLocale(d: Date, locale: string): string {
	return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
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
