/**
 * CIPH-pi22-JC-1 — touch-target floor for /journal interactive controls.
 *
 * WCAG 2.5.5 says interactive targets should be ≥44×44 CSS pixels. PI v22's
 * J1 audit caught 4 failures on this surface (search-toggle 40×40, search-
 * clear ~22×22, filter chip 36px, moment-modal Yes-delete + Delete plain
 * buttons). This test pins the fixes against the source so a future "reduce
 * filter chip height" or "tighten search button padding" refactor has to
 * break a test to ship.
 *
 * Strategy: regex-on-source like `pdf.kpi-glance.test.ts` /
 * `security-doc.test.ts`. Faster than Playwright + sufficient: the source
 * patterns we lock are the actual classnames Tailwind compiles, so a real
 * regression has to mutate the same string.
 *
 * Personas: Anna (bipolar — manic-episode tremor + drug-induced typing
 * fatigue make 44pt the practical floor for her); Hans (epilepsy — focal
 * episodes can leave fine-motor weakness for hours; an under-spec'd target
 * is genuinely unusable on a post-seizure day).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const JOURNAL = readFileSync(
	join(__dirname, '+page.svelte'),
	'utf8',
);

describe('CIPH-pi22-JC-1 /journal touch-target floor (44pt WCAG 2.5.5)', () => {
	it('search-toggle button is min-w-[44px] min-h-[44px]', () => {
		// Locked against the previous 40×40 regression. The shrink-0 +
		// p-2 + flex anchor disambiguates this button from other 44×44
		// controls in the file (search-clear keeps an absolute position).
		expect(JOURNAL).toMatch(
			/openSearch[\s\S]{0,400}shrink-0[^"]*min-w-\[44px\][^"]*min-h-\[44px\]/,
		);
	});

	it('search-clear button is min-w-[44px] min-h-[44px]', () => {
		// Anchor: `searchQuery = ''; searchOpen = false;` is unique to
		// the clear handler. The class string immediately after must
		// carry the 44pt floor.
		expect(JOURNAL).toMatch(
			/searchQuery\s*=\s*''[\s\S]{0,400}min-w-\[44px\][^"]*min-h-\[44px\]/,
		);
	});

	it('filter chip CSS sets min-height: 44px', () => {
		// Locked against the previous 36px regression. The `.journal-filter-chip`
		// rule in the <style> block is the source of truth for filter-tab
		// height; Tailwind utility classes don't override.
		expect(JOURNAL).toMatch(
			/\.journal-filter-chip\s*\{[^}]*min-height:\s*44px/,
		);
	});

	it('moment-modal "Yes delete" button is min-h-[44px]', () => {
		// The Yes-delete confirmation lives inside the momentConfirmDelete
		// branch; its handler is `deleteMoment`. The class string carries
		// danger styling + min-h-[44px].
		expect(JOURNAL).toMatch(
			/on:click=\{deleteMoment\}[\s\S]{0,200}min-h-\[44px\]/,
		);
	});

	it('moment-modal plain "Delete" trigger is min-h-[44px]', () => {
		// Distinct from yes-delete: handler sets `momentConfirmDelete = true`.
		expect(JOURNAL).toMatch(
			/momentConfirmDelete\s*=\s*true[\s\S]{0,200}min-h-\[44px\]/,
		);
	});

	it('btn-primary + btn-secondary in app.css carry min-h-[44px] (foundation contract)', () => {
		const APP_CSS = readFileSync(
			join(__dirname, '..', '..', 'app.css'),
			'utf8',
		);
		expect(APP_CSS).toMatch(/\.btn-primary\s*\{[\s\S]{0,400}min-h-\[44px\]/);
		expect(APP_CSS).toMatch(/\.btn-secondary\s*\{[\s\S]{0,400}min-h-\[44px\]/);
	});

	it('locks against accidental regression below 44 for any min-h-[Npx] in /journal source', () => {
		// Any explicit min-h-[Npx] / min-height: Npx that lands below 44 is
		// a candidate WCAG 2.5.5 violation — fail the test and force the
		// dev to either justify (e.g. a tag chip that's not interactive)
		// or fix. Excludes vendor / generated patterns.
		const numeric = [
			...JOURNAL.matchAll(/min-h-\[(\d+)px\]/g),
			...JOURNAL.matchAll(/min-height:\s*(\d+)px/g),
		];
		const violations = numeric
			.map((m) => parseInt(m[1], 10))
			.filter((n) => n > 0 && n < 44);
		expect(
			violations,
			`/journal source contains min-height values below 44pt: ${violations.join(', ')}. ` +
				`If a value is intentional (non-interactive), document inline and exclude in this test.`,
		).toEqual([]);
	});
});
