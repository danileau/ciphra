/**
 * CIPH-882 — labels-audit.md doc-existence + freshness guard.
 *
 * The audit file at `lib/labels-audit.md` is the inventory the rest of
 * the CIPH-882 render-coverage tests walk. This file simply asserts the
 * doc exists, has a non-trivial size, and that every file path it
 * references is real on disk. Drift between the doc and the source tree
 * fails this test and the PR cannot land.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, isAbsolute, join } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..', '..');
const AUDIT_PATH = resolve(SRC_ROOT, 'lib', 'labels-audit.md');

describe('CIPH-882 labels-audit.md', () => {
	it('exists and is non-trivially sized', () => {
		expect(existsSync(AUDIT_PATH)).toBe(true);
		const size = statSync(AUDIT_PATH).size;
		// 2 KB minimum — tiny enough that a stub doesn't slip through.
		expect(size).toBeGreaterThan(2000);
	});

	const audit = existsSync(AUDIT_PATH) ? readFileSync(AUDIT_PATH, 'utf8') : '';

	it('references every CIPH-882 render surface', () => {
		// Spot-check the inventory covers each of the four kinds + the
		// PDF pipeline + Reports + Calendar + Setup wizard.
		expect(audit).toContain('lib/components/EntryPreview.svelte');
		expect(audit).toContain('lib/components/EntryComposer.svelte');
		expect(audit).toContain('lib/components/PhaseContextCard.svelte');
		expect(audit).toContain('routes/calendar/+page.svelte');
		expect(audit).toContain('routes/reports/+page.svelte');
		expect(audit).toContain('routes/setup/+page.svelte');
		expect(audit).toContain('routes/+layout.svelte');
		expect(audit).toContain('lib/pdf.ts');
	});

	it('every backtick-quoted file path bulleted in the audit exists on disk', () => {
		// Pull file paths from inline-code spans on bullet lines, e.g.
		//   - `lib/components/EntryPreview.svelte` — ...
		const re = /^-\s+`([^`]+)`/gm;
		const matches = Array.from(audit.matchAll(re), (m) => m[1]);
		expect(matches.length).toBeGreaterThan(8);
		const missing: string[] = [];
		for (const rel of matches) {
			if (isAbsolute(rel)) continue; // skip absolute paths
			// Strip any trailing line-info or fragment:
			const cleaned = rel.split(/[#:]/)[0].trim();
			const full = join(SRC_ROOT, cleaned);
			if (!existsSync(full)) missing.push(rel);
		}
		expect(missing, `Missing files referenced from labels-audit.md:\n${missing.join('\n')}`).toEqual([]);
	});

	it('explains the discriminator branch pattern', () => {
		expect(audit).toMatch(/isCustomItem\(/);
		expect(audit).toContain('labelOf');
	});
});
