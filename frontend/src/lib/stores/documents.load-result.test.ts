/**
 * Regression — documents.load() must report whether the SERVER fetch actually
 * succeeded via its boolean return value.
 *
 * The setup-redirect bug (2026-06-16): on a CACHELESS device (brand-new
 * browser/phone, no IndexedDB fallback) a transient first-login fetch failure
 * left $documents empty. The old load() resolved void regardless, so the
 * layout flipped `docsLoaded = true`, blueprint.loadFromDocuments() found no
 * blueprint, and the setup-redirect guard bounced a fully-set-up returning
 * user onto the wizard — until a manual refresh re-fetched successfully.
 *
 * The fix makes load() return `true` only when the fetch succeeds, so the
 * layout can gate `docsLoaded` (and the redirect) on a genuine load and
 * auto-retry on failure. This test pins that contract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
	const state: { result: unknown; throws: boolean } = { result: null, throws: false };
	return {
		state,
		getDocuments: async () => {
			if (state.throws) throw new TypeError('network down');
			return state.result;
		},
	};
});

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/api', () => ({
	getDocuments: h.getDocuments,
	familyDocuments: () => new Promise(() => {}),
	storeDocument: vi.fn(),
	updateDocument: vi.fn(),
	deleteDocument: vi.fn(),
	familyDocumentCreate: vi.fn(),
	familyDocumentUpdate: vi.fn(),
	familyDocumentDelete: vi.fn(),
}));
vi.mock('$lib/crypto', () => ({
	encryptDocument: vi.fn(),
	decryptDocument: vi.fn(async () => ({ type: 'blueprint' })),
}));
vi.mock('$lib/idb', () => ({
	getAllDocs: vi.fn(async () => []),
	putDocs: vi.fn(async () => {}),
	clearDocs: vi.fn(async () => {}),
}));
vi.mock('$lib/outbox', () => ({
	enqueue: vi.fn(async () => 'obx-test'),
	dequeue: vi.fn(async () => {}),
	getPending: vi.fn(async () => []),
	updateCiphertext: vi.fn(async () => {}),
	refreshPendingCount: vi.fn(async () => {}),
}));
vi.mock('./familyLinks', () => ({
	familyLinks: { subscribe: (run: (v: unknown) => void) => { run([]); return () => {}; } },
	activeVault: { subscribe: (run: (v: unknown) => void) => { run(null); return () => {}; } },
}));

// `masterKey` is configurable so we can also cover the no-key early return.
const authState: { masterKey: Uint8Array | null } = { masterKey: new Uint8Array(32) };
vi.mock('./auth', () => ({
	auth: { subscribe: (run: (v: unknown) => void) => { run({ masterKey: authState.masterKey, username: 'hans' }); return () => {}; } },
}));

describe('documents.load() success signal', () => {
	beforeEach(() => {
		h.state.throws = false;
		h.state.result = null;
		authState.masterKey = new Uint8Array(32);
	});

	it('resolves true when the fetch succeeds', async () => {
		const { documents } = await import('./documents');
		h.state.result = { ok: true, data: { documents: [{ id: 1, encrypted_data: 'x', created_at: 't' }] } };
		expect(await documents.load()).toBe(true);
	});

	it('resolves false when the fetch returns a non-ok response', async () => {
		const { documents } = await import('./documents');
		h.state.result = { ok: false, status: 500, data: {} };
		expect(await documents.load()).toBe(false);
	});

	it('resolves false when the fetch throws (offline / network error)', async () => {
		const { documents } = await import('./documents');
		h.state.throws = true;
		expect(await documents.load()).toBe(false);
	});

	it('resolves false when there is no master key (locked session)', async () => {
		const { documents } = await import('./documents');
		authState.masterKey = null;
		expect(await documents.load()).toBe(false);
	});
});
