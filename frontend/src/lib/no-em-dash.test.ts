/**
 * No em dash (U+2014) anywhere in the repo.
 *
 * Nobody types it on a normal keyboard, so ciphra does not use it: app copy in
 * all four locales, PDF text, code, comments, docs and the changelog use a
 * plain hyphen instead (operator decision 2026-11-13, PR #258).
 *
 * The character is written as an escape here so this file passes its own check.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const EM_DASH = '\u2014';
const ROOT = join(__dirname, '..', '..', '..');

const TEXT = /\.(ts|js|mjs|cjs|svelte|html|css|json|md|txt|py|sh|ya?ml|conf|toml|cfg|ini|example)$|(^|\/)(VERSION|Dockerfile[^/]*)$/;

// The only places the character may stay, each for a reason that is not prose.
const ALLOWED: Record<string, RegExp> = {
	// Decoders: map the PDF font's WinAnsi byte 0x97 back to the character.
	'frontend/src/lib/pdf.medication-history.test.ts': /0x97: '\u2014'/,
	'frontend/src/lib/pdf.medication-structure.test.ts': /0x97: '\u2014'/,
	'frontend/src/lib/pdf.therapy-report.test.ts': /0x97: '\u2014'/,
	// Input tolerance: a unit a user typed with an em dash still counts as a scale.
	'frontend/src/lib/pdf.ts': /unitIsScale/,
};

// Only what git tracks: gitignored local seeds and fixtures are not the repo.
function files(): string[] {
	return execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
		.split('\0')
		.filter((f) => f && TEXT.test(f) && !f.endsWith('package-lock.json') && !f.includes('/vendor/'));
}

describe('no em dash', () => {
	it(`no file uses ${EM_DASH} (write a plain hyphen)`, () => {
		const hits: string[] = [];
		for (const rel of files()) {
			const lines = readFileSync(join(ROOT, rel), 'utf8').split('\n');
			lines.forEach((line, i) => {
				if (!line.includes(EM_DASH)) return;
				if (ALLOWED[rel]?.test(line)) return;
				hits.push(`${rel}:${i + 1}`);
			});
		}
		expect(hits, `Replace the em dash with a plain hyphen in:\n${hits.join('\n')}`).toEqual([]);
	});

	it('the walk actually covers the locales and the docs', () => {
		const rel = files();
		expect(rel).toContain('frontend/src/lib/i18n/de.ts');
		expect(rel).toContain('CHANGELOG.md');
		expect(rel).toContain('docs/DEVELOPING.md');
	});
});
