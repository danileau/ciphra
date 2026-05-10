/**
 * CIPH-pi23-A1 — touch-target floor for /calendar interactive controls.
 *
 * Anchor surface for the phase cohort. WCAG 2.5.5 says interactive targets
 * should be ≥44×44 CSS pixels. Audit caught 3 chrome violations: today
 * button (~20×20), event-chip in selected-day card (~24×24), edit link
 * (text-sm with no min-h). All fixed; this file pins the source patterns
 * so future "tighten chrome" refactors can't regress silently.
 *
 * Mirrors `routes/journal/touch-target.test.ts` (CIPH-pi22-JC-1).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CALENDAR = readFileSync(
	join(__dirname, '+page.svelte'),
	'utf8',
);

describe('CIPH-pi23-A1 /calendar touch-target floor (44pt WCAG 2.5.5)', () => {
	it('cal-today-btn CSS sets min-height: 44px', () => {
		// Locked against the previous 20×20 (padding 2/8) regression.
		expect(CALENDAR).toMatch(
			/\.cal-today-btn\s*\{[^}]*min-height:\s*44px/,
		);
	});

	it('event chip in selected-day card carries min-h-[44px]', () => {
		// Anchored on the unique handler — `selectedDate = ev.date`.
		expect(CALENDAR).toMatch(
			/selectedDate\s*=\s*ev\.date[\s\S]{0,400}min-h-\[44px\]/,
		);
	});

	it('rail edit link carries min-h-[44px]', () => {
		// The /log/{date} edit affordance lives in both the lg+ rail header
		// AND the <lg bottom-sheet panel. Both rendered from the same
		// "edit" markup pattern; both must clear 44pt.
		const matches = CALENDAR.match(/href="\/log\/\{[^}]+\}"\s+class="text-sm[^"]*min-h-\[44px\]/g) || [];
		expect(matches.length, 'both rail + sheet edit links must have min-h-[44px]').toBeGreaterThanOrEqual(2);
	});

	it('cal-sheet-nav already meets the 44pt floor (no regression)', () => {
		// PI v19 Track A's rail prev/next buttons. The CSS rule lives
		// in the same <style> block; pin it so future "compact rail"
		// refactors can't drop it.
		expect(CALENDAR).toMatch(
			/\.cal-sheet-nav\s*\{[^}]*min-(width|height):\s*44px/,
		);
	});

	it('day-cell button keeps its existing min-h-[44px]', () => {
		// The grid day-cell — calendar's primary tap target. PI v19
		// shipped this; confirm preserved.
		expect(CALENDAR).toMatch(
			/aspect-square[^"]*md:h-12[^"]*lg:h-14[^"]*min-h-\[44px\]/,
		);
	});

	it('locks against accidental regression below 44 for any min-h-[Npx] / min-height: Npx in /calendar source', () => {
		const numeric = [
			...CALENDAR.matchAll(/min-h-\[(\d+)px\]/g),
			...CALENDAR.matchAll(/min-height:\s*(\d+)px/g),
		];
		const violations = numeric
			.map((m) => parseInt(m[1], 10))
			.filter((n) => n > 0 && n < 44);
		expect(
			violations,
			`/calendar source contains min-height values below 44pt: ${violations.join(', ')}. ` +
				`If a value is intentional (non-interactive), document inline and exclude in this test.`,
		).toEqual([]);
	});
});
