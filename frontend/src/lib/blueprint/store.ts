import { writable, derived, get } from 'svelte/store';
import type { Blueprint } from './types';
import { auth } from '$lib/stores/auth';
import { documents } from '$lib/stores/documents';
import type { CiphraDocument } from '$lib/stores/documents';

function createBlueprintStore() {
	const { subscribe, set } = writable<Blueprint | null>(null);
	let loaded = false;

	return {
		subscribe,

		/** Load blueprint from encrypted documents. Call after documents.load(). */
		loadFromDocuments() {
			const docs = get(documents);
			const bpDoc = docs.find((d: CiphraDocument) => d.data?.type === 'blueprint');
			if (bpDoc) {
				set(bpDoc.data.blueprint as Blueprint);
				loaded = true;
			} else {
				set(null);
				loaded = true;
			}
		},

		/** Save blueprint as an encrypted document. */
		async save(blueprint: Blueprint): Promise<boolean> {
			const docs = get(documents);
			const existing = docs.find((d: CiphraDocument) => d.data?.type === 'blueprint');
			const payload = { type: 'blueprint', blueprint };

			let ok: boolean;
			if (existing) {
				ok = await documents.updateDoc(existing.id, payload);
			} else {
				ok = await documents.save(payload);
			}
			if (ok) set(blueprint);
			return ok;
		},

		get loaded() {
			return loaded;
		},

		clear() {
			set(null);
			loaded = false;
		}
	};
}

export const blueprint = createBlueprintStore();

/** Whether a blueprint has been set up */
export const hasBlueprint = derived(blueprint, ($bp) => $bp !== null);
