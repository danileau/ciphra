/**
 * SvelteKit 3 - `$app/stores` → `$app/state` in legacy-mode components.
 *
 * `page` from `$app/state` is runes state. A legacy `$:` statement that reads
 * it directly runs once and then goes stale on every client-side navigation
 * that reuses the mounted component (same route, new URL or params) - no
 * error, the UI just stops following the URL. ciphra's legacy components read
 * `page` through `pageStore()` (lib/pageStore.ts) instead.
 *
 * These tests mount the components, then simulate such a navigation with a
 * runes-backed `$app/state` stand-in (lib/testing/app-state.svelte.ts) and
 * assert that the rendered output follows. They fail if a component goes
 * back to reading `page` inside a `$:` statement.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { get } from 'svelte/store';

vi.mock('$app/state', () => import('#lib/testing/app-state.svelte.ts'));

import { navigate } from '#lib/testing/app-state.svelte.ts';
import { pageStore } from '#lib/pageStore.ts';
import { docList, getDoc } from '#lib/docs.ts';
import { t } from '#lib/i18n/index.ts';
import { conditionInfoMap } from '#lib/conditionInfo.ts';
import BottomNav from '#lib/components/BottomNav.svelte';
import AuthedFooter from '#lib/components/AuthedFooter.svelte';
import DocPage from '../routes/docs/[slug]/+page.svelte';
import ConditionPage from '../routes/conditions/[id]/+page.svelte';

afterEach(() => {
	cleanup();
	navigate('/');
});

function go(path: string, params: Record<string, string> = {}) {
	navigate(path, params);
	flushSync();
}

describe('pageStore bridges runes page state into a store', () => {
	it('emits the new value after a navigation', () => {
		navigate('/settings');
		const pathname = pageStore((p) => p.url.pathname);
		const seen: string[] = [];
		const unsubscribe = pathname.subscribe((v) => seen.push(v));
		go('/settings?tab=sharing');
		go('/reports');
		unsubscribe();
		expect(seen).toEqual(['/settings', '/reports']);
		expect(get(pageStore((p) => p.url.searchParams.get('tab')))).toBeNull();
	});
});

describe('legacy components follow client-side navigation', () => {
	it('BottomNav moves the active tab', () => {
		go('/calendar');
		const { container } = render(BottomNav);
		const active = () =>
			[...container.querySelectorAll('a[aria-current="page"]')].map((a) => a.getAttribute('href'));
		expect(active()).toEqual(['/calendar']);

		go('/journal');
		expect(active()).toEqual(['/journal']);

		// /login hides the nav entirely.
		go('/login');
		expect(container.querySelector('nav')).toBeNull();
	});

	it('AuthedFooter hides on /log/<date> and comes back', () => {
		go('/');
		const { container } = render(AuthedFooter);
		expect(container.querySelector('footer')).not.toBeNull();

		go('/log/2026-11-12', { date: '2026-11-12' });
		expect(container.querySelector('footer')).toBeNull();

		go('/calendar');
		expect(container.querySelector('footer')).not.toBeNull();
	});

	it('/docs/[slug] renders the new document when only the slug changes', () => {
		const [a, b] = docList;
		expect(a && b, 'needs two in-app docs').toBeTruthy();
		go(`/docs/${a.slug}`, { slug: a.slug });
		const { container } = render(DocPage);
		expect(container.querySelector('h1')?.textContent).toBe(getDoc(a.slug)!.meta.title);

		go(`/docs/${b.slug}`, { slug: b.slug });
		expect(container.querySelector('h1')?.textContent).toBe(getDoc(b.slug)!.meta.title);
	});

	it('/conditions/[id] renders the new condition when only the id changes', () => {
		const tr = get(t);
		go('/conditions/epilepsy', { id: 'epilepsy' });
		const { container } = render(ConditionPage);
		const heading = () => container.querySelector('h1')?.textContent?.trim();
		expect(heading()).toBe(tr(conditionInfoMap.epilepsy.titleKey));

		go('/conditions/migraine', { id: 'migraine' });
		expect(heading()).toBe(tr(conditionInfoMap.migraine.titleKey));
	});
});
