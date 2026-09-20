/**
 * One dropdown, not two (2026-09-20).
 *
 * ciphra spent a year with two kinds of dropdown. Three components rolled
 * their own listbox, each writing open/close, outside-click, Escape, keyboard
 * navigation and placement again — and every form that needed a choice used a
 * native `<select>`, because writing a fourth listbox by hand was not worth
 * it. The result reached a user as "most of the dropdowns show the list on
 * top of the clicked field, and some show it only while the click is held":
 * both are platform behaviours of a control whose options panel is browser
 * chrome, and neither was reachable from this codebase.
 *
 * `Listbox.svelte` is the primitive that was missing. This test keeps it the
 * only one, because the cheap path is what spread the native control before:
 * a `<select>` is four lines, a listbox was two hundred.
 *
 * If a new `<select>` genuinely belongs somewhere, this test is the place to
 * say why — add the file to ALLOWED with a sentence.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', '..');

/** The one place a native `<select>` is deliberate: below 640px the phone's
 *  own picker is the better control, and Listbox falls back to it. */
const ALLOWED = new Set(['lib/components/Listbox.svelte']);

function walk(dir: string, acc: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) {
			if (name === 'node_modules' || name.startsWith('.')) continue;
			walk(full, acc);
		} else if (name.endsWith('.svelte')) acc.push(full);
	}
	return acc;
}

/** `<select` in markup, not in a comment about one. */
function opensASelect(source: string): boolean {
	const withoutComments = source
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/^\s*\/\/.*$/gm, '');
	return /<select[\s>]/.test(withoutComments);
}

describe('the app has one dropdown', () => {
	it('no component reaches for a native <select> of its own', () => {
		const offenders = walk(SRC)
			.filter((f) => opensASelect(readFileSync(f, 'utf8')))
			.map((f) => f.slice(SRC.length + 1))
			.filter((f) => !ALLOWED.has(f));
		expect(
			offenders,
			`These render a native <select>: ${offenders.join(', ')}. Its options panel is ` +
				'browser chrome — it cannot be styled, placed, or kept open on mouse-up. ' +
				'Use Listbox.svelte, or add the file to ALLOWED here with the reason.',
		).toEqual([]);
	});

	it('the fallback inside Listbox is the narrow-viewport one, and says so', () => {
		const src = readFileSync(join(SRC, 'lib', 'components', 'Listbox.svelte'), 'utf8');
		expect(src).toMatch(/max-width: 639px/);
		expect(src).toMatch(/isNarrow/);
	});

	it('the listboxes that predate it delegate rather than duplicate', () => {
		// LocaleSelect was the original hand-rolled one; it is now a binding.
		const locale = readFileSync(join(SRC, 'lib', 'components', 'LocaleSelect.svelte'), 'utf8');
		expect(locale).toMatch(/import Listbox from/);
		expect(locale.split('\n').length).toBeLessThan(60);
		expect(locale, 'behaviour belongs in the primitive').not.toMatch(/addEventListener\('click'/);
	});
});
