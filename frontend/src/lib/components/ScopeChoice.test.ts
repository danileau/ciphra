/**
 * The sharing-scope chooser, and the rule that it is shared.
 *
 * Creating an invitation and modifying one have to offer the same two options
 * with the same wording. If they drifted, "modify" would show a different
 * promise from the one the person agreed to when they sent the invitation —
 * and the whole point of the modify flow is that they can trust what it says.
 *
 * The behaviour that matters when modifying: the CURRENT scope is preselected.
 * A chooser that opened on the default would quietly propose narrowing every
 * grant that had been widened, one careless Save away.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, cleanup, within } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import ScopeChoice from './ScopeChoice.svelte';
import { SHARE_MASK_SHARED_ONLY, SHARE_MASK_EVERYTHING } from '$lib/utils/shareClass';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

describe('the chooser', () => {
	afterEach(() => cleanup());

	it('offers exactly the two scopes the product supports', () => {
		const { container } = render(ScopeChoice, {});
		const radios = container.querySelectorAll<HTMLInputElement>('input[type="radio"]');
		expect(radios).toHaveLength(2);
		expect([...radios].map((r) => r.value).sort()).toEqual(['1', '3']);
	});

	it('defaults to the narrow scope', () => {
		// A privacy control does not pre-open itself.
		const { container } = render(ScopeChoice, {});
		const checked = container.querySelector<HTMLInputElement>('input[type="radio"]:checked');
		expect(checked?.value).toBe(String(SHARE_MASK_SHARED_ONLY));
	});

	it('preselects the scope it is given — the modify case', () => {
		const { container } = render(ScopeChoice, { value: SHARE_MASK_EVERYTHING });
		const checked = container.querySelector<HTMLInputElement>('input[type="radio"]:checked');
		expect(
			checked?.value,
			'opening the editor on the default would propose narrowing a widened grant',
		).toBe(String(SHARE_MASK_EVERYTHING));
	});

	it('moves the selection when another scope is picked', async () => {
		const { container } = render(ScopeChoice, { value: SHARE_MASK_SHARED_ONLY });
		await fireEvent.click(within(container).getByDisplayValue(String(SHARE_MASK_EVERYTHING)));

		const checked = container.querySelector<HTMLInputElement>('input[type="radio"]:checked');
		expect(Number(checked!.value)).toBe(SHARE_MASK_EVERYTHING);
	});

	it('keeps two open choosers independent', () => {
		// The create form and an editing row can be open at once; without
		// distinct names the browser treats them as one radio group and
		// selecting in one clears the other.
		const a = render(ScopeChoice, { name: 'scope-new' });
		const b = render(ScopeChoice, { name: 'scope-7' });
		const nameOf = (r: ReturnType<typeof render>) =>
			r.container.querySelector<HTMLInputElement>('input[type="radio"]')!.name;
		expect(nameOf(a)).not.toBe(nameOf(b));
	});
});

describe('creating and modifying cannot drift apart', () => {
	const src = () => read('lib/components/FamilySharing.svelte');

	it('both flows render the same chooser', () => {
		const uses = src().match(/<ScopeChoice\b/g) ?? [];
		expect(uses.length, 'expected the create form and the modify panel').toBe(2);
	});

	it('neither flow hand-rolls its own radios', () => {
		expect(
			src(),
			'a second copy of the options is how the two lists start disagreeing',
		).not.toMatch(/<input[^>]*type="radio"/);
	});

	it('the modify panel opens from a labelled control, not a hidden toggle', () => {
		// It used to be the scope label itself, which toggled on click:
		// nothing said it was clickable and nothing showed the alternative.
		expect(src()).toContain("$t('family.scope_change')");
		expect(src()).toMatch(/on:click=\{\(\) => startEditScope\(g\)\}/);
	});

	it('saving asks before it changes anything', () => {
		const fn = src().slice(src().indexOf('async function saveScope'));
		expect(fn).toMatch(/scope_confirm_widen/);
		expect(fn).toMatch(/scope_confirm_narrow/);
		expect(
			fn.indexOf('confirm('),
			'the confirm has to come before the request, not after',
		).toBeLessThan(fn.indexOf('familyGrantRescope'));
	});

	it('a no-op save does not call the server', () => {
		const fn = src().slice(src().indexOf('async function saveScope'));
		expect(fn).toMatch(/if \(editingMask === current\)/);
	});
});
