/**
 * ciphra — PDF Report Generator
 *
 * All four PDF exports share a single visual system driven by the BRAND
 * palette below and three small helpers: `drawWordmark`, `drawHeaderBand`,
 * `drawFooter`. The feeling: a clinic-facing handout — warm paper,
 * ochre data, brick accents, olive status — never flashy.
 *
 * New string keys are added to en.ts only; DE/FR/IT fall back to English
 * until translated. Keys added here (TODO translate):
 *   pdf.grid_title, pdf.export_date, pdf.account, pdf.days_logged_short,
 *   pdf.total_episodes_short, pdf.symptom_entries, pdf.totals,
 *   pdf.percent_of_days, pdf.compared_to_prev,
 *   pdf.recovery_step_1, pdf.recovery_step_2, pdf.recovery_step_3,
 *   pdf.family_how_to_accept, pdf.family_step_1, pdf.family_step_2,
 *   pdf.family_step_3, pdf.family_code_label, pdf.family_url_label,
 *   pdf.disclaimer_medical
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Blueprint, VitalField } from '$lib/blueprint';
import { isCustomItem, resolveBlueprint, resolveMedDisplay, bedarfMedColumns, medAdherence } from '$lib/blueprint';
import { cohortOf } from '$lib/blueprint/cohort';
import { COHORT_PALETTE_RGB, CHART_ONLY_TONES } from '$lib/cohortPalette';
import { sectionsForCohort } from '$lib/cohortSections';
import { aggregatePhaseDistribution } from '$lib/pdfPhaseDistribution';
import { aggregateCycleStrip } from '$lib/pdfCycleStrip';
import { aggregateDailyMonthSeries } from '$lib/pdfDailyMonthChart';
import { PHASE_COLORS, type Phase } from '$lib/cycleState';
import type { CiphraDocument } from '$lib/stores/documents';
import { translateUnit } from '$lib/i18n';
import { isExportable } from '$lib/utils/exportable';
import { noteMarkerText, noteMarkersInWindow } from '$lib/reports/noteMarkers';
import { formatDateChoice, formatISODateChoice, type DateFormatChoice } from '$lib/blueprint/preferences';
import {
	reportWindow,
	formatWindowRange,
	scopeFileTag,
	type ReportScope,
} from '$lib/reports/reportWindow';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

/** CIPH-882 — Discriminator helper: custom items own a literal label string,
 *  preset items own an i18n key. Centralizing this as `labelOf` collapses
 *  the diff across the ~26 PDF/CSV label-rendering sites. */
function labelOf(t: TranslateFn, item: { id: string; label: string }): string {
	return isCustomItem(item.id) ? item.label : t(item.label);
}

/** CIPH-882 — Vital labels follow the same custom-vs-preset rule. */
function vitalLabelOf(t: TranslateFn, v: VitalField): string {
	return isCustomItem(v.id) ? v.label : t(v.label);
}
type RGB = [number, number, number];

/* ────────────────────────────────────────────────────────────────
 * Brand tokens — print-safe approximations of the on-screen palette.
 * Brick is slightly desaturated vs. #b23c2c for CMYK.
 * ──────────────────────────────────────────────────────────────── */

const BRAND: Record<string, RGB> = {
	paper: [250, 248, 246],
	paperInset: [237, 232, 227],
	card: [255, 255, 255],
	brick: [178, 70, 46],
	brickDark: [154, 51, 38],
	brickSoft: [245, 232, 230],
	ochre: [159, 99, 11],
	ochreSoft: [253, 243, 229],
	olive: [127, 130, 27],
	oliveSoft: [244, 244, 227],
	textPrimary: [44, 37, 32],
	textSecondary: [100, 89, 78],
	textMuted: [151, 145, 138],
	border: [232, 227, 221],
	borderSubtle: [240, 236, 231],
};

/**
 * DSPEC-3 — Codified type scale per PDF_DESIGN_SPEC.md §5. All body /
 * heading / numeric copy must resolve to one of these tokens; charts
 * get a separate sub-scale (axis labels need finer granularity than
 * the prose hierarchy). Page titles and other "hero" text snap down
 * to `summary` (14pt) — the spec caps named text tiers there and
 * forbids oversized hero typography (§5 "Do not use oversized hero
 * numerics", "Do not use display typography inside compact panels").
 */
const TYPE = {
	compact: 7,         // §5 compact labels / footnotes / continuation labels
	table: 8,           // §5 table text
	body: 9,            // §5 body text
	head: 11,           // §5 section heads
	summary: 14,        // §5 summary numerics (also: page titles, largest named tier)
	chartLegend: 7,     // chart legend = compact label
	chartAxis: 6,       // chart sub-scale (axis labels)
	chartAxisMicro: 5.5,// chart sub-scale (dense axis labels — 24-month minor ticks)
};

/* ────────────────────────────────────────────────────────────────
 * CIPH-pi18-2 Chunk 2 — Cohort accent resolver.
 *
 * Two data-accent tokens that the PDF historically read from `BRAND`
 * (brick + ochre) are now cohort-driven so a migraine PDF reads
 * sage-green, a cycle PDF reads rose, a phase PDF reads steel-violet,
 * etc. Discrete cohort returns the original brick/ochre values
 * verbatim — DISCRETE_TONES in cohortPalette.ts is the rust palette.
 *
 * Overrides the cohortPalette.ts "NOT TOUCHED by this story" note
 * (CIPH-890) for this file only. Print-safe contrast is enforced
 * by `pdf.cohort-accent.test.ts`.
 *
 * Semantic uses of `BRAND.brick` / `BRAND.ochre` (the "worsening" /
 * "improving" trend pill, the disclaimer strip, autoTable danger
 * cells) intentionally stay on BRAND tokens — they're status colors,
 * not data accents.
 * ──────────────────────────────────────────────────────────────── */
interface CohortAccents {
	primary: RGB;        // replaces data-accent BRAND.brick
	primarySoft: RGB;    // 12% premultiplied over BRAND.paper — replaces BRAND.ochreSoft as area-fill
	break: RGB;          // replaces data-accent BRAND.ochre (KPI episode-count tile)
}

function softBlendRgb(rgb: RGB, alpha = 0.12): RGB {
	return [
		Math.round(BRAND.paper[0] * (1 - alpha) + rgb[0] * alpha),
		Math.round(BRAND.paper[1] * (1 - alpha) + rgb[1] * alpha),
		Math.round(BRAND.paper[2] * (1 - alpha) + rgb[2] * alpha),
	];
}

function rgbToHex([r, g, b]: RGB): string {
	const h = (n: number) => n.toString(16).padStart(2, '0');
	return '#' + h(r) + h(g) + h(b);
}

/**
 * Walk the cohort's palette skipping chart-only tones to find a print-safe
 * break tone. Order: slot 1 (deeper primary variant — IN family) → slot 5
 * (shared anchor slate — out-of-family but always print-safe) → slot 3
 * (warm break — usually `#7f821b` olive, chart-only). Falls back to
 * BRAND.ochre as the universal safe default if every slot is chart-only —
 * unreachable today, but defended against future palette regressions.
 *
 * In-family is delivered for cohorts whose slot 1 is non-chart-only
 * (cycle → mulberry, custom → deep slate). For discrete/phase/narrative
 * the function isn't called because slot 2 already passes WCAG.
 */
function pickBreakFallback(tones: readonly (readonly [number, number, number])[]): RGB {
	for (const slot of [1, 5, 3] as const) {
		const candidate = [...tones[slot]] as RGB;
		if (!CHART_ONLY_TONES.has(rgbToHex(candidate))) {
			return candidate;
		}
	}
	return [...BRAND.ochre] as RGB;
}

export function resolveCohortAccents(blueprint: Blueprint): CohortAccents {
	const tones = COHORT_PALETTE_RGB[cohortOf(blueprint)];
	const primary = [...tones[0]] as RGB;
	let breakTone = [...tones[2]] as RGB;
	// Slot 2 carries the "warm break" role used by the episode-count KPI
	// tile + monthly grid pill. Three cohorts (discrete / phase / narrative)
	// share ochre `#9f630b` here, which passes WCAG AA against paper. Cycle
	// and custom diverge into clay tones that pass the 3:1 chart floor but
	// FAIL the 4.5:1 text floor — they're listed in `CHART_ONLY_TONES`. Fall
	// back to a non-chart-only slot inside the same cohort family so the
	// PDF stays tonally coherent (cycle → mulberry, custom → deep slate).
	if (CHART_ONLY_TONES.has(rgbToHex(breakTone))) {
		breakTone = pickBreakFallback(tones);
	}
	return {
		primary,
		primarySoft: softBlendRgb(primary),
		break: breakTone,
	};
}

// CIPH-801 — data-palette hex strings for MiniSeries colors.
// Mirror of src/lib/dataPalette.ts + src/app.css --data-N. Keep in sync.
const DATA_HEX = {
	d1: '#b23c2c',
	d2: '#8a2a1f',
	d3: '#9f630b',
	d4: '#7f821b',
	d5: '#5c6b73',
	d6: '#a87559',
	danger: '#DC2626',
};

/* ────────────────────────────────────────────────────────────────
 * Shared PDF data-prep layer.
 * Aggregator helpers used by `generateDoctorPdf`. Originally split
 * out for `generateCompactPdf` (CIPH-305, dropped in CIPH-pi18-2);
 * the layer stays so any aggregation change has a single home.
 * ──────────────────────────────────────────────────────────────── */

export interface MonthBucket { y: number; m: number }

export function buildMonthBuckets(year: number, month: number, count: number): MonthBucket[] {
	const out: MonthBucket[] = [];
	for (let k = count - 1; k >= 0; k--) {
		const d = new Date(year, month - k, 1);
		out.push({ y: d.getFullYear(), m: d.getMonth() });
	}
	return out;
}

export function bucketIndexMap(buckets: MonthBucket[]): Map<string, number> {
	return new Map(buckets.map((b, i) => [`${b.y}-${String(b.m + 1).padStart(2, '0')}`, i]));
}

/** Extract numeric values for a vital on a given day's doc.
 *  Handles both single-value strings and multi-entry JSON arrays. */
export function dayVitalsShared(d: CiphraDocument | undefined, vid: string): number[] {
	const raw = d?.data?.vitals?.[vid];
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			return parsed.map((e: { value: string }) => Number(e.value)).filter((v) => !isNaN(v));
		}
	} catch { /* not JSON */ }
	const n = Number(raw);
	return isNaN(n) ? [] : [n];
}

export function aggregateVitalMonthlyShared(
	docs: CiphraDocument[],
	vid: string,
	buckets: MonthBucket[],
	idx: Map<string, number>,
	mode: 'mean' | 'max' = 'mean'
): (number | null)[] {
	const acc = buckets.map(() => ({ sum: 0, max: 0, count: 0 }));
	for (const d of docs) {
		if (d.data?.type !== 'entry') continue;
		const key = String(d.data.date || '').slice(0, 7);
		const i = idx.get(key);
		if (i === undefined) continue;
		const vals = dayVitalsShared(d, vid);
		for (const v of vals) {
			acc[i].sum += v;
			if (v > acc[i].max) acc[i].max = v;
			acc[i].count++;
		}
	}
	return acc.map((b) => (b.count > 0 ? (mode === 'mean' ? b.sum / b.count : b.max) : null));
}

export function aggregateEpisodeMonthlyShared(
	docs: CiphraDocument[],
	epId: string,
	buckets: MonthBucket[],
	idx: Map<string, number>
): number[] {
	const acc = buckets.map(() => 0);
	for (const d of docs) {
		// Include standalone `episode` quick-add docs alongside daily_log.
		if (d.data?.type !== 'entry') continue;
		const key = String(d.data.date || '').slice(0, 7);
		const i = idx.get(key);
		if (i === undefined) continue;
		const eps = (d.data?.episodes || d.data?.seizures || {}) as Record<string, number>;
		if ((eps[epId] || 0) > 0) acc[i]++;
	}
	return acc;
}

/** CIPH-301: read per-user vital target overrides from localStorage and
 *  apply them to the blueprint's `referenceLine.value`. Non-destructive —
 *  returns a shallow-modified blueprint that can be used by either PDF
 *  generator without touching the saved document. */
export function applyVitalTargetOverrides(blueprint: Blueprint, username: string): Blueprint {
	if (!username || typeof localStorage === 'undefined') return blueprint;
	let overrides: Record<string, number> = {};
	try {
		const raw = localStorage.getItem(`ciphra_vital_targets:${username}`);
		if (raw) overrides = JSON.parse(raw) || {};
	} catch { return blueprint; }
	if (!overrides || Object.keys(overrides).length === 0) return blueprint;
	const cloned: Blueprint = {
		...blueprint,
		vitals: blueprint.vitals.map((v) => {
			if (v.referenceLine && overrides[v.id] !== undefined && !isNaN(overrides[v.id])) {
				return { ...v, referenceLine: { ...v.referenceLine, value: overrides[v.id] } };
			}
			return v;
		}),
	};
	return cloned;
}

/** CIPH-301b: apply the user's wizard customizations (`blueprint.customizations`)
 *  by removing hidden symptoms/triggers/vitals from the blueprint *before*
 *  any aggregator runs. This means symptomFreq, triggerFreq, chartableVitals,
 *  and the condition-aware bullet builders all naturally skip hidden items
 *  without needing to thread filter-sets through every loop.
 *
 *  Backwards-compatible: blueprints without `customizations` (pre-301b) are
 *  returned unchanged.
 *
 *  Note: `gridSymptomColumns` is also filtered, because the grid table would
 *  otherwise still reserve a column for a hidden symptom and just print
 *  blanks for it. `gridEpisodeColumns` is left untouched — episodes are not
 *  customizable in the wizard. */
// CIPH-877 — Effective grid columns: curated + any blueprint item with ≥1
// occurrence in the visible range. Mirrors the on-screen report (reports/
// +page.svelte) so PDFs and CSVs never hide data the user actually logged.
// `datePrefix` is "YYYY-MM" for monthly, "YYYY" for yearly scope — pass the
// empty string to consider all docs unfiltered.
export function effectiveSymptomColumns(
	blueprint: Blueprint,
	docs: CiphraDocument[],
	datePrefix: string,
	excludeIds: ReadonlySet<string> = new Set(),
): string[] {
	const curated = blueprint.gridSymptomColumns.filter((id) => !excludeIds.has(id));
	const curatedSet = new Set<string>(curated);
	const extras: string[] = [];
	for (const g of blueprint.symptomGroups) {
		for (const item of g.items) {
			if (curatedSet.has(item.id) || excludeIds.has(item.id)) continue;
			const hasData = docs.some((d: any) => {
				if (d.data?.type !== 'entry') return false;
				if (datePrefix && !String(d.data?.date || '').startsWith(datePrefix)) return false;
				return !!d.data.symptoms?.[item.id];
			});
			if (hasData) extras.push(item.id);
		}
	}
	return [...curated, ...extras];
}

export function effectiveEpisodeColumns(
	blueprint: Blueprint,
	docs: CiphraDocument[],
	datePrefix: string,
): string[] {
	const curated = blueprint.gridEpisodeColumns;
	const curatedSet = new Set<string>(curated);
	const extras: string[] = [];
	for (const ep of blueprint.episodeTypes) {
		if (curatedSet.has(ep.id)) continue;
		const hasData = docs.some((d: any) => {
			if (d.data?.type !== 'entry') return false;
			if (datePrefix && !String(d.data?.date || '').startsWith(datePrefix)) return false;
			return ((d.data.episodes?.[ep.id] || d.data.seizures?.[ep.id] || 0) as number) > 0;
		});
		if (hasData) extras.push(ep.id);
	}
	return [...curated, ...extras];
}

export function applyBlueprintCustomizations(blueprint: Blueprint): Blueprint {
	// CIPH-882 — merge user-added custom items first, then apply hide-filter.
	// Order matters: a user can hide a custom item the same way they hide
	// a preset one, so the hide list filters the merged view.
	blueprint = resolveBlueprint(blueprint);
	const cz = blueprint.customizations;
	if (!cz) return blueprint;
	const hSym = new Set(cz.hiddenSymptoms || []);
	const hTrg = new Set(cz.hiddenTriggers || []);
	const hVit = new Set(cz.hiddenVitals || []);
	if (hSym.size === 0 && hTrg.size === 0 && hVit.size === 0) return blueprint;
	return {
		...blueprint,
		symptomGroups: blueprint.symptomGroups
			.map((g) => ({ ...g, items: g.items.filter((it) => !hSym.has(it.id)) }))
			.filter((g) => g.items.length > 0),
		triggers: blueprint.triggers.filter((tr) => !hTrg.has(tr.id)),
		vitals: blueprint.vitals.filter((v) => !hVit.has(v.id)),
		gridSymptomColumns: blueprint.gridSymptomColumns.filter((id) => !hSym.has(id)),
	};
}

/* ────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────── */

/**
 * The ciphra brand asterisk — three strokes through a shared centre at
 * an 8° tilt, with asymmetric arm lengths and stroke widths. Geometry is
 * lifted from `Wordmark.svelte` (arm-1 reference half-length 5.4 units,
 * width 1.3; arms 2 and 3 progressively shorter and thinner). `r` is
 * arm-1's half-length in mm; the other arms scale off it. This is the
 * real mark — it replaces the typographic "*" glyph the PDF used before.
 */
function drawAsteriskMark(doc: jsPDF, cx: number, cy: number, r: number, color: RGB): void {
	const rot = (8 * Math.PI) / 180;
	const cos = Math.cos(rot);
	const sin = Math.sin(rot);
	// Per-arm half-vector (units of arm-1 half-length 5.4) + stroke width
	// (units of 5.4 too, so width ÷ 5.4 × r gives mm). From Wordmark.svelte.
	const arms: Array<{ ex: number; ey: number; w: number }> = [
		{ ex: 1, ey: 0, w: 1.3 },
		{ ex: 2 / 5.4, ey: 3.5 / 5.4, w: 1.0 },
		{ ex: 2 / 5.4, ey: -3.3 / 5.4, w: 0.9 },
	];
	doc.setLineCap('round');
	doc.setDrawColor(...color);
	for (const a of arms) {
		const dx = a.ex * r;
		const dy = a.ey * r;
		// rotate the half-vector by the brand's 8° tilt
		const rx = dx * cos - dy * sin;
		const ry = dx * sin + dy * cos;
		doc.setLineWidth((a.w / 5.4) * r);
		doc.line(cx - rx, cy - ry, cx + rx, cy + ry);
	}
	// Reset stroke state so later rendering isn't affected.
	doc.setLineCap('butt');
	doc.setLineWidth(0.2);
}

/**
 * Draws the "ciphra*" wordmark — brand text plus the real drawn asterisk
 * (see `drawAsteriskMark`), brick on light surfaces, paper on dark.
 */
function drawWordmark(
	doc: jsPDF,
	x: number,
	y: number,
	opts: { size?: number; reverse?: boolean; align?: 'left' | 'center' } = {}
): number {
	const { size = 18, reverse = false, align = 'left' } = opts;
	const brand = 'ciphra';
	// Asterisk arm-1 half-length (mm) — matches the on-screen wordmark
	// proportion. Wordmark.svelte uses arm-1 half-length 5.4 against text
	// size 26 (ratio 0.2077); ×0.3528 converts the pt font size to mm.
	const astR = size * 0.2077 * 0.3528;
	const gap = size * 0.05;

	doc.setFont('helvetica', 'normal');
	doc.setFontSize(size);
	const brandW = doc.getTextWidth(brand);
	const totalW = brandW + gap + astR * 2;

	let startX = x;
	if (align === 'center') startX = x - totalW / 2;

	// wordmark body
	if (reverse) doc.setTextColor(255, 255, 255);
	else doc.setTextColor(...BRAND.textPrimary);
	doc.text(brand, startX, y);

	// asterisk — the real 3-arm star, raised to sit near the cap line.
	// Brick on light; paper on a dark band so it stays readable.
	drawAsteriskMark(
		doc,
		startX + brandW + gap + astR,
		y - size * 0.25,
		astR,
		reverse ? BRAND.paper : BRAND.brick
	);

	return totalW;
}

/**
 * Capitalize a display name part-by-part. `hans` → `Hans`. A lowercase
 * username reads as raw debug output in a clinical artifact.
 */
function capitalizeName(raw: string): string {
	return raw
		.split(/\s+/)
		.filter(Boolean)
		.map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase())
		.join(' ');
}

/**
 * The patient's most-recent note within `recencyDays` of the period end
 * — source of the page-1 top-line quote (CLINICAL_HANDOFF.md §4). The
 * recency window keeps a stale note from anchoring the page: a January
 * line on a May export reads as the patient's current voice when it is
 * not. A note older than the window → returns null and the caller
 * collapses the block rather than printing a placeholder (§14.1 —
 * software does not narrate absence). The window is anchored to the
 * period end, not to today, so a back-dated month report quotes a note
 * from that month.
 */
const TOP_LINE_RECENCY_DAYS = 30;
function extractLatestNote(
	documents: CiphraDocument[],
	startISO: string,
	endISO: string,
	recencyDays: number = TOP_LINE_RECENCY_DAYS
): { text: string; dateISO: string } | null {
	const cutoff = new Date(endISO + 'T12:00:00');
	cutoff.setDate(cutoff.getDate() - recencyDays);
	const cutoffISO = cutoff.toISOString().slice(0, 10);
	const lowerISO = cutoffISO > startISO ? cutoffISO : startISO;

	let best: { text: string; dateISO: string } | null = null;
	for (const d of documents) {
		if (d.data?.type !== 'entry') continue;
		const dateISO = String(d.data?.date || '');
		if (!dateISO || dateISO < lowerISO || dateISO > endISO) continue;
		const note = String(d.data?.notes || '').replace(/\s+/g, ' ').trim();
		if (!note) continue;
		if (!best || dateISO > best.dateISO) best = { text: note, dateISO };
	}
	return best;
}

/**
 * Patient top-line quote block — the page-1 human anchor. A 3pt olive
 * left rule (brand chrome, never value-encoded), a tiny uppercase
 * "ZITAT PATIENT:IN" tag (provenance — disambiguates patient self-
 * report from system-authored copy per 2026-06-07 clinician review
 * P0-2), the note in italic, a muted attribution line. Returns the
 * block's bottom Y. When `note` is null the block collapses: returns
 * `y` unchanged, no placeholder.
 */
function drawTopLineQuote(
	doc: jsPDF,
	note: { text: string; dateISO: string } | null,
	name: string,
	locale: string,
	dateChoice: DateFormatChoice | undefined,
	x: number,
	y: number,
	w: number,
	t: TranslateFn,
): number {
	if (!note) return y;

	const textX = x + 4;
	const textW = w - 4;
	const lineH = 4.0;
	// Provenance tag: small uppercase, sits above the italic body to
	// label the block unambiguously as patient self-report rather than
	// system-authored copy.
	const tagH = 3.2;
	const tagToBody = 1.6;

	doc.setFont('helvetica', 'italic');
	doc.setFontSize(TYPE.body);
	const wrapped = doc.splitTextToSize(`"${note.text.slice(0, 200)}"`, textW) as string[];
	const shown = wrapped.slice(0, 2);

	const dateLabel = formatISODateChoice(note.dateISO, dateChoice);
	const bodyTop = y + tagH + tagToBody;
	const attribY = bodyTop + shown.length * lineH + 3.0;
	const blockH = attribY - y + 1;

	// 3pt olive left rule (3pt ≈ 1.06mm).
	doc.setDrawColor(...BRAND.olive);
	doc.setLineWidth(1.06);
	doc.line(x, y, x, y + blockH);
	doc.setLineWidth(0.2);

	// Provenance tag — uppercase, muted, small.
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.chartAxisMicro);
	doc.setTextColor(...BRAND.textMuted);
	doc.text(t('pdf.quote_attribution_label'), textX, y + 2.6);

	doc.setFont('helvetica', 'italic');
	doc.setFontSize(TYPE.body);
	doc.setTextColor(...BRAND.textPrimary);
	doc.text(shown, textX, bodyTop + 3.4);

	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.compact);
	doc.setTextColor(...BRAND.textMuted);
	doc.text(name ? `— ${name}, ${dateLabel}` : `— ${dateLabel}`, textX, attribY);

	return y + blockH;
}

/**
 * DSPEC-6 — Declared component-break contracts per PDF_DESIGN_SPEC.md
 * §8. Each component type owns a `minPresence` value: the minimum space
 * (mm) it must have on the current page or it migrates to a fresh one.
 * Centralising this kills the scattered `if (cursorY > pageH - X)`
 * checks where every section guessed its own breakpoint. The numbers
 * come straight from §8.
 */
const PAGE_BOTTOM_MARGIN = 20;
const PAGE_TOP_AFTER_BREAK = 20;
const BREAK = {
	sectionHead: 24,        // §8: section head + 24mm following content
	chartTitle: 35,         // §8: chart title + legend + 35mm chart body
	tileRow: 22,            // §8: summary tile row never splits (height ~22mm)
	tableHeader: 18,        // §8: table header + 3 body rows × ~6mm
	monthlyGridHeader: 18,  // §8: month header + 1 full week row
	noteBlock: 12,          // §8: note label + first two lines
};
function reserveSpace(
	doc: jsPDF,
	cursorY: number,
	minPresence: number,
	onBreak?: () => number,
): number {
	const pageH = doc.internal.pageSize.getHeight();
	if (cursorY + minPresence > pageH - PAGE_BOTTOM_MARGIN) {
		doc.addPage();
		paintPaper(doc);
		return onBreak ? onBreak() : PAGE_TOP_AFTER_BREAK;
	}
	return cursorY;
}

/**
 * DSPEC-4 — Series marker shape + stroke pattern per series index.
 * Multi-series line charts must remain decipherable in grayscale, so
 * each series gets a unique (shape × dash) pair. Per PDF_DESIGN_SPEC.md
 * §9-10: primary circle, secondary square, third diamond, then hollow
 * variants cycle through the same shapes. Stroke pattern shifts solid
 * → dashed → dotted to give a second redundant signal.
 */
type SeriesMarkerShape = 'circle' | 'square' | 'diamond';
type SeriesStyle = {
	shape: SeriesMarkerShape;
	filled: boolean;
	dash: number[]; // empty = solid line
};
const SERIES_STYLES: SeriesStyle[] = [
	{ shape: 'circle', filled: true, dash: [] },
	{ shape: 'square', filled: true, dash: [1.2, 1.2] },
	{ shape: 'diamond', filled: true, dash: [0.4, 0.8] },
	{ shape: 'circle', filled: false, dash: [] },
	{ shape: 'square', filled: false, dash: [1.2, 1.2] },
	{ shape: 'diamond', filled: false, dash: [0.4, 0.8] },
];
function seriesStyleFor(i: number): SeriesStyle {
	return SERIES_STYLES[i % SERIES_STYLES.length];
}
function drawMarker(doc: jsPDF, x: number, y: number, r: number, shape: SeriesMarkerShape, filled: boolean): void {
	const op = filled ? 'F' : 'S';
	if (shape === 'circle') {
		doc.circle(x, y, r, op);
	} else if (shape === 'square') {
		doc.rect(x - r, y - r, r * 2, r * 2, op);
	} else {
		// Diamond — top vertex → right → bottom → left, auto-close back to top.
		const deltas: number[][] = [[r, r], [-r, r], [-r, -r]];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		doc.lines(deltas as any, x, y - r, undefined, op, true);
	}
}

/**
 * DSPEC-5 — autoTable `didDrawCell` hook factory that draws a small
 * italic continuation label on the right edge of the first head row
 * for every continuation page (per PDF_DESIGN_SPEC.md §8, §12). The
 * marker sits ABOVE the head cell so it never clashes with column
 * text; first page (data.pageNumber === 1) is untouched.
 */
function continuationLabelHook(label: string) {
	return (data: any) => {
		if (
			data.section !== 'head' ||
			data.row.index !== 0 ||
			data.pageNumber <= 1 ||
			data.column.index !== data.table.columns.length - 1
		) {
			return;
		}
		const d = data.doc as jsPDF;
		d.setFont('helvetica', 'italic');
		d.setFontSize(TYPE.compact);
		d.setTextColor(...BRAND.textMuted);
		d.text(label, data.cell.x + data.cell.width, data.cell.y - 0.8, { align: 'right' });
	};
}

/**
 * Top band used on cover-style pages (recovery, invite). Brick fill,
 * reverse wordmark on the left, page metadata on the right.
 */
function drawHeaderBand(
	doc: jsPDF,
	opts: { title: string; subtitle?: string; color?: RGB }
): number {
	const pageW = doc.internal.pageSize.getWidth();
	const h = 28;
	const fill = opts.color ?? BRAND.brick;

	doc.setFillColor(...fill);
	doc.rect(0, 0, pageW, h, 'F');

	// wordmark on left
	drawWordmark(doc, 14, 16, { size: 16, reverse: true });

	// title on right
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.summary);
	doc.setTextColor(...BRAND.paper);
	doc.text(opts.title, pageW - 14, 14, { align: 'right' });

	if (opts.subtitle) {
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(TYPE.body);
		doc.setTextColor(255, 255, 255);
		doc.text(opts.subtitle, pageW - 14, 20, { align: 'right' });
	}

	return h;
}

/**
 * Standard footer: brand line + page number + thin top border.
 * Applied to all pages of the document.
 */
/**
 * `windowLabel` repeats the report period on EVERY page.
 *
 * PDF_DESIGN_SPEC §16 asks the footer to carry "diary date range or enough
 * continuation context", and §1.10 that every page be readable
 * independently. A year export is 13 pages and a 2-year export 25; until
 * now exactly one of them said which period it covered. This is the fix for
 * the page that arrives filed, faxed or photocopied without page 1.
 */
function drawFooter(
	doc: jsPDF,
	t: TranslateFn,
	footerKey = 'pdf.footer',
	windowLabel?: string,
): void {
	const pageCount = doc.getNumberOfPages();

	for (let i = 1; i <= pageCount; i++) {
		doc.setPage(i);
		// Per-page width/height — protocol pages may be landscape.
		const pageW = doc.internal.pageSize.getWidth();
		const pageH = doc.internal.pageSize.getHeight();

		doc.setFont('helvetica', 'normal');
		doc.setFontSize(TYPE.compact);

		// The footer text wraps — the doctor PDF carries the full medical-
		// device disclaimer here (moved off page 1). The page-number column
		// is reserved on the right so the disclaimer never runs under it.
		const pageLabel = windowLabel
			? `${windowLabel} · ${t('pdf.page', { current: i, total: pageCount })}`
			: t('pdf.page', { current: i, total: pageCount });
		const pageLabelW = doc.getTextWidth(pageLabel);
		const lines = doc.splitTextToSize(t(footerKey), pageW - 28 - pageLabelW - 6) as string[];
		const lineH = 3.2;
		const dividerY = pageH - 7 - lines.length * lineH;

		doc.setDrawColor(...BRAND.border);
		doc.setLineWidth(0.2);
		doc.line(14, dividerY, pageW - 14, dividerY);

		doc.setTextColor(...BRAND.textMuted);
		doc.text(lines, 14, dividerY + 3.4);
		doc.text(pageLabel, pageW - 14, dividerY + 3.4, { align: 'right' });
	}
}

/** Paint a warm-paper background over the entire page. */
function paintPaper(doc: jsPDF): void {
	const pageW = doc.internal.pageSize.getWidth();
	const pageH = doc.internal.pageSize.getHeight();
	doc.setFillColor(...BRAND.paper);
	doc.rect(0, 0, pageW, pageH, 'F');
}

/** Asterisk watermark pattern — background texture for cover pages. */
function drawWatermarkPattern(doc: jsPDF): void {
	const pageW = doc.internal.pageSize.getWidth();
	const pageH = doc.internal.pageSize.getHeight();
	// very light ink — display-graphic watermark, not text typography, so
	// it sits outside the TYPE scale by design.
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(48);
	doc.setTextColor(235, 228, 222); // 3-5% effective contrast
	const step = 40;
	for (let y = 50; y < pageH - 20; y += step) {
		for (let x = 10; x < pageW; x += step) {
			// stagger alternating rows
			const ox = (y / step) % 2 === 0 ? 0 : step / 2;
			doc.text('*', x + ox, y);
		}
	}
}

/**
 * Optional delta sub-line for drawStatCard (CIPH-pi19-3).
 *
 * No `semantic`. The delta used to carry 'good' | 'bad' | 'neutral', painted
 * olive or brick — so "three fewer episodes" printed green and "three more"
 * printed brick. That is a verdict on the person's course, and ciphra is a
 * documentation platform: it records what happened, it does not grade it.
 * Same ruling that removed the trajectory label (2026-08-21).
 *
 * The vital tiles had already reached this conclusion on their own — their
 * delta was hard-coded to 'neutral' with the comment "no good/bad" — leaving
 * episodes as the only judged figure on the page.
 *
 * The reader still sees the direction: the sign is right there, and the
 * monthly numbers are on the chart below.
 */
interface StatCardDelta {
	sign: '+' | '-' | '=';
	value: string;
}

/** A StatCard-style block: label above, value below, accent stripe left. */
function drawStatCard(
	doc: jsPDF,
	x: number,
	y: number,
	w: number,
	h: number,
	label: string,
	value: string,
	accent: RGB,
	delta?: StatCardDelta,
): void {
	// card
	doc.setFillColor(...BRAND.card);
	doc.setDrawColor(...BRAND.border);
	doc.setLineWidth(0.2);
	doc.roundedRect(x, y, w, h, 2, 2, 'FD');

	// accent stripe
	doc.setFillColor(...accent);
	doc.rect(x, y, 1.8, h, 'F');

	// label — CIPH-pi19-3-fix: 6.5pt (was 7.5pt) for the narrower 4-tile
	// context. DE labels like "TAGE MIT NOTFALLMEDIKAMENT" pushed past
	// the 35mm usable width at 7.5pt; truncation is a defense-in-depth
	// against future long-label additions.
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.compact);
	doc.setTextColor(...BRAND.textMuted);
	const labelPadLeft = 5;
	const labelPadRight = 3;
	const maxLabelW = w - labelPadLeft - labelPadRight;
	let displayLabel = label.toUpperCase();
	if (doc.getTextWidth(displayLabel) > maxLabelW) {
		const ell = '…';
		let s = displayLabel;
		while (s.length > 1 && doc.getTextWidth(s + ell) > maxLabelW) {
			s = s.slice(0, -1);
		}
		displayLabel = s.trimEnd() + ell;
	}
	doc.text(displayLabel, x + labelPadLeft, y + 5.5);

	// value — shrink-to-fit (2026-05-22 review): a long value like Anna's
	// "Slept badly (37)" used to truncate to "Slept badly (…", losing the
	// count. Step the font down from the summary size until the full value
	// fits the card; only ellipsis-truncate if even the floor size is too
	// narrow (rare — guards against a pathologically long value).
	doc.setFont('helvetica', 'bold');
	doc.setTextColor(...accent);
	const valPadLeft = 5;
	const valPadRight = 3;
	const maxValW = w - valPadLeft - valPadRight;
	let valFontSize = TYPE.summary;
	const VALUE_FLOOR_FS = 8;
	doc.setFontSize(valFontSize);
	while (valFontSize > VALUE_FLOOR_FS && doc.getTextWidth(value) > maxValW) {
		valFontSize -= 1;
		doc.setFontSize(valFontSize);
	}
	let displayValue = value;
	if (doc.getTextWidth(displayValue) > maxValW) {
		const ell = '…';
		let s = value;
		while (s.length > 1 && doc.getTextWidth(s + ell) > maxValW) {
			s = s.slice(0, -1);
		}
		displayValue = s.trimEnd() + ell;
	}
	// Reserve 4mm at the bottom for the delta line when present so the value
	// stays vertically grounded — without delta, the value sits at h-4.5
	// (existing baseline). With delta, lift the value to h-9 and place the
	// delta line at h-4.5.
	const valBaseline = delta ? y + h - 9 : y + h - 4.5;
	doc.text(displayValue, x + valPadLeft, valBaseline);

	if (delta) {
		// One colour for every delta. Directional colour is an assessment;
		// the number and its sign are the fact.
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(TYPE.compact);
		doc.setTextColor(...BRAND.textMuted);
		const text = delta.sign === '=' ? delta.value : `${delta.sign}${delta.value}`;
		doc.text(text, x + valPadLeft, y + h - 4);
	}
}

/* ────────────────────────────────────────────────────────────────
 * CIPH-pi19-3-fix — Smooth-line helper.
 *
 * Catmull-Rom-to-cubic-Bezier conversion for line charts. Returns
 * doc.lines()-compatible relative deltas: each entry is
 * [c1dx, c1dy, c2dx, c2dy, edx, edy] — relative to the previous
 * endpoint, jsPDF's cubic-bezier shape.
 *
 * tension = 0.25 is gentler than Chart.js default 0.4 — chosen
 * because we previously had to revert smoothing entirely after
 * bezier overshoot dipped below y=0 on descending legs (see the
 * straight-line comment block in the chart code). Control-point
 * Y is also explicitly clamped to [yMin, yMax] so even with
 * extreme adjacent-point spreads, control points can't push the
 * curve outside the chart frame.
 * ──────────────────────────────────────────────────────────────── */
function smoothBezierDeltas(
	points: Array<[number, number]>,
	yMin: number,
	yMax: number,
	tension = 0.25,
): number[][] {
	const out: number[][] = [];
	if (points.length < 2) return out;
	const clampY = (y: number): number => Math.max(yMin, Math.min(yMax, y));
	for (let i = 1; i < points.length; i++) {
		const p0 = points[i - 2] ?? points[i - 1];
		const p1 = points[i - 1];
		const p2 = points[i];
		const p3 = points[i + 1] ?? points[i];
		const cp1x = p1[0] + (p2[0] - p0[0]) * tension;
		const cp1y = clampY(p1[1] + (p2[1] - p0[1]) * tension);
		const cp2x = p2[0] - (p3[0] - p1[0]) * tension;
		const cp2y = clampY(p2[1] - (p3[1] - p1[1]) * tension);
		out.push([
			cp1x - p1[0], cp1y - p1[1],
			cp2x - p1[0], cp2y - p1[1],
			p2[0] - p1[0], p2[1] - p1[1],
		]);
	}
	return out;
}

/**
 * CIPH-pi21-Track-B-4 — Phase distribution stacked bar.
 *
 * Phase cohort only (gated by `sectionsForCohort(cohort).includes(
 * 'phase-distribution')`). Reads from `aggregatePhaseDistribution` so the
 * data shape is testable in isolation. Renders nothing on a silent month —
 * an empty bar would imply "0% manic" which is meaningless when no episodes
 * were logged.
 */
function drawPhaseDistribution(
	doc: jsPDF,
	blueprint: Blueprint,
	focusMonthDocs: CiphraDocument[],
	year: number,
	month: number,
	t: TranslateFn,
	locale: string,
	cursorY: number,
): number {
	const segments = aggregatePhaseDistribution(blueprint, focusMonthDocs);
	if (segments.length === 0) return cursorY;

	const pageW = 210;
	const barX = 14;
	const barW = pageW - 28;             // 182mm content width
	const barH = 6;

	// Title row — same vocabulary as drawDayCoverageStrip.
	const focusMonthName = new Date(year, month).toLocaleDateString(locale, {
		month: 'long',
		year: 'numeric',
	});
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.head);
	doc.setTextColor(...BRAND.textPrimary);
	doc.text(t('pdf.phase_distribution_title', { month: focusMonthName }), barX, cursorY);
	cursorY += 4;

	// Stacked bar. Each segment width is pct × barW; round to avoid sub-pixel
	// gaps that print as hairlines on cheap lasers. Last segment absorbs the
	// rounding remainder so the bar always reaches exactly barW.
	let xCursor = barX;
	for (let i = 0; i < segments.length; i++) {
		const isLast = i === segments.length - 1;
		const segW = isLast ? barX + barW - xCursor : Math.round(segments[i].pct * barW * 100) / 100;
		doc.setFillColor(...segments[i].color);
		doc.rect(xCursor, cursorY, segW, barH, 'F');
		xCursor += segW;
	}
	// Hairline border keeps the bar legible against warm paper.
	doc.setDrawColor(...BRAND.borderSubtle);
	doc.setLineWidth(0.1);
	doc.rect(barX, cursorY, barW, barH, 'S');
	cursorY += barH + 3;

	// Legend row: "● Manic 12%   ● Depressive 31%   ...". Wraps if the line
	// would exceed barW; rare in practice (≤4 episode types per cohort) but
	// the wrap keeps the primitive safe for custom blueprints with many types.
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.compact);
	const dotR = 0.9;
	const gap = 4;
	const wrapMax = barX + barW;
	let lx = barX;
	let ly = cursorY + 2;
	for (const seg of segments) {
		const labelText = labelOf(t, { id: seg.id, label: seg.label });
		const pctText = `${Math.round(seg.pct * 100)}%`;
		const text = `${labelText} ${pctText}`;
		const textW = doc.getTextWidth(text);
		const itemW = dotR * 2 + 1.2 + textW;
		if (lx + itemW > wrapMax && lx > barX) {
			lx = barX;
			ly += 4;
		}
		doc.setFillColor(...seg.color);
		doc.circle(lx + dotR, ly - 0.6, dotR, 'F');
		doc.setTextColor(...BRAND.textMuted);
		doc.text(text, lx + dotR * 2 + 1.2, ly);
		lx += itemW + gap;
	}
	cursorY = ly + 4;

	return cursorY;
}

/**
 * CIPH-pi21-Track-B-4 — Per-day cycle phase strip.
 *
 * Cycle cohort only (gated by `sectionsForCohort(cohort).includes(
 * 'cycle-strip')`). Mirrors the calendar v3 cell tinting so the doctor sees
 * the same phase encoding the patient sees in-app. PHASE_COLORS comes from
 * `cycleState.ts` — single source of truth for cycle palette.
 *
 * Renders empty (hairline) cells when the anchor has no data — silent month
 * is honest. Day-number labels are always visible so the strip preserves
 * temporal position even when uncolored.
 */
function drawCycleStrip(
	doc: jsPDF,
	blueprint: Blueprint,
	allDocs: CiphraDocument[],
	year: number,
	month: number,
	daysInMonth: number,
	t: TranslateFn,
	locale: string,
	cursorY: number,
): number {
	const { cells, anchorDate, stale } = aggregateCycleStrip(
		blueprint,
		allDocs,
		year,
		month,
		daysInMonth,
	);
	const pageW = 210;
	const stripW = pageW - 28;
	const cellGap = 0.4;
	const cellW = (stripW - (daysInMonth - 1) * cellGap) / daysInMonth;
	const cellH = 6;

	// Title.
	const focusMonthName = new Date(year, month).toLocaleDateString(locale, {
		month: 'long',
		year: 'numeric',
	});
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.head);
	doc.setTextColor(...BRAND.textPrimary);
	doc.text(t('pdf.cycle_strip_title', { month: focusMonthName }), 14, cursorY);
	cursorY += 4;

	// Strip body. When `stale` is true, `aggregateCycleStrip` already
	// stripped phase to null for every cell — the loop below renders
	// hairline-empty cells with day numbers, matching the no-data path.
	const stripY = cursorY;
	for (const c of cells) {
		const x = 14 + (c.day - 1) * (cellW + cellGap);
		if (c.phase) {
			// Phase color washed at α=0.55 over warm paper — matches calendar
			// v3 cell tint intensity (light enough for the day number to read).
			const phaseHex = PHASE_COLORS[c.phase];
			const fill = softBlendRgb(parseHexToRgb(phaseHex), 0.55);
			doc.setFillColor(...fill);
			doc.rect(x, stripY, cellW, cellH, 'F');
		} else {
			doc.setDrawColor(...BRAND.borderSubtle);
			doc.setLineWidth(0.1);
			doc.rect(x, stripY, cellW, cellH, 'S');
		}
		// Day number top-left — same vocabulary as drawDayCoverageStrip.
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(TYPE.chartAxisMicro);
		doc.setTextColor(...BRAND.textPrimary);
		doc.text(String(c.day), x + 0.6, stripY + 2.2);
	}
	cursorY = stripY + cellH + 3;

	// 2026-06-07 clinician review P1-4 — anchor-provenance footnote.
	// When the anchor exists, name the date so the doctor can judge how
	// fresh the cycle data is. When stale, also emit the suppression
	// reason in the same line so the empty strip isn't read as "no data
	// at all" (the footnote distinguishes "no period ever recorded"
	// from "last period was months ago — phase tints suppressed").
	if (anchorDate) {
		const dateLabel = formatISODateChoice(anchorDate, blueprint.dateFormat);
		const note = stale
			? t('pdf.cycle_anchor_stale', { date: dateLabel })
			: t('pdf.cycle_anchor_last', { date: dateLabel });
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(TYPE.chartAxisMicro);
		doc.setTextColor(...BRAND.textMuted);
		doc.text(note, 14, cursorY + 1.8);
		cursorY += 3.5;
	}

	// Legend — 4 phases × dot + label, single line. Suppressed when
	// stale: an empty strip doesn't need a phase legend, and showing
	// one implies tint encoding the renderer just disabled.
	if (!stale) {
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(TYPE.compact);
		const dotR = 0.9;
		const gap = 4;
		let lx = 14;
		const ly = cursorY + 2;
		const phases: Phase[] = ['menstrual', 'follicular', 'ovulation', 'luteal'];
		for (const p of phases) {
			const labelText = t(`cycle.phase_${p}`);
			const textW = doc.getTextWidth(labelText);
			const itemW = dotR * 2 + 1.2 + textW;
			doc.setFillColor(...softBlendRgb(parseHexToRgb(PHASE_COLORS[p]), 0.55));
			doc.circle(lx + dotR, ly - 0.6, dotR, 'F');
			doc.setTextColor(...BRAND.textMuted);
			doc.text(labelText, lx + dotR * 2 + 1.2, ly);
			lx += itemW + gap;
		}
		cursorY = ly + 4;
	} else {
		cursorY += 2;
	}

	return cursorY;
}

/** Hex `#RRGGBB` → RGB triple. Fallback to black on malformed input
 *  (caller already validated; this is just a safe parse). */
function parseHexToRgb(hex: string): RGB {
	const h = hex.replace('#', '');
	if (h.length !== 6) return [0, 0, 0];
	const n = parseInt(h, 16);
	return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * CIPH-pi21-Track-B-5 — Daily-month trajectory chart.
 *
 * Replaces the implicit 24-month chart for `scope === 'month'`. X-axis is
 * day-of-month (1..N), one point per day. Reuses `smoothBezierDeltas` so
 * the line treatment matches the year/2years chart visually. Deliberately
 * minimal: no dual axis, no event markers, no year divider — those belong
 * to the long-horizon view, not a single-month focus.
 */
function drawDailyMonthChart(
	doc: jsPDF,
	documents: CiphraDocument[],
	year: number,
	month: number,
	daysInMonth: number,
	episodeCols: string[],
	t: TranslateFn,
	locale: string,
	acc: CohortAccents,
	cursorY: number,
): number {
	const { dailyTotals, dailySymptomDays, dailySymptomCounts } = aggregateDailyMonthSeries(
		documents, year, month, daysInMonth, episodeCols,
	);
	const pageW = 210;
	const chartX = 20;
	const chartW = pageW - 28 - 6;     // leave room for left y-axis label
	const chartH = 32;

	const focusMonthName = new Date(year, month).toLocaleDateString(locale, {
		month: 'long',
		year: 'numeric',
	});
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.head);
	doc.setTextColor(...BRAND.textPrimary);
	doc.text(t('pdf.daily_month_chart_title', { month: focusMonthName }), 14, cursorY);
	cursorY += 4;

	// Plot background.
	doc.setFillColor(...BRAND.paper);
	doc.rect(chartX, cursorY, chartW, chartH, 'F');

	// Horizontal gridlines.
	doc.setDrawColor(...BRAND.borderSubtle);
	doc.setLineWidth(0.15);
	for (let g = 1; g <= 3; g++) {
		const y = cursorY + (chartH * g) / 4;
		doc.line(chartX, y, chartX + chartW, y);
	}

	// Y-axis scale.
	const dataMax = Math.max(1, ...dailyTotals);
	const yMax = Math.max(1, Math.ceil(dataMax));
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.chartAxis);
	doc.setTextColor(...BRAND.textMuted);
	doc.text(String(yMax), chartX - 1, cursorY + 2, { align: 'right' });
	const midY = Math.round(yMax / 2);
	if (yMax >= 3 && midY !== yMax && midY !== 0) {
		doc.text(String(midY), chartX - 1, cursorY + chartH / 2 + 1, { align: 'right' });
	}
	doc.text('0', chartX - 1, cursorY + chartH, { align: 'right' });

	// Empty-state only when the month is genuinely silent — no episodes
	// AND no symptom days. A month with symptoms logged but zero episodes
	// (common for a well-controlled epilepsy patient) still has a chart
	// worth showing: the episode line at zero plus the symptom-day row.
	// Before this, the episode-only total wrongly read as "no entries".
	// ── Per-day note markers ──
	//
	// This is the surface where a per-event mark earns its weight, and the
	// one place it was never drawn. `feedback_chart_event_markers` bans them
	// on aggregate axes because "the axis compresses them past the point of
	// legibility" — and explicitly permits them where "the day IS the unit".
	// Here a month spans 176mm, so a day is 5.7–6.3mm and a 2.4mm diamond
	// cannot collide with its neighbour.
	//
	// One mark per DAY, not per event: two notes on the same day are one
	// thing that happened that day. Text stays in the Notizmarker list —
	// nothing here is wide enough for a sentence, which is what produced the
	// 255mm-on-a-174mm-axis pile-up on the trajectory.
	const dayMarks = new Set<number>();
	{
		const startISO = `${year}-${String(month + 1).padStart(2, '0')}-01`;
		const endISO = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
		for (const n of noteMarkersInWindow(documents, startISO, endISO)) {
			dayMarks.add(Number(n.dateISO.slice(8, 10)));
		}
	}

	const episodeTotal = dailyTotals.reduce((a, b) => a + b, 0);
	const symptomTotal = dailySymptomDays.reduce((a, b) => a + b, 0);
	// `dayMarks.size` joins the condition: a month with note markers but no
	// episodes or symptoms is not empty, and printing "Keine Einträge diesen
	// Monat" above a row of marks would contradict the page. Same class of
	// error the comment above records fixing for episode-only months.
	if (episodeTotal === 0 && symptomTotal === 0 && dayMarks.size === 0) {
		doc.setFont('helvetica', 'italic');
		doc.setFontSize(TYPE.body);
		doc.setTextColor(...BRAND.textMuted);
		doc.text(t('pdf.no_data'), chartX + chartW / 2, cursorY + chartH / 2 + 1, { align: 'center' });
		return cursorY + chartH + 6;
	}

	// Bezier-smoothed line (same tension + clamp as the 24-month chart).
	const points: Array<[number, number]> = dailyTotals.map((v, i) => [
		chartX + (i / Math.max(1, daysInMonth - 1)) * chartW,
		cursorY + chartH - (v / yMax) * chartH,
	]);
	const yTop = cursorY;
	const yBottom = cursorY + chartH;
	const baseY = yBottom;
	const bezier = smoothBezierDeltas(points, yTop, yBottom);

	// Area fill matches the trajectory chart: bezier top edge, flat bottom.
	if (points.length >= 2) {
		const firstX = points[0][0];
		const firstY = points[0][1];
		const lastX = points[points.length - 1][0];
		const lastY = points[points.length - 1][1];
		const areaPath: number[][] = [[0, firstY - baseY]];
		for (const seg of bezier) areaPath.push(seg);
		areaPath.push([0, baseY - lastY]);
		areaPath.push([-(lastX - firstX), 0]);
		doc.setFillColor(...acc.primarySoft);
		doc.setDrawColor(...acc.primarySoft);
		doc.lines(areaPath, firstX, baseY, undefined, 'F', true);
	}

	// Stroke the line.
	doc.setDrawColor(...acc.primary);
	doc.setLineWidth(0.6);
	if (points.length >= 2) {
		const firstX = points[0][0];
		const firstY = points[0][1];
		doc.lines(bezier, firstX, firstY);
	}

	// Data dot at every day + a larger endpoint dot — orientation marks,
	// matching the 24-month trajectory chart's episode series.
	if (points.length >= 1) {
		doc.setFillColor(...acc.primary);
		for (const [px, py] of points) doc.circle(px, py, 0.55, 'F');
		const last = points[points.length - 1];
		doc.circle(last[0], last[1], 1.0, 'F');
	}

	// Symptom-count secondary line — dashed, muted, on its own scale so a
	// high symptom count can't flatten the episode line. Same rendering as
	// the 24-month trajectory chart's symptom series: a dashed bezier line
	// with a right-edge scale number. This is what keeps a symptom-only
	// month (zero episodes) from reading as empty.
	if (symptomTotal > 0) {
		const symMax = Math.max(1, ...dailySymptomCounts);
		const sPoints: Array<[number, number]> = dailySymptomCounts.map((v, i) => [
			chartX + (i / Math.max(1, daysInMonth - 1)) * chartW,
			cursorY + chartH - (v / symMax) * chartH,
		]);
		doc.setDrawColor(...BRAND.textMuted);
		doc.setLineWidth(0.4);
		doc.setLineDashPattern([1.2, 1.2], 0);
		if (sPoints.length >= 2) {
			const sBezier = smoothBezierDeltas(sPoints, cursorY, cursorY + chartH);
			doc.lines(sBezier, sPoints[0][0], sPoints[0][1], undefined, 'S', false);
		}
		doc.setLineDashPattern([], 0);
		doc.setLineWidth(0.2);
		// Square marker at every day — orientation marks, matching the
		// trajectory chart's symptom series (square pairs with the dashed
		// stroke so the two series stay distinct in grayscale).
		doc.setFillColor(...BRAND.textMuted);
		for (const [px, py] of sPoints) drawMarker(doc, px, py, 0.5, 'square', true);
		// Right-edge scale disclosure for the secondary series.
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(TYPE.chartAxisMicro);
		doc.setTextColor(...BRAND.textMuted);
		doc.text(String(symMax), chartX + chartW + 0.5, cursorY + 2, { align: 'left' });
		doc.text('0', chartX + chartW + 0.5, cursorY + chartH, { align: 'left' });
	}

	// X-axis day labels — every 5 days when daysInMonth > 20, every 2 otherwise
	// (mirrors /reports autoSkipPadding behavior added in PI v17).
	const labelEvery = daysInMonth > 20 ? 5 : 2;
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.chartAxis);
	doc.setTextColor(...BRAND.textMuted);
	for (let i = 0; i < daysInMonth; i++) {
		const day = i + 1;
		if (day !== 1 && day !== daysInMonth && (day % labelEvery) !== 0) continue;
		const x = chartX + (i / Math.max(1, daysInMonth - 1)) * chartW;
		doc.text(String(day), x, cursorY + chartH + 3, { align: 'center' });
	}

	const markRowY = cursorY + chartH + 6.2;
	if (dayMarks.size > 0) {
		doc.setDrawColor(...BRAND.ochre);
		doc.setLineWidth(0.4);
		for (const day of dayMarks) {
			const x = chartX + ((day - 1) / Math.max(1, daysInMonth - 1)) * chartW;
			// Diamond — shape-encoded, so it survives grayscale and fax.
			doc.lines([[1.1, 1.1], [-1.1, 1.1], [-1.1, -1.1], [1.1, -1.1]], x, markRowY - 1.1);
		}
	}

	// Legend — episode line + symptom-day dot.
	{
		const lgY = cursorY + chartH + (dayMarks.size > 0 ? 11.5 : 8);
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(TYPE.chartAxis);
		doc.setTextColor(...BRAND.textMuted);
		let lx = chartX;
		doc.setDrawColor(...acc.primary);
		doc.setLineWidth(0.6);
		doc.line(lx, lgY - 0.8, lx + 5, lgY - 0.8);
		doc.text(t('pdf.legend_episodes'), lx + 7, lgY);
		lx += 7 + doc.getTextWidth(t('pdf.legend_episodes')) + 8;
		if (symptomTotal > 0) {
			doc.setDrawColor(...BRAND.textMuted);
			doc.setLineWidth(0.4);
			doc.setLineDashPattern([1.2, 1.2], 0);
			doc.line(lx, lgY - 0.8, lx + 5, lgY - 0.8);
			doc.setLineDashPattern([], 0);
			const symLabel = t('pdf.legend_symptoms');
			doc.text(symLabel, lx + 7, lgY);
			lx += 7 + doc.getTextWidth(symLabel) + 8;
		}
		// PDF_DESIGN_SPEC §14 — every symbol explained.
		if (dayMarks.size > 0) {
			doc.setDrawColor(...BRAND.ochre);
			doc.setLineWidth(0.4);
			doc.lines([[1.1, 1.1], [-1.1, 1.1], [-1.1, -1.1], [1.1, -1.1]], lx + 1.1, lgY - 1.9);
			doc.text(t('pdf.legend_note_marker_day'), lx + 4.2, lgY);
		}
		doc.setLineWidth(0.2);
	}

	return cursorY + chartH + (dayMarks.size > 0 ? 15.5 : 12);
}

/* ────────────────────────────────────────────────────────────────
 * 1) Grid Report — monthly protocol grid (clinical handover)
 * ──────────────────────────────────────────────────────────────── */

/**
 * Renders the grid section (header + table) onto an existing jsPDF document.
 * The caller owns page orientation + final save. Used by `generateDoctorPdf`
 * to append the full day-by-day protocol after the analytics sections.
 */
function drawGridSection(
	doc: jsPDF,
	blueprint: Blueprint,
	documents: CiphraDocument[],
	year: number,
	month: number, // 0-based
	t: TranslateFn,
	locale: string,
	username: string = ''
): void {
	// CIPH-pi18-2 Chunk 3 — extend cohort accent into the heatmap. Closes
	// the Jonas dry-run "sage hat on rust coat" critique: page-1 stat cards
	// were tinted in Chunk 2 but the page-2 monthly grid stayed warm-rust,
	// breaking tonal coherence on the densest block of the document.
	const acc = resolveCohortAccents(blueprint);

	const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
	const monthDocs = documents.filter(
		(d) => d.data.type === 'entry' && String(d.data.date || '').startsWith(monthPrefix)
	);
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const monthName = new Date(year, month).toLocaleDateString(locale, {
		month: 'long',
		year: 'numeric',
	});

	// Strip positive-marker symptoms (slept_well etc.) — see POSITIVE_MARKERS
	// in generateDoctorPdf for the rationale. Hard denylist as a safety net
	// for legacy stored blueprints that still carry these IDs.
	const POSITIVE_MARKERS = new Set(['slept_well']);
	const symptomCols = effectiveSymptomColumns(blueprint, documents, monthPrefix, POSITIVE_MARKERS);
	const episodeCols = effectiveEpisodeColumns(blueprint, documents, monthPrefix);

	// pi24 P-PDF-bug — Monthly-grid headers wrapped mid-word at narrow
	// column widths (e.g. "Aggressi ve", "Headach e", "Myocloni c"). The
	// prior char-count abbreviation guessed: a 10-char word like
	// "Aggressive" passed an unchanged length check yet still overflowed
	// the ~10mm usable cell at the rendered font. The fix MEASURES — trim
	// the label with `doc.getTextWidth` at the actual header font until
	// it fits the actual column width, so headers are always single-line.
	// Bracketed suffixes ("(GM)") are preserved — load-bearing for
	// episode-type disambiguation.
	// Protocol pages render landscape (2026-05-22 review): portrait A4 could
	// not hold wide blueprints — a 16-symptom burnout grid pushed the Notes
	// column off the page and crushed headers to 5-char stubs. Landscape
	// gives ~269mm of content width instead of 182mm.
	const pageW = doc.internal.pageSize.getWidth();
	const HEADER_FS = 7;
	const HEADER_CELL_PAD = 1.5;
	const GRID_DAY_COL_W = 14; // wide enough that the "Totals" label fits
	const GRID_NOTES_COL_W = pageW > 250 ? 46 : 32;
	// Column widths must be known before we can fit labels — compute the
	// data-column width here (also reused verbatim by `columnStyles`).
	const gridDataColCount = symptomCols.length + episodeCols.length;
	const gridDataBudget = pageW - 28 - GRID_DAY_COL_W - GRID_NOTES_COL_W;
	const gridDataColW = gridDataColCount > 0
		? Math.max(10, Math.min(18, gridDataBudget / gridDataColCount))
		: 14;
	const fitHeader = (s: string): string => {
		const maxW = gridDataColW - HEADER_CELL_PAD * 2;
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(HEADER_FS);
		if (doc.getTextWidth(s) <= maxW) return s;
		// Preserve a trailing bracket suffix; trim the body.
		const m = s.match(/^(.*?)(\s*\([^)]+\))\s*$/);
		const body = m ? m[1] : s;
		const suffix = m ? m[2] : '';
		let trimmed = body;
		while (trimmed.length > 1 && doc.getTextWidth(`${trimmed}.${suffix}`) > maxW) {
			trimmed = trimmed.slice(0, -1);
		}
		return `${trimmed}.${suffix}`;
	};

	const symptomLabels = symptomCols.map((id) => {
		for (const g of blueprint.symptomGroups) {
			const item = g.items.find((i) => i.id === id);
			if (item) return fitHeader(labelOf(t, item));
		}
		return id;
	});
	const episodeLabels = episodeCols.map((id) => {
		const ep = blueprint.episodeTypes.find((e) => e.id === id);
		return ep ? fitHeader(labelOf(t, ep)) : id;
	});

	const allHeaders = [t('pdf.day'), ...symptomLabels, ...episodeLabels, t('pdf.notes')];

	const rows: string[][] = [];
	const symptomSums = new Array(symptomCols.length).fill(0);
	const episodeSums = new Array(episodeCols.length).fill(0);
	let totalEpisodes = 0;
	let symptomEntries = 0;

	for (let day = 1; day <= daysInMonth; day++) {
		const dayStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
		const dayDoc = monthDocs.find((d) => d.data.date === dayStr);
		// Additional entry docs for the day (quick-adds alongside the main
		// entry) — episode counts summed on top of dayDoc's own counts.
		const dayEpDocs = monthDocs.filter((d) => d.data?.date === dayStr && d !== dayDoc);
		const row: string[] = [String(day)];

		symptomCols.forEach((col, i) => {
			const active = dayDoc?.data?.symptoms?.[col] || false;
			row.push(active ? '•' : '');
			if (active) {
				symptomSums[i]++;
				symptomEntries++;
			}
		});

		episodeCols.forEach((col, i) => {
			let count = (dayDoc?.data?.episodes?.[col] || dayDoc?.data?.seizures?.[col] || 0) as number;
			for (const ed of dayEpDocs) {
				count += Number((ed.data?.episodes || {})[col] || 0);
			}
			row.push(count > 0 ? String(count) : '');
			episodeSums[i] += count;
			totalEpisodes += count;
		});

		row.push(String(dayDoc?.data?.notes || '').slice(0, 40));
		rows.push(row);
	}

	// Totals row (brick background, white bold)
	const totalsRow: string[] = [t('pdf.totals')];
	symptomSums.forEach((s) => totalsRow.push(String(s)));
	episodeSums.forEach((s) => totalsRow.push(String(s)));
	totalsRow.push('');
	rows.push(totalsRow);

	// Percent row
	const pctRow: string[] = [t('pdf.percent_of_days')];
	symptomSums.forEach((s) => pctRow.push(`${Math.round((s / daysInMonth) * 100)}%`));
	episodeSums.forEach(() => pctRow.push(''));
	pctRow.push('');
	rows.push(pctRow);

	const daysLogged = monthDocs.length;

	// ── Header block ──
	// Wordmark top-left
	drawWordmark(doc, 14, 16, { size: 14 });

	// Title on the right — "Monat <month> <year>"
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.summary);
	doc.setTextColor(...BRAND.textPrimary);
	doc.text(monthName, pageW - 14, 15, { align: 'right' });

	// Condition label + report type
	const conditionLabel = blueprint.conditionLabel ? t(blueprint.conditionLabel) : blueprint.conditionId;
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.body);
	doc.setTextColor(...BRAND.textSecondary);
	doc.text(`${conditionLabel} · ${t('pdf.grid_title')}`, pageW - 14, 21, { align: 'right' });

	// Meta row (account, export date)
	const exportDate = formatDateChoice(new Date(), blueprint.dateFormat);
	doc.setFontSize(TYPE.table);
	doc.setTextColor(...BRAND.textMuted);
	// Brand voice: capitalized name, no "Account:" admin label — matches
	// the page-1 header in `generateDoctorPdf`.
	const metaParts: string[] = [];
	if (username) metaParts.push(capitalizeName(username));
	metaParts.push(`${t('pdf.export_date')}: ${exportDate}`);
	doc.text(metaParts.join('   ·   '), 14, 22);

	// Summary line
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.body);
	doc.setTextColor(...BRAND.textPrimary);
	// Days carrying a note marker. The grid is a day-per-row surface, so this
	// is the other place a per-event mark is legitimate — the row IS the day.
	// One mark per day: two notes on one day are one thing that happened.
	// Text stays in the Notizmarker list; the 46mm Notes column already
	// truncates the entry's own note at 40 characters.
	const markedDays = new Set<number>();
	{
		const last = String(daysInMonth).padStart(2, '0');
		for (const n of noteMarkersInWindow(documents, `${monthPrefix}-01`, `${monthPrefix}-${last}`)) {
			markedDays.add(Number(n.dateISO.slice(8, 10)));
		}
	}

	const summary = `${daysLogged} ${t('pdf.days_logged_short')}  ·  ${totalEpisodes} ${t('pdf.total_episodes_short')}  ·  ${symptomEntries} ${t('pdf.symptom_entries')}`;
	doc.text(summary, 14, 30);
	// PDF_DESIGN_SPEC §14 — the diamond in the day column, explained where a
	// reader meets it. Only rendered when the month actually has one.
	if (markedDays.size > 0) {
		const sumW = doc.getTextWidth(summary);
		doc.setDrawColor(...BRAND.ochre);
		doc.setLineWidth(0.4);
		doc.lines([[1.1, 1.1], [-1.1, 1.1], [-1.1, -1.1], [1.1, -1.1]], 14 + sumW + 7, 28.9);
		doc.setTextColor(...BRAND.textMuted);
		doc.text(t('pdf.legend_note_marker_day'), 14 + sumW + 11, 30);
		doc.setTextColor(...BRAND.textMuted);
	}

	// Thin divider
	doc.setDrawColor(...BRAND.border);
	doc.setLineWidth(0.2);
	doc.line(14, 33, pageW - 14, 33);

	// Max episode count for intensity scaling
	const maxEpCount = Math.max(...episodeSums, 1);
	const maxSymptomDays = Math.max(...symptomSums, 1);

	autoTable(doc, {
		startY: 34,
		head: [allHeaders],
		body: rows,
		theme: 'plain',
		styles: {
			fontSize: TYPE.compact,
			// Tight padding — 31 days + totals + percent = 33 rows must fit
			// the 210mm landscape page height without spilling to page 2.
			cellPadding: 0.7,
			lineColor: BRAND.borderSubtle as any,
			lineWidth: 0.1,
			textColor: BRAND.textPrimary as any,
			font: 'helvetica',
		},
		headStyles: {
			fillColor: BRAND.paperInset as any,
			textColor: BRAND.textPrimary as any,
			fontStyle: 'bold',
			// `fitHeader` measured the labels against this size — keep in
			// sync with HEADER_FS so headers render single-line.
			fontSize: HEADER_FS,
			cellPadding: HEADER_CELL_PAD,
			lineWidth: 0.1,
			lineColor: BRAND.border as any,
		},
		alternateRowStyles: {
			fillColor: [252, 250, 248] as any,
		},
		// Per-column explicit widths. Day + Notes are fixed; `gridDataColW`
		// (computed above against the landscape page width, so headers were
		// fitted to the same width) distributes the remainder.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		columnStyles: (() => {
			const styles: Record<number, any> = {
				0: { cellWidth: GRID_DAY_COL_W, fontStyle: 'bold', halign: 'center' },
			};
			const notesColIdx = 1 + symptomCols.length + episodeCols.length;
			styles[notesColIdx] = { cellWidth: GRID_NOTES_COL_W };
			for (let i = 1; i <= gridDataColCount; i++) {
				styles[i] = { cellWidth: gridDataColW, halign: 'center' };
			}
			return styles;
		})(),
		didParseCell: (data: any) => {
			const rowIdx = data.row.index;
			const colIdx = data.column.index;
			const isTotals = rowIdx === daysInMonth;
			const isPercent = rowIdx === daysInMonth + 1;
			const isSymptomCol = colIdx > 0 && colIdx <= symptomCols.length;
			const isEpisodeCol = colIdx > symptomCols.length && colIdx <= symptomCols.length + episodeCols.length;

			// Sticky day column tint
			if (colIdx === 0 && !isTotals && !isPercent) {
				data.cell.styles.fillColor = BRAND.paperInset as any;
				data.cell.styles.textColor = BRAND.textSecondary as any;
			}

			// Totals row — cohort-primary background, reverse text
			if (isTotals) {
				data.cell.styles.fillColor = acc.primary as any;
				data.cell.styles.textColor = [255, 255, 255] as any;
				data.cell.styles.fontStyle = 'bold';
			}

			// Percent row — paper inset tint, muted italic
			if (isPercent) {
				data.cell.styles.fillColor = BRAND.paperInset as any;
				data.cell.styles.textColor = BRAND.textSecondary as any;
				data.cell.styles.fontStyle = 'italic';
			}

			// Body cells — symptom pill (brick intensity) / episode count (ochre)
			if (!isTotals && !isPercent && data.section === 'body') {
				if (isSymptomCol && data.cell.raw === '•') {
					// Intensity by column frequency — higher column sum = more opaque
					// cohort-primary tint over paper.
					const colI = colIdx - 1;
					const freq = symptomSums[colI] / maxSymptomDays;
					const alpha = 0.25 + freq * 0.55; // 0.25..0.80
					const r = Math.round(BRAND.paper[0] * (1 - alpha) + acc.primary[0] * alpha);
					const g = Math.round(BRAND.paper[1] * (1 - alpha) + acc.primary[1] * alpha);
					const b = Math.round(BRAND.paper[2] * (1 - alpha) + acc.primary[2] * alpha);
					data.cell.styles.fillColor = [r, g, b] as any;
					data.cell.styles.textColor = [255, 255, 255] as any;
					data.cell.styles.halign = 'center';
					data.cell.styles.fontStyle = 'bold';
				}
				if (isEpisodeCol) {
					const val = Number(data.cell.raw);
					if (val > 0) {
						// Episode-count pill — cohort warm-break tint, intensity by value
						const intensity = Math.min(val / maxEpCount, 1);
						const alpha = 0.2 + intensity * 0.5;
						const r = Math.round(BRAND.paper[0] * (1 - alpha) + acc.break[0] * alpha);
						const g = Math.round(BRAND.paper[1] * (1 - alpha) + acc.break[1] * alpha);
						const b = Math.round(BRAND.paper[2] * (1 - alpha) + acc.break[2] * alpha);
						data.cell.styles.fillColor = [r, g, b] as any;
						data.cell.styles.textColor = BRAND.textPrimary as any;
						data.cell.styles.halign = 'center';
						data.cell.styles.fontStyle = 'bold';
					} else {
						data.cell.styles.halign = 'center';
					}
				}
			}
		},
		didDrawCell: (data: any) => {
			continuationLabelHook(t('pdf.table_continued'))(data);
			// Day column, body rows only — the totals and percent rows are
			// not days.
			if (data.section !== 'body' || data.column.index !== 0) return;
			const day = data.row.index + 1;
			if (day > daysInMonth || !markedDays.has(day)) return;
			const cx = data.cell.x + data.cell.width - 2.2;
			const cy = data.cell.y + data.cell.height / 2;
			doc.setDrawColor(...BRAND.ochre);
			doc.setLineWidth(0.35);
			doc.lines([[0.9, 0.9], [-0.9, 0.9], [-0.9, -0.9], [0.9, -0.9]], cx, cy - 0.9);
		},
	});

}

/* ────────────────────────────────────────────────────────────────
 * Doctor Report — one PDF, everything in it: cover + 24-month
 * trajectory + comparison + symptom/medication tables + full
 * day-by-day grid for the selected month. The doctor skims what
 * they need; we give them everything we have.
 * ──────────────────────────────────────────────────────────────── */

// The window, its label and its filename tag are one rule and live in one
// place — lib/reports/reportWindow.ts. Re-exported so existing importers of
// `$lib/pdf` keep working.
export type { ReportScope };
export { scopeFileTag };

export function generateDoctorPdf(
	blueprintIn: Blueprint,
	documents: CiphraDocument[],
	year: number,
	month: number, // 0-based
	t: TranslateFn,
	locale: string,
	username: string = '',
	scope: ReportScope = 'month'
): void {
	// CIPH-301: personal vital-target overrides live in localStorage. Apply
	// them here so the chart's reference line reflects the user's target,
	// not the blueprint default. Non-destructive — blueprint doc unchanged.
	// CIPH-301b: also strip wizard-hidden symptoms/triggers/vitals so every
	// downstream aggregator (symptomFreq, triggerFreq, chartableVitals,
	// condition-aware bullets) skips them automatically.
	const blueprint = applyBlueprintCustomizations(applyVitalTargetOverrides(blueprintIn, username));

	// CIPH-pi18-2 Chunk 2 — Cohort accent resolution. Discrete cohort returns
	// the original brick/ochre verbatim; cycle/phase/narrative/custom shift
	// the data accents into their tonal family.
	const acc = resolveCohortAccents(blueprint);

	// CIPH-710 / CIPH-713 — hard-exclude diary + private docs from EVERY
	// downstream aggregation. Single point of enforcement; internal type
	// checks (`type === 'entry'` etc.) already exclude diary, but private
	// entries would otherwise leak through.
	documents = documents.filter(isExportable);

	// The "focus month" is always the single month that hosts the detailed
	// grid appendix. The "scope" is what the rest of the report covers.
	const focusMonthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
	const focusMonthDocs = documents.filter(
		(d) => d.data.type === 'entry' && String(d.data.date || '').startsWith(focusMonthPrefix)
	);
	const focusDaysInMonth = new Date(year, month + 1, 0).getDate();
	const focusMonthName = new Date(year, month).toLocaleDateString(locale, {
		month: 'long',
		year: 'numeric',
	});

	// Scope window — drives header + stat cards + grid loop. `win` is the
	// same window as an object, and is what every reader-facing label is
	// derived from (see lib/reports/reportWindow.ts).
	const win = reportWindow(scope, year, month);
	const windowLabel = formatWindowRange(win, locale);
	const scopeMonths = scope === 'month' ? 1 : scope === 'year' ? 12 : 24;
	// Noon anchor: `.toISOString()` is UTC, so a local-midnight date in any
	// positive-offset tz (CET/CEST) slips to the previous day — shifting the
	// whole scope window back a day and dropping the month's last day.
	const scopeEndDate = new Date(year, month + 1, 0, 12);
	const scopeStartDate = new Date(year, month + 1 - scopeMonths, 1, 12);
	const scopeStartISO = scopeStartDate.toISOString().slice(0, 10);
	const scopeEndISO = scopeEndDate.toISOString().slice(0, 10);

	/**
	 * Does this month hold any exportable ENTRY?
	 *
	 * The monthly grid renders entries only — `drawGridSection` filters on
	 * `type === 'entry'`, so note markers and medication events never appear
	 * on those pages. A month without entries therefore has nothing to draw,
	 * and printing it anyway produced a full landscape page of blank rows
	 * under a green totals bar reading 0 · 0 · 0 and "0% of days".
	 *
	 * That is a coverage judgement — the thing components/README.md's
	 * no-gaslight card is forbidden from showing — printed once per empty
	 * month and handed to a doctor. One logged day in a year produced eleven
	 * of them.
	 */
	function monthHasEntries(y: number, m: number): boolean {
		const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
		return documents.some(
			(d) => d.data?.type === 'entry' && String(d.data.date || '').startsWith(prefix),
		);
	}

	// ── Append day-by-day grid(s). 'month' scope = one grid for the focus
	// month. 'year' / '2years' scope = one grid per month in the window, so
	// the doctor can spot-check any specific month without extra exports.
	//
	// pi24 P-PDF-9 — Cohort-aware grid culling. Per PDF_TEMPLATE.md
	// Section 14 (Cohort-specific appendix), the daily symptom grid is
	// appendix material and only belongs when daily binary symptom-
	// tracking is the cohort's logging convention. Vital-pinned cohorts
	// (Hashimoto, hypertension, cardiovascular, diabetes, parkinson)
	// log labs / vitals on irregular schedules, not daily symptom
	// checkboxes — their data is already on the vital chart. Cancer
	// (narrative-treatment) is journal-primary and irregular. Custom
	// cohorts have no convention to fall back on.
	//
	// Before pi24-P-PDF-9: every cohort got 12-24 pages of monthly
	// grids regardless of clinical convention. Helena (Hashimoto) on
	// year-scope produced a 24-page PDF mostly of empty grid cells.
	// After P-PDF-9: those cohorts skip the grid entirely; their PDFs
	// shrink to the 3-page summary + vital chart pages.
	const COHORTS_WITHOUT_GRID = new Set<string>([
		'hashimoto',
		'cancer_treatment',
		'hypertension',
		'cardiovascular',
		'diabetes',
		'parkinson',
	]);
	const skipGrids =
		cohortOf(blueprint) === 'custom' || COHORTS_WITHOUT_GRID.has(blueprint.conditionId);
	const gridMonths: Array<{ y: number; m: number }> = [];
	if (!skipGrids) {
		if (scope === 'month') {
			gridMonths.push({ y: year, m: month });
		} else {
			// Iterate from oldest to newest so the appendix reads
			// chronologically.
			for (let i = scopeMonths - 1; i >= 0; i--) {
				const d = new Date(year, month - i, 1);
				gridMonths.push({ y: d.getFullYear(), m: d.getMonth() });
			}
		}
	}
	// gridMonthsWithData / gridMonthsTotal are computed near the top of this
	// function so page 1 can disclose the omission — see `omittedGridMonths`.

	// monthDocs / daysInMonth / monthName / monthPrefix are the scope-aware
	// variables used by the rest of the function. For 'month' scope they
	// equal the focus month; for 'year' / '2years' they expand.
	let monthPrefix: string = focusMonthPrefix;
	let monthDocs: CiphraDocument[] = focusMonthDocs;
	let daysInMonth: number = focusDaysInMonth;
	let monthName: string = focusMonthName;
	if (scope !== 'month') {
		monthPrefix = `${scope}-${year}-${month + 1}`;
		monthDocs = documents.filter((d) => {
			if (d.data.type !== 'entry') return false;
			const ds = String(d.data.date || '');
			return ds >= scopeStartISO && ds <= scopeEndISO;
		});
		daysInMonth = Math.round(
			(scopeEndDate.getTime() - scopeStartDate.getTime()) / 86400000
		) + 1;
		// The window states itself. A relative phrase here contradicted the
		// "Exportiert: <date>" two corners away — and since the picker anchors
		// every year at December, it was wrong in the normal case, not the
		// edge case. PDF_DESIGN_SPEC §15: the date range must appear on page 1.
		monthName = formatWindowRange(win, locale);
	}

	// Comparison window: for 'month' scope = previous month; for 'year' =
	// the 12 months before the scope window; for '2years' = no comparison
	// (no prior 24 months of useful data in most accounts).
	const prevMonths = scope === 'month' ? 1 : scope === 'year' ? 12 : 0;
	const prevEndDate = new Date(scopeStartDate);
	prevEndDate.setDate(prevEndDate.getDate() - 1);
	const prevStartDate = new Date(prevEndDate);
	prevStartDate.setMonth(prevStartDate.getMonth() - prevMonths + 1);
	prevStartDate.setDate(1);
	const prevStartISO = prevStartDate.toISOString().slice(0, 10);
	const prevEndISO = prevEndDate.toISOString().slice(0, 10);
	const prevMonthDocs = prevMonths === 0 ? [] : documents.filter((d) => {
		if (d.data.type !== 'entry') return false;
		const ds = String(d.data.date || '');
		return ds >= prevStartISO && ds <= prevEndISO;
	});
	// Episode-bearing comparison set: includes standalone `episode` quick-add.
	const prevMonthEpisodeDocs = prevMonths === 0 ? [] : documents.filter((d) => {
		const t = d.data?.type;
		if (t !== 'entry') return false;
		const ds = String(d.data?.date || '');
		return ds >= prevStartISO && ds <= prevEndISO;
	});
	// Episode-bearing month set used for current-window episode totals.
	const monthEpisodeDocs = documents.filter((d) => {
		const t = d.data?.type;
		if (t !== 'entry') return false;
		const ds = String(d.data?.date || '');
		if (scope === 'month') return ds.startsWith(focusMonthPrefix);
		return ds >= scopeStartISO && ds <= scopeEndISO;
	});
	const prevDaysInMonth = prevMonths === 0 ? 0 : Math.round(
		(prevEndDate.getTime() - prevStartDate.getTime()) / 86400000
	) + 1;
	const prevDaysLogged = prevMonthDocs.length;
	const prevMonthPrefix = scope === 'month'
		? `${prevStartDate.getFullYear()}-${String(prevStartDate.getMonth() + 1).padStart(2, '0')}`
		: '';

	const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
	paintPaper(doc);
	const pageW = doc.internal.pageSize.getWidth();
	const pageH = doc.internal.pageSize.getHeight();

	// ── Header ──
	drawWordmark(doc, 14, 16, { size: 14 });

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.summary);
	doc.setTextColor(...BRAND.textPrimary);
	doc.text(monthName, pageW - 14, 15, { align: 'right' });

	const conditionLabel = blueprint.conditionLabel ? t(blueprint.conditionLabel) : blueprint.conditionId;
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.body);
	doc.setTextColor(...BRAND.textSecondary);
	// Brand voice (feedback_brand_voice): the condition label stands
	// alone. The "ciphra — Analytics Report" category label is dropped —
	// the wordmark already says ciphra, the monthName already says scope.
	doc.text(conditionLabel, pageW - 14, 21, { align: 'right' });

	const exportDate = formatDateChoice(new Date(), blueprint.dateFormat);
	doc.setFontSize(TYPE.table);
	doc.setTextColor(...BRAND.textMuted);
	// Brand voice: no "Account:" admin label — the capitalized name
	// stands on its own. The export date keeps its label (it is a field).
	const metaParts: string[] = [];
	if (username) metaParts.push(capitalizeName(username));
	metaParts.push(`${t('pdf.export_date')}: ${exportDate}`);
	doc.text(metaParts.join('   ·   '), 14, 22);

	// 2026-06-07 clinician review P2-5 — prominent "kein Medizinprodukt"
	// line. Footer carries the long disclaimer (legally adequate) but
	// the previous page-1 banner removal overcorrected: at clinical
	// reading distance the footer micro-copy is invisible. One bold
	// short line under the meta strip restores prominence without
	// reclaiming the 12mm of real-estate the removed banner cost.
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.compact);
	doc.setTextColor(...BRAND.textPrimary);
	doc.text(t('pdf.disclaimer_medical'), 14, 26);

	// ── Coverage note ──
	// Omitting the empty monthly grids is only honest if the omission is
	// declared, and declared HERE. A reader who finds Feb and Apr but no Mar
	// otherwise concludes a page was lost in the fax — silence turns a
	// deliberate omission into apparent missing data, which is worse than
	// the blank pages it replaced.
	//
	// Rendered only when something IS omitted: with nothing to declare, the
	// line would be noise on the page that has the least room for it.
	{
		const gridTotal = gridMonths.length;
		const gridWithData = gridMonths.filter((gm) => monthHasEntries(gm.y, gm.m)).length;
		if (gridTotal > 0 && gridWithData < gridTotal) {
			doc.setFont('helvetica', 'normal');
			doc.setFontSize(TYPE.compact);
			doc.setTextColor(...BRAND.textSecondary);
			doc.text(
				t('pdf.grid_coverage_note', { withData: gridWithData, total: gridTotal }),
				14,
				30,
			);
		}
	}

	// ── Patient top-line quote ──
	// Grafted from the retired CLINICAL_HANDOFF.md §4 / §14.8: the
	// patient's own most-recent in-scope note, given a 3pt olive left
	// rule, is the page's human anchor. No export-wizard prompt yet — the
	// latest note is the honest available source. Collapses entirely when
	// the patient logged no notes (§14.1 — no placeholder text).
	const latestNote = extractLatestNote(documents, scopeStartISO, scopeEndISO);
	const quoteBottomY = drawTopLineQuote(
		doc,
		latestNote,
		username ? capitalizeName(username) : '',
		locale,
		blueprint.dateFormat,
		14,
		30,
		pageW - 28,
		t,
	);

	// The medical-device disclaimer moved to the page footer (drawFooter).
	// As a page-1 block it reclaimed ~12mm of the most valuable real estate
	// on the page for standing legal copy the reader does not act on.

	// ── Compute stats ──
	const daysLogged = monthDocs.length;
	// Totals iterate ALL episodeTypes so non-curated logged data isn't dropped.
	const episodeCols = blueprint.episodeTypes.map((ep) => ep.id);
	// dailyEpisodes: only meaningful for 'month' scope (used by cluster-day
	// analysis). For year/2years scope we compute totals from monthDocs directly.
	const dailyEpisodes: number[] = [];
	let totalEpisodes = 0;
	if (scope === 'month') {
		// Build per-day totals from the episode-bearing set so standalone
		// `episode` quick-add docs contribute alongside daily_log.
		const perDay: Record<string, number> = {};
		for (const d of monthEpisodeDocs) {
			const ds = String(d.data?.date || '');
			let dayTotal = 0;
			for (const col of episodeCols) {
				dayTotal += (d.data?.episodes?.[col] || d.data?.seizures?.[col] || 0) as number;
			}
			perDay[ds] = (perDay[ds] || 0) + dayTotal;
		}
		for (let day = 1; day <= daysInMonth; day++) {
			const dayStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
			const dayTotal = perDay[dayStr] || 0;
			dailyEpisodes.push(dayTotal);
			totalEpisodes += dayTotal;
		}
	} else {
		for (const d of monthEpisodeDocs) {
			let dayTotal = 0;
			for (const col of episodeCols) {
				dayTotal += (d.data?.episodes?.[col] || d.data?.seizures?.[col] || 0) as number;
			}
			totalEpisodes += dayTotal;
		}
	}

	let prevTotalEpisodes = 0;
	for (const d of prevMonthEpisodeDocs) {
		for (const col of episodeCols) {
			prevTotalEpisodes += (d.data?.episodes?.[col] || d.data?.seizures?.[col] || 0) as number;
		}
	}

	// Positive-marker IDs that should NEVER appear as "symptoms" in the
	// clinical report. They were removed from new presets but legacy stored
	// blueprints still contain them — this denylist is the safety net so the
	// "Most frequent symptom: Slept well (157)" bug can't surface again.
	const POSITIVE_MARKERS = new Set(['slept_well']);

	const symptomFreq: { id: string; label: string; count: number }[] = [];
	for (const g of blueprint.symptomGroups) {
		for (const item of g.items) {
			if (POSITIVE_MARKERS.has(item.id)) continue;
			const count = monthDocs.filter((d) => d.data?.symptoms?.[item.id]).length;
			if (count > 0 || blueprint.gridSymptomColumns.includes(item.id)) {
				symptomFreq.push({ id: item.id, label: labelOf(t, item), count });
			}
		}
	}
	symptomFreq.sort((a, b) => b.count - a.count);
	const mostFrequentSymptom = symptomFreq[0] ?? null;
	const topPct = mostFrequentSymptom && daysInMonth > 0
		? Math.round((mostFrequentSymptom.count / daysInMonth) * 100)
		: 0;

	// Triggers — "most frequent trigger"
	const triggerFreq: { label: string; count: number }[] = [];
	for (const tr of blueprint.triggers) {
		const count = monthDocs.filter((d) => d.data?.triggers?.[tr.id]).length;
		if (count > 0) triggerFreq.push({ label: labelOf(t, tr), count });
	}
	triggerFreq.sort((a, b) => b.count - a.count);
	const mostFrequentTrigger = triggerFreq[0] ?? null;

	// Page-1 content starts just below the top-line quote block (or the
	// header meta line when the patient logged no recent note).
	let cursorY = (latestNote ? quoteBottomY : 24) + 6;
	doc.setDrawColor(...BRAND.border);
	doc.setLineWidth(0.2);
	doc.line(14, cursorY, pageW - 14, cursorY);
	cursorY += 6;

	// Clinical summary one-liner removed — duplicated the stat cards below.
	void monthName; void daysInMonth; void topPct;

	// CIPH-pi19-3 — 4-tile KPI glance (PDF_REWRITE.md §6). Replaces the
	// 2×2 stat-card grid + separate "Comparison deltas" block. Tiles
	// carry their own delta sub-line; selection is per-cohort so a
	// migraine PDF leads with the trigger tile, an epilepsy PDF with
	// rescue-med days, etc. Geometry: 4 × 1 row across 182mm content
	// width, ~42mm × 22mm per tile.
	//
	// NOTE: this switch picks tile *content* within the doctor-glance
	// section. SECTION-level cohort gating (which sections render at all)
	// belongs in `$lib/cohortSections.ts:sectionsForCohort()` — add new
	// cohort-conditional sections there, not as inline branches here.
	const cohort = cohortOf(blueprint);
	const tileGap = 3;
	const tileW = (pageW - 28 - 3 * tileGap) / 4;
	const tileH = 22;

	// Days-logged is a data-quality signal (so the doctor knows whether to
	// trust the means), not a clinical metric — render it as a small line
	// AFTER the disclaimer banner so it doesn't overlap. Position is right
	// above the KPI tiles.
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.compact);
	doc.setTextColor(...BRAND.textMuted);
	doc.text(
		`${t('pdf.days_logged_short')}: ${daysLogged}/${daysInMonth}`,
		pageW - 14,
		cursorY - 1,
		{ align: 'right' }
	);

	// Pre-aggregations the tiles need.
	const episodeChange = totalEpisodes - prevTotalEpisodes;
	// Window-scoped, like every other tile in this row. It used to count the
	// ANCHOR MONTH on every scope, so a calendar-year report showed December's
	// rescue-med days in a tile sitting next to "days logged: 180/365" — with
	// nothing saying the two covered different periods.
	const rescueMedDays = (() => {
		const days = new Set<string>();
		for (const d of documents) {
			if (d.data.type !== 'event' || (d.data as Record<string, unknown>).kind !== 'medication') continue;
			const ds = String(d.data.date || '');
			if (ds < scopeStartISO || ds > scopeEndISO) continue;
			days.add(ds);
		}
		return days.size;
	})();

	// pi24 P-PDF-4 — Tile factories return `Tile | null` so the cohort
	// selector below can fall through to a populated alternative
	// instead of rendering "—" with confidence. The 5-doctor agents
	// campfire universally flagged "—" tiles as pure decoration; the
	// pi24 doctor-glance audit on the actual Hans PDF (P-PDF-4 entry)
	// confirmed 3 of 4 tiles rendered "—" in real output. Each tile
	// now returns null when it has no clinical signal; the priority-
	// list selector picks the first 4 non-null candidates per cohort.
	type Tile = { label: string; value: string; accent: RGB; delta?: StatCardDelta };
	const tileEpisodes = (): Tile | null => {
		// Cohorts that don't track episodes (Hashimoto, custom-no-episodes)
		// → null. Cohorts that DO track but have zero events → still
		// useful as "no events this scope" → populate.
		if (!blueprint.episodeTypes || blueprint.episodeTypes.length === 0) return null;
		return {
			label: t('pdf.total_episodes'),
			value: String(totalEpisodes),
			accent: acc.primary,
			delta: scope !== '2years' && episodeChange !== 0
				? {
					sign: episodeChange > 0 ? '+' : '-',
					value: String(Math.abs(episodeChange)),
				}
				: undefined,
		};
	};
	const tileTopSymptom = (): Tile | null => {
		if (!mostFrequentSymptom) return null;
		return {
			label: t('pdf.most_frequent_symptom'),
			value: `${mostFrequentSymptom.label} (${mostFrequentSymptom.count})`,
			accent: acc.primary,
		};
	};
	const tileTopTrigger = (): Tile | null => {
		if (!mostFrequentTrigger) return null;
		return {
			label: t('pdf.most_frequent_trigger'),
			value: `${mostFrequentTrigger.label} (${mostFrequentTrigger.count})`,
			accent: acc.break,
		};
	};
	// Days-logged tile removed (2026-05-22 review): days-logged already
	// renders as the small "days logged: N/M" line above the tile row —
	// a boxed KPI tile of the same number was redundant.
	const tileRescueMed = (): Tile | null => {
		if (rescueMedDays === 0) return null;
		return {
			label: t('pdf.rescue_med_days'),
			value: String(rescueMedDays),
			accent: acc.break,
		};
	};

	// CIPH-pi23-B2-fix-1 — Phase-cohort cohort-day-coverage tiles. Replace
	// information-poor `tileTopSymptom` (rendered "Most frequent symptom:
	// Reizbarkeit (8)" for bipolar — clinically uninteresting) with the top-N
	// multiDay episode types' day-coverage. Generic across all phase cohorts:
	// bipolar surfaces manic+depressive; MS surfaces flares; chronic_pain
	// surfaces flare days; etc. Picks the top-2 by day-coverage so silent
	// episode types don't burn tile slots.
	//
	// Scoped to the report window, not the anchor month (was: focus month).
	// The "don't burn slots" rationale is unchanged — selection still takes
	// the top-2 — but on a year report the DISPLAYED day count now covers the
	// year the header claims, instead of December alone.
	const phaseTopDayCounts: Array<{ id: string; label: string; days: number }> = (() => {
		const multiDayEps = blueprint.episodeTypes.filter((ep) => ep.multiDay);
		if (multiDayEps.length === 0) return [];
		const dayCount = new Map<string, Set<string>>();
		for (const ep of multiDayEps) dayCount.set(ep.id, new Set());
		for (const d of monthDocs) {
			if (d?.data?.type !== 'entry') continue;
			const ds = String(d.data.date || '');
			if (!ds) continue;
			const eps = (d.data.episodes || {}) as Record<string, unknown>;
			for (const ep of multiDayEps) {
				if (Number(eps[ep.id] || 0) > 0) dayCount.get(ep.id)!.add(ds);
			}
		}
		return multiDayEps
			.map((ep) => ({ id: ep.id, label: ep.label, days: dayCount.get(ep.id)!.size }))
			.filter((x) => x.days > 0)
			.sort((a, b) => b.days - a.days);
	})();
	const tilePhaseTopN = (n: 0 | 1): Tile | null => {
		const top = phaseTopDayCounts[n];
		if (!top) return null;
		const pct = Math.round((top.days / focusDaysInMonth) * 100);
		return {
			label: labelOf(t, { id: top.id, label: top.label }),
			value: `${pct}%`,
			accent: acc.primary,
		};
	};

	// CIPH-pi23-B2-fix-2 — Discrete-cohort duration distribution tile. For
	// epilepsy / migraine / glaucoma where episodeTypes carry trackDuration,
	// surface the dominant duration bucket (e.g. "<1min: 87%"). Displaces
	// `tileTopSymptom` in the discrete-cohort tile set — symptom frequency
	// is information-poor for seizure tracking; duration distribution is
	// what drives the status-epilepticus risk conversation with neurology.
	const tileEpisodeDurationDist = (): Tile | null => {
		const durEps = blueprint.episodeTypes.filter((e) => e.trackDuration);
		if (durEps.length === 0) return null;
		let lt1 = 0, m15 = 0, gt5 = 0, total = 0;
		// Only count duration-bucketed events; "keine Dauer erfasst" doesn't
		// contribute to the dominant-duration question.
		let bucketed = 0;
		for (const d of monthDocs) {
			if (d?.data?.type !== 'entry') continue;
			const eps = (d.data.episodes || d.data.seizures || {}) as Record<string, number>;
			const durs = (d.data.episodeDurations || {}) as Record<string, string>;
			for (const ep of durEps) {
				const cnt = Number(eps[ep.id] || 0);
				if (cnt <= 0) continue;
				const dur = durs[ep.id] || '';
				total += cnt;
				if (dur === '<1min') { lt1 += cnt; bucketed += cnt; }
				else if (dur === '1-5min') { m15 += cnt; bucketed += cnt; }
				else if (dur === '>5min') { gt5 += cnt; bucketed += cnt; }
			}
		}
		// Pre-pi24-P-PDF-4 this returned "{label}: —" with full pill
		// chrome — the dogfood-flagged decorative state. Now: if no
		// duration data exists, yield the slot to a populated tile.
		if (total === 0 || bucketed === 0) return null;
		const pct = (n: number) => Math.round((n / bucketed) * 100);
		const buckets = [
			{ key: '<1min', n: lt1 }, { key: '1-5min', n: m15 }, { key: '>5min', n: gt5 },
		].sort((a, b) => b.n - a.n);
		return {
			label: t('pdf.duration_distribution'),
			value: `${buckets[0].key}: ${pct(buckets[0].n)}%`,
			accent: acc.primary,
		};
	};

	// pi24 P-PDF-4 — Vital-pinned tile factory. The 5-doctor agents
	// campfire flagged that vital-pinned cohorts (Hashimoto, hypertension,
	// cardiovascular, diabetes, parkinson, bipolar) need their clinical-
	// primary vital as a tile, not generic "episodes" / "top symptom".
	// Steiner: "last TSH + delta from previous." Müller: "SBP AM/PM."
	// Brunner: "polarity index / euthymia %." Returns null if the
	// blueprint doesn't carry that vital OR no values logged → falls
	// through to the next priority in the cohort list.
	const tileVitalLastValue = (vitalId: string): Tile | null => {
		const vital = blueprint.vitals?.find((v) => v.id === vitalId);
		if (!vital) return null;
		// Collect (date, numeric) pairs from entries with that vital
		// present; pick the two most-recent for last + previous delta.
		//
		// CLAMPED TO THE REPORT WINDOW. This used to scan every document the
		// vault holds and take the newest reading overall, so a calendar-2023
		// report could show a 2026 lab value on page 1, in the doctor-glance
		// row, with no date on it. `extractLatestNote` two hundred lines below
		// already clamps to the same window — the patient quote was correct
		// while the tile beside it was not.
		//
		// Consequence, deliberately: when the window holds no reading the tile
		// returns null and the cohort selector falls through to a populated
		// alternative. A report that covers a period should not present a
		// number from outside it — "a wrong pill is worse than no pill".
		const readings: { date: string; v: number }[] = [];
		for (const d of documents) {
			if (d.data?.type !== 'entry') continue;
			const ds = String(d.data.date || '');
			if (!ds) continue;
			if (ds < scopeStartISO || ds > scopeEndISO) continue;
			const raw = (d.data.vitals || {})[vitalId] as unknown;
			if (raw === '' || raw === null || raw === undefined) continue;
			const values: number[] = [];
			if (typeof raw === 'number') values.push(raw);
			else if (typeof raw === 'string' && raw.trim() !== '') {
				const n = Number(raw);
				if (!Number.isNaN(n)) values.push(n);
			} else if (typeof raw === 'object') {
				for (const v of Object.values(raw as Record<string, unknown>)) {
					if (v === '' || v === null || v === undefined) continue;
					const n = Number(v);
					if (!Number.isNaN(n)) values.push(n);
				}
			}
			if (values.length === 0) continue;
			// For multi-entry vitals (BP AM+PM), take the mean of the day's
			// readings as the "value of the day" — the doctor-glance tile
			// is a snapshot, not the AM/PM split (that lives on the chart).
			const dayMean = values.reduce((a, b) => a + b, 0) / values.length;
			readings.push({ date: ds, v: dayMean });
		}
		if (readings.length === 0) return null;
		readings.sort((a, b) => b.date.localeCompare(a.date));
		const last = readings[0].v;
		const prev = readings.length > 1 ? readings[1].v : null;
		// A "scale-like" unit (e.g. mood polarity's "-5..+5") is a range
		// annotation, not a measurement unit. Appending it to the value
		// produced gibberish like "-1.0 -5..+5". Such a unit moves into the
		// label parenthetical; a real unit (mIU/L, kg, mmHg) stays inline.
		const unitIsScale = !!vital.unit && /\.\.|–|—/.test(vital.unit);
		const unitStr = vital.unit && !unitIsScale ? ` ${vital.unit}` : '';
		// Format: 1-decimal under 20, integer at/above 20 (BP / pulse).
		const fmt = (n: number) => (Math.abs(n) >= 20 ? String(Math.round(n)) : n.toFixed(1));
		const value = `${fmt(last)}${unitStr}`;
		const tileLabel = unitIsScale
			? `${t(vital.label)} (${vital.unit})`
			: t(vital.label);
		let delta: StatCardDelta | undefined;
		if (prev !== null && Math.abs(last - prev) >= 0.05) {
			const d = last - prev;
			// The reasoning that used to justify a 'neutral' semantic HERE now
			// governs every delta on the page: direction interpretation
			// depends on biology and on the person — TSH falling on a
			// hypothyroid patient is good, on a hyperthyroid patient is bad.
			// The tile shows direction; the doctor interprets. Episodes were
			// the last figure that still claimed to know which way was better.
			delta = {
				sign: d > 0 ? '+' : '-',
				value: fmt(Math.abs(d)),
			};
		}
		return { label: tileLabel, value, accent: acc.primary, delta };
	};

	// pi24 P-PDF-4 — Per-cohort tile priority list. Picks first 4 tiles
	// that return non-null. Pre-pi24 a fixed 4-tile slate let 3 of 4
	// tiles render "—" on a real Hans PDF — pure decoration with
	// confidence. The new priority lists carry 5-7 candidates each so
	// there's always a populated fallback. Order matches campfire
	// consensus (vital-primary first for vital cohorts, episode-first
	// for episode cohorts, etc.).
	const conditionId = blueprint.conditionId;
	const vitalPinPerCondition: Record<string, string> = {
		hashimoto: 'tsh',
		hypertension: 'bp_systolic',
		cardiovascular: 'bp_systolic',
		diabetes: 'blood_sugar',
		parkinson: 'tremor_intensity',
		bipolar: 'mood_polarity',
	};
	const candidatesForCohort = (): (Tile | null)[] => {
		const vitalPin = vitalPinPerCondition[conditionId];
		const vitalFirst = vitalPin ? [tileVitalLastValue(vitalPin)] : [];
		switch (cohort) {
			case 'discrete':
				// Vital-pinned discrete (hashimoto / hypertension / cardio /
				// diabetes / parkinson): pinned-vital first, then episodes,
				// duration, rescue-med, trigger, symptom, days-logged.
				// Non-vital discrete (epilepsy / adhd / asthma / glaucoma):
				// episodes first.
				return [
					...vitalFirst,
					tileEpisodes(),
					tileEpisodeDurationDist(),
					tileRescueMed(),
					tileTopTrigger(),
					tileTopSymptom(),				];
			case 'cycle':
				return [
					tileTopTrigger(),
					tileTopSymptom(),
					tileEpisodes(),
					tileRescueMed(),				];
			case 'phase':
				// Bipolar gets polarity-vital tile FIRST (campfire consensus
				// — polarity index is the bipolar clinical primary). Other
				// phase cohorts (MS / IBD / etc.) lead with episodes.
				return [
					...vitalFirst,
					tileEpisodes(),
					tilePhaseTopN(0),
					tilePhaseTopN(1),
					tileTopTrigger(),
					tileTopSymptom(),				];
			case 'narrative':
				return [
					tileTopTrigger(),
					tileEpisodes(),
					tileTopSymptom(),
					tileRescueMed(),				];
			case 'custom':
			default:
				return [
					tileEpisodes(),
					tileTopSymptom(),
					tileTopTrigger(),
					tileRescueMed(),				];
		}
	};
	const tiles: Tile[] = candidatesForCohort()
		.filter((t): t is Tile => t !== null)
		.slice(0, 4);

	// pi24 P-PDF-4 — Geometry adapts to actual tile count so fewer
	// than 4 populated candidates renders a clean N-up row instead of
	// padding with "—". Edge: zero tiles → skip the section entirely.
	const renderTileCount = tiles.length;
	if (renderTileCount > 0) {
		const tileWAdaptive = renderTileCount === 4
			? tileW
			: (pageW - 28 - (renderTileCount - 1) * tileGap) / renderTileCount;
		for (let i = 0; i < renderTileCount; i++) {
			const x = 14 + i * (tileWAdaptive + tileGap);
			drawStatCard(doc, x, cursorY, tileWAdaptive, tileH, tiles[i].label, tiles[i].value, tiles[i].accent, tiles[i].delta);
		}
		// Extra gap below the KPI tiles (2026-05-22 review): the tile row
		// sat jammed against the trajectory-chart title.
		cursorY += tileH + 11;
	}

	// CIPH-pi21-Track-B-4 — cohort-conditional middle. The typed gate at
	// `cohortSections.ts:sectionsForCohort` decides which (if any) primitive
	// renders here. Phase cohorts (bipolar/MS/IBD/anxiety_depression/...)
	// land the stacked-bar; cycle cohorts will land drawCycleStrip in the
	// next commit; discrete/narrative/custom render nothing in this slot.
	const cohortSections = sectionsForCohort(cohort);
	if (cohortSections.includes('phase-distribution')) {
		cursorY = drawPhaseDistribution(
			doc,
			blueprint,
			focusMonthDocs,
			year,
			month,
			t,
			locale,
			cursorY,
		);
	}
	if (cohortSections.includes('cycle-strip')) {
		cursorY = drawCycleStrip(
			doc,
			blueprint,
			documents,
			year,
			month,
			focusDaysInMonth,
			t,
			locale,
			cursorY,
		);
	}

	// Day-coverage strip removed (2026-05-22 review): the 31-cell per-day
	// overview was decorative — the 5-doctor clinician lens noted no doctor
	// cited it as useful, and the monthly grid appendix already carries the
	// per-day detail forensically. `drawDayCoverageStrip` is now dead code.

	// CIPH-pi21-Track-B-5 — scope-branched chart. Per PDF_REWRITE.md §5,
	// 'month' scope renders a daily chart for the focus month; year/2years
	// keep the existing 24/12-month trajectory + vital-trends block.
	/**
	 * User-authored events inside the window, oldest first.
	 *
	 * Replaces the per-event chart markers. Those drew one dashed line, one
	 * triangle and (on the trajectory only) a 22-char label per event at the
	 * event's x position, with no collision handling. Twelve labels from one
	 * real export measured 255mm on a 174mm axis; the design has no working
	 * case above ~5 events and the shipped worst case is ~250.
	 *
	 * Same conclusion the web charts reached on 2026-05-12
	 * (feedback_chart_event_markers): "Aggregate-axis line charts: never draw
	 * per-event marks." There the answer was a tooltip. Paper has no hover, so
	 * the content moves to a list and the chart keeps a per-MONTH count —
	 * whose spacing is the axis spacing, and therefore cannot collide.
	 */
	type ReportEvent = { dateISO: string; isMed: boolean; text: string };

	function buildEventList(): ReportEvent[] {
		const out: ReportEvent[] = [];
		for (const d of documents) {
			if (d.data?.type !== 'event') continue;
			const ds = String(d.data.date || '');
			if (ds.length < 10 || ds < scopeStartISO || ds > scopeEndISO) continue;
			const isMed = d.data.kind === 'medication';
			let text: string;
			if (isMed) {
				const { label, unit } = resolveMedDisplay(blueprint, (d.data as any).medicationId, t);
				const dose = (d.data as any).dose;
				text = dose ? `${label} ${dose}${unit ? ` ${unit}` : ''}` : label;
			} else {
				// Shared with the pre-export review, so the set of sentences the
				// user ticks is exactly the set printed here, resolved from the
				// same field. See lib/reports/noteMarkers.ts.
				text = noteMarkerText(d);
			}
			if (!text) continue;
			out.push({ dateISO: ds, isMed, text });
		}
		return out.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
	}

	const reportEvents = buildEventList();
	// Note markers only. Rescue-med administrations already appear as a KPI
	// tile (days with rescue med) and as CSV columns; counting them here would
	// drown the annotations that have no other home — a PRN taken twice weekly
	// is 104 of them a year.
	const noteEvents = reportEvents.filter((e) => !e.isMed);


	if (scope === 'month') {
		cursorY = drawDailyMonthChart(
			doc,
			documents,
			year,
			month,
			focusDaysInMonth,
			episodeCols,
			t,
			locale,
			acc,
			cursorY,
		);
	}
	if (scope !== 'month') {

	// ── Chart: 24-month trajectory ──
	// Doctors typically see patients once or twice a year. A long-horizon
	// line chart shows whether a condition is trending up, down, or stable
	// — which is the clinical decision input. We aggregate daily episode
	// counts per month across the last 24 months ending with the selected
	// month, and plot one point per month.
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.head);
	doc.setTextColor(...BRAND.textPrimary);
	doc.text(t('pdf.episode_trend_range', { range: windowLabel }), 14, cursorY);

	// Chart horizon matches scope so the visual matches what the bullets
	// describe. Month-scope keeps 24 for context (a 1-month line chart is
	// useless); year shrinks to 12; 2years stays at 24.
	const MONTHS = scope === 'year' ? 12 : 24;
	const monthBuckets: Array<{ y: number; m: number; total: number; days: number; symptomDays: number }> = [];
	for (let k = MONTHS - 1; k >= 0; k--) {
		const d = new Date(year, month - k, 1);
		monthBuckets.push({ y: d.getFullYear(), m: d.getMonth(), total: 0, days: 0, symptomDays: 0 });
	}
	const bucketIndex = new Map(monthBuckets.map((b, i) => [`${b.y}-${String(b.m + 1).padStart(2, '0')}`, i]));
	for (const d of documents) {
		if (d.data?.type !== 'entry') continue;
		const date = String(d.data.date || '');
		if (date.length < 7) continue;
		const key = date.slice(0, 7);
		const idx = bucketIndex.get(key);
		if (idx === undefined) continue;
		const bucket = monthBuckets[idx];
		bucket.days += 1;
		for (const col of episodeCols) {
			bucket.total += d.data?.episodes?.[col] || d.data?.seizures?.[col] || 0;
		}
		const syms = (d.data?.symptoms || {}) as Record<string, unknown>;
		if (Object.values(syms).some((v) => v)) bucket.symptomDays += 1;
	}
	const monthlyTotals = monthBuckets.map(b => b.total);
	const monthlySymptomDays = monthBuckets.map(b => b.symptomDays);

	// NO TRAJECTORY ASSESSMENT. Removed 2026-08-21 on the operator's ruling:
	// "Ciphra ist nur eine Dokumentationsplattform."
	//
	// The chart used to carry a label reading "Mehr Ereignisse" / "Weniger
	// Ereignisse" / "Stabil" — a derived directional verdict on the patient's
	// course. Documenting what was recorded and concluding which way it is
	// going are different acts, and only the first is this product's job.
	//
	// History worth keeping, so this is not re-litigated: the pre-pi24 version
	// coloured that verdict, and the five-doctor campfire flagged it as the
	// single most-cited concern — STABIL on Helena mid-titration, VERBESSERUNG
	// on Hans with a recent GTC, VERSCHLECHTERUNG on Anna's normal-rhythm
	// bipolar quarter. pi24 answered by making the verdict cohort-aware and
	// neutral-coloured (DSPEC-2), which removed the colour but kept the claim.
	// It also read as a control in print: a white rounded rect with a hairline
	// border and a short label is the visual grammar of a button, and a user
	// reported it as "a 'Mehr Ereignisse' button that isn't one".
	//
	// The direction is still fully available to the reader — it is the line on
	// the chart directly below, plus the monthly numbers. What is gone is
	// ciphra asserting which direction that is.

	cursorY += 6;

	const chartX = 22;
	const chartW = pageW - 28 - 8;
	const chartH = 46;
	// CIPH-762 — dual scaling. Episodes on the primary y-axis; symptom-days
	// on a secondary scale so a 90-symptom-days / 3-episode month doesn't
	// flatten the seizure line to the x-axis. Dr. Nguyen explicitly asked
	// for this: clinicians read the two series as separate clinical signals.
	const yMax = Math.max(...monthlyTotals, 1);
	const symptomMax = Math.max(...monthlySymptomDays, 1);

	// Event markers — user-authored `event` docs falling inside the chart
	// window. Rendered as thin dashed vertical lines on the trajectory chart
	// AND on each vital mini-chart so the doctor sees cause-effect.
	//
	// 2026-06-07 clinician review (P0-1): the previous synthetic "Tracking
	// started" marker on the date of the first entry was visually
	// indistinguishable from a real clinical event marker (medication
	// change, hospitalisation, intervention). A neurologist reading a
	// 24-month epilepsy chart would misread it as such. Removed entirely
	// — "when the patient started using the app" is metadata, not clinical
	// signal.
	/**
	 * One mark per month holding note markers, carrying the count.
	 *
	 * Mark pitch == axis pitch, so this is O(1) in event count: 12 events and
	 * 250 events render identically apart from the numerals.
	 */
	function drawEventCountRow(boxX: number, boxW: number, baseY: number) {
		if (noteEvents.length === 0) return;
		const per = new Array(monthBuckets.length).fill(0);
		for (const e of noteEvents) {
			const yy = Number(e.dateISO.slice(0, 4));
			const mm = Number(e.dateISO.slice(5, 7)) - 1;
			const idx = monthBuckets.findIndex((b) => b.y === yy && b.m === mm);
			if (idx >= 0) per[idx]++;
		}
		for (let i = 0; i < per.length; i++) {
			if (per[i] === 0) continue;
			const x = boxX + (i / Math.max(1, monthBuckets.length - 1)) * boxW;
			doc.setDrawColor(...BRAND.ochre);
			doc.setLineWidth(0.4);
			// Diamond — shape-encoded, so it survives grayscale and fax.
			// PDF_DESIGN_SPEC §10 (event marker: diamond) and §14 (every
			// symbol explained: see the legend entry below).
			doc.lines([[1.4, 1.4], [-1.4, 1.4], [-1.4, -1.4], [1.4, -1.4]], x, baseY - 1.4);
			doc.setFont('helvetica', 'bold');
			doc.setFontSize(TYPE.chartAxis);
			doc.setTextColor(...BRAND.textPrimary);
			doc.text(String(per[i]), x, baseY + 5.4, { align: 'center' });
			doc.setFont('helvetica', 'normal');
		}
	}

	// Mark the top of the "shared 24-month axis" group so we can frame
	// it with a slim border once all charts in the group have rendered.
	const trendsBlockTop = cursorY - 8;

	// Plot area background
	doc.setFillColor(...BRAND.paper);
	doc.rect(chartX, cursorY, chartW, chartH, 'F');

	// Horizontal gridlines at 1/4, 1/2, 3/4
	doc.setDrawColor(...BRAND.borderSubtle);
	doc.setLineWidth(0.15);
	for (let g = 1; g <= 3; g++) {
		const y = cursorY + (chartH * g) / 4;
		doc.line(chartX, y, chartX + chartW, y);
	}

	// Y-axis labels
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.chartAxis);
	doc.setTextColor(...BRAND.textMuted);
	doc.text(String(yMax), chartX - 1, cursorY + 2, { align: 'right' });
	// Skip the middle label when yMax is small enough that rounding would
	// produce the same value as the top label (e.g. yMax=1 → mid=round(0.5)=1).
	const midY = Math.round(yMax / 2);
	if (yMax >= 3 && midY !== yMax && midY !== 0) {
		doc.text(String(midY), chartX - 1, cursorY + chartH / 2 + 1, { align: 'right' });
	}
	doc.text('0', chartX - 1, cursorY + chartH, { align: 'right' });

	// Year divider — dashed vertical at the year boundary
	const yearStartIdx = monthBuckets.findIndex(b => b.m === 0 && b.y === monthBuckets[monthBuckets.length - 1].y);
	if (yearStartIdx > 0) {
		const xDiv = chartX + (yearStartIdx / Math.max(1, MONTHS - 1)) * chartW;
		doc.setDrawColor(...BRAND.border);
		doc.setLineWidth(0.2);
		doc.setLineDashPattern([1.2, 1.2], 0);
		doc.line(xDiv, cursorY, xDiv, cursorY + chartH);
		doc.setLineDashPattern([], 0);
	}

	// CIPH-pi19-3-fix — Re-introduce bezier smoothing to match the rounded
	// /reports Chart.js style. Tension is held at 0.25 (vs Chart.js 0.4)
	// AND control-point Y is clamped to [yMin, yMax] inside
	// smoothBezierDeltas — this addresses the prior regression where
	// bezier overshoot dipped below y=0 on descending legs and clipped
	// the chart's bottom border.
	const points: Array<[number, number]> = monthlyTotals.map((v, i) => [
		chartX + (i / Math.max(1, MONTHS - 1)) * chartW,
		cursorY + chartH - (v / yMax) * chartH,
	]);

	const baseY = cursorY + chartH;
	const yTop = cursorY;
	const yBottom = cursorY + chartH;

	// Area fill — bezier top edge so the area doesn't visually mismatch
	// the smoothed stroke. Bottom edge stays a straight horizontal segment.
	if (points.length >= 2) {
		const firstX = points[0][0];
		const firstY = points[0][1];
		const lastX = points[points.length - 1][0];
		const lastY = points[points.length - 1][1];
		const bezier = smoothBezierDeltas(points, yTop, yBottom);
		// Path starts at (firstX, baseY); first delta walks UP to firstY.
		const areaPath: number[][] = [[0, firstY - baseY]];
		// Bezier deltas already encoded relative to previous endpoint.
		for (const seg of bezier) areaPath.push(seg);
		// Walk DOWN to baseline at lastX, then back HORIZONTALLY to firstX.
		areaPath.push([0, baseY - lastY]);
		areaPath.push([-(lastX - firstX), 0]);
		doc.setFillColor(...acc.primarySoft);
		doc.setDrawColor(...acc.primarySoft);
		doc.lines(areaPath, firstX, baseY, undefined, 'F', true);
	}

	// Stroke smoothed bezier segments on top.
	if (points.length >= 2) {
		const bezier = smoothBezierDeltas(points, yTop, yBottom);
		doc.setDrawColor(...acc.primary);
		doc.setLineWidth(0.8);
		doc.lines(bezier, points[0][0], points[0][1], undefined, 'S', false);
	}

	// Data dot at every monthly value (matches mini-chart style).
	if (points.length > 0) {
		doc.setFillColor(...acc.primary);
		for (const [px, py] of points) doc.circle(px, py, 0.6, 'F');
		// Slightly larger end marker on the latest month.
		const [ex, ey] = points[points.length - 1];
		doc.circle(ex, ey, 1.2, 'F');
	}

	// Symptom-days secondary line (faint, dashed) — CIPH-762 uses its OWN
	// scale (`symptomMax`) so it can't dominate the primary episodes line.
	// A muted right-edge label discloses the symptom-days scale so the
	// doctor isn't misled into comparing absolute heights across series.
	if (monthlySymptomDays.some((v) => v > 0)) {
		const sPoints: Array<[number, number]> = monthlySymptomDays.map((v, i) => [
			chartX + (i / Math.max(1, MONTHS - 1)) * chartW,
			cursorY + chartH - (v / symptomMax) * chartH,
		]);
		// CIPH-pi19-3-fix — same bezier smoothing as the primary line so
		// the two series read as one visual family.
		doc.setDrawColor(...BRAND.textMuted);
		doc.setLineWidth(0.4);
		doc.setLineDashPattern([1.2, 1.2], 0);
		const sBezier = smoothBezierDeltas(sPoints, yTop, yBottom);
		doc.lines(sBezier, sPoints[0][0], sPoints[0][1], undefined, 'S', false);
		doc.setLineDashPattern([], 0);
		// DSPEC-4 — secondary-series marker is a square (the primary
		// episodes series uses circles above). Pairs with the dashed
		// stroke so the two series stay distinguishable in grayscale.
		doc.setFillColor(...BRAND.textMuted);
		for (const [px, py] of sPoints) drawMarker(doc, px, py, 0.5, 'square', true);

		// Right-edge scale disclosure: "max Symptom-Tage: 28"
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(TYPE.chartAxisMicro);
		doc.setTextColor(...BRAND.textMuted);
		doc.text(String(symptomMax), chartX + chartW + 0.5, cursorY + 2, { align: 'left' });
		doc.text('0', chartX + chartW + 0.5, cursorY + chartH, { align: 'left' });
	}


	// Slim ochre frame around the trajectory chart's plot area — same color
	// will frame the vital mini-charts so the doctor sees they share an axis.
	doc.setDrawColor(...BRAND.ochreSoft);
	doc.setLineWidth(0.4);
	doc.roundedRect(chartX - 0.3, cursorY - 0.3, chartW + 0.6, chartH + 0.6, 0.8, 0.8, 'S');

	// X-axis labels: every month for 12-month scope, every other for 24.
	// All-month labels at 24mo scope cram into each other and become unreadable.
	doc.setFontSize(TYPE.chartAxis);
	doc.setTextColor(...BRAND.textMuted);
	const labelEvery = MONTHS <= 12 ? 1 : 2;
	for (let i = 0; i < monthBuckets.length; i++) {
		if (i % labelEvery !== 0 && i !== monthBuckets.length - 1) continue;
		const b = monthBuckets[i];
		const x = chartX + (i / Math.max(1, MONTHS - 1)) * chartW;
		const d = new Date(b.y, b.m, 1);
		// Year suffix only on January or first/last bucket — keeps the strip tidy.
		const showYear = b.m === 0 || i === 0 || i === monthBuckets.length - 1;
		const shortLabel = d.toLocaleDateString(locale, showYear
			? { month: 'short', year: '2-digit' }
			: { month: 'short' });
		doc.text(shortLabel, x, cursorY + chartH + 4, { align: 'center' });
	}

	// Event count row — one diamond + count per month holding note markers.
	// Placed under the month labels, inside the slack the `chartH + 18`
	// advance already carried (labels sit at +4, legend at +9).
	drawEventCountRow(chartX, chartW, cursorY + chartH + 8.5);

	// Legend (2026-05-22 review): the solid + dashed series were
	// unlabelled — the reader could not tell episodes from symptom-days.
	{
		const legendY = cursorY + chartH + (noteEvents.length > 0 ? 18 : 9);
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(TYPE.chartAxis);
		let lx = chartX;
		// Episodes — filled circle, primary stroke (solid).
		doc.setDrawColor(...acc.primary);
		doc.setLineWidth(0.8);
		doc.line(lx, legendY - 0.8, lx + 5, legendY - 0.8);
		doc.setFillColor(...acc.primary);
		doc.circle(lx + 2.5, legendY - 0.8, 0.7, 'F');
		doc.setTextColor(...BRAND.textMuted);
		const epLabel = t('pdf.legend_episodes');
		doc.text(epLabel, lx + 7, legendY);
		lx += 7 + doc.getTextWidth(epLabel) + 8;
		// Symptom-days — dashed muted line + square marker (only if drawn).
		if (monthlySymptomDays.some((v) => v > 0)) {
			doc.setDrawColor(...BRAND.textMuted);
			doc.setLineWidth(0.4);
			doc.setLineDashPattern([1.2, 1.2], 0);
			doc.line(lx, legendY - 0.8, lx + 5, legendY - 0.8);
			doc.setLineDashPattern([], 0);
			doc.setFillColor(...BRAND.textMuted);
			drawMarker(doc, lx + 2.5, legendY - 0.8, 0.6, 'square', true);
			doc.setTextColor(...BRAND.textMuted);
			const sdLabel = t('pdf.legend_symptom_days');
			doc.text(sdLabel, lx + 7, legendY);
			lx += 7 + doc.getTextWidth(sdLabel) + 8;
		}
		// PDF_DESIGN_SPEC §14 — every symbol in a chart must be explained by
		// direct label, header or legend. The old markers had no entry here,
		// on any chart.
		if (noteEvents.length > 0) {
			doc.setDrawColor(...BRAND.ochre);
			doc.setLineWidth(0.4);
			doc.lines([[1.2, 1.2], [-1.2, 1.2], [-1.2, -1.2], [1.2, -1.2]], lx + 1.2, legendY - 2);
			doc.setTextColor(...BRAND.textMuted);
			doc.text(t('pdf.legend_event_count'), lx + 4.4, legendY);
		}
	}

	cursorY += chartH + (noteEvents.length > 0 ? 27 : 18);

	// ── 24-month trends: vitals + multiDay episode breakdown ──
	// One mini-chart per significant vital (paired vitals share a chart).
	// One mini-chart for multiDay episode breakdown (e.g. manic vs depressive).
	// All use the same 24-month buckets as the trajectory chart above so the
	// X-axes line up.

	function hexToRGB(hex: string): RGB {
		const m = hex.replace('#', '');
		return [
			parseInt(m.slice(0, 2), 16),
			parseInt(m.slice(2, 4), 16),
			parseInt(m.slice(4, 6), 16),
		];
	}

	function aggregateVitalMonthly(vid: string, mode: 'mean' | 'max' = 'mean'): (number | null)[] {
		const buckets = monthBuckets.map(() => ({ sum: 0, max: 0, count: 0 }));
		for (const d of documents) {
			if (d.data?.type !== 'entry') continue;
			const dateStr = String(d.data.date || '');
			const idx = bucketIndex.get(dateStr.slice(0, 7));
			if (idx === undefined) continue;
			const raw = d.data?.vitals?.[vid];
			if (!raw) continue;
			const vals: number[] = [];
			try {
				const p = JSON.parse(raw);
				if (Array.isArray(p)) {
					for (const e of p) {
						const n = Number(e.value);
						if (!isNaN(n)) vals.push(n);
					}
				}
			} catch {
				/* not JSON */
			}
			if (vals.length === 0) {
				const n = Number(raw);
				if (!isNaN(n)) vals.push(n);
			}
			for (const v of vals) {
				buckets[idx].sum += v;
				if (v > buckets[idx].max) buckets[idx].max = v;
				buckets[idx].count++;
			}
		}
		return buckets.map((b) =>
			b.count > 0 ? (mode === 'mean' ? b.sum / b.count : b.max) : null
		);
	}

	function aggregateEpisodeMonthly(epId: string): number[] {
		const buckets = monthBuckets.map(() => 0);
		for (const d of documents) {
			// Include standalone `episode` quick-add docs.
			if (d.data?.type !== 'entry') continue;
			const dateStr = String(d.data.date || '');
			const idx = bucketIndex.get(dateStr.slice(0, 7));
			if (idx === undefined) continue;
			const eps = (d.data?.episodes || d.data?.seizures || {}) as Record<string, number>;
			if ((eps[epId] || 0) > 0) buckets[idx]++;
		}
		return buckets;
	}

	type MiniSeries = { label: string; color: string; values: (number | null)[] };
	type RefLine = { value: number; label: string };
	// pi24 P-PDF-3 — `kind` discriminates the renderer. 'line' is the default
	// (current behavior). 'diverging-bars' renders signed-magnitude data
	// centered on a zero baseline — added for bipolar mood_polarity (-5..+5)
	// per Brunner's 5-doctor campfire critique: a line chart oscillating
	// across zero reads as noise, while bars above/below zero answer the
	// "how much manic vs how much depressed" question at a glance. The
	// `yMin` / `yMax` overrides pin the y-axis to the vital's declared
	// range so the zero baseline stays centered and bar magnitudes compare
	// across months. Diverging-bar charts must declare both yMin and yMax;
	// the renderer asserts that yMin < 0 < yMax.
	type MiniChart = {
		title: string;
		series: MiniSeries[];
		yLabel?: string;
		referenceLines?: RefLine[];
		kind?: 'line' | 'diverging-bars';
		yMin?: number;
		yMax?: number;
		negativeColor?: string;
	};

	const miniCharts: MiniChart[] = [];

	// Aggregator that filters multi-entry vital values by time of day.
	// Returns monthly mean of values whose time matches the requested half-day.
	function aggregateVitalMonthlyByTime(vid: string, half: 'am' | 'pm'): (number | null)[] {
		const buckets = monthBuckets.map(() => ({ sum: 0, count: 0 }));
		for (const d of documents) {
			if (d.data?.type !== 'entry') continue;
			const dateStr = String(d.data.date || '');
			const idx = bucketIndex.get(dateStr.slice(0, 7));
			if (idx === undefined) continue;
			const raw = d.data?.vitals?.[vid];
			if (!raw) continue;
			try {
				const parsed = JSON.parse(raw);
				if (!Array.isArray(parsed)) continue;
				for (const e of parsed) {
					const time = String(e.time || '');
					const hh = parseInt(time.slice(0, 2));
					if (isNaN(hh)) continue;
					const isAM = hh < 12;
					if (half === 'am' && !isAM) continue;
					if (half === 'pm' && isAM) continue;
					const n = Number(e.value);
					if (isNaN(n)) continue;
					buckets[idx].sum += n;
					buckets[idx].count++;
				}
			} catch {
				/* not JSON */
			}
		}
		return buckets.map((b) => (b.count > 0 ? b.sum / b.count : null));
	}

	// Vitals with excludeFromTrends (cycle_day, cycle_length, period_duration)
	// never chart — their monthly mean is semantically meaningless.
	const chartableVitals = blueprint.vitals.filter((v) => !v.excludeFromTrends);

	// 1. Paired vitals (e.g. left/right IOP, pain + pain_interference)
	const seenVitalIds = new Set<string>();
	const PAIR_COLORS = [DATA_HEX.d1, DATA_HEX.d5];
	for (const v of chartableVitals) {
		if (seenVitalIds.has(v.id) || !v.pairLabel) continue;
		const pair = chartableVitals.filter((x) => x.pairLabel === v.pairLabel);
		const series: MiniSeries[] = pair.map((p, i) => ({
			label: vitalLabelOf(t, p),
			color: PAIR_COLORS[i % PAIR_COLORS.length],
			values: aggregateVitalMonthly(p.id, 'max'),
		}));
		for (const p of pair) seenVitalIds.add(p.id);
		if (series.some((s) => s.values.some((v2) => v2 !== null))) {
			const titleKey = `vital.pair_${v.pairLabel}`;
			const title = t(titleKey);
			const refLines: RefLine[] = pair
				.filter((p) => p.referenceLine)
				.map((p) => ({
					value: p.referenceLine!.value,
					label: t(p.referenceLine!.labelKey),
				}));
			miniCharts.push({
				title: (title === titleKey ? vitalLabelOf(t, v) : title) + (v.unit ? ` (${translateUnit(t, v.unit)})` : ''),
				series,
				referenceLines: refLines.length ? refLines : undefined,
			});
		}
	}

	// 2. Single vitals worth charting (auto-detect from data presence)
	for (const v of chartableVitals) {
		if (seenVitalIds.has(v.id)) continue;
		const values = aggregateVitalMonthly(v.id, 'mean');
		const populated = values.filter((x) => x !== null).length;
		if (populated < 2) continue;
		// Polarity vitals (declared `min < 0`) render as diverging bars and
		// are the cohort primary — exempt from the relevance gate below.
		const isPolarVital = typeof v.min === 'number' && typeof v.max === 'number' && v.min < 0;
		// Relevance gate (2026-05-22 review): skip a vital that barely moves
		// across the window — it renders as a flat noise line (e.g. weight
		// for an epilepsy / bipolar patient) carrying no signal a clinician
		// acts on. Vitals that genuinely move (labs, mood, sleep) clear the
		// 4%-relative-range threshold easily; this is per-export "relevance"
		// — a patient whose weight IS trending still gets the chart.
		if (!isPolarVital) {
			const nums = values.filter((x): x is number => x !== null);
			const vMin = Math.min(...nums);
			const vMax = Math.max(...nums);
			const vMean = nums.reduce((a, b) => a + b, 0) / nums.length;
			if (vMean !== 0 && (vMax - vMin) / Math.abs(vMean) < 0.04) {
				seenVitalIds.add(v.id);
				continue;
			}
		}
		const refLines: RefLine[] = v.referenceLine
			? [{ value: v.referenceLine.value, label: t(v.referenceLine.labelKey) }]
			: [];
		// pi24 P-PDF-3 — Polarity vitals (`isPolarVital`, computed above)
		// render as diverging bars on a zero baseline instead of a line.
		// Brunner's 5-doctor campfire critique: a line through zero reads
		// as noise on sign+magnitude data; bars above/below zero communicate
		// "how much manic vs how much depressed" at a glance. The chart
		// remains pure display (raw values, neutral colors, no
		// classification). yMin/yMax pin the axis so the zero baseline is
		// centered and bar heights compare across months.
		if (isPolarVital) {
			miniCharts.push({
				title: `${vitalLabelOf(t, v)}${v.unit ? ` (${translateUnit(t, v.unit)})` : ''}`,
				series: [{ label: vitalLabelOf(t, v), color: DATA_HEX.d1, values }],
				referenceLines: refLines.length ? refLines : undefined,
				kind: 'diverging-bars',
				yMin: v.min,
				yMax: v.max,
				negativeColor: DATA_HEX.d5,
			});
		} else {
			miniCharts.push({
				title: `${vitalLabelOf(t, v)}${v.unit ? ` (${translateUnit(t, v.unit)})` : ''}`,
				series: [{ label: vitalLabelOf(t, v), color: DATA_HEX.d1, values }],
				referenceLines: refLines.length ? refLines : undefined,
			});
		}
		seenVitalIds.add(v.id);
	}

	// 2b. Time-of-day split charts (morning vs evening) for vitals flagged
	// `splitByTimeOfDay`. Renders in addition to the paired/single charts so
	// the doctor sees both the absolute trend and the diurnal pattern.
	for (const v of chartableVitals) {
		if (!v.splitByTimeOfDay || !v.multiEntry) continue;
		const am = aggregateVitalMonthlyByTime(v.id, 'am');
		const pm = aggregateVitalMonthlyByTime(v.id, 'pm');
		if (!am.some((x) => x !== null) && !pm.some((x) => x !== null)) continue;
		const refLines: RefLine[] = v.referenceLine
			? [{ value: v.referenceLine.value, label: t(v.referenceLine.labelKey) }]
			: [];
		miniCharts.push({
			title: `${vitalLabelOf(t, v)}${v.unit ? ` (${translateUnit(t, v.unit)})` : ''} — ${t('pdf.am_pm_split')}`,
			series: [
				{ label: t('pdf.am_label'), color: DATA_HEX.d1, values: am },
				{ label: t('pdf.pm_label'), color: DATA_HEX.d5, values: pm },
			],
			referenceLines: refLines.length ? refLines : undefined,
		});
	}

	// 3. Episode breakdown — one line per episode type that has any data.
	// Relaxed from multiDay-only: burnout has point-event episodes (panic vs
	// breakdown) that doctors still want to see broken out.
	const breakdownEps = blueprint.episodeTypes
		.map((ep) => ({ ep, values: aggregateEpisodeMonthly(ep.id) }))
		.filter((x) => x.values.some((v) => v > 0));
	if (breakdownEps.length >= 2) {
		miniCharts.push({
			title: t('pdf.episode_breakdown_title'),
			series: breakdownEps.map(({ ep, values }) => ({
				label: labelOf(t, ep),
				color: ep.color,
				values,
			})),
			yLabel: t('pdf.days_per_month'),
		});
	}

	// Order: most-populated first, cap at 4 (leaves space for symptom table).
	miniCharts.sort((a, b) => {
		const score = (c: MiniChart) =>
			c.series.reduce(
				(s, x) => s + x.values.filter((v) => v !== null && v !== 0).length,
				0
			);
		return score(b) - score(a);
	});
	const charts = miniCharts.slice(0, 4);

	if (charts.length > 0) {
		// Section head needs at least one chart's worth of follow-on
		// space, otherwise the title gets orphaned. chartTitle (35mm)
		// gives head + first chart body; the loop below re-reserves
		// per-chart.
		cursorY = reserveSpace(doc, cursorY, BREAK.sectionHead + BREAK.chartTitle);
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(TYPE.head);
		doc.setTextColor(...BRAND.textPrimary);
		doc.text(t('pdf.vital_trends_title_range', { range: windowLabel }), 14, cursorY);
		cursorY += 7;

		const cx = 22;
		const cw = pageW - 28 - 8;
		const ch = 24;

		for (const chart of charts) {
			// Per-chart break: title + legend + body. On continuation
			// pages re-render the section title so the chart never
			// appears without its group header (§8 orphan-prevention).
			cursorY = reserveSpace(doc, cursorY, BREAK.chartTitle, () => {
				doc.setFont('helvetica', 'bold');
				doc.setFontSize(TYPE.head);
				doc.setTextColor(...BRAND.textPrimary);
				doc.text(t('pdf.vital_trends_title_range', { range: windowLabel }), 14, PAGE_TOP_AFTER_BREAK);
				return PAGE_TOP_AFTER_BREAK + 7;
			});
			// Title + inline legend
			doc.setFont('helvetica', 'normal');
			doc.setFontSize(TYPE.table);
			doc.setTextColor(...BRAND.textSecondary);
			doc.text(chart.title, 14, cursorY);
			if (chart.series.length > 1) {
				let lx = 14 + doc.getTextWidth(chart.title) + 6;
				doc.setFontSize(TYPE.compact);
				for (let si = 0; si < chart.series.length; si++) {
					const s = chart.series[si];
					const style = seriesStyleFor(si);
					const rgb = hexToRGB(s.color);
					doc.setFillColor(...rgb);
					doc.setDrawColor(...rgb);
					doc.setLineWidth(0.3);
					drawMarker(doc, lx, cursorY - 1.2, 1, style.shape, style.filled);
					doc.setTextColor(...BRAND.textMuted);
					doc.text(s.label, lx + 2, cursorY);
					lx += doc.getTextWidth(s.label) + 7;
				}
			}
			cursorY += 2;

			// pi24 P-PDF-3 — Diverging-bars renderer for polarity vitals
			// (e.g. bipolar mood_polarity). Per-bar color by sign; y-axis
			// pinned to the vital's declared [min, max] so zero is
			// centered. Brunner's 5-doctor campfire critique: a line chart
			// on signed-magnitude data overstates continuity and reads as
			// noise. Bars communicate "how much above zero / how much
			// below zero" directly. The chart is pure display — neutral
			// colors per sign, no clinical labels, no value judgment in
			// the legend.
			if (chart.kind === 'diverging-bars'
				&& typeof chart.yMin === 'number'
				&& typeof chart.yMax === 'number'
				&& chart.yMin < 0
				&& chart.yMax > 0) {
				// Plot area background.
				doc.setFillColor(...BRAND.paper);
				doc.rect(cx, cursorY, cw, ch, 'F');
				// Zero baseline — explicit, slightly stronger than the
				// midline of a normal line chart because bars hang from it.
				const yMin = chart.yMin;
				const yMax = chart.yMax;
				const yRange = yMax - yMin;
				const zeroY = cursorY + ch - ((0 - yMin) / yRange) * ch;
				doc.setDrawColor(...BRAND.borderSubtle);
				doc.setLineWidth(0.3);
				doc.line(cx, zeroY, cx + cw, zeroY);

				// Y-labels (min, 0, max).
				doc.setFont('helvetica', 'normal');
				doc.setFontSize(TYPE.chartAxis);
				doc.setTextColor(...BRAND.textMuted);
				const fmtPolar = (n: number) => n.toFixed(1);
				doc.text(fmtPolar(yMax), cx - 1, cursorY + 2, { align: 'right' });
				doc.text('0', cx - 1, zeroY + 1.2, { align: 'right' });
				doc.text(fmtPolar(yMin), cx - 1, cursorY + ch, { align: 'right' });

				// Bars: per-month one bar per value (single-series only;
				// diverging bars don't compose with multi-series the way
				// line charts do).
				const series = chart.series[0];
				if (series) {
					const posRgb = hexToRGB(series.color);
					const negRgb = hexToRGB(chart.negativeColor || series.color);
					const n = series.values.length;
					const barSlot = cw / Math.max(1, n);
					const barWidth = Math.max(0.6, barSlot * 0.55);
					for (let i = 0; i < n; i++) {
						const v = series.values[i];
						if (v === null) continue;
						const cxBar = cx + (i + 0.5) * barSlot - barWidth / 2;
						const valY = cursorY + ch - ((v - yMin) / yRange) * ch;
						const top = Math.min(zeroY, valY);
						const height = Math.abs(zeroY - valY);
						if (height < 0.1) continue; // skip near-zero
						const rgb = v >= 0 ? posRgb : negRgb;
						doc.setFillColor(...rgb);
						doc.rect(cxBar, top, barWidth, height, 'F');
					}
				}

				// Shared chart frame + event lines + month labels — same
				// chrome as the line-rendered charts so this section reads
				// as one visual group.
				// No event markers here. They rendered with `withLabels: false` —
				// an unexplained brick dashed line over someone's TSH or BP trend,
				// with no legend anywhere in the document. That is the defect the
				// 2026-06-07 review removed as P0-1. Annotations now live in the
				// count row on the trajectory and in the Notizmarker list.
				doc.setDrawColor(...BRAND.ochreSoft);
				doc.setLineWidth(0.4);
				doc.roundedRect(cx - 0.3, cursorY - 0.3, cw + 0.6, ch + 0.6, 0.8, 0.8, 'S');

				doc.setFont('helvetica', 'normal');
				doc.setFontSize(TYPE.chartAxisMicro);
				doc.setTextColor(...BRAND.textMuted);
				const labelEvery = MONTHS <= 12 ? 1 : 2;
				for (let i = 0; i < monthBuckets.length; i++) {
					if (i % labelEvery !== 0 && i !== monthBuckets.length - 1) continue;
					const b = monthBuckets[i];
					const lx = cx + (i / Math.max(1, MONTHS - 1)) * cw;
					const dt = new Date(b.y, b.m, 1);
					const showYear = b.m === 0 || i === 0 || i === monthBuckets.length - 1;
					const lbl = dt.toLocaleDateString(locale, showYear
						? { month: 'short', year: '2-digit' }
						: { month: 'short' });
					doc.text(lbl, lx, cursorY + ch + 3, { align: 'center' });
				}
				cursorY += ch + 9;
				continue;  // skip the default line-chart render below
			}

			// Plot area
			doc.setFillColor(...BRAND.paper);
			doc.rect(cx, cursorY, cw, ch, 'F');
			doc.setDrawColor(...BRAND.borderSubtle);
			doc.setLineWidth(0.1);
			doc.line(cx, cursorY + ch / 2, cx + cw, cursorY + ch / 2);

			// y-range — include reference values so the line is visible.
			const refVals = (chart.referenceLines || []).map((r) => r.value);
			const allVals = [
				...chart.series.flatMap((s) => s.values.filter((v): v is number => v !== null)),
				...refVals,
			];
			const yMax = Math.max(...allVals, 1);
			const yMin = Math.min(...allVals, 0);
			const ySpan = Math.max(0.1, yMax - yMin);

			// y-labels
			doc.setFont('helvetica', 'normal');
			doc.setFontSize(TYPE.chartAxis);
			doc.setTextColor(...BRAND.textMuted);
			const fmt = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1));
			doc.text(fmt(yMax), cx - 1, cursorY + 2, { align: 'right' });
			doc.text(fmt(yMin), cx - 1, cursorY + ch, { align: 'right' });

			// Reference / target lines — drawn BEFORE series so the data
			// sits visually on top. Dashed olive line + tiny right-edge label.
			if (chart.referenceLines && chart.referenceLines.length > 0) {
				doc.setLineDashPattern([0.6, 0.6], 0);
				doc.setLineWidth(0.25);
				doc.setDrawColor(...BRAND.olive);
				for (const ref of chart.referenceLines) {
					const refY = cursorY + ch - ((ref.value - yMin) / ySpan) * ch;
					doc.line(cx, refY, cx + cw, refY);
				}
				doc.setLineDashPattern([], 0);
				doc.setFontSize(TYPE.chartAxisMicro);
				doc.setTextColor(...BRAND.olive);
				for (const ref of chart.referenceLines) {
					const refY = cursorY + ch - ((ref.value - yMin) / ySpan) * ch;
					doc.text(`${ref.label}: ${ref.value}`, cx + cw - 0.5, refY - 0.5, { align: 'right' });
				}
			}

			// Each series — CIPH-pi19-3-fix: bezier-smoothed segments to
			// match the rounded /reports Chart.js style. Same tension/clamp
			// discipline as the trajectory line so overshoot can't dip below
			// the chart frame. DSPEC-4: per-series (shape × dash) pair so
			// the chart stays decipherable in grayscale.
			const yTopMini = cursorY;
			const yBottomMini = cursorY + ch;
			for (let si = 0; si < chart.series.length; si++) {
				const s = chart.series[si];
				const style = seriesStyleFor(si);
				const rgb = hexToRGB(s.color);
				doc.setDrawColor(...rgb);
				doc.setLineWidth(si === 0 ? 0.5 : 0.4);
				if (style.dash.length) doc.setLineDashPattern(style.dash, 0);
				const pts: [number, number][] = [];
				for (let i = 0; i < s.values.length; i++) {
					const v = s.values[i];
					if (v === null) continue;
					const x = cx + (i / Math.max(1, MONTHS - 1)) * cw;
					const y = cursorY + ch - ((v - yMin) / ySpan) * ch;
					pts.push([x, y]);
				}
				if (pts.length >= 2) {
					const bezier = smoothBezierDeltas(pts, yTopMini, yBottomMini);
					doc.lines(bezier, pts[0][0], pts[0][1], undefined, 'S', false);
				}
				if (style.dash.length) doc.setLineDashPattern([], 0);
				doc.setFillColor(...rgb);
				for (const [x, y] of pts) drawMarker(doc, x, y, 0.55, style.shape, style.filled);
			}
			// Event markers (no labels — too cramped on mini charts) and the
			// shared-axis ochre frame so the doctor sees this chart belongs
			// to the same temporal group as the trajectory chart above.
			// No event markers here. They rendered with `withLabels: false` —
			// an unexplained brick dashed line over someone's TSH or BP trend,
			// with no legend anywhere in the document. That is the defect the
			// 2026-06-07 review removed as P0-1. Annotations now live in the
			// count row on the trajectory and in the Notizmarker list.
			doc.setDrawColor(...BRAND.ochreSoft);
			doc.setLineWidth(0.4);
			doc.roundedRect(cx - 0.3, cursorY - 0.3, cw + 0.6, ch + 0.6, 0.8, 0.8, 'S');

			// X-axis month labels — same density rule as the trajectory chart.
			// Without these the mini-charts read as abstract lines with no
			// temporal anchor (Klara called this out, screenshot confirmed).
			doc.setFont('helvetica', 'normal');
			doc.setFontSize(TYPE.chartAxisMicro);
			doc.setTextColor(...BRAND.textMuted);
			const miniLabelEvery = MONTHS <= 12 ? 1 : 2;
			for (let i = 0; i < monthBuckets.length; i++) {
				if (i % miniLabelEvery !== 0 && i !== monthBuckets.length - 1) continue;
				const b = monthBuckets[i];
				const lx = cx + (i / Math.max(1, MONTHS - 1)) * cw;
				const dt = new Date(b.y, b.m, 1);
				const showYear = b.m === 0 || i === 0 || i === monthBuckets.length - 1;
				const lbl = dt.toLocaleDateString(locale, showYear
					? { month: 'short', year: '2-digit' }
					: { month: 'short' });
				doc.text(lbl, lx, cursorY + ch + 3, { align: 'center' });
			}
			cursorY += ch + 9;
		}
		cursorY += 2;
	}

	// ── Episode duration breakdown ──
	// pi24 P-PDF-10 — Locale-aware unit conversion footnote for thyroid
	// labs. Steiner's specific call-out from the 5-doctor agents
	// campfire: Swiss endocrinology reads free T4 / free T3 in pmol/L
	// (SI convention), but the Hashimoto preset stores values in
	// ng/dL / pg/mL (US convention). Rather than convert values at
	// render time (which would require migrating stored data + changing
	// future input fields), the footnote displays the conversion
	// factors so a DE/FR/IT reader can compute pmol/L mentally without
	// looking up the factor. Display is annotation only — no value
	// transformation, no abnormality computation. Spec-aligned per
	// PDF_TEMPLATE.md Section 10.
	const showThyroidConversionNote =
		blueprint.conditionId === 'hashimoto'
		&& (locale === 'de' || locale === 'fr' || locale === 'it');
	if (showThyroidConversionNote) {
		cursorY = reserveSpace(doc, cursorY, BREAK.noteBlock);
		doc.setFont('helvetica', 'italic');
		doc.setFontSize(TYPE.compact);
		doc.setTextColor(...BRAND.textMuted);
		doc.text(t('pdf.unit_conv_thyroid'), 14, cursorY);
		cursorY += 5;
	}

	// For episode types with `trackDuration: true` (epilepsy, migraine,
	// glaucoma episodes), aggregate the duration buckets across the report
	// window. A 5-minute focal vs a 30-second focal mean different things —
	// doctors triage by duration, not just count.
	const durEps = blueprint.episodeTypes.filter((e) => e.trackDuration);
	if (durEps.length > 0) {
		// Was a local trailing-12 window derived from the anchor, independent
		// of `scope`: on a 24-month report this table silently covered only
		// the second half of it. It follows the report window now, so the
		// heading can name the same period as the rest of the document.
		const windowDurDocs = documents.filter((d) => {
			// Standalone `episode` docs also carry `episodes` and
			// `episodeDurations`, so include them in duration buckets.
			if (d.data?.type !== 'entry') return false;
			const ds = String(d.data.date || '');
			return ds >= scopeStartISO && ds <= scopeEndISO;
		});

		// duration counts per episode type
		const durBuckets: Record<string, { lt1: number; m15: number; gt5: number; unk: number; total: number }> = {};
		for (const ep of durEps) {
			durBuckets[ep.id] = { lt1: 0, m15: 0, gt5: 0, unk: 0, total: 0 };
		}
		for (const d of windowDurDocs) {
			const eps = (d.data?.episodes || d.data?.seizures || {}) as Record<string, number>;
			const durs = (d.data?.episodeDurations || {}) as Record<string, string>;
			const inst = (d.data?.episodeInstances || {}) as Record<string, Array<{ duration?: string }>>;
			for (const ep of durEps) {
				const b = durBuckets[ep.id];
				const rows = inst[ep.id];
				if (Array.isArray(rows) && rows.length > 0) {
					// Per-occurrence durations: bucket each episode by its own value.
					for (const r of rows) {
						b.total += 1;
						if (r?.duration === '<1min') b.lt1 += 1;
						else if (r?.duration === '1-5min') b.m15 += 1;
						else if (r?.duration === '>5min') b.gt5 += 1;
						else b.unk += 1;
					}
					continue;
				}
				const cnt = eps[ep.id] || 0;
				if (cnt <= 0) continue;
				const dur = durs[ep.id] || '';
				b.total += cnt;
				if (dur === '<1min') b.lt1 += cnt;
				else if (dur === '1-5min') b.m15 += cnt;
				else if (dur === '>5min') b.gt5 += cnt;
				else b.unk += cnt;
			}
		}
		const hasAny = Object.values(durBuckets).some((b) => b.total > 0);
		if (hasAny) {
			cursorY = reserveSpace(doc, cursorY, BREAK.sectionHead + BREAK.tableHeader);
			doc.setFont('helvetica', 'bold');
			doc.setFontSize(TYPE.head);
			doc.setTextColor(...BRAND.textPrimary);
			doc.text(t('pdf.episode_duration_title_range', { range: windowLabel }), 14, cursorY);
			cursorY += 2;

			const durRows = durEps
				.filter((ep) => durBuckets[ep.id].total > 0)
				.map((ep) => {
					const b = durBuckets[ep.id];
					return [
						labelOf(t, ep),
						String(b.lt1),
						String(b.m15),
						String(b.gt5),
						String(b.unk),
						String(b.total),
					];
				});

			autoTable(doc, {
				startY: cursorY,
				head: [[
					t('pdf.episode_breakdown_title').split(' — ')[0],
					t('pdf.episode_duration_under1'),
					t('pdf.episode_duration_1to5'),
					t('pdf.episode_duration_over5'),
					t('pdf.episode_duration_unknown'),
					t('pdf.total_short'),
				]],
				body: durRows,
				theme: 'plain',
				styles: {
					fontSize: TYPE.table,
					cellPadding: 2,
					lineColor: BRAND.borderSubtle as any,
					lineWidth: 0.1,
					textColor: BRAND.textPrimary as any,
				},
				headStyles: {
					fillColor: BRAND.paperInset as any,
					textColor: BRAND.textPrimary as any,
					fontStyle: 'bold',
					fontSize: TYPE.table,
				},
				alternateRowStyles: { fillColor: [252, 250, 248] as any },
				columnStyles: {
					0: { cellWidth: 60 },
					1: { cellWidth: 22, halign: 'center' },
					2: { cellWidth: 22, halign: 'center' },
					3: { cellWidth: 22, halign: 'center' },
					4: { cellWidth: 32, halign: 'center' },
					5: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
				},
				didDrawCell: continuationLabelHook(t('pdf.table_continued')),
			});
			cursorY = (doc as any).lastAutoTable?.finalY ?? cursorY + 10;
			cursorY += 6;
		}
	}

	} // end of `if (scope !== 'month')` — skip trajectory + vital-trends + duration for month scope

	// ── Notizmarker — the annotations, in full, in order ──
	//
	// This is where the freeform note text lives now. On the chart it was a
	// 21-character fragment that kept the identifying half of a sentence and
	// discarded the meaning; here the column is ~130mm and wraps, so German
	// and French stop being a layout problem.
	//
	// Oldest first, per feedback_pdf_clinician_lens §5: the doctor should read
	// the arc, not a feed. Renders on EVERY scope — month exports previously
	// showed annotations nowhere at all, because the daily chart never drew
	// markers.
	//
	// The provenance header is the P0-2 pattern from `drawTopLineQuote`: the
	// clinician learns who authored the words before reading them, so a
	// patient's sentence cannot be scanned as a clinical assertion.
	if (noteEvents.length > 0) {
		cursorY = reserveSpace(doc, cursorY, BREAK.tableHeader);
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(TYPE.head);
		doc.setTextColor(...BRAND.textPrimary);
		doc.text(t('pdf.event_notes_title'), 14, cursorY);
		cursorY += 4;
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(TYPE.compact);
		doc.setTextColor(...BRAND.textMuted);
		doc.text(t('pdf.event_notes_provenance'), 14, cursorY);
		cursorY += 3;

		// Month NAME and year, not "08/21". A 2-year report spans two years, so
		// a bare day/month is ambiguous — and a numeric day/month flips meaning
		// between locales. Same reasoning as the window label in reportWindow.ts.
		const dateCol = 30;
		const bodyCol = pageW - 28 - dateCol;
		autoTable(doc, {
			startY: cursorY,
			margin: { left: 14, right: 14 },
			head: [[t('pdf.date'), t('pdf.event_notes_col')]],
			body: noteEvents.map((e) => [
				formatISODateChoice(e.dateISO, blueprint.dateFormat),
				e.text,
			]),
			theme: 'plain',
			styles: {
				fontSize: TYPE.table,
				cellPadding: 1.6,
				lineColor: BRAND.borderSubtle as any,
				lineWidth: 0.1,
				textColor: BRAND.textPrimary as any,
				overflow: 'linebreak',
			},
			headStyles: {
				fillColor: BRAND.paperInset as any,
				textColor: BRAND.textPrimary as any,
				fontStyle: 'bold',
				fontSize: TYPE.table,
			},
			columnStyles: {
				0: { cellWidth: dateCol, textColor: BRAND.textSecondary as any },
				1: { cellWidth: bodyCol },
			},
			didDrawCell: continuationLabelHook(t('pdf.table_continued')),
		});
		cursorY = ((doc as any).lastAutoTable?.finalY ?? cursorY + 10) + 6;
	}


	// ── Symptom frequency table ──
	cursorY = reserveSpace(doc, cursorY, BREAK.sectionHead + BREAK.tableHeader);

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.head);
	doc.setTextColor(...BRAND.textPrimary);
	// Centered on the page (2026-05-22 review): the 3-column table is
	// 146mm — left-aligned it left a 34mm band of dead white space. Title
	// centers with it.
	doc.text(t('pdf.symptom_frequency'), pageW / 2, cursorY, { align: 'center' });
	cursorY += 2;

	const symptomRows = symptomFreq.map((s) => [
		s.label,
		String(s.count),
		`${daysInMonth > 0 ? Math.round((s.count / daysInMonth) * 100) : 0}%`,
	]);

	if (symptomRows.length > 0) {
		const symFreqTableW = 90 + 28 + 28;
		autoTable(doc, {
			startY: cursorY,
			margin: { left: (pageW - symFreqTableW) / 2, right: (pageW - symFreqTableW) / 2 },
			head: [[t('pdf.symptom'), t('pdf.days_active'), t('pdf.frequency')]],
			body: symptomRows,
			theme: 'plain',
			styles: {
				fontSize: TYPE.table,
				cellPadding: 2,
				lineColor: BRAND.borderSubtle as any,
				lineWidth: 0.1,
				textColor: BRAND.textPrimary as any,
			},
			headStyles: {
				fillColor: BRAND.paperInset as any,
				textColor: BRAND.textPrimary as any,
				fontStyle: 'bold',
				fontSize: TYPE.table,
			},
			alternateRowStyles: {
				fillColor: [252, 250, 248] as any,
			},
			columnStyles: {
				0: { cellWidth: 90 },
				1: { cellWidth: 28, halign: 'center' },
				2: { cellWidth: 28, halign: 'center' },
			},
			didParseCell: (data: any) => {
				if (data.section === 'body' && data.column.index === 1) {
					// Days-active count — cohort-break (data intensity, not status)
					data.cell.styles.textColor = acc.break as any;
					data.cell.styles.fontStyle = 'bold';
				}
				if (data.section === 'body' && data.column.index === 2) {
					const pct = parseInt(data.cell.raw as string);
					if (pct >= 50) {
						// High-frequency emphasis — cohort-primary (data, not status)
						data.cell.styles.textColor = acc.primary as any;
						data.cell.styles.fontStyle = 'bold';
					} else {
						data.cell.styles.textColor = BRAND.textSecondary as any;
					}
				}
			},
			didDrawCell: continuationLabelHook(t('pdf.table_continued')),
		});
		cursorY = (doc as any).lastAutoTable?.finalY ?? cursorY + 10;
		cursorY += 6;
	} else {
		cursorY += 4;
		doc.setFont('helvetica', 'italic');
		doc.setFontSize(TYPE.body);
		doc.setTextColor(...BRAND.textMuted);
		doc.text(t('pdf.no_symptoms'), 14, cursorY);
		cursorY += 6;
	}

	// ── Medication adherence ──
	if (blueprint.medications.length > 0) {
		cursorY = reserveSpace(doc, cursorY, BREAK.sectionHead + BREAK.tableHeader);

		doc.setFont('helvetica', 'bold');
		doc.setFontSize(TYPE.head);
		doc.setTextColor(...BRAND.textPrimary);
		doc.text(t('pdf.medication_adherence'), 14, cursorY);
		cursorY += 2;

		const medRows = blueprint.medications.map((med) => {
			// Assume-taken model for scheduled meds, taken-toggle for as-needed.
			// See medAdherence() for the two models + back-compat note.
			const { taken, total, pct } = medAdherence(med, monthDocs, daysLogged);
			return [`${med.name} ${med.dose}`, med.schedule, `${taken} / ${total}`, `${pct}%`];
		});

		autoTable(doc, {
			startY: cursorY,
			head: [[t('pdf.medication'), t('pdf.schedule'), t('pdf.taken'), t('pdf.adherence')]],
			body: medRows,
			theme: 'plain',
			styles: {
				fontSize: TYPE.table,
				cellPadding: 2,
				lineColor: BRAND.borderSubtle as any,
				lineWidth: 0.1,
				textColor: BRAND.textPrimary as any,
			},
			headStyles: {
				fillColor: BRAND.paperInset as any,
				textColor: BRAND.textPrimary as any,
				fontStyle: 'bold',
				fontSize: TYPE.table,
			},
			alternateRowStyles: {
				fillColor: [252, 250, 248] as any,
			},
			columnStyles: {
				2: { halign: 'center' },
				3: { halign: 'center' },
			},
			didParseCell: (data: any) => {
				if (data.section === 'body' && data.column.index === 3) {
					const pct = parseInt(data.cell.raw as string);
					if (pct < 80) {
						data.cell.styles.textColor = BRAND.brick as any;
						data.cell.styles.fontStyle = 'bold';
					} else {
						data.cell.styles.textColor = BRAND.olive as any;
						data.cell.styles.fontStyle = 'bold';
					}
				}
			},
			didDrawCell: continuationLabelHook(t('pdf.table_continued')),
		});
	}

	for (const gm of gridMonths) {
		if (!monthHasEntries(gm.y, gm.m)) continue;
		// Landscape: the per-day grid is wide (Day + N symptom/episode
		// columns + Notes). Portrait A4 could not hold wide blueprints.
		doc.addPage('a4', 'landscape');
		paintPaper(doc);
		drawGridSection(doc, blueprint, documents, gm.y, gm.m, t, locale, username);
	}

	// Footer: stamp every page ONCE, at the very end, after all pages exist.
	// Calling drawFooter before doc.addPage() would stamp the new page again
	// on the next call, producing the overlapping "Seite 1/3 Seite 1/4" artifact.
	// The doctor PDF carries the full medical-device disclaimer in the footer
	// (moved off page 1 — it was eating ~12mm of prime real estate).
	drawFooter(doc, t, 'pdf.disclaimer_medical_long', windowLabel);

	const userTag = username ? `${username}-` : '';
	const scopeTag = scopeFileTag(scope, year, month);
	doc.save(`ciphra-${userTag}bericht-${blueprint.conditionId}-${scopeTag}.pdf`);
}

/* ────────────────────────────────────────────────────────────────
 * 3) Recovery Code PDF — one-page handout
 * ──────────────────────────────────────────────────────────────── */

export function generateRecoveryPdf(
	username: string,
	recoveryCode: string,
	t: TranslateFn,
	locale: string
): void {
	// Styled to match generateDoctorPdf vocabulary: plain paper (no
	// brick header band, no watermark texture), wordmark centered in
	// the header to match the on-screen brand chrome at the same
	// moment in onboarding, rule-backed notice (olive, not brick —
	// recovery is "important, save this", not "danger"), 3×4 numbered
	// code grid that mirrors what the user will see in-app once the
	// SignupFlow code display is migrated to the same chunking.
	const doc = new jsPDF({ unit: 'mm', format: 'a4' });
	const pageW = doc.internal.pageSize.getWidth();

	paintPaper(doc);

	// ── Header — centered wordmark on paper. Size 22 (up from 18) for
	// hero-prominence: a single-page security handout has space for a
	// confident brand mark, and oversized chrome reads as "real document"
	// rather than "small utility printout". No brick band, no right-
	// aligned title (the "Recovery Code" section head below anchors).
	drawWordmark(doc, pageW / 2, 22, { size: 22, align: 'center' });

	const issuedAt = new Date().toLocaleDateString(locale, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.table);
	doc.setTextColor(...BRAND.textMuted);
	const metaParts: string[] = [];
	if (username) metaParts.push(capitalizeName(username));
	metaParts.push(`${t('pdf.export_date')}: ${issuedAt}`);
	doc.text(metaParts.join('   ·   '), pageW / 2, 30, { align: 'center' });

	const margin = 14;
	const contentW = pageW - 2 * margin;
	let y = 42;

	// ── Rule-backed security notice. Matches drawTopLineQuote's chrome
	// (3pt left rule + italic body + small attribution-style label), but
	// uses BRAND.brick because this is the security/danger semantic — the
	// patient-quote rule is olive. Lands first so the warning context
	// arrives before the eye locks onto the code.
	const ruleW = 1.06; // 3pt
	const warnLines = doc.splitTextToSize(t('pdf.recovery_warning'), contentW - 6) as string[];
	const warnLineH = 4.4;
	const warnBodyH = warnLines.length * warnLineH;
	const labelGap = 3.2;
	const warnBlockH = warnBodyH + labelGap + 1;

	// 2026-06-07 — olive rule (warm caution) instead of brick (alarm).
	// Web SignupFlow uses --olive for the same warning; the PDF mirrors
	// that. ciphra brand-voice avoids danger framing — the recovery
	// step is "save this carefully", not "you're about to do something
	// dangerous".
	doc.setDrawColor(...BRAND.olive);
	doc.setLineWidth(ruleW);
	doc.line(margin, y, margin, y + warnBlockH);
	doc.setLineWidth(0.2);

	doc.setFont('helvetica', 'italic');
	doc.setFontSize(TYPE.body);
	doc.setTextColor(...BRAND.textPrimary);
	doc.text(warnLines, margin + 4, y + 3.4);

	y += warnBlockH + 8;

	// ── Section head: the code itself. Same head treatment the doctor
	// PDF uses for "Symptome", "Vitalwerte", etc.
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.head);
	doc.setTextColor(...BRAND.textPrimary);
	doc.text(t('pdf.recovery_code_heading'), margin, y);

	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.body);
	doc.setTextColor(...BRAND.textSecondary);
	const contextLines = doc.splitTextToSize(t('pdf.recovery_context'), contentW) as string[];
	doc.text(contextLines, margin, y + 5.6);
	y += 5.6 + contextLines.length * 4.2 + 4;

	// ── Code card — hairline border, no fill (paper shows through). Four
	// columns: 12 words land as a 3×4 grid, scannable as a block rather
	// than a long ladder. Each cell still reads `nn  mono-word`.
	const words = recoveryCode.trim().split(/\s+/);
	const cols = 4;
	const rows = Math.ceil(words.length / cols);
	const cellH = 9;
	const boxPadY = 5;
	const boxH = cellH * rows + boxPadY * 2;

	doc.setDrawColor(...BRAND.border);
	doc.setLineWidth(0.3);
	doc.roundedRect(margin, y, contentW, boxH, 1.5, 1.5, 'S');

	const colW = contentW / cols;
	for (let i = 0; i < words.length; i++) {
		const r = Math.floor(i / cols);
		const c = i % cols;
		const cx = margin + c * colW + 4;
		const cy = y + boxPadY + r * cellH + cellH / 2 + 1.4;

		doc.setFont('helvetica', 'normal');
		doc.setFontSize(TYPE.compact);
		doc.setTextColor(...BRAND.textMuted);
		doc.text(String(i + 1).padStart(2, '0'), cx, cy);

		doc.setFont('courier', 'bold');
		doc.setFontSize(TYPE.body);
		doc.setTextColor(...BRAND.textPrimary);
		doc.text(words[i], cx + 7, cy);
	}
	y += boxH + 10;

	// ── Instructions — section head + asterisk-bulleted steps. The
	// asterisk bullets are the real drawn ciphra mark, same primitive the
	// doctor-PDF condition-aware bullets use.
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.head);
	doc.setTextColor(...BRAND.textPrimary);
	doc.text(t('pdf.recovery_instructions_heading'), margin, y);
	y += 6.5;

	const steps = [
		t('pdf.recovery_step_1'),
		t('pdf.recovery_step_2'),
		t('pdf.recovery_step_3'),
	];
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.body);
	doc.setTextColor(...BRAND.textSecondary);
	for (const step of steps) {
		// 2026-06-07 — olive bullets to match the same color decision the
		// warning rule above made. Recovery copy stays in the warm-caution
		// register end-to-end, never alarm-red.
		drawAsteriskMark(doc, margin + 2, y - 1.4, 2.2, BRAND.olive);
		const lines = doc.splitTextToSize(step, contentW - 7) as string[];
		doc.text(lines, margin + 7, y);
		y += lines.length * 4.6 + 2.5;
	}

	drawFooter(doc, t, 'pdf.recovery_footer');

	doc.save(`ciphra-recovery-${username}.pdf`);
}

/* ────────────────────────────────────────────────────────────────
 * 4) Family Invite PDF — one-page handout
 * ──────────────────────────────────────────────────────────────── */

export function generateFamilyInvitePdf(
	sourceUsername: string,
	label: string,
	familyCode: string,
	shareLink: string,
	t: TranslateFn,
	locale: string
): void {
	const doc = new jsPDF({ unit: 'mm', format: 'a4' });
	const pageW = doc.internal.pageSize.getWidth();
	const pageH = doc.internal.pageSize.getHeight();

	paintPaper(doc);
	drawWatermarkPattern(doc);

	// Header band with From → For
	const bandH = drawHeaderBand(doc, {
		title: t('pdf.family_title'),
		subtitle: `${sourceUsername}  →  ${label}`,
		color: BRAND.brick,
	});

	// Meta
	const issuedAt = new Date().toLocaleDateString(locale, {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.body);
	doc.setTextColor(...BRAND.textMuted);
	doc.text(
		`${t('pdf.export_date')}: ${issuedAt}`,
		pageW / 2,
		bandH + 10,
		{ align: 'center' }
	);

	// Context
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.head);
	doc.setTextColor(...BRAND.textSecondary);
	const contextLines = doc.splitTextToSize(t('pdf.family_context'), pageW - 50);
	doc.text(contextLines, pageW / 2, bandH + 20, { align: 'center' });

	// ── Two boxes side-by-side: code (left, ochre) + URL (right, card) ──
	const boxMargin = 18;
	const boxesY = bandH + 20 + contextLines.length * 5 + 8;
	const gap = 6;
	const boxW = (pageW - 2 * boxMargin - gap) / 2;
	const boxH = 56;

	// Left — family code
	doc.setFillColor(...BRAND.ochreSoft);
	doc.setDrawColor(...BRAND.ochre);
	doc.setLineWidth(0.5);
	doc.roundedRect(boxMargin, boxesY, boxW, boxH, 3, 3, 'FD');

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.compact);
	doc.setTextColor(...BRAND.ochre);
	doc.text(t('pdf.family_code_label').toUpperCase(), boxMargin + 4, boxesY + 6);

	const words = familyCode.trim().split(/\s+/);
	doc.setFont('courier', 'bold');
	doc.setFontSize(TYPE.head);
	doc.setTextColor(...BRAND.textPrimary);
	const wordCols = 2;
	const wordRows = Math.ceil(words.length / wordCols);
	const cellH = (boxH - 14) / wordRows;
	const cellW = (boxW - 8) / wordCols;
	for (let i = 0; i < words.length; i++) {
		const r = Math.floor(i / wordCols);
		const c = i % wordCols;
		const cx = boxMargin + 4 + c * cellW;
		const cy = boxesY + 12 + r * cellH + cellH / 2 + 1.5;

		doc.setFont('helvetica', 'bold');
		doc.setFontSize(TYPE.compact);
		doc.setTextColor(...BRAND.brick);
		doc.text(String(i + 1).padStart(2, '0'), cx, cy);

		doc.setFont('courier', 'bold');
		doc.setFontSize(TYPE.head);
		doc.setTextColor(...BRAND.textPrimary);
		doc.text(words[i], cx + 7, cy);
	}

	// Right — URL box (card-white, brick border)
	const rightX = boxMargin + boxW + gap;
	doc.setFillColor(...BRAND.card);
	doc.setDrawColor(...BRAND.brick);
	doc.setLineWidth(0.5);
	doc.roundedRect(rightX, boxesY, boxW, boxH, 3, 3, 'FD');

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.compact);
	doc.setTextColor(...BRAND.brick);
	doc.text(t('pdf.family_url_label').toUpperCase(), rightX + 4, boxesY + 6);

	doc.setFont('courier', 'normal');
	doc.setFontSize(TYPE.table);
	doc.setTextColor(...BRAND.textPrimary);
	const urlLines = doc.splitTextToSize(shareLink, boxW - 8);
	doc.text(urlLines, rightX + 4, boxesY + 13);

	// ── "How <recipient> accepts" steps ──
	const stepsY = boxesY + boxH + 10;
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.head);
	doc.setTextColor(...BRAND.textPrimary);
	doc.text(t('pdf.family_how_to_accept', { label }), boxMargin, stepsY);

	const steps = [
		t('pdf.family_step_1'),
		t('pdf.family_step_2'),
		t('pdf.family_step_3'),
	];
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.body);
	let sy = stepsY + 7;
	for (let i = 0; i < steps.length; i++) {
		// numbered circle
		doc.setFillColor(...BRAND.brick);
		doc.circle(boxMargin + 2.5, sy - 1.5, 2.5, 'F');
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(TYPE.table);
		doc.setTextColor(255, 255, 255);
		doc.text(String(i + 1), boxMargin + 2.5, sy + 0.5, { align: 'center' });

		doc.setFont('helvetica', 'normal');
		doc.setFontSize(TYPE.body);
		doc.setTextColor(...BRAND.textSecondary);
		const lines = doc.splitTextToSize(steps[i], pageW - 2 * boxMargin - 10);
		doc.text(lines, boxMargin + 8, sy);
		sy += lines.length * 5 + 3;
	}

	// ── Warning strip ──
	const warnY = pageH - 32;
	const warnBoxW = pageW - 2 * boxMargin;
	doc.setFillColor(...BRAND.brickSoft);
	doc.setDrawColor(...BRAND.brick);
	doc.setLineWidth(0.3);
	doc.roundedRect(boxMargin, warnY, warnBoxW, 14, 2, 2, 'FD');

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(TYPE.body);
	doc.setTextColor(...BRAND.brick);
	doc.text('*', boxMargin + 4, warnY + 9);
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(TYPE.body);
	doc.setTextColor(...BRAND.brickDark);
	const warnLines = doc.splitTextToSize(t('pdf.family_warning'), warnBoxW - 10);
	doc.text(warnLines, boxMargin + 8, warnY + 6);

	drawFooter(doc, t, 'pdf.recovery_footer');

	doc.save(`ciphra-family-${sourceUsername}-${label.replace(/\s+/g, '-')}.pdf`);
}

/* ────────────────────────────────────────────────────────────────
 * CSV Export — text only, unchanged
 * ──────────────────────────────────────────────────────────────── */

/**
 * Backward-compat aliases. Both old entry points now produce the same
 * combined doctor PDF — the split was confusing users ("export for doctor"
 * when there are two?). One export, everything inside.
 */
export const generateGridPdf = generateDoctorPdf;
export const generateAnalyticsPdf = generateDoctorPdf;

export function exportCsv(
	blueprint: Blueprint,
	documents: CiphraDocument[],
	year: number,
	month: number, // 0-based — for 'month' scope this is the focus month;
	                //         for 'year'/'2years' it's the END month of the window.
	t: TranslateFn,
	locale: string,
	scope: ReportScope = 'month'
): void {
	const scopeMonths = scope === 'month' ? 1 : scope === 'year' ? 12 : 24;
	// Noon anchor — see scope-window note above; also keeps the CSV day-loop
	// (cur.toISOString()) on the correct local day.
	const endDate = new Date(year, month + 1, 0, 12);
	const startDate = new Date(year, month + 1 - scopeMonths, 1, 12);
	const startISO = startDate.toISOString().slice(0, 10);
	const endISO = endDate.toISOString().slice(0, 10);
	const filePrefix = scopeFileTag(scope, year, month);
	// CIPH-710 / CIPH-713 — hard-exclude diary + private docs from CSV.
	const scopeDocs = documents.filter((d) => {
		if (!isExportable(d)) return false;
		if (d.data.type !== 'entry') return false;
		const ds = String(d.data.date || '');
		return ds >= startISO && ds <= endISO;
	});
	// CIPH-881b — rescue medication events live as type:'event' kind:'medication'
	// docs. Counted per-day per-medication into their own CSV columns so the
	// doctor-side reader can correlate breakthrough doses with episode counts.
	const medScopeDocs = documents.filter((d) => {
		if (!isExportable(d)) return false;
		if (d.data.type !== 'event' || d.data.kind !== 'medication') return false;
		const ds = String(d.data.date || '');
		return ds >= startISO && ds <= endISO;
	});
	const totalDays = Math.round(
		(endDate.getTime() - startDate.getTime()) / 86400000
	) + 1;

	const symptomCols: { id: string; label: string }[] = [];
	for (const g of blueprint.symptomGroups) {
		for (const item of g.items) {
			symptomCols.push({ id: item.id, label: labelOf(t, item) });
		}
	}
	const episodeCols = blueprint.episodeTypes.map((ep) => ({ id: ep.id, label: labelOf(t, ep) }));
	const triggerCols = blueprint.triggers.map((tr) => ({ id: tr.id, label: labelOf(t, tr) }));
	const vitalCols = blueprint.vitals.map((v) => ({ id: v.id, label: `${vitalLabelOf(t, v)} (${translateUnit(t, v.unit)})` }));

	const episodeDetailCols: { id: string; type: 'time' | 'duration'; label: string }[] = [];
	for (const ep of blueprint.episodeTypes) {
		if (ep.trackTimeOfDay) {
			episodeDetailCols.push({ id: ep.id, type: 'time', label: `${labelOf(t, ep)} — ${t('protocol.time_of_day')}` });
		}
		if (ep.trackDuration) {
			episodeDetailCols.push({ id: ep.id, type: 'duration', label: `${labelOf(t, ep)} — ${t('protocol.duration')}` });
		}
	}
	// One column per as-needed ("Bedarfsmedikation") med, count of doses on
	// each day. Unions configured meds with any legacy preset ids so a
	// migrant's historical events are still counted.
	const rescueMedCols = bedarfMedColumns(blueprint, t).map((m) => ({
		id: m.id,
		label: `${m.label}${m.unit ? ` (${m.unit})` : ''}`,
	}));

	const headers = [
		'date',
		...symptomCols.map((c) => c.label),
		...episodeCols.map((c) => c.label),
		...episodeDetailCols.map((c) => c.label),
		...triggerCols.map((c) => c.label),
		...vitalCols.map((c) => c.label),
		...rescueMedCols.map((c) => c.label),
		t('pdf.notes'),
	];

	const rows: string[][] = [];
	// Iterate every day in the scope window (oldest to newest) so the CSV
	// covers the same range as the report scope, not just the focus month.
	for (let i = 0; i < totalDays; i++) {
		const cur = new Date(startDate);
		cur.setDate(cur.getDate() + i);
		const dayStr = cur.toISOString().slice(0, 10);
		const dayDoc = scopeDocs.find((d) => d.data.date === dayStr);
		const dayEpDocs = scopeDocs.filter((d) => d.data?.date === dayStr && d !== dayDoc);
		const dateFormatted = formatDateChoice(cur, blueprint.dateFormat);

		const row: string[] = [dateFormatted];

		for (const col of symptomCols) {
			row.push(dayDoc?.data?.symptoms?.[col.id] ? '1' : '0');
		}
		for (const col of episodeCols) {
			let count = (dayDoc?.data?.episodes?.[col.id] || dayDoc?.data?.seizures?.[col.id] || 0) as number;
			for (const ed of dayEpDocs) {
				count += Number((ed.data?.episodes || {})[col.id] || 0);
			}
			row.push(String(count));
		}
		for (const col of episodeDetailCols) {
			// Per-occurrence detail: list every episode's own time/duration for
			// the day (e.g. "08:15, 14:40"). Falls back to the legacy single
			// value for entries saved before per-episode timestamps.
			const rows = (dayDoc?.data?.episodeInstances as
				| Record<string, Array<{ time?: string; duration?: string }>>
				| undefined)?.[col.id];
			if (Array.isArray(rows) && rows.length > 0) {
				const vals = rows
					.map((r) => (col.type === 'time' ? r?.time : r?.duration) || '')
					.filter(Boolean);
				row.push(vals.join(', '));
			} else if (col.type === 'time') {
				row.push(dayDoc?.data?.episodeTimes?.[col.id] || '');
			} else {
				row.push(dayDoc?.data?.episodeDurations?.[col.id] || '');
			}
		}
		for (const col of triggerCols) {
			row.push(dayDoc?.data?.triggers?.[col.id] ? '1' : '0');
		}
		for (const col of vitalCols) {
			const val = dayDoc?.data?.vitals?.[col.id];
			row.push(val != null ? String(val) : '');
		}
		// CIPH-881b — count rescue-med events for this day per medication id.
		for (const col of rescueMedCols) {
			const count = medScopeDocs.filter(
				(d) => d.data.date === dayStr && (d.data as any).medicationId === col.id,
			).length;
			row.push(String(count));
		}
		row.push(String(dayDoc?.data?.notes || ''));

		rows.push(row);
	}

	const escapeCsvField = (field: string): string => {
		if (field.includes(',') || field.includes('"') || field.includes('\n')) {
			return '"' + field.replace(/"/g, '""') + '"';
		}
		return field;
	};

	const csvLines = [
		headers.map(escapeCsvField).join(','),
		...rows.map((row) => row.map(escapeCsvField).join(',')),
	];
	const csvContent = csvLines.join('\n');

	const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = `ciphra-${blueprint.conditionId}-${filePrefix}.csv`;
	link.click();
	URL.revokeObjectURL(url);
}
