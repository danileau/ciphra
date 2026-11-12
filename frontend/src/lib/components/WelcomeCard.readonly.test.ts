/**
 * The migrated-user welcome card's epilepc note.
 *
 * Until 2026-11-12 the title read "epilepc closes {date}" while the component
 * passed `date` to the BODY key, which has no placeholder — so every migrated
 * user saw a literal "{date}", next to a shutdown date that had already
 * passed. epilepc is read-only until at least the end of 2026; what follows is
 * decided from usage.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import de from '../i18n/de';
import en from '../i18n/en';
import fr from '../i18n/fr';
import it_ from '../i18n/it';

const KEYS = ['welcome.migrated_readonly_title', 'welcome.migrated_readonly_body'] as const;
const LOCALES = { de, en, fr, it: it_ } as Record<string, Record<string, string>>;

describe('WelcomeCard epilepc read-only note', () => {
	for (const [name, dict] of Object.entries(LOCALES)) {
		it(`${name}: no unfilled placeholder, no past shutdown date`, () => {
			for (const k of KEYS) {
				expect(dict[k], `${name} ${k}`).toBeTruthy();
				expect(dict[k], `${name} ${k}`).not.toMatch(/\{\w+\}/);
				expect(dict[k], `${name} ${k}`).not.toMatch(/2026-10-31|31\.10\./);
			}
		});
	}

	it('the component passes no params to these keys', () => {
		const src = readFileSync(join(__dirname, 'WelcomeCard.svelte'), 'utf8');
		expect(src).not.toMatch(/welcome\.migrated_readonly_\w+',\s*\{/);
	});
});
