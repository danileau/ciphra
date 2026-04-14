/**
 * CIPH-712 — Epilepc → ciphra bundle parser + mapping.
 *
 * Translates schema v1.1 export bundles into ciphra's 2-type doc model
 * (entry / event) plus diary primitive and Blueprint.medications append.
 *
 * No external deps. Manual schema validator — strict, rejects unknown
 * top-level fields. Unknown seizure type_name maps to 'unknown'.
 */

import type { Blueprint, MedicationSlot } from '$lib/blueprint/types';
import { epilepsy as epilepsyPreset } from '$lib/blueprint/presets';

export const SUPPORTED_SCHEMA_VERSION = '1.1';

export interface EpilepcBundle {
	schema_version: string;
	exported_at: string;
	epilepc_decommission_at: string;
	epilepc_user_id: string;
	seizures: EpilepcSeizure[];
	events: EpilepcEvent[];
	medications: EpilepcMedication[];
	diary: EpilepcDiary[];
}

export interface EpilepcSeizure {
	epilepc_id: string;
	date: string;
	time?: string | null;
	type_name?: string | null;
	notes?: string | null;
}
export interface EpilepcEvent {
	epilepc_id: string;
	date: string;
	title: string;
	notes?: string | null;
}
export interface EpilepcMedication {
	epilepc_id: string;
	name: string;
	dose?: string | null;
	notes?: string | null;
	as_needed?: boolean | null;
	started_at?: string | null;
	ended_at?: string | null;
}
export interface EpilepcDiary {
	epilepc_id: string;
	date: string;
	time?: string | null;
	text: string;
}

const ALLOWED_TOP_LEVEL = new Set([
	'schema_version',
	'exported_at',
	'epilepc_decommission_at',
	'epilepc_user_id',
	'seizures',
	'events',
	'medications',
	'diary',
]);

/** Throws on schema mismatch / unknown fields / structural error. */
export function validateBundle(raw: unknown): EpilepcBundle {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		throw new Error('bundle_not_object');
	}
	const obj = raw as Record<string, unknown>;
	for (const k of Object.keys(obj)) {
		if (!ALLOWED_TOP_LEVEL.has(k)) throw new Error(`unknown_field:${k}`);
	}
	if (obj.schema_version !== SUPPORTED_SCHEMA_VERSION) throw new Error('wrong_schema_version');
	if (typeof obj.exported_at !== 'string') throw new Error('bad_exported_at');
	if (typeof obj.epilepc_decommission_at !== 'string') throw new Error('bad_decommission');
	if (typeof obj.epilepc_user_id !== 'string') throw new Error('bad_user_id');
	for (const arr of ['seizures', 'events', 'medications', 'diary']) {
		if (!Array.isArray(obj[arr])) throw new Error(`bad_${arr}`);
	}
	return obj as unknown as EpilepcBundle;
}

/** Map epilepc free-string seizure type_name → ciphra episode key. Case-insensitive. */
export function mapSeizureType(typeName: string | null | undefined): string {
	if (!typeName) return 'unknown';
	const n = typeName.toLowerCase();
	if (n.includes('focal') || n.includes('fokal')) return 'focal';
	if (n.includes('myoclonic') || n.includes('myoklon')) return 'myoclonic';
	if (n.includes('generalized') || n.includes('generalisiert') ||
		n.includes('gtc') || n.includes('tonic') || n.includes('clonic') ||
		n.includes('tonisch') || n.includes('klonisch')) return 'generalized';
	if (n.includes('absence') || n.includes('absenz')) return 'absence';
	return 'unknown';
}

export interface MappedDocs {
	entries: Array<Record<string, unknown>>;
	events: Array<Record<string, unknown>>;
	diaries: Array<Record<string, unknown>>;
	medications: MedicationSlot[];
}

export function mapBundle(b: EpilepcBundle): MappedDocs {
	const entries = b.seizures.map((s) => {
		const ep = mapSeizureType(s.type_name ?? null);
		const doc: Record<string, unknown> = {
			type: 'entry',
			date: s.date,
			episodes: { [ep]: 1 },
			source: 'epilepc',
			source_id: `s-${s.epilepc_id}`,
		};
		if (s.time) doc.time = s.time;
		if (s.notes) doc.notes = s.notes;
		// CIPH-760 — preserve raw epilepc type_name alongside the coarse
		// ciphra episode key so granularity ("Fokal rechts", "Absence mit
		// Sturz") isn't lost. Surfaced by EntryPreview as a subtitle.
		if (s.type_name) doc.epilepc_original_type = s.type_name;
		return doc;
	});

	// CIPH-760 — keep epilepc `name` (title) and `description` (notes)
	// separate. Previously callers had concatenated them, losing the
	// distinction. Ciphra's event doc has both fields; we map 1:1.
	const events = b.events.map((e) => ({
		type: 'event',
		date: e.date,
		title: e.title,
		notes: e.notes ?? '',
		source: 'epilepc',
		source_id: `e-${e.epilepc_id}`,
	}));

	const diaries = b.diary.map((d) => {
		const doc: Record<string, unknown> = {
			type: 'diary',
			date: d.date,
			text: d.text,
			private: true,
			source: 'epilepc',
			source_id: `d-${d.epilepc_id}`,
		};
		if (d.time) doc.time = d.time;
		return doc;
	});

	const medications: MedicationSlot[] = b.medications.map((m) => ({
		id: `epilepc-m-${m.epilepc_id}`,
		name: m.name,
		dose: m.dose ?? '',
		schedule: m.notes ?? '',
		asNeeded: !!m.as_needed,
		// Carry-along, not part of MedicationSlot but harmless extra fields.
		...(m.started_at ? { startedAt: m.started_at } : {}),
		...(m.ended_at ? { endedAt: m.ended_at } : { ongoing: true }),
	}) as MedicationSlot);

	return { entries, events, diaries, medications };
}

/** Stable source_id list for checkpointing. */
export function allSourceIds(m: MappedDocs): string[] {
	return [
		...m.entries.map((e) => e.source_id as string),
		...m.events.map((e) => e.source_id as string),
		...m.diaries.map((d) => d.source_id as string),
	];
}

export function mergeMedications(existing: MedicationSlot[], incoming: MedicationSlot[]): MedicationSlot[] {
	const ids = new Set(existing.map((m) => m.id));
	const merged = [...existing];
	for (const m of incoming) {
		if (!ids.has(m.id)) merged.push(m);
	}
	return merged;
}

/** Build a default-ish blueprint when the new ciphra account has none yet.
 *  Epilepc users are by definition tracking epilepsy, so we seed a minimal
 *  one and append the medications. The existing setup wizard can be re-run
 *  later. */
export function defaultEpilepsyBlueprint(): Blueprint {
	// Use the real epilepsy preset — identical to what a user gets from the
	// setup wizard. Deep-clone so callers can mutate (e.g. append medications)
	// without poisoning the shared preset object.
	return JSON.parse(JSON.stringify(epilepsyPreset)) as Blueprint;
}
