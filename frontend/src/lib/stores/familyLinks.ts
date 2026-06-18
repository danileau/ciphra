/**
 * Caregiver-side: tracks patients this user has linked to.
 *
 * Each FamilyLink holds a decrypted copy of the patient's master_key,
 * persisted as a special `family_link` document inside the caregiver's own
 * encrypted vault. That way the link survives a logout/login — the
 * caregiver's password is still enough to decrypt everything, including
 * their access tokens for patient vaults.
 *
 * Server-side, the source-of-truth is the family_grants table. This store
 * reconciles the local cache against it on load.
 */
import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { auth } from './auth';
import { storeDocument, updateDocument, deleteDocument, getDocuments, familyClaimedList } from '$lib/api';
import {
	b64ToBytes, bytesToB64, encryptDocument, decryptDocument,
} from '$lib/crypto';

export interface FamilyLink {
	documentId: number;            // the caregiver's own encrypted_document row holding this link
	sourceUserId: number;
	sourceUsername: string;
	label: string;                 // user-set, patient's grant label
	patientMasterKey: Uint8Array;  // NEVER persisted outside the encrypted document
	linkedAt: string;              // ISO
	// Set by the reconciliation step: true when the patient has revoked this
	// grant server-side. The local doc is still decrypt-capable for historical
	// data but any server call will 403 — UI should offer "remove" only.
	revoked?: boolean;
}

function createStore() {
	const { subscribe, set, update } = writable<FamilyLink[]>([]);
	let loaded = false;

	async function load(): Promise<boolean> {
		if (!browser) return false;
		const state = get(auth);
		if (!state.masterKey) return false;
		const res = await getDocuments();
		// Report failure so callers don't treat an empty list as authoritative —
		// a swallowed failure here made the layout bounce a caregiver-only user
		// (no own blueprint, but linked) to /setup.
		if (!res.ok) return false;
		const docs = (res.data.documents as Array<{ id: number; encrypted_data: string }>) || [];
		const links: FamilyLink[] = [];
		for (const d of docs) {
			try {
				const obj = await decryptDocument(d.encrypted_data, state.masterKey);
				if (obj && obj.type === 'family_link') {
					links.push({
						documentId: d.id,
						sourceUserId: obj.source_user_id,
						sourceUsername: obj.source_username,
						label: obj.label,
						patientMasterKey: b64ToBytes(obj.patient_master_key_b64),
						linkedAt: obj.linked_at,
					});
				}
			} catch {
				// non-link documents (daily logs, etc.) — ignore
			}
		}

		// Reconcile with server: any local link whose grant was revoked by the
		// patient (or the patient deleted their account) gets flagged. We don't
		// delete the local doc automatically — that's the user's decision.
		try {
			const active = await familyClaimedList();
			if (active.ok) {
				const activeIds = new Set(
					(active.data.active as Array<{ source_user_id: number }> || [])
						.map(a => a.source_user_id)
				);
				for (const link of links) {
					link.revoked = !activeIds.has(link.sourceUserId);
				}
			}
		} catch {
			// Offline / server unreachable — leave revoked flag untouched
		}

		set(links);
		loaded = true;
		return true;
	}

	async function addLink(params: {
		sourceUserId: number;
		sourceUsername: string;
		label: string;
		patientMasterKey: Uint8Array;
	}) {
		const state = get(auth);
		if (!state.masterKey) throw new Error('Not logged in');
		const payload = {
			type: 'family_link',
			source_user_id: params.sourceUserId,
			source_username: params.sourceUsername,
			label: params.label,
			patient_master_key_b64: bytesToB64(params.patientMasterKey),
			linked_at: new Date().toISOString(),
		};
		const encrypted = await encryptDocument(payload, state.masterKey);
		const res = await storeDocument(encrypted);
		if (!res.ok) throw new Error('Failed to save family link');
		const documentId = (res.data as { id: number }).id;
		update(links => [...links, {
			documentId,
			sourceUserId: params.sourceUserId,
			sourceUsername: params.sourceUsername,
			label: params.label,
			patientMasterKey: params.patientMasterKey,
			linkedAt: payload.linked_at,
		}]);
	}

	async function removeLink(documentId: number) {
		await deleteDocument(documentId);
		update(links => links.filter(l => l.documentId !== documentId));
	}

	function clear() {
		set([]);
		loaded = false;
	}

	return { subscribe, load, addLink, removeLink, clear, isLoaded: () => loaded };
}

export const familyLinks = createStore();

// Active vault context: null = own data, otherwise the linked source_user_id
function createActive() {
	const key = 'ciphra_active_vault';
	const initial = browser ? Number(sessionStorage.getItem(key)) || null : null;
	const { subscribe, set } = writable<number | null>(initial);
	return {
		subscribe,
		set(v: number | null) {
			if (browser) {
				if (v) sessionStorage.setItem(key, String(v));
				else sessionStorage.removeItem(key);
			}
			set(v);
		},
	};
}

export const activeVault = createActive();

/**
 * The (masterKey, context) pair the app should currently read/write with.
 * `context: null` → own account (use /api/documents).
 * `context: { sourceUserId, … }` → linked account (use /api/family/documents).
 */
export const currentVault = derived(
	[auth, familyLinks, activeVault],
	([$auth, $links, $active]) => {
		if (!$active || !$auth.masterKey) {
			return { masterKey: $auth.masterKey, context: null as FamilyLink | null };
		}
		const link = $links.find(l => l.sourceUserId === $active) || null;
		if (!link) return { masterKey: $auth.masterKey, context: null };
		return { masterKey: link.patientMasterKey, context: link };
	}
);
