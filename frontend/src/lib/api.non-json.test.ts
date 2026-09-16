// @vitest-environment jsdom
/**
 * `api.request()` must survive a response that is not JSON.
 *
 * nginx and Cloudflare answer a dead upstream with an HTML 502/503/504 page.
 * `res.json()` threw a SyntaxError on it, and a SyntaxError is not a network
 * error — so an offline-capable write failed outright instead of queueing, and
 * `saveBatch` reported status 0 for what was really a 502. The status has to
 * reach the caller intact; that is what the queue/retry logic keys on.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

function mockFetch(status: number, body: string) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => ({ ok: status >= 200 && status < 300, status, text: async () => body })),
	);
}

const HTML = '<html><head><title>502 Bad Gateway</title></head><body>nginx</body></html>';

describe('api non-JSON responses', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('keeps the status of an HTML 502 instead of throwing', async () => {
		mockFetch(502, HTML);
		const api = await import('./api');
		const res = await api.storeDocument('ct', 1);
		expect(res).toEqual({ ok: false, status: 502, data: {} });
	});

	it('keeps the status of a Cloudflare 504', async () => {
		mockFetch(504, '<!DOCTYPE html><title>Gateway time-out</title>');
		const api = await import('./api');
		const res = await api.updateDocument(3, 'ct', 2);
		expect(res.ok).toBe(false);
		expect(res.status).toBe(504);
	});

	it('never reports a non-JSON 200 as success (captive portal, proxy page)', async () => {
		mockFetch(200, HTML);
		const api = await import('./api');
		const res = await api.getDocuments();
		expect(res.ok).toBe(false);
		expect(res.status).toBe(0);
	});

	it('treats an empty body as an empty object', async () => {
		mockFetch(200, '');
		const api = await import('./api');
		expect(await api.getDocuments()).toEqual({ ok: true, status: 200, data: {} });
	});

	it('still parses a normal JSON body', async () => {
		mockFetch(201, '{"id": 9}');
		const api = await import('./api');
		expect(await api.storeDocument('ct')).toEqual({ ok: true, status: 201, data: { id: 9 } });
	});
});
