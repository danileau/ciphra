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

interface RawDoc { id: number; encrypted_data: string; created_at: string; }

function resolveVault(): { masterKey: Uint8Array | null; sourceUserId: number | null; cacheKey: string } {
	const { masterKey, username } = get(auth);
	const active = get(activeVault);
	if (!active) {
		return { masterKey, sourceUserId: null, cacheKey: `${username ?? ''}:self` };
	}
	const link = get(familyLinks).find(l => l.sourceUserId === active);
	if (!link) {
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
	// The promise of the currently-running load(), shared with concurrent
	// callers so they await the SAME fetch instead of resolving instantly.
	let inFlight: Promise<void> | null = null;

	/**
	 * Decrypt raw docs, reusing plaintext from `cachedByEtag` when the
	 * ciphertext is unchanged. This is where the heavy-user speedup lives:
	 * on warm loads, the map hits for every unchanged doc and no AES-GCM
	 * decryption runs at all.
	 */
	async function decryptDocs(
		rawDocs: RawDoc[],
		masterKey: Uint8Array,
		cachedByEtag: Map<string, CachedDoc>,
		cacheKey: string
	): Promise<{ docs: CiphraDocument[]; freshCache: CachedDoc[] }> {
		const results = await Promise.allSettled(
			rawDocs.map(async (d) => {
				const etag = d.encrypted_data;
				const hit = cachedByEtag.get(`${d.id}|${etag}`);
				if (hit) {
					return {
						doc: { id: d.id, serverCreatedAt: d.created_at, data: hit.data } as CiphraDocument,
						etag,
					};
				}
				const data = await decryptDocument(d.encrypted_data, masterKey);
				return {
					doc: { id: d.id, serverCreatedAt: d.created_at, data } as CiphraDocument,
					etag,
				};
			})
		);

		const docs: CiphraDocument[] = [];
		const freshCache: CachedDoc[] = [];
		for (const r of results) {
			if (r.status !== 'fulfilled') continue;
			const { doc, etag } = r.value;
			// family_link entries live in the same encrypted_documents table
			// but are metadata for the family-sharing store, not health data.
			if (doc.data?.type === 'family_link') continue;
			docs.push(doc);
			freshCache.push({
				id: doc.id,
				user_id: cacheKey,
				data: doc.data,
				etag,
				created_at: doc.serverCreatedAt,
			});
		}
		return { docs, freshCache };
	}

	const store = {
		subscribe,
		async load() {
			// Concurrent callers (the layout's post-login load + a page
			// component's own onMount load) must AWAIT the same in-flight fetch.
			// The old `if (loading) return;` resolved the second caller's
			// promise instantly while $documents was still empty — so the
			// dashboard flipped `loaded=true` with no blueprint yet and rendered
			// its "no profile yet" onboarding state until a manual refresh.
			if (loading) return inFlight ?? undefined;
			loading = true;
			inFlight = (async () => {
			const { masterKey, sourceUserId, cacheKey } = resolveVault();
			if (!masterKey) return;

			const t0 = performance.now();
			let cacheHits = 0;
			let fresh = 0;
			let cachedCount = 0;
			const cachedByEtag = new Map<string, CachedDoc>();

			if (browser) {
				try {
					const cached = await getAllDocs(cacheKey);
					cachedCount = cached.length;
					if (cached.length > 0) {
						for (const c of cached) cachedByEtag.set(`${c.id}|${c.etag}`, c);
						const instant = cached
							.filter(c => c.data?.type !== 'family_link')
							.map(c => ({ id: c.id, serverCreatedAt: c.created_at, data: c.data } as CiphraDocument));
						set(instant);
					}
				} catch {
					// cache miss is fine
				}
			}
			const tCache = performance.now();

			try {
				const res = sourceUserId
					? await api.familyDocuments(sourceUserId)
					: await api.getDocuments();
				const tFetch = performance.now();
				if (res.ok) {
					const rawDocs = (res.data.documents as RawDoc[]) || [];
					for (const d of rawDocs) {
						if (cachedByEtag.has(`${d.id}|${d.encrypted_data}`)) cacheHits++;
						else fresh++;
					}
					const { docs, freshCache } = await decryptDocs(rawDocs, masterKey, cachedByEtag, cacheKey);
					const tDecrypt = performance.now();
					set(docs);
					if (browser && cacheKey) {
						try {
							await putDocs(cacheKey, freshCache);
						} catch {
							// IndexedDB errors should not break the app
						}
					}
					documentsError.set(null);
					const tEnd = performance.now();
					if (import.meta.env.DEV) {
						// eslint-disable-next-line no-console
						console.info(
							`[ciphra] docs loaded: ${rawDocs.length} total, ${cacheHits} cache-hits, ${fresh} decrypted. ` +
							`idb:${(tCache - t0).toFixed(0)}ms fetch:${(tFetch - tCache).toFixed(0)}ms ` +
							`decrypt:${(tDecrypt - tFetch).toFixed(0)}ms persist:${(tEnd - tDecrypt).toFixed(0)}ms ` +
							`total:${(tEnd - t0).toFixed(0)}ms (cached on disk: ${cachedCount})`
						);
					}
				} else {
					documentsError.set('Failed to load documents');
				}
			} catch {
				documentsError.set('Failed to load documents');
			}
			})();
			try {
				await inFlight;
			} finally {
				loading = false;
				inFlight = null;
			}
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
					// CIPH-767e — sync indicator: notify the UI that a successful
					// save round-trip to the server completed so the layout can
					// surface a brief "Synced" toast. Online-only by nature since
					// `res.ok` requires a real API response.
					if (browser) {
						try {
							window.dispatchEvent(new CustomEvent('ciphra:synced'));
						} catch {}
					}
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
			const { sourceUserId } = resolveVault();
			const res = sourceUserId
				? await api.familyDocumentDelete(sourceUserId, id)
				: await api.deleteDocument(id);
			if (res.ok) {
				update((docs) => docs.filter((d) => d.id !== id));
				await store.load();
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
