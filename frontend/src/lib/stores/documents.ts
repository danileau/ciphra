import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { auth } from './auth';
import * as api from '$lib/api';
import { encryptDocument, decryptDocument } from '$lib/crypto';
import { getAllDocs, putDocs, clearDocs, type CachedDoc } from '$lib/idb';

export const documentsError = writable<string | null>(null);

export interface CiphraDocument {
	id: number;
	serverCreatedAt: string;
	data: any;
}

function createDocStore() {
	const { subscribe, set, update } = writable<CiphraDocument[]>([]);
	let loading = false;

	/** Decrypt raw server docs into CiphraDocument[] (parallel for performance) */
	async function decryptDocs(
		rawDocs: Array<{ id: number; encrypted_data: string; created_at: string }>,
		masterKey: Uint8Array
	): Promise<CiphraDocument[]> {
		const results = await Promise.allSettled(
			rawDocs.map(async (d) => {
				const data = await decryptDocument(d.encrypted_data, masterKey);
				return { id: d.id, serverCreatedAt: d.created_at, data } as CiphraDocument;
			})
		);
		return results
			.filter((r): r is PromiseFulfilledResult<CiphraDocument> => r.status === 'fulfilled')
			.map(r => r.value);
	}

	/** Persist raw server docs to IndexedDB cache */
	async function cacheRawDocs(
		rawDocs: Array<{ id: number; encrypted_data: string; created_at: string }>
	): Promise<void> {
		const { username } = get(auth);
		if (!browser || !username) return;
		try {
			const cached: CachedDoc[] = rawDocs.map((d) => ({
				id: d.id,
				user_id: username,
				encrypted_data: d.encrypted_data,
				created_at: d.created_at,
				updated_at: d.created_at
			}));
			await putDocs(username, cached);
		} catch {
			// IndexedDB errors should not break the app
		}
	}

	return {
		subscribe,
		async load() {
			if (loading) return;
			loading = true;
			const { masterKey, username } = get(auth);
			if (!masterKey) { loading = false; return; }

			// 1. Try IndexedDB cache first for instant load
			if (browser && username) {
				try {
					const cached = await getAllDocs(username);
					if (cached.length > 0) {
						const docs = await decryptDocs(cached, masterKey);
						set(docs);
					}
				} catch {
					// cache miss is fine, continue to API
				}
			}

			// 2. Fetch from API in background, update store + cache
			try {
				const res = await api.getDocuments();
				if (res.ok) {
					const rawDocs = (res.data.documents as Array<{ id: number; encrypted_data: string; created_at: string }>) || [];
					const docs = await decryptDocs(rawDocs, masterKey);
					set(docs);
					await cacheRawDocs(rawDocs);
					documentsError.set(null);
				} else {
					documentsError.set('Failed to load documents');
				}
			} catch {
				documentsError.set('Failed to load documents');
			}

			loading = false;
		},
		async save(data: any): Promise<boolean> {
			const { masterKey } = get(auth);
			if (!masterKey) return false;
			try {
				const encrypted = await encryptDocument(data, masterKey);
				const res = await api.storeDocument(encrypted);
				if (res.ok) {
					documentsError.set(null);
					await this.load();
				} else {
					documentsError.set('Failed to save document');
				}
				return res.ok;
			} catch {
				documentsError.set('Failed to save document');
				return false;
			}
		},
		async updateDoc(id: number, data: any): Promise<boolean> {
			const { masterKey } = get(auth);
			if (!masterKey) return false;
			try {
				const encrypted = await encryptDocument(data, masterKey);
				const res = await api.updateDocument(id, encrypted);
				if (res.ok) {
					documentsError.set(null);
					await this.load();
				} else {
					documentsError.set('Failed to update document');
				}
				return res.ok;
			} catch {
				documentsError.set('Failed to update document');
				return false;
			}
		},
		async remove(id: number): Promise<boolean> {
			const res = await api.deleteDocument(id);
			if (res.ok) {
				update((docs) => docs.filter((d) => d.id !== id));
				// Refresh cache after removal
				const { username } = get(auth);
				if (browser && username) {
					try {
						const apiRes = await api.getDocuments();
						if (apiRes.ok) {
							const rawDocs = (apiRes.data.documents as Array<{ id: number; encrypted_data: string; created_at: string }>) || [];
							await cacheRawDocs(rawDocs);
						}
					} catch {
						// non-critical
					}
				}
			}
			return res.ok;
		},
		clear() {
			set([]);
			const { username } = get(auth);
			if (browser && username) {
				clearDocs(username).catch(() => {});
			}
		}
	};
}

export const documents = createDocStore();
