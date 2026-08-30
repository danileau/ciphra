/**
 * ciphra — offline write outbox.
 *
 * When a save/update/remove can't reach the server (offline, or the service
 * worker's 503 "offline" stub), the write is encrypted AT CAPTURE TIME and the
 * CIPHERTEXT is queued here. Flushing needs no master key — so a queued entry
 * survives the vault re-locking and replays cleanly when the network returns.
 *
 * Zero-knowledge: only ciphertext lives in this store, never plaintext. The
 * decrypted optimistic copy a user sees while offline is held in the in-memory
 * documents store (and re-derived from this ciphertext on reload, while the
 * master key is in memory) — it is never written to disk in the clear.
 *
 * Records are tagged with `username` so a different account logging in on the
 * same device can never replay the previous user's queued writes, and with
 * `sourceUserId` so a caregiver's offline writes into a linked vault replay via
 * the family-documents API rather than their own.
 *
 * Storage mirrors lib/idb.ts (same hand-rolled IndexedDB promise wrappers) but
 * lives in its OWN database so the logout cache-wipe (clearAllPartitions) never
 * touches queued-but-unsent writes.
 */

import { writable } from 'svelte/store';

const DB_NAME = 'ciphra_outbox';
const DB_VERSION = 1;
const STORE_NAME = 'pending';

export type OutboxOp = 'create' | 'update' | 'remove';

export interface OutboxRecord {
	/** Primary key — opaque client id, stable across reloads. */
	tempId: string;
	/** Documents-store partition key, e.g. `hans:self` or `hans:linked:42`. */
	cacheKey: string;
	/** Owning account; flush only replays records for the logged-in username. */
	username: string;
	/** Linked-vault patient id, or null/undefined for the user's own vault. */
	sourceUserId?: number | null;
	op: OutboxOp;
	/** Server document id — set for update/remove of an already-synced doc. */
	serverId?: number;
	/** Encrypted payload — set for create/update. */
	ciphertext?: string;
	/** Sharing class of the plaintext. Derived at capture time, because the
	 *  queue holds ciphertext and the flush cannot look inside it. Without it
	 *  a synced-from-offline document lands unclassified, which the server
	 *  reads as not-shareable until the next backfill. */
	shareClass?: number;
	createdAt: number;
}

/** Number of pending writes for the active user — drives the UI indicator. */
export const pendingCount = writable(0);

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				const store = db.createObjectStore(STORE_NAME, { keyPath: 'tempId' });
				store.createIndex('username', 'username', { unique: false });
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

function newTempId(): string {
	try {
		if (typeof crypto !== 'undefined' && crypto.randomUUID) return `obx-${crypto.randomUUID()}`;
	} catch { /* fall through */ }
	// Monotonic-ish fallback; collisions are harmless (keyPath put overwrites).
	return `obx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Queue a write. Returns the assigned tempId so the caller can tie the
 * optimistic in-memory doc back to its outbox record (for later edit/cancel).
 */
export async function enqueue(rec: Omit<OutboxRecord, 'tempId' | 'createdAt'>): Promise<string> {
	if (typeof indexedDB === 'undefined') return newTempId();
	const tempId = newTempId();
	const full: OutboxRecord = { ...rec, tempId, createdAt: Date.now() };
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		tx.objectStore(STORE_NAME).put(full);
		tx.oncomplete = () => { db.close(); resolve(tempId); };
		tx.onerror = () => { db.close(); reject(tx.error); };
	});
}

/** All pending records for a username, oldest first (replay order). */
export async function getPending(username: string): Promise<OutboxRecord[]> {
	if (typeof indexedDB === 'undefined') return [];
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readonly');
		const req = tx.objectStore(STORE_NAME).index('username').getAll(username);
		req.onsuccess = () => {
			const rows = (req.result as OutboxRecord[]).sort((a, b) => a.createdAt - b.createdAt);
			resolve(rows);
		};
		req.onerror = () => reject(req.error);
		tx.oncomplete = () => db.close();
	});
}

export async function dequeue(tempId: string): Promise<void> {
	if (typeof indexedDB === 'undefined') return;
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		tx.objectStore(STORE_NAME).delete(tempId);
		tx.oncomplete = () => { db.close(); resolve(); };
		tx.onerror = () => { db.close(); reject(tx.error); };
	});
}

/** Replace the ciphertext of a queued record (offline edit of a queued write). */
export async function updateCiphertext(tempId: string, ciphertext: string): Promise<void> {
	if (typeof indexedDB === 'undefined') return;
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);
		const getReq = store.get(tempId);
		getReq.onsuccess = () => {
			const rec = getReq.result as OutboxRecord | undefined;
			if (rec) store.put({ ...rec, ciphertext });
		};
		tx.oncomplete = () => { db.close(); resolve(); };
		tx.onerror = () => { db.close(); reject(tx.error); };
	});
}

/** Recount pending writes for the active user and publish to `pendingCount`. */
export async function refreshPendingCount(username: string | null | undefined): Promise<void> {
	if (!username) { pendingCount.set(0); return; }
	try {
		const rows = await getPending(username);
		pendingCount.set(rows.length);
	} catch {
		// Counting must never break the app.
	}
}
