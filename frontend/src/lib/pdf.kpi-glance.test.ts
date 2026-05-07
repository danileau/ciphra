/**
 * CIPH-pi19-3 — 4-tile KPI glance contract.
 *
 * Replaces the legacy 2×2 stat-card grid + separate "Comparison
 * deltas" block with a single 1×4 row of cohort-driven tiles. Tiles
 * carry an optional delta sub-line so the comparison vocabulary
 * lives where the headline number lives.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PDF = readFileSync(join(__dirname, 'pdf.ts'), 'utf8');

describe('CIPH-pi19-3 drawStatCard delta sub-line', () => {
	it('exposes a StatCardDelta interface with sign / value / semantic', () => {
		expect(PDF).toMatch(/interface StatCardDelta\s*\{[\s\S]{0,300}sign:\s*'\+'\s*\|\s*'-'\s*\|\s*'='/);
		expect(PDF).toMatch(/interface StatCardDelta\s*\{[\s\S]{0,300}semantic:\s*'good'\s*\|\s*'bad'\s*\|\s*'neutral'/);
	});

	it('drawStatCard accepts optional delta param + lifts value when present', () => {
		expect(PDF).toMatch(/function drawStatCard\([\s\S]{0,400}delta\?:\s*StatCardDelta/);
		// Without delta: value baseline at h-4.5 (legacy). With delta: h-9.
		expect(PDF).toMatch(/valBaseline\s*=\s*delta\s*\?\s*y\s*\+\s*h\s*-\s*9\s*:\s*y\s*\+\s*h\s*-\s*4\.5/);
	});

	it('delta semantic maps to olive (good) / brick (bad) / textMuted (neutral)', () => {
		expect(PDF).toMatch(
			/semantic\s*===\s*'good'[\s\S]{0,80}BRAND\.olive[\s\S]{0,200}semantic\s*===\s*'bad'[\s\S]{0,80}BRAND\.brick/,
		);
	});
});

describe('CIPH-pi19-3 KPI glance layout (1 row × 4 tiles)', () => {
	it('drops the legacy 2×2 cardW math (col % 2, row, 2× cardH)', () => {
		// The old layout looped i % 2 + Math.floor(i/2) — that pattern
		// must no longer exist in the tile-rendering path.
		expect(PDF).not.toMatch(/const col = i % 2;\s*\n\s*const row = Math\.floor\(i \/ 2\)/);
	});

	it('tile width = (pageW - 28 - 3*tileGap) / 4', () => {
		expect(PDF).toMatch(/tileW\s*=\s*\(pageW\s*-\s*28\s*-\s*3\s*\*\s*tileGap\)\s*\/\s*4/);
	});

	it('tile height is 22mm (memo §6 geometry)', () => {
		expect(PDF).toMatch(/const tileH\s*=\s*22/);
	});

	it('drops the separate "Comparison deltas" block', () => {
		// The old block printed "Compared to prev" + drawDelta() helper.
		expect(PDF).not.toMatch(/const drawDelta = \(x: number, label: string, delta: number, invertGood/);
		expect(PDF).not.toMatch(/pdf\.compared_to_prev'\)/);
	});
});

describe('CIPH-pi19-3 per-cohort tile selection', () => {
	it('switch covers all 5 cohorts (discrete / cycle / phase / narrative / custom)', () => {
		const sw = PDF.match(/switch \(cohort\) \{[\s\S]*?\n\t\t\}\n\t\}\)\(\)/);
		expect(sw, 'expected cohort switch in pickKpiTiles').toBeTruthy();
		for (const c of ['discrete', 'cycle', 'phase', 'narrative', 'custom']) {
			expect(sw![0]).toMatch(new RegExp(`case '${c}':`));
		}
	});

	it('discrete leads with episodes-with-delta + rescue-med-days', () => {
		// The first two tiles for discrete are the load-bearing ones.
		expect(PDF).toMatch(
			/case 'discrete':\s*\n\s*return\s*\[tileEpisodes\(\),\s*tileRescueMed\(\)/,
		);
	});

	it('narrative leads with topTrigger (memo §1: trigger frequency IS page 1)', () => {
		expect(PDF).toMatch(
			/case 'narrative':\s*\n\s*return\s*\[tileTopTrigger\(\)/,
		);
	});

	it('cycle leads with topTrigger (memo §1: trigger × phase intersection)', () => {
		expect(PDF).toMatch(
			/case 'cycle':\s*\n\s*return\s*\[tileTopTrigger\(\)/,
		);
	});

	it('episode delta semantic — increase=bad, decrease=good (more events = worse)', () => {
		// The clinical-direction reading: more episodes = condition is
		// worsening = bad. Decrease = improving = good.
		expect(PDF).toMatch(
			/semantic:\s*episodeChange\s*>\s*0\s*\?\s*'bad'\s*:\s*'good'/,
		);
	});

	it('episode delta is suppressed at 2years scope (no comparable prev window)', () => {
		expect(PDF).toMatch(/scope !==\s*'2years'\s*&&\s*episodeChange\s*!==\s*0/);
	});
});

describe('CIPH-pi19-3 rescueMedDays aggregation', () => {
	it('counts unique days with medication events in the focus month', () => {
		// Set<string> dedups per-day so 3 doses on the same day count as 1.
		expect(PDF).toMatch(/rescueMedDays\s*=\s*\(\(\)\s*=>\s*\{[\s\S]{0,400}new Set<string>\(\)/);
	});

	it('only counts events whose date starts with the focus-month prefix', () => {
		expect(PDF).toMatch(/focusPrefixForKpi[\s\S]{0,600}ds\.startsWith\(focusPrefixForKpi\)/);
	});
});

describe('CIPH-pi19-3 i18n', () => {
	for (const locale of ['de', 'en', 'fr', 'it']) {
		it(`${locale}: pdf.rescue_med_days present + non-empty`, async () => {
			const mod = await import(`./i18n/${locale}`);
			const dict = mod.default as Record<string, string>;
			expect(dict['pdf.rescue_med_days'], `${locale} missing key`).toBeTruthy();
			expect(dict['pdf.rescue_med_days']!.trim().length).toBeGreaterThan(0);
		});
	}
});
