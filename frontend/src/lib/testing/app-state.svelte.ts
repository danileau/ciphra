/**
 * vitest stand-in for SvelteKit's `$app/state`.
 *
 * Like the real module, `page` is runes state that a client-side navigation
 * replaces field by field (`url` and `params` get new values, the object
 * itself stays the same). A test mocks the module with this file and calls
 * `navigate()` to simulate a navigation that reuses the mounted component:
 *
 *     vi.mock('$app/state', () => import('#lib/testing/app-state.svelte.ts'));
 *
 * That is exactly the case a legacy `$:` statement reading `page` directly
 * misses — see lib/pageStore.ts.
 */
import type { Page } from '$app/state';

const internal = $state({
	url: new URL('http://localhost/'),
	params: {} as Record<string, string>,
});

export const page = {
	get url() {
		return internal.url;
	},
	get params() {
		return internal.params;
	},
} as unknown as Page;

export function navigate(path: string, params: Record<string, string> = {}): void {
	internal.url = new URL(path, 'http://localhost');
	internal.params = params;
}
