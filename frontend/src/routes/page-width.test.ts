/**
 * Every page's width is a decision, and this file is where it is recorded.
 *
 * WHY THIS EXISTS
 *
 * The `layout-*` width tokens have existed since CIPH-746. On 2026-08-21 an
 * audit found only 4 of 18 routes using them: the other 14 each hardcoded
 * their own `max-w-*` or set nothing at all. Nothing had gone wrong loudly —
 * the pages simply drifted to six different widths, which is exactly the
 * outcome the tokens were introduced to prevent.
 *
 * The tokens alone could not stop that, because the app layout imposes NO
 * width of its own (`<main class="flex-1">`, no container). A page that says
 * nothing renders edge-to-edge, so "forgot to pick a width" and "deliberately
 * full-bleed" looked identical. This test makes them different: a route must
 * be classified, and an unclassified one fails.
 *
 * HOW TO ADD A PAGE
 *
 * Put it in TIERS with the token it uses, or in EXCEPTIONS with the reason it
 * cannot use one. Both are cheap. Neither is optional — a new `+page.svelte`
 * that appears in neither map fails `every page is classified`, on purpose.
 *
 * The tier definitions and the reasoning behind each exception live in
 * `src/app.css` under LAYOUT WIDTH TOKENS. This file pins the assignment; that
 * one explains it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROUTES = __dirname;

/** Route file → the width token it must carry. */
const TIERS: Record<string, string> = {
	'+page.svelte': 'layout-landing', //          1024 — landing section bands
	'docs/+page.svelte': 'layout-reading', //      768
	'docs/[slug]/+page.svelte': 'layout-reading', //   768
	'privacy/+page.svelte': 'layout-reading', //   768
	'terms/+page.svelte': 'layout-reading', //     768
	'setup/+page.svelte': 'layout-reading', //     768
	'settings/+page.svelte': 'layout-default', //  896
	'conditions/[id]/+page.svelte': 'layout-default', // 896
	'journal/+page.svelte': 'layout-data', //     1152
	'calendar/+page.svelte': 'layout-data', //    1152
	'admin/+page.svelte': 'layout-data', //       1152
	'reports/+page.svelte': 'layout-data-wide', // 1280 — data tables
};

/** Route file → why it carries no tier. Each is a real pattern, not an oversight. */
const EXCEPTIONS: Record<string, string> = {
	// Centre a 448px card in the viewport instead of flowing content down a
	// column. `layout-narrow` (576) would widen every auth card by 128px for
	// tidiness alone.
	'login/+page.svelte': 'auth card',
	'migrate/+page.svelte': 'auth card',
	'join/[grantId]/+page.svelte': 'auth card',
	// Delegates its whole body to <EntryComposer>, whose `.log-page` is 768
	// rising to 1024 at the ≥1024 breakpoint where the form goes two-column.
	// No tier expresses "widens at a breakpoint".
	'log/[date]/+page.svelte': 'responsive two-stage, in EntryComposer',
	// onMount → goto(). Renders nothing, so it has no width to have.
	'stream/+page.svelte': 'redirect stub',
	'protocol/+page.svelte': 'redirect stub',
};

function pageFiles(dir: string, acc: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) pageFiles(full, acc);
		else if (name === '+page.svelte') acc.push(relative(ROUTES, full));
	}
	return acc;
}

const PAGES = pageFiles(ROUTES).sort();
const read = (p: string) => readFileSync(join(ROUTES, p), 'utf8');

describe('every page has a declared width', () => {
	it('found the routes at all', () => {
		// Guards against a silently-empty walk making the whole suite vacuous.
		expect(PAGES.length).toBeGreaterThan(15);
	});

	it('every page is classified — a new one must be assigned, not defaulted', () => {
		const unclassified = PAGES.filter((p) => !(p in TIERS) && !(p in EXCEPTIONS));
		expect(
			unclassified,
			`Unclassified page(s). Add each to TIERS with a layout-* token, or to ` +
				`EXCEPTIONS with the reason it cannot use one. Do not leave it blank: ` +
				`the app layout sets no width, so an unclassified page renders edge-to-edge.`,
		).toEqual([]);
	});

	it('the maps describe pages that actually exist', () => {
		// A route deleted or renamed leaves a stale entry that would otherwise
		// keep asserting nothing forever.
		const stale = [...Object.keys(TIERS), ...Object.keys(EXCEPTIONS)].filter(
			(p) => !PAGES.includes(p),
		);
		expect(stale, 'entry refers to a page that no longer exists').toEqual([]);
	});

	it('no page is in both maps', () => {
		const both = Object.keys(TIERS).filter((p) => p in EXCEPTIONS);
		expect(both).toEqual([]);
	});
});

describe('each tiered page carries its token', () => {
	for (const [page, token] of Object.entries(TIERS)) {
		it(`${page} → ${token}`, () => {
			expect(read(page), `${page} should use ${token}`).toContain(token);
		});
	}
});

describe('tiered pages do not reimplement a container by hand', () => {
	// Once a page has a token, a second hand-rolled container is either nested
	// inside it (which the tokens forbid) or competing with it. `reports`
	// reimplemented `layout-data-wide` in scoped CSS for months exactly that
	// way — invisible to any audit that greps for class names.
	//
	// The rule is ELEMENT-AWARE, and it has to be. `max-w-<size> mx-auto` is
	// also how you centre a paragraph, and a centred paragraph is capping LINE
	// LENGTH, not laying out a page. The first version of this test flagged
	// four such paragraphs on the landing and /conditions alongside one real
	// container; matching only layout elements separates them without an
	// allowlist doing the work.
	const CONTAINER =
		/<(?:div|section|main|article|aside|nav|header|footer)\b[^>]*\bmax-w-(?:xs|sm|md|lg|xl|\dxl|\[[^\]]+\])\s+mx-auto/g;

	// Container-shaped, looked at, kept. Alternative branches of an {#if} are
	// not nested inside the tiered container and never render beside it, so a
	// deliberately narrower one is a design choice rather than drift.
	const REVIEWED: Record<string, number> = {
		// The "nothing to report yet" branch: a 672px centred column of
		// explanatory text, shown instead of the 1280px table page, never with
		// it. Narrower on purpose — it is prose, not data.
		'reports/+page.svelte': 1,
	};

	for (const page of Object.keys(TIERS)) {
		it(`${page} has no second hand-rolled container`, () => {
			const hits = read(page).match(CONTAINER) ?? [];
			expect(
				hits.length,
				`${page} already uses ${TIERS[page]}; ${hits.length} hand-rolled ` +
					`container(s) found, ${REVIEWED[page] ?? 0} reviewed. Either use the ` +
					`token, or add it to REVIEWED with the reason it differs.\n${hits.join('\n')}`,
			).toBe(REVIEWED[page] ?? 0);
		});
	}
});

describe('the tokens themselves', () => {
	const css = readFileSync(join(ROUTES, '..', 'app.css'), 'utf8');

	it('every token this file assigns is actually defined', () => {
		for (const token of new Set(Object.values(TIERS))) {
			expect(css, `${token} is assigned but not defined in app.css`).toMatch(
				new RegExp(`\\.${token}\\s*\\{`),
			);
		}
	});

	it('the width scale stays small — a tier per page is not a system', () => {
		const defined = [...css.matchAll(/^\t\.(layout-[a-z-]+)\s*\{/gm)].map((m) => m[1]);
		expect(defined.length).toBeLessThanOrEqual(6);
	});
});
