/**
 * CIPH-pi24-2 — public-shell footer + conditions/[id] domain cleanup.
 *
 * Pins three changes:
 *  - Footer Domains <div> block removed (lines 60-66 pre-fix); the user
 *    starts with ciphra.ch only, so an explicit "Domains" list with two
 *    entries was wrong and an explicit list with one entry was awkward UX.
 *  - conditions/[id] og:url + JSON-LD `url` + JSON-LD publisher.url:
 *    ciphra.app → ciphra.ch (consistent with PI v22 L-2/L-3 standardization
 *    on ciphra.ch in app.html).
 *  - `landing.footer_domains` i18n key removed from all 4 locales (orphan
 *    after markup removal; PI v9 i18n-hygiene norm).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FOOTER = readFileSync(
	join(__dirname, 'PublicFooter.svelte'),
	'utf8',
);
const CONDITION_PAGE = readFileSync(
	join(__dirname, '..', '..', 'routes', 'conditions', '[id]', '+page.svelte'),
	'utf8',
);

describe('CIPH-pi24-2 ciphra.app removal', () => {
	it('PublicFooter contains no `ciphra.app` reference', () => {
		expect(FOOTER).not.toMatch(/ciphra\.app/);
	});

	it('PublicFooter contains no `landing.footer_domains` reference', () => {
		// The Domains block + its i18n key were both removed; a stray
		// reference would mean the markup was pruned but the key still
		// fires somewhere.
		expect(FOOTER).not.toMatch(/landing\.footer_domains/);
	});

	it('conditions/[id] og:url uses ciphra.ch', () => {
		expect(CONDITION_PAGE).toMatch(
			/<meta\s+property="og:url"\s+content="https:\/\/ciphra\.ch\/conditions\//,
		);
	});

	it('conditions/[id] JSON-LD has no ciphra.app references', () => {
		// Both the page-level `url` and the publisher.url were stale.
		expect(CONDITION_PAGE).not.toMatch(/ciphra\.app/);
	});

	it('conditions/[id] JSON-LD url uses ciphra.ch', () => {
		// Anchor on the JSON-LD url field (different from og:url syntax).
		expect(CONDITION_PAGE).toMatch(/"url":\s*`https:\/\/ciphra\.ch\/conditions\//);
	});

	it('conditions/[id] JSON-LD publisher.url uses ciphra.ch', () => {
		expect(CONDITION_PAGE).toMatch(/"url":\s*"https:\/\/ciphra\.ch"/);
	});
});

describe('CIPH-pi24-2 landing.footer_domains key removal across all locales', () => {
	for (const locale of ['de', 'en', 'fr', 'it'] as const) {
		it(`${locale}.ts no longer carries landing.footer_domains`, async () => {
			const dict = (await import(`$lib/i18n/${locale}`)).default as Record<string, string>;
			expect(dict['landing.footer_domains']).toBeUndefined();
		});
	}
});
