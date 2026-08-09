/**
 * CIPH-712 — Epilepc → ciphra bundle parser + mapping.
 *
 * Translates schema v1.1 export bundles into ciphra's 2-type doc model
 * (entry / event) plus diary primitive and Blueprint.medications append.
 *
 * No external deps. Manual schema validator — strict, rejects unknown
 * top-level fields. Unknown seizure type_name maps to 'unknown'.
 */

import type { Blueprint, EpisodeType, MedicationSlot } from '$lib/blueprint/types';
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

/** A dose token: a number (decimal/ratio) followed by a recognised unit. The
 *  unit is REQUIRED — we never strip a bare number, so a number that is part of
 *  a drug's identity ("Vitamin B12", "5-HTP") is preserved. No leading `\b`, so
 *  the glued form ("urbanyl10mg") is caught too. */
const DOSE_TOKEN = /\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)?\s*(?:mcg|µg|ug|mg|kg|ml|iu|ie|hübe?|hub|puffs?|tropfen|gtt|tabletten?|tabs?|stk|g|l|%)\b\.?/gi;

/** Parse an epilepc freetext medication name into a dedup key + clean base
 *  name + any embedded dose. Grouping is case- and whitespace-insensitive and
 *  ignores an embedded dose token — so "Urbanyl", "urbanyl", "urbanyl10mg" and
 *  "URBANyL 15mg" all collapse to ONE definition (matching a `grep -i urbanyl`
 *  intuition), while a typo like "urbayl" stays separate (NO fuzzy matching —
 *  fusing distinct drugs would be a medical-safety bug). */
export function parseEpilepcMedName(raw: string): { base: string; key: string; embeddedDose: string } {
	const doses: string[] = [];
	const stripped = raw.replace(DOSE_TOKEN, (mm) => { doses.push(mm.trim()); return ' '; });
	const base = stripped.replace(/\s+/g, ' ').trim();
	const key = base.toLowerCase().replace(/\s+/g, '');
	return { base, key, embeddedDose: doses.join(' ').replace(/\s+/g, ' ').trim() };
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

	// CIPH-pi19 — epilepc modelled each medication INTAKE as its own medication
	// row, so a single PRN drug (e.g. Urbanyl) arrived as dozens/hundreds of
	// duplicate rows. ciphra's model is: one medication DEFINITION + one event
	// per intake. So we (1) collapse records to a single MedicationSlot per
	// normalized name+dose, and (2) turn each original record with a
	// `started_at` into a `kind:'medication'` intake event so the dosing
	// history survives on the timeline / calendar / reports / PDF.
	const medications: MedicationSlot[] = [];
	const medEvents: Array<Record<string, unknown>> = [];
	const slotByKey = new Map<string, MedicationSlot>();
	const slugify = (s: string) => s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'med';

	for (const m of b.medications) {
		const name = m.name.trim();
		const { base, key, embeddedDose } = parseEpilepcMedName(name);
		// Dose to record on the intake: the structured field wins, else the
		// dose that was embedded in the freetext name (e.g. "Urbanyl 10mg").
		const dose = (m.dose ?? '').trim() || embeddedDose;
		let slot = slotByKey.get(key);
		if (!slot) {
			// First occurrence wins the (dose-stripped) display name + a default dose.
			slot = { id: `epilepc-med-${slugify(key)}`, name: base || name, dose, schedule: m.notes ?? '', asNeeded: !!m.as_needed };
			slotByKey.set(key, slot);
			medications.push(slot);
		} else {
			if (m.as_needed) slot.asNeeded = true; // any as-needed intake flags the definition
			if (!slot.dose && dose) slot.dose = dose; // backfill a default dose if the first was blank
		}
		// One intake event per original record (dated at started_at).
		if (m.started_at) {
			const dt = String(m.started_at);
			const ev: Record<string, unknown> = {
				type: 'event',
				kind: 'medication',
				date: dt.slice(0, 10),
				medicationId: slot.id,
				source: 'epilepc',
				source_id: `m-${m.epilepc_id}`,
			};
			const hhmm = dt.slice(11, 16);
			if (/^\d{2}:\d{2}$/.test(hhmm)) ev.time = hhmm;
			if (dose) ev.dose = dose;
			// Preserve the exact freetext name typed for THIS intake, so the
			// normalized merge is non-destructive and auditable.
			if (name) ev.notes = name;
			medEvents.push(ev);
		}
	}

	return { entries, events: [...events, ...medEvents], diaries, medications };
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

/**
 * INC-001 — make sure the blueprint can actually render what we just imported.
 *
 * `mapSeizureType` files every migrated seizure under one of five episode keys
 * (focal / generalized / absence / myoclonic / unknown). If the account's
 * blueprint has no matching `episodeTypes` entry, those entries import fine and
 * then render as nothing — the user sees an empty app and concludes the
 * migration failed. That is reachable today: a migrant whose first attempt died
 * gets bounced into `/setup` (the dashboard requires a blueprint), picks some
 * condition, and on the retry their wizard blueprint wins.
 *
 * Additive by design. Existing types keep their id, label, colour and tracking
 * flags untouched — only genuinely missing ones are appended. Wholesale
 * blueprint replacement is what caused the 2026-06-20 medication data-loss
 * incident; never do that here.
 */
export function ensureEpisodeTypes(bp: Blueprint, required: EpisodeType[]): Blueprint {
	const have = new Set((bp.episodeTypes || []).map((e) => e.id));
	const missing = required.filter((e) => !have.has(e.id));
	if (missing.length === 0) return bp;
	return { ...bp, episodeTypes: [...(bp.episodeTypes || []), ...missing] };
}

/** The five episode types every epilepc import needs. */
export function epilepcEpisodeTypes(): EpisodeType[] {
	return defaultEpilepsyBlueprint().episodeTypes;
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
