/**
 * Bridge SvelteKit 3's `page` (from `$app/state`) into legacy-mode components.
 *
 * SvelteKit 3 removed `$app/stores`. Its replacement, `page` from `$app/state`,
 * is a runes object, and a legacy `$:` statement only re-runs when an
 * identifier it names at compile time changes. `page` is neither a store nor
 * component state, so `$: tab = page.url.searchParams.get('tab')` runs once
 * and then never again on client-side navigation - with no error.
 *
 * `pageStore(read)` wraps `read(page)` in a readable store (Svelte's
 * `toStore`, which re-evaluates the getter inside an effect, so it tracks the
 * runes state). A legacy component subscribes with `$`, which `$:` does
 * track:
 *
 *     const tabParam = pageStore((p) => p.url.searchParams.get('tab'));
 *     $: tab = $tabParam ?? 'account';
 *
 * Call it during component initialisation (top level of `<script>`): on the
 * server `page` can only be read while rendering. Runes-mode components do not
 * need this - they read `page` directly in `$derived`.
 */
import { page, type Page } from '$app/state';
import { toStore, type Readable } from 'svelte/store';

export function pageStore<T>(read: (p: Page) => T): Readable<T> {
	return toStore(() => read(page));
}
