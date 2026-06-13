/**
 * Regression — documents.load() must dedupe concurrent callers by returning
 * the SAME in-flight promise, not resolving the second caller instantly.
 *
 * The login-onboarding bug (2026-06-13): the layout and Companion both call
 * load(). The old `if (loading) return;` resolved the second caller's promise
 * immediately while $documents was still empty. Depending on mount order that
 * either flashed the dashboard's "no profile" onboarding state, or — when the
 * layout was the second caller — ran blueprint.loadFromDocuments() against
 * empty docs so the blueprint never resolved until a manual refresh.
 *
 * This test pins the contract deterministically (no mount-order flakiness):
 * the second load() call stays pending until the underlying fetch resolves.
 */
import { describe, it, expect, vi } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => {
	const state: { resolve: ((v: unknown) => void) | null } = { resolve: null };
	return {
		state,
		getDocuments: () => new Promise((res) => { state.resolve = res; }),
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
vi.mock('./auth', () => ({
	auth: { subscribe: (run: (v: unknown) => void) => { run({ masterKey: new Uint8Array(32), username: 'hans' }); return () => {}; } },
}));
vi.mock('./familyLinks', () => ({
	familyLinks: { subscribe: (run: (v: unknown) => void) => { run([]); return () => {}; } },
	activeVault: { subscribe: (run: (v: unknown) => void) => { run(null); return () => {}; } },
}));

describe('documents.load() concurrent dedup', () => {
	it('keeps the second caller pending until the real fetch resolves', async () => {
		const { documents } = await import('./documents');

		let r1 = false;
		let r2 = false;
		const p1 = documents.load().then(() => { r1 = true; });
		const p2 = documents.load().then(() => { r2 = true; });

		// Flush microtasks: a correct store has NOT resolved either caller yet
		// because the fetch is still pending. The pre-fix store resolved the
		// second caller (r2) here via its early `return;`.
		await Promise.resolve();
		await Promise.resolve();
		expect(r1).toBe(false);
		expect(r2).toBe(false);

		// Resolve the underlying fetch with one blueprint doc.
		h.state.resolve!({ ok: true, data: { documents: [{ id: 1, encrypted_data: 'x', created_at: 't' }] } });
		await Promise.all([p1, p2]);

		expect(r1).toBe(true);
		expect(r2).toBe(true);
		// Both callers observe populated, decrypted state.
		expect(get(documents).length).toBe(1);
		expect(get(documents)[0].data.type).toBe('blueprint');
	});
});
