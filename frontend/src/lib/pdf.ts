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

	// value
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(15);
	doc.setTextColor(...accent);
	doc.text(value, x + 5, y + h - 4.5);
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
		(d) => d.data.type === 'daily_log' && String(d.data.date || '').startsWith(monthPrefix)
	);
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const monthName = new Date(year, month).toLocaleDateString(locale, {
		month: 'long',
		year: 'numeric',
	});

	const symptomCols = blueprint.gridSymptomColumns;
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
			const count = dayDoc?.data?.episodes?.[col] || dayDoc?.data?.seizures?.[col] || 0;
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
 * Doctor Report — one PDF, everything in it: cover + 24-month
 * trajectory + comparison + symptom/medication tables + full
 * day-by-day grid for the selected month. The doctor skims what
 * they need; we give them everything we have.
 * ──────────────────────────────────────────────────────────────── */

export function generateDoctorPdf(
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
		(d) => d.data.type === 'daily_log' && String(d.data.date || '').startsWith(monthPrefix)
	);
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const monthName = new Date(year, month).toLocaleDateString(locale, {
		month: 'long',
		year: 'numeric',
	});

	// prev month
	const prevDate = new Date(year, month - 1, 1);
	const prevYear = prevDate.getFullYear();
	const prevMonth = prevDate.getMonth();
	const prevMonthPrefix = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`;
	const prevMonthDocs = documents.filter(
		(d) => d.data.type === 'daily_log' && String(d.data.date || '').startsWith(prevMonthPrefix)
	);
	const prevDaysInMonth = new Date(prevYear, prevMonth + 1, 0).getDate();
	const prevDaysLogged = prevMonthDocs.length;

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
	const dailyEpisodes: number[] = [];
	let totalEpisodes = 0;
	for (let day = 1; day <= daysInMonth; day++) {
		const dayStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
		const dayDoc = monthDocs.find((d) => d.data.date === dayStr);
		let dayTotal = 0;
		for (const col of episodeCols) {
			dayTotal += dayDoc?.data?.episodes?.[col] || dayDoc?.data?.seizures?.[col] || 0;
		}
		dailyEpisodes.push(dayTotal);
		totalEpisodes += dayTotal;
	}

	const prevDailyEpisodes: number[] = [];
	let prevTotalEpisodes = 0;
	for (let day = 1; day <= prevDaysInMonth; day++) {
		const dayStr = `${prevMonthPrefix}-${String(day).padStart(2, '0')}`;
		const dayDoc = prevMonthDocs.find((d) => d.data.date === dayStr);
		let t2 = 0;
		for (const col of episodeCols) {
			t2 += dayDoc?.data?.episodes?.[col] || dayDoc?.data?.seizures?.[col] || 0;
		}
		prevDailyEpisodes.push(t2);
		prevTotalEpisodes += t2;
	}

	const symptomFreq: { id: string; label: string; count: number }[] = [];
	for (const g of blueprint.symptomGroups) {
		for (const item of g.items) {
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

	if (daysLogged > 0) {
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(10);
		doc.setTextColor(...BRAND.textSecondary);
		const summary = t('pdf.clinical_summary', {
			month: monthName,
			episodes: totalEpisodes,
			daysLogged,
			daysInMonth,
			topSymptom: mostFrequentSymptom ? mostFrequentSymptom.label : '—',
			topPct,
		});
		const lines = doc.splitTextToSize(summary, pageW - 28);
		doc.text(lines, 14, cursorY);
		cursorY += lines.length * 5 + 4;
	}

	// ── Stat cards (2×2) with accent stripes ──
	const cardGap = 4;
	const cardW = (pageW - 28 - cardGap) / 2;
	const cardH = 18;

	const cards: { label: string; value: string; accent: RGB }[] = [
		{
			label: t('pdf.days_logged'),
			value: `${daysLogged} / ${daysInMonth}`,
			accent: BRAND.olive,
		},
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
	const episodeChange = totalEpisodes - prevTotalEpisodes;
	const daysChange = daysLogged - prevDaysLogged;

	doc.setFont('helvetica', 'normal');
	doc.setFontSize(8);
	doc.setTextColor(...BRAND.textMuted);
	doc.text(t('pdf.compared_to_prev').toUpperCase(), 14, cursorY + 2);
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

	// ── Chart: 24-month trajectory ──
	// Doctors typically see patients once or twice a year. A long-horizon
	// line chart shows whether a condition is trending up, down, or stable
	// — which is the clinical decision input. We aggregate daily episode
	// counts per month across the last 24 months ending with the selected
	// month, and plot one point per month.
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(10);
	doc.setTextColor(...BRAND.textPrimary);
	doc.text(t('pdf.episode_trend'), 14, cursorY);

	const MONTHS = 24;
	const monthBuckets: Array<{ y: number; m: number; total: number; days: number }> = [];
	for (let k = MONTHS - 1; k >= 0; k--) {
		const d = new Date(year, month - k, 1);
		monthBuckets.push({ y: d.getFullYear(), m: d.getMonth(), total: 0, days: 0 });
	}
	const bucketIndex = new Map(monthBuckets.map((b, i) => [`${b.y}-${String(b.m + 1).padStart(2, '0')}`, i]));
	for (const d of documents) {
		if (d.data?.type !== 'daily_log') continue;
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
	}
	const monthlyTotals = monthBuckets.map(b => b.total);

	// Trend: first 6 months vs last 6 months (only months with data)
	const first6 = monthlyTotals.slice(0, 6).filter(v => v >= 0);
	const last6 = monthlyTotals.slice(-6).filter(v => v >= 0);
	const firstAvg = first6.length ? first6.reduce((a, b) => a + b, 0) / first6.length : 0;
	const lastAvg = last6.length ? last6.reduce((a, b) => a + b, 0) / last6.length : 0;
	const trendDelta = lastAvg - firstAvg;
	const trendEps = Math.max(0.5, firstAvg * 0.1);
	let trendLabelKey = 'pdf.trend_stable';
	let trendColor: RGB = BRAND.textMuted;
	type TrendDir = 'up' | 'down' | 'flat';
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
	const yMax = Math.max(...monthlyTotals, 1);

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
	doc.text(String(Math.round(yMax / 2)), chartX - 1, cursorY + chartH / 2 + 1, { align: 'right' });
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

	// Build polyline points, then smooth via Catmull-Rom → cubic bezier so
	// the line reads as a clinical trajectory, not jittered month-to-month
	// bookkeeping. Each segment between P_i and P_{i+1} gets two control
	// points derived from neighbouring points with tension 0.5.
	const points: Array<[number, number]> = monthlyTotals.map((v, i) => [
		chartX + (i / Math.max(1, MONTHS - 1)) * chartW,
		cursorY + chartH - (v / yMax) * chartH,
	]);

	// catmullRomToBezier returns an array of jsPDF cubic bezier deltas
	// (each [dx1,dy1, dx2,dy2, dx3,dy3]) starting from points[0].
	function catmullRomSegments(pts: Array<[number, number]>, tension = 0.5) {
		const segs: number[][] = [];
		for (let i = 0; i < pts.length - 1; i++) {
			const p0 = pts[i - 1] ?? pts[i];
			const p1 = pts[i];
			const p2 = pts[i + 1];
			const p3 = pts[i + 2] ?? pts[i + 1];
			// Cubic bezier control points for Catmull-Rom
			const cp1x = p1[0] + ((p2[0] - p0[0]) * tension) / 6;
			const cp1y = p1[1] + ((p2[1] - p0[1]) * tension) / 6;
			const cp2x = p2[0] - ((p3[0] - p1[0]) * tension) / 6;
			const cp2y = p2[1] - ((p3[1] - p1[1]) * tension) / 6;
			// jsPDF wants deltas from the segment start (p1)
			segs.push([
				cp1x - p1[0], cp1y - p1[1],
				cp2x - p1[0], cp2y - p1[1],
				p2[0] - p1[0], p2[1] - p1[1],
			]);
		}
		return segs;
	}

	const smoothSegs = catmullRomSegments(points, 0.55);
	const baseY = cursorY + chartH;

	// Area fill: build a closed path starting at (firstX, baseY), up to
	// first point, along the smooth curve, down to (lastX, baseY), close.
	if (points.length >= 2) {
		const firstX = points[0][0];
		const firstY = points[0][1];
		const lastX = points[points.length - 1][0];
		const areaPath: number[][] = [
			[0, firstY - baseY],          // up from baseline to first point
			...smoothSegs,                 // smooth curve across all months
			[0, baseY - points[points.length - 1][1]], // down to baseline
			[-(lastX - firstX), 0],        // back along baseline to start
		];
		doc.setFillColor(...BRAND.ochreSoft);
		doc.setDrawColor(...BRAND.ochreSoft);
		doc.lines(areaPath, firstX, baseY, undefined, 'F', true);
	}

	// Stroke the smooth line on top
	if (points.length >= 2) {
		doc.setDrawColor(...BRAND.brick);
		doc.setLineWidth(0.8);
		doc.lines(smoothSegs, points[0][0], points[0][1], undefined, 'S');
	}

	// End marker on the latest month
	if (points.length > 0) {
		const [ex, ey] = points[points.length - 1];
		doc.setFillColor(...BRAND.brick);
		doc.circle(ex, ey, 1.2, 'F');
	}

	// X-axis labels: quarter markers (show month + year at Jan / Apr / Jul / Oct)
	doc.setFontSize(6);
	doc.setTextColor(...BRAND.textMuted);
	for (let i = 0; i < monthBuckets.length; i++) {
		const b = monthBuckets[i];
		if (b.m === 0 || b.m === 3 || b.m === 6 || b.m === 9 || i === monthBuckets.length - 1) {
			const x = chartX + (i / Math.max(1, MONTHS - 1)) * chartW;
			const d = new Date(b.y, b.m, 1);
			const shortLabel = d.toLocaleDateString(locale, { month: 'short', year: '2-digit' });
			doc.text(shortLabel, x, cursorY + chartH + 4, { align: 'center' });
		}
	}

	cursorY += chartH + 10;

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

	// Compose up to 4 bullets — each is "fact · question" pairs
	const bullets: Array<{ fact: string; question: string }> = [];
	bullets.push({
		fact: t('pdf.for_doctor_fact_trajectory', {
			months: String(MONTHS),
			first: firstAvg.toFixed(1),
			last: lastAvg.toFixed(1),
			trend: trendLabel.toLowerCase(),
		}),
		question: trendDir === 'up'
			? t('pdf.for_doctor_q_worsening')
			: trendDir === 'down'
				? t('pdf.for_doctor_q_improving')
				: t('pdf.for_doctor_q_stable'),
	});

	// Clustering: days in the selected month with any episodes
	const clusterDays = dailyEpisodes
		.map((v, i) => v > 0 ? i + 1 : 0)
		.filter(d => d > 0);
	if (clusterDays.length > 0) {
		bullets.push({
			fact: t('pdf.for_doctor_fact_cluster', {
				count: String(totalEpisodes),
				month: monthName,
				days: clusterDays.slice(0, 10).join(', ') + (clusterDays.length > 10 ? '…' : ''),
			}),
			question: t('pdf.for_doctor_q_cluster'),
		});
	}

	if (mostFrequentTrigger && mostFrequentTrigger.count > 0) {
		bullets.push({
			fact: t('pdf.for_doctor_fact_trigger', {
				label: mostFrequentTrigger.label,
				count: String(mostFrequentTrigger.count),
			}),
			question: t('pdf.for_doctor_q_trigger'),
		});
	}

	if (mostFrequentSymptom && mostFrequentSymptom.count > 0 && daysInMonth > 0) {
		bullets.push({
			fact: t('pdf.for_doctor_fact_symptom', {
				label: mostFrequentSymptom.label,
				count: String(mostFrequentSymptom.count),
				pct: String(Math.round((mostFrequentSymptom.count / daysInMonth) * 100)),
			}),
			question: t('pdf.for_doctor_q_symptom'),
		});
	}

	// Render bullets
	for (const b of bullets) {
		const num = bullets.indexOf(b) + 1;
		// Number circle
		doc.setFillColor(...BRAND.brick);
		doc.circle(18, byY + 2, 3, 'F');
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(10);
		doc.setTextColor(255, 255, 255);
		doc.text(String(num), 18, byY + 3.5, { align: 'center' });

		// Fact
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(10);
		doc.setTextColor(...BRAND.textPrimary);
		const factLines = doc.splitTextToSize(b.fact, pageW - 40);
		doc.text(factLines, 26, byY + 3);

		// Question underneath
		doc.setFont('helvetica', 'italic');
		doc.setFontSize(9.5);
		doc.setTextColor(...BRAND.ochre);
		const qY = byY + 3 + factLines.length * 4.5;
		const qLines = doc.splitTextToSize('→ ' + b.question, pageW - 40);
		doc.text(qLines, 26, qY);

		byY = qY + qLines.length * 4.5 + 8;
	}

	// Footnote
	doc.setFont('helvetica', 'italic');
	doc.setFontSize(8);
	doc.setTextColor(...BRAND.textMuted);
	doc.text(t('pdf.for_doctor_footnote'), pageW / 2, pageH - 28, { align: 'center' });

	drawFooter(doc, t);

	// ── Append day-by-day grid for the selected month on a new page ──
	doc.addPage();
	paintPaper(doc);
	drawGridSection(doc, blueprint, documents, year, month, t, locale, username);

	// Footer applies to every page (drawFooter stamps the current page only,
	// but jsPDF-autotable's didDrawPage hooks already stamped prior pages via
	// the analytics sections). We stamp the final grid page here.
	drawFooter(doc, t);

	const userTag = username ? `${username}-` : '';
	doc.save(`ciphra-${userTag}bericht-${blueprint.conditionId}-${monthPrefix}.pdf`);
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
	month: number, // 0-based
	t: TranslateFn,
	locale: string
): void {
	const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
	const monthDocs = documents.filter(
		(d) => d.data.type === 'daily_log' && String(d.data.date || '').startsWith(monthPrefix)
	);
	const daysInMonth = new Date(year, month + 1, 0).getDate();

	const symptomCols: { id: string; label: string }[] = [];
	for (const g of blueprint.symptomGroups) {
		for (const item of g.items) {
			symptomCols.push({ id: item.id, label: t(item.label) });
		}
	}
	const episodeCols = blueprint.episodeTypes.map((ep) => ({ id: ep.id, label: t(ep.label) }));
	const triggerCols = blueprint.triggers.map((tr) => ({ id: tr.id, label: t(tr.label) }));
	const vitalCols = blueprint.vitals.map((v) => ({ id: v.id, label: `${t(v.label)} (${v.unit})` }));

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
	for (let day = 1; day <= daysInMonth; day++) {
		const dayStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
		const dayDoc = monthDocs.find((d) => d.data.date === dayStr);
		const dateFormatted = new Date(year, month, day).toLocaleDateString(locale, {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		});

		const row: string[] = [dateFormatted];

		for (const col of symptomCols) {
			row.push(dayDoc?.data?.symptoms?.[col.id] ? '1' : '0');
		}
		for (const col of episodeCols) {
			const count = dayDoc?.data?.episodes?.[col.id] || dayDoc?.data?.seizures?.[col.id] || 0;
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
	link.download = `ciphra-${blueprint.conditionId}-${monthPrefix}.csv`;
	link.click();
	URL.revokeObjectURL(url);
}

// Use MM to silence unused-import warnings if tree-shaken later.
void MM;
