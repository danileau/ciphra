/**
 * CIPH-830 — spacing discipline enforcement test.
 *
 * Scans every `.svelte` file under `frontend/src/` plus `app.css`,
 * pulls out class strings (`class="…"`, `class='…'`, `@apply …;`),
 * and verifies every spacing utility uses a value from
 * ALLOWED_SPACING (or ALLOWED_BRACKET_SPACING for bracket form,
 * or a `rem`/`em`-unit bracket value).
 *
 * Scoped to `gap|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|space-x|space-y`.
 * Prefix-matched with `\b` so `min-h-…`, `max-w-…`, `-mt-…`
 * (negative margins handled below) don't false-match.
 *
 * Ignores `class:foo={…}` reactive class directives (Svelte) —
 * those names are evaluated, not strings. Also ignores `:class`
 * inline JS. Coverage is best-effort-exhaustive, not total; the
 * goal is to catch accidental drift, not adversarial evasion.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ALLOWED_SPACING, ALLOWED_BRACKET_SPACING } from './spacingTokens';

const SRC_ROOT = join(__dirname, '..');
const REPO_ROOT = join(__dirname, '..', '..');

const SPACING_PREFIXES = [
	'gap',
	'px',
	'py',
	'pt',
	'pb',
	'pl',
	'pr',
	'p',
	'mx',
	'my',
	'mt',
	'mb',
	'ml',
	'mr',
	'm',
	'space-x',
	'space-y',
] as const;

// Alternation ordered longest-first so `p-4` isn't eaten by the `p` branch
// before `py` has a chance. Regex is rebuilt in order preserved.
const PREFIX_ALT = SPACING_PREFIXES.slice()
	.sort((a, b) => b.length - a.length)
	.join('|');
// Match things like `gap-4`, `px-2.5`, `-mt-1`, `m-[calc(…)]`.
// Value capture group admits digits+dot, `px`, `auto`, `full`,
// or a bracketed arbitrary value `[…]`.
const CLASS_TOKEN_RE = new RegExp(
	`(?<![\\w-])-?(${PREFIX_ALT})-(\\[[^\\]]+\\]|[\\w.]+)`,
	'g',
);

const ALLOWED_SET = new Set<string>(ALLOWED_SPACING);
const ALLOWED_BRACKET_SET = new Set<string>(ALLOWED_BRACKET_SPACING);

function walkSvelteAndCss(dir: string, acc: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		const s = statSync(full);
		if (s.isDirectory()) {
			if (name === 'node_modules' || name.startsWith('.')) continue;
			walkSvelteAndCss(full, acc);
		} else if (name.endsWith('.svelte') || name === 'app.css') {
			acc.push(full);
		}
	}
	return acc;
}

/**
 * Extract class-attribute and @apply bodies from a file so we don't
 * false-match on e.g. `data-testid="gap-7"` or a comment literal.
 */
function extractClassContexts(src: string): string[] {
	const out: string[] = [];
	// class="…"
	for (const m of src.matchAll(/\bclass\s*=\s*"([^"]*)"/g)) out.push(m[1]);
	// class='…'
	for (const m of src.matchAll(/\bclass\s*=\s*'([^']*)'/g)) out.push(m[1]);
	// class={`…`} tagged template — grab the whole literal
	for (const m of src.matchAll(/\bclass\s*=\s*\{`([^`]*)`\}/g)) out.push(m[1]);
	// @apply …;
	for (const m of src.matchAll(/@apply\s+([^;}\n]+)/g)) out.push(m[1]);
	// class:foo={…} directive — the name before `=` is a literal class
	for (const m of src.matchAll(/\bclass:([\w-]+)/g)) out.push(m[1]);
	return out;
}

function isAllowedValue(val: string): boolean {
	// Bracket form?
	if (val.startsWith('[') && val.endsWith(']')) {
		const inner = val.slice(1, -1);
		if (ALLOWED_BRACKET_SET.has(inner)) return true;
		// Permit rem/em-unit arbitrary values (typography-calc in spacing).
		if (/^[\d.]+(rem|em)$/.test(inner)) return true;
		return false;
	}
	return ALLOWED_SET.has(val);
}

describe('CIPH-830 — spacing token discipline', () => {
	const files = walkSvelteAndCss(SRC_ROOT);

	it('scans a non-trivial number of files', () => {
		expect(files.length).toBeGreaterThan(10);
	});

	const offenders: Array<{ file: string; cls: string; value: string; prefix: string }> = [];

	for (const f of files) {
		const src = readFileSync(f, 'utf8');
		const contexts = extractClassContexts(src);
		for (const ctx of contexts) {
			for (const m of ctx.matchAll(CLASS_TOKEN_RE)) {
				const prefix = m[1];
				const value = m[2];
				if (!isAllowedValue(value)) {
					offenders.push({
						file: relative(REPO_ROOT, f),
						cls: m[0],
						value,
						prefix,
					});
				}
			}
		}
	}

	it('every spacing utility uses an allowed value', () => {
		expect(
			offenders.map((o) => `${o.file}: "${o.cls}" (value: ${o.value})`),
		).toEqual([]);
	});
});
