/**
 * CIPH-pi24-1 — public-shell header contract.
 *
 * Pins three intertwined changes in `+layout.svelte`:
 *  - Sub-item A: header CTA is a Login button (`auth.login` key, href `/login`),
 *    NOT the prior `kostenlos starten` registration CTA. The 4th instance of
 *    "Get started" in the header was misdirecting returning users; the
 *    landing body still surfaces the registration CTA 3x (hero, conditions,
 *    final).
 *  - Sub-item B: language `<select>` removed from the header — moved to
 *    PublicFooter exclusively, where trust-aware Swiss apps put it.
 *  - Sub-item C: `detectLocale()` returns `'en'` (not `'de'`) when the
 *    browser locale isn't in [de, en, fr, it]. Falls back to a language a
 *    Polish/Spanish visitor can actually read.
 *
 * Regex-on-source mirrors the discipline pattern used by /journal touch-target
 * + security-doc tests.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LAYOUT = readFileSync(join(__dirname, '+layout.svelte'), 'utf8');
const I18N_INDEX = readFileSync(
	join(__dirname, '..', 'lib', 'i18n', 'index.ts'),
	'utf8',
);

describe('CIPH-pi24-1A — header CTA is Login, not registration', () => {
	it('header anchor uses the auth.login i18n key', () => {
		// The auth-flow shell guard (`!== 'auth-flow'`) wraps a single
		// anchor inside the header. That anchor must reference auth.login.
		expect(LAYOUT).toMatch(
			/currentShell\.shell\s*!==\s*'auth-flow'[\s\S]{0,400}\$t\('auth\.login'\)/,
		);
	});

	it('header anchor href is /login (no ?mode=register)', () => {
		// Direct path to the login form, not the signup flow. Returning
		// users tap once and they're back in.
		expect(LAYOUT).toMatch(
			/currentShell\.shell\s*!==\s*'auth-flow'[\s\S]{0,400}href="\/login"[\s\S]{0,200}auth\.login/,
		);
	});

	it('header anchor does NOT use the old landing.hero_cta key', () => {
		// Pin against accidental revert to "kostenlos starten" in the header.
		// Body still uses landing.hero_cta in 3 places (hero, conditions, final
		// CTA) — that's separate and intentional.
		const headerNav = LAYOUT.match(
			/<nav[^>]*aria-label="Primary"[\s\S]+?<\/nav>/,
		);
		expect(headerNav, 'primary nav block must exist').toBeTruthy();
		expect(headerNav![0]).not.toMatch(/landing\.hero_cta/);
	});
});

describe('CIPH-pi24-1B — language picker is footer-only', () => {
	it('header section does NOT contain a <select> for language', () => {
		// The primary nav block in +layout.svelte must not host a language
		// dropdown. PublicFooter handles it.
		const headerNav = LAYOUT.match(
			/<nav[^>]*aria-label="Primary"[\s\S]+?<\/nav>/,
		);
		expect(headerNav, 'primary nav block must exist').toBeTruthy();
		expect(headerNav![0]).not.toMatch(/<select[\s\S]+?on:change=\{setLocale\}/);
		expect(headerNav![0]).not.toMatch(/aria-label=\{?\$?t?\(?['"]common\.language/);
	});

	it('the layout no longer imports `locale`/`locales`/`localeNames` (dead after the move)', () => {
		// PublicFooter has its own copy of these imports; +layout.svelte
		// shouldn't pull them now that the dropdown is gone.
		expect(LAYOUT).not.toMatch(
			/import\s*\{[^}]*\b(locale|locales|localeNames)\b[^}]*\}\s*from\s*['"]\$lib\/i18n['"]/,
		);
	});

	it('the layout no longer defines a `setLocale` handler', () => {
		expect(LAYOUT).not.toMatch(/function\s+setLocale\s*\(/);
	});

	it('PublicFooter still exposes the language picker (regression check)', () => {
		// The picker has to live somewhere; PublicFooter is the canonical home.
		const FOOTER = readFileSync(
			join(__dirname, '..', 'lib', 'components', 'PublicFooter.svelte'),
			'utf8',
		);
		expect(FOOTER).toMatch(/<select[\s\S]+?on:change=\{setLocale\}/);
	});
});

describe('CIPH-pi24-1C — detectLocale falls back to EN, not DE', () => {
	it('the unsupported-locale return value is "en"', () => {
		// Before: `return 'de';` — Polish/Spanish/Portuguese visitor saw
		// German they couldn't read. Now: 'en' as honest international default.
		expect(I18N_INDEX).toMatch(
			/function\s+detectLocale[\s\S]+?return\s+'en';\s*\n\s*\}/,
		);
	});

	it('does NOT contain `return \'de\'` in the detectLocale fallback path', () => {
		// Pin against accidental revert.
		const fnMatch = I18N_INDEX.match(
			/function\s+detectLocale\s*\([^)]*\)\s*:\s*Locale\s*\{[\s\S]+?\n\}/,
		);
		expect(fnMatch, 'detectLocale must exist').toBeTruthy();
		expect(fnMatch![0]).not.toMatch(/^\s*return\s+'de';\s*$/m);
	});
});
