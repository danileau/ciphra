/**
 * CIPH-pi20-LB-8 — SECURITY.md doc-vs-code drift test.
 *
 * The PI v20 operating rule: SECURITY.md cannot make a claim the code
 * doesn't enforce. This test pins each load-bearing claim against
 * current source so silent drift fails CI.
 *
 * If a claim here breaks because the doc is wrong, fix the doc.
 * If it breaks because the CODE changed, the doc must be updated to
 * match — `SECURITY.md` is a contract with users, not a sketch.
 *
 * Sister test: `src/lib/stores/auth.clear-cache.test.ts` covers the
 * LB-2 wipe contract specifically. This file covers the broader
 * surface (Argon2 params, JWT requirements, storage claims, etc.).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// __dirname = frontend/src/lib at runtime.
const REPO_ROOT = join(__dirname, '..', '..', '..');
const SECURITY = readFileSync(join(REPO_ROOT, 'SECURITY.md'), 'utf8');
const CRYPTO = readFileSync(join(__dirname, 'crypto.ts'), 'utf8');
const AUTH = readFileSync(join(__dirname, 'stores', 'auth.ts'), 'utf8');
const IDB = readFileSync(join(__dirname, 'idb.ts'), 'utf8');
const SERVER = readFileSync(join(REPO_ROOT, 'api', 'server.py'), 'utf8');

describe('CIPH-pi20-LB-8 Argon2id parameters', () => {
	it('SECURITY.md states memory_cost=64 MiB', () => {
		expect(SECURITY).toMatch(/memory_cost\s*=\s*64\s*MiB/);
	});

	it('crypto.ts implements memory_cost=65536 (= 64 MiB in KiB units)', () => {
		expect(CRYPTO).toMatch(/memory_cost:\s*65536/);
	});

	it('SECURITY.md states time_cost=3 / parallelism=4 / hash_len=32', () => {
		expect(SECURITY).toMatch(/time_cost\s*=\s*3/);
		expect(SECURITY).toMatch(/parallelism\s*=\s*4/);
		expect(SECURITY).toMatch(/hash_len\s*=\s*32\s*bytes/);
	});

	it('crypto.ts implements all three params', () => {
		expect(CRYPTO).toMatch(/time_cost:\s*3\b/);
		expect(CRYPTO).toMatch(/parallelism:\s*4\b/);
		expect(CRYPTO).toMatch(/hash_len:\s*32\b/);
	});

	it('server.py mirrors the same params for fake-user enumeration defense', () => {
		expect(SERVER).toMatch(/memory_cost.*65536/s);
		expect(SERVER).toMatch(/time_cost.*3/s);
		expect(SERVER).toMatch(/parallelism.*4/s);
	});
});

describe('CIPH-pi20-LB-8 AES-GCM contract', () => {
	it('SECURITY.md states AES-256-GCM with 12-byte nonce', () => {
		expect(SECURITY).toMatch(/AES-256-GCM/);
		expect(SECURITY).toMatch(/12-byte\s+(random\s+)?nonce/);
	});

	it('crypto.ts uses crypto.getRandomValues(new Uint8Array(12)) for the nonce', () => {
		expect(CRYPTO).toMatch(/crypto\.getRandomValues\(new Uint8Array\(12\)\)/);
	});

	it('master key is 32 random bytes from crypto.getRandomValues', () => {
		expect(CRYPTO).toMatch(/crypto\.getRandomValues\(new Uint8Array\(32\)\)/);
	});
});

describe('CIPH-pi20-LB-8 JWT secret requirement', () => {
	it('SECURITY.md states JWT secret required, ≥32 chars, fails to start without it', () => {
		expect(SECURITY).toMatch(/JWT secret[\s\S]{0,200}≥\s*32\s*chars/);
	});

	it('server.py reads SECRET_KEY (or JWT_SECRET fallback) from env', () => {
		expect(SERVER).toMatch(/os\.environ\.get\('SECRET_KEY'\)/);
	});

	it("server.py error message names the requirement explicitly", () => {
		expect(SERVER).toMatch(/SECRET_KEY[\s\S]{0,80}≥\s*32\s*chars/);
	});
});

describe('CIPH-pi20-LB-8 browser-storage section claims', () => {
	it('"What the browser stores" section exists and covers all four layers', () => {
		expect(SECURITY).toMatch(/##\s+What the browser stores/);
		expect(SECURITY).toMatch(/sessionStorage[\s\S]{0,400}ciphra_master_key/);
		expect(SECURITY).toMatch(/localStorage[\s\S]{0,400}ciphra_auth/);
		expect(SECURITY).toMatch(/IndexedDB[\s\S]{0,400}ciphra_cache/);
		expect(SECURITY).toMatch(/[Ss]ervice worker cache/);
	});

	it('SECURITY.md cites auth.ts:34-83 region for the storage discipline', () => {
		// The doc's file:line cite must point to a region that still
		// contains the relevant logic.
		expect(SECURITY).toMatch(/frontend\/src\/lib\/stores\/auth\.ts:34-83/);
		// And auth.ts must still have the LS_KEY + SS_MASTER_KEY constants
		// in roughly that region (lines 34-50).
		expect(AUTH).toMatch(/const LS_KEY = 'ciphra_auth'/);
		expect(AUTH).toMatch(/const SS_MASTER_KEY = 'ciphra_master_key'/);
	});

	it('SECURITY.md references idb.ts and the wipe API', () => {
		expect(SECURITY).toMatch(/frontend\/src\/lib\/idb\.ts/);
		expect(SECURITY).toMatch(/clearAllPartitions/);
		// idb.ts must still export the function the doc names.
		expect(IDB).toMatch(/export async function clearAllPartitions\(\)/);
	});

	it('SECURITY.md cites the logout wipe call site', () => {
		expect(SECURITY).toMatch(/auth\.ts:127-149/);
		// auth.ts must still call clearAllPartitions inside logout.
		expect(AUTH).toMatch(/async logout\(\)\s*\{[\s\S]{0,800}clearAllPartitions\(\)/);
	});

	it('SECURITY.md verification step 5 lists the actual storage keys', () => {
		expect(SECURITY).toMatch(/ciphra_auth/);
		expect(SECURITY).toMatch(/ciphra_master_key/);
		expect(SECURITY).toMatch(/ciphra_cache/);
		expect(SECURITY).toMatch(/decrypted_documents/);
	});
});

describe('CIPH-pi20-LB-8 server-side claims', () => {
	it('SECURITY.md says no user enumeration on /login/init etc.', () => {
		expect(SECURITY).toMatch(/no\s+user\s+enumeration/i);
	});

	it('SECURITY.md says lockout: 5 login / 3 recovery', () => {
		expect(SECURITY).toMatch(/5\s+failed\s+login/);
		expect(SECURITY).toMatch(/3\s+failed\s+recovery/);
	});

	it('SECURITY.md says recovery code is 12 words from a 300-word list (~99 bits)', () => {
		expect(SECURITY).toMatch(/12-word\s+code/);
		expect(SECURITY).toMatch(/300-word\s+list/);
		expect(SECURITY).toMatch(/~?99\s+bits/);
	});
});

describe('CIPH-pi20-LB-8 sectional integrity', () => {
	it('SECURITY.md "Last updated" date is present and parseable', () => {
		expect(SECURITY).toMatch(/\*\*Last updated:\*\*\s+\d{4}-\d{2}-\d{2}/);
	});

	it('all major sections still exist (no accidental deletion)', () => {
		const sections = [
			'## Threat model',
			'## What is encrypted, and how',
			'## What the server can see',
			'## What the browser stores',
			'## Hardening',
			'## What is NOT done (yet)',
			'## How to verify our claims yourself',
		];
		for (const s of sections) {
			expect(SECURITY, `missing section: ${s}`).toContain(s);
		}
	});
});
