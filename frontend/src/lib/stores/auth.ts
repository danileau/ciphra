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
	// 'web' = registered directly on ciphra.ch, 'migrate' = came in via the
	// /migrate flow from epilepc. Drives the dashboard WelcomeCard variant.
	// Set from the login response; defaults to 'web' for legacy sessions
	// that pre-date this field.
	registrationSource: 'web' | 'migrate';
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
	isAdmin: false, registrationSource: 'web', ready,
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
			registrationSource: parsed.registrationSource === 'migrate' ? 'migrate' : 'web',
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
		registrationSource: state.registrationSource,
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
		login(token: string, username: string, masterKey: Uint8Array, vault: { auth_params: string; vault_params: string; encrypted_master: string }, isAdmin: boolean = false, registrationSource: 'web' | 'migrate' = 'web') {
			const state: AuthState = {
				token,
				username,
				masterKey,
				authParams: vault.auth_params,
				vaultParams: vault.vault_params,
				encryptedMaster: vault.encrypted_master,
				isAdmin,
				registrationSource,
				ready: true,
			};
			saveToStorage(state);
			// 2026-06-07 — clear ciphra_setup_skipped on every fresh login.
			// The flag is intended to bridge the in-session gap between the
			// user clicking "I'm here for someone else" on the wizard and
			// the family-links store catching up. Across sessions / across
			// users on the same browser it should NOT persist — a stale flag
			// from a previous test or a previous account silently breaks
			// the auto-redirect-to-/setup that fresh registrants need to
			// reach the wizard at all.
			if (browser) {
				try { localStorage.removeItem('ciphra_setup_skipped'); } catch {}
			}
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
			// Cleared on logout for the same reason it's cleared on login:
			// the next user on this browser must not inherit a previous
			// session's "skip the setup wizard" decision.
			try { localStorage.removeItem('ciphra_setup_skipped'); } catch {}
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
		},
		// CIPH-pi20-LB-2 — wipe locally-cached plaintext without ending
		// the session. Mirrors logout()'s on-disk wipe (IndexedDB +
		// SW navigation cache) but leaves localStorage/sessionStorage and
		// the in-memory state intact so the user stays logged in. Returns
		// when both wipes complete (or fail loudly via console.error).
		// SECURITY.md "What the browser stores" section points users at
		// this — keep that doc in sync with the wipe contract here.
		async clearLocalCache() {
			if (!browser) return;
			try {
				const m = await import('$lib/idb');
				await m.clearAllPartitions();
			} catch (e) {
				console.error('clearLocalCache: IndexedDB wipe failed', e);
			}
			if (typeof caches !== 'undefined') {
				try {
					const keys = await caches.keys();
					await Promise.all(keys.filter((k) => k.startsWith('ciphra-')).map((k) => caches.delete(k)));
				} catch (e) {
					console.error('clearLocalCache: SW cache purge failed', e);
				}
			}
		}
	};
}

export const auth = createAuthStore();
export const isAuthenticated = derived(auth, ($a) => $a.ready && !!$a.token);
export const authReady = derived(auth, ($a) => $a.ready);
// True when we have a token but the session-scoped master_key is gone
// (e.g. browser closed and reopened). The app should prompt for password.
export const needsUnlock = derived(auth, ($a) => $a.ready && !!$a.token && !$a.masterKey);
