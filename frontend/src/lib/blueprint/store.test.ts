/**
 * blueprint.save() must never create a SECOND blueprint document. It remembers
 * the blueprint doc's id from loadFromDocuments() and updates that, so a save
 * that lands while $documents is transiently empty (mid-reload) still updates
 * rather than duplicating.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writable } from 'svelte/store';

const docsData = writable<any[]>([]);
const updateDoc = vi.fn(async () => true);
const save = vi.fn(async () => true);

vi.mock('$lib/stores/documents', () => ({
	documents: { subscribe: docsData.subscribe, updateDoc, save },
}));
vi.mock('$lib/stores/auth', () => ({
	auth: { subscribe: writable({ masterKey: new Uint8Array(32), username: 'u' }).subscribe },
}));

describe('blueprint.save duplicate-doc guard', () => {
	beforeEach(() => { docsData.set([]); updateDoc.mockClear(); save.mockClear(); });

	it('updates the remembered doc even when $documents is transiently empty', async () => {
		const { blueprint } = await import('./store');
		blueprint.clear();
		docsData.set([{ id: 42, data: { type: 'blueprint', blueprint: { version: 1 } } }]);
		blueprint.loadFromDocuments();   // remembers id 42
		docsData.set([]);                // mid-reload empty snapshot
		await blueprint.save({ version: 2 } as any);
		expect(updateDoc).toHaveBeenCalledWith(42, expect.objectContaining({ type: 'blueprint' }));
		expect(save).not.toHaveBeenCalled(); // no duplicate create
	});

	it('creates when no blueprint exists and none is remembered', async () => {
		const { blueprint } = await import('./store');
		blueprint.clear();
		docsData.set([]);
		blueprint.loadFromDocuments();   // none found → bpDocId stays null
		await blueprint.save({ version: 1 } as any);
		expect(save).toHaveBeenCalled();
		expect(updateDoc).not.toHaveBeenCalled();
	});

	it('clear() forgets the remembered id (so a fresh vault creates its own)', async () => {
		const { blueprint } = await import('./store');
		docsData.set([{ id: 9, data: { type: 'blueprint', blueprint: { version: 1 } } }]);
		blueprint.loadFromDocuments();   // remembers 9
		blueprint.clear();               // forget
		docsData.set([]);
		await blueprint.save({ version: 1 } as any);
		expect(save).toHaveBeenCalled();
		expect(updateDoc).not.toHaveBeenCalled();
	});
});
