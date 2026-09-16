/**
 * `activeVaultReady` — false exactly while a linked vault is active but its
 * link (the patient's key) has not loaded. The documents store refuses to load
 * in that window instead of falling back to the own vault, so the dashboard and
 * /reports hold their loading state rather than render an empty account.
 */
import { describe, it, expect, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/api', () => ({
	getDocuments: vi.fn(async () => ({
		ok: true,
		status: 200,
		data: { documents: [{ id: 1, encrypted_data: 'link-7' }] },
	})),
	familyClaimedList: vi.fn(async () => ({ ok: true, status: 200, data: { active: [{ source_user_id: 7 }] } })),
	storeDocument: vi.fn(),
	updateDocument: vi.fn(),
	deleteDocument: vi.fn(),
}));
vi.mock('$lib/crypto', () => ({
	decryptDocument: vi.fn(async () => ({
		type: 'family_link', source_user_id: 7, source_username: 'eva', label: 'Mama',
		patient_master_key_b64: 'AAAA', linked_at: '2026-09-01T00:00:00Z',
	})),
	encryptDocument: vi.fn(),
	b64ToBytes: vi.fn(() => new Uint8Array(32)),
	bytesToB64: vi.fn(),
}));
vi.mock('./auth', () => ({
	auth: { subscribe: (run: (v: unknown) => void) => { run({ masterKey: new Uint8Array(32) }); return () => {}; } },
}));

describe('activeVaultReady', () => {
	it('own vault: ready; a linked vault: ready once its link has loaded', async () => {
		sessionStorage.clear();
		const { activeVault, activeVaultReady, familyLinks } = await import('./familyLinks');
		expect(get(activeVaultReady)).toBe(true);

		activeVault.set(7); // as restored from sessionStorage after a reload
		expect(get(activeVaultReady)).toBe(false);

		await familyLinks.load();
		expect(get(activeVaultReady)).toBe(true);

		activeVault.set(8); // no link for this one
		expect(get(activeVaultReady)).toBe(false);

		activeVault.set(null);
		expect(get(activeVaultReady)).toBe(true);
	});
});
