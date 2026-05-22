/**
 * CIPH-pi23-A1 — touch-target floor for /reports interactive controls.
 *
 * Anchor surface for the discrete cohort. WCAG 2.5.5 says interactive
 * targets should be ≥44×44 CSS pixels. Audit caught 1 chrome violation:
 * `.rpt-toggle-btn` Month/Year view toggle was 36px tall.
 *
 * Two grid controls are exempt under WCAG 2.5.5's "Equivalent" exception:
 *   - .grid-counter-btn (16×16): +/- counter inside data-grid cells
 *   - .grid-symptom-toggle (32px): symptom checkmark inside data-grid cells
 * Both have an equivalent path: clicking the day-link in the same row
 * routes to /log/{date} where the same edits happen via 44pt+ controls.
 * Documented as exception below; future refactors that move these grid
 * controls OUT of the equivalent-path context must re-evaluate the floor.
 *
 * Mirrors `routes/journal/touch-target.test.ts` (CIPH-pi22-JC-1) and
 * `routes/calendar/touch-target.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPORTS = readFileSync(
	join(__dirname, '+page.svelte'),
	'utf8',
);

describe('CIPH-pi23-A1 /reports touch-target floor (44pt WCAG 2.5.5)', () => {
	it('rpt-toggle-btn CSS sets min-height: 44px', () => {
		// Locked against the previous 36px regression. Month/Year view
		// toggle is /reports' most prominent chrome control.
		expect(REPORTS).toMatch(
			/\.rpt-toggle-btn\s*\{[^}]*min-height:\s*44px/,
		);
	});

	it('rpt-nav-btn (year prev/next) keeps its existing 44pt floor', () => {
		expect(REPORTS).toMatch(
			/\.rpt-nav-btn\s*\{[\s\S]{0,400}min-(width|height):\s*44px/,
		);
	});

	it('changeMonth(-1) / changeMonth(1) buttons inherit min-w/h-[44px] from inline classes', () => {
		// The month nav uses inline Tailwind classes rather than a CSS rule.
		// Pin the inline pattern so a refactor to a class doesn't drop the floor.
		expect(REPORTS).toMatch(
			/changeMonth\(-1\)[\s\S]{0,400}min-w-\[44px\][^"]*min-h-\[44px\]/,
		);
		expect(REPORTS).toMatch(
			/changeMonth\(1\)[\s\S]{0,400}min-w-\[44px\][^"]*min-h-\[44px\]/,
		);
	});

	it('btn-primary + btn-secondary on the caregiver guard route inherit 44pt from app.css', () => {
		// Sanity: the early-return caregiver-blocked branch uses btn-primary
		// / btn-secondary. The app.css contract is tested in app-html.test.ts;
		// here we just confirm /reports doesn't override it locally.
		expect(REPORTS).toMatch(/btn-primary[^"]*min-h-\[44px\]/);
		expect(REPORTS).toMatch(/btn-secondary[^"]*min-h-\[44px\]/);
	});

	it('grid-counter-btn 16×16 is intentional (WCAG 2.5.5 Equivalent exception, /log/{date} primary path)', () => {
		// Document the exception so a future "make all targets 44pt" sweep
		// catches THIS test failing and reads the rationale before changing
		// the data-grid layout. The grid is a power-user shortcut; equivalent
		// path /log/{date} provides 44pt+ targets for the same edits.
		expect(REPORTS).toMatch(
			/:global\(\.grid-counter-btn\)\s*\{[^}]*width:\s*16px[^}]*height:\s*16px/,
		);
		// And the <a href="/log/{day...}"> equivalent path exists in the
		// same grid row.
		expect(REPORTS).toMatch(/<a href="\/log\/\{dayStr\}"[^>]*class="grid-day-link"/);
	});

	it('grid-symptom-toggle 32px is intentional (same Equivalent exception)', () => {
		expect(REPORTS).toMatch(
			/\.grid-symptom-toggle\s*\{[^}]*min-height:\s*32px/,
		);
	});

	it('locks against accidental regression below 44 for chrome controls (excludes documented grid-* exceptions)', () => {
		// Strip the two documented exceptions, then assert no <44 values
		// remain. If the audit later adds more exceptions, extend the
		// excludeRanges list with the rationale.
		const excludeRanges: Array<[number, number]> = [];
		const counterRule = REPORTS.indexOf(':global(.grid-counter-btn)');
		if (counterRule !== -1) {
			excludeRanges.push([counterRule, counterRule + 600]);
		}
		const symptomRule = REPORTS.indexOf('.grid-symptom-toggle {');
		if (symptomRule !== -1) {
			excludeRanges.push([symptomRule, symptomRule + 400]);
		}
		// `.report-sheet` (36px) is decorative — the mini-document graphic
		// inside the doctor-export scope cards, not an interactive target.
		// The card itself (`.report-card`, a <button>, min-height 138px) is
		// the touch target and clears the floor with room to spare.
		const sheetRule = REPORTS.indexOf('.report-sheet {');
		if (sheetRule !== -1) {
			excludeRanges.push([sheetRule, sheetRule + 200]);
		}
		const inExclusion = (idx: number) =>
			excludeRanges.some(([s, e]) => idx >= s && idx < e);

		const numeric = [
			...REPORTS.matchAll(/min-h-\[(\d+)px\]/g),
			...REPORTS.matchAll(/min-height:\s*(\d+)px/g),
			...REPORTS.matchAll(/(?:^|\s)height:\s*(\d+)px/g),
		];
		const violations = numeric
			.filter((m) => !inExclusion(m.index!))
			.map((m) => parseInt(m[1], 10))
			.filter((n) => n > 0 && n < 44);
		expect(
			violations,
			`/reports source contains <44 min-height values outside the documented Equivalent-exception ranges: ${violations.join(', ')}. ` +
				`Either fix to 44pt OR document the exception inline + extend excludeRanges in this test.`,
		).toEqual([]);
	});
});
