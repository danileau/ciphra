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

	// Patient notes block (§2 block 5).
	const notesStartY = cursorY;
	cursorY = drawPatientNotes(doc, blueprint, documents, periodRange, t, locale, notesStartY);

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

function drawEpisodeCohortPrimary(
	doc: jsPDF,
	blueprint: Blueprint,
	_documents: CiphraDocument[],
	_periodRange: { startISO: string; endISO: string },
	t: TranslateFn,
	_locale: string,
	y: number,
): number {
	return drawStubPrimary(doc, t('handoff.cohort_stub_episode'), y);
}

function drawCycleCohortPrimary(
	doc: jsPDF,
	_blueprint: Blueprint,
	_documents: CiphraDocument[],
	_periodRange: { startISO: string; endISO: string },
	t: TranslateFn,
	_locale: string,
	y: number,
): number {
	return drawStubPrimary(doc, t('handoff.cohort_stub_cycle'), y);
}

function drawPhaseCohortPrimary(
	doc: jsPDF,
	_blueprint: Blueprint,
	_documents: CiphraDocument[],
	_periodRange: { startISO: string; endISO: string },
	t: TranslateFn,
	_locale: string,
	y: number,
): number {
	return drawStubPrimary(doc, t('handoff.cohort_stub_phase'), y);
}

function drawNarrativeCohortPrimary(
	doc: jsPDF,
	_blueprint: Blueprint,
	_documents: CiphraDocument[],
	_periodRange: { startISO: string; endISO: string },
	t: TranslateFn,
	_locale: string,
	y: number,
): number {
	return drawStubPrimary(doc, t('handoff.cohort_stub_narrative'), y);
}

function drawCustomCohortPrimary(
	doc: jsPDF,
	_blueprint: Blueprint,
	_documents: CiphraDocument[],
	_periodRange: { startISO: string; endISO: string },
	t: TranslateFn,
	_locale: string,
	y: number,
): number {
	return drawStubPrimary(doc, t('handoff.cohort_stub_custom'), y);
}

function drawStubPrimary(doc: jsPDF, label: string, y: number): number {
	doc.setFont('helvetica', 'italic');
	doc.setFontSize(TYPE.body);
	doc.setTextColor(...INK.muted);
	doc.text(label, GEO.marginX, y + 8);
	return y + GEO.primaryH;
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
