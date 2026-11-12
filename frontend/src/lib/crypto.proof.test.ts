/**
 * Proof, not key (2026-11-12).
 *
 * recovery_key and family_key each unwrap a copy of the master key that the
 * server stores (recovery_vault, wrapped_master). Until 2026-11-12 the browser
 * sent those raw keys as the "proof" for /recover and /family/grants/claim, so
 * whoever saw the request could unwrap the master key. Now it sends
 * proof = SHA-256(key); the server keeps verifier = SHA-256(proof).
 *
 * Argon2 is replaced by a deterministic stand-in (SHA-256 of pass + salt):
 * the property under test is what leaves the browser, not the KDF.
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
// @ts-ignore -- node:crypto available at test time
import { webcrypto, createHash } from 'node:crypto';

if (!globalThis.crypto?.subtle) {
	// @ts-ignore Node webcrypto is compatible enough for our use
	globalThis.crypto = webcrypto;
}

// Every key the fake KDF hands out, so the tests can check none of them leaks.
const derivedKeys: string[] = [];

beforeAll(() => {
	(globalThis as any).window = globalThis;
	(globalThis as any).argon2 = {
		ArgonType: { Argon2id: 2 },
		hash: vi.fn(async ({ pass, salt }: { pass: string; salt: Uint8Array }) => {
			const h = createHash('sha256').update(pass).update(Buffer.from(salt)).digest();
			const key = new Uint8Array(h);
			derivedKeys.push(Buffer.from(key).toString('base64'));
			return { hash: key };
		}),
	};
});

import {
	createVault,
	decryptMasterKeyWithRecovery,
	createFamilyGrant,
	unwrapFamilyGrant,
	matchFamilyGrant,
	bytesToB64,
} from './crypto';

const sha256b64 = (b64: string) =>
	createHash('sha256').update(Buffer.from(b64, 'base64')).digest('base64');

describe('recovery: the server gets a proof, never recovery_key', () => {
	it('registration sends a verifier = SHA-256(proof), and no recovery_auth', async () => {
		const bundle = await createVault('alice', 'correct horse battery', true);
		expect(bundle).not.toHaveProperty('recovery_auth');
		expect(bundle.recovery_verifier).toMatch(/^[A-Za-z0-9+/]{43}=$/);

		const { masterKey, recoveryProofB64 } = await decryptMasterKeyWithRecovery(
			'alice', bundle.recovery_code!, bundle.recovery_params!, bundle.recovery_vault!,
		);
		expect(masterKey).toHaveLength(32);
		// The server's check: SHA-256(proof) === stored verifier.
		expect(sha256b64(recoveryProofB64)).toBe(bundle.recovery_verifier);

		// And the proof is not the key that unwraps recovery_vault.
		const recoveryKey = derivedKeys.find((k) => sha256b64(k) === recoveryProofB64);
		expect(recoveryKey, 'proof must be SHA-256 of a derived key').toBeTruthy();
		expect(recoveryProofB64).not.toBe(recoveryKey);
	});

	it('the result object carries no raw key under any name', async () => {
		const bundle = await createVault('bob', 'another password', true);
		const res = await decryptMasterKeyWithRecovery(
			'bob', bundle.recovery_code!, bundle.recovery_params!, bundle.recovery_vault!,
		);
		expect(Object.keys(res).sort()).toEqual(['masterKey', 'recoveryProofB64']);
		for (const k of derivedKeys) expect(res.recoveryProofB64).not.toBe(k);
	});
});

describe('family grant: the claim sends a proof, never family_key', () => {
	it('creation sends grant_verifier, claim proof matches it, key never returned', async () => {
		const master = crypto.getRandomValues(new Uint8Array(32));
		const bundle = await createFamilyGrant(master);
		expect(bundle).not.toHaveProperty('grant_auth');

		const { masterKey, grantProofB64 } = await unwrapFamilyGrant(
			bundle.family_code, bundle.grant_params, bundle.wrapped_master,
		);
		expect(bytesToB64(masterKey)).toBe(bytesToB64(master));
		expect(sha256b64(grantProofB64)).toBe(bundle.grant_verifier);
		for (const k of derivedKeys) expect(grantProofB64).not.toBe(k);
	});

	it('matchFamilyGrant picks the grant by its verifier and returns only the proof', async () => {
		const master = crypto.getRandomValues(new Uint8Array(32));
		const other = await createFamilyGrant(crypto.getRandomValues(new Uint8Array(32)));
		const mine = await createFamilyGrant(master);
		const match = await matchFamilyGrant(mine.family_code, [
			{ id: 1, grant_params: other.grant_params, wrapped_master: other.wrapped_master, grant_verifier: other.grant_verifier },
			{ id: 2, grant_params: mine.grant_params, wrapped_master: mine.wrapped_master, grant_verifier: mine.grant_verifier },
		]);
		expect(match?.grantId).toBe(2);
		expect(Object.keys(match!).sort()).toEqual(['grantId', 'grantProofB64', 'masterKey']);
		expect(sha256b64(match!.grantProofB64)).toBe(mine.grant_verifier);
	});
});

describe('the request layer has no field for a raw key', () => {
	// @ts-ignore -- node:fs at test time
	const { readFileSync } = require('node:fs') as typeof import('node:fs');
	const api = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
	it('recover() sends recovery_proof, not recovery_key', () => {
		expect(api).toMatch(/recovery_proof: string/);
		expect(api).not.toMatch(/recovery_key/);
	});
	it('familyGrantClaim() sends grant_proof, not proof', () => {
		expect(api).toMatch(/grant_proof: grantProofB64/);
		expect(api).not.toMatch(/[{ ]proof:/);
	});
});
