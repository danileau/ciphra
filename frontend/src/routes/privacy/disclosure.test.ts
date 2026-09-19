/**
 * The privacy page has to match the server (2026-09-19).
 *
 * `privacy.data_body` promises the server stores "only the following
 * categories". The list named credentials, the encrypted vault, and an audit
 * log "of authentication events" — while `api/server.py` also writes a row
 * every time a document is created, updated or deleted, plus family-sharing
 * and admin events, and stores account/invitation bookkeeping that the list
 * did not mention at all. `docs/SECURITY_MODEL.md` had already been corrected;
 * both files ship to users at `/docs`, so the app was serving two
 * contradictory disclosures, one of them the GDPR page.
 *
 * These tests read the server, not a copy of it, so the page cannot quietly
 * drift back — or fall behind a new class of audit event.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import de from '$lib/i18n/de';
import en from '$lib/i18n/en';
import fr from '$lib/i18n/fr';
// `it` is vitest's; the dictionary comes in under its own name.
import itDict from '$lib/i18n/it';

const SERVER = readFileSync(join(__dirname, '..', '..', '..', '..', 'api', 'server.py'), 'utf8');
const PAGE = readFileSync(join(__dirname, '+page.svelte'), 'utf8');
const SECURITY_MODEL = readFileSync(
	join(__dirname, '..', '..', '..', '..', 'docs', 'SECURITY_MODEL.md'),
	'utf8',
);
const DICTS: Array<[string, Record<string, string>]> = [
	['de', de as Record<string, string>],
	['en', en as Record<string, string>],
	['fr', fr as Record<string, string>],
	['it', itDict as Record<string, string>],
];

/** Every event name the server can write, read out of the audit() calls. */
function auditEvents(): string[] {
	const out = new Set<string>();
	for (const m of SERVER.matchAll(/audit\(\s*conn\s*,\s*[^,]+,\s*f?'([A-Z_]+)/g)) out.add(m[1]);
	return [...out].sort();
}

describe('the audit log the page describes is the one the server writes', () => {
	it('the server does log document writes — the fact the page has to carry', () => {
		const events = auditEvents();
		expect(events).toContain('DOC_CREATED');
		expect(events).toContain('DOC_UPDATED');
		expect(events).toContain('DOC_DELETED');
		expect(events).toContain('FAMILY_DOC_CREATED');
	});

	// A new family of events is a disclosure question, not just a code change.
	it('has no audit event outside the families the page names', () => {
		const KNOWN = /^(REGISTER|LOGIN|RECOVERY|PASSWORD|ACCOUNT|ADMIN|FAMILY|DOC)_?/;
		expect(auditEvents().filter((e) => !KNOWN.test(e))).toEqual([]);
	});

	for (const [name, dict] of DICTS) {
		it(`${name}: says the log records writing, and that it never records what`, () => {
			const audit = dict['privacy.data_item_audit'];
			expect(audit, `${name} audit item missing`).toBeTruthy();
			// The old wording scoped the whole log to sign-in events.
			expect(audit).not.toMatch(
				/^(Ein Audit-Log von Authentifizierungsereignissen|An audit log of authentication events)/,
			);
			const WRITES: Record<string, RegExp> = {
				de: /Dokument erstellt, geändert oder gelöscht/,
				en: /document is created, updated or deleted/,
				fr: /document est créé, modifié ou supprimé/,
				it: /documento viene creato, modificato o eliminato/,
			};
			expect(audit, `${name} does not mention document writes`).toMatch(WRITES[name]);
			// The line that keeps it honest in the other direction.
			const NEVER_WHAT: Record<string, RegExp> = {
				de: /nie was/,
				en: /never what/,
				fr: /jamais quoi/,
				it: /mai cosa/,
			};
			expect(audit, `${name} does not say it never records what`).toMatch(NEVER_WHAT[name]);
		});

		it(`${name}: names the account and invitation bookkeeping as its own category`, () => {
			// Invitation labels are stored in plain text — nothing on the page
			// said so, while "only the following categories" claimed the list
			// was complete.
			const book = dict['privacy.data_item_bookkeeping'];
			expect(book, `${name} bookkeeping item missing`).toBeTruthy();
			const PLAIN: Record<string, RegExp> = {
				de: /Klartext/,
				en: /plain text/,
				fr: /en clair/,
				it: /in chiaro/,
			};
			expect(book, `${name} does not disclose the plaintext invitation label`).toMatch(PLAIN[name]);
		});
	}

	it('the page renders every category it claims to list', () => {
		for (const k of ['credentials', 'vault', 'audit', 'bookkeeping']) {
			expect(PAGE, `data_item_${k} is not rendered`).toContain(`privacy.data_item_${k}`);
		}
	});

	it('does not contradict SECURITY_MODEL.md, which ships beside it', () => {
		expect(SECURITY_MODEL).toMatch(/DOC_CREATED/);
		expect(SECURITY_MODEL).toMatch(/never of what you wrote/);
	});
});
