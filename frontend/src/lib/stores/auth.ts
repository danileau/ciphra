import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

interface AuthState {
	token: string | null;
	username: string | null;
	masterKey: Uint8Array | null;
	authParams: string | null;
	vaultParams: string | null;
	encryptedMaster: string | null;
	isAdmin: boolean;
	ready: boolean;
}

function uint8ToB64(arr: Uint8Array): string {
	let bin = '';
	for (const b of arr) bin += String.fromCharCode(b);
	return btoa(bin);
}

function b64ToUint8(b64: string): Uint8Array {
	const bin = atob(b64);
	const arr = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
	return arr;
}

const emptyState = (ready: boolean): AuthState => ({
	token: null, username: null, masterKey: null,
	authParams: null, vaultParams: null, encryptedMaster: null,
	isAdmin: false, ready,
});

// Master key lives in sessionStorage (cleared on browser/tab close), not
// localStorage. Everything else — JWT, params, encrypted blobs — is safe to
// persist. If the tab reloads mid-session the key survives; if the user
// closes the browser they're asked to log in again. This shrinks the XSS
// blast radius from "forever" to "this browser session".
const LS_KEY = 'ciphra_auth';
const SS_MASTER_KEY = 'ciphra_master_key';

function loadFromStorage(): AuthState {
	if (!browser) return emptyState(false);
	try {
		const raw = localStorage.getItem(LS_KEY);
		if (!raw) return emptyState(true);
		const parsed = JSON.parse(raw);
		const masterB64 = sessionStorage.getItem(SS_MASTER_KEY);
		return {
			token: parsed.token || null,
			username: parsed.username || null,
			masterKey: masterB64 ? b64ToUint8(masterB64) : null,
			authParams: parsed.authParams || null,
			vaultParams: parsed.vaultParams || null,
			encryptedMaster: parsed.encryptedMaster || null,
			isAdmin: parsed.isAdmin || false,
			ready: true,
		};
	} catch {
		return emptyState(true);
	}
}

function saveToStorage(state: AuthState) {
	if (!browser) return;
	if (!state.token) {
		localStorage.removeItem(LS_KEY);
		sessionStorage.removeItem(SS_MASTER_KEY);
		return;
	}
	localStorage.setItem(LS_KEY, JSON.stringify({
		token: state.token,
		username: state.username,
		authParams: state.authParams,
		vaultParams: state.vaultParams,
		encryptedMaster: state.encryptedMaster,
		isAdmin: state.isAdmin,
	}));
	if (state.masterKey) {
		sessionStorage.setItem(SS_MASTER_KEY, uint8ToB64(state.masterKey));
	} else {
		sessionStorage.removeItem(SS_MASTER_KEY);
	}
}

function createAuthStore() {
	const initial = loadFromStorage();
	const { subscribe, set, update } = writable<AuthState>(initial);

	// Hydrate on client side if SSR started with ready=false
	if (browser && !initial.ready) {
		const hydrated = loadFromStorage();
		hydrated.ready = true;
		set(hydrated);
	}

	return {
		subscribe,
		login(token: string, username: string, masterKey: Uint8Array, vault: { auth_params: string; vault_params: string; encrypted_master: string }, isAdmin: boolean = false) {
			const state: AuthState = {
				token,
				username,
				masterKey,
				authParams: vault.auth_params,
				vaultParams: vault.vault_params,
				encryptedMaster: vault.encrypted_master,
				isAdmin,
				ready: true,
			};
			saveToStorage(state);
			set(state);
		},
		updateVault(vault: { auth_params: string; vault_params: string; encrypted_master: string }) {
			update((s) => {
				const next = { ...s, authParams: vault.auth_params, vaultParams: vault.vault_params, encryptedMaster: vault.encrypted_master };
				saveToStorage(next);
				return next;
			});
		},
		// PI v16 LB-26+27 — logout is now async. The IndexedDB wipe and the
		// service-worker navigation cache delete BOTH have to complete before
		// we can claim the user is logged out. Previously fire-and-forget
		// with a swallowed catch, which left plaintext at rest if the wipe
		// raced or threw. Set the in-memory state empty first so the UI
		// flips immediately; then await the on-disk wipes so a fast
		// hand-off-of-device doesn't leak.
		async logout() {
			set(emptyState(true));
			if (!browser) return;
			localStorage.removeItem(LS_KEY);
			sessionStorage.removeItem(SS_MASTER_KEY);
			try {
				const m = await import('$lib/idb');
				await m.clearAllPartitions();
			} catch (e) {
				console.error('logout: IndexedDB wipe failed', e);
			}
			// SW navigation cache survives logout otherwise (PI v14 critique
			// IMP-1). SvelteKit ships render-only HTML shells today so this
			// is bounded, but a future loader-injected snippet would land
			// plaintext at rest. Cheap insurance.
			if (typeof caches !== 'undefined') {
				try {
					const keys = await caches.keys();
					await Promise.all(keys.filter((k) => k.startsWith('ciphra-')).map((k) => caches.delete(k)));
				} catch (e) {
					console.error('logout: SW cache purge failed', e);
				}
			}
		},
		setMasterKey(key: Uint8Array) {
			update((s) => {
				const next = { ...s, masterKey: key };
				saveToStorage(next);
				return next;
			});
		}
	};
}

export const auth = createAuthStore();
export const isAuthenticated = derived(auth, ($a) => $a.ready && !!$a.token);
export const authReady = derived(auth, ($a) => $a.ready);
// True when we have a token but the session-scoped master_key is gone
// (e.g. browser closed and reopened). The app should prompt for password.
export const needsUnlock = derived(auth, ($a) => $a.ready && !!$a.token && !$a.masterKey);
