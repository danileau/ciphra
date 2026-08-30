/**
 * A linked caregiver must not receive the patient's diary or locked entries.
 *
 * ciphra told caregivers, in the vault banner, that they were seeing a partial
 * record: "Du siehst N geteilte Einträge. M persönliche Einträge bleiben
 * privat." (`family.private_context`). `private.tooltip` and
 * `journal.diary_hint` promise the same thing in the patient's own words —
 * "nie exportiert oder geteilt".
 *
 * None of it was implemented. The linked-vault load filtered `family_link`
 * documents and nothing else, so a family grant — which re-wraps the patient's
 * master key — handed the caregiver the diary along with everything else. The
 * banner even counted the hidden entries out of `$documents`, which was only
 * possible because they were sitting in it.
 *
 * Reported by a user who had already sent an invite link to her doctor and
 * asked, reasonably, what it actually shared.
 *
 * The filter is client-side: the ciphertext still arrives and the key still
 * decrypts it. It makes the app honest, not the boundary real — that is the
 * per-grant scope work, which moves the decision server-side.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

type Raw = { id: number; encrypted_data: string; created_at: string };

const h = vi.hoisted(() => {
	const state: {
		vault: number | null;
		serverDocs: Raw[];
		plaintext: Record<string, unknown>;
		cached: Array<{ id: number; user_id: string; data: unknown; etag: string; created_at: string }>;
		putDocsCalls: Array<{ key: string; docs: Array<{ data: { type?: string } }> }>;
	} = { vault: 7, serverDocs: [], plaintext: {}, cached: [], putDocsCalls: [] };
	return { state };
});

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/api', () => ({
	getDocuments: async () => ({ ok: true, data: { documents: h.state.serverDocs } }),
	familyDocuments: async () => ({ ok: true, data: { documents: h.state.serverDocs } }),
	storeDocument: vi.fn(),
	updateDocument: vi.fn(),
	deleteDocument: vi.fn(),
	familyDocumentCreate: vi.fn(),
	familyDocumentUpdate: vi.fn(),
	familyDocumentDelete: vi.fn(),
}));
vi.mock('$lib/crypto', () => ({
	encryptDocument: vi.fn(),
	decryptDocument: vi.fn(async (ct: string) => h.state.plaintext[ct]),
}));
vi.mock('$lib/idb', () => ({
	getAllDocs: vi.fn(async () => h.state.cached),
	putDocs: vi.fn(async (key: string, docs: unknown[]) => {
		h.state.putDocsCalls.push({ key, docs: docs as Array<{ data: { type?: string } }> });
	}),
	clearDocs: vi.fn(async () => {}),
}));
vi.mock('$lib/outbox', () => ({
	enqueue: vi.fn(async () => 'obx-test'),
	dequeue: vi.fn(async () => {}),
	getPending: vi.fn(async () => []),
	updateCiphertext: vi.fn(async () => {}),
	refreshPendingCount: vi.fn(async () => {}),
}));
vi.mock('./familyLinks', () => ({
	familyLinks: {
		subscribe: (run: (v: unknown) => void) => {
			run([{ sourceUserId: 7, sourceUsername: 'hans', patientMasterKey: new Uint8Array(32), revoked: false }]);
			return () => {};
		},
	},
	activeVault: {
		subscribe: (run: (v: unknown) => void) => {
			run(h.state.vault);
			return () => {};
		},
	},
}));
vi.mock('./auth', () => ({
	auth: {
		subscribe: (run: (v: unknown) => void) => {
			run({ masterKey: new Uint8Array(32), username: 'carer' });
			return () => {};
		},
	},
}));

/** The patient's vault: two shareable documents, two that are not. */
function seedPatientVault() {
	h.state.serverDocs = [
		{ id: 1, encrypted_data: 'ct-entry', created_at: 't1' },
		{ id: 2, encrypted_data: 'ct-diary', created_at: 't2' },
		{ id: 3, encrypted_data: 'ct-locked', created_at: 't3' },
		{ id: 4, encrypted_data: 'ct-event', created_at: 't4' },
	];
	h.state.plaintext = {
		'ct-entry': { type: 'entry', date: '2026-08-01' },
		'ct-diary': { type: 'diary', date: '2026-08-02', text: 'was ich niemandem sage', private: true },
		'ct-locked': { type: 'entry', date: '2026-08-03', private: true },
		'ct-event': { type: 'event', date: '2026-08-04', title: 'Dosis erhöht' },
	};
}

describe('linked-vault load withholds the patient private documents', () => {
	beforeEach(() => {
		h.state.vault = 7;
		h.state.cached = [];
		h.state.putDocsCalls = [];
		seedPatientVault();
	});

	it('renders only the shareable documents', async () => {
		const { documents } = await import('./documents');
		documents.clear();
		expect(await documents.load()).toBe(true);

		const ids = get(documents).map((d) => d.id).sort();
		expect(ids).toEqual([1, 4]);
	});

	it('reports how many it withheld, so the banner can say so', async () => {
		const { documents, caregiverHiddenCount } = await import('./documents');
		documents.clear();
		await documents.load();

		expect(get(caregiverHiddenCount)).toBe(2);
	});

	it('does not write the withheld plaintext to the caregiver device', async () => {
		const { documents } = await import('./documents');
		documents.clear();
		await documents.load();

		const written = h.state.putDocsCalls.at(-1);
		expect(written, 'the cache should have been rewritten').toBeTruthy();
		const types = written!.docs.map((d) => d.data.type).sort();
		expect(types).toEqual(['entry', 'event']);
	});

	it('withholds them from a cache written before this filter existed', async () => {
		// The upgrade path: a caregiver who already synced has the patient's
		// diary in IndexedDB. The instant-render path must not paint it while
		// the server pass is still in flight.
		h.state.cached = [
			{ id: 2, user_id: 'carer:linked:7', data: h.state.plaintext['ct-diary'], etag: 'ct-diary', created_at: 't2' },
			{ id: 1, user_id: 'carer:linked:7', data: h.state.plaintext['ct-entry'], etag: 'ct-entry', created_at: 't1' },
		];
		// Freeze the server pass so only the cache render has happened.
		const { documents } = await import('./documents');
		documents.clear();
		const pending = documents.load();
		await Promise.resolve();
		await Promise.resolve();
		expect(get(documents).some((d) => (d.data as { type?: string }).type === 'diary')).toBe(false);
		await pending;
	});

	it('leaves the owner own vault untouched', async () => {
		h.state.vault = null;
		const { documents, caregiverHiddenCount } = await import('./documents');
		documents.clear();
		expect(await documents.load()).toBe(true);

		const ids = get(documents).map((d) => d.id).sort();
		expect(ids, 'your own diary is yours to see').toEqual([1, 2, 3, 4]);
		expect(get(caregiverHiddenCount)).toBe(0);
	});
});
