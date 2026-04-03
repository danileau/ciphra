/**
 * ciphra — PDF Report Generator
 * Generates a monthly grid PDF from decrypted data, driven by the active Blueprint.
 * Runs entirely in the browser — no data leaves the client.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Blueprint } from '$lib/blueprint';
import type { CiphraDocument } from '$lib/stores/documents';

export function generateMonthlyPdf(
	blueprint: Blueprint,
	documents: CiphraDocument[],
	year: number,
	month: number // 0-based
): void {
	const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
	const monthDocs = documents.filter(
		(d) => d.data.type === 'daily_log' && String(d.data.date || '').startsWith(monthPrefix)
	);
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const monthName = new Date(year, month).toLocaleDateString('de-CH', { month: 'long', year: 'numeric' });

	// Build column headers
	const symptomCols = blueprint.gridSymptomColumns;
	const episodeCols = blueprint.gridEpisodeColumns;

	const symptomLabels = symptomCols.map((id) => {
		for (const g of blueprint.symptomGroups) {
			const item = g.items.find((i) => i.id === id);
			if (item) return item.label;
		}
		return id;
	});
	const episodeLabels = episodeCols.map((id) => {
		const ep = blueprint.episodeTypes.find((e) => e.id === id);
		return ep ? ep.label : id;
	});

	const allHeaders = ['Tag', ...symptomLabels, ...episodeLabels, 'Notizen'];

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
	doc.text(`${blueprint.conditionLabel || blueprint.conditionId} · Monatsbericht`, 14, 22);
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
			fillColor: [99, 102, 241],
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
				data.cell.styles.textColor = [99, 102, 241];
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
		doc.text('ciphra — encrypted by design · Generiert im Browser, keine Daten übertragen', 14, pageHeight - 8);
		doc.text(`Seite ${i}/${pageCount}`, doc.internal.pageSize.getWidth() - 30, pageHeight - 8);
	}

	// Download
	const filename = `ciphra-${blueprint.conditionId}-${monthPrefix}.pdf`;
	doc.save(filename);
}
