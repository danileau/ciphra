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
import type { Blueprint } from '$lib/blueprint';
import type { CiphraDocument } from '$lib/stores/documents';
import { translateUnit } from '$lib/i18n';
import { isExportable } from '$lib/utils/exportable';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;
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

const MM = (n: number) => n; // doc is mm already; alias for readability

/* ────────────────────────────────────────────────────────────────
 * Shared PDF data-prep layer (CIPH-305).
 * Both `generateDoctorPdf` and `generateCompactPdf` call into these —
 * any change to aggregation logic is picked up by both, eliminating
 * drift (Felix's constraint, vote 4).
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
export function applyBlueprintCustomizations(blueprint: Blueprint): Blueprint {
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

/** A StatCard-style block: label above, value below, accent stripe left. */
function drawStatCard(
	doc: jsPDF,
	x: number,
	y: number,
	w: number,
	h: number,
	label: string,
	value: string,
	accent: RGB
): void {
	// card
	doc.setFillColor(...BRAND.card);
	doc.setDrawColor(...BRAND.border);
	doc.setLineWidth(0.2);
	doc.roundedRect(x, y, w, h, 2, 2, 'FD');

	// accent stripe
	doc.setFillColor(...accent);
	doc.rect(x, y, 1.8, h, 'F');

	// label
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(7.5);
	doc.setTextColor(...BRAND.textMuted);
	doc.text(label.toUpperCase(), x + 5, y + 6);

	// value — truncate to a single line + ellipsis if the label is too long
	// for the card width. Long labels (e.g. PCOS "Vermehrter Haarwuchs
	// (Gesicht/Körper…)" previously bled into the neighbouring card.
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(15);
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
	doc.text(displayValue, x + valPadLeft, y + h - 4.5);
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
	const symptomCols = blueprint.gridSymptomColumns.filter((id) => !POSITIVE_MARKERS.has(id));
	const episodeCols = blueprint.gridEpisodeColumns;

	const symptomLabels = symptomCols.map((id) => {
		for (const g of blueprint.symptomGroups) {
			const item = g.items.find((i) => i.id === id);
			if (item) return t(item.label);
		}
		return id;
	});
	const episodeLabels = episodeCols.map((id) => {
		const ep = blueprint.episodeTypes.find((e) => e.id === id);
		return ep ? t(ep.label) : id;
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
		columnStyles: {
			0: { cellWidth: 10, fontStyle: 'bold', halign: 'center' },
		},
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

			// Totals row — brick background, reverse text
			if (isTotals) {
				data.cell.styles.fillColor = BRAND.brick as any;
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
					// Intensity by column frequency — higher column sum = more opaque brick
					const colI = colIdx - 1;
					const freq = symptomSums[colI] / maxSymptomDays;
					const alpha = 0.25 + freq * 0.55; // 0.25..0.80
					// approximate alpha over paper
					const r = Math.round(BRAND.paper[0] * (1 - alpha) + BRAND.brick[0] * alpha);
					const g = Math.round(BRAND.paper[1] * (1 - alpha) + BRAND.brick[1] * alpha);
					const b = Math.round(BRAND.paper[2] * (1 - alpha) + BRAND.brick[2] * alpha);
					data.cell.styles.fillColor = [r, g, b] as any;
					data.cell.styles.textColor = [255, 255, 255] as any;
					data.cell.styles.halign = 'center';
					data.cell.styles.fontStyle = 'bold';
				}
				if (isEpisodeCol) {
					const val = Number(data.cell.raw);
					if (val > 0) {
						// ochre pill, intensity by value relative to max
						const intensity = Math.min(val / maxEpCount, 1);
						const alpha = 0.2 + intensity * 0.5;
						const r = Math.round(BRAND.paper[0] * (1 - alpha) + BRAND.ochre[0] * alpha);
						const g = Math.round(BRAND.paper[1] * (1 - alpha) + BRAND.ochre[1] * alpha);
						const b = Math.round(BRAND.paper[2] * (1 - alpha) + BRAND.ochre[2] * alpha);
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
					label: t(ep.label),
					days: String(activeDays),
					weeks: (activeDays / 7).toFixed(1),
					window: scopeWindowLabel,
				}),
				question: t('pdf.for_doctor_q_multiday', { label: t(ep.label) }),
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
	const episodeCols = blueprint.gridEpisodeColumns;
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
				symptomFreq.push({ id: item.id, label: t(item.label), count });
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
		if (count > 0) triggerFreq.push({ label: t(tr.label), count });
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

	// ── Stat cards (2×2) with accent stripes ──
	const cardGap = 4;
	const cardW = (pageW - 28 - cardGap) / 2;
	const cardH = 18;

	// Days-logged is a data-quality signal (so the doctor knows whether to
	// trust the means), not a clinical metric — render it as a small line
	// AFTER the disclaimer banner so it doesn't overlap. Position is right
	// above the stat cards.
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(7.5);
	doc.setTextColor(...BRAND.textMuted);
	doc.text(
		`${t('pdf.days_logged_short')}: ${daysLogged}/${daysInMonth}`,
		pageW - 14,
		cursorY - 1,
		{ align: 'right' }
	);

	const cards: { label: string; value: string; accent: RGB }[] = [
		{
			label: t('pdf.total_episodes'),
			value: String(totalEpisodes),
			accent: BRAND.ochre,
		},
		{
			label: t('pdf.most_frequent_symptom'),
			value: mostFrequentSymptom
				? `${mostFrequentSymptom.label} (${mostFrequentSymptom.count})`
				: '—',
			accent: BRAND.brick,
		},
		{
			label: t('pdf.most_frequent_trigger') === 'pdf.most_frequent_trigger'
				? t('pdf.most_frequent_symptom') // fallback label if new key untranslated
				: t('pdf.most_frequent_trigger'),
			value: mostFrequentTrigger ? `${mostFrequentTrigger.label} (${mostFrequentTrigger.count})` : '—',
			accent: BRAND.ochre,
		},
	];

	for (let i = 0; i < cards.length; i++) {
		const col = i % 2;
		const row = Math.floor(i / 2);
		const x = 14 + col * (cardW + cardGap);
		const y = cursorY + row * (cardH + cardGap);
		drawStatCard(doc, x, y, cardW, cardH, cards[i].label, cards[i].value, cards[i].accent);
	}
	cursorY += 2 * (cardH + cardGap);

	// ── Comparison deltas ──
	// For '2years' scope there is no meaningful prior window (prevMonths===0),
	// so we suppress the entire deltas block. For 'year' scope we compare to
	// the prior 12-month window and retitle accordingly.
	const episodeChange = totalEpisodes - prevTotalEpisodes;
	const daysChange = daysLogged - prevDaysLogged;
	const showDeltas = scope !== '2years';
	if (showDeltas) {
	const deltaTitleKey = scope === 'year' ? 'pdf.compared_to_prev_year' : 'pdf.compared_to_prev';
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(8);
	doc.setTextColor(...BRAND.textMuted);
	doc.text(t(deltaTitleKey).toUpperCase(), 14, cursorY + 2);
	cursorY += 6;

	// jsPDF's built-in fonts render WinAnsi only — Unicode triangles (▲▼)
	// and a bunch of typographic punctuation come out as garbage ("%¼"-style
	// glyphs). Draw triangles as vector shapes and use ASCII everywhere else.
	const drawDelta = (x: number, label: string, delta: number, invertGood: boolean) => {
		const isGood = invertGood ? delta < 0 : delta > 0;
		const isFlat = delta === 0;
		const color: RGB = isFlat ? BRAND.textMuted : isGood ? BRAND.olive : BRAND.brick;

		doc.setFont('helvetica', 'normal');
		doc.setFontSize(8);
		doc.setTextColor(...BRAND.textSecondary);
		doc.text(label, x, cursorY);

		// No arrow — color + explicit sign are enough to read direction.
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(11);
		doc.setTextColor(...color);
		const sign = delta > 0 ? '+' : '';
		doc.text(`${sign}${delta}`, x, cursorY + 6);
	};

	drawDelta(14, t('pdf.total_episodes'), episodeChange, true);
	drawDelta(14 + cardW + cardGap, t('pdf.days_logged'), daysChange, false);

	cursorY += 12;
	}

	// Trajectory metadata exposed outside the scope block so the "trajectory"
	// bullet on the For-Doctor page can reference it when the chart is drawn.
	type TrendDir = 'up' | 'down' | 'flat';
	let chartContext:
		| { MONTHS: number; firstAvg: number; lastAvg: number; trendLabel: string; trendDir: TrendDir }
		| null = null;

	// For 'month' scope, skip the 24-month trajectory + vital-trends section.
	// A month report should stay focused on that month; the grid appendix has
	// the day-by-day detail, the stat cards have the comparisons to prev month.
	// Historical context belongs in the 'year' and '2years' scope reports.
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

	// Trend: first 6 months vs last 6 months (only months with data)
	const first6 = monthlyTotals.slice(0, 6).filter(v => v >= 0);
	const last6 = monthlyTotals.slice(-6).filter(v => v >= 0);
	const firstAvg = first6.length ? first6.reduce((a, b) => a + b, 0) / first6.length : 0;
	const lastAvg = last6.length ? last6.reduce((a, b) => a + b, 0) / last6.length : 0;
	const trendDelta = lastAvg - firstAvg;
	const trendEps = Math.max(0.5, firstAvg * 0.1);
	let trendLabelKey = 'pdf.trend_stable';
	let trendColor: RGB = BRAND.textMuted;
	let trendDir: TrendDir = 'flat';
	if (trendDelta > trendEps) {
		trendLabelKey = 'pdf.trend_worsening';
		trendColor = BRAND.brick;
		trendDir = 'up';
	} else if (trendDelta < -trendEps) {
		trendLabelKey = 'pdf.trend_improving';
		trendColor = BRAND.olive;
		trendDir = 'down';
	}

	// Trend badge: a soft-pill label on the right edge. No arrow — color
	// + explicit text ("Weniger / Mehr Ereignisse") carry the direction.
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(9);
	const trendLabel = t(trendLabelKey);
	// Stash for bullet rendering outside this block.
	chartContext = { MONTHS, firstAvg, lastAvg, trendLabel, trendDir };
	const pillPadX = 3;
	const pillPadY = 1.8;
	const pillW = doc.getTextWidth(trendLabel) + pillPadX * 2;
	const pillH = 6;
	const pillX = pageW - 14 - pillW;
	const pillY = cursorY - pillH + pillPadY;
	const pillBg: RGB = trendDir === 'up' ? [249, 229, 224]
		: trendDir === 'down' ? [238, 239, 213]
		: BRAND.paperInset;
	doc.setFillColor(...pillBg);
	doc.roundedRect(pillX, pillY, pillW, pillH, 2, 2, 'F');
	doc.setTextColor(...trendColor);
	doc.text(trendLabel, pillX + pillW / 2, pillY + pillH - pillPadY, { align: 'center' });

	cursorY += 6;

	// ── Narrative summary (accessible fallback for the chart) ──
	// Screen readers can't meaningfully read an SVG-like vector chart, and
	// doctors triaging a stack of PDFs benefit from a one-sentence TL;DR.
	const narrativeText = t('pdf.trajectory_narrative', {
		months: String(MONTHS),
		first: firstAvg.toFixed(1),
		last: lastAvg.toFixed(1),
		trend: trendLabel,
	});
	doc.setFont('helvetica', 'italic');
	doc.setFontSize(8);
	doc.setTextColor(...BRAND.textSecondary);
	const narrativeLines = doc.splitTextToSize(narrativeText, pageW - 28);
	doc.text(narrativeLines, 14, cursorY);
	cursorY += narrativeLines.length * 3.5 + 3;

	const chartX = 22;
	const chartW = pageW - 28 - 8;
	const chartH = 46;
	const yMax = Math.max(...monthlyTotals, ...monthlySymptomDays, 1);

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
			const raw = String(d.data.notes || '').replace(/\s+/g, ' ').trim();
			out.push({ x, label: raw.length > 22 ? raw.slice(0, 21) + '…' : raw });
		}
		return out;
	}
	function drawEventLines(boxX: number, boxY: number, boxW: number, boxH: number, withLabels: boolean) {
		const markers = buildEventMarkers(boxX, boxW);
		if (markers.length === 0) return;
		// Use brick (higher contrast vs paper background) and a bolder
		// dash so the vertical event line is unmistakably visible on
		// printed PDFs. Previous ochre + 0.3 line + [0.8,0.8] dash was
		// too faint — testers reported the line was effectively invisible.
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

	// Build polyline points. Straight segments + dots match the vital
	// mini-charts below and avoid the bezier overshoot that previously
	// clipped the chart's bottom border on descending legs.
	const points: Array<[number, number]> = monthlyTotals.map((v, i) => [
		chartX + (i / Math.max(1, MONTHS - 1)) * chartW,
		cursorY + chartH - (v / yMax) * chartH,
	]);

	const baseY = cursorY + chartH;

	// Switched from Catmull-Rom bezier smoothing to straight-line segments +
	// dots — same visual language as the vital mini-charts below. Bezier
	// overshoot dipped below y=0 on descending legs, clipping the chart's
	// bottom border; straight lines eliminate that and make monthly data
	// points discoverable at a glance.

	// Area fill from straight-line polygon (no bezier deltas).
	if (points.length >= 2) {
		const firstX = points[0][0];
		const firstY = points[0][1];
		const lastX = points[points.length - 1][0];
		const areaPath: number[][] = [[0, firstY - baseY]];
		for (let i = 1; i < points.length; i++) {
			areaPath.push([points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]]);
		}
		areaPath.push([0, baseY - points[points.length - 1][1]]);
		areaPath.push([-(lastX - firstX), 0]);
		doc.setFillColor(...BRAND.ochreSoft);
		doc.setDrawColor(...BRAND.ochreSoft);
		doc.lines(areaPath, firstX, baseY, undefined, 'F', true);
	}

	// Stroke straight segments on top
	if (points.length >= 2) {
		doc.setDrawColor(...BRAND.brick);
		doc.setLineWidth(0.8);
		for (let i = 1; i < points.length; i++) {
			doc.line(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
		}
	}

	// Data dot at every monthly value (matches mini-chart style).
	if (points.length > 0) {
		doc.setFillColor(...BRAND.brick);
		for (const [px, py] of points) doc.circle(px, py, 0.6, 'F');
		// Slightly larger end marker on the latest month.
		const [ex, ey] = points[points.length - 1];
		doc.circle(ex, ey, 1.2, 'F');
	}

	// Symptom-days secondary line (faint, dashed). Lets the clinician spot
	// "episodes down but symptom burden up" on the same y-axis.
	if (monthlySymptomDays.some((v) => v > 0)) {
		const sPoints: Array<[number, number]> = monthlySymptomDays.map((v, i) => [
			chartX + (i / Math.max(1, MONTHS - 1)) * chartW,
			cursorY + chartH - (v / yMax) * chartH,
		]);
		doc.setDrawColor(...BRAND.textMuted);
		doc.setLineWidth(0.4);
		doc.setLineDashPattern([1.2, 1.2], 0);
		for (let i = 1; i < sPoints.length; i++) {
			doc.line(sPoints[i - 1][0], sPoints[i - 1][1], sPoints[i][0], sPoints[i][1]);
		}
		doc.setLineDashPattern([], 0);
		doc.setFillColor(...BRAND.textMuted);
		for (const [px, py] of sPoints) doc.circle(px, py, 0.4, 'F');
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
	const PAIR_COLORS = ['#0891B2', '#7C3AED'];
	for (const v of chartableVitals) {
		if (seenVitalIds.has(v.id) || !v.pairLabel) continue;
		const pair = chartableVitals.filter((x) => x.pairLabel === v.pairLabel);
		const series: MiniSeries[] = pair.map((p, i) => ({
			label: t(p.label),
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
				title: (title === titleKey ? t(v.label) : title) + (v.unit ? ` (${translateUnit(t, v.unit)})` : ''),
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
			title: `${t(v.label)}${v.unit ? ` (${translateUnit(t, v.unit)})` : ''}`,
			series: [{ label: t(v.label), color: '#b2463c', values }],
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
			title: `${t(v.label)}${v.unit ? ` (${translateUnit(t, v.unit)})` : ''} — ${t('pdf.am_pm_split')}`,
			series: [
				{ label: t('pdf.am_label'), color: '#DC2626', values: am },
				{ label: t('pdf.pm_label'), color: '#6366F1', values: pm },
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
				label: t(ep.label),
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

			// Each series — straight segments + dots (sparse data is honest)
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
				for (let i = 1; i < pts.length; i++) {
					doc.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
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
						t(ep.label),
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
					data.cell.styles.textColor = BRAND.ochre as any;
					data.cell.styles.fontStyle = 'bold';
				}
				if (data.section === 'body' && data.column.index === 2) {
					const pct = parseInt(data.cell.raw as string);
					if (pct >= 50) {
						data.cell.styles.textColor = BRAND.brick as any;
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
				yearSymptomFreq.push({ id: item.id, label: t(item.label), count });
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
			yearTriggerFreq.push({ id: trig.id, label: t(trig.label), count });
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
		// Number circle
		doc.setFillColor(...BRAND.brick);
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
	const totalDays = Math.round(
		(endDate.getTime() - startDate.getTime()) / 86400000
	) + 1;

	const symptomCols: { id: string; label: string }[] = [];
	for (const g of blueprint.symptomGroups) {
		for (const item of g.items) {
			symptomCols.push({ id: item.id, label: t(item.label) });
		}
	}
	const episodeCols = blueprint.episodeTypes.map((ep) => ({ id: ep.id, label: t(ep.label) }));
	const triggerCols = blueprint.triggers.map((tr) => ({ id: tr.id, label: t(tr.label) }));
	const vitalCols = blueprint.vitals.map((v) => ({ id: v.id, label: `${t(v.label)} (${translateUnit(t, v.unit)})` }));

	const episodeDetailCols: { id: string; type: 'time' | 'duration'; label: string }[] = [];
	for (const ep of blueprint.episodeTypes) {
		if (ep.trackTimeOfDay) {
			episodeDetailCols.push({ id: ep.id, type: 'time', label: `${t(ep.label)} — ${t('protocol.time_of_day')}` });
		}
		if (ep.trackDuration) {
			episodeDetailCols.push({ id: ep.id, type: 'duration', label: `${t(ep.label)} — ${t('protocol.duration')}` });
		}
	}

	const headers = [
		'date',
		...symptomCols.map((c) => c.label),
		...episodeCols.map((c) => c.label),
		...episodeDetailCols.map((c) => c.label),
		...triggerCols.map((c) => c.label),
		...vitalCols.map((c) => c.label),
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

// Use MM to silence unused-import warnings if tree-shaken later.
void MM;

/* ────────────────────────────────────────────────────────────────
 * CIPH-305 — Compact A4 PDF.
 * Single column, 12pt body min, 14pt headings, no decorative frames,
 * no grid appendix. Built for legibility over density. Shares all
 * aggregator helpers with generateDoctorPdf (see `aggregate*Shared`
 * + `dayVitalsShared` above) so the two outputs never drift.
 * ──────────────────────────────────────────────────────────────── */
export function generateCompactPdf(
	blueprintIn: Blueprint,
	documents: CiphraDocument[],
	year: number,
	month: number,
	t: TranslateFn,
	locale: string,
	username: string = '',
	scope: ReportScope = 'month'
): void {
	// CIPH-301b: also strip user-hidden symptoms/triggers/vitals so the
	// compact PDF respects wizard customizations (matches generateDoctorPdf).
	const blueprint = applyBlueprintCustomizations(applyVitalTargetOverrides(blueprintIn, username));

	// CIPH-710 / CIPH-713 — hard-exclude diary + private docs.
	documents = documents.filter(isExportable);

	const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
	const pageW = doc.internal.pageSize.getWidth();
	const pageH = doc.internal.pageSize.getHeight();
	const marginX = 18;
	const contentW = pageW - 2 * marginX;
	let y = 20;

	// Scope-appropriate chart horizon: 24mo default, 12mo for 'year', 24 for '2years'.
	const MONTHS = scope === 'year' ? 12 : 24;
	const buckets = buildMonthBuckets(year, month, MONTHS);
	const idx = bucketIndexMap(buckets);

	// ── One-line header (wordmark + scope + condition). No banner frame.
	drawWordmark(doc, marginX, y, { size: 14 });
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(14);
	doc.setTextColor(...BRAND.textPrimary);
	const scopeLabel = scope === 'month'
		? new Date(year, month).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
		: t(scope === 'year' ? 'pdf.scope_year' : 'pdf.scope_2years');
	const conditionLabel = blueprint.conditionLabel ? t(blueprint.conditionLabel) : blueprint.conditionId;
	doc.text(`${conditionLabel} — ${scopeLabel}`, pageW - marginX, y, { align: 'right' });
	y += 8;

	// Account + export date line.
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(9);
	doc.setTextColor(...BRAND.textMuted);
	const exportDate = new Date().toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
	const metaLine = username
		? `${t('pdf.account')}: ${username}   ·   ${t('pdf.export_date')}: ${exportDate}`
		: `${t('pdf.export_date')}: ${exportDate}`;
	doc.text(metaLine, marginX, y);
	y += 6;

	// ── Value-prop subtitle (so the reader immediately knows what this is
	// and why it's a single page at 12pt).
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(10);
	doc.setTextColor(...BRAND.brick);
	doc.text(t('pdf.compact_subtitle'), marginX, y);
	y += 5;

	// ── "What this contains" one-paragraph intro (scope at a glance).
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(10);
	doc.setTextColor(...BRAND.textSecondary);
	const introLines = doc.splitTextToSize(t('pdf.compact_intro'), contentW);
	doc.text(introLines, marginX, y);
	y += introLines.length * 4.5 + 4;

	// ── Disclaimer (compact, single paragraph, 10pt).
	doc.setFont('helvetica', 'italic');
	doc.setFontSize(10);
	doc.setTextColor(...BRAND.textSecondary);
	const discText = t('pdf.disclaimer_medical_long');
	const discLines = doc.splitTextToSize(discText, contentW);
	doc.text(discLines, marginX, y);
	y += discLines.length * 4.5 + 6;

	// ── Summary stats (one line, 12pt).
	const scopeMonths = scope === 'month' ? 1 : scope === 'year' ? 12 : 24;
	const scopeEndDate = new Date(year, month + 1, 0);
	const scopeStartDate = new Date(year, month + 1 - scopeMonths, 1);
	const scopeStartISO = scopeStartDate.toISOString().slice(0, 10);
	const scopeEndISO = scopeEndDate.toISOString().slice(0, 10);
	const scopeDocs = documents.filter((d) => {
		if (d.data?.type !== 'entry') return false;
		const ds = String(d.data.date || '');
		return ds >= scopeStartISO && ds <= scopeEndISO;
	});
	// Episode-bearing docs: daily_log + standalone `episode` quick-add in window.
	const scopeEpisodeDocs = documents.filter((d) => {
		const t = d.data?.type;
		if (t !== 'entry') return false;
		const ds = String(d.data?.date || '');
		return ds >= scopeStartISO && ds <= scopeEndISO;
	});
	const totalDaysInScope = Math.round((scopeEndDate.getTime() - scopeStartDate.getTime()) / 86400000) + 1;
	const daysLogged = scopeDocs.length;
	const episodeCols = blueprint.gridEpisodeColumns;
	let totalEpisodes = 0;
	for (const d of scopeEpisodeDocs) {
		for (const col of episodeCols) {
			totalEpisodes += (d.data?.episodes?.[col] || d.data?.seizures?.[col] || 0) as number;
		}
	}

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(14);
	doc.setTextColor(...BRAND.textPrimary);
	doc.text(t('pdf.clinical_summary_title') === 'pdf.clinical_summary_title'
		? t('pdf.for_doctor_title')
		: t('pdf.clinical_summary_title'), marginX, y);
	y += 7;

	doc.setFont('helvetica', 'normal');
	doc.setFontSize(12);
	doc.setTextColor(...BRAND.textPrimary);
	const summaryLine = `${t('pdf.days_logged')}: ${daysLogged} / ${totalDaysInScope}   ·   ${t('pdf.total_episodes')}: ${totalEpisodes}`;
	doc.text(summaryLine, marginX, y);
	y += 8;

	// ── Trajectory chart — scope-appropriate (12 or 24 months).
	// Straight-segment polyline (no smoothing, no area fill, no ochre frame).
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(14);
	doc.text(t(scope === 'year' ? 'pdf.episode_trend_12m' : 'pdf.episode_trend'), marginX, y);
	y += 6;

	const monthlyTotals: number[] = [];
	const monthlySymptomDays: number[] = [];
	for (const b of buckets) {
		let sum = 0;
		let sympDays = 0;
		const prefix = `${b.y}-${String(b.m + 1).padStart(2, '0')}`;
		for (const d of documents) {
			if (d.data?.type !== 'entry') continue;
			const ds = String(d.data.date || '');
			if (!ds.startsWith(prefix)) continue;
			for (const col of episodeCols) {
				sum += (d.data?.episodes?.[col] || d.data?.seizures?.[col] || 0) as number;
			}
			const syms = (d.data?.symptoms || {}) as Record<string, unknown>;
			if (Object.values(syms).some((v) => v)) sympDays += 1;
		}
		monthlyTotals.push(sum);
		monthlySymptomDays.push(sympDays);
	}

	const chartH = 48;
	const chartX = marginX + 8;
	const chartW = contentW - 8;
	const yMax = Math.max(...monthlyTotals, ...monthlySymptomDays, 1);

	// Background + horizontal mid gridline (no frame, no fill — print-friendly).
	doc.setDrawColor(...BRAND.border);
	doc.setLineWidth(0.15);
	doc.line(chartX, y, chartX, y + chartH);                // y-axis
	doc.line(chartX, y + chartH, chartX + chartW, y + chartH); // x-axis
	doc.setDrawColor(...BRAND.borderSubtle);
	doc.line(chartX, y + chartH / 2, chartX + chartW, y + chartH / 2);

	// y-labels (10pt — still legible on printout).
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(9);
	doc.setTextColor(...BRAND.textMuted);
	doc.text(String(yMax), chartX - 1, y + 3, { align: 'right' });
	doc.text('0', chartX - 1, y + chartH, { align: 'right' });

	// Points + straight line segments in brick.
	const points: [number, number][] = monthlyTotals.map((v, i) => [
		chartX + (i / Math.max(1, MONTHS - 1)) * chartW,
		y + chartH - (v / yMax) * chartH,
	]);
	doc.setDrawColor(...BRAND.brick);
	doc.setLineWidth(0.7);
	for (let i = 1; i < points.length; i++) {
		doc.line(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
	}
	doc.setFillColor(...BRAND.brick);
	for (const [px, py] of points) doc.circle(px, py, 0.8, 'F');

	// Symptom-days secondary line (faint dashed). Same y-axis.
	if (monthlySymptomDays.some((v) => v > 0)) {
		const sPoints: [number, number][] = monthlySymptomDays.map((v, i) => [
			chartX + (i / Math.max(1, MONTHS - 1)) * chartW,
			y + chartH - (v / yMax) * chartH,
		]);
		doc.setDrawColor(...BRAND.textMuted);
		doc.setLineWidth(0.4);
		doc.setLineDashPattern([1.2, 1.2], 0);
		for (let i = 1; i < sPoints.length; i++) {
			doc.line(sPoints[i - 1][0], sPoints[i - 1][1], sPoints[i][0], sPoints[i][1]);
		}
		doc.setLineDashPattern([], 0);
		doc.setFillColor(...BRAND.textMuted);
		for (const [px, py] of sPoints) doc.circle(px, py, 0.5, 'F');
	}

	// X-axis month labels — every Nth month, all in 8pt.
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(8);
	doc.setTextColor(...BRAND.textMuted);
	const labelEvery = MONTHS <= 12 ? 2 : 4;
	for (let i = 0; i < buckets.length; i++) {
		if (i % labelEvery !== 0 && i !== buckets.length - 1) continue;
		const b = buckets[i];
		const lx = chartX + (i / Math.max(1, MONTHS - 1)) * chartW;
		const dt = new Date(b.y, b.m, 1);
		const lbl = dt.toLocaleDateString(locale, { month: 'short', year: '2-digit' });
		doc.text(lbl, lx, y + chartH + 5, { align: 'center' });
	}

	y += chartH + 14;

	// ── Recent note-markers (events) within scope. Closes a visibility gap:
	// users authoring "Treatment changed" markers couldn't see them in the
	// PDF before — only as vertical lines on the trajectory chart.
	const eventDocs = documents
		.filter((d) => {
			if (d.data?.type !== 'event') return false;
			const ds = String(d.data.date || '');
			return ds >= scopeStartISO && ds <= scopeEndISO;
		})
		.sort((a, b) => String(b.data.date || '').localeCompare(String(a.data.date || '')))
		.slice(0, 8);

	if (eventDocs.length > 0) {
		if (y > pageH - 30) { doc.addPage(); y = 20; }
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(12);
		doc.setTextColor(...BRAND.textPrimary);
		doc.text(t('reports.recent_events_title'), marginX, y);
		y += 5;
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(10);
		doc.setTextColor(...BRAND.textSecondary);
		for (const ev of eventDocs) {
			const date = String(ev.data.date || '');
			const text = String(ev.data.title || ev.data.notes || '').trim() || '—';
			const line = `${date}   ${text}`;
			const wrapped = doc.splitTextToSize(line, contentW);
			if (y + wrapped.length * 4.5 > pageH - 15) { doc.addPage(); y = 20; }
			doc.text(wrapped, marginX, y);
			y += wrapped.length * 4.5 + 1;
		}
		y += 4;
	}

	// ── "For your doctor" bullets. Reuses the same data-prep as the full
	// report (episode totals, top symptom, top trigger). Compact format:
	// numbered, 12pt, no Q/A hierarchy (one line per bullet).

	// Page break if near bottom.
	if (y > pageH - 80) { doc.addPage(); y = 20; }

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(14);
	doc.setTextColor(...BRAND.textPrimary);
	doc.text(t('pdf.for_doctor_title'), marginX, y);
	y += 7;

	// Build bullets — 12-month window (matches `bulletWindowLabel` approach
	// in generateDoctorPdf). Skip condition-specific bullets for simplicity;
	// the compact PDF targets the generalist reader.
	const bulletMonths = scopeMonths >= 12 ? 12 : 1;
	const yearEndDate = new Date(year, month + 1, 0);
	const yearStartDate = new Date(year, month + 1 - bulletMonths, 1);
	const yearStartISO_c = yearStartDate.toISOString().slice(0, 10);
	const yearEndISO_c = yearEndDate.toISOString().slice(0, 10);
	const yearDocs = documents.filter((d) => {
		if (d.data?.type !== 'entry') return false;
		const ds = String(d.data.date || '');
		return ds >= yearStartISO_c && ds <= yearEndISO_c;
	});
	// Episode-bearing: includes standalone `episode` quick-add docs.
	const yearEpisodeDocs = documents.filter((d) => {
		const t = d.data?.type;
		if (t !== 'entry') return false;
		const ds = String(d.data?.date || '');
		return ds >= yearStartISO_c && ds <= yearEndISO_c;
	});

	const POSITIVE_MARKERS = new Set(['slept_well']);
	const symptomFreq: { label: string; count: number }[] = [];
	for (const g of blueprint.symptomGroups) {
		for (const item of g.items) {
			if (POSITIVE_MARKERS.has(item.id)) continue;
			const c = yearDocs.filter((d) => d.data?.symptoms?.[item.id]).length;
			if (c > 0) symptomFreq.push({ label: t(item.label), count: c });
		}
	}
	symptomFreq.sort((a, b) => b.count - a.count);

	// CIPH-305b: top-trigger is no longer a separate filler — the
	// condition-aware bullets (which include trigger-style facts via
	// IBD / Parkinson / glaucoma / etc.) come first, then trajectory +
	// top-symptom fill out the cap of 4. Top-trigger dropped to keep
	// the compact layout dense.

	// Trajectory direction summary via shared helper isn't needed — compute inline.
	const first6 = monthlyTotals.slice(0, 6);
	const last6 = monthlyTotals.slice(-6);
	const firstAvg = first6.length ? first6.reduce((a, b) => a + b, 0) / first6.length : 0;
	const lastAvg = last6.length ? last6.reduce((a, b) => a + b, 0) / last6.length : 0;
	const trendEps = Math.max(0.5, firstAvg * 0.1);
	let trendKey = 'pdf.trend_stable';
	if (lastAvg - firstAvg > trendEps) trendKey = 'pdf.trend_worsening';
	else if (lastAvg - firstAvg < -trendEps) trendKey = 'pdf.trend_improving';

	// CIPH-305b — condition-aware bullets first (peak IOP for glaucoma,
	// OFF time for Parkinson's, etc.), then trajectory + top-symptom as
	// generalist fillers. Cap = 4 (denser layout than the standard PDF).
	const bullets: string[] = [];

	const conditionBullets = buildConditionAwareBullets(blueprint, yearEpisodeDocs, t, scopeLabel);
	for (const cb of conditionBullets) bullets.push(cb.fact);

	bullets.push(t('pdf.for_doctor_fact_trajectory', {
		months: String(MONTHS),
		first: firstAvg.toFixed(1),
		last: lastAvg.toFixed(1),
		trend: t(trendKey),
	}));
	if (symptomFreq[0] && yearDocs.length > 0) {
		const s = symptomFreq[0];
		bullets.push(t('pdf.for_doctor_fact_symptom', {
			label: s.label,
			count: String(s.count),
			pct: String(Math.round((s.count / yearDocs.length) * 100)),
		}));
	}

	doc.setFont('helvetica', 'normal');
	doc.setFontSize(12);
	doc.setTextColor(...BRAND.textPrimary);
	const bulletIndent = marginX + 6;
	const bulletW = pageW - marginX - bulletIndent;
	let bi = 1;
	for (const b of bullets.slice(0, 4)) {
		if (y > pageH - 24) { doc.addPage(); y = 20; }
		doc.setFont('helvetica', 'bold');
		doc.text(`${bi}.`, marginX, y);
		doc.setFont('helvetica', 'normal');
		const lines = doc.splitTextToSize(b, bulletW);
		doc.text(lines, bulletIndent, y);
		y += lines.length * 5.5 + 3;
		bi++;
	}

	// Footnote (10pt).
	if (y > pageH - 20) { doc.addPage(); y = 20; }
	doc.setFont('helvetica', 'italic');
	doc.setFontSize(10);
	doc.setTextColor(...BRAND.textMuted);
	doc.text(t('pdf.for_doctor_footnote'), pageW / 2, pageH - 14, { align: 'center' });

	const userTag = username ? `${username}-` : '';
	const scopeTag = scope === 'month'
		? `${year}-${String(month + 1).padStart(2, '0')}`
		: `${scope}-${year}-${String(month + 1).padStart(2, '0')}`;
	doc.save(`ciphra-${userTag}kompakt-${blueprint.conditionId}-${scopeTag}.pdf`);
}
