/**
 * ciphra — Client-side E2E encryption via WebCrypto API + Argon2-WASM
 *
 * Key hierarchy (matches epi-2 server-side implementation):
 *
 *   Registration (server-side):
 *     master_key = random 256-bit
 *     auth_hash  = Argon2id(password)                         → stored for login verification
 *     vault_key  = Argon2id(password + ":VAULT", vault_salt)  → encrypts master_key
 *     encrypted_master = AES-256-GCM(master_key, vault_key)   → stored on server
 *
 *   Login (client-side):
 *     server returns vault_params (Argon2 params + salt) + encrypted_master
 *     vault_key  = Argon2id(password + ":VAULT", vault_salt)  → derived client-side via WASM
 *     master_key = AES-256-GCM-decrypt(encrypted_master, vault_key)
 *     → master_key used for all data encryption/decryption
 *
 *   AES-256-GCM wire format (server compat):
 *     Python cryptography: nonce(12) | tag(16) | ciphertext
 *     WebCrypto returns:   ciphertext | tag(16)
 *     We reorder on encrypt/decrypt to stay compatible.
 */

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
	return crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, [
		'encrypt',
		'decrypt'
	]);
}

/**
 * Encrypt with AES-256-GCM.
 * Output format: nonce(12) | tag(16) | ciphertext  (matches Python server)
 */
async function aesEncrypt(plaintext: Uint8Array, keyBytes: Uint8Array): Promise<Uint8Array> {
	const key = await aesImportKey(keyBytes);
	const nonce = crypto.getRandomValues(new Uint8Array(12));

	// WebCrypto returns ciphertext+tag(16) concatenated
	const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext);
	const encArr = new Uint8Array(encrypted);

	// WebCrypto: ciphertext | tag(16)
	// Server format: nonce(12) | tag(16) | ciphertext
	const ciphertextLen = encArr.length - 16;
	const ciphertext = encArr.slice(0, ciphertextLen);
	const tag = encArr.slice(ciphertextLen);

	const result = new Uint8Array(12 + 16 + ciphertextLen);
	result.set(nonce, 0);
	result.set(tag, 12);
	result.set(ciphertext, 28);
	return result;
}

/**
 * Decrypt AES-256-GCM.
 * Input format: nonce(12) | tag(16) | ciphertext  (matches Python server)
 */
async function aesDecrypt(data: Uint8Array, keyBytes: Uint8Array): Promise<Uint8Array> {
	if (data.length < 28) throw new Error('Invalid encrypted data');

	const key = await aesImportKey(keyBytes);
	const nonce = data.slice(0, 12);
	const tag = data.slice(12, 28);
	const ciphertext = data.slice(28);

	// WebCrypto expects: ciphertext | tag(16)
	const combined = new Uint8Array(ciphertext.length + 16);
	combined.set(ciphertext, 0);
	combined.set(tag, ciphertext.length);

	const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, combined);
	return new Uint8Array(decrypted);
}

// --- Argon2id key derivation (WASM via bundled script) ---

interface VaultParams {
	memory_cost: number;
	time_cost: number;
	parallelism: number;
	hash_len: number;
	type: string;
	salt: string; // base64
}

/**
 * Load argon2 from the bundled script (avoids Vite/SSR WASM issues).
 * The script is in /static/argon2-bundled.min.js and sets window.argon2.
 */
let argon2Promise: Promise<any> | null = null;

function loadArgon2(): Promise<any> {
	if (argon2Promise) return argon2Promise;

	argon2Promise = new Promise((resolve, reject) => {
		if (typeof window === 'undefined') {
			reject(new Error('Argon2 requires browser environment'));
			return;
		}

		// Already loaded?
		if ((window as any).argon2) {
			resolve((window as any).argon2);
			return;
		}

		const script = document.createElement('script');
		script.src = '/argon2-bundled.min.js';
		script.onload = () => {
			if ((window as any).argon2) {
				resolve((window as any).argon2);
			} else {
				reject(new Error('argon2 not found on window after script load'));
			}
		};
		script.onerror = () => reject(new Error('Failed to load argon2 script'));
		document.head.appendChild(script);
	});

	return argon2Promise;
}

/**
 * Decode vault_params from base64-encoded JSON (same format as server).
 */
function decodeVaultParams(encoded: string): VaultParams {
	const json = atob(encoded);
	return JSON.parse(json);
}

/**
 * Derive vault key using Argon2id (WASM).
 * Matches server: Argon2id(password + context, salt, params) → 32 bytes
 */
async function deriveArgon2Key(
	password: string,
	salt: Uint8Array,
	context: string,
	params: VaultParams
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

// --- Public API: vault operations ---

/**
 * Decrypt the master key from the server's encrypted_master blob.
 * This is the epi-2 login flow:
 *   1. Parse vault_params to get Argon2 salt + params
 *   2. Derive vault_key = Argon2id(password + ":VAULT", salt)
 *   3. Decrypt encrypted_master with vault_key → master_key
 */
export async function decryptMasterKey(
	password: string,
	vaultParamsB64: string,
	encryptedMasterB64: string
): Promise<Uint8Array> {
	const params = decodeVaultParams(vaultParamsB64);
	const salt = b64ToBytes(params.salt);

	// Derive vault key (same as server's Argon2KeyDerivation.derive_key)
	const vaultKey = await deriveArgon2Key(password, salt, ':VAULT', params);

	// Decrypt master key
	const encryptedMaster = b64ToBytes(encryptedMasterB64);
	return aesDecrypt(encryptedMaster, vaultKey);
}

// --- Public API: data encryption/decryption ---

/**
 * Encrypt data with the master key.
 * Returns base64 of nonce(12) | tag(16) | ciphertext
 */
export async function encryptData(plaintext: string, masterKeyBytes: Uint8Array): Promise<string> {
	const encoded = new TextEncoder().encode(plaintext);
	const encrypted = await aesEncrypt(encoded, masterKeyBytes);
	return bytesToB64(encrypted);
}

/**
 * Decrypt data with the master key.
 * Expects base64 of nonce(12) | tag(16) | ciphertext
 */
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
