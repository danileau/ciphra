// @vitest-environment jsdom
/**
 * Session-expiry interceptor — `api.request()` must fire `ciphra:unauthorized`
 * when an AUTHENTICATED call (token attached) gets a 401 from a non-auth
 * endpoint, so the shell can clear auth + redirect instead of rendering a
 * stale-looking logged-in view. It must NOT fire for credential 401s on the
 * auth endpoints, when no token is present, or on success.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function mockFetch(status: number) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => ({ ok: status < 400, status, json: async () => ({}) })),
	);
}

function firedUnauthorized(spy: ReturnType<typeof vi.spyOn>): boolean {
	return spy.mock.calls.some((c) => (c[0] as Event)?.type === 'ciphra:unauthorized');
}

describe('api 401 session-expiry interceptor', () => {
	let dispatchSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		localStorage.setItem('ciphra_auth', JSON.stringify({ token: 'tok' }));
		dispatchSpy = vi.spyOn(window, 'dispatchEvent');
	});
	afterEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('fires on a 401 to an authenticated endpoint', async () => {
		mockFetch(401);
		const api = await import('./api');
		await api.getDocuments();
		expect(firedUnauthorized(dispatchSpy)).toBe(true);
	});

	it('does NOT fire on a 401 to an auth endpoint (bad credentials)', async () => {
		mockFetch(401);
		const api = await import('./api');
		await api.loginInit('user');
		expect(firedUnauthorized(dispatchSpy)).toBe(false);
	});

	it('does NOT fire when no token is present', async () => {
		localStorage.removeItem('ciphra_auth');
		mockFetch(401);
		const api = await import('./api');
		await api.getDocuments();
		expect(firedUnauthorized(dispatchSpy)).toBe(false);
	});

	it('does NOT fire on a successful response', async () => {
		mockFetch(200);
		const api = await import('./api');
		await api.getDocuments();
		expect(firedUnauthorized(dispatchSpy)).toBe(false);
	});
});
