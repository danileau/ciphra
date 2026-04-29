/**
 * CIPH-882 — Resolve-seam migration guard.
 *
 * Every component or route that iterates `bp.symptomGroups / .triggers /
 * .vitals / .episodeTypes` reactively must read its blueprint reference
 * from `$resolvedBlueprint` (the derived store that merges
 * `customizations.custom*` into the primary collections), NOT the raw
 * `$blueprint` store. Otherwise custom items silently fail to render at
 * that surface.
 *
 * The test scans the full repo for `$blueprint` reactive reads outside
 * the explicit allowlist below. Allowlisted files have a documented
 * reason in this file (NOT a code comment that a reviewer might delete
 * accidentally).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..', '..');

/** Files allowed to read `$blueprint` reactively. */
const ALLOWLIST: ReadonlyArray<{ path: string; reason: string }> = [
	{
		path: 'lib/blueprint/store.ts',
		reason: 'defines `blueprint` and `resolvedBlueprint`',
	},
	{
		path: 'lib/blueprint/customizations.ts',
		reason: 'pure helpers operate on Blueprint values directly',
	},
	{
		path: 'routes/settings/+page.svelte',
		reason:
			'Settings reads BOTH stores: raw `$blueprint` for mutating ' +
			'`customizations.custom*` (the source-of-truth array), ' +
			'`$resolvedBlueprint` for any merged-view rendering.',
	},
	{
		path: 'routes/setup/+page.svelte',
		reason:
			'Wizard works on a local `working` variable; it calls ' +
			'`resolveBlueprint(working)` inline for the step-2 preview ' +
			'rather than going through the store.',
	},
	{
		path: 'routes/migrate/+page.svelte',
		reason: 'Only calls `blueprint.loadFromDocuments()` / `save()` — never iterates fields.',
	},
	// CIPH-917 — `routes/conditions/+page.svelte` removed (merged into
	// the landing #conditions section). Only the per-condition detail
	// page remains.
	{
		path: 'routes/conditions/[id]/+page.svelte',
		reason: 'Only calls `blueprint.save()` to switch presets.',
	},
];

const ALLOW_SET = new Set(ALLOWLIST.map((e) => e.path));

function walkSources(dir: string, acc: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		if (name === 'node_modules' || name.startsWith('.')) continue;
		const full = join(dir, name);
		const s = statSync(full);
		if (s.isDirectory()) walkSources(full, acc);
		else if (
			(name.endsWith('.svelte') || name.endsWith('.ts')) &&
			!name.endsWith('.test.ts') &&
			!name.endsWith('.spec.ts')
		) {
			acc.push(full);
		}
	}
	return acc;
}

describe('CIPH-882 resolve-seam migration', () => {
	const sources = walkSources(SRC_ROOT);

	it('no source outside the allowlist reads `$blueprint` reactively', () => {
		const offenders: { path: string; line: number; text: string }[] = [];
		for (const full of sources) {
			const rel = full.slice(SRC_ROOT.length + 1).replace(/\\/g, '/');
			if (ALLOW_SET.has(rel)) continue;
			const src = readFileSync(full, 'utf8');
			// Match `$blueprint` only when used as a Svelte store auto-
			// subscription (preceded by whitespace or `=` in a reactive
			// statement). The raw word `blueprint` (the store handle for
			// `.save()` etc.) is always allowed.
			// Match `$blueprint` ONLY in expression position — as the
			// right-hand side of an assignment, in an `if`/`return` /
			// destructure / function-arg context. Excludes mentions in
			// comments (which never carry an `=`/`(`/`[`/return/etc. on
			// the same usage). The simplest safe form: `\$blueprint`
			// preceded immediately by `=` `(` `,` `[` `return ` etc.
			const re = /(?:[=(,?:[]|\breturn|\bof|\bin|\btypeof|\bawait|&&|\|\||!\s*)\s*\$blueprint(?![A-Za-z0-9_$])/g;
			const lines = src.split('\n');
			for (let i = 0; i < lines.length; i++) {
				const ln = lines[i];
				if (re.test(ln)) {
					offenders.push({ path: rel, line: i + 1, text: ln.trim() });
				}
				re.lastIndex = 0;
			}
		}
		if (offenders.length > 0) {
			const msg = offenders
				.map((o) => `  ${o.path}:${o.line}  ${o.text}`)
				.join('\n');
			throw new Error(
				`Found ${offenders.length} non-allowlisted \`$blueprint\` reactive reads.\n` +
					`Migrate them to \`$resolvedBlueprint\` so user-added custom items ` +
					`(CIPH-882) render at that surface, OR add the file to ALLOWLIST in ` +
					`customizations-resolveSeam.test.ts with a reason.\n\n${msg}`,
			);
		}
	});

	it('every allowlisted file actually exists', () => {
		for (const entry of ALLOWLIST) {
			const full = join(SRC_ROOT, entry.path);
			expect(statSync(full).isFile()).toBe(true);
		}
	});

	it('allowlist entries have non-empty reasons', () => {
		for (const entry of ALLOWLIST) {
			expect(entry.reason.length).toBeGreaterThan(20);
		}
	});
});
