/**
 * CIPH-876 — Monthly report grid auto-expands episode columns.
 *
 * The curated `bp.gridEpisodeColumns` always render (stable grid), plus any
 * non-curated `bp.episodeTypes` with ≥1 occurrence in the visible month.
 * Runtime behavior lives in `+page.svelte`; this test pins the contract so
 * the logic doesn't silently revert to curated-only.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(__dirname, '+page.svelte'), 'utf8');

describe('CIPH-876 effectiveEpisodeColumns', () => {
	it('defines the reactive effectiveEpisodeColumns computation', () => {
		expect(SOURCE).toContain('effectiveEpisodeColumns');
		expect(SOURCE).toMatch(/\$:\s*effectiveEpisodeColumns\s*=/);
	});

	it('seeds from bp.gridEpisodeColumns as the curated base', () => {
		expect(SOURCE).toMatch(/const curated[^\n]*bp\.gridEpisodeColumns/);
	});

	it('iterates bp.episodeTypes and appends types with month data', () => {
		expect(SOURCE).toMatch(/for \(const ep of bp\.episodeTypes\)/);
		expect(SOURCE).toMatch(/if \(hasData\) extras\.push\(ep\.id\)/);
	});

	it('scopes the data-check to the visible month prefix', () => {
		expect(SOURCE).toMatch(/startsWith\(prefix\)/);
		expect(SOURCE).toMatch(/currentDate\.slice\(0, 7\)/);
	});

	it('skips columns already in the curated set (no dupes)', () => {
		expect(SOURCE).toMatch(/if \(curatedSet\.has\(ep\.id\)\) continue/);
	});

	it('table header, body, tfoot and percent row all iterate effectiveEpisodeColumns', () => {
		const matches = SOURCE.match(/#each effectiveEpisodeColumns/g) || [];
		expect(matches.length).toBeGreaterThanOrEqual(4);
	});

	it('no template loop still references the raw bp.gridEpisodeColumns', () => {
		expect(SOURCE).not.toMatch(/#each bp\.gridEpisodeColumns/);
	});
});

describe('CIPH-877 effectiveSymptomColumns + grid scale', () => {
	it('defines the reactive effectiveSymptomColumns computation', () => {
		expect(SOURCE).toMatch(/\$:\s*effectiveSymptomColumns\s*=/);
	});

	it('iterates symptomGroups.items and appends entries with month data', () => {
		expect(SOURCE).toMatch(/for \(const g of bp\.symptomGroups\)/);
		expect(SOURCE).toMatch(/for \(const item of g\.items\)/);
		expect(SOURCE).toMatch(/symptoms\?\.\[item\.id\]/);
	});

	it('every table loop uses the effective list (no raw gridSymptomColumns)', () => {
		expect(SOURCE).not.toMatch(/#each bp\.gridSymptomColumns/);
		const matches = SOURCE.match(/#each effectiveSymptomColumns/g) || [];
		expect(matches.length).toBeGreaterThanOrEqual(4);
	});

	it('compact + ultra table classes fire past the column thresholds', () => {
		expect(SOURCE).toMatch(/grid-table--compact[^}]*>= 12/);
		expect(SOURCE).toMatch(/grid-table--ultra[^}]*>= 18/);
	});
});

describe('CIPH-885 auto-added column indicator', () => {
	it('derives autoAddedSymptomSet / autoAddedEpisodeSet reactively', () => {
		expect(SOURCE).toMatch(/\$:\s*autoAddedSymptomSet\s*=/);
		expect(SOURCE).toMatch(/\$:\s*autoAddedEpisodeSet\s*=/);
	});
	it('tags headers with rpt-col--auto for auto-added ids', () => {
		expect(SOURCE).toMatch(/class:rpt-col--auto=\{autoAddedSymptomSet\.has\(col\)\}/);
		expect(SOURCE).toMatch(/class:rpt-col--auto=\{autoAddedEpisodeSet\.has\(col\)\}/);
	});
	it('uses i18n tooltip reports.col_auto_tooltip', () => {
		expect(SOURCE).toMatch(/\$t\('reports\.col_auto_tooltip'\)/);
	});
});
