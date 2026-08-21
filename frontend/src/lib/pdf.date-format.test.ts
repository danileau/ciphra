/**
 * The exported documents honour the user's chosen date format.
 *
 * `Blueprint.dateFormat` offers four choices — `dd.mm.yyyy`, `dd/mm/yyyy`,
 * `iso`, `us` — and the app applies them on `/reports` and in the vital-trend
 * tooltips. The PDF and the CSV applied none of them: every date went through
 * `toLocaleDateString`, so an explicit setting was silently overridden on the
 * one artefact that leaves the device and gets handed to someone else.
 *
 * The formatter existed three times before this — in VitalTrendReportsCard, in
 * routes/reports, and as a `sampleDate` in settings that showed the user a
 * preview of a format the rest of the app then re-implemented. Now once, in
 * blueprint/preferences.ts, next to the setting it reads.
 *
 * SCOPE. Day-precision dates only. `dateFormat` has no month-precision
 * variant, so month-and-year labels — the report window, chart axes, monthly
 * grid titles — keep locale formatting. There is no user choice to honour
 * there, and forcing one would produce "08.2026" where "Aug 2026" belongs.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PDF = readFileSync(join(__dirname, 'pdf.ts'), 'utf8');

describe('day-precision dates follow the setting', () => {
	it('pdf.ts imports the canonical formatter rather than rolling its own', () => {
		expect(PDF).toContain("from '$lib/blueprint/preferences'");
		expect(PDF).toMatch(/formatDateChoice/);
		expect(PDF).toMatch(/formatISODateChoice/);
	});

	const SITES: Array<[string, RegExp]> = [
		['page-1 and grid export date', /const exportDate = formatDateChoice\(new Date\(\), blueprint\.dateFormat\)/],
		// The patient top-line quote was removed 2026-08-21 (it reproduced one
		// arbitrary sentence at the top of a clinical document, chosen by the
		// generator rather than by the patient), so its date site is gone with
		// it. Recorded rather than silently dropped: if the quote ever returns,
		// it needs this line back.
		['cycle anchor', /const dateLabel = formatISODateChoice\(anchorDate, blueprint\.dateFormat\)/],
		['note-marker list', /formatISODateChoice\(e\.dateISO, blueprint\.dateFormat\)/],
		['CSV date column', /const dateFormatted = formatDateChoice\(cur, blueprint\.dateFormat\)/],
	];
	for (const [name, re] of SITES) {
		it(`${name} uses the chosen format`, () => {
			expect(PDF, `${name} still formats by locale`).toMatch(re);
		});
	}

	it('no day-precision date is left on toLocaleDateString in the doctor PDF', () => {
		// The two survivors are deliberate: generateRecoveryPdf and
		// generateFamilyInvitePdf receive no blueprint — the recovery sheet is
		// produced at signup, before one exists — so there is no setting to
		// read. Everything before them must be converted.
		const upTo = PDF.slice(0, PDF.indexOf('export function generateRecoveryPdf'));
		const dayPrecision = upTo.match(/day:\s*'(2-digit|numeric)'/g) ?? [];
		expect(
			dayPrecision,
			'a day-precision toLocaleDateString remains in the doctor PDF',
		).toEqual([]);
	});
});

describe('month-precision labels are deliberately left alone', () => {
	it('the report window still uses month names', () => {
		// formatWindowRange lives in reports/reportWindow.ts and renders
		// "Jan 2023 – Dez 2023". `dateFormat` has no month-only variant;
		// applying it would give "01.2023 – 12.2023".
		expect(PDF).toMatch(/formatWindowRange\(win, locale\)/);
	});

	it('the monthly grid title still uses the locale month name', () => {
		expect(PDF).toMatch(
			/const monthName = new Date\(year, month\)\.toLocaleDateString\(locale, \{\s*month: 'long',\s*year: 'numeric',\s*\}\)/,
		);
	});
});
