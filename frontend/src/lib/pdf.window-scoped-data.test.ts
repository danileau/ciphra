/**
 * Everything the doctor PDF shows must come from the window it claims.
 *
 * The generator was written when the anchor month was always the current
 * month, so "the focus month" and "the period this report covers" were the
 * same thing. The /reports period picker decoupled them, and four places
 * were left quietly reading a different period than the header names:
 *
 *   tileVitalLastValue      every document in the vault → a 2026 lab value
 *                           could appear on a calendar-2023 report, on page
 *                           1, in the doctor-glance row, undated
 *   rescueMedDays           the anchor month only, beside "days logged:
 *                           180/365"
 *   tileEpisodeDurationDist the anchor month only
 *   phaseTopDayCounts       the anchor month only
 *   episode-duration table  a trailing 12 months regardless of scope, so a
 *                           24-month report covered half of it
 *
 * These are source-shape assertions, which is normally a weak form. For
 * `pdf.ts` it is the practical one — the logic lives inside a ~2000-line
 * `generateDoctorPdf` of jsPDF draw calls with no extractable seam — and it
 * is the form the file's five existing test suites already use
 * (pdf.kpi-glance, pdf.cohort-accent, pdf-effective-columns, …). Behaviour
 * is verified against generated PDFs; these pin the shape so a future edit
 * cannot silently reintroduce an anchor-month read.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PDF = readFileSync(join(__dirname, 'pdf.ts'), 'utf8');

/** The window bounds every scoped read must use. */
const CLAMP = /ds\s*<\s*scopeStartISO\s*\|\|\s*ds\s*>\s*scopeEndISO/;

describe('page-1 tiles read the report window', () => {
	it('the vital last-value tile clamps to the window', () => {
		// Without this a "latest reading" is the latest in the whole vault.
		const tile = PDF.slice(PDF.indexOf('const tileVitalLastValue'));
		const body = tile.slice(0, tile.indexOf('readings.sort'));
		expect(body).toMatch(CLAMP);
	});

	it('rescue-med days counts the window, not the anchor month', () => {
		const block = PDF.slice(PDF.indexOf('const rescueMedDays'));
		const body = block.slice(0, block.indexOf('return days.size'));
		expect(body).toMatch(CLAMP);
		expect(body).not.toMatch(/startsWith\(focusPrefixForKpi\)/);
	});

	it('focusPrefixForKpi is gone entirely', () => {
		// It existed only to scope KPI tiles to the anchor month.
		expect(PDF).not.toContain('focusPrefixForKpi');
	});

	it('no KPI tile aggregates over focusMonthDocs', () => {
		// `monthDocs` is the window-scoped set and equals focusMonthDocs on
		// month scope, so it is correct for every scope.
		expect(PDF).not.toMatch(/for \(const d of focusMonthDocs\)/);
	});
});

describe('sections read the report window', () => {
	it('the episode-duration table follows the report window', () => {
		expect(PDF).toContain('const windowDurDocs');
		const block = PDF.slice(PDF.indexOf('const windowDurDocs'));
		const body = block.slice(0, block.indexOf('});'));
		expect(body).toMatch(/ds\s*>=\s*scopeStartISO\s*&&\s*ds\s*<=\s*scopeEndISO/);
	});

	it('the hand-rolled trailing-12 window is gone', () => {
		// dur12Start/dur12End derived their own 12 months from the anchor,
		// independent of scope.
		expect(PDF).not.toContain('dur12Start');
		expect(PDF).not.toContain('dur12End');
		expect(PDF).not.toContain('last12mDocs');
	});

	it('the duration heading names the report window', () => {
		expect(PDF).toMatch(
			/pdf\.episode_duration_title_range'?,\s*\{\s*range:\s*windowLabel\s*\}/,
		);
	});
});

describe('the focus month survives where it is genuinely the subject', () => {
	it('phase distribution still receives the anchor month', () => {
		// It is a one-month visualisation and names its month in the title
		// (`pdf.phase_distribution_title` takes {month}), so it is honest.
		expect(PDF).toMatch(/drawPhaseDistribution\(\s*[\s\S]{0,120}focusMonthDocs/);
	});

	it('month-scope docs still resolve to the focus month', () => {
		expect(PDF).toMatch(/let monthDocs: CiphraDocument\[\] = focusMonthDocs/);
	});
});
