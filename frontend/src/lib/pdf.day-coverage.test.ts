/**
 * CIPH-pi19-2 — Day-coverage strip contract.
 *
 * Source-grep tests pin the helper's responsibilities:
 * - 31-cell horizontal layout sized for 182mm content width
 * - O(N+D) bucketing (no per-cell .find() over monthDocs)
 * - Cohort-tinted body via softBlendRgb(acc.primary, ...)
 * - Universal mark colours (BRAND.ochre triangle, BRAND.brick bar) so
 *   the calendar↔PDF clinical-mark vocabulary stays identical
 * - Empty-day hairline so position is preserved on silent months
 * - Section title key wired in all 4 locales
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PDF = readFileSync(join(__dirname, 'pdf.ts'), 'utf8');

describe('CIPH-pi19-2 drawDayCoverageStrip helper', () => {
	it('is hoisted as a standalone function (not inlined in generateDoctorPdf)', () => {
		expect(PDF).toMatch(/^function drawDayCoverageStrip\(/m);
	});

	it('takes both focus-month entries AND allDocs (rescue events)', () => {
		// allDocs is required because rescue meds are event docs, not entries.
		expect(PDF).toMatch(
			/function drawDayCoverageStrip\([\s\S]*?focusMonthEntries:\s*CiphraDocument\[\][\s\S]*?allDocs:\s*CiphraDocument\[\]/,
		);
	});

	it('returns the post-strip cursorY (caller can chain)', () => {
		expect(PDF).toMatch(/function drawDayCoverageStrip\([\s\S]*?\):\s*number/);
	});

	it('cell width derives from daysInMonth (28-31 days fit the 182mm strip)', () => {
		expect(PDF).toMatch(
			/cellW\s*=\s*\(stripW\s*-\s*\(daysInMonth\s*-\s*1\)\s*\*\s*cellGap\)\s*\/\s*daysInMonth/,
		);
	});
});

describe('CIPH-pi19-2 O(N+D) bucketing — no per-cell scan', () => {
	it('builds triggerByDay + symptomCountByDay Maps from focus-month entries', () => {
		expect(PDF).toMatch(/const triggerByDay = new Map<string, number>\(\)/);
		expect(PDF).toMatch(/const symptomCountByDay = new Map<string, number>\(\)/);
	});

	it('builds rescueByDay Map from allDocs filtered by kind === medication', () => {
		expect(PDF).toMatch(/const rescueByDay = new Map<string, number>\(\)/);
		expect(PDF).toMatch(/d\.data\.type\s*!==\s*'event'\s*\|\|\s*\(d\.data as Record<string, unknown>\)\.kind\s*!==\s*'medication'/);
	});

	it('strip-render loop reads from the maps via O(1) lookups, not .find()', () => {
		const fn = PDF.match(/function drawDayCoverageStrip\(([\s\S]*?)\n\}\n\n\/\*/);
		expect(fn, 'expected drawDayCoverageStrip body').toBeTruthy();
		expect(fn![0]).not.toMatch(/focusMonthEntries\.find\(/);
		expect(fn![0]).toMatch(/triggerByDay\.get\(ds\)/);
		expect(fn![0]).toMatch(/rescueByDay\.get\(ds\)/);
	});
});

describe('CIPH-pi19-2 calendar↔PDF mark vocabulary stays identical', () => {
	it('cell BODY uses cohort-tinted softBlend over acc.primary', () => {
		// acc.primary is the cohort-driven primary tone; softBlendRgb
		// produces the per-cell α-blended fill.
		expect(PDF).toMatch(/softBlendRgb\(acc\.primary,\s*fillAlpha\)/);
	});

	it('trigger triangle uses universal BRAND.ochre (calendar parity)', () => {
		// Marks are clinical signals, not data accents — they stay
		// universal across cohorts so the cell's vocabulary is one
		// thing across every surface.
		expect(PDF).toMatch(
			/triggerByDay\.get\(ds\)[\s\S]{0,200}setFillColor\(\.\.\.BRAND\.ochre\)/,
		);
	});

	it('rescue-med edge bar uses universal BRAND.brick (calendar parity)', () => {
		expect(PDF).toMatch(
			/rescueByDay\.get\(ds\)[\s\S]{0,200}setFillColor\(\.\.\.BRAND\.brick\)/,
		);
	});

	it('rescue-med bar height: 1 dose = half-height, ≥2 doses = full', () => {
		expect(PDF).toMatch(/barH\s*=\s*rescueN\s*===\s*1\s*\?\s*cellH\s*\*\s*0\.5\s*:\s*cellH/);
	});
});

describe('CIPH-pi19-2 empty-day hairline + readability defaults', () => {
	it('empty cells render a borderSubtle hairline so position is preserved', () => {
		expect(PDF).toMatch(
			/fillAlpha\s*>\s*0[\s\S]{0,400}else\s*\{[\s\S]{0,200}setDrawColor\(\.\.\.BRAND\.borderSubtle\)/,
		);
	});

	it('day number is helvetica 5.5pt textPrimary', () => {
		expect(PDF).toMatch(/setFontSize\(5\.5\)[\s\S]{0,80}setTextColor\(\.\.\.BRAND\.textPrimary\)[\s\S]{0,80}text\(String\(day\)/);
	});
});

describe('CIPH-pi19-2 wired into generateDoctorPdf', () => {
	it('called from generateDoctorPdf with focusMonthDocs + documents', () => {
		expect(PDF).toMatch(
			/cursorY\s*=\s*drawDayCoverageStrip\(\s*\n[\s\S]{0,300}focusMonthDocs[\s\S]{0,200}documents/,
		);
	});

	it('placement: after KPI glance, before the trajectory if-block', () => {
		// Story 1 placed the strip after the legacy 2×2 stat-card block;
		// Story 2 (CIPH-pi19-3) replaced that block with the 4-tile KPI
		// glance. The strip's invariant is "after the tiles, before the
		// trajectory block" — pinned by the `cursorY += tileH + 6` line
		// that ends the KPI glance.
		const callSite = PDF.match(
			/cursorY \+= tileH \+ 6;[\s\S]{0,800}drawDayCoverageStrip[\s\S]{0,1500}Trajectory metadata/,
		);
		expect(callSite, 'expected placement after KPI glance, before trajectory block').toBeTruthy();
	});
});

describe('CIPH-pi19-2 i18n', () => {
	for (const locale of ['de', 'en', 'fr', 'it']) {
		it(`${locale}: pdf.day_coverage_title present + references {month}`, async () => {
			const mod = await import(`./i18n/${locale}`);
			const dict = mod.default as Record<string, string>;
			expect(dict['pdf.day_coverage_title'], `${locale} missing key`).toBeTruthy();
			expect(dict['pdf.day_coverage_title']).toMatch(/\{month\}/);
		});
	}
});
