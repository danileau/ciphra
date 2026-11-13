/**
 * SvelteKit 3 - the settings tab follows the URL on client-side navigation.
 *
 * The tab is `?tab=…`, and switching tabs is a same-route `goto` that reuses
 * the mounted page. With `$app/state` that only works because the legacy
 * `$: tab = …` reads the param through `pageStore()`; reading `page` inside
 * the `$:` directly leaves the first tab on screen forever (see
 * lib/pageStore.ts). This mounts the page, clicks a tab and follows the
 * `goto` the way SvelteKit does - by updating `page` - then checks the panel.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { flushSync, tick } from 'svelte';

vi.mock('$app/state', () => import('#lib/testing/app-state.svelte.ts'));
const { goto } = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto }));
vi.mock('#lib/stores/documents.ts', async () => {
	const { writable } = await import('svelte/store');
	const store = writable([]);
	return { documents: { ...store, load: vi.fn(async () => true) } };
});

import { navigate } from '#lib/testing/app-state.svelte.ts';
import SettingsPage from './+page.svelte';

afterEach(() => {
	cleanup();
	goto.mockReset();
	navigate('/');
});

const visiblePanel = (c: HTMLElement) =>
	[...c.querySelectorAll('[role="tabpanel"]')].map((p) => p.id);

describe('settings tab ⇄ URL', () => {
	it('switches the panel when the ?tab= param changes on the mounted page', async () => {
		navigate('/settings');
		const { container } = render(SettingsPage);
		expect(visiblePanel(container)).toEqual(['tabpanel-account']);

		navigate('/settings?tab=sharing');
		flushSync();
		expect(visiblePanel(container)).toEqual(['tabpanel-sharing']);

		navigate('/settings');
		flushSync();
		expect(visiblePanel(container)).toEqual(['tabpanel-account']);
	});

	it('a tab click replaces the history entry without resetting scroll or focus', async () => {
		navigate('/settings');
		// Unauthenticated, onMount also sends the page to /login; only the
		// tab navigation is followed here.
		goto.mockImplementation(async (url: string) => {
			if (url.startsWith('/settings')) navigate(url);
		});
		const { container } = render(SettingsPage);

		const tab = container.querySelector<HTMLElement>('#tab-tracking');
		expect(tab).not.toBeNull();
		await fireEvent.click(tab!);
		await tick();

		expect(goto).toHaveBeenCalledWith('/settings?tab=tracking', { replace: true, reset: false });
		flushSync();
		expect(visiblePanel(container)).toEqual(['tabpanel-tracking']);
	});
});
