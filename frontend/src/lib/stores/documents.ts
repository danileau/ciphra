import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { auth } from './auth';
import { familyLinks, activeVault } from './familyLinks';
import * as api from '$lib/api';
import { encryptDocument, decryptDocument } from '$lib/crypto';
import { getAllDocs, putDocs, type CachedDoc } from '$lib/idb';
import {
	enqueue as outboxEnqueue,
	dequeue as outboxDequeue,
	getPending as outboxGetPending,
	updateCiphertext as outboxUpdateCiphertext,
	refreshPendingCount,
	type OutboxRecord,
} from '$lib/outbox';

export const documentsError = writable<string | null>(null);

export interface CiphraDocument {
	id: number;
	serverCreatedAt: string;
	data: any;
	/** Optimistic write queued offline, not yet confirmed by the server. */
	_pending?: boolean;
	/** Outbox record id backing a pending doc (so edit/cancel can find it). */
	_tempId?: string;
}

interface RawDoc { id: number; encrypted_data: string; created_at: string; }

interface VaultCtx {
	masterKey: Uint8Array | null;
	sourceUserId: number | null;
	cacheKey: string;
	username: string;
}

function resolveVault(): VaultCtx {
	const { masterKey, username } = get(auth);
	const uname = username ?? '';
	const active = get(activeVault);
	if (!active) {
		return { masterKey, sourceUserId: null, cacheKey: `${uname}:self`, username: uname };
	}
	const link = get(familyLinks).find(l => l.sourceUserId === active);
	if (!link) {
		return { masterKey, sourceUserId: null, cacheKey: `${uname}:self`, username: uname };
	}
	return {
		masterKey: link.patientMasterKey,
		sourceUserId: active,
		cacheKey: `${uname}:linked:${active}`,
		username: uname,
	};
}

// --- Offline write classification ---------------------------------------
//
// A write should be queued (not failed) only when the server is genuinely
// unreachable: a thrown fetch error, the device reporting offline, or the
// service worker's 503 "offline" stub / a transient 5xx. Real client errors
// (401 auth, 400 malformed) are NOT queued — they surface as failures.

function isNetworkError(e: unknown): boolean {
	if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
	return e instanceof TypeError || (e as { name?: string })?.name === 'TypeError';
}

/** Status codes that mean "try again later", i.e. queue the write. */
function isOfflineStatus(status: number): boolean {
	return status === 0 || status === 408 || status === 429 || status === 503 || status >= 500;
}

/** Status codes during flush that mean "stop and retry on the next trigger". */
function isRetryableStatus(status: number): boolean {
	return status === 401 || status === 403 || isOfflineStatus(status);
}

// Optimistic docs render with negative ids so they never collide with real
// server ids. The mapping from an outbox tempId to its negative id is stable
// for the session so Svelte doesn't re-key the row on every reload.
let tempCounter = -1;
const tempIdToNeg = new Map<string, number>();
function negIdFor(tempId: string): number {
	let n = tempIdToNeg.get(tempId);
	if (n === undefined) { n = tempCounter--; tempIdToNeg.set(tempId, n); }
	return n;
}

function createDocStore() {
	const { subscribe, set, update } = writable<CiphraDocument[]>([]);
	let loading = false;
	// The promise of the currently-running load(), shared with concurrent
	// callers so they await the SAME fetch instead of resolving instantly.
	// Resolves to `true` only when the server fetch actually succeeded — a
	// failed/early-returned load resolves `false` so callers can distinguish
	// "loaded, genuinely no documents" from "couldn't load" (the latter must
	// NOT be treated as an authoritative empty vault — see the layout's
	// setup-redirect guard).
	let inFlight: Promise<boolean> | null = null;
	// cacheKey (vault identity) of the in-flight load. A load for a DIFFERENT
	// vault must NOT be coalesced into this one (caregiver switched mid-load).
	let inFlightKey: string | null = null;

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

	/**
	 * Overlay the offline outbox on top of an authoritative doc set so queued
	 * writes stay visible across reloads while still offline. Creates appear as
	 * pending rows; updates replace the live doc's data; removes hide it. Only
	 * the active vault's records (matching cacheKey) are applied. Ciphertext is
	 * decrypted here with the in-memory master key — nothing plaintext is read
	 * from the outbox at rest.
	 */
	async function applyOutbox(
		base: CiphraDocument[],
		masterKey: Uint8Array,
		cacheKey: string,
		username: string
	): Promise<CiphraDocument[]> {
		if (!browser) return base;
		let pending: OutboxRecord[];
		try {
			pending = await outboxGetPending(username);
		} catch {
			return base;
		}
		const mine = pending.filter(r => r.cacheKey === cacheKey);
		if (mine.length === 0) return base;

		const removedIds = new Set(
			mine.filter(r => r.op === 'remove' && r.serverId != null).map(r => r.serverId)
		);
		const updates = new Map(
			mine.filter(r => r.op === 'update' && r.serverId != null).map(r => [r.serverId as number, r])
		);

		const surviving = await Promise.all(
			base
				.filter(d => !removedIds.has(d.id))
				.map(async (d) => {
					const u = updates.get(d.id);
					if (!u || !u.ciphertext) return d;
					try {
						const data = await decryptDocument(u.ciphertext, masterKey);
						return { ...d, data, _pending: true, _tempId: u.tempId };
					} catch {
						return d;
					}
				})
		);

		const createDocs: CiphraDocument[] = [];
		for (const r of mine) {
			if (r.op !== 'create' || !r.ciphertext) continue;
			try {
				const data = await decryptDocument(r.ciphertext, masterKey);
				if (data?.type === 'family_link') continue;
				createDocs.push({
					id: negIdFor(r.tempId),
					serverCreatedAt: new Date(r.createdAt).toISOString(),
					data,
					_pending: true,
					_tempId: r.tempId,
				});
			} catch {
				// Undecryptable record (wrong vault) — leave it queued, skip render.
			}
		}
		// Newest queued create first; server docs keep their order after.
		createDocs.reverse();
		return [...createDocs, ...surviving];
	}

	/** Find the outbox tempId backing an optimistic (negative-id) doc. */
	function tempIdOf(negId: number): string | undefined {
		return get({ subscribe }).find((d) => d.id === negId)?._tempId;
	}

	function notifyQueued() {
		if (browser) {
			try { window.dispatchEvent(new CustomEvent('ciphra:queued')); } catch {}
		}
	}

	async function queueCreate(encrypted: string, data: any, ctx: VaultCtx): Promise<boolean> {
		const tempId = await outboxEnqueue({
			cacheKey: ctx.cacheKey,
			username: ctx.username,
			sourceUserId: ctx.sourceUserId,
			op: 'create',
			ciphertext: encrypted,
		});
		update((docs) => [
			{
				id: negIdFor(tempId),
				serverCreatedAt: new Date().toISOString(),
				data,
				_pending: true,
				_tempId: tempId,
			} as CiphraDocument,
			...docs,
		]);
		documentsError.set(null);
		await refreshPendingCount(ctx.username);
		notifyQueued();
		return true;
	}

	async function queueUpdate(id: number, encrypted: string, data: any, ctx: VaultCtx): Promise<boolean> {
		await outboxEnqueue({
			cacheKey: ctx.cacheKey,
			username: ctx.username,
			sourceUserId: ctx.sourceUserId,
			op: 'update',
			serverId: id,
			ciphertext: encrypted,
		});
		update((docs) => docs.map((d) => (d.id === id ? { ...d, data, _pending: true } : d)));
		documentsError.set(null);
		await refreshPendingCount(ctx.username);
		notifyQueued();
		return true;
	}

	async function queueRemove(id: number, ctx: VaultCtx): Promise<boolean> {
		await outboxEnqueue({
			cacheKey: ctx.cacheKey,
			username: ctx.username,
			sourceUserId: ctx.sourceUserId,
			op: 'remove',
			serverId: id,
		});
		update((docs) => docs.filter((d) => d.id !== id));
		await refreshPendingCount(ctx.username);
		notifyQueued();
		return true;
	}

	// After a server write, guarantee a FRESH fetch even if a (pre-write) load
	// is already in flight: await the in-flight one (so we don't interleave two
	// set() sequences), then run a new load. Without this, a writer's reconcile
	// load() would be coalesced into the stale in-flight read and the new doc
	// wouldn't appear until the next load.
	async function reloadAfterWrite(): Promise<boolean> {
		if (loading && inFlight) { try { await inFlight; } catch { /* ignore */ } }
		return store.load();
	}

	const store = {
		subscribe,
		async load(): Promise<boolean> {
			// Concurrent callers (the layout's post-login load + a page
			// component's own onMount load) must AWAIT the same in-flight fetch.
			// The old `if (loading) return;` resolved the second caller's
			// promise instantly while $documents was still empty — so the
			// dashboard flipped `loaded=true` with no blueprint yet and rendered
			// its "no profile yet" onboarding state until a manual refresh.
			// Capture the vault context ONCE so a mid-load activeVault change
			// can't make this fetch write the wrong partition.
			const ctx = resolveVault();
			if (!ctx.masterKey) return false;
			// Concurrent SAME-vault callers (layout post-login load + a page's
			// onMount load) AWAIT the same in-flight fetch. A DIFFERENT vault
			// (caregiver switched mid-load) must NOT piggyback on the previous
			// vault's load — wait for it to settle, then run a fresh one.
			if (loading) {
				if (inFlightKey === ctx.cacheKey) return inFlight ?? Promise.resolve(false);
				try { await inFlight; } catch { /* settle the prior vault's load */ }
			}
			loading = true;
			inFlightKey = ctx.cacheKey;
			inFlight = (async (): Promise<boolean> => {
			const { masterKey, sourceUserId, cacheKey, username } = ctx;
			if (!masterKey) return false;

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
						set(await applyOutbox(instant, masterKey, cacheKey, username));
					} else {
						// No cache yet, but queued offline writes may still exist.
						set(await applyOutbox([], masterKey, cacheKey, username));
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
					set(await applyOutbox(docs, masterKey, cacheKey, username));
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
					return true;
				} else {
					documentsError.set('Failed to load documents');
					return false;
				}
			} catch {
				documentsError.set('Failed to load documents');
				return false;
			}
			})();
			try {
				return await inFlight;
			} finally {
				loading = false;
				inFlight = null;
				inFlightKey = null;
			}
		},
		async save(data: any): Promise<boolean> {
			const ctx = resolveVault();
			if (!ctx.masterKey) return false;
			let encrypted: string;
			try {
				encrypted = await encryptDocument(data, ctx.masterKey);
			} catch {
				documentsError.set('Failed to save document');
				return false;
			}
			try {
				const res = ctx.sourceUserId
					? await api.familyDocumentCreate(ctx.sourceUserId, encrypted)
					: await api.storeDocument(encrypted);
				if (res.ok) {
					documentsError.set(null);
					// CIPH-767e — sync indicator: notify the UI that a successful
					// save round-trip to the server completed so the layout can
					// surface a brief "Synced" toast.
					if (browser) {
						try { window.dispatchEvent(new CustomEvent('ciphra:synced')); } catch {}
					}
					await reloadAfterWrite();
					return true;
				}
				if (isOfflineStatus(res.status)) return queueCreate(encrypted, data, ctx);
				documentsError.set('Failed to save document');
				return false;
			} catch (e) {
				if (isNetworkError(e)) return queueCreate(encrypted, data, ctx);
				documentsError.set('Failed to save document');
				return false;
			}
		},
		async updateDoc(id: number, data: any): Promise<boolean> {
			const ctx = resolveVault();
			if (!ctx.masterKey) return false;
			let encrypted: string;
			try {
				encrypted = await encryptDocument(data, ctx.masterKey);
			} catch {
				documentsError.set('Failed to update document');
				return false;
			}
			// Editing a not-yet-synced offline create: mutate its queued
			// ciphertext in place rather than hitting the server with a temp id.
			if (id < 0) {
				const tempId = tempIdOf(id);
				if (tempId) {
					try { await outboxUpdateCiphertext(tempId, encrypted); } catch {}
					update((docs) => docs.map((d) => (d.id === id ? { ...d, data } : d)));
					documentsError.set(null);
					await refreshPendingCount(ctx.username);
					return true;
				}
			}
			try {
				const res = ctx.sourceUserId
					? await api.familyDocumentUpdate(ctx.sourceUserId, id, encrypted)
					: await api.updateDocument(id, encrypted);
				if (res.ok) {
					documentsError.set(null);
					await reloadAfterWrite();
					return true;
				}
				if (isOfflineStatus(res.status)) return queueUpdate(id, encrypted, data, ctx);
				documentsError.set('Failed to update document');
				return false;
			} catch (e) {
				if (isNetworkError(e)) return queueUpdate(id, encrypted, data, ctx);
				documentsError.set('Failed to update document');
				return false;
			}
		},
		async remove(id: number): Promise<boolean> {
			const ctx = resolveVault();
			// Removing a not-yet-synced offline create: cancel the queued write.
			if (id < 0) {
				const tempId = tempIdOf(id);
				if (tempId) {
					try { await outboxDequeue(tempId); } catch {}
				}
				update((docs) => docs.filter((d) => d.id !== id));
				await refreshPendingCount(ctx.username);
				return true;
			}
			try {
				const res = ctx.sourceUserId
					? await api.familyDocumentDelete(ctx.sourceUserId, id)
					: await api.deleteDocument(id);
				if (res.ok) {
					update((docs) => docs.filter((d) => d.id !== id));
					await reloadAfterWrite();
					return true;
				}
				if (isOfflineStatus(res.status)) return queueRemove(id, ctx);
				return false;
			} catch (e) {
				if (isNetworkError(e)) return queueRemove(id, ctx);
				return false;
			}
		},
		/**
		 * Replay every queued write for the logged-in user, oldest first.
		 * Triggered on reconnect, tab-focus, and once after login. Drops a
		 * record only on permanent client errors (to avoid a poison queue);
		 * a transient/offline status stops the drain so the rest retries
		 * later. Reconciles via a full reload and fires `ciphra:synced`.
		 */
		async flushOutbox(): Promise<void> {
			if (!browser) return;
			const { username } = get(auth);
			if (!username) return;
			let records: OutboxRecord[];
			try {
				records = await outboxGetPending(username);
			} catch {
				return;
			}
			if (records.length === 0) return;

			let flushed = 0;
			for (const rec of records) {
				try {
					let res: { ok: boolean; status: number };
					if (rec.op === 'create') {
						res = rec.sourceUserId
							? await api.familyDocumentCreate(rec.sourceUserId, rec.ciphertext as string)
							: await api.storeDocument(rec.ciphertext as string);
					} else if (rec.op === 'update') {
						res = rec.sourceUserId
							? await api.familyDocumentUpdate(rec.sourceUserId, rec.serverId as number, rec.ciphertext as string)
							: await api.updateDocument(rec.serverId as number, rec.ciphertext as string);
					} else {
						res = rec.sourceUserId
							? await api.familyDocumentDelete(rec.sourceUserId, rec.serverId as number)
							: await api.deleteDocument(rec.serverId as number);
					}
					// A remove whose target is already gone is a success.
					if (res.ok || (rec.op === 'remove' && res.status === 404)) {
						await outboxDequeue(rec.tempId);
						flushed++;
						continue;
					}
					if (isRetryableStatus(res.status)) break; // still offline / auth — retry later
					// Permanent client error: drop so it can't wedge the queue.
					await outboxDequeue(rec.tempId);
					flushed++;
				} catch (e) {
					if (isNetworkError(e)) break; // network dropped mid-drain
					break; // unexpected — stop, retry on next trigger
				}
			}

			await refreshPendingCount(username);
			if (flushed > 0) {
				await reloadAfterWrite();
				if (browser) {
					try { window.dispatchEvent(new CustomEvent('ciphra:synced')); } catch {}
				}
			}
		},
		// In-memory reset only. On logout/delete, auth.logout() wipes ALL
		// on-disk partitions via clearAllPartitions(); on vault switch we WANT
		// to keep the cache for fast re-entry. The old targeted clearDocs() here
		// also resolved the wrong partition after auth state was reset (empty
		// username → ':self'), so it wiped nothing useful anyway.
		clear() {
			set([]);
			tempIdToNeg.clear();
			inFlightKey = null;
		}
	};

	return store;
}

export const documents = createDocStore();
