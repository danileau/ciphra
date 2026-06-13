/**
 * Mobile layout bug hunt — deterministic horizontal-overflow detector.
 *
 * The "find-bugs challenge" backbone. Unlike visual-smoke.spec.ts (which
 * screenshots for a human and asserts `true`), this FAILS the build when a
 * route scrolls horizontally on a phone, and names the exact offending
 * elements so the fix is a grep, not a guess.
 *
 * What it catches:
 *  - horizontal shift  → page scrollWidth > viewport width
 *  - the culprit boxes → leaf-most elements whose right edge crosses the
 *                        viewport, with tag/class/id + computed overflow-x
 *
 * What it does NOT catch (use the screenshots + an eyeball / model pass):
 *  - text overlapping a box, cramped spacing, ugly wrapping — these are
 *    subjective; full-page PNGs land in e2e/_screenshots/overflow/.
 *
 * Run (public routes need no backend):
 *   npx playwright test e2e/mobile-overflow.spec.ts
 *
 * Soft assertions: one run reports EVERY offending route, not just the first.
 */

import { test, expect } from '@playwright/test';
import { TEST_PASSWORD } from './_helpers/testUser';

test.setTimeout(180_000);

// UI_LOCALE forces the app language before any page script runs. ciphra's
// primary locale is German (Swiss), whose strings are materially longer than
// English — the same overflow class FONT_SCALE simulates appears in `de` at
// DEFAULT font size. Set UI_LOCALE=de to reproduce the real user condition.
test.beforeEach(async ({ page }) => {
	const loc = process.env.UI_LOCALE;
	if (loc) {
		await page.addInitScript((l) => {
			try {
				localStorage.setItem('ciphra_locale', l);
			} catch {}
		}, loc);
	}
});

// Two real-world narrow widths. 360 is the commonest Android; 390 is the
// modern iPhone (12/13/14/15). 375 (older iPhone) is a subset of 390's bugs.
const WIDTHS = [
	{ name: 'android', width: 360, height: 800 },
	{ name: 'iphone', width: 390, height: 844 },
] as const;

const PUBLIC_ROUTES = [
	{ path: '/', label: 'landing' },
	{ path: '/login', label: 'login' },
	{ path: '/login?mode=register', label: 'register' },
	{ path: '/conditions', label: 'conditions' },
	{ path: '/conditions/epilepsy', label: 'condition-detail' },
	{ path: '/docs', label: 'docs' },
	{ path: '/privacy', label: 'privacy' },
	{ path: '/terms', label: 'terms' },
] as const;

const AUTHED_ROUTES = [
	{ path: '/', label: 'dashboard' },
	{ path: '/calendar', label: 'calendar' },
	{ path: '/journal', label: 'journal' },
	{ path: '/reports', label: 'reports' },
	{ path: '/log/today', label: 'log-today' },
	{ path: '/protocol', label: 'protocol' },
	{ path: '/stream', label: 'stream' },
	{ path: '/settings?tab=tracking', label: 'settings-tracking' },
] as const;

interface Offender {
	tag: string;
	cls: string;
	id: string;
	left: number;
	right: number;
	w: number;
	overflowX: string;
	text: string;
}

/**
 * Runs in the page. Returns the page overflow delta plus the LEAF-most
 * elements crossing the viewport edge — an element is reported only if no
 * descendant also overflows, so we name the box that introduces the shift
 * rather than every ancestor that inherits it.
 */
function detectOverflow() {
	const docW = document.documentElement.clientWidth;
	const scrollW = document.documentElement.scrollWidth;
	const all = Array.from(document.querySelectorAll('body *'));

	const describe = (el: Element): Offender => {
		const r = el.getBoundingClientRect();
		const cs = getComputedStyle(el);
		const cls =
			typeof el.className === 'string' ? el.className : (el.getAttribute('class') ?? '');
		return {
			tag: el.tagName.toLowerCase(),
			cls: cls.slice(0, 90),
			id: el.id || '',
			left: Math.round(r.left),
			right: Math.round(r.right),
			w: Math.round(r.width),
			overflowX: cs.overflowX,
			text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50),
		};
	};

	const hasNegMargin = (el: Element) => {
		const cs = getComputedStyle(el);
		return parseFloat(cs.marginLeft) < 0 || parseFloat(cs.marginRight) < 0;
	};
	// True if an ancestor scroll-contains horizontal overflow — then this
	// element's beyond-viewport rect is scrolled content, NOT a page shift.
	const inScrollContainer = (el: Element) => {
		for (let p = el.parentElement; p; p = p.parentElement) {
			const ox = getComputedStyle(p).overflowX;
			if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true;
		}
		return false;
	};

	// (1) PAGE-LEVEL: elements crossing the viewport edge that are NOT inside a
	//     scroll/clip container — only these actually grow the document and
	//     cause the horizontal scrollbar / shift.
	const crossing = all.filter((el) => {
		if (el instanceof SVGElement) return false; // SVG sizing is not box-model
		const r = el.getBoundingClientRect();
		if (r.width === 0 || r.height === 0) return false;
		if (r.right <= docW + 1 && r.left >= -1) return false;
		return !inScrollContainer(el);
	});
	const crossLeaves = crossing.filter((el) => !crossing.some((o) => o !== el && el.contains(o)));

	// (2) VISIBLE SPILL: an element whose content is wider than its box while
	//     overflow-x is `visible` (the default) — content spills OUT and is
	//     painted over neighbours. This is the "text overlaps the box" class.
	//     We exclude `hidden`/`clip`/`auto`/`scroll` because those clip or
	//     scroll by design (incl. ellipsis truncation) and don't visually
	//     overlap. Tolerance 4px to skip sub-pixel rounding.
	const clipped = all
		.filter((el) => {
			if (el instanceof SVGElement) return false; // SVG scrollWidth is bogus
			const cs = getComputedStyle(el);
			if (cs.overflowX !== 'visible') return false;
			const r = el.getBoundingClientRect();
			if (r.width < 24 || r.height === 0) return false;
			if (el.scrollWidth - el.clientWidth <= 4) return false;
			// Exclude the negative-margin full-bleed idiom (e.g. sticky month
			// header pulled to the screen edge): the "spill" is a deliberate
			// edge-to-edge bleed clipped at the page padding, not a layout bug.
			if (hasNegMargin(el)) return false;
			// Recursive: a full-bleed descendant at ANY depth (e.g. the sticky
			// month header pulled -16px to the screen edge) inflates this
			// element's scrollWidth. WebKit and Chromium attribute that bleed to
			// different ancestors, so we must check the whole subtree, not just
			// direct children, to dismiss the idiom consistently across engines.
			if (Array.from(el.querySelectorAll('*')).some(hasNegMargin)) return false;
			// Exclude content living inside a deliberate horizontal scroll
			// container (overflow-x:auto/scroll on an ancestor) — e.g. the
			// scrollable encryption diagram. The user scrolls; not a bug.
			for (let p = el.parentElement; p; p = p.parentElement) {
				const ox = getComputedStyle(p).overflowX;
				if (ox === 'auto' || ox === 'scroll') return false;
			}
			return true;
		})
		.filter((el, _i, arr) => !arr.some((o) => o !== el && el.contains(o)));

	return {
		docW,
		scrollW,
		overflow: scrollW - docW,
		crossing: crossLeaves.slice(0, 20).map(describe),
		clipped: clipped.slice(0, 20).map(describe),
	};
}

function fmt(o: Offender, vw: number): string {
	return (
		`      <${o.tag}${o.id ? '#' + o.id : ''}> right=${o.right} (vw=${vw}) w=${o.w} ox=${o.overflowX}` +
		`\n          class="${o.cls}"` +
		(o.text ? `\n          text="${o.text}"` : '')
	);
}

function report(route: string, vp: string, res: Awaited<ReturnType<typeof detectOverflow>>) {
	const lines: string[] = [];
	if (res.overflow > 1) {
		lines.push(`\n  ✗ PAGE SHIFT  ${route}  [${vp}]  page +${res.overflow}px`);
		lines.push(...res.crossing.map((o) => fmt(o, res.docW)));
	}
	if (res.clipped.length) {
		lines.push(`\n  ⚠ CLIPPED/SPILL  ${route}  [${vp}]  ${res.clipped.length} element(s) wider than their box`);
		lines.push(...res.clipped.map((o) => fmt(o, res.docW)));
	}
	if (lines.length) {
		// eslint-disable-next-line no-console
		console.log(lines.join('\n'));
	}
}

async function checkRoute(
	page: import('@playwright/test').Page,
	path: string,
	label: string,
	vp: { name: string; width: number; height: number },
) {
	await page.goto(path);
	// Wait out the decrypt/loading state so we measure real content, not "Loading…".
	await page
		.getByText(/^Loading…?$|^Lädt…?$/)
		.waitFor({ state: 'hidden', timeout: 15_000 })
		.catch(() => {});
	await page.waitForTimeout(900); // charts + reactive cascades settle
	// FONT_SCALE simulates iOS Dynamic Type / browser "larger text" accessibility
	// settings — a very common real-world overflow trigger that default-font
	// testing misses. e.g. FONT_SCALE=1.3 ≈ iOS "Large".
	const scale = Number(process.env.FONT_SCALE || 0);
	if (scale > 1) {
		await page.evaluate((s) => {
			document.documentElement.style.fontSize = `${16 * s}px`;
		}, scale);
		await page.waitForTimeout(300);
	}
	const res = await page.evaluate(detectOverflow);
	await page
		.screenshot({ path: `e2e/_screenshots/overflow/${vp.name}__${label}.png`, fullPage: true })
		.catch(() => {});
	report(path, vp.name, res);
	expect.soft(res.overflow, `${path} [${vp.name}] page horizontal overflow`).toBeLessThanOrEqual(1);
	expect
		.soft(res.clipped.length, `${path} [${vp.name}] clipped/spilling elements`)
		.toBeLessThanOrEqual(0);
}

/**
 * Log in as a pre-seeded data-rich persona. These accounts carry ~2 years
 * (~650 logs) of real data — the only way data-driven overflow (long chips,
 * dense charts, multi-day bands, packed tables) actually renders. Seed first:
 *   docker exec -e CIPHRA_ALLOW_DEMO_SEED=1 ciphra-api python seed_<persona>.py
 */
const SEED_PASSWORD = 'Test$12345_';
async function loginSeeded(page: import('@playwright/test').Page, username: string) {
	await page.goto('/login');
	await page.locator('#login-user').fill(username);
	await page.locator('#login-pass').fill(SEED_PASSWORD);
	await page.getByTestId('login-submit').click();
	// Land on the authed app; master-key derivation (Argon2) can take a moment.
	await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 40_000 });
	await page.waitForTimeout(500);
}

async function registerAndConfigure(page: import('@playwright/test').Page) {
	const user = 'ovf_' + Math.random().toString(36).slice(2, 10);
	await page.goto('/login?mode=register');
	await page.locator('#signup-user').fill(user);
	await page.locator('#signup-pass').fill(TEST_PASSWORD);
	await page.locator('#signup-pass2').fill(TEST_PASSWORD);
	await page.getByTestId('register-submit').click();
	await page.getByTestId('recovery-code-display').waitFor({ timeout: 30_000 });
	await page.getByTestId('recovery-ack-checkbox').check();
	await page.getByTestId('recovery-continue').click();

	await page.goto('/setup');
	const roleSelf = page.getByText(
		/track my own health|eigene gesundheit dokumentieren|documenter ma propre santé|documentare la mia salute/i,
	);
	const presetTile = page.getByText(/epilepsy|epilepsie|epilessia/i).first();
	for (let attempt = 0; attempt < 8; attempt++) {
		if (await presetTile.count()) break;
		if (await roleSelf.count()) await roleSelf.first().click();
		await page.waitForTimeout(500);
	}
	await presetTile.click();
	for (let i = 0; i < 4; i++) {
		const next = page.getByTestId('wizard-next');
		if (await next.count()) {
			await next.first().click();
			await page.waitForTimeout(150);
		}
	}
	const finish = page.getByTestId('wizard-finish');
	if (await finish.count()) await finish.first().click();
}

for (const vp of WIDTHS) {
	test.describe(`mobile overflow — public — ${vp.name} (${vp.width}px)`, () => {
		test.use({ viewport: { width: vp.width, height: vp.height } });
		for (const route of PUBLIC_ROUTES) {
			test(`${route.label}`, async ({ page }) => {
				await checkRoute(page, route.path, route.label, vp);
			});
		}
	});

	test.describe(`mobile overflow — authed (fresh) — ${vp.name} (${vp.width}px)`, () => {
		test.use({ viewport: { width: vp.width, height: vp.height } });
		test.describe.configure({ mode: 'serial' });
		test(`authed routes`, async ({ page }) => {
			await registerAndConfigure(page);
			for (const route of AUTHED_ROUTES) {
				await checkRoute(page, route.path, route.label, vp);
			}
		});
	});

	// The real bug surface: data-rich seeded accounts. Each persona stresses a
	// different cohort's components (epilepsy=discrete bands, endo=cycle strip,
	// MS=relapse multi-day, hypertension=AM/PM split + reference lines).
	for (const persona of ['hans', 'elena', 'lukas', 'klaus']) {
		test.describe(`mobile overflow — seeded:${persona} — ${vp.name} (${vp.width}px)`, () => {
			test.use({ viewport: { width: vp.width, height: vp.height } });
			test.describe.configure({ mode: 'serial' });
			test(`authed routes`, async ({ page }) => {
				await loginSeeded(page, persona);
				for (const route of AUTHED_ROUTES) {
					await checkRoute(page, `${route.path}`, `${persona}__${route.label}`, vp);
				}
			});
		});
	}
}
