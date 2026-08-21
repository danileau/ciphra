/**
 * CIPH-pi22-JC-1 — touch-target floor for /journal interactive controls.
 *
 * WCAG 2.5.5 says interactive targets should be ≥44×44 CSS pixels. PI v22's
 * J1 audit caught 4 failures on this surface (search-toggle 40×40, search-
 * clear ~22×22, filter chip 36px, moment-modal Yes-delete + Delete plain
 * buttons). It has since caught a fifth: the v2 rewrite shipped 32px chips
 * and a 32px clear button before this test failed the build. This pins the
 * fixes against the source so a future "reduce
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
	// The search TOGGLE is gone (journal v2): search is a permanent field
	// rather than an icon that expands into one, because finding and
	// re-reading is the page's whole job. Its 44×44 assertion retires with
	// it; the field itself takes the floor instead.
	it('the search field itself is at least 44px tall', () => {
		expect(JOURNAL).toMatch(/\.jr-search-input\s*\{[^}]*min-height:\s*44px/);
	});

	it('search-clear button is at least 44×44', () => {
		expect(JOURNAL).toMatch(/\.jr-search-clear\s*\{[^}]*min-width:\s*44px/);
		expect(JOURNAL).toMatch(/\.jr-search-clear\s*\{[^}]*min-height:\s*44px/);
	});

	it('filter chip CSS sets min-height: 44px', () => {
		// Locked against the previous 36px regression — and against the 32px
		// one introduced by the v2 rewrite, which this test caught. Chips have
		// no equivalent path elsewhere, so the grid-cell "Equivalent"
		// exception WCAG 2.5.5 allows does not apply to them.
		expect(JOURNAL).toMatch(/\.jr-chip\s*\{[\s\S]{0,220}min-height:\s*44px/);
	});

	it('every text row in the feed is reachable as its own control', () => {
		// The rows are buttons, not nested links inside a link — the previous
		// layout had a "Show details" link inside a card that was itself a
		// link, on some cards but not others.
		expect(JOURNAL).toMatch(/class="jr-text jr-text--\{txt\.kind\}"/);
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
