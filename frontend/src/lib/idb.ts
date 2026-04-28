/**
 * ciphra — IndexedDB cache for decrypted documents.
 *
 * Stores plaintext alongside an etag (the ciphertext, which changes on every
 * re-encrypt due to random GCM nonce). Subsequent loads reuse plaintext when
 * the etag matches, skipping crypto entirely.
 *
 * Tradeoff: plaintext at rest on the device. Acceptable because logout /
 * vault-switch wipes the cache, and any device-compromise scenario already
 * defeats the in-memory master key too.
 */

const DB_NAME = 'ciphra_cache';
const DB_VERSION = 2;
const STORE_NAME = 'decrypted_documents';
const LEGACY_STORE = 'documents';

export interface CachedDoc {
	id: number;
	user_id: string;
	data: any;
	etag: string;
	created_at: string;
}

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);

		req.onupgradeneeded = () => {
			const db = req.result;
			if (db.objectStoreNames.contains(LEGACY_STORE)) {
				db.deleteObjectStore(LEGACY_STORE);
			}
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
				store.createIndex('user_id', 'user_id', { unique: false });
			}
		};

		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export async function getAllDocs(userId: string): Promise<CachedDoc[]> {
	if (typeof indexedDB === 'undefined') return [];

	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readonly');
		const store = tx.objectStore(STORE_NAME);
		const index = store.index('user_id');
		const req = index.getAll(userId);

		req.onsuccess = () => resolve(req.result as CachedDoc[]);
		req.onerror = () => reject(req.error);
		tx.oncomplete = () => db.close();
	});
}

/**
 * Replace all cached documents for a user with the given set.
 */
export async function putDocs(userId: string, docs: CachedDoc[]): Promise<void> {
	if (typeof indexedDB === 'undefined') return;

	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);
		const index = store.index('user_id');

		const cursorReq = index.openCursor(userId);
		cursorReq.onsuccess = () => {
			const cursor = cursorReq.result;
			if (cursor) {
				cursor.delete();
				cursor.continue();
			} else {
				for (const doc of docs) {
					store.put({ ...doc, user_id: userId });
				}
			}
		};

		tx.oncomplete = () => { db.close(); resolve(); };
		tx.onerror = () => { db.close(); reject(tx.error); };
	});
}

export async function clearDocs(userId: string): Promise<void> {
	if (typeof indexedDB === 'undefined') return;

	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);
		const index = store.index('user_id');

		const cursorReq = index.openCursor(userId);
		cursorReq.onsuccess = () => {
			const cursor = cursorReq.result;
			if (cursor) {
				cursor.delete();
				cursor.continue();
			}
		};

		tx.oncomplete = () => { db.close(); resolve(); };
		tx.onerror = () => { db.close(); reject(tx.error); };
	});
}

/**
 * Wipe the ENTIRE IndexedDB cache regardless of user/vault partition.
 * Called on logout so plaintext from linked-account vaults a caregiver
 * has visited doesn't survive the session. Closing all callers must
 * happen first — IndexedDB blocks deletion while connections are open.
 *
 * Security review LB-3 (PI v13): the previous `clearDocs(currentCacheKey)`
 * only wiped the active partition, leaving plaintext from every linked
 * patient on disk after caregiver logout.
 */
export async function clearAllPartitions(): Promise<void> {
	if (typeof indexedDB === 'undefined') return;
	return new Promise((resolve, reject) => {
		const req = indexedDB.deleteDatabase(DB_NAME);
		req.onsuccess = () => resolve();
		req.onerror = () => reject(req.error);
		req.onblocked = () => {
			// Connection still open somewhere — try to wipe the contents
			// of the live store as a fallback so plaintext doesn't sit
			// at rest even if the file deletion is deferred.
			openDB()
				.then((db) => {
					const tx = db.transaction(STORE_NAME, 'readwrite');
					tx.objectStore(STORE_NAME).clear();
					tx.oncomplete = () => {
						db.close();
						resolve();
					};
					tx.onerror = () => {
						db.close();
						reject(tx.error);
					};
				})
				.catch(reject);
		};
	});
}
