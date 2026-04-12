import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { auth } from './auth';
import { familyLinks, activeVault } from './familyLinks';
import * as api from '$lib/api';
import { encryptDocument, decryptDocument } from '$lib/crypto';
import { getAllDocs, putDocs, clearDocs, type CachedDoc } from '$lib/idb';

export const documentsError = writable<string | null>(null);

export interface CiphraDocument {
	id: number;
	serverCreatedAt: string;
	data: any;
}

/**
 * Resolves the current vault context: which master_key to encrypt/decrypt
 * with, and which endpoints to hit. Caregiver uses their own key+endpoints
 * unless they've switched to a linked account via the `activeVault` store.
 */
function resolveVault(): { masterKey: Uint8Array | null; sourceUserId: number | null; cacheKey: string } {
	const { masterKey, username } = get(auth);
	const active = get(activeVault);
	if (!active) {
		return { masterKey, sourceUserId: null, cacheKey: `${username ?? ''}:self` };
	}
	const link = get(familyLinks).find(l => l.sourceUserId === active);
	if (!link) {
		// stale switcher state — fall back to own vault
		return { masterKey, sourceUserId: null, cacheKey: `${username ?? ''}:self` };
	}
	return {
		masterKey: link.patientMasterKey,
		sourceUserId: active,
		cacheKey: `${username ?? ''}:linked:${active}`,
	};
}

function createDocStore() {
	const { subscribe, set, update } = writable<CiphraDocument[]>([]);
	let loading = false;

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
			.map(r => r.value)
			// family_link entries live in the same encrypted_documents table
			// but are metadata for the family-sharing store, not health data.
			.filter(doc => doc.data?.type !== 'family_link');
	}

	async function cacheRawDocs(
		rawDocs: Array<{ id: number; encrypted_data: string; created_at: string }>,
		cacheKey: string,
	): Promise<void> {
		if (!browser || !cacheKey) return;
		try {
			const cached: CachedDoc[] = rawDocs.map((d) => ({
				id: d.id,
				user_id: cacheKey,
				encrypted_data: d.encrypted_data,
				created_at: d.created_at,
				updated_at: d.created_at
			}));
			await putDocs(cacheKey, cached);
		} catch {
			// IndexedDB errors should not break the app
		}
	}

	const store = {
		subscribe,
		async load() {
			if (loading) return;
			loading = true;
			const { masterKey, sourceUserId, cacheKey } = resolveVault();
			if (!masterKey) { loading = false; return; }

			if (browser) {
				try {
					const cached = await getAllDocs(cacheKey);
					if (cached.length > 0) {
						const docs = await decryptDocs(cached, masterKey);
						set(docs);
					}
				} catch {
					// cache miss is fine, continue to API
				}
			}

			try {
				const res = sourceUserId
					? await api.familyDocuments(sourceUserId)
					: await api.getDocuments();
				if (res.ok) {
					const rawDocs = (res.data.documents as Array<{ id: number; encrypted_data: string; created_at: string }>) || [];
					const docs = await decryptDocs(rawDocs, masterKey);
					set(docs);
					await cacheRawDocs(rawDocs, cacheKey);
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
			const { masterKey, sourceUserId } = resolveVault();
			if (!masterKey) return false;
			try {
				const encrypted = await encryptDocument(data, masterKey);
				const res = sourceUserId
					? await api.familyDocumentCreate(sourceUserId, encrypted)
					: await api.storeDocument(encrypted);
				if (res.ok) {
					documentsError.set(null);
					await store.load();
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
			const { masterKey, sourceUserId } = resolveVault();
			if (!masterKey) return false;
			try {
				const encrypted = await encryptDocument(data, masterKey);
				const res = sourceUserId
					? await api.familyDocumentUpdate(sourceUserId, id, encrypted)
					: await api.updateDocument(id, encrypted);
				if (res.ok) {
					documentsError.set(null);
					await store.load();
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
			const { sourceUserId, cacheKey } = resolveVault();
			const res = sourceUserId
				? await api.familyDocumentDelete(sourceUserId, id)
				: await api.deleteDocument(id);
			if (res.ok) {
				update((docs) => docs.filter((d) => d.id !== id));
				if (browser) {
					try {
						const apiRes = sourceUserId
							? await api.familyDocuments(sourceUserId)
							: await api.getDocuments();
						if (apiRes.ok) {
							const rawDocs = (apiRes.data.documents as Array<{ id: number; encrypted_data: string; created_at: string }>) || [];
							await cacheRawDocs(rawDocs, cacheKey);
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
			const { cacheKey } = resolveVault();
			if (browser && cacheKey) {
				clearDocs(cacheKey).catch(() => {});
			}
		}
	};

	return store;
}

export const documents = createDocStore();
