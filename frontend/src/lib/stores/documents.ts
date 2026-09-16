import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { auth } from './auth';
import { familyLinks, activeVault } from './familyLinks';
import * as api from '$lib/api';
import { encryptDocument, decryptDocument } from '$lib/crypto';
import { getAllDocs, putDocs, type CachedDoc } from '$lib/idb';
import { shareClassOf, isVisibleUnderMask, SHARE_MASK_SHARED_ONLY } from '$lib/utils/shareClass';
import {
	enqueue as outboxEnqueue,
	dequeue as outboxDequeue,
	getPending as outboxGetPending,
	updateCiphertext as outboxUpdateCiphertext,
	refreshPendingCount,
	type OutboxRecord,
} from '$lib/outbox';

/**
 * What the last load/save failed at, as a code — the shell translates it.
 * These used to be English literals rendered raw in every locale.
 */
export type DocumentsError = 'load' | 'save' | 'update';
export const documentsError = writable<DocumentsError | null>(null);

/**
 * How many of the patient's documents the current linked-vault view is
 * withholding (diary + entries the patient locked). Zero when looking at your
 * own vault.
 *
 * The caregiver banner tells them the number exists — CIPH-726's point is that
 * a caregiver has to know they are seeing a partial record, or they will read
 * a quiet week as a quiet week. It used to count them out of `$documents`,
 * which only worked because the filter it was describing did not exist.
 */
export const caregiverHiddenCount = writable(0);

export interface CiphraDocument {
	id: number;
	serverCreatedAt: string;
	data: any;
	/** Optimistic write queued offline, not yet confirmed by the server. */
	_pending?: boolean;
	/** Outbox record id backing a pending doc (so edit/cancel can find it). */
	_tempId?: string;
}

interface RawDoc { id: number; encrypted_data: string; created_at: string; share_class?: number | null; }

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
		// The active vault's link is not loaded (a reload restores
		// `activeVault` from sessionStorage before the links arrive) or no
		// longer exists. This used to fall back to the user's OWN vault: the
		// caregiver's data rendered under the patient's banner, and the next
		// write went to the wrong account. No key instead — reads and writes
		// refuse until the links load, and the shell snaps an unknown vault
		// back to "own" once it knows.
		return { masterKey: null, sourceUserId: active, cacheKey: `${uname}:linked:${active}`, username: uname };
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

/** The partition key the store is meant to show right now. */
function currentCacheKey(): string {
	const uname = get(auth).username ?? '';
	const active = get(activeVault);
	return active ? `${uname}:linked:${active}` : `${uname}:self`;
}

// --- Batch sizing ---------------------------------------------------------
//
// The server caps a batch at 100 documents AND Flask refuses any body over
// 2 MiB with a 413. Chunking by count alone meant a migration of long diary
// entries 413'd, and the caller's fallback turned one request into a hundred.
// 1.5 MiB leaves room for headers and the JSON envelope.
export const BATCH_MAX_DOCS = 100;
export const BATCH_MAX_BYTES = 1.5 * 1024 * 1024;

/**
 * Split `items` into runs of at most `maxCount` whose serialised JSON array
 * stays within `maxBytes`. An item that is too big on its own still gets a
 * run of its own — the server is the one to refuse it, not this function.
 */
export function chunkForBatch<T>(items: T[], maxCount = BATCH_MAX_DOCS, maxBytes = BATCH_MAX_BYTES): T[][] {
	// `{"documents":[]}` around the array, and a comma between items.
	const ENVELOPE = 16;
	const encoder = new TextEncoder();
	const chunks: T[][] = [];
	let current: T[] = [];
	let bytes = ENVELOPE;
	for (const item of items) {
		const size = encoder.encode(JSON.stringify(item)).length + 1;
		if (current.length > 0 && (current.length >= maxCount || bytes + size > maxBytes)) {
			chunks.push(current);
			current = [];
			bytes = ENVELOPE;
		}
		current.push(item);
		bytes += size;
	}
	if (current.length > 0) chunks.push(current);
	return chunks;
}

// --- Own-vault write tracking ---------------------------------------------
//
// The share-class reconcile after a load (see reconcileShareClasses) decides
// from a snapshot. If an owner write lands between the snapshot and the
// reconcile, the reconcile would stamp the OLD plaintext's class over the
// new one — the privacy-relevant case being "just marked private, then
// reclassified shareable". So: writes to the own vault are counted, a
// reconcile only runs when none started since the snapshot was taken, and a
// write that starts while a reconcile call is on the wire waits for it.
let ownWriteSeq = 0;
let ownWritesInFlight = 0;
let classifying: Promise<unknown> | null = null;

async function ownWrite<T>(sourceUserId: number | null | undefined, send: () => Promise<T>): Promise<T> {
	// A caregiver's write never carries a class — the server forces it.
	if (sourceUserId != null) return send();
	ownWriteSeq++;
	ownWritesInFlight++;
	try {
		if (classifying) {
			try { await classifying; } catch { /* a failed reconcile blocks nothing */ }
		}
		return await send();
	} finally {
		ownWritesInFlight--;
	}
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
		cacheKey: string,
		linked: boolean,
		shareMask: number
	): Promise<{ docs: CiphraDocument[]; freshCache: CachedDoc[]; hidden: number }> {
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
		let hidden = 0;
		for (const r of results) {
			if (r.status !== 'fulfilled') continue;
			const { doc, etag } = r.value;
			// family_link entries live in the same encrypted_documents table
			// but are metadata for the family-sharing store, not health data.
			if (doc.data?.type === 'family_link') continue;
			// The patient's diary and locked entries are not the caregiver's to
			// read. Dropped before `freshCache` so they are not written to this
			// device either — `putDocs` replaces the partition, so a cache from
			// before this filter is purged on the first successful load.
			//
			// This is a client-side control: the grant re-wraps the patient's
			// master key, so the ciphertext still arrives and is still
			// decryptable here. Making it a real boundary means not sending
			// those rows at all — see the per-grant scope work.
			if (linked && !isVisibleUnderMask(doc, shareMask)) {
				hidden++;
				continue;
			}
			docs.push(doc);
			freshCache.push({
				id: doc.id,
				user_id: cacheKey,
				data: doc.data,
				etag,
				created_at: doc.serverCreatedAt,
			});
		}
		return { docs, freshCache, hidden };
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
		username: string,
		linked: boolean,
		shareMask: number
	): Promise<CiphraDocument[]> {
		const gate = (docs: CiphraDocument[]) =>
			linked ? docs.filter((d) => isVisibleUnderMask(d, shareMask)) : docs;
		if (!browser) return gate(base);
		let pending: OutboxRecord[];
		try {
			pending = await outboxGetPending(username);
		} catch {
			return base;
		}
		const mine = pending.filter(r => r.cacheKey === cacheKey);
		if (mine.length === 0) return gate(base);

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
		// Gated last so a queued write cannot reintroduce what the load
		// filtered: an update can flip an already-visible doc to private.
		return gate([...createDocs, ...surviving]);
	}

	/**
	 * Bring the server's `share_class` in line with the plaintext.
	 *
	 * Two ways they drift. Everything written before the sharing scope
	 * existed carries NULL, which the server reads as not-shareable. And a
	 * write that did not carry the class — an offline edit queued by an
	 * older build, or a caregiver editing an entry — leaves the old class in
	 * place (the PUT keeps it via COALESCE): an entry locked while offline
	 * synced still SHAREABLE and was served to a narrow-scope caregiver.
	 * Only the owner can repair either: the class comes from the plaintext,
	 * and only the owner's session holds the key.
	 *
	 * `seqAtFetch` is the own-write generation when the GET went out, or -1
	 * if a write was already in flight then (the snapshot may be stale). The
	 * pass stops the moment an owner write has started since — see
	 * `ownWrite`. Runs after the owner's own load, never on a linked vault.
	 * Failures are swallowed: it is a repair pass, and the next load retries.
	 */
	async function reconcileShareClasses(rawDocs: RawDoc[], docs: CiphraDocument[], seqAtFetch: number): Promise<void> {
		const byId = new Map(docs.map((d) => [d.id, d]));
		const pending: { id: number; share_class: number }[] = [];
		for (const raw of rawDocs) {
			const doc = byId.get(raw.id);
			if (!doc?.data) continue; // undecryptable or family_link — leave it alone
			const wanted = shareClassOf(doc.data);
			if (raw.share_class === wanted) continue;
			pending.push({ id: raw.id, share_class: wanted });
		}
		if (pending.length === 0) return;
		// The server caps a call; send in chunks so a long history still
		// classifies in one pass rather than silently dropping the tail.
		for (let i = 0; i < pending.length; i += BATCH_MAX_DOCS) {
			// Checked and claimed in the same tick: a write that starts after
			// this line waits for the call below instead of racing it.
			if (seqAtFetch !== ownWriteSeq || ownWritesInFlight > 0) return;
			let call: Promise<unknown> | null = null;
			try {
				call = api.classifyDocuments(pending.slice(i, i + BATCH_MAX_DOCS));
				classifying = call;
				await call;
			} catch {
				return; // offline or refused — the next load retries
			} finally {
				if (classifying === call) classifying = null;
			}
		}
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

	/**
	 * The class a queued write must replay with. Own vault only: the flush
	 * has only ciphertext, and a PUT without a class keeps the server's old
	 * one. A caregiver's write never carries a class — the server forces
	 * those shareable and would ignore it anyway.
	 */
	function queuedShareClass(data: any, ctx: VaultCtx): number | undefined {
		return ctx.sourceUserId == null ? shareClassOf(data) : undefined;
	}

	async function queueCreate(encrypted: string, data: any, ctx: VaultCtx): Promise<boolean> {
		const tempId = await outboxEnqueue({
			cacheKey: ctx.cacheKey,
			username: ctx.username,
			sourceUserId: ctx.sourceUserId,
			op: 'create',
			ciphertext: encrypted,
			shareClass: queuedShareClass(data, ctx),
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
			// Without this an entry locked while offline replayed with no
			// class, the server kept SHAREABLE, and a narrow-scope caregiver
			// was served it.
			shareClass: queuedShareClass(data, ctx),
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

	/**
	 * An online update just landed; queued offline updates of the same
	 * document are older by definition. Replaying them later would put the
	 * stale version back over the one the user just saved.
	 */
	async function dropSupersededUpdates(ctx: VaultCtx, id: number): Promise<void> {
		if (!browser) return;
		try {
			const stale = (await outboxGetPending(ctx.username)).filter(
				(r) => r.op === 'update' && r.serverId === id && r.cacheKey === ctx.cacheKey,
			);
			if (stale.length === 0) return;
			for (const r of stale) await outboxDequeue(r.tempId);
			await refreshPendingCount(ctx.username);
		} catch {
			// Best effort — the worst case is the old behaviour.
		}
	}

	let flushing: Promise<void> | null = null;
	let flushAgain = false;

	/** Vault identity of a queued record: records of different vaults are independent. */
	function vaultOf(rec: OutboxRecord): string {
		return rec.sourceUserId != null ? `linked:${rec.sourceUserId}` : 'self';
	}

	function sendQueued(rec: OutboxRecord): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
		const src = rec.sourceUserId;
		if (rec.op === 'create') {
			return ownWrite(src, () => src
				? api.familyDocumentCreate(src, rec.ciphertext as string)
				: api.storeDocument(rec.ciphertext as string, rec.shareClass));
		}
		if (rec.op === 'update') {
			return ownWrite(src, () => src
				? api.familyDocumentUpdate(src, rec.serverId as number, rec.ciphertext as string)
				: api.updateDocument(rec.serverId as number, rec.ciphertext as string, rec.shareClass));
		}
		return src
			? api.familyDocumentDelete(src, rec.serverId as number)
			: api.deleteDocument(rec.serverId as number);
	}

	/**
	 * One pass over the outbox. Order is kept WITHIN a vault; a vault that
	 * cannot make progress is set aside for this pass and the others carry
	 * on. Strict oldest-first across everything meant one caregiver write
	 * into a revoked vault blocked every later write to the user's own vault
	 * for good.
	 *
	 * - 403 from a linked vault's API: the grant is gone and will not come
	 *   back. That vault's queued writes are dropped (they can never be
	 *   written), and api.ts has already told the shell, which snaps the
	 *   switcher back and says access was removed.
	 * - 429 `quota_exceeded`: the vault owner is at the document cap. Kept
	 *   queued — dropping someone's entries is not ours to decide — set
	 *   aside, and announced once.
	 * - Anything else retryable: that vault waits for the next trigger.
	 * - No response at all, or a 401: the network or the session is gone for
	 *   every vault. Stop.
	 * - A permanent client error: drop the record so it cannot wedge its vault.
	 */
	async function drainOutbox(): Promise<void> {
		const { username } = get(auth);
		if (!username) return;
		let records: OutboxRecord[];
		try {
			records = await outboxGetPending(username);
		} catch {
			return;
		}
		if (records.length === 0) return;

		let changed = 0;
		let synced = 0;
		let quotaHit = false;
		const setAside = new Set<string>();
		for (const rec of records) {
			const vault = vaultOf(rec);
			if (setAside.has(vault)) continue;
			let res: { ok: boolean; status: number; data: Record<string, unknown> };
			try {
				res = await sendQueued(rec);
			} catch {
				break; // network dropped mid-drain, or unexpected — retry on the next trigger
			}
			try {
				// A remove whose target is already gone is a success.
				if (res.ok || (rec.op === 'remove' && res.status === 404)) {
					await outboxDequeue(rec.tempId);
					changed++;
					synced++;
					continue;
				}
				if (res.status === 0 || res.status === 401) break;
				// The API's own JSON 403, not an HTML one from a WAF in front of it.
				if (res.status === 403 && rec.sourceUserId != null && typeof res.data?.error === 'string') {
					for (const r of records) {
						if (vaultOf(r) === vault) await outboxDequeue(r.tempId);
					}
					setAside.add(vault);
					changed++;
					continue;
				}
				if (res.status === 429 && res.data?.error === 'quota_exceeded') {
					setAside.add(vault);
					quotaHit = true;
					continue;
				}
				if (isRetryableStatus(res.status)) {
					setAside.add(vault);
					continue;
				}
				// Permanent client error: drop so it can't wedge the queue.
				await outboxDequeue(rec.tempId);
				changed++;
			} catch {
				break; // the outbox itself failed — stop, retry on the next trigger
			}
		}

		await refreshPendingCount(username);
		if (quotaHit) {
			try {
				window.dispatchEvent(new CustomEvent('ciphra:sync-blocked', { detail: { reason: 'quota' } }));
			} catch { /* ignore */ }
		}
		if (changed > 0) {
			await reloadAfterWrite();
			if (synced > 0) {
				try { window.dispatchEvent(new CustomEvent('ciphra:synced')); } catch {}
			}
		}
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
			const linked = sourceUserId != null;
			// Narrow until the server says otherwise. The client filter is
			// defence in depth behind the server's own WHERE clause — if it
			// defaulted wide, a stale response would show what a narrow grant
			// must not.
			let shareMask = SHARE_MASK_SHARED_ONLY;

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
						// A cache written before the caregiver filter existed still
						// holds the patient's private documents. applyOutbox gates
						// them out of the render; the server pass below rewrites the
						// partition without them.
						const shown = await applyOutbox(instant, masterKey, cacheKey, username, linked, shareMask);
						if (currentCacheKey() !== cacheKey) return false;
						caregiverHiddenCount.set(linked ? instant.length - shown.length : 0);
						set(shown);
					} else {
						// No cache yet, but queued offline writes may still exist.
						const shown = await applyOutbox([], masterKey, cacheKey, username, linked, shareMask);
						if (currentCacheKey() !== cacheKey) return false;
						set(shown);
					}
				} catch {
					// cache miss is fine
				}
			}
			const tCache = performance.now();

			// Own-write generation as of the GET, for the share-class
			// reconcile. -1 when a write is already on the wire: the response
			// may predate it, so the snapshot must not drive a reclassify.
			const seqAtFetch = ownWritesInFlight === 0 ? ownWriteSeq : -1;
			try {
				const res = sourceUserId
					? await api.familyDocuments(sourceUserId)
					: await api.getDocuments();
				const tFetch = performance.now();
				if (res.ok) {
					// The grant's scope and the count it withholds are the
					// server's to state — it is the only party that can see
					// both sides of the filter.
					if (linked && typeof res.data.share_mask === 'number') {
						shareMask = res.data.share_mask as number;
					}
					const rawDocs = (res.data.documents as RawDoc[]) || [];
					for (const d of rawDocs) {
						if (cachedByEtag.has(`${d.id}|${d.encrypted_data}`)) cacheHits++;
						else fresh++;
					}
					const { docs, freshCache, hidden } = await decryptDocs(rawDocs, masterKey, cachedByEtag, cacheKey, linked, shareMask);
					const tDecrypt = performance.now();
					// Prefer the server's number: it counts what it withheld,
					// which the client cannot see at all any more.
					const withheld = res.data.withheld;
					caregiverHiddenCount.set(
						linked && typeof withheld === 'number' ? (withheld as number) : hidden,
					);
					const shown = await applyOutbox(docs, masterKey, cacheKey, username, linked, shareMask);
					// The user switched vault while this was on the wire. Its
					// documents belong to a vault nobody is looking at any
					// more; rendering them would put one account's data under
					// another's banner.
					if (currentCacheKey() !== cacheKey) return false;
					set(shown);
					if (!linked) void reconcileShareClasses(rawDocs, docs, seqAtFetch);
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
					documentsError.set('load');
					return false;
				}
			} catch {
				documentsError.set('load');
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
		/**
		 * `opts.skipReload` suppresses the post-write reload. Only for callers
		 * that save many documents in a row and reload once at the end.
		 *
		 * INC-001 rehearsal: the migration's per-document fallback path saved
		 * 37 documents and reloaded after every single one — 74 requests where
		 * 37 would do, against an nginx `burst=20`. Half of them 503'd, the
		 * import aborted, and the user had to click "import" four times to get
		 * their data in.
		 */
		async save(data: any, opts?: { skipReload?: boolean }): Promise<boolean> {
			const ctx = resolveVault();
			if (!ctx.masterKey) return false;
			let encrypted: string;
			try {
				encrypted = await encryptDocument(data, ctx.masterKey);
			} catch {
				documentsError.set('save');
				return false;
			}
			try {
				const res = await ownWrite(ctx.sourceUserId, () => ctx.sourceUserId
					? api.familyDocumentCreate(ctx.sourceUserId, encrypted)
					: api.storeDocument(encrypted, shareClassOf(data)));
				if (res.ok) {
					documentsError.set(null);
					// CIPH-767e — sync indicator: notify the UI that a successful
					// save round-trip to the server completed so the layout can
					// surface a brief "Synced" toast.
					if (browser) {
						try { window.dispatchEvent(new CustomEvent('ciphra:synced')); } catch {}
					}
					if (!opts?.skipReload) await reloadAfterWrite();
					return true;
				}
				if (isOfflineStatus(res.status)) return queueCreate(encrypted, data, ctx);
				documentsError.set('save');
				return false;
			} catch (e) {
				if (isNetworkError(e)) return queueCreate(encrypted, data, ctx);
				documentsError.set('save');
				return false;
			}
		},
		// Track-3 3.4 — bulk create for the migration import. SELF-VAULT ONLY
		// (migration imports into your own new account; no family batch path).
		// Encrypts each item with the master key, posts one batch, and returns
		// the server's per-item results (status created|skipped|error) aligned to
		// the input order. NOT offline-queued — migration is an online,
		// resumable-via-client_key flow, and queueing partial batches would
		// muddy the idempotency story. Falls back to per-doc save() at the call
		// site if this returns ok:false.
		/**
		 * INC-001 rehearsal: the caller needs to know WHY a batch failed.
		 * "Overloaded, try again shortly" and "this payload is bad" demand
		 * opposite responses, and treating the first like the second is what
		 * made a single 503 escalate into 37 individual retries.
		 * `status` is 0 when the request never produced a response.
		 *
		 * The items go out in as many requests as the server's limits need
		 * (see chunkForBatch). If one of them fails the whole call reports
		 * that failure: a retry re-sends everything, and the client keys make
		 * the already-stored part come back `skipped`.
		 */
		async saveBatch(
			items: { data: any; clientKey?: string }[]
		): Promise<{ ok: boolean; status: number; results: Array<{ client_key?: string; status: string; id?: number; error?: string }> }> {
			const ctx = resolveVault();
			if (!ctx.masterKey || ctx.sourceUserId) return { ok: false, status: 0, results: [] };
			const payload: { client_key?: string; encrypted_data: string; share_class?: number }[] = [];
			try {
				for (const it of items) {
					const enc = await encryptDocument(it.data, ctx.masterKey);
					const share_class = shareClassOf(it.data);
					payload.push(it.clientKey
						? { client_key: it.clientKey, encrypted_data: enc, share_class }
						: { encrypted_data: enc, share_class });
				}
			} catch {
				documentsError.set('save');
				return { ok: false, status: 0, results: [] };
			}
			const results: Array<{ client_key?: string; status: string; id?: number; error?: string }> = [];
			let status = 0;
			try {
				for (const chunk of chunkForBatch(payload)) {
					const res = await ownWrite(null, () => api.storeDocumentsBatch(chunk));
					status = res.status;
					if (!res.ok) {
						// Don't shout "failed to save" at the user for a retryable
						// overload — the caller decides, and it will simply wait.
						if (!isRetryableStatus(res.status)) documentsError.set('save');
						return { ok: false, status: res.status, results: [] };
					}
					results.push(...(((res.data.results as any[]) || [])));
				}
			} catch {
				documentsError.set('save');
				return { ok: false, status: 0, results: [] };
			}
			documentsError.set(null);
			if (browser) { try { window.dispatchEvent(new CustomEvent('ciphra:synced')); } catch { /* ignore */ } }
			await reloadAfterWrite();
			return { ok: true, status, results };
		},
		async updateDoc(id: number, data: any): Promise<boolean> {
			const ctx = resolveVault();
			if (!ctx.masterKey) return false;
			let encrypted: string;
			try {
				encrypted = await encryptDocument(data, ctx.masterKey);
			} catch {
				documentsError.set('update');
				return false;
			}
			// Editing a not-yet-synced offline create: mutate its queued
			// ciphertext in place rather than hitting the server with a temp id.
			// The class travels with it — the create replays with whatever the
			// record says, and "locked it before it synced" must stick.
			if (id < 0) {
				const tempId = tempIdOf(id);
				if (tempId) {
					try { await outboxUpdateCiphertext(tempId, encrypted, queuedShareClass(data, ctx)); } catch {}
					update((docs) => docs.map((d) => (d.id === id ? { ...d, data } : d)));
					documentsError.set(null);
					await refreshPendingCount(ctx.username);
					return true;
				}
			}
			try {
				const res = await ownWrite(ctx.sourceUserId, () => ctx.sourceUserId
					? api.familyDocumentUpdate(ctx.sourceUserId, id, encrypted)
					: api.updateDocument(id, encrypted, shareClassOf(data)));
				if (res.ok) {
					documentsError.set(null);
					await dropSupersededUpdates(ctx, id);
					await reloadAfterWrite();
					return true;
				}
				if (isOfflineStatus(res.status)) return queueUpdate(id, encrypted, data, ctx);
				documentsError.set('update');
				return false;
			} catch (e) {
				if (isNetworkError(e)) return queueUpdate(id, encrypted, data, ctx);
				documentsError.set('update');
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
			// Same refusal as save/updateDoc: an unresolved vault must not
			// turn into a delete against the user's own account.
			if (!ctx.masterKey) return false;
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
		 * Replay every queued write for the logged-in user, oldest first
		 * within each vault. Triggered on reconnect, tab-focus, and once after
		 * login.
		 *
		 * Single-flight: `online` and `visibilitychange` fire together when a
		 * phone wakes, and two overlapping drains each POSTed the same queued
		 * create — a duplicate document per offline entry. A call that arrives
		 * mid-drain shares the running promise and earns one more pass after
		 * it, so a write queued in the meantime is not left waiting for the
		 * next trigger.
		 */
		async flushOutbox(): Promise<void> {
			if (!browser) return;
			if (flushing) {
				flushAgain = true;
				return flushing;
			}
			flushing = (async () => {
				try {
					do {
						flushAgain = false;
						await drainOutbox();
					} while (flushAgain);
				} finally {
					flushing = null;
				}
			})();
			return flushing;
		},
		// In-memory reset only. On logout/delete, auth.logout() wipes ALL
		// on-disk partitions via clearAllPartitions(); on vault switch we WANT
		// to keep the cache for fast re-entry. The old targeted clearDocs() here
		// also resolved the wrong partition after auth state was reset (empty
		// username → ':self'), so it wiped nothing useful anyway.
		clear() {
			set([]);
			tempIdToNeg.clear();
			caregiverHiddenCount.set(0);
			inFlightKey = null;
		}
	};

	return store;
}

export const documents = createDocStore();
