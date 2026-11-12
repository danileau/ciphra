/**
 * SvelteKit 3 — /log/[date] follows the date param on client-side navigation.
 *
 * SvelteKit reuses this route component across /log/<a> → /log/<b> (the day
 * arrows, "today", a day clicked in /reports), so `currentDate` must re-derive
 * from the param, or {#key currentDate} never remounts the composer and the
 * previous day's entry stays on screen. With `$app/state` that only holds
 * because the legacy `$:` reads the param through `pageStore()` (see
 * lib/pageStore.ts). The composer is stubbed: this is about which date the
 * page hands it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { flushSync } from 'svelte';

vi.mock('$app/state', () => import('#lib/testing/app-state.svelte.ts'));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), beforeNavigate: vi.fn() }));
vi.mock('#lib/components/EntryComposer.svelte', () => import('#lib/testing/EntryComposerStub.svelte'));
vi.mock('#lib/stores/documents.ts', async () => {
	const { writable } = await import('svelte/store');
	const store = writable([]);
	return { documents: { ...store, load: vi.fn(async () => true) } };
});
vi.mock('#lib/blueprint/index.ts', async (importOriginal) => {
	const { readable } = await import('svelte/store');
	return { ...(await importOriginal<object>()), resolvedBlueprint: readable({}) };
});

import { navigate } from '#lib/testing/app-state.svelte.ts';
import LogPage from './+page.svelte';

afterEach(() => {
	cleanup();
	navigate('/');
});

describe('/log/[date] ⇄ date param', () => {
	it('hands the composer the new date when only the param changes', () => {
		navigate('/log/2026-11-10', { date: '2026-11-10' });
		const { getByTestId } = render(LogPage);
		expect(getByTestId('composer-date').textContent).toBe('2026-11-10');

		navigate('/log/2026-11-11', { date: '2026-11-11' });
		flushSync();
		expect(getByTestId('composer-date').textContent).toBe('2026-11-11');
	});
});
