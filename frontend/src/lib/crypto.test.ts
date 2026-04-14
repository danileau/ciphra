/**
 * ciphra — Client-side crypto tests.
 *
 * Uses WebCrypto (available in Node 18+ via globalThis.crypto).
 * Tests base64 helpers and AES-256-GCM encrypt/decrypt roundtrips
 * including the server-compatible wire format.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
// @ts-ignore -- node:crypto available at test time
import { webcrypto } from 'node:crypto';

// jsdom does not expose crypto.subtle — polyfill from Node's webcrypto
if (!globalThis.crypto?.subtle) {
    // @ts-ignore Node webcrypto is compatible enough for our use
    globalThis.crypto = webcrypto;
}
import { b64ToBytes, bytesToB64, encryptDocument, decryptDocument, encryptData, decryptData } from './crypto';

// ---------------------------------------------------------------------------
// Base64 helpers
// ---------------------------------------------------------------------------

describe('b64ToBytes / bytesToB64', () => {
    it('roundtrips a known ASCII string', () => {
        const original = new TextEncoder().encode('hello ciphra');
        const b64 = bytesToB64(original);
        const decoded = b64ToBytes(b64);
        expect(decoded).toEqual(original);
    });

    it('roundtrips binary data with all byte values', () => {
        const bytes = new Uint8Array(256);
        for (let i = 0; i < 256; i++) bytes[i] = i;
        const roundtripped = b64ToBytes(bytesToB64(bytes));
        expect(roundtripped).toEqual(bytes);
    });

    it('handles empty input', () => {
        const empty = new Uint8Array(0);
        expect(b64ToBytes(bytesToB64(empty))).toEqual(empty);
    });

    it('matches known base64 value', () => {
        // "SGVsbG8=" is base64 for "Hello"
        const bytes = b64ToBytes('SGVsbG8=');
        expect(new TextDecoder().decode(bytes)).toBe('Hello');
    });
});

// ---------------------------------------------------------------------------
// AES-256-GCM encrypt/decrypt (via encryptData/decryptData)
// ---------------------------------------------------------------------------

describe('encryptData / decryptData', () => {
    // Generate a random 256-bit key for testing
    const masterKey = new Uint8Array(32);
    crypto.getRandomValues(masterKey);

    it('roundtrips a plaintext string', async () => {
        const plaintext = 'sensitive health data';
        const encrypted = await encryptData(plaintext, masterKey);
        const decrypted = await decryptData(encrypted, masterKey);
        expect(decrypted).toBe(plaintext);
    });

    it('roundtrips unicode text', async () => {
        const plaintext = 'Epilepsie-Protokoll: Anfälle, Übelkeit, 日本語';
        const encrypted = await encryptData(plaintext, masterKey);
        const decrypted = await decryptData(encrypted, masterKey);
        expect(decrypted).toBe(plaintext);
    });

    it('roundtrips empty string', async () => {
        const encrypted = await encryptData('', masterKey);
        const decrypted = await decryptData(encrypted, masterKey);
        expect(decrypted).toBe('');
    });

    it('produces different ciphertext each time (random nonce)', async () => {
        const plaintext = 'same input';
        const enc1 = await encryptData(plaintext, masterKey);
        const enc2 = await encryptData(plaintext, masterKey);
        expect(enc1).not.toBe(enc2);
    });

    it('fails to decrypt with wrong key', async () => {
        const wrongKey = new Uint8Array(32);
        crypto.getRandomValues(wrongKey);
        const encrypted = await encryptData('secret', masterKey);
        await expect(decryptData(encrypted, wrongKey)).rejects.toThrow();
    });
});

// ---------------------------------------------------------------------------
// Wire format: nonce(12) | tag(16) | ciphertext
// ---------------------------------------------------------------------------

describe('wire format', () => {
    const masterKey = new Uint8Array(32);
    crypto.getRandomValues(masterKey);

    it('encrypted blob starts with 12-byte nonce then 16-byte tag then ciphertext', async () => {
        const plaintext = 'test wire format';
        const encryptedB64 = await encryptData(plaintext, masterKey);
        const bytes = b64ToBytes(encryptedB64);

        // Minimum size: 12 (nonce) + 16 (tag) + plaintext bytes
        expect(bytes.length).toBeGreaterThanOrEqual(28);

        // The first 12 bytes are the nonce (random, non-zero is very likely for 12 bytes)
        const nonce = bytes.slice(0, 12);
        expect(nonce.length).toBe(12);

        // Bytes 12..28 are the GCM tag
        const tag = bytes.slice(12, 28);
        expect(tag.length).toBe(16);

        // Remaining bytes are ciphertext — at least as long as plaintext
        const ciphertext = bytes.slice(28);
        expect(ciphertext.length).toBe(new TextEncoder().encode(plaintext).length);
    });
});

// ---------------------------------------------------------------------------
// Document-level encrypt/decrypt (JSON roundtrip)
// ---------------------------------------------------------------------------

describe('encryptDocument / decryptDocument', () => {
    const masterKey = new Uint8Array(32);
    crypto.getRandomValues(masterKey);

    it('roundtrips a JSON object', async () => {
        const doc = {
            type: 'entry',
            date: '2026-04-04',
            symptoms: ['tired', 'headache'],
            episodes: [{ type: 'focal', count: 1 }],
            notes: 'Leichter Tag',
        };
        const encrypted = await encryptDocument(doc, masterKey);
        const decrypted = await decryptDocument(encrypted, masterKey);
        expect(decrypted).toEqual(doc);
    });

    it('roundtrips nested objects and arrays', async () => {
        const doc = { a: { b: { c: [1, 2, 3] } }, d: null, e: true };
        const encrypted = await encryptDocument(doc, masterKey);
        const decrypted = await decryptDocument(encrypted, masterKey);
        expect(decrypted).toEqual(doc);
    });
});
