import { writable, get } from 'svelte/store';
import { auth } from './auth';
import * as api from '$lib/api';
import { encryptDocument, decryptDocument } from '$lib/crypto';

export interface CiphraDocument {
	id: number;
	serverCreatedAt: string;
	data: any;
}

function createDocStore() {
	const { subscribe, set, update } = writable<CiphraDocument[]>([]);
	let loading = false;

	return {
		subscribe,
		async load() {
			if (loading) return;
			loading = true;
			const { masterKey } = get(auth);
			if (!masterKey) return;

			const res = await api.getDocuments();
			if (!res.ok) { loading = false; return; }

			const docs: CiphraDocument[] = [];
			const rawDocs = (res.data.documents as Array<{ id: number; encrypted_data: string; created_at: string }>) || [];
			for (const d of rawDocs) {
				try {
					const data = await decryptDocument(d.encrypted_data, masterKey);
					docs.push({ id: d.id, serverCreatedAt: d.created_at, data });
				} catch {
					// skip corrupted documents
				}
			}
			set(docs);
			loading = false;
		},
		async save(data: any): Promise<boolean> {
			const { masterKey } = get(auth);
			if (!masterKey) return false;
			const encrypted = await encryptDocument(data, masterKey);
			const res = await api.storeDocument(encrypted);
			if (res.ok) {
				await this.load();
			}
			return res.ok;
		},
		async updateDoc(id: number, data: any): Promise<boolean> {
			const { masterKey } = get(auth);
			if (!masterKey) return false;
			const encrypted = await encryptDocument(data, masterKey);
			const res = await api.updateDocument(id, encrypted);
			if (res.ok) await this.load();
			return res.ok;
		},
		async remove(id: number): Promise<boolean> {
			const res = await api.deleteDocument(id);
			if (res.ok) {
				update((docs) => docs.filter((d) => d.id !== id));
			}
			return res.ok;
		},
		clear() {
			set([]);
		}
	};
}

export const documents = createDocStore();
