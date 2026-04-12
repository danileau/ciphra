/**
 * ciphra — Client-side E2E encryption via WebCrypto API + Argon2-WASM
 *
 * Zero-knowledge architecture (all crypto runs in the browser):
 *
 *   Registration (client-side):
 *     master_key = random 256-bit
 *     auth_salt, vault_salt = random 256-bit each
 *     auth_key   = Argon2id(password + ":AUTH",  auth_salt)      → 32 bytes
 *     vault_key  = Argon2id(password + ":VAULT", vault_salt)     → 32 bytes
 *     encrypted_master = AES-256-GCM(master_key, vault_key)
 *     server receives: auth_hash_server = SHA-256(auth_key), auth_params,
 *                      vault_params, encrypted_master, optional recovery_*
 *     Password NEVER leaves the device.
 *
 *   Login (client-side):
 *     GET auth_params from server
 *     auth_key = Argon2id(password + ":AUTH", auth_salt)
 *     POST auth_key → server checks SHA-256(auth_key) matches stored hash.
 *     Server returns vault_params + encrypted_master.
 *     vault_key = Argon2id(password + ":VAULT", vault_salt)
 *     master_key = AES-256-GCM-decrypt(encrypted_master, vault_key)
 *
 *   Recovery (client-side):
 *     Server returns recovery_params + recovery_vault.
 *     recovery_key = Argon2id(recovery_code + ":{username}:RECOVERY", recovery_salt)
 *     master_key = AES-256-GCM-decrypt(recovery_vault, recovery_key)
 *     → re-run "registration" with new password, preserving recovery_vault.
 *     Authenticates to server with recovery_key (SHA-256 check).
 *
 *   AES-256-GCM wire format (matches Python cryptography lib):
 *     nonce(12) | tag(16) | ciphertext
 *     WebCrypto internally emits ciphertext | tag(16); we reorder on encrypt/decrypt.
 */

import { generateRecoveryCode } from './wordlist';

// --- Base64 helpers ---

export function b64ToBytes(b64: string): Uint8Array {
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

export function bytesToB64(bytes: Uint8Array): string {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin);
}

// --- AES-256-GCM (WebCrypto, server-compatible wire format) ---

async function aesImportKey(rawKey: Uint8Array): Promise<CryptoKey> {
	return crypto.subtle.importKey('raw', rawKey as BufferSource, { name: 'AES-GCM' }, false, [
		'encrypt',
		'decrypt'
	]);
}

async function aesEncrypt(plaintext: Uint8Array, keyBytes: Uint8Array): Promise<Uint8Array> {
	const key = await aesImportKey(keyBytes);
	const nonce = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext as BufferSource);
	const encArr = new Uint8Array(encrypted);
	const ciphertextLen = encArr.length - 16;
	const ciphertext = encArr.slice(0, ciphertextLen);
	const tag = encArr.slice(ciphertextLen);

	const result = new Uint8Array(12 + 16 + ciphertextLen);
	result.set(nonce, 0);
	result.set(tag, 12);
	result.set(ciphertext, 28);
	return result;
}

async function aesDecrypt(data: Uint8Array, keyBytes: Uint8Array): Promise<Uint8Array> {
	if (data.length < 28) throw new Error('Invalid encrypted data');

	const key = await aesImportKey(keyBytes);
	const nonce = data.slice(0, 12);
	const tag = data.slice(12, 28);
	const ciphertext = data.slice(28);

	const combined = new Uint8Array(ciphertext.length + 16);
	combined.set(ciphertext, 0);
	combined.set(tag, ciphertext.length);

	const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, combined);
	return new Uint8Array(decrypted);
}

// --- Argon2id key derivation (WASM via bundled script) ---

export const ARGON2_PARAMS = {
	memory_cost: 65536,
	time_cost: 3,
	parallelism: 4,
	hash_len: 32,
	type: 'ID',
};

interface VaultParams {
	memory_cost: number;
	time_cost: number;
	parallelism: number;
	hash_len: number;
	type: string;
	salt: string; // base64
}

let argon2Promise: Promise<any> | null = null;

// Subresource Integrity hash for /argon2-bundled.min.js.
// If the bundled Argon2 library is updated, regenerate with:
//   openssl dgst -sha384 -binary frontend/static/argon2-bundled.min.js | base64 -w0
// Without this pin, a compromised frontend host (or an MITM on a non-HTTPS
// dev setup) could serve a tampered Argon2 that exfiltrates passwords before
// they're ever hashed — defeating zero-knowledge at its weakest point.
const ARGON2_SRI = 'sha384-XOR3aNvHciLPIf6r+2glkrmbBbLmIJ1EChMXjw8eBKBf8gE0rDq1TyUNuRdorOqi';

function loadArgon2(): Promise<any> {
	if (argon2Promise) return argon2Promise;

	argon2Promise = new Promise((resolve, reject) => {
		if (typeof window === 'undefined') {
			argon2Promise = null;
			reject(new Error('Argon2 requires browser environment'));
			return;
		}
		if ((window as any).argon2) {
			resolve((window as any).argon2);
			return;
		}
		const existing = document.querySelector('script[src="/argon2-bundled.min.js"]');
		if (existing) existing.remove();

		const script = document.createElement('script');
		script.src = '/argon2-bundled.min.js';
		script.integrity = ARGON2_SRI;
		script.crossOrigin = 'anonymous';
		script.onload = () => {
			if ((window as any).argon2) {
				resolve((window as any).argon2);
			} else {
				argon2Promise = null;
				reject(new Error('argon2 not found on window after script load'));
			}
		};
		script.onerror = () => {
			argon2Promise = null;
			reject(new Error('Failed to load argon2 script (integrity check may have failed)'));
		};
		document.head.appendChild(script);
	});

	return argon2Promise;
}

function decodeVaultParams(encoded: string): VaultParams {
	const json = atob(encoded);
	return JSON.parse(json);
}

function encodeVaultParams(salt: Uint8Array): string {
	const params = { ...ARGON2_PARAMS, salt: bytesToB64(salt) };
	return btoa(JSON.stringify(params));
}

function generateSalt(): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(32));
}

async function deriveArgon2Key(
	password: string,
	salt: Uint8Array,
	context: string,
	params: VaultParams = ARGON2_PARAMS as VaultParams
): Promise<Uint8Array> {
	const argon2 = await loadArgon2();
	const result = await argon2.hash({
		pass: password + context,
		salt: salt,
		time: params.time_cost,
		mem: params.memory_cost,
		parallelism: params.parallelism,
		hashLen: params.hash_len || 32,
		type: argon2.ArgonType.Argon2id,
	});
	return result.hash;
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
	const hash = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
	return new Uint8Array(hash);
}

// --- Public API: registration / login / recovery ---

export interface RegistrationBundle {
	username: string;
	auth_hash: string;            // b64 SHA-256(auth_key) — what server stores
	auth_params: string;
	vault_params: string;
	encrypted_master: string;
	recovery_vault: string | null;
	recovery_params: string | null;
	recovery_auth: string | null; // b64 SHA-256(recovery_key) — authorizes recovery
	recovery_code: string | null; // plaintext, shown to user once, never sent
}

/**
 * Build a full registration bundle from a password. Runs three Argon2id rounds
 * (auth, vault, recovery) — expect ~3–6 seconds on mobile.
 * The returned `recovery_code` is shown to the user once and NEVER sent to server.
 */
export async function createVault(
	username: string,
	password: string,
	enableRecovery = true
): Promise<RegistrationBundle> {
	const masterKey = crypto.getRandomValues(new Uint8Array(32));

	const authSalt = generateSalt();
	const vaultSalt = generateSalt();

	const authKey = await deriveArgon2Key(password, authSalt, ':AUTH');
	const vaultKey = await deriveArgon2Key(password, vaultSalt, ':VAULT');

	const authHashServer = bytesToB64(await sha256(authKey));
	const encryptedMaster = bytesToB64(await aesEncrypt(masterKey, vaultKey));

	let recoveryVault: string | null = null;
	let recoveryParams: string | null = null;
	let recoveryAuth: string | null = null;
	let recoveryCode: string | null = null;

	if (enableRecovery) {
		recoveryCode = generateRecoveryCode();
		const recoverySalt = generateSalt();
		const recoveryKey = await deriveArgon2Key(
			recoveryCode, recoverySalt, `:${username}:RECOVERY`
		);
		recoveryVault = bytesToB64(await aesEncrypt(masterKey, recoveryKey));
		recoveryParams = encodeVaultParams(recoverySalt);
		recoveryAuth = bytesToB64(await sha256(recoveryKey));
	}

	return {
		username,
		auth_hash: authHashServer,
		auth_params: encodeVaultParams(authSalt),
		vault_params: encodeVaultParams(vaultSalt),
		encrypted_master: encryptedMaster,
		recovery_vault: recoveryVault,
		recovery_params: recoveryParams,
		recovery_auth: recoveryAuth,
		recovery_code: recoveryCode,
	};
}

/**
 * Derive the auth_key that gets sent to the server for login.
 * Server will SHA-256 it and compare against its stored hash.
 */
export async function deriveAuthKey(
	password: string,
	authParamsB64: string
): Promise<string> {
	const params = decodeVaultParams(authParamsB64);
	const salt = b64ToBytes(params.salt);
	const authKey = await deriveArgon2Key(password, salt, ':AUTH', params);
	return bytesToB64(authKey);
}

/**
 * Decrypt the master key from the server's encrypted_master blob.
 */
export async function decryptMasterKey(
	password: string,
	vaultParamsB64: string,
	encryptedMasterB64: string
): Promise<Uint8Array> {
	const params = decodeVaultParams(vaultParamsB64);
	const salt = b64ToBytes(params.salt);
	const vaultKey = await deriveArgon2Key(password, salt, ':VAULT', params);
	const encryptedMaster = b64ToBytes(encryptedMasterB64);
	return aesDecrypt(encryptedMaster, vaultKey);
}

/**
 * Decrypt the master key via recovery code. Also returns the raw recovery_key
 * (base64) which the caller sends to the server as authorization for the recovery.
 */
export async function decryptMasterKeyWithRecovery(
	username: string,
	recoveryCode: string,
	recoveryParamsB64: string,
	recoveryVaultB64: string
): Promise<{ masterKey: Uint8Array; recoveryKeyB64: string }> {
	const params = decodeVaultParams(recoveryParamsB64);
	const salt = b64ToBytes(params.salt);
	const recoveryKey = await deriveArgon2Key(
		recoveryCode.trim(), salt, `:${username}:RECOVERY`, params
	);
	const recoveryVault = b64ToBytes(recoveryVaultB64);
	const masterKey = await aesDecrypt(recoveryVault, recoveryKey);
	return { masterKey, recoveryKeyB64: bytesToB64(recoveryKey) };
}

/**
 * Re-encrypt an existing master_key under a new password. Used by
 * change-password and account recovery. Returns a new bundle (no new recovery
 * material — recovery_code / recovery_vault stay unchanged, set by caller).
 */
export async function rewrapMasterKey(
	masterKey: Uint8Array,
	newPassword: string
): Promise<{
	auth_hash: string;
	auth_params: string;
	vault_params: string;
	encrypted_master: string;
}> {
	const authSalt = generateSalt();
	const vaultSalt = generateSalt();
	const authKey = await deriveArgon2Key(newPassword, authSalt, ':AUTH');
	const vaultKey = await deriveArgon2Key(newPassword, vaultSalt, ':VAULT');
	const encryptedMaster = bytesToB64(await aesEncrypt(masterKey, vaultKey));
	return {
		auth_hash: bytesToB64(await sha256(authKey)),
		auth_params: encodeVaultParams(authSalt),
		vault_params: encodeVaultParams(vaultSalt),
		encrypted_master: encryptedMaster,
	};
}

// --- Public API: family sharing (Approach C) ---

export interface FamilyGrantBundle {
	grant_params: string;
	grant_auth: string;      // SHA-256(family_key)
	wrapped_master: string;  // AES-GCM(master_key, family_key)
	family_code: string;     // shown once, never sent to server
}

/**
 * Patient-side: wrap master_key with a freshly derived family_key.
 * The returned family_code is displayed to the patient and must reach
 * the caregiver out-of-band (link with URL fragment, QR, spoken aloud).
 */
export async function createFamilyGrant(masterKey: Uint8Array): Promise<FamilyGrantBundle> {
	const { generateFamilyCode } = await import('./wordlist');
	const familyCode = generateFamilyCode();
	const grantSalt = generateSalt();
	const familyKey = await deriveArgon2Key(familyCode, grantSalt, ':FAMILY');
	const wrappedMaster = bytesToB64(await aesEncrypt(masterKey, familyKey));
	const grantAuth = bytesToB64(await sha256(familyKey));
	return {
		grant_params: encodeVaultParams(grantSalt),
		grant_auth: grantAuth,
		wrapped_master: wrappedMaster,
		family_code: familyCode,
	};
}

/**
 * Caregiver-side: given a family code and a grant candidate, derive the
 * family_key and return both the unwrapped master_key and the raw key
 * (needed for the server-side claim proof).
 */
export async function unwrapFamilyGrant(
	familyCode: string,
	grantParamsB64: string,
	wrappedMasterB64: string
): Promise<{ masterKey: Uint8Array; familyKeyB64: string }> {
	const params = decodeVaultParams(grantParamsB64);
	const salt = b64ToBytes(params.salt);
	const familyKey = await deriveArgon2Key(familyCode.trim(), salt, ':FAMILY', params);
	const masterKey = await aesDecrypt(b64ToBytes(wrappedMasterB64), familyKey);
	return { masterKey, familyKeyB64: bytesToB64(familyKey) };
}

/**
 * Caregiver-side: given a list of candidate grants for a patient, find the
 * one whose grant_auth matches the derived family_key. Useful when the
 * patient has multiple active grants.
 */
export async function matchFamilyGrant(
	familyCode: string,
	candidates: Array<{ id: number; grant_params: string; wrapped_master: string; grant_auth: string }>
): Promise<{ grantId: number; masterKey: Uint8Array; familyKeyB64: string } | null> {
	for (const c of candidates) {
		try {
			const { masterKey, familyKeyB64 } = await unwrapFamilyGrant(
				familyCode, c.grant_params, c.wrapped_master
			);
			const derivedAuth = bytesToB64(await sha256(b64ToBytes(familyKeyB64)));
			if (derivedAuth === c.grant_auth) {
				return { grantId: c.id, masterKey, familyKeyB64 };
			}
		} catch {
			// wrong salt pair or tampered wrapped_master — try next
		}
	}
	return null;
}

// --- Public API: data encryption/decryption ---

export async function encryptData(plaintext: string, masterKeyBytes: Uint8Array): Promise<string> {
	const encoded = new TextEncoder().encode(plaintext);
	const encrypted = await aesEncrypt(encoded, masterKeyBytes);
	return bytesToB64(encrypted);
}

export async function decryptData(encrypted: string, masterKeyBytes: Uint8Array): Promise<string> {
	const data = b64ToBytes(encrypted);
	const decrypted = await aesDecrypt(data, masterKeyBytes);
	return new TextDecoder().decode(decrypted);
}

export async function encryptDocument(data: any, masterKey: Uint8Array): Promise<string> {
	return encryptData(JSON.stringify(data), masterKey);
}

export async function decryptDocument(encrypted: string, masterKey: Uint8Array): Promise<any> {
	const json = await decryptData(encrypted, masterKey);
	return JSON.parse(json);
}
