import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

interface AuthState {
	token: string | null;
	username: string | null;
	masterKey: Uint8Array | null;
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

function loadFromStorage(): AuthState {
	if (!browser) return { token: null, username: null, masterKey: null, vaultParams: null, encryptedMaster: null, isAdmin: false, ready: false };
	try {
		const raw = localStorage.getItem('ciphra_auth');
		if (!raw) return { token: null, username: null, masterKey: null, vaultParams: null, encryptedMaster: null, isAdmin: false, ready: true };
		const parsed = JSON.parse(raw);
		return {
			token: parsed.token || null,
			username: parsed.username || null,
			masterKey: parsed.masterKeyB64 ? b64ToUint8(parsed.masterKeyB64) : null,
			vaultParams: parsed.vaultParams || null,
			encryptedMaster: parsed.encryptedMaster || null,
			isAdmin: parsed.isAdmin || false,
			ready: true,
		};
	} catch {
		return { token: null, username: null, masterKey: null, vaultParams: null, encryptedMaster: null, isAdmin: false, ready: true };
	}
}

function saveToStorage(state: AuthState) {
	if (!browser) return;
	if (!state.token) {
		localStorage.removeItem('ciphra_auth');
		return;
	}
	localStorage.setItem('ciphra_auth', JSON.stringify({
		token: state.token,
		username: state.username,
		masterKeyB64: state.masterKey ? uint8ToB64(state.masterKey) : null,
		vaultParams: state.vaultParams,
		encryptedMaster: state.encryptedMaster,
		isAdmin: state.isAdmin,
	}));
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
		login(token: string, username: string, masterKey: Uint8Array, vault: { vault_params: string; encrypted_master: string }, isAdmin: boolean = false) {
			const state: AuthState = {
				token,
				username,
				masterKey,
				vaultParams: vault.vault_params,
				encryptedMaster: vault.encrypted_master,
				isAdmin,
				ready: true,
			};
			saveToStorage(state);
			set(state);
		},
		logout() {
			if (browser) localStorage.removeItem('ciphra_auth');
			set({ token: null, username: null, masterKey: null, vaultParams: null, encryptedMaster: null, isAdmin: false, ready: true });
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
