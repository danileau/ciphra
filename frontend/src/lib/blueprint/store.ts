import { writable, derived, get } from 'svelte/store';
import type { Blueprint } from './types';
import { resolveBlueprint } from './customizations';
import { auth } from '$lib/stores/auth';
import { documents } from '$lib/stores/documents';
import type { CiphraDocument } from '$lib/stores/documents';

function createBlueprintStore() {
	const { subscribe, set } = writable<Blueprint | null>(null);
	let loaded = false;
	// Remember the blueprint document's server id once loaded, so save() can
	// reliably UPDATE it instead of re-deriving "does one exist?" from
	// $documents — which is briefly empty during a reload and would otherwise
	// cause save() to CREATE a duplicate blueprint doc.
	let bpDocId: number | null = null;

	return {
		subscribe,

		/** Load blueprint from encrypted documents. Call after documents.load(). */
		loadFromDocuments() {
			const docs = get(documents);
			const bpDoc = docs.find((d: CiphraDocument) => d.data?.type === 'blueprint');
			if (bpDoc) {
				bpDocId = bpDoc.id;
				set(bpDoc.data.blueprint as Blueprint);
				loaded = true;
			} else {
				// Don't null bpDocId here: loadFromDocuments can run against a
				// transiently-empty $documents mid-reload. Keep a known id so a
				// concurrent save() still updates rather than duplicates; it's
				// reset only on clear() (logout / vault switch).
				set(null);
				loaded = true;
			}
		},

		/** Save blueprint as an encrypted document. */
		async save(blueprint: Blueprint): Promise<boolean> {
			const payload = { type: 'blueprint', blueprint };
			// Prefer the remembered id; fall back to a lookup for the very first
			// save (no id yet) when no blueprint doc exists.
			let targetId = bpDocId;
			if (targetId == null) {
				const existing = get(documents).find((d: CiphraDocument) => d.data?.type === 'blueprint');
				targetId = existing ? existing.id : null;
			}

			let ok: boolean;
			if (targetId != null) {
				ok = await documents.updateDoc(targetId, payload);
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
			bpDocId = null;
		}
	};
}

export const blueprint = createBlueprintStore();

/** Whether a blueprint has been set up */
export const hasBlueprint = derived(blueprint, ($bp) => $bp !== null);

/** CIPH-882 — blueprint with `customizations.custom*` arrays merged into
 *  the primary collections. Most consumers should subscribe to this store
 *  instead of `blueprint` so user-added items render automatically. The
 *  setup wizard works on a local `working` variable and calls
 *  `resolveBlueprint(working)` directly for the same effect. */
export const resolvedBlueprint = derived(blueprint, ($bp) =>
	$bp ? resolveBlueprint($bp) : null,
);
