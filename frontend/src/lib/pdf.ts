/**
 * ciphra — PDF Report Generator
 * Generates monthly PDF reports from decrypted data, driven by the active Blueprint.
 * Two report types:
 *   - Grid: detailed protocol grid for doctors
 *   - Analytics: visual summary with stats, charts, and tables
 * Runs entirely in the browser — no data leaves the client.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Blueprint } from '$lib/blueprint';
import type { CiphraDocument } from '$lib/stores/documents';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

/* ────────────────────────────────────────────────────────────────
 * Grid Report (formerly generateMonthlyPdf)
 * ──────────────────────────────────────────────────────────────── */

export function generateGridPdf(
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
	const monthName = new Date(year, month).toLocaleDateString(locale, { month: 'long', year: 'numeric' });

	// Build column headers
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

	// Build rows
	const rows: string[][] = [];
	const symptomSums = new Array(symptomCols.length).fill(0);
	const episodeSums = new Array(episodeCols.length).fill(0);

	for (let day = 1; day <= daysInMonth; day++) {
		const dayStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
		const doc = monthDocs.find((d) => d.data.date === dayStr);
		const row: string[] = [String(day)];

		symptomCols.forEach((col, i) => {
			const active = doc?.data?.symptoms?.[col] || false;
			row.push(active ? '✓' : '');
			if (active) symptomSums[i]++;
		});

		episodeCols.forEach((col, i) => {
			const count = doc?.data?.episodes?.[col] || doc?.data?.seizures?.[col] || 0;
			row.push(count > 0 ? String(count) : '');
			episodeSums[i] += count;
		});

		const notes = String(doc?.data?.notes || '').slice(0, 40);
		row.push(notes);
		rows.push(row);
	}

	// Sum row
	const sumRow: string[] = ['Σ'];
	symptomSums.forEach((s) => sumRow.push(String(s)));
	episodeSums.forEach((s) => sumRow.push(String(s)));
	sumRow.push('');
	rows.push(sumRow);

	// Percent row
	const pctRow: string[] = ['%'];
	symptomSums.forEach((s) => pctRow.push(`${Math.round((s / daysInMonth) * 100)}%`));
	episodeSums.forEach(() => pctRow.push(''));
	pctRow.push('');
	rows.push(pctRow);

	// Generate PDF
	const doc = new jsPDF({
		orientation: allHeaders.length > 8 ? 'landscape' : 'portrait',
		unit: 'mm',
		format: 'a4'
	});

	// Title
	doc.setFontSize(16);
	doc.text(`ciphra — ${monthName}`, 14, 15);
	doc.setFontSize(10);
	doc.setTextColor(120);
	doc.text(`${blueprint.conditionLabel ? t(blueprint.conditionLabel) : blueprint.conditionId} · ${t('pdf.monthly_report')}`, 14, 22);
	doc.setTextColor(0);

	// Table
	autoTable(doc, {
		startY: 28,
		head: [allHeaders],
		body: rows,
		styles: {
			fontSize: 7,
			cellPadding: 1.5,
			lineColor: [200, 200, 200],
			lineWidth: 0.1,
		},
		headStyles: {
			fillColor: [13, 148, 136],
			textColor: 255,
			fontStyle: 'bold',
			fontSize: 7,
		},
		columnStyles: {
			0: { cellWidth: 10, fontStyle: 'bold' },
		},
		didParseCell: (data: any) => {
			// Highlight sum/percent rows
			const rowIdx = data.row.index;
			if (rowIdx >= daysInMonth) {
				data.cell.styles.fillColor = [245, 245, 245];
				data.cell.styles.fontStyle = 'bold';
			}
			// Highlight checkmarks
			if (data.cell.raw === '✓') {
				data.cell.styles.textColor = [13, 148, 136];
				data.cell.styles.fontStyle = 'bold';
			}
			// Highlight episode counts
			const colIdx = data.column.index;
			if (colIdx > symptomCols.length && colIdx <= symptomCols.length + episodeCols.length) {
				const val = Number(data.cell.raw);
				if (val > 0) {
					data.cell.styles.textColor = [220, 38, 38];
					data.cell.styles.fontStyle = 'bold';
				}
			}
		},
	});

	// Footer
	const pageCount = doc.getNumberOfPages();
	for (let i = 1; i <= pageCount; i++) {
		doc.setPage(i);
		doc.setFontSize(7);
		doc.setTextColor(180);
		const pageHeight = doc.internal.pageSize.getHeight();
		doc.text(t('pdf.footer'), 14, pageHeight - 8);
		doc.text(t('pdf.page', { current: i, total: pageCount }), doc.internal.pageSize.getWidth() - 30, pageHeight - 8);
	}

	// Download
	const filename = `ciphra-${blueprint.conditionId}-${monthPrefix}.pdf`;
	doc.save(filename);
}

/* ────────────────────────────────────────────────────────────────
 * Analytics Report
 * ──────────────────────────────────────────────────────────────── */

export function generateAnalyticsPdf(
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
	const monthName = new Date(year, month).toLocaleDateString(locale, { month: 'long', year: 'numeric' });

	// ── Compute previous month data for comparison ──
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
	const pageWidth = doc.internal.pageSize.getWidth();

	// ── Title ──
	doc.setFontSize(18);
	doc.setTextColor(0);
	doc.text(t('pdf.analytics_title'), 14, 16);
	doc.setFontSize(11);
	doc.setTextColor(13, 148, 136);
	doc.text(monthName, 14, 23);
	doc.setFontSize(10);
	doc.setTextColor(120);
	doc.text(`${blueprint.conditionLabel ? t(blueprint.conditionLabel) : blueprint.conditionId} · ${t('pdf.monthly_report')}`, 14, 29);
	doc.setTextColor(0);

	// ── Compute stats ──
	const daysLogged = monthDocs.length;

	// Episodes per day
	const episodeCols = blueprint.gridEpisodeColumns;
	const dailyEpisodes: number[] = [];          // index 0 = day 1
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

	// Episode-free streak at end of month
	let streakEnd = 0;
	for (let i = daysInMonth - 1; i >= 0; i--) {
		if (dailyEpisodes[i] === 0) streakEnd++;
		else break;
	}

	// Symptom frequencies
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

	const mostFrequentSymptom = symptomFreq.length > 0 ? symptomFreq[0] : null;

	// ── Clinical summary line ──
	const topPct = mostFrequentSymptom && daysInMonth > 0 ? Math.round((mostFrequentSymptom.count / daysInMonth) * 100) : 0;

	const summaryText = t('pdf.clinical_summary', {
		month: monthName,
		episodes: totalEpisodes,
		daysLogged,
		daysInMonth,
		topSymptom: mostFrequentSymptom ? mostFrequentSymptom.label : '—',
		topPct,
	});

	doc.setFontSize(9);
	doc.setTextColor(100);
	doc.text(summaryText, 14, 34);
	doc.setTextColor(0);

	// ── Summary stats box ──
	const boxY = 39;
	const boxH = 28;
	const boxW = pageWidth - 28;
	doc.setDrawColor(200, 200, 200);
	doc.setFillColor(249, 250, 251);
	doc.roundedRect(14, boxY, boxW, boxH, 3, 3, 'FD');

	const colW = boxW / 4;
	const statY = boxY + 10;
	const valY = boxY + 19;

	const stats = [
		{ label: t('pdf.days_logged'), value: `${daysLogged} / ${daysInMonth}` },
		{ label: t('pdf.total_episodes'), value: String(totalEpisodes) },
		{ label: t('pdf.most_frequent_symptom'), value: mostFrequentSymptom ? `${mostFrequentSymptom.label} (${mostFrequentSymptom.count})` : '—' },
		{ label: t('pdf.episode_free_streak'), value: `${streakEnd} ${t('common.days')}` },
	];

	doc.setFontSize(8);
	doc.setTextColor(120);
	stats.forEach((s, i) => {
		const x = 14 + colW * i + colW / 2;
		doc.text(s.label, x, statY, { align: 'center' });
		doc.setFontSize(13);
		doc.setTextColor(0);
		doc.text(s.value, x, valY, { align: 'center' });
		doc.setFontSize(8);
		doc.setTextColor(120);
	});

	// ── Month-over-month comparison ──
	let prevTotalEpisodes = 0;
	for (let day = 1; day <= prevDaysInMonth; day++) {
		const dayStr = `${prevMonthPrefix}-${String(day).padStart(2, '0')}`;
		const dayDoc = prevMonthDocs.find((d) => d.data.date === dayStr);
		for (const col of episodeCols) {
			prevTotalEpisodes += dayDoc?.data?.episodes?.[col] || dayDoc?.data?.seizures?.[col] || 0;
		}
	}

	const episodeChange = totalEpisodes - prevTotalEpisodes;
	const daysChange = daysLogged - prevDaysLogged;
	const episodeChangeStr = (episodeChange >= 0 ? '+' : '') + episodeChange;
	const daysChangeStr = (daysChange >= 0 ? '+' : '') + daysChange;

	const compY = boxY + boxH + 3;
	doc.setFontSize(8);
	doc.setTextColor(120);
	const compText = `${t('pdf.vs_previous')}: ${t('pdf.episodes_change', { change: episodeChangeStr })} · ${t('pdf.days_change', { change: daysChangeStr })}`;
	doc.text(compText, 14, compY);
	doc.setTextColor(0);

	// ── Episode trend bar chart ──
	let cursorY = compY + 8;

	doc.setFontSize(11);
	doc.setTextColor(0);
	doc.text(t('pdf.episode_trend'), 14, cursorY);
	cursorY += 4;

	const chartX = 14;
	const chartW = pageWidth - 28;
	const chartH = 40;
	const maxEpisodes = Math.max(...dailyEpisodes, 1);

	// Y-axis scale
	doc.setFontSize(6);
	doc.setTextColor(150);
	doc.text(String(maxEpisodes), chartX - 1, cursorY + 2, { align: 'right' });
	doc.text('0', chartX - 1, cursorY + chartH, { align: 'right' });

	// Chart background
	doc.setDrawColor(230, 230, 230);
	doc.setLineWidth(0.1);
	doc.line(chartX, cursorY, chartX + chartW, cursorY);                      // top
	doc.line(chartX, cursorY + chartH, chartX + chartW, cursorY + chartH);    // bottom

	// Bars
	const barGap = 1;
	const barW = Math.max((chartW - barGap * daysInMonth) / daysInMonth, 2);
	const episodeColors: [number, number, number][] = blueprint.episodeTypes.map((ep) => {
		const hex = ep.color.replace('#', '');
		return [
			parseInt(hex.substring(0, 2), 16),
			parseInt(hex.substring(2, 4), 16),
			parseInt(hex.substring(4, 6), 16),
		] as [number, number, number];
	});
	const defaultBarColor: [number, number, number] = [220, 38, 38]; // red

	for (let i = 0; i < daysInMonth; i++) {
		const count = dailyEpisodes[i];
		if (count === 0) continue;
		const barH = (count / maxEpisodes) * chartH;
		const x = chartX + i * (barW + barGap);
		const y = cursorY + chartH - barH;

		// Stack bars per episode type with their own colors
		let stackY = cursorY + chartH;
		let drawn = false;
		for (let ei = 0; ei < episodeCols.length; ei++) {
			const dayStr = `${monthPrefix}-${String(i + 1).padStart(2, '0')}`;
			const dayDoc = monthDocs.find((d) => d.data.date === dayStr);
			const epCount = dayDoc?.data?.episodes?.[episodeCols[ei]] || dayDoc?.data?.seizures?.[episodeCols[ei]] || 0;
			if (epCount === 0) continue;
			const segH = (epCount / maxEpisodes) * chartH;
			const color = episodeColors[ei] || defaultBarColor;
			doc.setFillColor(color[0], color[1], color[2]);
			doc.rect(x, stackY - segH, barW, segH, 'F');
			stackY -= segH;
			drawn = true;
		}
		// Fallback if no per-type breakdown resolved
		if (!drawn) {
			doc.setFillColor(defaultBarColor[0], defaultBarColor[1], defaultBarColor[2]);
			doc.rect(x, y, barW, barH, 'F');
		}
	}

	// X-axis day labels (every 5th day + 1 and last)
	doc.setFontSize(5);
	doc.setTextColor(150);
	for (let i = 0; i < daysInMonth; i++) {
		const dayNum = i + 1;
		if (dayNum === 1 || dayNum % 5 === 0 || dayNum === daysInMonth) {
			const x = chartX + i * (barW + barGap) + barW / 2;
			doc.text(String(dayNum), x, cursorY + chartH + 4, { align: 'center' });
		}
	}

	cursorY += chartH + 12;

	// ── Symptom frequency table ──
	doc.setFontSize(11);
	doc.setTextColor(0);
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
			styles: { fontSize: 8, cellPadding: 2, lineColor: [220, 220, 220], lineWidth: 0.1 },
			headStyles: { fillColor: [13, 148, 136], textColor: 255, fontStyle: 'bold', fontSize: 8 },
			columnStyles: {
				0: { cellWidth: 80 },
				1: { cellWidth: 25, halign: 'center' },
				2: { cellWidth: 25, halign: 'center' },
			},
			didParseCell: (data: any) => {
				// Tint high-frequency rows
				if (data.section === 'body' && data.column.index === 2) {
					const pct = parseInt(data.cell.raw as string);
					if (pct >= 50) {
						data.cell.styles.textColor = [13, 148, 136];
						data.cell.styles.fontStyle = 'bold';
					}
				}
			},
		});
		cursorY = (doc as any).lastAutoTable?.finalY ?? cursorY + 10;
		cursorY += 8;
	} else {
		cursorY += 6;
		doc.setFontSize(8);
		doc.setTextColor(150);
		doc.text(t('pdf.no_symptoms'), 14, cursorY);
		cursorY += 8;
	}

	// ── Medication adherence ──
	if (blueprint.medications.length > 0) {
		// Check if we need a new page
		if (cursorY > doc.internal.pageSize.getHeight() - 50) {
			doc.addPage();
			cursorY = 20;
		}

		doc.setFontSize(11);
		doc.setTextColor(0);
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
			styles: { fontSize: 8, cellPadding: 2, lineColor: [220, 220, 220], lineWidth: 0.1 },
			headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold', fontSize: 8 },
			columnStyles: {
				2: { halign: 'center' },
				3: { halign: 'center' },
			},
			didParseCell: (data: any) => {
				if (data.section === 'body' && data.column.index === 3) {
					const pct = parseInt(data.cell.raw as string);
					if (pct < 80) {
						data.cell.styles.textColor = [220, 38, 38];
						data.cell.styles.fontStyle = 'bold';
					} else {
						data.cell.styles.textColor = [16, 185, 129];
					}
				}
			},
		});
	}

	// ── Footer on every page ──
	const pageCount = doc.getNumberOfPages();
	for (let i = 1; i <= pageCount; i++) {
		doc.setPage(i);
		doc.setFontSize(7);
		doc.setTextColor(180);
		const pageHeight = doc.internal.pageSize.getHeight();
		doc.text(t('pdf.footer'), 14, pageHeight - 8);
		doc.text(t('pdf.page', { current: i, total: pageCount }), pageWidth - 30, pageHeight - 8);
	}

	// Download
	const filename = `ciphra-analyse-${blueprint.conditionId}-${monthPrefix}.pdf`;
	doc.save(filename);
}

/* ────────────────────────────────────────────────────────────────
 * CSV Export
 * ──────────────────────────────────────────────────────────────── */

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

	// Collect column definitions
	const symptomCols: { id: string; label: string }[] = [];
	for (const g of blueprint.symptomGroups) {
		for (const item of g.items) {
			symptomCols.push({ id: item.id, label: t(item.label) });
		}
	}
	const episodeCols = blueprint.episodeTypes.map((ep) => ({
		id: ep.id,
		label: t(ep.label),
	}));
	const triggerCols = blueprint.triggers.map((tr) => ({
		id: tr.id,
		label: t(tr.label),
	}));
	const vitalCols = blueprint.vitals.map((v) => ({
		id: v.id,
		label: `${t(v.label)} (${v.unit})`,
	}));

	// Episode detail columns (duration + time for types that track them)
	const episodeDetailCols: { id: string; type: 'time' | 'duration'; label: string }[] = [];
	for (const ep of blueprint.episodeTypes) {
		if (ep.trackTimeOfDay) {
			episodeDetailCols.push({ id: ep.id, type: 'time', label: `${t(ep.label)} — ${t('protocol.time_of_day')}` });
		}
		if (ep.trackDuration) {
			episodeDetailCols.push({ id: ep.id, type: 'duration', label: `${t(ep.label)} — ${t('protocol.duration')}` });
		}
	}

	// Build header row
	const headers = [
		'date',
		...symptomCols.map((c) => c.label),
		...episodeCols.map((c) => c.label),
		...episodeDetailCols.map((c) => c.label),
		...triggerCols.map((c) => c.label),
		...vitalCols.map((c) => c.label),
		t('pdf.notes'),
	];

	// Build data rows
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

		// Symptoms (0/1)
		for (const col of symptomCols) {
			row.push(dayDoc?.data?.symptoms?.[col.id] ? '1' : '0');
		}

		// Episodes (counts)
		for (const col of episodeCols) {
			const count = dayDoc?.data?.episodes?.[col.id] || dayDoc?.data?.seizures?.[col.id] || 0;
			row.push(String(count));
		}

		// Episode details (time + duration)
		for (const col of episodeDetailCols) {
			if (col.type === 'time') {
				row.push(dayDoc?.data?.episodeTimes?.[col.id] || '');
			} else {
				row.push(dayDoc?.data?.episodeDurations?.[col.id] || '');
			}
		}

		// Triggers (0/1)
		for (const col of triggerCols) {
			row.push(dayDoc?.data?.triggers?.[col.id] ? '1' : '0');
		}

		// Vitals (values)
		for (const col of vitalCols) {
			const val = dayDoc?.data?.vitals?.[col.id];
			row.push(val != null ? String(val) : '');
		}

		// Notes (quoted)
		const notes = String(dayDoc?.data?.notes || '');
		row.push(notes);

		rows.push(row);
	}

	// Encode CSV
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

	// Trigger download
	const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = `ciphra-${blueprint.conditionId}-${monthPrefix}.csv`;
	link.click();
	URL.revokeObjectURL(url);
}
