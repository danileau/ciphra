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
import { isCustomItem, resolveBlueprint } from '$lib/blueprint';
import { cohortOf } from '$lib/blueprint/cohort';
import { COHORT_PALETTE_RGB, CHART_ONLY_TONES } from '$lib/cohortPalette';
import { sectionsForCohort } from '$lib/cohortSections';
import { aggregatePhaseDistribution } from '$lib/pdfPhaseDistribution';
import { aggregateCycleStrip } from '$lib/pdfCycleStrip';
import { aggregateDailyMonthSeries } from '$lib/pdfDailyMonthChart';
import { resolveTrajectoryPill } from '$lib/pdfTrajectory';
import { PHASE_COLORS, type Phase } from '$lib/cycleState';
import type { CiphraDocument } from '$lib/stores/documents';
import { translateUnit } from '$lib/i18n';
import { isExportable } from '$lib/utils/exportable';

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
 * Draws the "ciphra *" wordmark. The asterisk is brick, slightly raised
 * and offset — the rotation trick from the brand isn't reproducible in
 * jsPDF text, so we rely on color + position to carry the mark.
 */
function drawWordmark(
	doc: jsPDF,
	x: number,
	y: number,
	opts: { size?: number; reverse?: boolean; align?: 'left' | 'center' } = {}
): number {
	const { size = 18, reverse = false, align = 'left' } = opts;
	const brand = 'ciphra';
	const star = '*';
	const gap = size * 0.18;

	doc.setFont('helvetica', 'normal');
	doc.setFontSize(size);

	const brandW = doc.getTextWidth(brand);
	const starW = doc.getTextWidth(star);
	const totalW = brandW + gap + starW;

	let startX = x;
	if (align === 'center') startX = x - totalW / 2;

	// wordmark body
	if (reverse) doc.setTextColor(255, 255, 255);
	else doc.setTextColor(...BRAND.textPrimary);
	doc.text(brand, startX, y);

	// asterisk — always brick, never reversed (it holds the brand even on dark bands)
	doc.setTextColor(...BRAND.brick);
	// if reversed, the asterisk must stay readable against brick — use paper instead
	if (reverse) doc.setTextColor(...BRAND.paper);
	doc.text(star, startX + brandW + gap, y - size * 0.08);

	return totalW;
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
	doc.setFontSize(13);
	doc.setTextColor(...BRAND.paper);
	doc.text(opts.title, pageW - 14, 14, { align: 'right' });

	if (opts.subtitle) {
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(9);
		doc.setTextColor(255, 255, 255);
		doc.text(opts.subtitle, pageW - 14, 20, { align: 'right' });
	}

	return h;
}

/**
 * Standard footer: brand line + page number + thin top border.
 * Applied to all pages of the document.
 */
function drawFooter(doc: jsPDF, t: TranslateFn, footerKey = 'pdf.footer'): void {
	const pageCount = doc.getNumberOfPages();
	const pageW = doc.internal.pageSize.getWidth();
	const pageH = doc.internal.pageSize.getHeight();

	for (let i = 1; i <= pageCount; i++) {
		doc.setPage(i);

		// thin divider
		doc.setDrawColor(...BRAND.border);
		doc.setLineWidth(0.2);
		doc.line(14, pageH - 12, pageW - 14, pageH - 12);

		doc.setFont('helvetica', 'normal');
		doc.setFontSize(7.5);
		doc.setTextColor(...BRAND.textMuted);
		doc.text(t(footerKey), 14, pageH - 7);

		doc.text(
			t('pdf.page', { current: i, total: pageCount }),
			pageW - 14,
			pageH - 7,
			{ align: 'right' }
		);
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
	// very light ink
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

/** Optional delta sub-line for drawStatCard (CIPH-pi19-3). */
interface StatCardDelta {
	sign: '+' | '-' | '=';
	value: string;
	semantic: 'good' | 'bad' | 'neutral';
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
	doc.setFontSize(6.5);
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

	// value — truncate to a single line + ellipsis if the value is too long
	// for the card width. Long values (e.g. PCOS "Vermehrter Haarwuchs
	// (Gesicht/Körper…)" previously bled into the neighbouring card.
	// CIPH-pi19-3-fix: 13pt (was 15pt) for the narrower 4-tile context.
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(13);
	doc.setTextColor(...accent);
	const valPadLeft = 5;
	const valPadRight = 3;
	const maxValW = w - valPadLeft - valPadRight;
	let displayValue = value;
	if (doc.getTextWidth(displayValue) > maxValW) {
		// Binary-ish trim — drop chars until the ellipsised string fits.
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
		// Color from semantic — olive=good, brick=bad, textMuted=neutral.
		// Same vocabulary as the legacy comparison-deltas block we replace.
		const dColor: RGB =
			delta.semantic === 'good'
				? BRAND.olive
				: delta.semantic === 'bad'
					? BRAND.brick
					: BRAND.textMuted;
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(7.5);
		doc.setTextColor(...dColor);
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

/* ────────────────────────────────────────────────────────────────
 * CIPH-pi19-2 — Day-coverage strip (PDF_REWRITE.md §7).
 *
 * 31-cell horizontal strip mirroring calendar v3's per-cell encoding
 * for the focus month. Cell body = symptom-load α-blend on the cohort
 * primary tone; trigger triangle (top-right, ochre) when any trigger
 * was logged that day; right-edge brick bar (half-height = 1 dose,
 * full-height = ≥2 doses) when rescue meds were taken.
 *
 * Marks (ochre triangle, brick bar) stay universal across cohorts —
 * they're clinical signals, not data accents. The cell BODY is the
 * cohort-tinted layer.
 *
 * Pre-bucketing the per-day counts by date string keeps this O(N+D)
 * (N docs + D days), no per-cell .find() scan over monthDocs.
 * ──────────────────────────────────────────────────────────────── */
function drawDayCoverageStrip(
	doc: jsPDF,
	blueprint: Blueprint,
	focusMonthEntries: CiphraDocument[],
	allDocs: CiphraDocument[],
	year: number,
	month: number,
	daysInMonth: number,
	t: TranslateFn,
	locale: string,
	acc: CohortAccents,
	cursorY: number,
): number {
	const pageW = 210;
	const stripW = pageW - 28;                            // 182mm content width
	const cellGap = 0.4;
	const cellW = (stripW - (daysInMonth - 1) * cellGap) / daysInMonth;
	const cellH = 6;
	const triSize = 1.4;
	const barW = 0.6;
	const focusPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

	// Pre-bucket: O(N) walk over focus-month entries + O(M) walk over
	// medication events. Each cell is then an O(1) Map lookup.
	const triggerByDay = new Map<string, number>();
	const symptomCountByDay = new Map<string, number>();
	for (const d of focusMonthEntries) {
		if (d.data.type !== 'entry') continue;
		const ds = String(d.data.date || '');
		if (!ds) continue;
		const trs = (d.data as Record<string, unknown>).triggers as unknown;
		let trN = 0;
		if (Array.isArray(trs)) {
			trN = trs.length;
		} else if (trs && typeof trs === 'object') {
			for (const v of Object.values(trs as Record<string, boolean>)) {
				if (v) trN++;
			}
		}
		if (trN > 0) triggerByDay.set(ds, (triggerByDay.get(ds) || 0) + trN);
		const syms = (d.data?.symptoms || {}) as Record<string, unknown>;
		let symN = 0;
		for (const v of Object.values(syms)) if (v) symN++;
		if (symN > 0) symptomCountByDay.set(ds, (symptomCountByDay.get(ds) || 0) + symN);
	}
	const rescueByDay = new Map<string, number>();
	for (const d of allDocs) {
		if (d.data.type !== 'event' || (d.data as Record<string, unknown>).kind !== 'medication') continue;
		const ds = String(d.data.date || '');
		if (!ds.startsWith(focusPrefix)) continue;
		rescueByDay.set(ds, (rescueByDay.get(ds) || 0) + 1);
	}

	// Section title — match the section-title vocabulary (helvetica bold 10pt
	// textPrimary) used elsewhere in generateDoctorPdf.
	const focusMonthName = new Date(year, month).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(10);
	doc.setTextColor(...BRAND.textPrimary);
	doc.text(t('pdf.day_coverage_title', { month: focusMonthName }), 14, cursorY);
	cursorY += 4;

	// Symptom-column count for normalising load. effectiveSymptomColumns is
	// view-shape-aware; for the strip we want the underlying possible columns
	// (an asthma user with 6 symptoms shouldn't have load capped by the visible
	// 4-column grid — the strip is a per-day signal, not a table view).
	const symptomColCount = Math.max(
		1,
		(blueprint.symptomGroups || []).reduce((n, g) => n + (g.items?.length || 0), 0),
	);

	const stripY = cursorY;
	for (let day = 1; day <= daysInMonth; day++) {
		const ds = `${focusPrefix}-${String(day).padStart(2, '0')}`;
		const x = 14 + (day - 1) * (cellW + cellGap);
		const symN = symptomCountByDay.get(ds) || 0;
		const symLoad = Math.min(1, symN / symptomColCount);
		const fillAlpha = symN > 0 ? 0.18 + symLoad * 0.6 : 0;

		if (fillAlpha > 0) {
			const fill = softBlendRgb(acc.primary, fillAlpha);
			doc.setFillColor(...fill);
			doc.rect(x, stripY, cellW, cellH, 'F');
		} else {
			// Empty day — hairline so position is preserved on silent months.
			doc.setDrawColor(...BRAND.borderSubtle);
			doc.setLineWidth(0.1);
			doc.rect(x, stripY, cellW, cellH, 'S');
		}

		// Day number top-left.
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(5.5);
		doc.setTextColor(...BRAND.textPrimary);
		doc.text(String(day), x + 0.6, stripY + 2.2);

		// Trigger triangle top-right (universal ochre — calendar parity).
		if ((triggerByDay.get(ds) || 0) > 0) {
			doc.setFillColor(...BRAND.ochre);
			doc.triangle(
				x + cellW - triSize, stripY + 0.4,
				x + cellW - 0.4,     stripY + 0.4,
				x + cellW - 0.4,     stripY + triSize + 0.4,
				'F',
			);
		}

		// Rescue-med edge bar (universal brick — calendar parity).
		// 1 dose = half-height bar; ≥2 doses = full-height.
		const rescueN = rescueByDay.get(ds) || 0;
		if (rescueN > 0) {
			doc.setFillColor(...BRAND.brick);
			const barH = rescueN === 1 ? cellH * 0.5 : cellH;
			doc.rect(x + cellW - barW, stripY + (cellH - barH), barW, barH, 'F');
		}
	}
	cursorY = stripY + cellH + 4;

	return cursorY;
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
	doc.setFontSize(10);
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
	doc.setFontSize(7.5);
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
	const cells = aggregateCycleStrip(blueprint, allDocs, year, month, daysInMonth);
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
	doc.setFontSize(10);
	doc.setTextColor(...BRAND.textPrimary);
	doc.text(t('pdf.cycle_strip_title', { month: focusMonthName }), 14, cursorY);
	cursorY += 4;

	// Strip body.
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
		doc.setFontSize(5.5);
		doc.setTextColor(...BRAND.textPrimary);
		doc.text(String(c.day), x + 0.6, stripY + 2.2);
	}
	cursorY = stripY + cellH + 3;

	// Legend — 4 phases × dot + label, single line.
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(7.5);
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
	const { dailyTotals } = aggregateDailyMonthSeries(
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
	doc.setFontSize(10);
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
	doc.setFontSize(6);
	doc.setTextColor(...BRAND.textMuted);
	doc.text(String(yMax), chartX - 1, cursorY + 2, { align: 'right' });
	const midY = Math.round(yMax / 2);
	if (yMax >= 3 && midY !== yMax && midY !== 0) {
		doc.text(String(midY), chartX - 1, cursorY + chartH / 2 + 1, { align: 'right' });
	}
	doc.text('0', chartX - 1, cursorY + chartH, { align: 'right' });

	// Empty-state placeholder when the month is silent — same vocabulary as
	// /reports' daily chart (PI v17). The chart frame stays so the doctor
	// can see "yes, this scope was searched and there's no data" rather
	// than "the chart is missing."
	const total = dailyTotals.reduce((a, b) => a + b, 0);
	if (total === 0) {
		doc.setFont('helvetica', 'italic');
		doc.setFontSize(9);
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

	// Endpoint dot.
	if (points.length >= 1) {
		const last = points[points.length - 1];
		doc.setFillColor(...acc.primary);
		doc.circle(last[0], last[1], 0.8, 'F');
	}

	// X-axis day labels — every 5 days when daysInMonth > 20, every 2 otherwise
	// (mirrors /reports autoSkipPadding behavior added in PI v17).
	const labelEvery = daysInMonth > 20 ? 5 : 2;
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(6);
	doc.setTextColor(...BRAND.textMuted);
	for (let i = 0; i < daysInMonth; i++) {
		const day = i + 1;
		if (day !== 1 && day !== daysInMonth && (day % labelEvery) !== 0) continue;
		const x = chartX + (i / Math.max(1, daysInMonth - 1)) * chartW;
		doc.text(String(day), x, cursorY + chartH + 3, { align: 'center' });
	}

	return cursorY + chartH + 6;
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
	// column widths (e.g. "Schlecht g eschlafen", "Generalisier t (GM)";
	// the Notes column collapsed to vertical letter-stacks "N o ti z e n").
	// Two fixes paired: explicit per-column cellWidth below + label
	// abbreviation here. Trim long words at the last space within the
	// limit so we get clean breaks like "Schlecht gesch." rather than
	// "Schlecht g eschlafen". Bracketed suffixes ("(GM)") are preserved
	// because they're load-bearing for episode-type disambiguation.
	const abbreviateHeader = (s: string, max = 12): string => {
		if (s.length <= max) return s;
		// Bracketed suffix at the end → preserve it, trim the body.
		const bracketMatch = s.match(/^(.*?)(\s*\([^)]+\))\s*$/);
		if (bracketMatch) {
			const body = bracketMatch[1];
			const suffix = bracketMatch[2];
			if (suffix.length + 1 < max) {
				const bodyMax = max - suffix.length - 1;
				const bodyTrim = body.length <= bodyMax ? body : body.slice(0, bodyMax - 1) + '.';
				return `${bodyTrim}${suffix}`;
			}
		}
		// Multi-word → take first word + abbreviated second
		const words = s.split(/\s+/);
		if (words.length > 1) {
			const first = words[0];
			if (first.length >= max) return first.slice(0, max - 1) + '.';
			const remaining = max - first.length - 1;
			if (remaining < 2) return first;
			return `${first} ${words[1].slice(0, remaining - 1)}.`;
		}
		return s.slice(0, max - 1) + '.';
	};

	const symptomLabels = symptomCols.map((id) => {
		for (const g of blueprint.symptomGroups) {
			const item = g.items.find((i) => i.id === id);
			if (item) return abbreviateHeader(labelOf(t, item));
		}
		return id;
	});
	const episodeLabels = episodeCols.map((id) => {
		const ep = blueprint.episodeTypes.find((e) => e.id === id);
		return ep ? abbreviateHeader(labelOf(t, ep)) : id;
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
	const pageW = doc.internal.pageSize.getWidth();

	// ── Header block ──
	// Wordmark top-left
	drawWordmark(doc, 14, 16, { size: 14 });

	// Title on the right — "Monat <month> <year>"
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(18);
	doc.setTextColor(...BRAND.textPrimary);
	doc.text(monthName, pageW - 14, 15, { align: 'right' });

	// Condition label + report type
	const conditionLabel = blueprint.conditionLabel ? t(blueprint.conditionLabel) : blueprint.conditionId;
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(9);
	doc.setTextColor(...BRAND.textSecondary);
	doc.text(`${conditionLabel} · ${t('pdf.grid_title')}`, pageW - 14, 21, { align: 'right' });

	// Meta row (account, export date)
	const exportDate = new Date().toLocaleDateString(locale, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
	doc.setFontSize(8);
	doc.setTextColor(...BRAND.textMuted);
	const metaParts: string[] = [];
	if (username) metaParts.push(`${t('pdf.account')}: ${username}`);
	metaParts.push(`${t('pdf.export_date')}: ${exportDate}`);
	doc.text(metaParts.join('   ·   '), 14, 22);

	// Summary line
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(9.5);
	doc.setTextColor(...BRAND.textPrimary);
	const summary = `${daysLogged} ${t('pdf.days_logged_short')}  ·  ${totalEpisodes} ${t('pdf.total_episodes_short')}  ·  ${symptomEntries} ${t('pdf.symptom_entries')}`;
	doc.text(summary, 14, 30);

	// Thin divider
	doc.setDrawColor(...BRAND.border);
	doc.setLineWidth(0.2);
	doc.line(14, 33, pageW - 14, 33);

	// Max episode count for intensity scaling
	const maxEpCount = Math.max(...episodeSums, 1);
	const maxSymptomDays = Math.max(...symptomSums, 1);

	autoTable(doc, {
		startY: 37,
		head: [allHeaders],
		body: rows,
		theme: 'plain',
		styles: {
			fontSize: 7.5,
			cellPadding: 1.8,
			lineColor: BRAND.borderSubtle as any,
			lineWidth: 0.1,
			textColor: BRAND.textPrimary as any,
			font: 'helvetica',
		},
		headStyles: {
			fillColor: BRAND.paperInset as any,
			textColor: BRAND.textPrimary as any,
			fontStyle: 'bold',
			fontSize: 7.5,
			lineWidth: 0.1,
			lineColor: BRAND.border as any,
		},
		alternateRowStyles: {
			fillColor: [252, 250, 248] as any,
		},
		// pi24 P-PDF-bug — Per-column explicit widths to prevent autoTable
		// from squeezing data columns and char-wrapping headers. Day
		// 10mm + Notes 32mm = 42mm fixed; remainder distributes across
		// symptom+episode columns (~140mm available content width →
		// ~10-14mm per data column for typical 8-12 col blueprints).
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		columnStyles: (() => {
			const styles: Record<number, any> = {
				0: { cellWidth: 10, fontStyle: 'bold', halign: 'center' },
			};
			const notesColIdx = 1 + symptomCols.length + episodeCols.length;
			styles[notesColIdx] = { cellWidth: 32 };
			const dataColCount = symptomCols.length + episodeCols.length;
			if (dataColCount > 0) {
				const dataColW = Math.max(10, Math.min(14, 140 / dataColCount));
				for (let i = 1; i <= dataColCount; i++) {
					styles[i] = { cellWidth: dataColW, halign: 'center' };
				}
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
	});

}

/* ────────────────────────────────────────────────────────────────
 * CIPH-305b — Shared condition-aware bullet builder.
 *
 * Hoisted out of `generateDoctorPdf` so both the standard and the compact
 * PDF emit the SAME clinically relevant facts. Felix's note: "a glaucoma
 * doctor opening a compact PDF still wants peak-IOP" — generalist trajectory
 * bullets aren't enough on their own. Returns `{fact, question}` pairs;
 * compact callers can `.map(b => b.fact)` to drop the question hierarchy.
 *
 * Pure: depends only on the blueprint + scope-window docs + a translator.
 * No chart-context, no firstAvg/lastAvg — the trajectory bullet is owned
 * by the caller (standard PDF only) so the compact format keeps its
 * 12-month chart math local.
 * ──────────────────────────────────────────────────────────────── */
export function buildConditionAwareBullets(
	blueprint: Blueprint,
	scopeDocs: CiphraDocument[],
	t: TranslateFn,
	scopeWindowLabel: string
): Array<{ fact: string; question: string }> {
	const bullets: Array<{ fact: string; question: string }> = [];
	const vitalIds = new Set(blueprint.vitals.map((v) => v.id));

	// Local copy of the doctor-PDF dayVitals helper. Handles single-value
	// strings + multi-entry JSON arrays.
	function dayVitals(d: CiphraDocument | undefined, vid: string): number[] {
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

	// 1. Total OFF time (Parkinson's)
	if (vitalIds.has('off_time_hours')) {
		let total = 0, daysWithEntry = 0;
		for (const d of scopeDocs) {
			const vs = dayVitals(d, 'off_time_hours');
			if (vs.length) { total += vs.reduce((a, b) => a + b, 0); daysWithEntry++; }
		}
		if (daysWithEntry > 0) {
			bullets.push({
				fact: t('pdf.for_doctor_fact_off_time', {
					total: total.toFixed(0),
					avg: (total / daysWithEntry).toFixed(1),
					window: scopeWindowLabel,
				}),
				question: t('pdf.for_doctor_q_off_time'),
			});
		}
	}

	// 2. Mood polarity breakdown (bipolar)
	if (vitalIds.has('mood_polarity')) {
		let manicDays = 0, depDays = 0, polSum = 0, polCount = 0;
		for (const d of scopeDocs) {
			const vs = dayVitals(d, 'mood_polarity');
			for (const v of vs) {
				polSum += v; polCount++;
				if (v > 0) manicDays++;
				else if (v < 0) depDays++;
			}
		}
		if (polCount > 0) {
			bullets.push({
				fact: t('pdf.for_doctor_fact_polarity', {
					manic: String(manicDays),
					dep: String(depDays),
					avg: (polSum / polCount).toFixed(1),
					window: scopeWindowLabel,
				}),
				question: t('pdf.for_doctor_q_polarity'),
			});
		}
	}

	// 3. Peak IOP per eye (glaucoma) — Felix's hero example
	if (vitalIds.has('iop_left') && vitalIds.has('iop_right')) {
		let maxL = 0, maxR = 0;
		for (const d of scopeDocs) {
			for (const v of dayVitals(d, 'iop_left')) if (v > maxL) maxL = v;
			for (const v of dayVitals(d, 'iop_right')) if (v > maxR) maxR = v;
		}
		if (maxL > 0 || maxR > 0) {
			bullets.push({
				fact: t('pdf.for_doctor_fact_iop', {
					left: String(maxL),
					right: String(maxR),
					window: scopeWindowLabel,
				}),
				question: t('pdf.for_doctor_q_iop'),
			});
		}
	}

	// 4. Multi-day episode totals (IBD flare, bipolar episodes, etc.)
	for (const ep of blueprint.episodeTypes) {
		if (!ep.multiDay) continue;
		// Dedupe by date — a daily_log + a standalone episode on the same
		// day must count as one active day, not two.
		const activeDateSet = new Set<string>();
		for (const d of scopeDocs) {
			const eps = (d.data.episodes || d.data.seizures || {}) as Record<string, number>;
			if ((eps[ep.id] || 0) > 0) activeDateSet.add(String(d.data?.date || ''));
		}
		const activeDays = activeDateSet.size;
		if (activeDays > 0) {
			bullets.push({
				fact: t('pdf.for_doctor_fact_multiday', {
					label: labelOf(t, ep),
					days: String(activeDays),
					weeks: (activeDays / 7).toFixed(1),
					window: scopeWindowLabel,
				}),
				question: t('pdf.for_doctor_q_multiday', { label: labelOf(t, ep) }),
			});
		}
	}

	// 5. Average bowel movements per day (IBD)
	if (vitalIds.has('stool_count')) {
		let total = 0, daysWithEntry = 0;
		for (const d of scopeDocs) {
			const vs = dayVitals(d, 'stool_count');
			if (vs.length) { total += vs.reduce((a, b) => a + b, 0); daysWithEntry++; }
		}
		if (daysWithEntry > 0) {
			bullets.push({
				fact: t('pdf.for_doctor_fact_stool', {
					avg: (total / daysWithEntry).toFixed(1),
					days: String(daysWithEntry),
					window: scopeWindowLabel,
				}),
				question: t('pdf.for_doctor_q_stool'),
			});
		}
	}

	// 6. Pain × mood correlation (≥30 paired days, |r| ≥ 0.4)
	if (vitalIds.has('pain_level') && vitalIds.has('mood')) {
		const pairs: [number, number][] = [];
		for (const d of scopeDocs) {
			const p = dayVitals(d, 'pain_level');
			const m = dayVitals(d, 'mood');
			if (p.length > 0 && m.length > 0) pairs.push([p[0], m[0]]);
		}
		if (pairs.length >= 30) {
			const n = pairs.length;
			const meanX = pairs.reduce((s, [x]) => s + x, 0) / n;
			const meanY = pairs.reduce((s, [, y]) => s + y, 0) / n;
			let num = 0, dx2 = 0, dy2 = 0;
			for (const [x, y] of pairs) {
				const dx = x - meanX, dy = y - meanY;
				num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
			}
			const denom = Math.sqrt(dx2 * dy2);
			const r = denom > 0 ? num / denom : 0;
			if (Math.abs(r) >= 0.4) {
				bullets.push({
					fact: t('pdf.for_doctor_fact_pain_mood', {
						r: r.toFixed(2),
						n: String(n),
						dir: r < 0 ? t('pdf.correlation_inverse') : t('pdf.correlation_positive'),
					}),
					question: t('pdf.for_doctor_q_pain_mood'),
				});
			}
		}
	}

	// 7. Medication compliance (CIPH-411d) — across regular (non-PRN) meds.
	//    Denominator: days in scope window where the user logged anything at
	//    all (any non-empty `data` payload). Numerator: days marked true for
	//    each med. Only emit when ≥1 regular med and ≥7 logged days.
	{
		const regularMeds = blueprint.medications.filter((m) => !m.asNeeded);
		const loggedDocs = scopeDocs.filter((d) => d && d.data && Object.keys(d.data).length > 0);
		if (regularMeds.length > 0 && loggedDocs.length >= 7) {
			const denom = loggedDocs.length;
			let pctSum = 0;
			let counted = 0;
			for (const med of regularMeds) {
				let taken = 0;
				for (const d of loggedDocs) {
					const meds = (d.data.medications || {}) as Record<string, boolean>;
					if (meds[med.id] === true) taken++;
				}
				pctSum += (taken / denom) * 100;
				counted++;
			}
			if (counted > 0) {
				const avgPct = Math.round(pctSum / counted);
				bullets.push({
					fact: t('pdf.for_doctor_fact_med_compliance', {
						window: scopeWindowLabel,
						pct: String(avgPct),
						n: String(counted),
					}),
					question: t('pdf.for_doctor_q_med_compliance'),
				});
			}
		}
	}

	return bullets;
}

/* ────────────────────────────────────────────────────────────────
 * Doctor Report — one PDF, everything in it: cover + 24-month
 * trajectory + comparison + symptom/medication tables + full
 * day-by-day grid for the selected month. The doctor skims what
 * they need; we give them everything we have.
 * ──────────────────────────────────────────────────────────────── */

export type ReportScope = 'month' | 'year' | '2years';

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

	// Scope window — drives header + stat cards + grid loop.
	const scopeMonths = scope === 'month' ? 1 : scope === 'year' ? 12 : 24;
	const scopeEndDate = new Date(year, month + 1, 0);
	const scopeStartDate = new Date(year, month + 1 - scopeMonths, 1);
	const scopeStartISO = scopeStartDate.toISOString().slice(0, 10);
	const scopeEndISO = scopeEndDate.toISOString().slice(0, 10);

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
		monthName = t(scope === 'year' ? 'pdf.scope_year' : 'pdf.scope_2years');
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
	doc.setFontSize(18);
	doc.setTextColor(...BRAND.textPrimary);
	doc.text(monthName, pageW - 14, 15, { align: 'right' });

	const conditionLabel = blueprint.conditionLabel ? t(blueprint.conditionLabel) : blueprint.conditionId;
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(9);
	doc.setTextColor(...BRAND.textSecondary);
	doc.text(`${conditionLabel} · ${t('pdf.analytics_title')}`, pageW - 14, 21, { align: 'right' });

	const exportDate = new Date().toLocaleDateString(locale, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
	doc.setFontSize(8);
	doc.setTextColor(...BRAND.textMuted);
	const metaParts: string[] = [];
	if (username) metaParts.push(`${t('pdf.account')}: ${username}`);
	metaParts.push(`${t('pdf.export_date')}: ${exportDate}`);
	doc.text(metaParts.join('   -   '), 14, 22);

	// ── Disclaimer strip on page 1 ──
	// Legally and ethically required to be visible at first glance, not a
	// footnote. MDR auditor in the QA round flagged footer-only placement.
	const discY = 27;
	doc.setFont('helvetica', 'italic');
	doc.setFontSize(7.5);
	const discText = t('pdf.disclaimer_medical_long');
	const discLines = doc.splitTextToSize(discText, pageW - 40);
	const lineH = 3.6;
	const discH = discLines.length * lineH + 3.6;
	doc.setFillColor(250, 243, 233); // ochreSoft
	doc.setDrawColor(...BRAND.ochre);
	doc.setLineWidth(0.3);
	doc.roundedRect(14, discY, pageW - 28, discH, 1.2, 1.2, 'FD');
	doc.setTextColor(...BRAND.ochre);
	doc.text(discLines, pageW / 2, discY + 3.6, { align: 'center' });

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

	// ── Clinical summary paragraph ──
	// Position directly below the disclaimer strip (height measured above).
	let cursorY = discY + discH + 6;
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
	doc.setFontSize(7.5);
	doc.setTextColor(...BRAND.textMuted);
	doc.text(
		`${t('pdf.days_logged_short')}: ${daysLogged}/${daysInMonth}`,
		pageW - 14,
		cursorY - 1,
		{ align: 'right' }
	);

	// Pre-aggregations the tiles need.
	const episodeChange = totalEpisodes - prevTotalEpisodes;
	const focusPrefixForKpi = `${year}-${String(month + 1).padStart(2, '0')}`;
	const rescueMedDays = (() => {
		const days = new Set<string>();
		for (const d of documents) {
			if (d.data.type !== 'event' || (d.data as Record<string, unknown>).kind !== 'medication') continue;
			const ds = String(d.data.date || '');
			if (!ds.startsWith(focusPrefixForKpi)) continue;
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
					semantic: episodeChange > 0 ? 'bad' : 'good',
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
	const tileDaysLogged = (): Tile => ({
		label: t('pdf.days_logged'),
		value: `${daysLogged}/${daysInMonth}`,
		accent: acc.break,
	});
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
	// surfaces flare days; etc. Picks the top-2 by day-coverage in the focus
	// month so silent episode types don't burn tile slots.
	const phaseTopDayCounts: Array<{ id: string; label: string; days: number }> = (() => {
		const multiDayEps = blueprint.episodeTypes.filter((ep) => ep.multiDay);
		if (multiDayEps.length === 0) return [];
		const dayCount = new Map<string, Set<string>>();
		for (const ep of multiDayEps) dayCount.set(ep.id, new Set());
		for (const d of focusMonthDocs) {
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
		for (const d of focusMonthDocs) {
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
		const readings: { date: string; v: number }[] = [];
		for (const d of documents) {
			if (d.data?.type !== 'entry') continue;
			const ds = String(d.data.date || '');
			if (!ds) continue;
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
		const unitStr = vital.unit ? ` ${vital.unit}` : '';
		// Format: 1-decimal under 20, integer at/above 20 (BP / pulse).
		const fmt = (n: number) => (Math.abs(n) >= 20 ? String(Math.round(n)) : n.toFixed(1));
		const value = `${fmt(last)}${unitStr}`;
		let delta: StatCardDelta | undefined;
		if (prev !== null && Math.abs(last - prev) >= 0.05) {
			const d = last - prev;
			delta = {
				sign: d > 0 ? '+' : '-',
				value: fmt(Math.abs(d)),
				// Vital cohorts: neutral semantic (no good/bad). Direction
				// interpretation depends on biology — TSH falling on a
				// hypothyroid patient is good, on a hyperthyroid patient is
				// bad. The tile shows direction; doctor interprets.
				semantic: 'neutral',
			};
		}
		return { label: t(vital.label), value, accent: acc.primary, delta };
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
					tileTopSymptom(),
					tileDaysLogged(),
				];
			case 'cycle':
				return [
					tileTopTrigger(),
					tileTopSymptom(),
					tileEpisodes(),
					tileRescueMed(),
					tileDaysLogged(),
				];
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
					tileTopSymptom(),
					tileDaysLogged(),
				];
			case 'narrative':
				return [
					tileTopTrigger(),
					tileEpisodes(),
					tileTopSymptom(),
					tileRescueMed(),
					tileDaysLogged(),
				];
			case 'custom':
			default:
				return [
					tileEpisodes(),
					tileTopSymptom(),
					tileTopTrigger(),
					tileRescueMed(),
					tileDaysLogged(),
				];
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
		cursorY += tileH + 6;
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

	// CIPH-pi19-2 — Day-coverage strip. 31-cell per-day overview of the focus
	// month, mirrors calendar v3's cell encoding (symptom-load tint, trigger
	// triangle, rescue-med edge bar). Section is always rendered so the
	// strip is a stable spine element across cohorts; cohort tinting is
	// scoped to the cell BODY via acc.primary, not to the marks.
	cursorY = drawDayCoverageStrip(
		doc,
		blueprint,
		focusMonthDocs,
		documents,
		year,
		month,
		focusDaysInMonth,
		t,
		locale,
		acc,
		cursorY,
	);

	// Trajectory metadata exposed outside the scope block so the "trajectory"
	// bullet on the For-Doctor page can reference it when the chart is drawn.
	type TrendDir = 'up' | 'down' | 'flat';
	let chartContext:
		| { MONTHS: number; firstAvg: number; lastAvg: number; trendLabel: string; trendDir: TrendDir }
		| null = null;

	// CIPH-pi21-Track-B-5 — scope-branched chart. Per PDF_REWRITE.md §5,
	// 'month' scope renders a daily chart for the focus month; year/2years
	// keep the existing 24/12-month trajectory + vital-trends block.
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
	doc.setFontSize(10);
	doc.setTextColor(...BRAND.textPrimary);
	doc.text(t(scope === 'year' ? 'pdf.episode_trend_12m' : 'pdf.episode_trend'), 14, cursorY);

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

	// pi24 P-PDF-2 — Cohort-aware trajectory pill. The pre-pi24 algorithm
	// computed first-6 vs last-6 average on episode counts and labeled it
	// improving/stable/worsening for every cohort. The 5-doctor agents
	// campfire (see `feedback_pdf_clinician_lens.md`) universally flagged
	// this as the single most-cited concern: STABIL on Helena mid-
	// titration, VERBESSERUNG on Hans with a recent GTC, VERSCHLECHTERUNG
	// on Anna's normal-rhythm bipolar quarter, STABIL on Klaus with home
	// BP above target. Each one a clinical mis-cue with green-pill
	// confidence. resolveTrajectoryPill returns a typed spec OR null
	// (omit pill). A wrong pill is worse than no pill.
	const pillSpec = resolveTrajectoryPill(blueprint, documents, monthBuckets, episodeCols);
	if (pillSpec) {
		let trendLabel: string;
		let trendColor: RGB;
		let pillBg: RGB;
		if (pillSpec.kind === 'episode') {
			trendLabel = t(pillSpec.labelKey);
			trendColor = pillSpec.trendDir === 'up' ? BRAND.brick
				: pillSpec.trendDir === 'down' ? BRAND.olive
				: BRAND.textMuted;
			pillBg = pillSpec.trendDir === 'up' ? [249, 229, 224]
				: pillSpec.trendDir === 'down' ? [238, 239, 213]
				: BRAND.paperInset;
			// Episode trajectory keeps the downstream narrative bullet
			// (still episode-shaped copy); other kinds skip the bullet
			// until P-PDF-8 lands data-driven vital + polarity copy.
			chartContext = {
				MONTHS,
				firstAvg: pillSpec.firstAvg,
				lastAvg: pillSpec.lastAvg,
				trendLabel,
				trendDir: pillSpec.trendDir,
			};
		} else if (pillSpec.kind === 'vital') {
			// Neutral wording for vital cohorts — no "improving / worsening"
			// value judgment in the label OR the color. Direction
			// semantics depend on biology (TSH falling = good for hypothyroid
			// on supplementation; rising = bad). Let the doctor read the
			// number and interpret. Steiner's caveat from the campfire.
			trendLabel = t(pillSpec.labelKey, { vital: t(pillSpec.vitalLabel) });
			trendColor = BRAND.textPrimary;
			pillBg = BRAND.paperInset;
		} else {
			// Polarity pill — both poles are clinically meaningful;
			// "improving" and "worsening" don't map onto bipolar. Brunner:
			// "treats bipolar like hypertension; cry wolf on every stable
			// patient." Neutral color, label carries the meaning.
			trendLabel = t(pillSpec.labelKey);
			trendColor = BRAND.textPrimary;
			pillBg = BRAND.paperInset;
		}

		// Trend badge: a soft-pill label on the right edge. No arrow —
		// color + explicit text carry the direction (or, for vital /
		// polarity pills, neutral color + text-with-direction-word).
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(9);
		const pillPadX = 3;
		const pillPadY = 1.8;
		const pillW = doc.getTextWidth(trendLabel) + pillPadX * 2;
		const pillH = 6;
		const pillX = pageW - 14 - pillW;
		const pillY = cursorY - pillH + pillPadY;
		doc.setFillColor(...pillBg);
		doc.roundedRect(pillX, pillY, pillW, pillH, 2, 2, 'F');
		doc.setTextColor(...trendColor);
		doc.text(trendLabel, pillX + pillW / 2, pillY + pillH - pillPadY, { align: 'center' });
	}
	// pillSpec === null → no pill drawn. The explicit safe-omit path
	// for sparse data + narrative-no-episodes + custom cohort. The
	// chart still renders below; only the pill is suppressed.

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
	type EventMarker = { x: number; label: string };
	// Find the date of the very first daily_log doc — used as a synthetic
	// "Tracking started" marker so the chart always has at least one event
	// line for context, even before the user has created any manual event.
	const firstLogISO = (() => {
		let oldest = '';
		for (const d of documents) {
			if (d.data?.type !== 'entry') continue;
			const ds = String(d.data.date || '');
			if (ds.length !== 10) continue;
			if (!oldest || ds < oldest) oldest = ds;
		}
		return oldest;
	})();

	function buildEventMarkers(boxX: number, boxW: number): EventMarker[] {
		const out: EventMarker[] = [];
		// Synthetic "tracking started" marker — only rendered if it's within
		// the chart window. Skipped if the user already authored an event on
		// that exact date (avoids overlap).
		const startedLabel = t('pdf.event_tracking_started');
		const userEventDates = new Set(
			documents
				.filter((d) => d.data?.type === 'event')
				.map((d) => String(d.data.date || ''))
		);
		if (firstLogISO && !userEventDates.has(firstLogISO)) {
			const yyyy = parseInt(firstLogISO.slice(0, 4));
			const mm = parseInt(firstLogISO.slice(5, 7)) - 1;
			const dd = parseInt(firstLogISO.slice(8, 10));
			const monthIdx = monthBuckets.findIndex((b) => b.y === yyyy && b.m === mm);
			if (monthIdx >= 0) {
				const daysInMo = new Date(yyyy, mm + 1, 0).getDate();
				const frac = Math.max(0, Math.min(0.999, (dd - 1) / daysInMo));
				const xRel = Math.min(0.999, (monthIdx + frac) / MONTHS);
				out.push({ x: boxX + xRel * boxW, label: startedLabel });
			}
		}
		for (const d of documents) {
			if (d.data?.type !== 'event') continue;
			const ds = String(d.data.date || '');
			if (ds.length < 10) continue;
			const yyyy = parseInt(ds.slice(0, 4));
			const mm = parseInt(ds.slice(5, 7)) - 1;
			const dd = parseInt(ds.slice(8, 10));
			if (isNaN(yyyy) || isNaN(mm) || isNaN(dd)) continue;
			const monthIdx = monthBuckets.findIndex((b) => b.y === yyyy && b.m === mm);
			if (monthIdx < 0) continue;
			const daysInMo = new Date(yyyy, mm + 1, 0).getDate();
			const frac = Math.max(0, Math.min(0.999, (dd - 1) / daysInMo));
			// Use MONTHS as denominator (not MONTHS-1) so events stay inside the
			// chart bounds. Data points use (i / MONTHS-1) which puts the last
			// point exactly on the right edge; events use (i+frac)/MONTHS so a
			// late-month event in the last bucket sits just inside the edge.
			const xRel = Math.min(0.999, (monthIdx + frac) / MONTHS);
			const x = boxX + xRel * boxW;
			// CIPH-881b — medication events label with the rescue-med name +
			// dose, not the notes field (which is undefined for these). The
			// kind discriminator keeps freeform note-marker events on a
			// separate visual track.
			let raw: string;
			if (d.data.kind === 'medication') {
				const medId = (d.data as any).medicationId;
				const presetMed = blueprint.rescueMedications?.find((m) => m.id === medId);
				const label = presetMed ? labelOf(t, presetMed) : (medId || '');
				const dose = (d.data as any).dose;
				const unitStr = presetMed?.unit ? ` ${translateUnit(t, presetMed.unit)}` : '';
				raw = dose ? `${label} ${dose}${unitStr}` : label;
			} else {
				raw = String(d.data.notes || '').replace(/\s+/g, ' ').trim();
			}
			out.push({ x, label: raw.length > 22 ? raw.slice(0, 21) + '…' : raw });
		}
		return out;
	}
	function drawEventLines(boxX: number, boxY: number, boxW: number, boxH: number, withLabels: boolean) {
		const markers = buildEventMarkers(boxX, boxW);
		if (markers.length === 0) return;
		// CIPH-pi18-2 Chunk 3 — event markers stay on `BRAND.brick` (NOT
		// cohort accent) by design. The original choice was contrast-
		// driven (brick + bolder dash so the marker line was unmissable
		// on print); ochre + 0.3 line was too faint in tester reports.
		// A clinical event interruption is also conceptually a "warning"
		// signal — semantic high-importance, not data-accent. Keeping
		// brick preserves both the contrast property and the semantic
		// register across all cohorts.
		doc.setDrawColor(...BRAND.brick);
		doc.setLineWidth(0.5);
		doc.setLineDashPattern([1.2, 1], 0);
		for (const m of markers) {
			doc.line(m.x, boxY, m.x, boxY + boxH);
		}
		doc.setLineDashPattern([], 0);
		// small filled triangle marker at top of each line
		doc.setFillColor(...BRAND.brick);
		for (const m of markers) {
			doc.triangle(m.x - 1.4, boxY - 0.3, m.x + 1.4, boxY - 0.3, m.x, boxY + 1.8, 'F');
		}
		if (withLabels) {
			doc.setFont('helvetica', 'normal');
			doc.setFontSize(6);
			doc.setTextColor(...BRAND.brick);
			for (const m of markers) {
				doc.text(m.label, m.x + 1, boxY - 1.5);
			}
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
	doc.setFontSize(6);
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
		doc.setFillColor(...BRAND.textMuted);
		for (const [px, py] of sPoints) doc.circle(px, py, 0.4, 'F');

		// Right-edge scale disclosure: "max Symptom-Tage: 28"
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(5.5);
		doc.setTextColor(...BRAND.textMuted);
		doc.text(String(symptomMax), chartX + chartW + 0.5, cursorY + 2, { align: 'left' });
		doc.text('0', chartX + chartW + 0.5, cursorY + chartH, { align: 'left' });
	}

	// Event vertical lines on the trajectory chart (with text labels)
	drawEventLines(chartX, cursorY, chartW, chartH, true);

	// Slim ochre frame around the trajectory chart's plot area — same color
	// will frame the vital mini-charts so the doctor sees they share an axis.
	doc.setDrawColor(...BRAND.ochreSoft);
	doc.setLineWidth(0.4);
	doc.roundedRect(chartX - 0.3, cursorY - 0.3, chartW + 0.6, chartH + 0.6, 0.8, 0.8, 'S');

	// X-axis labels: every month for 12-month scope, every other for 24.
	// All-month labels at 24mo scope cram into each other and become unreadable.
	doc.setFontSize(6);
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

	cursorY += chartH + 10;

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
	type MiniChart = { title: string; series: MiniSeries[]; yLabel?: string; referenceLines?: RefLine[] };

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
		const refLines: RefLine[] = v.referenceLine
			? [{ value: v.referenceLine.value, label: t(v.referenceLine.labelKey) }]
			: [];
		miniCharts.push({
			title: `${vitalLabelOf(t, v)}${v.unit ? ` (${translateUnit(t, v.unit)})` : ''}`,
			series: [{ label: vitalLabelOf(t, v), color: DATA_HEX.d1, values }],
			referenceLines: refLines.length ? refLines : undefined,
		});
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
		if (cursorY > pageH - 80) {
			doc.addPage();
			paintPaper(doc);
			cursorY = 20;
		}
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(10);
		doc.setTextColor(...BRAND.textPrimary);
		doc.text(t(scope === 'year' ? 'pdf.vital_trends_title_12m' : 'pdf.vital_trends_title'), 14, cursorY);
		cursorY += 5;

		const cx = 22;
		const cw = pageW - 28 - 8;
		const ch = 24;

		for (const chart of charts) {
			if (cursorY + ch + 14 > pageH - 20) {
				doc.addPage();
				paintPaper(doc);
				cursorY = 20;
				doc.setFont('helvetica', 'bold');
				doc.setFontSize(10);
				doc.setTextColor(...BRAND.textPrimary);
				doc.text(t(scope === 'year' ? 'pdf.vital_trends_title_12m' : 'pdf.vital_trends_title'), 14, cursorY);
				cursorY += 5;
			}
			// Title + inline legend
			doc.setFont('helvetica', 'normal');
			doc.setFontSize(8);
			doc.setTextColor(...BRAND.textSecondary);
			doc.text(chart.title, 14, cursorY);
			if (chart.series.length > 1) {
				let lx = 14 + doc.getTextWidth(chart.title) + 6;
				doc.setFontSize(7);
				for (const s of chart.series) {
					doc.setFillColor(...hexToRGB(s.color));
					doc.circle(lx, cursorY - 1.2, 1, 'F');
					doc.setTextColor(...BRAND.textMuted);
					doc.text(s.label, lx + 2, cursorY);
					lx += doc.getTextWidth(s.label) + 7;
				}
			}
			cursorY += 2;

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
			doc.setFontSize(6);
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
				doc.setFontSize(5.5);
				doc.setTextColor(...BRAND.olive);
				for (const ref of chart.referenceLines) {
					const refY = cursorY + ch - ((ref.value - yMin) / ySpan) * ch;
					doc.text(`${ref.label}: ${ref.value}`, cx + cw - 0.5, refY - 0.5, { align: 'right' });
				}
			}

			// Each series — CIPH-pi19-3-fix: bezier-smoothed segments to
			// match the rounded /reports Chart.js style. Same tension/clamp
			// discipline as the trajectory line so overshoot can't dip below
			// the chart frame.
			const yTopMini = cursorY;
			const yBottomMini = cursorY + ch;
			for (const s of chart.series) {
				const rgb = hexToRGB(s.color);
				doc.setDrawColor(...rgb);
				doc.setLineWidth(0.5);
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
				doc.setFillColor(...rgb);
				for (const [x, y] of pts) doc.circle(x, y, 0.55, 'F');
			}
			// Event markers (no labels — too cramped on mini charts) and the
			// shared-axis ochre frame so the doctor sees this chart belongs
			// to the same temporal group as the trajectory chart above.
			drawEventLines(cx, cursorY, cw, ch, false);
			doc.setDrawColor(...BRAND.ochreSoft);
			doc.setLineWidth(0.4);
			doc.roundedRect(cx - 0.3, cursorY - 0.3, cw + 0.6, ch + 0.6, 0.8, 0.8, 'S');

			// X-axis month labels — same density rule as the trajectory chart.
			// Without these the mini-charts read as abstract lines with no
			// temporal anchor (Klara called this out, screenshot confirmed).
			doc.setFont('helvetica', 'normal');
			doc.setFontSize(5.5);
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
	// For episode types with `trackDuration: true` (epilepsy, migraine,
	// glaucoma episodes), aggregate the duration buckets across the last 12
	// months. A 5-minute focal vs a 30-second focal mean different things —
	// doctors triage by duration, not just count.
	const durEps = blueprint.episodeTypes.filter((e) => e.trackDuration);
	if (durEps.length > 0) {
		// Local 12-month window (yearDocs is computed later in the bullets block)
		const dur12End = new Date(year, month + 1, 0);
		const dur12Start = new Date(dur12End);
		dur12Start.setFullYear(dur12Start.getFullYear() - 1);
		dur12Start.setDate(dur12Start.getDate() + 1);
		const dur12StartISO = dur12Start.toISOString().slice(0, 10);
		const dur12EndISO = dur12End.toISOString().slice(0, 10);
		const last12mDocs = documents.filter((d) => {
			// Standalone `episode` docs also carry `episodes` and
			// `episodeDurations`, so include them in duration buckets.
			if (d.data?.type !== 'entry') return false;
			const ds = String(d.data.date || '');
			return ds >= dur12StartISO && ds <= dur12EndISO;
		});

		// duration counts per episode type
		const durBuckets: Record<string, { lt1: number; m15: number; gt5: number; unk: number; total: number }> = {};
		for (const ep of durEps) {
			durBuckets[ep.id] = { lt1: 0, m15: 0, gt5: 0, unk: 0, total: 0 };
		}
		for (const d of last12mDocs) {
			const eps = (d.data?.episodes || d.data?.seizures || {}) as Record<string, number>;
			const durs = (d.data?.episodeDurations || {}) as Record<string, string>;
			for (const ep of durEps) {
				const cnt = eps[ep.id] || 0;
				if (cnt <= 0) continue;
				const dur = durs[ep.id] || '';
				const b = durBuckets[ep.id];
				b.total += cnt;
				if (dur === '<1min') b.lt1 += cnt;
				else if (dur === '1-5min') b.m15 += cnt;
				else if (dur === '>5min') b.gt5 += cnt;
				else b.unk += cnt;
			}
		}
		const hasAny = Object.values(durBuckets).some((b) => b.total > 0);
		if (hasAny) {
			if (cursorY > pageH - 50) {
				doc.addPage();
				paintPaper(doc);
				cursorY = 20;
			}
			doc.setFont('helvetica', 'bold');
			doc.setFontSize(10);
			doc.setTextColor(...BRAND.textPrimary);
			doc.text(t('pdf.episode_duration_title'), 14, cursorY);
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
					fontSize: 8,
					cellPadding: 2,
					lineColor: BRAND.borderSubtle as any,
					lineWidth: 0.1,
					textColor: BRAND.textPrimary as any,
				},
				headStyles: {
					fillColor: BRAND.paperInset as any,
					textColor: BRAND.textPrimary as any,
					fontStyle: 'bold',
					fontSize: 8,
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
			});
			cursorY = (doc as any).lastAutoTable?.finalY ?? cursorY + 10;
			cursorY += 6;
		}
	}

	} // end of `if (scope !== 'month')` — skip trajectory + vital-trends + duration for month scope

	// ── Symptom frequency table ──
	if (cursorY > pageH - 60) {
		doc.addPage();
		paintPaper(doc);
		cursorY = 20;
	}

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(10);
	doc.setTextColor(...BRAND.textPrimary);
	doc.text(t('pdf.symptom_frequency'), 14, cursorY);
	cursorY += 2;

	const symptomRows = symptomFreq.map((s) => [
		s.label,
		String(s.count),
		`${daysInMonth > 0 ? Math.round((s.count / daysInMonth) * 100) : 0}%`,
	]);

	if (symptomRows.length > 0) {
		autoTable(doc, {
			startY: cursorY,
			head: [[t('pdf.symptom'), t('pdf.days_active'), t('pdf.frequency')]],
			body: symptomRows,
			theme: 'plain',
			styles: {
				fontSize: 8,
				cellPadding: 2,
				lineColor: BRAND.borderSubtle as any,
				lineWidth: 0.1,
				textColor: BRAND.textPrimary as any,
			},
			headStyles: {
				fillColor: BRAND.paperInset as any,
				textColor: BRAND.textPrimary as any,
				fontStyle: 'bold',
				fontSize: 8,
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
		});
		cursorY = (doc as any).lastAutoTable?.finalY ?? cursorY + 10;
		cursorY += 6;
	} else {
		cursorY += 4;
		doc.setFont('helvetica', 'italic');
		doc.setFontSize(9);
		doc.setTextColor(...BRAND.textMuted);
		doc.text(t('pdf.no_symptoms'), 14, cursorY);
		cursorY += 6;
	}

	// ── Medication adherence ──
	if (blueprint.medications.length > 0) {
		if (cursorY > pageH - 50) {
			doc.addPage();
			paintPaper(doc);
			cursorY = 20;
		}

		doc.setFont('helvetica', 'bold');
		doc.setFontSize(10);
		doc.setTextColor(...BRAND.textPrimary);
		doc.text(t('pdf.medication_adherence'), 14, cursorY);
		cursorY += 2;

		const medRows = blueprint.medications.map((med) => {
			const taken = monthDocs.filter((d) => d.data?.medications?.[med.id]).length;
			return [
				`${med.name} ${med.dose}`,
				med.schedule,
				`${taken} / ${daysLogged}`,
				`${daysLogged > 0 ? Math.round((taken / daysLogged) * 100) : 0}%`,
			];
		});

		autoTable(doc, {
			startY: cursorY,
			head: [[t('pdf.medication'), t('pdf.schedule'), t('pdf.taken'), t('pdf.adherence')]],
			body: medRows,
			theme: 'plain',
			styles: {
				fontSize: 8,
				cellPadding: 2,
				lineColor: BRAND.borderSubtle as any,
				lineWidth: 0.1,
				textColor: BRAND.textPrimary as any,
			},
			headStyles: {
				fillColor: BRAND.paperInset as any,
				textColor: BRAND.textPrimary as any,
				fontStyle: 'bold',
				fontSize: 8,
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
		});
	}

	// ── "For your doctor" narrative bullets ──
	// Dr. Fischer from the 10-persona QA said: "give me the answer in 10
	// seconds, not the data to compute one." These bullets restate the
	// findings as clinical questions so the appointment starts with the
	// right conversation, not with chart-reading.
	doc.addPage();
	paintPaper(doc);
	drawWordmark(doc, 14, 16, { size: 14 });
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(18);
	doc.setTextColor(...BRAND.textPrimary);
	doc.text(t('pdf.for_doctor_title'), pageW - 14, 15, { align: 'right' });
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(9);
	doc.setTextColor(...BRAND.textSecondary);
	doc.text(t('pdf.for_doctor_subtitle'), pageW - 14, 21, { align: 'right' });

	let byY = 40;
	doc.setDrawColor(...BRAND.border);
	doc.setLineWidth(0.2);
	doc.line(14, byY - 4, pageW - 14, byY - 4);

	// Compose bullets — each is "fact · question" pairs.
	// Bullet window now matches the report scope: month / year / 2years.
	// Variable still named `yearDocs` for historical reasons — it holds the
	// scope-appropriate document set, not necessarily a year.

	const bulletMonths = scope === '2years' ? 24 : scope === 'year' ? 12 : 1;
	const yearEndDate = new Date(year, month + 1, 0);
	const yearStartDate = new Date(year, month + 1 - bulletMonths, 1);
	const yearStartISO = yearStartDate.toISOString().slice(0, 10);
	const yearEndISO = yearEndDate.toISOString().slice(0, 10);
	const yearDocs = documents.filter((d) => {
		if (d.data?.type !== 'entry') return false;
		const ds = String(d.data.date || '');
		return ds >= yearStartISO && ds <= yearEndISO;
	});
	const yearDaysLogged = yearDocs.length;
	// Same window, but also includes standalone `episode` quick-add docs —
	// used for episode-counting bullets where excluding them would
	// undercount the patient's actual symptom burden.
	const yearEpisodeDocs = documents.filter((d) => {
		const t = d.data?.type;
		if (t !== 'entry') return false;
		const ds = String(d.data.date || '');
		return ds >= yearStartISO && ds <= yearEndISO;
	});

	// Human-readable label for the bullet window (passed as {window} into
	// fact strings). Month scope shows the month name (e.g. "April 2026"),
	// year/2years show the scope header label ("Letzte 12 Monate" etc.).
	const bulletWindowLabel = scope === 'month'
		? monthName
		: t(scope === 'year' ? 'pdf.scope_year' : 'pdf.scope_2years');

	// Year-scoped top symptom and trigger (separate from the month-scoped
	// symptomFreq used on the page-1 summary).
	const yearSymptomFreq: { id: string; label: string; count: number }[] = [];
	for (const g of blueprint.symptomGroups) {
		for (const item of g.items) {
			if (POSITIVE_MARKERS.has(item.id)) continue;
			const count = yearDocs.filter((d) => d.data?.symptoms?.[item.id]).length;
			if (count > 0) {
				yearSymptomFreq.push({ id: item.id, label: labelOf(t, item), count });
			}
		}
	}
	yearSymptomFreq.sort((a, b) => b.count - a.count);
	const yearTopSymptom = yearSymptomFreq[0] ?? null;

	const yearTriggerFreq: { id: string; label: string; count: number }[] = [];
	for (const trig of blueprint.triggers) {
		const count = yearDocs.filter((d) => {
			const trs = d.data?.triggers;
			if (Array.isArray(trs)) return trs.includes(trig.id);
			return !!(trs && trs[trig.id]);
		}).length;
		if (count > 0) {
			yearTriggerFreq.push({ id: trig.id, label: labelOf(t, trig), count });
		}
	}
	yearTriggerFreq.sort((a, b) => b.count - a.count);
	const yearTopTrigger = yearTriggerFreq[0] ?? null;

	// CIPH-305b — condition-aware bullets now come from the shared helper so
	// the compact PDF emits the same clinical facts (peak IOP, OFF time,
	// pain×mood, etc.). Trajectory + episode-burden + top-trigger/symptom
	// bullets remain inline below since they need scope-local state.
	const bullets: Array<{ fact: string; question: string }> = [
		// `buildConditionAwareBullets` mixes vital-derived facts (need daily_log)
		// with episode-derived facts (need standalone episodes too); the helper
		// itself filters per-bullet, so we hand it the broader set.
		...buildConditionAwareBullets(blueprint, yearEpisodeDocs, t, bulletWindowLabel),
	];

	// Trajectory bullet — only when we actually drew a trajectory chart.
	if (chartContext) {
		bullets.push({
			fact: t('pdf.for_doctor_fact_trajectory', {
				months: String(chartContext.MONTHS),
				first: chartContext.firstAvg.toFixed(1),
				last: chartContext.lastAvg.toFixed(1),
				trend: chartContext.trendLabel,
			}),
			question: chartContext.trendDir === 'up'
				? t('pdf.for_doctor_q_worsening')
				: chartContext.trendDir === 'down'
					? t('pdf.for_doctor_q_improving')
					: t('pdf.for_doctor_q_stable'),
		});
	}

	// Episode burden across the 12-month window (replaces old "cluster days"
	// bullet — listing specific day numbers doesn't scale beyond one month).
	let yearTotalEpisodes = 0;
	const yearEpisodeDaySet = new Set<string>();
	for (const d of yearEpisodeDocs) {
		const eps = (d.data?.episodes || d.data?.seizures || {}) as Record<string, number>;
		let dayTotal = 0;
		for (const col of episodeCols) dayTotal += eps[col] || 0;
		if (dayTotal > 0) {
			yearTotalEpisodes += dayTotal;
			yearEpisodeDaySet.add(String(d.data?.date || ''));
		}
	}
	const yearEpisodeDays = yearEpisodeDaySet.size;
	if (yearTotalEpisodes > 0) {
		bullets.push({
			fact: t('pdf.for_doctor_fact_year_burden', {
				total: String(yearTotalEpisodes),
				days: String(yearEpisodeDays),
				logged: String(yearDaysLogged),
				window: bulletWindowLabel,
			}),
			question: t('pdf.for_doctor_q_cluster'),
		});
	}

	if (yearTopTrigger && yearTopTrigger.count > 0) {
		bullets.push({
			fact: t('pdf.for_doctor_fact_trigger', {
				label: yearTopTrigger.label,
				count: String(yearTopTrigger.count),
				window: bulletWindowLabel,
			}),
			question: t('pdf.for_doctor_q_trigger'),
		});
	}

	if (yearTopSymptom && yearTopSymptom.count > 0 && yearDaysLogged > 0) {
		bullets.push({
			fact: t('pdf.for_doctor_fact_symptom', {
				label: yearTopSymptom.label,
				count: String(yearTopSymptom.count),
				pct: String(Math.round((yearTopSymptom.count / yearDaysLogged) * 100)),
			}),
			question: t('pdf.for_doctor_q_symptom'),
		});
	}

	// Pain × mood correlation now lives in `buildConditionAwareBullets`
	// (CIPH-305b) so the compact PDF can also surface it.

	// Cap to 6 bullets (was 5). The pain-mood correlation is a bonus signal
	// when present; condition-aware bullets still come first.
	const renderedBullets = bullets.slice(0, 6);
	for (const b of renderedBullets) {
		const num = renderedBullets.indexOf(b) + 1;
		// Number circle — cohort-primary fill
		doc.setFillColor(...acc.primary);
		doc.circle(18, byY + 2, 3, 'F');
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(10);
		doc.setTextColor(255, 255, 255);
		doc.text(String(num), 18, byY + 3.5, { align: 'center' });

		// Fact — wider safety margin so long German compound words don't overflow.
		// jsPDF's default helvetica is Latin-1 only; all text here avoids the
		// Unicode arrow (→) which renders as !' and breaks splitTextToSize.
		const factWidth = pageW - 26 - 14 - 6; // left=26, right=14, 6mm safety
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(10);
		doc.setTextColor(...BRAND.textPrimary);
		const factLines = doc.splitTextToSize(b.fact, factWidth);
		doc.text(factLines, 26, byY + 3);

		// Question underneath — prefix with "Q:" (ASCII) instead of the
		// Unicode arrow which the font cannot render.
		doc.setFont('helvetica', 'italic');
		doc.setFontSize(9.5);
		doc.setTextColor(...BRAND.ochre);
		const qY = byY + 3 + factLines.length * 4.5;
		const qLines = doc.splitTextToSize('Q:  ' + b.question, factWidth);
		doc.text(qLines, 26, qY);

		byY = qY + qLines.length * 4.5 + 8;
	}

	// Footnote
	doc.setFont('helvetica', 'italic');
	doc.setFontSize(8);
	doc.setTextColor(...BRAND.textMuted);
	doc.text(t('pdf.for_doctor_footnote'), pageW / 2, pageH - 28, { align: 'center' });

	// ── Append day-by-day grid(s). 'month' scope = one grid for the focus
	// month. 'year' / '2years' scope = one grid per month in the window, so
	// the doctor can spot-check any specific month without extra exports.
	const gridMonths: Array<{ y: number; m: number }> = [];
	if (scope === 'month') {
		gridMonths.push({ y: year, m: month });
	} else {
		// Iterate from oldest to newest so the appendix reads chronologically.
		for (let i = scopeMonths - 1; i >= 0; i--) {
			const d = new Date(year, month - i, 1);
			gridMonths.push({ y: d.getFullYear(), m: d.getMonth() });
		}
	}
	for (const gm of gridMonths) {
		doc.addPage();
		paintPaper(doc);
		drawGridSection(doc, blueprint, documents, gm.y, gm.m, t, locale, username);
	}

	// Footer: stamp every page ONCE, at the very end, after all pages exist.
	// Calling drawFooter before doc.addPage() would stamp the new page again
	// on the next call, producing the overlapping "Seite 1/3 Seite 1/4" artifact.
	drawFooter(doc, t);

	const userTag = username ? `${username}-` : '';
	const scopeTag = scope === 'month' ? focusMonthPrefix : `${scope}-${focusMonthPrefix}`;
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
	const doc = new jsPDF({ unit: 'mm', format: 'a4' });
	const pageW = doc.internal.pageSize.getWidth();
	const pageH = doc.internal.pageSize.getHeight();

	paintPaper(doc);
	drawWatermarkPattern(doc);

	// Header band
	const bandH = drawHeaderBand(doc, {
		title: t('pdf.recovery_title'),
		color: BRAND.brick,
	});

	// Meta
	const issuedAt = new Date().toLocaleDateString(locale, {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(9);
	doc.setTextColor(...BRAND.textMuted);
	doc.text(
		`${t('pdf.account')}: ${username}   ·   ${t('pdf.export_date')}: ${issuedAt}`,
		pageW / 2,
		bandH + 10,
		{ align: 'center' }
	);

	// Context
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(10.5);
	doc.setTextColor(...BRAND.textSecondary);
	const contextLines = doc.splitTextToSize(t('pdf.recovery_context'), pageW - 50);
	doc.text(contextLines, pageW / 2, bandH + 20, { align: 'center' });

	// ── Code box (olive-tinted, 4×3 grid) ──
	const words = recoveryCode.trim().split(/\s+/);
	const cols = 4;
	const rows = Math.ceil(words.length / cols);
	const boxMargin = 22;
	const boxW = pageW - 2 * boxMargin;
	const cellH = 12;
	const boxH = cellH * rows + 8;
	const boxY = bandH + 20 + contextLines.length * 5 + 8;

	// olive-tinted card
	doc.setFillColor(...BRAND.oliveSoft);
	doc.setDrawColor(...BRAND.olive);
	doc.setLineWidth(0.5);
	doc.roundedRect(boxMargin, boxY, boxW, boxH, 3, 3, 'FD');

	const colW = boxW / cols;
	for (let i = 0; i < words.length; i++) {
		const r = Math.floor(i / cols);
		const c = i % cols;
		const cx = boxMargin + c * colW + 6;
		const cy = boxY + 4 + r * cellH + cellH / 2 + 1.5;

		// index number — brick
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(8);
		doc.setTextColor(...BRAND.brick);
		doc.text(String(i + 1).padStart(2, '0'), cx, cy);

		// word — monospace
		doc.setFont('courier', 'bold');
		doc.setFontSize(12);
		doc.setTextColor(...BRAND.textPrimary);
		doc.text(words[i], cx + 8, cy);
	}

	// ── Side-note instructions ──
	const instY = boxY + boxH + 10;
	const steps = [
		t('pdf.recovery_step_1'),
		t('pdf.recovery_step_2'),
		t('pdf.recovery_step_3'),
	];

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(9);
	doc.setTextColor(...BRAND.textPrimary);
	doc.text(t('pdf.recovery_instructions_heading'), boxMargin, instY);

	doc.setFont('helvetica', 'normal');
	doc.setFontSize(9.5);
	doc.setTextColor(...BRAND.textSecondary);
	let sy = instY + 6;
	for (const step of steps) {
		// asterisk bullet
		doc.setTextColor(...BRAND.brick);
		doc.setFont('helvetica', 'bold');
		doc.text('*', boxMargin, sy);
		doc.setFont('helvetica', 'normal');
		doc.setTextColor(...BRAND.textSecondary);
		const lines = doc.splitTextToSize(step, boxW - 8);
		doc.text(lines, boxMargin + 4, sy);
		sy += lines.length * 5 + 2;
	}

	// ── Warning strip ──
	const warnY = pageH - 32;
	doc.setFillColor(...BRAND.brickSoft);
	doc.setDrawColor(...BRAND.brick);
	doc.setLineWidth(0.3);
	doc.roundedRect(boxMargin, warnY, boxW, 14, 2, 2, 'FD');

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(9);
	doc.setTextColor(...BRAND.brick);
	doc.text('*', boxMargin + 4, warnY + 9);
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(9);
	doc.setTextColor(...BRAND.brickDark);
	const warnLines = doc.splitTextToSize(t('pdf.recovery_warning'), boxW - 10);
	doc.text(warnLines, boxMargin + 8, warnY + 6);

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
	doc.setFontSize(9);
	doc.setTextColor(...BRAND.textMuted);
	doc.text(
		`${t('pdf.export_date')}: ${issuedAt}`,
		pageW / 2,
		bandH + 10,
		{ align: 'center' }
	);

	// Context
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(10.5);
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
	doc.setFontSize(7.5);
	doc.setTextColor(...BRAND.ochre);
	doc.text(t('pdf.family_code_label').toUpperCase(), boxMargin + 4, boxesY + 6);

	const words = familyCode.trim().split(/\s+/);
	doc.setFont('courier', 'bold');
	doc.setFontSize(11);
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
		doc.setFontSize(7);
		doc.setTextColor(...BRAND.brick);
		doc.text(String(i + 1).padStart(2, '0'), cx, cy);

		doc.setFont('courier', 'bold');
		doc.setFontSize(10.5);
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
	doc.setFontSize(7.5);
	doc.setTextColor(...BRAND.brick);
	doc.text(t('pdf.family_url_label').toUpperCase(), rightX + 4, boxesY + 6);

	doc.setFont('courier', 'normal');
	doc.setFontSize(8);
	doc.setTextColor(...BRAND.textPrimary);
	const urlLines = doc.splitTextToSize(shareLink, boxW - 8);
	doc.text(urlLines, rightX + 4, boxesY + 13);

	// ── "How <recipient> accepts" steps ──
	const stepsY = boxesY + boxH + 10;
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(10);
	doc.setTextColor(...BRAND.textPrimary);
	doc.text(t('pdf.family_how_to_accept', { label }), boxMargin, stepsY);

	const steps = [
		t('pdf.family_step_1'),
		t('pdf.family_step_2'),
		t('pdf.family_step_3'),
	];
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(9.5);
	let sy = stepsY + 7;
	for (let i = 0; i < steps.length; i++) {
		// numbered circle
		doc.setFillColor(...BRAND.brick);
		doc.circle(boxMargin + 2.5, sy - 1.5, 2.5, 'F');
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(8);
		doc.setTextColor(255, 255, 255);
		doc.text(String(i + 1), boxMargin + 2.5, sy + 0.5, { align: 'center' });

		doc.setFont('helvetica', 'normal');
		doc.setFontSize(9.5);
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
	doc.setFontSize(9);
	doc.setTextColor(...BRAND.brick);
	doc.text('*', boxMargin + 4, warnY + 9);
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(9);
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
	const endDate = new Date(year, month + 1, 0);
	const startDate = new Date(year, month + 1 - scopeMonths, 1);
	const startISO = startDate.toISOString().slice(0, 10);
	const endISO = endDate.toISOString().slice(0, 10);
	const filePrefix = scope === 'month'
		? `${year}-${String(month + 1).padStart(2, '0')}`
		: `${scope}-${year}-${String(month + 1).padStart(2, '0')}`;
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
	// CIPH-881b — one column per rescue medication, count of doses on each day.
	const rescueMedCols = (blueprint.rescueMedications || []).map((m) => ({
		id: m.id,
		label: `${labelOf(t, m)}${m.unit ? ` (${translateUnit(t, m.unit)})` : ''}`,
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
		const dateFormatted = cur.toLocaleDateString(locale, {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		});

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
			if (col.type === 'time') {
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
