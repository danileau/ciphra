/**
 * Offline-sync integrity — the failure modes of the write path that lose,
 * duplicate, or mis-share data without anybody noticing.
 *
 *  A. A queued write must carry the sharing class. The flush has only
 *     ciphertext, and the server keeps the OLD class on a PUT without one —
 *     so an entry locked while offline synced still SHAREABLE and was served
 *     to a narrow-scope caregiver. The owner's load reconciles any drift.
 *  E. Overlapping flushes (`online` + `visibilitychange` on wake) each
 *     replayed the same queued create: one duplicate document per entry.
 *  F. One revoked grant wedged the whole outbox, because records replayed
 *     strictly oldest-first and a 403 counted as "retry later".
 *  G. With the active vault's link not loaded, writes silently went to the
 *     user's OWN vault; a load finishing after a vault switch rendered the
 *     old vault under the new banner.
 *  J. A batch is chunked by bytes as well as count — Flask 413s at 2 MiB.
 *
 * Same in-memory outbox + controllable API approach as
 * documents.outbox.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => {
	const rows: any[] = [];
	let seq = 0;
	const state: {
		vault: number | null;
		links: any[];
		username: string;
	} = { vault: null, links: [], username: 'hans' };
	return {
		rows,
		state,
		reset: () => {
			rows.length = 0;
			seq = 0;
			state.vault = null;
			state.links = [];
			state.username = 'hans';
		},
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
		updateCiphertext: vi.fn(async (tempId: string, ciphertext: string, shareClass?: number) => {
			const r = rows.find((x) => x.tempId === tempId);
			if (r) { r.ciphertext = ciphertext; r.shareClass = shareClass; }
		}),
		refreshPendingCount: vi.fn(async () => {}),
	};
});

const ok = (data: Record<string, unknown> = {}) => ({ ok: true, status: 200, data });
const offline = () => { throw new TypeError('Failed to fetch'); };

const api = vi.hoisted(() => ({
	storeDocument: vi.fn(),
	getDocuments: vi.fn(),
	updateDocument: vi.fn(),
	deleteDocument: vi.fn(),
	classifyDocuments: vi.fn(),
	storeDocumentsBatch: vi.fn(),
	familyDocuments: vi.fn(),
	familyDocumentCreate: vi.fn(),
	familyDocumentUpdate: vi.fn(),
	familyDocumentDelete: vi.fn(),
}));

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/api', () => api);
vi.mock('$lib/crypto', () => ({
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
	auth: { subscribe: (run: (v: unknown) => void) => { run({ masterKey: new Uint8Array(32), username: h.state.username }); return () => {}; } },
}));
vi.mock('./familyLinks', () => ({
	familyLinks: { subscribe: (run: (v: unknown) => void) => { run(h.state.links); return () => {}; } },
	activeVault: { subscribe: (run: (v: unknown) => void) => { run(h.state.vault); return () => {}; } },
}));

const PATIENT = 7;
const patientLink = { sourceUserId: PATIENT, sourceUsername: 'eva', patientMasterKey: new Uint8Array(32), revoked: false };

function raw(id: number, data: unknown, share_class: number | null = 1) {
	return { id, encrypted_data: `ct:${JSON.stringify(data)}`, created_at: `t${id}`, share_class };
}

async function freshStore() {
	vi.resetModules();
	h.reset();
	api.storeDocument.mockImplementation(async () => ok({ id: 100 }));
	api.getDocuments.mockImplementation(async () => ok({ documents: [] }));
	api.updateDocument.mockImplementation(async () => ok());
	api.deleteDocument.mockImplementation(async () => ok());
	api.classifyDocuments.mockImplementation(async () => ok());
	api.storeDocumentsBatch.mockImplementation(async (docs: any[]) =>
		ok({ results: docs.map((d) => ({ client_key: d.client_key, status: 'created' })) }));
	api.familyDocuments.mockImplementation(async () => ok({ documents: [], share_mask: 1, withheld: 0 }));
	api.familyDocumentCreate.mockImplementation(async () => ok());
	api.familyDocumentUpdate.mockImplementation(async () => ok());
	api.familyDocumentDelete.mockImplementation(async () => ok());
	return (await import('./documents')).documents;
}

beforeEach(() => { vi.clearAllMocks(); });

describe('A — queued writes keep the sharing class', () => {
	it('an existing entry locked while offline replays as PERSONAL', async () => {
		const documents = await freshStore();
		const entry = { type: 'entry', date: '2026-09-01', notes: 'x' };
		api.getDocuments.mockImplementation(async () => ok({ documents: [raw(5, entry, 1)] }));
		await documents.load();

		api.updateDocument.mockImplementation(offline);
		expect(await documents.updateDoc(5, { ...entry, private: true })).toBe(true);
		expect(h.rows).toHaveLength(1);
		expect(h.rows[0]).toMatchObject({ op: 'update', serverId: 5, shareClass: 2 });

		api.updateDocument.mockImplementation(async () => ok());
		await documents.flushOutbox();
		expect(api.updateDocument).toHaveBeenLastCalledWith(5, expect.stringContaining('"private":true'), 2);
	});

	it('locking a not-yet-synced create rewrites its class along with the ciphertext', async () => {
		const documents = await freshStore();
		api.storeDocument.mockImplementation(offline);
		await documents.save({ type: 'event', date: '2026-09-01', notes: 'draft' });
		expect(h.rows[0].shareClass).toBe(1);

		const temp = get(documents)[0];
		await documents.updateDoc(temp.id, { ...temp.data, private: true });
		expect(h.rows).toHaveLength(1);
		expect(h.rows[0]).toMatchObject({ op: 'create', shareClass: 2 });

		api.storeDocument.mockImplementation(async () => ok({ id: 100 }));
		await documents.flushOutbox();
		expect(api.storeDocument).toHaveBeenLastCalledWith(expect.stringContaining('"private":true'), 2);
	});

	it('a caregiver\'s queued writes carry no class — the server forces those', async () => {
		const documents = await freshStore();
		h.state.vault = PATIENT;
		h.state.links = [patientLink];
		api.familyDocumentCreate.mockImplementation(offline);
		api.familyDocumentUpdate.mockImplementation(offline);

		await documents.save({ type: 'event', date: '2026-09-01', notes: 'from carer' });
		await documents.updateDoc(9, { type: 'entry', date: '2026-09-01' });
		expect(h.rows).toHaveLength(2);
		expect(h.rows.every((r) => r.shareClass === undefined)).toBe(true);

		const temp = get(documents).find((d) => d.id < 0)!;
		await documents.updateDoc(temp.id, { ...temp.data, notes: 'edited' });
		expect(h.rows.find((r) => r.op === 'create').shareClass).toBeUndefined();
	});

	it('the owner\'s load reclassifies a document whose class drifted from its plaintext', async () => {
		const documents = await freshStore();
		api.getDocuments.mockImplementation(async () => ok({
			documents: [
				raw(1, { type: 'entry', date: '2026-09-01', private: true }, 1), // drifted: locked, still shareable
				raw(2, { type: 'entry', date: '2026-09-02' }, 1),                // consistent
				raw(3, { type: 'diary', date: '2026-09-03', text: 'x' }, null),  // never classified
				raw(4, { type: 'entry', date: '2026-09-04' }, 2),                // unlocked, still personal
			],
		}));
		await documents.load();
		await vi.waitFor(() => expect(api.classifyDocuments).toHaveBeenCalled());
		expect(api.classifyDocuments).toHaveBeenCalledTimes(1);
		expect(api.classifyDocuments.mock.calls[0][0]).toEqual([
			{ id: 1, share_class: 2 },
			{ id: 3, share_class: 2 },
			{ id: 4, share_class: 1 },
		]);
	});

	it('does not reclassify from a snapshot an owner write has overtaken', async () => {
		const documents = await freshStore();
		let resolveGet!: (v: unknown) => void;
		api.getDocuments.mockImplementation(() => new Promise((r) => { resolveGet = r; }));
		const loading = documents.load();
		await vi.waitFor(() => expect(typeof resolveGet).toBe('function'));

		// The user locks the entry while the GET is on the wire.
		let resolvePut!: (v: unknown) => void;
		api.updateDocument.mockImplementation(() => new Promise((r) => { resolvePut = r; }));
		const saving = documents.updateDoc(1, { type: 'entry', date: '2026-09-01', private: true });
		await vi.waitFor(() => expect(typeof resolvePut).toBe('function'));

		// The GET answers with the pre-lock plaintext and a stale class.
		resolveGet(ok({ documents: [raw(1, { type: 'entry', date: '2026-09-01' }, 2)] }));
		await loading;
		resolvePut(ok());
		api.getDocuments.mockImplementation(async () =>
			ok({ documents: [raw(1, { type: 'entry', date: '2026-09-01', private: true }, 2)] }));
		await saving;
		await new Promise((r) => setTimeout(r, 0));
		// Reclassifying doc 1 as SHAREABLE here would undo the lock.
		expect(api.classifyDocuments).not.toHaveBeenCalled();
	});

	it('an online update drops the queued offline updates it supersedes', async () => {
		const documents = await freshStore();
		api.updateDocument.mockImplementation(offline);
		await documents.updateDoc(5, { type: 'entry', date: '2026-09-01', notes: 'old' });
		expect(h.rows).toHaveLength(1);

		api.updateDocument.mockImplementation(async () => ok());
		await documents.updateDoc(5, { type: 'entry', date: '2026-09-01', notes: 'new' });
		expect(h.rows).toHaveLength(0);
	});
});

describe('E — flushOutbox is single-flight', () => {
	it('overlapping triggers replay each queued create exactly once', async () => {
		const documents = await freshStore();
		api.storeDocument.mockImplementation(offline);
		await documents.save({ type: 'event', date: '2026-09-01', notes: 'one' });
		await documents.save({ type: 'event', date: '2026-09-01', notes: 'two' });

		api.storeDocument.mockImplementation(async () => {
			await new Promise((r) => setTimeout(r, 5));
			return ok({ id: 100 });
		});
		await Promise.all([documents.flushOutbox(), documents.flushOutbox(), documents.flushOutbox()]);
		expect(api.storeDocument).toHaveBeenCalledTimes(2 + 2); // two offline attempts + two replays
		expect(h.rows).toHaveLength(0);
	});

	it('a trigger arriving mid-drain earns one follow-up pass for writes queued meanwhile', async () => {
		const documents = await freshStore();
		api.storeDocument.mockImplementation(offline);
		await documents.save({ type: 'event', date: '2026-09-01', notes: 'first' });

		let release!: () => void;
		api.storeDocument.mockImplementation(async () => ok({ id: 100 }));
		api.storeDocument.mockImplementationOnce(async () => {
			await new Promise<void>((r) => { release = r; });
			return ok({ id: 100 });
		});
		const first = documents.flushOutbox();
		await vi.waitFor(() => expect(typeof release).toBe('function'));
		// Queued while the first pass is on the wire.
		h.rows.push({ tempId: 'obx-late', cacheKey: 'hans:self', username: 'hans', sourceUserId: null, op: 'create', ciphertext: 'ct:{"type":"event","notes":"late"}', shareClass: 1, createdAt: 99 });
		const second = documents.flushOutbox();
		release();
		await Promise.all([first, second]);
		expect(h.rows).toHaveLength(0);
		expect(api.storeDocument).toHaveBeenCalledWith('ct:{"type":"event","notes":"late"}', 1);
	});
});

describe('F — one vault cannot wedge another', () => {
	function queue(rec: Partial<any>) {
		h.rows.push({ username: 'hans', createdAt: h.rows.length + 1, tempId: `obx-q${h.rows.length + 1}`, ...rec });
	}

	it('a revoked grant drops that vault\'s writes and the own vault still syncs', async () => {
		const documents = await freshStore();
		queue({ cacheKey: `hans:linked:${PATIENT}`, sourceUserId: PATIENT, op: 'create', ciphertext: 'ct:{"a":1}' });
		queue({ cacheKey: `hans:linked:${PATIENT}`, sourceUserId: PATIENT, op: 'update', serverId: 3, ciphertext: 'ct:{"a":2}' });
		queue({ cacheKey: 'hans:self', sourceUserId: null, op: 'create', ciphertext: 'ct:{"b":1}', shareClass: 1 });
		api.familyDocumentCreate.mockImplementation(async () => ({ ok: false, status: 403, data: { error: 'Not authorized' } }));

		await documents.flushOutbox();
		expect(api.familyDocumentCreate).toHaveBeenCalledTimes(1);
		expect(api.familyDocumentUpdate).not.toHaveBeenCalled();
		expect(api.storeDocument).toHaveBeenCalledWith('ct:{"b":1}', 1);
		expect(h.rows).toHaveLength(0);
	});

	it('an HTML 403 from something in front of the API is not a revocation', async () => {
		const documents = await freshStore();
		queue({ cacheKey: `hans:linked:${PATIENT}`, sourceUserId: PATIENT, op: 'create', ciphertext: 'ct:{"a":1}' });
		api.familyDocumentCreate.mockImplementation(async () => ({ ok: false, status: 403, data: {} }));
		await documents.flushOutbox();
		expect(h.rows).toHaveLength(1);
	});

	it('a full vault keeps its writes queued, says so once, and does not block the others', async () => {
		const documents = await freshStore();
		const blocked = vi.fn();
		window.addEventListener('ciphra:sync-blocked', blocked);
		queue({ cacheKey: 'hans:self', sourceUserId: null, op: 'create', ciphertext: 'ct:{"b":1}', shareClass: 1 });
		queue({ cacheKey: 'hans:self', sourceUserId: null, op: 'create', ciphertext: 'ct:{"b":2}', shareClass: 1 });
		queue({ cacheKey: `hans:linked:${PATIENT}`, sourceUserId: PATIENT, op: 'create', ciphertext: 'ct:{"a":1}' });
		api.storeDocument.mockImplementation(async () => ({ ok: false, status: 429, data: { error: 'quota_exceeded' } }));

		await documents.flushOutbox();
		window.removeEventListener('ciphra:sync-blocked', blocked);
		expect(api.storeDocument).toHaveBeenCalledTimes(1); // the second own write waits behind the first
		expect(api.familyDocumentCreate).toHaveBeenCalledTimes(1);
		expect(h.rows.map((r) => r.ciphertext)).toEqual(['ct:{"b":1}', 'ct:{"b":2}']);
		expect(blocked).toHaveBeenCalledTimes(1);
	});

	it('an overloaded vault waits while the others proceed; no response at all stops everything', async () => {
		const documents = await freshStore();
		queue({ cacheKey: 'hans:self', sourceUserId: null, op: 'create', ciphertext: 'ct:{"b":1}', shareClass: 1 });
		queue({ cacheKey: `hans:linked:${PATIENT}`, sourceUserId: PATIENT, op: 'create', ciphertext: 'ct:{"a":1}' });
		api.storeDocument.mockImplementation(async () => ({ ok: false, status: 502, data: {} }));
		await documents.flushOutbox();
		expect(api.familyDocumentCreate).toHaveBeenCalledTimes(1);
		expect(h.rows.map((r) => r.ciphertext)).toEqual(['ct:{"b":1}']);

		api.storeDocument.mockImplementation(async () => ({ ok: false, status: 0, data: {} }));
		queue({ cacheKey: `hans:linked:${PATIENT}`, sourceUserId: PATIENT, op: 'create', ciphertext: 'ct:{"a":2}' });
		await documents.flushOutbox();
		expect(api.familyDocumentCreate).toHaveBeenCalledTimes(1);
		expect(h.rows).toHaveLength(2);
	});
});

describe('G — no silent fallback to the own vault', () => {
	it('with the active vault\'s link not loaded, reads and writes refuse instead of using the own vault', async () => {
		const documents = await freshStore();
		h.state.vault = PATIENT; // restored from sessionStorage; links not loaded yet

		expect(await documents.load()).toBe(false);
		expect(await documents.save({ type: 'event', date: '2026-09-01' })).toBe(false);
		expect(await documents.updateDoc(3, { type: 'entry' })).toBe(false);
		expect(await documents.remove(3)).toBe(false);
		expect(api.getDocuments).not.toHaveBeenCalled();
		expect(api.storeDocument).not.toHaveBeenCalled();
		expect(api.updateDocument).not.toHaveBeenCalled();
		expect(api.deleteDocument).not.toHaveBeenCalled();
		expect(h.rows).toHaveLength(0);
	});

	it('a load that finishes after a vault switch does not render the old vault', async () => {
		const documents = await freshStore();
		h.state.links = [patientLink];
		let resolveOwn!: (v: unknown) => void;
		api.getDocuments.mockImplementation(() => new Promise((r) => { resolveOwn = r; }));
		const loading = documents.load();
		await vi.waitFor(() => expect(typeof resolveOwn).toBe('function'));

		h.state.vault = PATIENT;
		documents.clear();
		resolveOwn(ok({ documents: [raw(1, { type: 'diary', date: '2026-09-01', text: 'mine' })] }));
		expect(await loading).toBe(false);
		expect(get(documents)).toEqual([]);
	});
});

describe('J — batches respect the byte budget', () => {
	it('chunkForBatch splits by count and by serialised size', async () => {
		const { chunkForBatch } = await import('./documents');
		const small = Array.from({ length: 250 }, (_, i) => ({ encrypted_data: `c${i}` }));
		expect(chunkForBatch(small).map((c) => c.length)).toEqual([100, 100, 50]);

		const big = Array.from({ length: 5 }, () => ({ encrypted_data: 'x'.repeat(400) }));
		const chunks = chunkForBatch(big, 100, 1000);
		expect(chunks.map((c) => c.length)).toEqual([2, 2, 1]);
		for (const c of chunks) {
			expect(new TextEncoder().encode(JSON.stringify({ documents: c })).length).toBeLessThanOrEqual(1000);
		}
		// Oversized on its own still goes, alone.
		expect(chunkForBatch([{ encrypted_data: 'x'.repeat(2000) }], 100, 1000)).toHaveLength(1);
	});

	it('saveBatch sends ≤1.5 MiB per request and returns results in input order', async () => {
		const documents = await freshStore();
		const text = 'y'.repeat(300 * 1024); // ~300 KiB each once "encrypted"
		const items = Array.from({ length: 8 }, (_, i) => ({ data: { type: 'diary', text, n: i }, clientKey: `k${i}` }));
		const res = await documents.saveBatch(items);

		expect(res.ok).toBe(true);
		expect(api.storeDocumentsBatch.mock.calls.length).toBeGreaterThan(1);
		for (const [docs] of api.storeDocumentsBatch.mock.calls) {
			expect(new TextEncoder().encode(JSON.stringify({ documents: docs })).length).toBeLessThanOrEqual(1.5 * 1024 * 1024);
		}
		expect(res.results.map((r) => r.client_key)).toEqual(items.map((i) => i.clientKey));
	});

	it('a failing chunk fails the call with its status, so the caller retries the lot', async () => {
		const documents = await freshStore();
		const text = 'y'.repeat(600 * 1024);
		const items = Array.from({ length: 4 }, (_, i) => ({ data: { type: 'diary', text, n: i }, clientKey: `k${i}` }));
		api.storeDocumentsBatch
			.mockImplementationOnce(async (docs: any[]) => ok({ results: docs.map((d) => ({ client_key: d.client_key, status: 'created' })) }))
			.mockImplementationOnce(async () => ({ ok: false, status: 503, data: {} }));
		const res = await documents.saveBatch(items);
		expect(res).toEqual({ ok: false, status: 503, results: [] });
	});
});
