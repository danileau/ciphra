/**
 * D4 (docs-reset sprint) — documentation anti-rot guard.
 *
 * The repository's markdown docs rotted because nothing ever checked
 * them: stale specs, dead file references, PI-cycle scratch committed by
 * accident. This test is the mechanism that keeps it from happening
 * again. It fails when:
 *   - a canonical doc goes missing,
 *   - a doc links to a repo file that no longer exists (the exact rot
 *     that left CONTINUE_TOMORROW.md pointing at a deleted renderer),
 *   - PI-cycle scratch gets committed to the repo.
 *
 * Mirrors `blueprint/labels-audit-doc.test.ts` — a doc guarded by a test.
 * The written half of the rule lives in docs/DEVELOPING.md (Conventions).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

// frontend/src/lib/ → the repo root is three directories up.
const REPO = resolve(__dirname, '..', '..', '..');

/** The canonical, maintained doc set D3 established. */
const CANONICAL = [
	'README.md',
	'SECURITY.md',
	'docs/ARCHITECTURE.md',
	'docs/DEVELOPING.md',
	'docs/FEATURES.md',
];

/** Drop fenced + inline code so `[x](y)`-looking examples aren't linted. */
function stripCode(md: string): string {
	return md.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
}

/** Markdown link targets — the `target` of every `[text](target)`. */
function linkTargets(md: string): string[] {
	const targets: string[] = [];
	const re = /\[[^\]]*\]\(([^)\s]+)/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(stripCode(md)))) targets.push(m[1].trim());
	return targets;
}

describe('docs-reset D4 — documentation anti-rot guard', () => {
	it('every canonical doc exists', () => {
		const missing = CANONICAL.filter((d) => !existsSync(join(REPO, d)));
		expect(missing, `Missing canonical docs: ${missing.join(', ')}`).toEqual([]);
	});

	it('no internal doc link points at a file that no longer exists', () => {
		const broken: string[] = [];
		for (const doc of CANONICAL) {
			const abs = join(REPO, doc);
			for (const target of linkTargets(readFileSync(abs, 'utf8'))) {
				if (/^(https?:|mailto:|#)/.test(target)) continue; // external / anchor
				const path = target.split('#')[0];
				if (path && !existsSync(resolve(dirname(abs), path))) {
					broken.push(`${doc} → ${target}`);
				}
			}
		}
		expect(broken, `Dead links in docs:\n${broken.join('\n')}`).toEqual([]);
	});

	it('no PI-cycle scratch is committed to the repo root or docs/', () => {
		// PI-cycle planning notes, review memos, and session hand-offs
		// belong in memory/, never the repo — see docs/DEVELOPING.md.
		const SCRATCH = /^(PI_V|CONTINUE_)|_DOGFOOD|_REVIEW_pi|_RETRIAGE|_REPLAN/i;
		const offenders: string[] = [];
		for (const dir of ['', 'docs']) {
			for (const f of readdirSync(join(REPO, dir))) {
				if (f.endsWith('.md') && SCRATCH.test(f)) offenders.push(join(dir, f));
			}
		}
		expect(
			offenders,
			`Scratch committed to the repo (these belong in memory/): ${offenders.join(', ')}`,
		).toEqual([]);
	});
});
