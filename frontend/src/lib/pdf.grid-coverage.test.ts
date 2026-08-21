/**
 * Empty monthly grids are omitted — and the omission is declared on page 1.
 *
 * A year export used to append one landscape page per month unconditionally.
 * For a user with a single logged day that meant **13 pages, 11 of them
 * blank**: 28 empty rows under a green totals bar reading `0 · 0 · 0` and a
 * `% of days: 0%` row.
 *
 * That is a coverage judgement — precisely what components/README.md forbids
 * the no-gaslight dashboard card from showing — printed once per empty month
 * and handed to a doctor. "0 days logged" eleven times is not documentation,
 * it is a verdict on the person.
 *
 * But omitting silently is its own defect, and the more dangerous one: a
 * reader who finds February and April but no March concludes a page was lost
 * in the fax. Silence converts a deliberate omission into apparent missing
 * data. So the two halves are inseparable — skipping is only permitted
 * BECAUSE page 1 declares it, and the guard treats them as one contract.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import de from '$lib/i18n/de';
import en from '$lib/i18n/en';
import fr from '$lib/i18n/fr';
import itDict from '$lib/i18n/it';

const PDF = readFileSync(join(__dirname, 'pdf.ts'), 'utf8');
const DICTS: Array<[string, Record<string, string>]> = [
	['de', de], ['en', en], ['fr', fr], ['it', itDict],
];

describe('empty monthly grids are skipped', () => {
	it('the grid loop skips a month with no entries', () => {
		expect(PDF).toMatch(/for \(const gm of gridMonths\) \{\s*\n\s*if \(!monthHasEntries\(gm\.y, gm\.m\)\) continue;/);
	});

	it('"has entries" means ENTRY documents, matching what the grid renders', () => {
		// drawGridSection filters on `type === 'entry'`, so note markers and
		// medication events never reach those pages. Any looser predicate here
		// would keep a page that draws nothing.
		const fn = PDF.slice(PDF.indexOf('function monthHasEntries'));
		const body = fn.slice(0, fn.indexOf('\n\t}'));
		expect(body).toMatch(/type === 'entry'/);
		expect(body).toMatch(/startsWith\(prefix\)/);
	});
});

describe('the omission is declared on page 1', () => {
	it('page 1 renders the coverage note', () => {
		expect(PDF).toContain("t('pdf.grid_coverage_note'");
	});

	it('it is declared before the grids are appended, not after', () => {
		// A note that appears only in the appendix is no use to a reader who
		// is missing the appendix.
		expect(PDF.indexOf("pdf.grid_coverage_note")).toBeLessThan(
			PDF.indexOf('for (const gm of gridMonths)'),
		);
	});

	it('it states both halves — how many have data, and out of how many', () => {
		// "1 of 12" lets the reader check what they hold against what exists.
		// A bare count of omitted months would not.
		const idx = PDF.indexOf("t('pdf.grid_coverage_note'");
		const call = PDF.slice(idx, idx + 220);
		expect(call).toMatch(/withData:/);
		expect(call).toMatch(/total:/);
	});

	it('is rendered only when something is actually omitted', () => {
		// With nothing to declare, the line would be noise on the page with
		// the least room for it.
		const idx = PDF.indexOf('const gridTotal = gridMonths.length');
		expect(idx).toBeGreaterThan(0);
		expect(PDF.slice(idx, idx + 400)).toMatch(/gridWithData < gridTotal/);
	});

	for (const [name, dict] of DICTS) {
		it(`${name}: the note carries both placeholders exactly once`, () => {
			const v = dict['pdf.grid_coverage_note'];
			expect(v, `${name}: string missing`).toBeTruthy();
			// Substitution is single-pass, first-occurrence-only (i18n/index.ts)
			// — a repeated placeholder would print literally.
			expect(v.match(/\{withData\}/g), `${name}: {withData}`).toHaveLength(1);
			expect(v.match(/\{total\}/g), `${name}: {total}`).toHaveLength(1);
		});

		it(`${name}: it says the missing months are not printed, not that data is missing`, () => {
			// The reader must understand a gap as an editorial choice about
			// blank pages, never as absent records.
			const v = dict['pdf.grid_coverage_note'];
			expect(v).toMatch(/nicht abgedruckt|not printed|pas imprimés|non vengono stampati/i);
		});
	}
});
