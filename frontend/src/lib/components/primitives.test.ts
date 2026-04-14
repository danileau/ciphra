/**
 * CIPH-834 — interaction primitives heuristic scan.
 *
 * This test is a soft fence, not a ban. It scans `.svelte` files for
 * duplicated inline patterns that the new primitives
 * (`ConfirmDelete`, `Modal`) were extracted to cover. When it flags
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
 * match the $lib path specifically so a coincidental identifier
 * collision in a comment doesn't bypass the check.
 */
function usesPrimitive(src: string, primitive: string): boolean {
	const re = new RegExp(
		`import\\s+${primitive}\\s+from\\s+['"]\\$lib/components/${primitive}\\.svelte['"]`,
	);
	return re.test(src);
}

describe('CIPH-834 — interaction primitive adoption', () => {
	const files = walkSvelte(SRC_ROOT);

	// --- ConfirmDelete heuristic ----------------------------------
	// The inline pattern we look for: a literal `yes_delete` i18n
	// key adjacent (within 400 chars) to a `cancel` key. This
	// catches the red button + cancel button pair used on entry
	// rows. `common.yes_delete` and `common.cancel` are both
	// exclusive to this pattern — there's no other use of either
	// in the codebase. If the caller is using `<ConfirmDelete>`,
	// those literals live in the primitive, not in the caller.
	it('every site rendering yes_delete + cancel inline uses <ConfirmDelete> (or is exempt)', () => {
		const offenders: string[] = [];
		for (const f of files) {
			// Skip the primitive's own source and this test file.
			if (f.endsWith('ConfirmDelete.svelte')) continue;
			const src = readFileSync(f, 'utf8');
			if (!src.includes('yes_delete')) continue;
			// Look for the pair: yes_delete … cancel within a short window.
			const idx = src.indexOf('yes_delete');
			const window = src.slice(Math.max(0, idx - 400), idx + 400);
			if (!/\bcancel\b/.test(window)) continue;
			// This file references the pattern. Does it use the primitive,
			// or claim exemption?
			if (usesPrimitive(src, 'ConfirmDelete')) continue;
			if (isExempt(src, 'ConfirmDelete')) continue;
			offenders.push(relative(REPO_ROOT, f));
		}
		expect(
			offenders,
			`Files render an inline yes-delete/cancel pair but neither import ` +
				`<ConfirmDelete> nor declare a <!-- primitive-exempt: ConfirmDelete … --> comment:\n  ` +
				offenders.join('\n  '),
		).toEqual([]);
	});

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
