/**
 * What we say the server keeps, against what it keeps (2026-09-20).
 *
 * The landing page said: "The server stores an auth-hash, a username,
 * encrypted blobs, and upload timestamps. **That is the entire list.**" The
 * tech page said the documents table holds "only: user_id, encrypted blob,
 * timestamp. No record type." Both were written before schema 9, which added
 * `share_class` — one bit per document saying whether it may be shared, which
 * is a record classification, however small — and `client_key`, an
 * idempotency key on imported records.
 *
 * `docs/SECURITY_MODEL.md` was corrected and lists all of it. The marketing
 * copy was not, so the app shipped two answers to the same question: the
 * failure this project already has a name for, copy promising what nothing
 * enforces.
 *
 * This test reads the columns out of `api/server.py` — CREATE TABLE plus the
 * migrations — and fails when a new one appears that the disclosures do not
 * account for. A claim about storage is only as good as the schema it was
 * written against.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import de from '$lib/i18n/de';
import en from '$lib/i18n/en';
import fr from '$lib/i18n/fr';
import itDict from '$lib/i18n/it';

const ROOT = join(__dirname, '..', '..', '..');
const SERVER = readFileSync(join(ROOT, 'api', 'server.py'), 'utf8');
const SECURITY_MODEL = readFileSync(join(ROOT, 'docs', 'SECURITY_MODEL.md'), 'utf8');
const DICTS: Array<[string, Record<string, string>]> = [
	['de', de as Record<string, string>],
	['en', en as Record<string, string>],
	['fr', fr as Record<string, string>],
	['it', itDict as Record<string, string>],
];

/** Columns of `encrypted_documents`: the CREATE TABLE plus every migration. */
function documentColumns(): string[] {
	const found = new Set<string>();
	const create = SERVER.match(/CREATE TABLE IF NOT EXISTS encrypted_documents \(([\s\S]*?)\)\s*"""/);
	if (create) {
		for (const line of create[1].split('\n')) {
			const m = line.trim().match(/^([a-z_]+)\s+[A-Z]/);
			if (m) found.add(m[1]);
		}
	}
	for (const m of SERVER.matchAll(/ALTER TABLE encrypted_documents ADD COLUMN IF NOT EXISTS ([a-z_]+)/g)) {
		found.add(m[1]);
	}
	return [...found].sort();
}

describe('what the app says the server keeps', () => {
	const columns = documentColumns();

	it('reads the real columns, so this test cannot pass by knowing nothing', () => {
		expect(columns).toContain('encrypted_data');
		expect(columns).toContain('share_class');
		expect(columns).toContain('client_key');
	});

	it('has a column here that SECURITY_MODEL.md does not account for', () => {
		// Each column, and the words the document uses for it. A new column
		// means a new line here — and a decision about whether users are told.
		const DISCLOSED: Record<string, RegExp> = {
			id: /./,
			user_id: /account|user/i,
			encrypted_data: /opaque ciphertext|encrypted document/i,
			created_at: /timestamp/i,
			updated_at: /timestamp/i,
			share_class: /One bit per document/i,
			client_key: /repeated import does not duplicate/i,
		};
		const unaccounted = columns.filter((c) => !DISCLOSED[c]);
		expect(
			unaccounted,
			`New column(s) on encrypted_documents: ${unaccounted.join(', ')}. Add them to ` +
				'docs/SECURITY_MODEL.md ("What the server can see") and to this map.',
		).toEqual([]);
		for (const [col, pattern] of Object.entries(DISCLOSED)) {
			if (!columns.includes(col)) continue;
			expect(SECURITY_MODEL, `SECURITY_MODEL.md does not describe ${col}`).toMatch(pattern);
		}
	});

	for (const [name, dict] of DICTS) {
		it(`${name}: the public claims name the sharing bit instead of closing the list`, () => {
			const landing = dict['landing.security_subtitle'];
			const tech = dict['tech.why_metadata_desc'];
			expect(landing, `${name} landing claim missing`).toBeTruthy();
			expect(tech, `${name} tech claim missing`).toBeTruthy();

			// The phrasings that made the old copy wrong the moment a column
			// was added — a closed list, and "only these three".
			expect(landing).not.toMatch(/that is the entire list|das ist die ganze liste|voilà toute la liste|questa è tutta la lista/i);
			expect(tech).not.toMatch(/stores only:|speichert nur:|stocke uniquement\s*:|memorizza solo:/i);

			const BIT: Record<string, RegExp> = {
				de: /ein Bit/i,
				en: /one bit/i,
				fr: /un bit/i,
				it: /un bit/i,
			};
			expect(landing, `${name} landing claim does not mention the sharing bit`).toMatch(BIT[name]);
			expect(tech, `${name} tech claim does not mention the sharing bit`).toMatch(BIT[name]);
		});
	}

	it('the docs shipped in the app still include the one that lists everything', async () => {
		const { IN_APP_DOCS } = await import('$lib/docs-manifest');
		expect(IN_APP_DOCS).toContain('docs/SECURITY_MODEL.md');
	});
});
