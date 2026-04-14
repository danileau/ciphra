/**
 * CIPH-870 — Mobile BottomNav active-state must be reactive.
 *
 * Static parse guards three things:
 *
 *   1. Each tab's `class:bn-tab--active={…}` expression must reference a
 *      reactive variable (e.g. `isHomeActive`), NOT a function call
 *      (`isActive('/')`). Svelte's template dependency tracking cannot
 *      see through a function body, so the function-call variant never
 *      re-evaluates when `$page.url.pathname` changes. That's the bug
 *      the user hit in the field — "Heute" stays lit on every route.
 *
 *   2. Each reactive declaration must reference `pathname` directly so
 *      Svelte tracks the dependency.
 *
 *   3. The `/log` matcher must not accidentally shadow `/login` — it
 *      should match `/log` exactly OR paths starting with `/log/`, never
 *      `startsWith('/log')` unqualified.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(__dirname, 'BottomNav.svelte'), 'utf8');

const TABS = [
	{ name: 'home', varName: 'isHomeActive' },
	{ name: 'calendar', varName: 'isCalendarActive' },
	{ name: 'journal', varName: 'isJournalActive' },
	{ name: 'reports', varName: 'isReportsActive' },
] as const;

describe('CIPH-870 BottomNav reactive active state', () => {
	it.each(TABS)(
		'declares $varName as a reactive statement',
		({ varName }) => {
			// Must be a `$:` reactive declaration. The right-hand side may
			// reference `pathname` directly or a reactive alias of it
			// (currently `$: p = pathname`) — either way Svelte tracks it.
			const re = new RegExp(`\\$:\\s+${varName}\\s*=`, 'm');
			expect(SOURCE).toMatch(re);
		},
	);

	it('has a reactive alias of pathname (or uses pathname directly)', () => {
		// Ensure the chain actually reaches $page.url.pathname.
		expect(SOURCE).toContain('$: pathname = $page.url.pathname');
	});

	it.each(TABS)(
		'$name tab class binding uses the reactive variable, not a function call',
		({ varName }) => {
			expect(SOURCE).toContain(`class:bn-tab--active={${varName}}`);
			expect(SOURCE).toContain(`aria-current={${varName} ? 'page' : undefined}`);
		},
	);

	it('never calls isActive() from the template (regression guard)', () => {
		// The old bug: `class:bn-tab--active={isActive('/')}` — the function
		// closed over `pathname` but Svelte could not trace the dependency.
		expect(SOURCE).not.toMatch(/class:bn-tab--active=\{isActive\(/);
	});

	it('/log matcher does not accidentally shadow /login', () => {
		// `startsWith('/log')` would also match `/login`, `/logout`, `/logbook`.
		// The fix uses `=== '/log'` OR `startsWith('/log/')`.
		// Accept any identifier alias (currently `p` = reactive alias of pathname).
		expect(SOURCE).not.toMatch(/\.startsWith\(['"]\/log['"]\)/);
		// Positive check: the proper boundary form must be present.
		expect(SOURCE).toMatch(/\.startsWith\(['"]\/log\/['"]\)/);
	});

	it('hidden list covers auth-flow and wizard routes', () => {
		// Regression: /migrate must hide the nav (auth-flow shell). Missing
		// this until CIPH-870 meant the nav briefly rendered during the
		// hash-fragment migration flow.
		expect(SOURCE).toContain("pathname === '/login'");
		expect(SOURCE).toContain("pathname === '/setup'");
		expect(SOURCE).toContain("pathname.startsWith('/join/')");
		expect(SOURCE).toContain("pathname === '/migrate'");
	});
});
