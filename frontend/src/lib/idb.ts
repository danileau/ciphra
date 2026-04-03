/**
 * ciphra — IndexedDB offline cache for encrypted documents
 *
 * Stores raw encrypted blobs so data remains E2E encrypted at rest.
 * All operations are guarded for SSR safety.
 */

const DB_NAME = 'ciphra_cache';
const DB_VERSION = 1;
const STORE_NAME = 'documents';

export interface CachedDoc {
	id: number;
	user_id: string;
	encrypted_data: string;
	created_at: string;
	updated_at: string;
}

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);

		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
				store.createIndex('user_id', 'user_id', { unique: false });
			}
		};

		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

/**
 * Get all cached documents for a given user.
 */
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
 * Replace all cached documents for a user.
 * Clears existing docs for the user, then inserts the new set.
 */
export async function putDocs(userId: string, docs: CachedDoc[]): Promise<void> {
	if (typeof indexedDB === 'undefined') return;

	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);
		const index = store.index('user_id');

		// First, delete all existing docs for this user
		const cursorReq = index.openCursor(userId);
		cursorReq.onsuccess = () => {
			const cursor = cursorReq.result;
			if (cursor) {
				cursor.delete();
				cursor.continue();
			}
			// Once cursor is exhausted (cursor === null), insert new docs
			if (!cursor) {
				for (const doc of docs) {
					store.put({ ...doc, user_id: userId });
				}
			}
		};

		tx.oncomplete = () => { db.close(); resolve(); };
		tx.onerror = () => { db.close(); reject(tx.error); };
	});
}

/**
 * Clear all cached documents for a user (e.g. on logout).
 */
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
