/**
 * CIPH-834 — interaction primitives heuristic scan.
 *
 * This test is a soft fence, not a ban. It scans `.svelte` files for
 * duplicated inline patterns that the `Modal` primitive was
 * extracted to cover. (A `ConfirmDelete` primitive existed too; no
 * site ever adopted it and it was removed on 2026-11-12.) When it flags
 * a site, the author has three options:
 *
 *   1. Replace the inline pattern with the primitive (preferred).
 *   2. Add an HTML comment `<!-- primitive-exempt: <reason> -->`
 *      inside the file explaining why the inline copy is justified
 *      (e.g. full-width banner variant that the primitive doesn't
 *      cover, caregiver-only UX that needs a custom modal chrome).
 *   3. Extend the primitive's API to cover the new case, then
 *      swap.
 *
 * False positives are expected — the heuristics are deliberately
 * loose to catch drift, not to tyrannise layout. Tune the allow-
 * list in this file if a genuinely distinct pattern is being mis-
 * flagged repeatedly.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC_ROOT = join(__dirname, '..', '..');
const REPO_ROOT = join(SRC_ROOT, '..');

function walkSvelte(dir: string, acc: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		const s = statSync(full);
		if (s.isDirectory()) {
			if (name === 'node_modules' || name.startsWith('.')) continue;
			walkSvelte(full, acc);
		} else if (name.endsWith('.svelte')) {
			acc.push(full);
		}
	}
	return acc;
}

/**
 * A file is "exempt" for a given primitive if it contains the magic
 * comment `<!-- primitive-exempt: <primitive> … -->` (case-sensitive
 * on the primitive name). The reason text after the colon is for
 * humans; we just check for the primitive name's presence.
 */
function isExempt(src: string, primitive: string): boolean {
	const re = new RegExp(
		`<!--\\s*primitive-exempt\\s*:[^>]*\\b${primitive}\\b[^>]*-->`,
	);
	return re.test(src);
}

/**
 * A file "uses" the primitive if it imports it by module path. We
 * match the #lib path specifically so a coincidental identifier
 * collision in a comment doesn't bypass the check.
 */
function usesPrimitive(src: string, primitive: string): boolean {
	const re = new RegExp(
		`import\\s+${primitive}\\s+from\\s+['"]#lib/components/${primitive}\\.svelte['"]`,
	);
	return re.test(src);
}

describe('CIPH-834 — interaction primitive adoption', () => {
	const files = walkSvelte(SRC_ROOT);

	// --- Modal heuristic ------------------------------------------
	// A Modal-shaped div has both `fixed inset-0` AND `aria-modal`.
	// Bottom sheets, toasts, install banners do not — they use
	// `fixed bottom-…` / `fixed top-…` / no aria-modal. So this is
	// a tight match for dialog-style overlays.
	it('every site with a centred aria-modal uses <Modal> (or is exempt)', () => {
		const offenders: string[] = [];
		for (const f of files) {
			if (f.endsWith('Modal.svelte')) continue;
			const src = readFileSync(f, 'utf8');
			if (!src.includes('aria-modal')) continue;
			if (!/fixed\s+inset-0/.test(src)) continue;
			if (usesPrimitive(src, 'Modal')) continue;
			if (isExempt(src, 'Modal')) continue;
			offenders.push(relative(REPO_ROOT, f));
		}
		expect(
			offenders,
			`Files render an inline aria-modal + fixed-inset-0 dialog but neither import ` +
				`<Modal> nor declare a <!-- primitive-exempt: Modal … --> comment:\n  ` +
				offenders.join('\n  '),
		).toEqual([]);
	});
});
