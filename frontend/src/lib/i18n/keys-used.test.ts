/**
 * CIPH-835 — i18n key orphan detector.
 *
 * Walks every `.svelte` and `.ts` file under `frontend/src/` (minus
 * tests and node_modules), collects every key passed to `t(...)` or
 * `$t(...)` as a string literal (single/double/backtick without
 * interpolation), and cross-references against the de.ts dictionary.
 *
 * Any de.ts key that is neither referenced statically nor covered by
 * the DYNAMIC_KEY_PREFIXES allowlist in `dynamic-keys.ts` fails the
 * test. The failure message lists the orphans so a reviewer can
 * either delete them (all four locales!) or add a prefix to the
 * allowlist.
 *
 * This is soft by design — the allowlist covers blueprint-driven
 * labels (vital ids, preset titles, phase keys, etc.) that a static
 * grep cannot see. If you add a new family of dynamic keys, add the
 * prefix to `dynamic-keys.ts` with a comment explaining the caller.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import de from './de';
import { DYNAMIC_KEY_PREFIXES, isDynamicKey } from './dynamic-keys';

const SRC_ROOT = join(__dirname, '..', '..');

function walk(dir: string, acc: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		const s = statSync(full);
		if (s.isDirectory()) {
			if (name === 'node_modules' || name.startsWith('.')) continue;
			walk(full, acc);
		} else if (name.endsWith('.svelte') || name.endsWith('.ts')) {
			if (name.endsWith('.test.ts')) continue;
			acc.push(full);
		}
	}
	return acc;
}

// Match `t('foo.bar')`, `$t("foo.bar")`, `t(`foo.bar`)` (no ${…}).
// Key = [A-Za-z0-9_.] segment. Prefix allowed: `$` optional, plus a
// word-boundary to avoid catching `import` etc. The regex hits
// `translator('pdf.foo')` too, which is desirable.
const T_CALL_RE =
	/(?<![\w])\$?t\(\s*(?:'([A-Za-z0-9_.]+)'|"([A-Za-z0-9_.]+)"|`([A-Za-z0-9_.]+)`)\s*[,)]/g;

// PI v15 LB-7 — `plural($t, $locale, 'foo.bar', count)` resolves to
// `foo.bar_one` / `foo.bar_other` / `foo.bar` via Intl.PluralRules.
// Capture the base key from each plural() call so the `_one` / `_other`
// variants don't show up as orphans.
const PLURAL_CALL_RE =
	/\bplural\([^,]+,\s*[^,]+,\s*(?:'([A-Za-z0-9_.]+)'|"([A-Za-z0-9_.]+)"|`([A-Za-z0-9_.]+)`)/g;

const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'];

function collectUsedKeys(files: string[]): Set<string> {
	const used = new Set<string>();
	for (const f of files) {
		const src = readFileSync(f, 'utf8');
		for (const m of src.matchAll(T_CALL_RE)) {
			const key = m[1] || m[2] || m[3];
			if (key) used.add(key);
		}
		for (const m of src.matchAll(PLURAL_CALL_RE)) {
			const baseKey = m[1] || m[2] || m[3];
			if (!baseKey) continue;
			used.add(baseKey);
			for (const cat of PLURAL_CATEGORIES) used.add(`${baseKey}_${cat}`);
		}
	}
	return used;
}

describe('CIPH-835 — i18n key orphan detector', () => {
	const files = walk(SRC_ROOT);

	it('scans a non-trivial number of files', () => {
		expect(files.length).toBeGreaterThan(20);
	});

	it('dynamic-keys allowlist is non-empty and well-formed', () => {
		expect(DYNAMIC_KEY_PREFIXES.length).toBeGreaterThan(0);
		for (const p of DYNAMIC_KEY_PREFIXES) {
			expect(p.endsWith('.') || p.endsWith('_')).toBe(true);
		}
	});

	it('every de.ts key is either used statically or covered by the dynamic allowlist', () => {
		const used = collectUsedKeys(files);
		const allKeys = Object.keys(de as Record<string, string>);

		const orphans: string[] = [];
		for (const key of allKeys) {
			if (used.has(key)) continue;
			if (isDynamicKey(key)) continue;
			orphans.push(key);
		}

		// Soft-fail: if orphans is non-empty the developer either
		// (a) forgot to delete a key after removing its use site, or
		// (b) added a new dynamic family and needs to extend
		// `dynamic-keys.ts`.
		expect(
			orphans,
			`Orphaned i18n keys (${orphans.length}): delete from all 4 locales, OR add a prefix to dynamic-keys.ts.\n${orphans.join('\n')}`,
		).toEqual([]);
	});
});
