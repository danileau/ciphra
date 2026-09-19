/**
 * "You are not seeing everything" has to be able to say so (2026-09-19).
 *
 * CIPH-726 added a line under the caregiver banner telling a linked reader how
 * many entries stay private. It counted `type === 'diary' || private === true`
 * in `$documents` — but since per-invite scopes (#176) the SERVER withholds
 * those rows, so the count a caregiver saw was always 0 and the line never
 * rendered for the only audience it exists for. The real number is the
 * server's `withheld`, which the store already keeps.
 *
 * `frontend/src/lib/utils/exportable.ts` names this banner as one of the
 * sentences the whole sharing-scope feature exists to make true — so it gets
 * a guard of its own.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import de from '$lib/i18n/de';
import en from '$lib/i18n/en';
import fr from '$lib/i18n/fr';
import itDict from '$lib/i18n/it';

const LAYOUT = readFileSync(join(__dirname, '+layout.svelte'), 'utf8');
const DOCS_STORE = readFileSync(join(__dirname, '..', 'lib', 'stores', 'documents.ts'), 'utf8');
const ALLOWLIST = readFileSync(join(__dirname, '..', 'lib', 'i18n', 'dynamic-keys.ts'), 'utf8');

describe('the caregiver banner counts what the server withheld', () => {
	it('reads the store, not a filter over documents the caregiver never receives', () => {
		expect(LAYOUT).toMatch(/\{@const hiddenCount = \$caregiverHiddenCount\}/);
		expect(LAYOUT).toMatch(/import \{[^}]*caregiverHiddenCount[^}]*\} from '\$lib\/stores\/documents'/);
		expect(
			LAYOUT,
			'counting diary/private documents client-side is what made this dead',
		).not.toMatch(/hiddenCount = \$documents\.filter/);
	});

	it('still renders the line, and the visible count beside it', () => {
		expect(LAYOUT).toMatch(/\{#if hiddenCount > 0\}/);
		// Both halves are pluralised: the first render of this line said
		// "1 persönliche Einträge".
		expect(LAYOUT).toMatch(/plural\(\$t, \$locale as Locale, 'family\.private_context_shared', visibleCount\)/);
		expect(LAYOUT).toMatch(/plural\(\$t, \$locale as Locale, 'family\.private_context_private', hiddenCount\)/);
		expect(LAYOUT).toMatch(/\{@const visibleCount = \$documents\.length\}/);
	});

	it('the store takes the number from the server', () => {
		expect(DOCS_STORE).toMatch(/caregiverHiddenCount\.set\(\s*\n?\s*linked && typeof withheld === 'number'/);
	});

	it('the superseded string is gone from every locale and from the allowlist', () => {
		for (const [name, dict] of [['de', de], ['en', en], ['fr', fr], ['it', itDict]] as const) {
			const d = dict as Record<string, string>;
			expect(d['family.private_hidden'], `${name} still carries the dead key`).toBeUndefined();
			for (const half of ['shared', 'private']) {
				for (const cat of ['one', 'other']) {
					expect(d[`family.private_context_${half}_${cat}`], `${name} ${half}_${cat}`).toBeTruthy();
				}
			}
			expect(d['family.private_context'], `${name} keeps the un-pluralised sentence`).toBeUndefined();
		}
		expect(ALLOWLIST).not.toMatch(/^\s*'family\.private_hidden',$/m);
	});
});
