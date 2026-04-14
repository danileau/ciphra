/**
 * CIPH-831 — typography discipline enforcement test.
 *
 * Scans `.svelte` + `app.css` under `frontend/src/`, pulls out
 * class strings / `@apply` bodies, and flags any `text-*` token
 * that isn't:
 *   - in ALLOWED_TEXT_SIZES (`text-xs` … `text-6xl`),
 *   - in ALLOWED_TEXT_BRACKETS (`text-[11px]`, `text-[10px]`),
 *   - a color token (`text-slate-500`, `text-white`, `text-red-600`,
 *     including `/50` opacity suffix), or a semantic CSS var color,
 *   - a known alignment/decoration/transform token
 *     (`text-center`, `text-left`, `text-right`, `text-justify`,
 *     `text-balance`, `text-pretty`, `text-ellipsis`, `text-clip`,
 *     `text-wrap`, `text-nowrap`, `text-transparent`, `text-current`,
 *     `text-inherit`).
 *
 * Colors are a different concern (tracked via dataPalette.ts and
 * CSS variables); this test is about type *scale* only.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ALLOWED_TEXT_SIZES, ALLOWED_TEXT_BRACKETS } from './typographyTokens';

const SRC_ROOT = join(__dirname, '..');
const REPO_ROOT = join(__dirname, '..', '..');

const SIZE_SET = new Set<string>(ALLOWED_TEXT_SIZES);
const BRACKET_SET = new Set<string>(ALLOWED_TEXT_BRACKETS);

// Anything Tailwind recognises that begins `text-` but isn't a size.
// These names are not sizes — let them pass without checking the
// numeric scale.
const NON_SIZE_KEYWORDS = new Set<string>([
	'text-center',
	'text-left',
	'text-right',
	'text-justify',
	'text-start',
	'text-end',
	'text-balance',
	'text-pretty',
	'text-ellipsis',
	'text-clip',
	'text-wrap',
	'text-nowrap',
	'text-transparent',
	'text-current',
	'text-inherit',
]);

// Tailwind palette color names (common subset). Anything starting
// `text-{colorName}(-\d+)?` is treated as a color, not a size.
const COLOR_NAMES = new Set<string>([
	'slate',
	'gray',
	'zinc',
	'neutral',
	'stone',
	'red',
	'orange',
	'amber',
	'yellow',
	'lime',
	'green',
	'emerald',
	'teal',
	'cyan',
	'sky',
	'blue',
	'indigo',
	'violet',
	'purple',
	'fuchsia',
	'pink',
	'rose',
	'white',
	'black',
	// Project semantic colors (see app.css / tailwind config):
	'brand',
	'ochre',
	'accent',
	'primary',
	'secondary',
	'muted',
	'surface',
	'border',
]);

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

function extractClassContexts(src: string): string[] {
	const out: string[] = [];
	for (const m of src.matchAll(/\bclass\s*=\s*"([^"]*)"/g)) out.push(m[1]);
	for (const m of src.matchAll(/\bclass\s*=\s*'([^']*)'/g)) out.push(m[1]);
	for (const m of src.matchAll(/\bclass\s*=\s*\{`([^`]*)`\}/g)) out.push(m[1]);
	for (const m of src.matchAll(/@apply\s+([^;}\n]+)/g)) out.push(m[1]);
	return out;
}

// Match `text-…` tokens (including bracket form, with optional
// `/50` opacity suffix, and `hover:` / `md:` etc. variants stripped
// by the leading group).
const TEXT_TOKEN_RE = /(?<![\w-])text-(?:\[[^\]]+\]|[\w.\/-]+)/g;

function isColorToken(tok: string): boolean {
	// Strip leading `text-`
	const body = tok.slice('text-'.length);
	// Arbitrary color like `text-[#fff]` or `text-[rgb(...)]`
	if (body.startsWith('[')) {
		const inner = body.slice(1, -1);
		return /^(#|rgb|hsl|var\()/.test(inner);
	}
	// Strip `/50` opacity
	const noOpacity = body.split('/')[0];
	// Split color from shade: e.g. `slate-500` → [`slate`, `500`]
	const parts = noOpacity.split('-');
	return COLOR_NAMES.has(parts[0]);
}

describe('CIPH-831 — typography token discipline', () => {
	const files = walkSvelteAndCss(SRC_ROOT);

	const offenders: Array<{ file: string; tok: string }> = [];

	for (const f of files) {
		const src = readFileSync(f, 'utf8');
		for (const ctx of extractClassContexts(src)) {
			for (const m of ctx.matchAll(TEXT_TOKEN_RE)) {
				const tok = m[0];
				if (SIZE_SET.has(tok)) continue;
				if (BRACKET_SET.has(tok)) continue;
				if (NON_SIZE_KEYWORDS.has(tok)) continue;
				if (isColorToken(tok)) continue;
				offenders.push({ file: relative(REPO_ROOT, f), tok });
			}
		}
	}

	it('every text-* token is an allowed size, bracket, color, or keyword', () => {
		expect(offenders.map((o) => `${o.file}: ${o.tok}`)).toEqual([]);
	});
});
