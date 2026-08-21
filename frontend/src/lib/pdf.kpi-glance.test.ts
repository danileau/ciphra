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
	// RETIRED 2026-08-21 — the `semantic` field and its olive/brick colouring.
	// 'good' painted "three fewer episodes" green and 'bad' painted "three
	// more" brick: a verdict on the person's course, on the same page as the
	// trajectory label removed for exactly that reason.
	// "Ciphra ist nur eine Dokumentationsplattform."
	//
	// The vital tiles had already reached this conclusion independently —
	// their delta was hard-coded 'neutral' because "TSH falling on a
	// hypothyroid patient is good, on a hyperthyroid patient is bad" — which
	// left episodes as the only judged figure on the page.
	it('the delta carries the number and its sign, and nothing else', () => {
		expect(PDF).toMatch(/interface StatCardDelta\s*\{[\s\S]{0,400}sign:\s*'\+'\s*\|\s*'-'\s*\|\s*'='/);
		expect(PDF).toMatch(/interface StatCardDelta\s*\{[\s\S]{0,400}value:\s*string/);
		expect(PDF, 'the good/bad field is back').not.toMatch(
			/interface StatCardDelta\s*\{[\s\S]{0,400}semantic/,
		);
	});

	it('drawStatCard accepts optional delta param + lifts value when present', () => {
		expect(PDF).toMatch(/function drawStatCard\([\s\S]{0,400}delta\?:\s*StatCardDelta/);
		// Without delta: value baseline at h-4.5 (legacy). With delta: h-9.
		expect(PDF).toMatch(/valBaseline\s*=\s*delta\s*\?\s*y\s*\+\s*h\s*-\s*9\s*:\s*y\s*\+\s*h\s*-\s*4\.5/);
	});

	it('every delta renders in one neutral colour', () => {
		// Directional colour is an assessment; the sign is the fact.
		expect(PDF).not.toMatch(/semantic\s*===\s*'good'/);
		expect(PDF).not.toMatch(/semantic\s*===\s*'bad'/);
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

describe('CIPH-pi19-3 / pi24 P-PDF-4 per-cohort tile selection', () => {
	it('candidatesForCohort switch covers all 5 cohorts', () => {
		// pi24 P-PDF-4 — refactored from a fixed 4-tile slate to a
		// priority list. `candidatesForCohort` returns 5-7 candidates;
		// caller picks first 4 non-null. Switch shape unchanged.
		const sw = PDF.match(/switch \(cohort\) \{[\s\S]*?\n\t\t\}\n\t\};/);
		expect(sw, 'expected cohort switch in candidatesForCohort').toBeTruthy();
		for (const c of ['discrete', 'cycle', 'phase', 'narrative', 'custom']) {
			expect(sw![0]).toMatch(new RegExp(`case '${c}':`));
		}
	});

	it('discrete contains episodes + duration-distribution in order (CIPH-pi23-B2-fix-2 preserved)', () => {
		// PI v23 B2' clinical primary order preserved. pi24 P-PDF-4 spreads
		// `vitalFirst` at the head for vital-pinned discrete conditions
		// (hashimoto, hypertension etc.) — the regex below tolerates any
		// prefix as long as tileEpisodes comes before tileEpisodeDurationDist
		// inside the discrete case.
		expect(PDF).toMatch(
			/case 'discrete':[\s\S]*?tileEpisodes\(\)[\s\S]*?tileEpisodeDurationDist\(\)/,
		);
	});

	it('phase contains episodes + tilePhaseTopN in order (CIPH-pi23-B2-fix-1 preserved)', () => {
		expect(PDF).toMatch(
			/case 'phase':[\s\S]*?tileEpisodes\(\)[\s\S]*?tilePhaseTopN\(0\)[\s\S]*?tilePhaseTopN\(1\)/,
		);
	});

	it('narrative leads with topTrigger (memo §1: trigger frequency IS page 1)', () => {
		expect(PDF).toMatch(
			/case 'narrative':\s*\n\s*return\s*\[\s*tileTopTrigger\(\)/,
		);
	});

	it('cycle leads with topTrigger (memo §1: trigger × phase intersection)', () => {
		expect(PDF).toMatch(
			/case 'cycle':\s*\n\s*return\s*\[\s*tileTopTrigger\(\)/,
		);
	});

	it('vital-pinned conditions get vitalFirst spread before generic tiles', () => {
		// pi24 P-PDF-4 — Hashimoto/hypertension/cardiovascular/diabetes/
		// parkinson/bipolar each pin a clinical-primary vital that takes
		// the leading tile slot when the vital has data. Empty pin map
		// would silently drop this discipline.
		expect(PDF).toMatch(/vitalPinPerCondition[\s\S]*?hashimoto:\s*'tsh'/);
		expect(PDF).toMatch(/vitalPinPerCondition[\s\S]*?hypertension:\s*'bp_systolic'/);
		expect(PDF).toMatch(/vitalPinPerCondition[\s\S]*?bipolar:\s*'mood_polarity'/);
	});

	it('tile factories return Tile | null so the selector can fall through', () => {
		// pi24 P-PDF-4 — pre-pi24 each factory returned `Tile` with
		// "—" placeholder values; now each returns `Tile | null` so the
		// priority-list selector can pick the next populated alternative.
		// The 5-doctor agents campfire flagged "—" tiles as pure
		// decoration with confidence (3 of 4 empty on real Hans PDF).
		expect(PDF).toMatch(/tileEpisodes\s*=\s*\(\):\s*Tile\s*\|\s*null/);
		expect(PDF).toMatch(/tileTopSymptom\s*=\s*\(\):\s*Tile\s*\|\s*null/);
		expect(PDF).toMatch(/tileTopTrigger\s*=\s*\(\):\s*Tile\s*\|\s*null/);
		expect(PDF).toMatch(/tileRescueMed\s*=\s*\(\):\s*Tile\s*\|\s*null/);
	});

	// RETIRED with the field above. This asserted "more episodes = condition
	// is worsening = bad" — the clinical reading a documentation platform must
	// not perform on the patient's behalf, and one that is wrong often enough
	// to matter: more episodes during a deliberate taper is expected, not
	// deterioration.
	it('the episode delta states the change without grading it', () => {
		const idx = PDF.indexOf("label: t('pdf.total_episodes')");
		const block = PDF.slice(idx, idx + 500);
		expect(block).toMatch(/sign:\s*episodeChange\s*>\s*0\s*\?\s*'\+'\s*:\s*'-'/);
		expect(block).toMatch(/value:\s*String\(Math\.abs\(episodeChange\)\)/);
		expect(block, 'grading is back').not.toMatch(/semantic/);
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

	// RETIRED (period-picker pass). This used to assert
	//   focusPrefixForKpi … ds.startsWith(focusPrefixForKpi)
	// i.e. the tile counted the ANCHOR MONTH. That was written at pi v19,
	// when the export was always the current month or a trailing window from
	// now — "focus month" and "the report period" were the same thing, so the
	// assertion characterised the implementation rather than deciding
	// anything clinically (it carried no rationale, unlike its sibling
	// above).
	//
	// The /reports period picker decoupled them. On a calendar-year report
	// the tile then showed December beside "days logged: 180/365", unlabelled.
	// The tile follows the report window now; see
	// pdf.window-scoped-data.test.ts.
	it('counts events across the report window, not the anchor month', () => {
		const block = PDF.slice(PDF.indexOf('const rescueMedDays'));
		const body = block.slice(0, block.indexOf('return days.size'));
		expect(body).toMatch(/ds\s*<\s*scopeStartISO\s*\|\|\s*ds\s*>\s*scopeEndISO/);
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
