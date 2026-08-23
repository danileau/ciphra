/**
 * The in-app docs set is a decision, and this test is what keeps it one.
 *
 * Before the allowlist, `/docs` shipped every top-level `docs/*.md`.
 * That is how ciphra.ch ended up serving patients the operator runbook
 * and the product backlog: nobody chose it, a glob did. The failure mode
 * is silent in both directions — nothing breaks when a doc leaks into
 * the app, and nothing breaks when a doc a user needs quietly stops
 * being shipped.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { IN_APP_DOCS, NOT_IN_APP } from '$lib/docs-manifest';

// frontend/src/lib → repo root is three up.
const REPO = resolve(__dirname, '..', '..', '..');

describe('in-app docs manifest', () => {
	it('every allowlisted document exists', () => {
		const missing = IN_APP_DOCS.filter((rel) => !existsSync(join(REPO, rel)));
		expect(missing, `Allowlisted but missing: ${missing.join(', ')}`).toEqual([]);
	});

	it('every deliberately-excluded document exists', () => {
		// A stale exclusion hides the fact that a doc was renamed, which
		// would let its replacement slip into the app unnoticed.
		const missing = NOT_IN_APP.filter((rel) => !existsSync(join(REPO, rel)));
		expect(missing, `Listed as excluded but missing: ${missing.join(', ')}`).toEqual([]);
	});

	it('no document is both shipped and excluded', () => {
		const both = IN_APP_DOCS.filter((rel) => (NOT_IN_APP as readonly string[]).includes(rel));
		expect(both).toEqual([]);
	});

	it('every docs/*.md is classified — a new doc must be decided about', () => {
		const known = new Set<string>([...IN_APP_DOCS, ...NOT_IN_APP]);
		const unclassified = readdirSync(join(REPO, 'docs'))
			.filter((f) => f.endsWith('.md'))
			.map((f) => `docs/${f}`)
			.filter((rel) => !known.has(rel));

		expect(
			unclassified,
			`New documents in docs/ are neither shipped to users nor explicitly\n` +
				`withheld. Decide: does a patient opening /docs need to read this?\n` +
				`Add it to IN_APP_DOCS or NOT_IN_APP in src/lib/docs-manifest.ts.\n` +
				`Unclassified:\n  ${unclassified.join('\n  ')}\n`,
		).toEqual([]);
	});

	it('the operator runbook and the backlog are not shipped to patients', () => {
		// The specific regression this manifest exists to prevent. Named
		// rather than implied, so deleting the guard is a visible act.
		for (const rel of ['docs/OPERATIONS.md', 'docs/backlog.md']) {
			expect(IN_APP_DOCS as readonly string[]).not.toContain(rel);
		}
	});

	it('the vite plugin reads the manifest instead of globbing docs/', () => {
		const config = readFileSync(join(REPO, 'frontend', 'vite.config.ts'), 'utf8');
		expect(config).toMatch(/IN_APP_DOCS/);
		// The old behaviour: readdirSync over docs/ inside the plugin.
		expect(config).not.toMatch(/readdirSync/);
	});
});
