/**
 * Swiss German orthography guard.
 *
 * Swiss German (since 1936) does not use ß ("Eszett"). All German user-
 * facing text in ciphra (a Swiss-targeted product at ciphra.ch) must use
 * 'ss' instead. Examples: "muss" not "muß", "Strasse" not "Straße",
 * "ausser" not "außer", "Klossgefühl" not "Kloßgefühl".
 *
 * This test enforces the rule mechanically. A future contributor pasting
 * Germany-DE source containing ß into the DE dictionary trips this test
 * before it reaches users.
 *
 * Reference: feedback_swiss_german_ss.md.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Swiss German orthography — no ß', () => {
	it('de.ts contains no ß character (use ss instead)', () => {
		const DE = readFileSync(join(__dirname, 'de.ts'), 'utf8');
		const matches = DE.match(/ß/g) || [];
		expect(
			matches.length,
			`de.ts contains ${matches.length} ß character(s). Swiss orthography ` +
				`uses 'ss' instead. Replace and re-run.`,
		).toBe(0);
	});

	it('app.html DE meta strings contain no ß (if any)', () => {
		const APP_HTML = readFileSync(
			join(__dirname, '..', '..', 'app.html'),
			'utf8',
		);
		const matches = APP_HTML.match(/ß/g) || [];
		expect(matches.length).toBe(0);
	});
});
