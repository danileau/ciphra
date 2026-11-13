/**
 * SvelteKit 3 - no legacy `$:` statement may read `page` from `$app/state`.
 *
 * `page` is runes state. A `$:` statement only re-runs when an identifier it
 * names at compile time changes, and `page` is not one of those, so
 * `$: x = page.url…` is computed once and then silently goes stale on
 * client-side navigation. Legacy components read `page` through
 * `pageStore()` (lib/pageStore.ts) instead; plain reads inside functions and
 * one-shot init code are fine. The behavioural proofs are
 * app-state-reactivity.test.ts, routes/settings/tab-navigation.test.ts and
 * routes/log/[date]/date-param.test.ts; this static scan covers every file,
 * including +layout.svelte, which is too entangled to mount in a unit test.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..');

function svelteFiles(dir: string, out: string[] = []): string[] {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		if (e.name === '.svelte-kit' || e.name === 'node_modules') continue;
		const p = join(dir, e.name);
		if (e.isDirectory()) svelteFiles(p, out);
		else if (e.name.endsWith('.svelte')) out.push(p);
	}
	return out;
}

/** Every `$: …` statement in a script, up to its end at bracket depth 0. */
function reactiveStatements(script: string): string[] {
	const out: string[] = [];
	const re = /(^|\n)\s*\$:/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(script))) {
		let depth = 0;
		let i = m.index + m[0].length;
		const start = i;
		for (; i < script.length; i++) {
			const c = script[i];
			if (c === '(' || c === '{' || c === '[') depth++;
			else if (c === ')' || c === '}' || c === ']') depth--;
			else if (depth <= 0 && (c === ';' || c === '\n')) {
				// A newline ends the statement unless the next line continues
				// an expression (leading operator / ternary branch).
				if (c === ';') break;
				const rest = script.slice(i + 1).trimStart();
				if (!/^(\?|:|&&|\|\||\.|\+|-|\*|\/|\?\?)/.test(rest)) break;
			}
		}
		out.push(script.slice(start, i));
	}
	return out;
}

const files = svelteFiles(SRC);
const scriptOf = (src: string) =>
	[...src.matchAll(/<script(?![^>]*context=)[^>]*>([\s\S]*?)<\/script>/g)].map((x) => x[1]).join('\n');

describe('legacy components and $app/state', () => {
	it('nothing imports the removed $app/stores', () => {
		const offenders = files.filter((f) => readFileSync(f, 'utf8').includes("'$app/stores'"));
		expect(offenders.map((f) => relative(SRC, f))).toEqual([]);
	});

	it('the scanner finds $: statements (sanity)', () => {
		const stmts = reactiveStatements(
			"\n\t$: a = (x\n\t\t? y\n\t\t: z);\n\t$: b = f({\n\t\tp: page.url\n\t});\n\tconst c = 1;",
		);
		expect(stmts).toHaveLength(2);
		expect(stmts[1]).toContain('page.url');
	});

	it('no $: statement reads page from $app/state', () => {
		const offenders: string[] = [];
		for (const f of files) {
			const src = readFileSync(f, 'utf8');
			if (!/import\s*\{[^}]*\bpage\b[^}]*\}\s*from\s*'\$app\/state'/.test(src)) continue;
			for (const stmt of reactiveStatements(scriptOf(src))) {
				if (/(^|[^.\w$])page\./.test(stmt)) offenders.push(`${relative(SRC, f)}: $:${stmt.trim()}`);
			}
		}
		expect(offenders, 'read page via pageStore() in legacy components').toEqual([]);
	});
});
