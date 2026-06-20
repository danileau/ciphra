/**
 * CIPH-882 — Additive blueprint customization.
 *
 * Three pure helpers that turn `Blueprint.customizations.custom*` arrays
 * into a fully-realized blueprint that every iterator can consume without
 * per-call-site changes:
 *
 *   - `isCustomItem(id)` — discriminator used at every label-rendering
 *     site. Custom items own a literal label string (user-typed); preset
 *     items own an i18n key. The branch:
 *
 *         isCustomItem(id) ? item.label : $t(item.label)
 *
 *     One missed site = a raw `custom_*` id rendered in a PDF, hence
 *     `frontend/src/lib/labels-audit.md` enumerating every site and the
 *     paired `customItems-render.test.ts` source-parse guard.
 *
 *   - `generateCustomId(label)` — `custom_<slug>_<random>` so custom ids
 *     can never collide with preset ids (none of which start with
 *     `custom_`) or with another freshly-typed custom item.
 *
 *   - `resolveBlueprint(bp)` — pure function that merges the four custom
 *     arrays into the blueprint's primary collections. Single seam: every
 *     consumer that today reads `bp.symptomGroups / .triggers / .vitals /
 *     .episodeTypes` must read `resolveBlueprint(bp).symptomGroups` etc.
 *     `applyBlueprintCustomizations` (pdf.ts) chains this internally so
 *     PDF + CSV pipelines pick up custom items for free.
 *
 *   - `validateCustomItem(kind, item)` — returns the first validation
 *     error i18n key, or `null` if valid. Used by `CustomItemModal` for
 *     inline error rendering.
 */

import type {
	Blueprint,
	BlueprintGroup,
	BlueprintItem,
	CustomSymptomItem,
	EpisodeType,
	VitalField,
} from './types';

/** True iff `id` is an auto-generated custom item id. Preset ids never
 *  start with `custom_`, so this is a simple, fast prefix check. */
export function isCustomItem(id: string): boolean {
	return typeof id === 'string' && id.startsWith('custom_');
}

/** Slugify a user-typed label into a stable id fragment + random suffix.
 *  Result: `custom_<slug>_<5char>`. Slug is lowercase ASCII alphanumeric
 *  joined by underscores, capped at 24 chars; suffix is base36 random.
 *  Empty / pure-symbol labels fall back to `item` as the slug. */
export function generateCustomId(label: string): string {
	const slug = String(label || '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 24) || 'item';
	const suffix = Math.random().toString(36).slice(2, 7).padEnd(5, '0');
	return `custom_${slug}_${suffix}`;
}

/** Human-readable fallback label for an ORPHANED custom id — one logged into
 *  an entry but no longer present in the blueprint (e.g. after a condition
 *  switch resets customizations per the one-blueprint model, or the item was
 *  deleted). The id is `custom_<slug>_<5char>`; recover the slug as a readable
 *  label so no surface ever leaks the raw id. Non-custom ids are returned
 *  unchanged so call sites can use it as a blanket `|| prettifyCustomId(id)`
 *  fallback. The umlaut/casing lost at slug time isn't recoverable, so
 *  `custom_wutend_r0ye3` → "Wutend" — still far better than the raw id. */
export function prettifyCustomId(id: string): string {
	if (!isCustomItem(id)) return id;
	const body = id
		.replace(/^custom_/, '')
		.replace(/_[a-z0-9]{5}$/, ''); // strip the trailing random suffix
	const words = body.replace(/_/g, ' ').trim();
	if (!words) return id;
	return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Synthetic group id used when a `customSymptoms` item has no `groupId`
 *  or its `groupId` does not match any existing group. */
export const CUSTOM_GROUP_ID = 'custom';

/** i18n key for the synthetic "Custom" group label. Looked up via $t at
 *  render time like any other preset group label. */
export const CUSTOM_GROUP_LABEL_KEY = 'symptom_group.custom';

/** Merge `customizations.custom*` into the blueprint's primary collections.
 *  Pure function; returns the same reference when no customs are present.
 *  Idempotent: `resolve(resolve(bp))` is structurally equal to `resolve(bp)`. */
export function resolveBlueprint(bp: Blueprint): Blueprint {
	const cz = bp.customizations;
	if (!cz) return bp;
	const cs = cz.customSymptoms || [];
	const ct = cz.customTriggers || [];
	const cv = cz.customVitals || [];
	const ce = cz.customEpisodes || [];
	if (cs.length === 0 && ct.length === 0 && cv.length === 0 && ce.length === 0) {
		return bp;
	}

	// Merge custom symptoms into existing groups by groupId; collect the
	// rest into a synthetic "Custom" group.
	let symptomGroups: BlueprintGroup[] = bp.symptomGroups;
	if (cs.length > 0) {
		const groupsCopy = bp.symptomGroups.map((g) => ({ ...g, items: [...g.items] }));
		const synthetic: BlueprintItem[] = [];
		const groupById = new Map<string, BlueprintGroup>(groupsCopy.map((g) => [g.id, g]));
		for (const item of cs) {
			const stripped: BlueprintItem = { id: item.id, label: item.label };
			if (item.icon) stripped.icon = item.icon;
			const gid = item.groupId;
			if (gid && groupById.has(gid)) {
				groupById.get(gid)!.items.push(stripped);
			} else {
				synthetic.push(stripped);
			}
		}
		if (synthetic.length > 0) {
			const existingCustom = groupById.get(CUSTOM_GROUP_ID);
			if (existingCustom) {
				existingCustom.items.push(...synthetic);
			} else {
				groupsCopy.push({
					id: CUSTOM_GROUP_ID,
					label: CUSTOM_GROUP_LABEL_KEY,
					items: synthetic,
				});
			}
		}
		symptomGroups = groupsCopy;
	}

	// Strip the four custom* arrays from the resolved view so a second
	// `resolveBlueprint(resolveBlueprint(bp))` call is a no-op. Keep the
	// `hidden*` arrays — `applyBlueprintCustomizations` still needs them.
	const { customSymptoms: _cs, customTriggers: _ct, customVitals: _cv, customEpisodes: _ce, ...restCustomizations } = cz;
	const cleanedCustomizations = restCustomizations;

	return {
		...bp,
		symptomGroups,
		triggers: ct.length > 0 ? [...bp.triggers, ...ct] : bp.triggers,
		vitals: cv.length > 0 ? [...bp.vitals, ...cv] : bp.vitals,
		episodeTypes: ce.length > 0 ? [...bp.episodeTypes, ...ce] : bp.episodeTypes,
		customizations: cleanedCustomizations,
	};
}

export type CustomKind = 'symptom' | 'trigger' | 'vital' | 'episode';

/** Validate a custom-item draft. Returns the first failing i18n error key
 *  or `null` when valid. Surface the key under the offending input. */
export function validateCustomItem(
	kind: CustomKind,
	item: Partial<BlueprintItem & VitalField & EpisodeType>,
): string | null {
	const label = String(item.label || '').trim();
	if (!label) return 'customization.error_label_required';
	if (kind === 'vital') {
		const unit = String((item as VitalField).unit || '').trim();
		if (!unit) return 'customization.error_unit_required';
	}
	if (kind === 'episode') {
		const color = String((item as EpisodeType).color || '').trim();
		if (!color) return 'customization.error_color_required';
	}
	return null;
}
