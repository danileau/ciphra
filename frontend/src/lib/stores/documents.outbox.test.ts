/**
 * Offline-write outbox — documents.save/updateDoc/remove must queue (not lose)
 * a write when the server is unreachable, render it optimistically, and replay
 * it in order on flushOutbox(). See lib/outbox.ts + the offline branches in
 * documents.ts.
 *
 * The outbox is mocked with an in-memory array (jsdom has no IndexedDB) so we
 * exercise the store's enqueue/optimistic/flush logic deterministically.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

// In-memory outbox standing in for the IndexedDB-backed lib/outbox.
const h = vi.hoisted(() => {
	const rows: any[] = [];
	let seq = 0;
	return {
		rows,
		reset: () => { rows.length = 0; seq = 0; },
		enqueue: vi.fn(async (rec: any) => {
			const tempId = `obx-${++seq}`;
			rows.push({ ...rec, tempId, createdAt: seq });
			return tempId;
		}),
		getPending: vi.fn(async (username: string) =>
			rows.filter((r) => r.username === username).sort((a, b) => a.createdAt - b.createdAt)
		),
		dequeue: vi.fn(async (tempId: string) => {
			const i = rows.findIndex((r) => r.tempId === tempId);
			if (i >= 0) rows.splice(i, 1);
		}),
		updateCiphertext: vi.fn(async (tempId: string, ciphertext: string) => {
			const r = rows.find((x) => x.tempId === tempId);
			if (r) r.ciphertext = ciphertext;
		}),
		refreshPendingCount: vi.fn(async () => {}),
	};
});

// Controllable API: each method delegates to a swappable impl per test.
const api = vi.hoisted(() => {
	const state: { store: any; getDocs: any } = { store: null, getDocs: null };
	return {
		state,
		storeDocument: vi.fn((ct: string) => state.store(ct)),
		getDocuments: vi.fn(() => state.getDocs()),
		updateDocument: vi.fn(async () => ({ ok: true, status: 200, data: {} })),
		deleteDocument: vi.fn(async () => ({ ok: true, status: 200, data: {} })),
		familyDocuments: vi.fn(async () => ({ ok: true, status: 200, data: { documents: [] } })),
		familyDocumentCreate: vi.fn(async () => ({ ok: true, status: 200, data: {} })),
		familyDocumentUpdate: vi.fn(async () => ({ ok: true, status: 200, data: {} })),
		familyDocumentDelete: vi.fn(async () => ({ ok: true, status: 200, data: {} })),
	};
});

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/api', () => api);
vi.mock('$lib/crypto', () => ({
	// Deterministic, reversible "encryption" so the overlay can re-derive the
	// plaintext of a queued create on reload.
	encryptDocument: vi.fn(async (data: any) => `ct:${JSON.stringify(data)}`),
	decryptDocument: vi.fn(async (ct: string) => JSON.parse(ct.slice(3))),
}));
vi.mock('$lib/idb', () => ({
	getAllDocs: vi.fn(async () => []),
	putDocs: vi.fn(async () => {}),
	clearDocs: vi.fn(async () => {}),
}));
vi.mock('$lib/outbox', () => ({
	enqueue: h.enqueue,
	getPending: h.getPending,
	dequeue: h.dequeue,
	updateCiphertext: h.updateCiphertext,
	refreshPendingCount: h.refreshPendingCount,
}));
vi.mock('./auth', () => ({
	auth: { subscribe: (run: (v: unknown) => void) => { run({ masterKey: new Uint8Array(32), username: 'hans' }); return () => {}; } },
}));
vi.mock('./familyLinks', () => ({
	familyLinks: { subscribe: (run: (v: unknown) => void) => { run([]); return () => {}; } },
	activeVault: { subscribe: (run: (v: unknown) => void) => { run(null); return () => {}; } },
}));

async function freshStore() {
	vi.resetModules();
	h.reset();
	// Default: server reachable and empty.
	api.state.store = async () => ({ ok: true, status: 200, data: {} });
	api.state.getDocs = async () => ({ ok: true, status: 200, data: { documents: [] } });
	const mod = await import('./documents');
	return mod.documents;
}

describe('documents offline outbox', () => {
	beforeEach(() => { vi.clearAllMocks(); });

	it('queues a create when the network throws and renders it optimistically', async () => {
		const documents = await freshStore();
		api.state.store = async () => { throw new TypeError('Failed to fetch'); };

		const ok = await documents.save({ type: 'entry', text: 'offline note' });
		expect(ok).toBe(true);

		// Queued as ciphertext.
		expect(h.rows.length).toBe(1);
		expect(h.rows[0]).toMatchObject({ op: 'create', username: 'hans', cacheKey: 'hans:self' });
		expect(h.rows[0].ciphertext).toContain('offline note');

		// Optimistic doc visible with a negative id + pending marker.
		const docs = get(documents);
		expect(docs.length).toBe(1);
		expect(docs[0].id).toBeLessThan(0);
		expect(docs[0]._pending).toBe(true);
		expect(docs[0].data.text).toBe('offline note');
	});

	it('queues a create on the service-worker 503 offline stub', async () => {
		const documents = await freshStore();
		api.state.store = async () => ({ ok: false, status: 503, data: { error: 'offline' } });

		const ok = await documents.save({ type: 'entry', text: 'sw offline' });
		expect(ok).toBe(true);
		expect(h.rows.length).toBe(1);
		expect(h.rows[0].op).toBe('create');
	});

	it('does NOT queue a genuine client error (401) — it fails', async () => {
		const documents = await freshStore();
		api.state.store = async () => ({ ok: false, status: 401, data: { error: 'unauthorized' } });

		const ok = await documents.save({ type: 'entry', text: 'no auth' });
		expect(ok).toBe(false);
		expect(h.rows.length).toBe(0);
		expect(get(documents).length).toBe(0);
	});

	it('flushOutbox replays queued writes in order and reconciles via reload', async () => {
		const documents = await freshStore();
		api.state.store = async () => { throw new TypeError('offline'); };

		await documents.save({ type: 'entry', text: 'first' });
		await documents.save({ type: 'entry', text: 'second' });
		expect(h.rows.length).toBe(2);

		// Network returns. The server now persists and echoes the two docs back.
		const calls: string[] = [];
		api.state.store = async (ct: string) => { calls.push(ct); return { ok: true, status: 201, data: {} }; };
		api.state.getDocs = async () => ({
			ok: true, status: 200,
			data: { documents: [
				{ id: 10, encrypted_data: 'ct:{"type":"entry","text":"first"}', created_at: 't1' },
				{ id: 11, encrypted_data: 'ct:{"type":"entry","text":"second"}', created_at: 't2' },
			] },
		});

		await documents.flushOutbox();

		// Replayed oldest-first.
		expect(calls).toEqual([
			'ct:{"type":"entry","text":"first"}',
			'ct:{"type":"entry","text":"second"}',
		]);
		// Queue drained.
		expect(h.rows.length).toBe(0);
		// Reconciled to real server docs (positive ids, no pending markers).
		const docs = get(documents);
		expect(docs.map((d) => d.id).sort()).toEqual([10, 11]);
		expect(docs.every((d) => !d._pending)).toBe(true);
	});

	it('flushOutbox stops on a still-offline status and leaves the queue intact', async () => {
		const documents = await freshStore();
		api.state.store = async () => { throw new TypeError('offline'); };
		await documents.save({ type: 'entry', text: 'pending' });
		expect(h.rows.length).toBe(1);

		// Still offline at flush time.
		api.state.store = async () => ({ ok: false, status: 503, data: { error: 'offline' } });
		await documents.flushOutbox();

		// Nothing drained; retries on the next trigger.
		expect(h.rows.length).toBe(1);
	});

	it('removing a not-yet-synced offline create cancels its queued write', async () => {
		const documents = await freshStore();
		api.state.store = async () => { throw new TypeError('offline'); };
		await documents.save({ type: 'entry', text: 'oops' });

		const tempDoc = get(documents)[0];
		expect(tempDoc.id).toBeLessThan(0);

		const ok = await documents.remove(tempDoc.id);
		expect(ok).toBe(true);
		expect(h.rows.length).toBe(0);            // queued create cancelled
		expect(get(documents).length).toBe(0);    // optimistic doc removed
		// The server delete endpoint must NOT be hit for a temp id.
		expect(api.deleteDocument).not.toHaveBeenCalled();
	});

	it('editing a not-yet-synced offline create rewrites its queued ciphertext', async () => {
		const documents = await freshStore();
		api.state.store = async () => { throw new TypeError('offline'); };
		await documents.save({ type: 'entry', text: 'draft' });

		const tempDoc = get(documents)[0];
		const ok = await documents.updateDoc(tempDoc.id, { type: 'entry', text: 'final' });
		expect(ok).toBe(true);

		// Still a single create, now carrying the edited ciphertext — not a
		// separate update op against a bogus negative server id.
		expect(h.rows.length).toBe(1);
		expect(h.rows[0].op).toBe('create');
		expect(h.rows[0].ciphertext).toContain('final');
		expect(api.updateDocument).not.toHaveBeenCalled();
		expect(get(documents)[0].data.text).toBe('final');
	});
});
