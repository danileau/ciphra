/**
 * Banned-word lint for the clinical handoff PDF (spec §1.4 + §10).
 *
 * No generated copy in `pdfHandoff.ts` or in any `handoff.*` i18n key
 * may match the banned-word list. Patient-authored free text is
 * exempt — the test scopes only to generated copy, not to user input.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BANNED_WORDS } from './pdfHandoff';

// __dirname here is `src/lib` — locale files live at `src/lib/i18n/*.ts`
// and the source under test is `src/lib/pdfHandoff.ts`.
const LIB_DIR = __dirname;
const LOCALE_FILES = ['de.ts', 'en.ts', 'fr.ts', 'it.ts'].map((f) => join(LIB_DIR, 'i18n', f));

function extractHandoffStrings(localeFile: string): { key: string; value: string }[] {
	const src = readFileSync(localeFile, 'utf-8');
	const out: { key: string; value: string }[] = [];
	// Match `'handoff.something': 'value'` or `"handoff.something": "value"`.
	// Tolerant of either quote style. The value side stops at the closing
	// quote that matches the opener — naive but sufficient for our format.
	const re = /['"](handoff\.[a-z_.]+)['"]\s*:\s*(['"`])([\s\S]*?)\2\s*,/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(src)) !== null) {
		out.push({ key: m[1], value: m[3] });
	}
	return out;
}

describe('pdfHandoff — banned-word lint (CLINICAL_HANDOFF.md §1.4)', () => {
	for (const localeFile of LOCALE_FILES) {
		const locale = localeFile.split('/').pop()!.replace('.ts', '');
		it(`handoff.* strings in ${locale}.ts contain no banned words`, () => {
			const strings = extractHandoffStrings(localeFile);
			expect(strings.length).toBeGreaterThan(0); // sanity — keys exist
			for (const { key, value } of strings) {
				const lowered = value.toLowerCase();
				for (const word of BANNED_WORDS) {
					// Word-boundary check — "control" must match the standalone
					// word, not substrings like "controlled" inside a longer
					// medical term that happens to contain it.
					const wordRe = new RegExp(`\\b${word}\\b`, 'i');
					expect(
						wordRe.test(lowered),
						`Banned word "${word}" found in ${key} (${locale}.ts): "${value}"`,
					).toBe(false);
				}
			}
		});
	}

	it('pdfHandoff.ts source contains no banned-word string literals in user-facing copy', () => {
		const src = readFileSync(join(LIB_DIR, 'pdfHandoff.ts'), 'utf-8');
		// Strip comments + BANNED_WORDS literal + enum/property comparisons
		// against single-token identifiers (e.g. `=== 'trend'` against the
		// blueprint `primaryBrowseSurface` enum is NOT user copy).
		const stripped = src
			.replace(/\/\/.*/g, '')
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/export const BANNED_WORDS[\s\S]*?\];/g, '');

		for (const word of BANNED_WORDS) {
			// Match a string literal that contains the word AND has
			// surrounding user-copy context (a space, punctuation, or
			// >2 chars beyond the word). Bare single-token enum literals
			// like `'trend'` slip through, which is intended — they're
			// schema identifiers, not generated copy.
			const userCopyRe = new RegExp(
				`['"\`](?:[^'"\`]*\\s[^'"\`]*\\b${word}\\b|\\b${word}\\b[^'"\`]*\\s[^'"\`]*)['"\`]`,
				'i',
			);
			expect(
				userCopyRe.test(stripped),
				`Banned word "${word}" found inside user-copy string in pdfHandoff.ts`,
			).toBe(false);
		}
	});
});
