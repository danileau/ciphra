/**
 * CIPH-832 — Component inventory discipline.
 *
 * Every `.svelte` file in `frontend/src/lib/components/` must be
 * listed in `README.md` under the "Component inventory" section.
 * Conversely, every component referenced in the inventory must
 * still exist on disk. A mismatch = "someone added/removed a
 * component and forgot to update the README" = fail.
 *
 * The test is intentionally regex-based: we do not parse the
 * README structurally, we just check that each component's file
 * name appears somewhere in the inventory section.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const README = readFileSync(join(here, 'README.md'), 'utf8');

function componentFiles(): string[] {
	return readdirSync(here)
		.filter((f) => f.endsWith('.svelte'))
		.sort();
}

function inventorySection(): string {
	// Everything from "## Component inventory" up to the next `## `
	// (top-level) heading — we deliberately include the
	// "Primitives defined but not yet wired" and "Patterns flagged"
	// subsections because components living there are still
	// inventoried, just not actively wired.
	const start = README.indexOf('## Component inventory');
	expect(start, 'README is missing the "## Component inventory" section').toBeGreaterThanOrEqual(0);
	const rest = README.slice(start + '## Component inventory'.length);
	const nextTop = rest.search(/\n## [^#]/);
	return nextTop >= 0 ? rest.slice(0, nextTop) : rest;
}

describe('CIPH-832: component inventory discipline', () => {
	const section = inventorySection();
	const files = componentFiles();

	it('lists every .svelte file in lib/components/ in the inventory', () => {
		const missing = files.filter((f) => !section.includes(f));
		expect(
			missing,
			`Component files not documented in README.md inventory: ${missing.join(', ')}. ` +
				'Add an entry under "## Component inventory" or remove the file.'
		).toEqual([]);
	});

	it('does not reference a .svelte file that no longer exists', () => {
		// Find every "Foo.svelte" token inside the inventory section
		// and assert each file still exists on disk.
		const referenced = Array.from(section.matchAll(/\b([A-Z][A-Za-z0-9]+\.svelte)\b/g)).map(
			(m) => m[1]
		);
		const unique = Array.from(new Set(referenced));
		const orphaned = unique.filter((name) => !files.includes(name));
		expect(
			orphaned,
			`README.md inventory references files that no longer exist: ${orphaned.join(', ')}. ` +
				'Remove the entry or restore the file.'
		).toEqual([]);
	});
});
