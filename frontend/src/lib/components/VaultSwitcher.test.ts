/**
 * Vault switcher — the caregiver's "Ansicht: <account>" control.
 *
 * Reported from production: clicking it opened an unstyled, broken dropdown.
 * It was a native `<select>` carrying `bg-transparent`, so the open options
 * panel had no background of its own and fell back to UA chrome — worst in
 * dark mode, where a light panel sat under near-white option text.
 *
 * app.css (═══ STYLED SELECT ═══) and LocaleSelect.svelte both already say why
 * this cannot be fixed with CSS: the options panel is browser chrome the
 * cascade cannot reach. So the guards here are (a) the native control does not
 * come back, (b) the replacement is a real listbox, and (c) neither this
 * component nor the caregiver banner paints a hardcoded light-theme ochre —
 * that is the half of the bug that only shows in dark mode.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, within } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { get } from 'svelte/store';

import VaultSwitcher from './VaultSwitcher.svelte';
import { activeVault } from '$lib/stores/familyLinks';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

const LINKS = [
	{ sourceUserId: 7, sourceUsername: 'hans', patientMasterKey: new Uint8Array(32), revoked: false },
	{ sourceUserId: 9, sourceUsername: 'elena', patientMasterKey: new Uint8Array(32), revoked: false },
] as never[];

describe('the panel is ours, not the browser’s', () => {
	// This setup configures no auto-cleanup, so each render is torn down by
	// hand and every query is scoped to its own container.
	beforeEach(() => activeVault.set(null));
	afterEach(() => cleanup());

	function mount() {
		const { container } = render(VaultSwitcher, { links: LINKS });
		const scope = within(container);
		return { scope, trigger: scope.getByRole('button') };
	}

	it('opens a listbox with one row per vault plus your own', async () => {
		const { scope, trigger } = mount();
		expect(scope.queryByRole('listbox')).toBeNull();

		await fireEvent.click(trigger);

		expect(scope.getAllByRole('option')).toHaveLength(3); // self + hans + elena
	});

	it('renders no native <select> — the panel it could not style', () => {
		const { container } = render(VaultSwitcher, { links: LINKS });
		expect(container.querySelector('select')).toBeNull();
	});

	it('puts your own vault first, so the way back is never buried', async () => {
		const { scope, trigger } = mount();
		await fireEvent.click(trigger);

		expect(scope.getAllByRole('option')[0].getAttribute('aria-selected')).toBe('true');
	});

	it('switches the vault when a row is picked', async () => {
		const { scope, trigger } = mount();
		await fireEvent.click(trigger);
		await fireEvent.click(scope.getByRole('option', { name: /hans/ }));

		expect(get(activeVault)).toBe(7);
		expect(scope.queryByRole('listbox'), 'picking closes the panel').toBeNull();
	});

	it('closes on Escape without changing the vault', async () => {
		const { scope, trigger } = mount();
		await fireEvent.click(trigger);
		await fireEvent.keyDown(window, { key: 'Escape' });

		expect(scope.queryByRole('listbox')).toBeNull();
		expect(get(activeVault)).toBeNull();
	});

	it('announces itself as a popup for assistive tech', async () => {
		const { trigger } = mount();

		expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		await fireEvent.click(trigger);
		expect(trigger.getAttribute('aria-expanded')).toBe('true');
	});
});

describe('the native control does not come back', () => {
	it('the header has no <select> for the vault', () => {
		const src = read('routes/+layout.svelte');
		expect(src).toContain('<VaultSwitcher');
		expect(
			src,
			'a native <select> cannot style its options panel — see VaultSwitcher.svelte',
		).not.toMatch(/<select[\s\S]{0,400}?family\.switcher/);
	});
});

describe('both themes', () => {
	// `--ochre-rgb` is redefined under [data-theme='dark'] (app.css); the
	// literal is the light-theme value and stays light on a dark surface.
	const LIGHT_OCHRE = /rgba\(\s*159\s*,\s*99\s*,\s*11/;

	it('the switcher tints with the themed token', () => {
		const src = read('lib/components/VaultSwitcher.svelte');
		expect(src).not.toMatch(LIGHT_OCHRE);
		expect(src).toContain('rgba(var(--ochre-rgb)');
	});

	it('the caregiver banner tints with the themed token', () => {
		const src = read('routes/+layout.svelte');
		expect(src).not.toMatch(LIGHT_OCHRE);
	});

	it('every colour in the panel is a token', () => {
		const src = read('lib/components/VaultSwitcher.svelte');
		const styles = src.slice(src.indexOf('<style>'));
		// A raw hex in the panel is how one theme ends up right and the other
		// wrong — the whole shape of the reported bug.
		expect(styles).not.toMatch(/:\s*#[0-9a-fA-F]{3,8}\b/);
	});
});
