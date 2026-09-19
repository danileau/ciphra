/**
 * Text translated once, before the dictionary arrived (2026-09-19).
 *
 * Only German is bundled; `en`, `fr` and `it` are dynamic imports, so for the
 * first frames of a cold load `$t` returns the German fallback while
 * `$locale` is already right. Anything translated ONCE in that window stays
 * German for the life of the page. Found in the Italian pass:
 *
 *  - `/calendar` built each cell's aria-label in a function called straight
 *    from the template. The template named neither `$t` nor the documents, so
 *    after a reload every cell read "17 settembre 2026, kein Eintrag" — the
 *    wrong language AND the wrong fact, since the entries had loaded since.
 *  - `/join/[grantId]` resolved its error message inside `onMount`. An invite
 *    link is always a cold load, so a French or Italian caregiver with a
 *    broken link got a German sentence on the only ciphra screen they see.
 *
 * Both are source-shape asserts, like the other discipline tests here: the
 * bug is invisible to a render test, which has the dictionary from the start.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CAL = readFileSync(join(__dirname, 'calendar', '+page.svelte'), 'utf8');
const JOIN = readFileSync(join(__dirname, 'join', '[grantId]', '+page.svelte'), 'utf8');

describe('the calendar re-labels its cells when the dictionary arrives', () => {
	it('builds the labels in a reactive block, not in the template', () => {
		expect(CAL).toMatch(/\$:\s*dayAriaLabels\s*=/);
		expect(CAL).toMatch(/aria-label=\{dayAriaLabels\.get\(day\)/);
		// A bare call in the template is what broke it.
		expect(CAL).not.toMatch(/aria-label=\{dayAriaLabel\(day\)\}/);
	});

	it('names every store the labels read, so a late load rebuilds them', () => {
		const block = CAL.match(/\$:\s*dayAriaLabels\s*=\s*\(\(\)\s*=>\s*\{[\s\S]+?\}\)\(\);/);
		expect(block, 'the reactive label block must exist').toBeTruthy();
		for (const dep of ['$t', '$locale', 'docsByDay', 'medChangeDays', 'monthPrefix']) {
			expect(block![0]).toContain(dep);
		}
	});
});

describe('the family-invite page translates at render', () => {
	it('stores a key during onMount, never a finished sentence', () => {
		const onMount = JOIN.slice(JOIN.indexOf('onMount('));
		expect(onMount).toMatch(/errorKey\s*=\s*'family\.error_bad_link'/);
		expect(JOIN).not.toMatch(/errorMsg\s*=\s*\$t\(/);
	});

	it('resolves it through a function that takes `t`, so it re-runs', () => {
		expect(JOIN).toMatch(/\$:\s*errorMessage\s*=\s*translateError\(\$t,/);
		expect(JOIN).toMatch(/function translateError\(\s*\n?\s*t:/);
	});
});
