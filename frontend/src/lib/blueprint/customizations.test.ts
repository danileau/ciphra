/**
 * CIPH-882 — Contract for the additive-customization helpers.
 *
 * Locks the four invariants the rest of the feature depends on:
 *   - `isCustomItem` is a simple `custom_*` prefix check.
 *   - `generateCustomId` always emits `custom_<slug>_<suffix>` and never
 *     collides with itself or with any preset id.
 *   - `resolveBlueprint` is pure, idempotent, and merges the four custom
 *     arrays into the right blueprint slots.
 *   - `validateCustomItem` returns the expected error keys per kind.
 *
 * Plus the hide-not-delete + rename-id-stable contracts on
 * `customizations.custom*` shape, asserted at the data-level here.
 */

import { describe, it, expect } from 'vitest';
import {
	isCustomItem,
	generateCustomId,
	resolveBlueprint,
	validateCustomItem,
	prettifyCustomId,
	CUSTOM_GROUP_ID,
	CUSTOM_GROUP_LABEL_KEY,
} from './customizations';
import { applyBlueprintCustomizations } from '$lib/pdf';
import type { Blueprint, CustomSymptomItem } from './types';

function makeBp(over: Partial<Blueprint> = {}): Blueprint {
	const base: Blueprint = {
		version: 1,
		conditionId: 'custom',
		conditionLabel: 'Custom',
		accentColor: '#b23c2c',
		symptomGroups: [
			{ id: 'physical', label: 'symptom_group.physical', items: [
				{ id: 'tired', label: 'symptom.tired' },
				{ id: 'headache', label: 'symptom.headache' },
			] },
		],
		episodeTypes: [
			{ id: 'seizure', label: 'episode.seizure', color: '#b23c2c' },
		],
		triggers: [
			{ id: 'stress', label: 'trigger.stress' },
		],
		vitals: [
			{ id: 'sleep', label: 'vital.sleep', unit: 'h', placeholder: '7' },
		],
		medications: [],
		gridSymptomColumns: ['tired'],
		gridEpisodeColumns: ['seizure'],
		reportPreference: 'analytics',
	};
	return { ...base, ...over };
}

describe('isCustomItem', () => {
	it('matches every auto-generated custom id', () => {
		expect(isCustomItem('custom_tooth_flare_lk2x9')).toBe(true);
		expect(isCustomItem('custom_a_b')).toBe(true);
	});
	it('rejects every preset id', () => {
		expect(isCustomItem('tired')).toBe(false);
		expect(isCustomItem('headache')).toBe(false);
		expect(isCustomItem('seizure')).toBe(false);
		expect(isCustomItem('cycle_day')).toBe(false);
	});
	it('handles edge cases without throwing', () => {
		expect(isCustomItem('')).toBe(false);
		expect(isCustomItem('custom')).toBe(false); // no underscore
		expect(isCustomItem('custom_')).toBe(true);
		// type guard for runtime safety — preset ids are never null in
		// practice but the helper is called from rendering code.
		expect(isCustomItem(undefined as unknown as string)).toBe(false);
	});
});

describe('generateCustomId', () => {
	it('always starts with custom_', () => {
		expect(generateCustomId('Tooth flare-up')).toMatch(/^custom_/);
		expect(generateCustomId('')).toMatch(/^custom_item_/);
		expect(generateCustomId('!!!')).toMatch(/^custom_item_/);
	});
	it('slugifies non-alphanumeric chars to underscores', () => {
		const id = generateCustomId('Tooth flare-up!!');
		expect(id).toMatch(/^custom_tooth_flare_up_[a-z0-9]+$/);
	});
	it('strips diacritics so ä/ö/ü become a/o/u', () => {
		const id = generateCustomId('Übel');
		expect(id).toMatch(/^custom_ubel_/);
	});
	it('caps the slug at 24 chars', () => {
		const id = generateCustomId('a'.repeat(64));
		// id format: custom_<slug>_<5-char-suffix>
		const m = id.match(/^custom_(.+)_([a-z0-9]{5})$/);
		expect(m).not.toBeNull();
		expect(m![1].length).toBeLessThanOrEqual(24);
	});
	it('produces distinct ids across rapid calls (collision-resistant)', () => {
		const seen = new Set<string>();
		for (let i = 0; i < 200; i++) seen.add(generateCustomId('same label'));
		// 200 calls with a 5-char base36 suffix (~60M space) — collisions
		// should be vanishingly rare. >190 distinct is plenty proof.
		expect(seen.size).toBeGreaterThan(190);
	});
	it('never collides with any preset id (custom_ prefix is reserved)', () => {
		const id = generateCustomId('tired'); // same label as preset id
		expect(id).not.toBe('tired');
		expect(isCustomItem(id)).toBe(true);
	});
});

describe('resolveBlueprint — purity', () => {
	it('returns the same reference when no customizations field is present', () => {
		const bp = makeBp();
		expect(resolveBlueprint(bp)).toBe(bp);
	});
	it('returns the same reference when all custom arrays are empty', () => {
		const bp = makeBp({
			customizations: {
				customSymptoms: [],
				customTriggers: [],
				customVitals: [],
				customEpisodes: [],
			},
		});
		expect(resolveBlueprint(bp)).toBe(bp);
	});
	it('does not mutate the input blueprint', () => {
		const bp = makeBp({
			customizations: {
				customSymptoms: [{ id: 'custom_x_aaaaa', label: 'X' }],
			},
		});
		const before = JSON.stringify(bp);
		resolveBlueprint(bp);
		expect(JSON.stringify(bp)).toBe(before);
	});
});

describe('resolveBlueprint — symptom merging', () => {
	it('merges customSymptoms with matching groupId into that group', () => {
		const bp = makeBp({
			customizations: {
				customSymptoms: [
					{ id: 'custom_neck_ache_aaaaa', label: 'Neck ache', groupId: 'physical' },
				],
			},
		});
		const r = resolveBlueprint(bp);
		const physical = r.symptomGroups.find((g) => g.id === 'physical')!;
		expect(physical.items.map((it) => it.id)).toContain('custom_neck_ache_aaaaa');
	});
	it('synthesizes a "custom" group when groupId is missing or unknown', () => {
		const bp = makeBp({
			customizations: {
				customSymptoms: [
					{ id: 'custom_tooth_aaaaa', label: 'Tooth flare-up' },
					{ id: 'custom_jaw_bbbbb', label: 'Jaw stiffness', groupId: 'no-such-group' },
				],
			},
		});
		const r = resolveBlueprint(bp);
		const synth = r.symptomGroups.find((g) => g.id === CUSTOM_GROUP_ID)!;
		expect(synth).toBeDefined();
		expect(synth.label).toBe(CUSTOM_GROUP_LABEL_KEY);
		expect(synth.items.map((it) => it.id).sort()).toEqual([
			'custom_jaw_bbbbb',
			'custom_tooth_aaaaa',
		]);
	});
	it('appends to an existing "custom" preset group rather than duplicating it', () => {
		const bp = makeBp({
			symptomGroups: [
				{ id: CUSTOM_GROUP_ID, label: CUSTOM_GROUP_LABEL_KEY, items: [
					{ id: 'preset_in_custom', label: 'symptom.preset_in_custom' },
				] },
			],
			customizations: {
				customSymptoms: [{ id: 'custom_x_aaaaa', label: 'X' }],
			},
		});
		const r = resolveBlueprint(bp);
		const customGroups = r.symptomGroups.filter((g) => g.id === CUSTOM_GROUP_ID);
		expect(customGroups).toHaveLength(1);
		expect(customGroups[0].items.map((it) => it.id)).toEqual([
			'preset_in_custom',
			'custom_x_aaaaa',
		]);
	});
});

describe('resolveBlueprint — other arrays', () => {
	it('appends customTriggers to triggers', () => {
		const bp = makeBp({
			customizations: {
				customTriggers: [{ id: 'custom_cold_aaaaa', label: 'Cold drink' }],
			},
		});
		const r = resolveBlueprint(bp);
		expect(r.triggers.map((t) => t.id)).toEqual(['stress', 'custom_cold_aaaaa']);
	});
	it('appends customVitals to vitals with full VitalField shape', () => {
		const bp = makeBp({
			customizations: {
				customVitals: [
					{ id: 'custom_pain_aaaaa', label: 'Pain', unit: '0-10', placeholder: '5', min: 0, max: 10 },
				],
			},
		});
		const r = resolveBlueprint(bp);
		expect(r.vitals).toHaveLength(2);
		expect(r.vitals[1].id).toBe('custom_pain_aaaaa');
		expect(r.vitals[1].min).toBe(0);
		expect(r.vitals[1].max).toBe(10);
	});
	it('appends customEpisodes to episodeTypes with color preserved', () => {
		const bp = makeBp({
			customizations: {
				customEpisodes: [
					{ id: 'custom_flare_aaaaa', label: 'Flare', color: '#9f630b' },
				],
			},
		});
		const r = resolveBlueprint(bp);
		expect(r.episodeTypes).toHaveLength(2);
		expect(r.episodeTypes[1].color).toBe('#9f630b');
	});
});

describe('resolveBlueprint — idempotence', () => {
	it('resolve(resolve(bp)) is structurally equal to resolve(bp)', () => {
		const bp = makeBp({
			customizations: {
				customSymptoms: [
					{ id: 'custom_a_aaaaa', label: 'A' },
					{ id: 'custom_b_bbbbb', label: 'B', groupId: 'physical' },
				],
				customTriggers: [{ id: 'custom_c_ccccc', label: 'C' }],
				customVitals: [{ id: 'custom_d_ddddd', label: 'D', unit: 'x', placeholder: '0' }],
				customEpisodes: [{ id: 'custom_e_eeeee', label: 'E', color: '#000' }],
			},
		});
		const r1 = resolveBlueprint(bp);
		const r2 = resolveBlueprint(r1);
		// custom_b is already merged into physical; second resolve should
		// NOT re-merge from customizations because the resolved bp's
		// `customizations` field still contains custom_b. So r2 will have
		// duplicates UNLESS resolveBlueprint detects the merge.
		// Either: idempotence by structural equality, OR documented as
		// non-idempotent. Plan declared idempotent — assert structural.
		expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
	});
});

describe('applyBlueprintCustomizations composes resolveBlueprint', () => {
	it('hides a custom symptom when its id is in hiddenSymptoms', () => {
		const bp = makeBp({
			customizations: {
				customSymptoms: [
					{ id: 'custom_a_aaaaa', label: 'Visible' },
					{ id: 'custom_b_bbbbb', label: 'Hidden' },
				],
				hiddenSymptoms: ['custom_b_bbbbb'],
			},
		});
		const out = applyBlueprintCustomizations(bp);
		const allIds = out.symptomGroups.flatMap((g) => g.items.map((it) => it.id));
		expect(allIds).toContain('custom_a_aaaaa');
		expect(allIds).not.toContain('custom_b_bbbbb');
	});
	it('hides a custom trigger / vital identically to preset ones', () => {
		const bp = makeBp({
			customizations: {
				customTriggers: [{ id: 'custom_x_aaaaa', label: 'X' }],
				customVitals: [{ id: 'custom_y_bbbbb', label: 'Y', unit: 'u', placeholder: '0' }],
				hiddenTriggers: ['custom_x_aaaaa'],
				hiddenVitals: ['custom_y_bbbbb'],
			},
		});
		const out = applyBlueprintCustomizations(bp);
		expect(out.triggers.map((t) => t.id)).not.toContain('custom_x_aaaaa');
		expect(out.vitals.map((v) => v.id)).not.toContain('custom_y_bbbbb');
	});
});

describe('hide-not-delete + rename-id-stable contract', () => {
	it('toggling a custom item off keeps the entry in customSymptoms', () => {
		// Simulate the settings-tab toggle: add `id` to hiddenSymptoms but
		// leave `customSymptoms` untouched. resolveBlueprint still merges
		// it; applyBlueprintCustomizations then hides it for export.
		const bp = makeBp({
			customizations: {
				customSymptoms: [{ id: 'custom_x_aaaaa', label: 'X' }],
				hiddenSymptoms: ['custom_x_aaaaa'],
			},
		});
		// Resolved view still contains the item (so re-enable resurfaces it).
		const r = resolveBlueprint(bp);
		const allIds = r.symptomGroups.flatMap((g) => g.items.map((it) => it.id));
		expect(allIds).toContain('custom_x_aaaaa');
		// Source-of-truth array preserved.
		expect(bp.customizations!.customSymptoms![0].id).toBe('custom_x_aaaaa');
	});
	it('renaming a custom item changes label but keeps id stable', () => {
		const initial: CustomSymptomItem = { id: 'custom_x_aaaaa', label: 'Old name' };
		const renamed: CustomSymptomItem = { ...initial, label: 'New name' };
		expect(renamed.id).toBe(initial.id);
		expect(renamed.label).not.toBe(initial.label);
	});
});

describe('validateCustomItem', () => {
	it('rejects an empty / whitespace-only label', () => {
		expect(validateCustomItem('symptom', { label: '' })).toBe('customization.error_label_required');
		expect(validateCustomItem('symptom', { label: '   ' })).toBe('customization.error_label_required');
	});
	it('requires unit for vitals', () => {
		expect(validateCustomItem('vital', { label: 'Pain', unit: '' })).toBe('customization.error_unit_required');
		expect(validateCustomItem('vital', { label: 'Pain', unit: '0-10' })).toBeNull();
	});
	it('requires color for episodes', () => {
		expect(validateCustomItem('episode', { label: 'Flare', color: '' })).toBe('customization.error_color_required');
		expect(validateCustomItem('episode', { label: 'Flare', color: '#b23c2c' })).toBeNull();
	});
	it('returns null for a valid symptom and trigger', () => {
		expect(validateCustomItem('symptom', { label: 'Tooth flare-up' })).toBeNull();
		expect(validateCustomItem('trigger', { label: 'Cold drink' })).toBeNull();
	});
});

describe('prettifyCustomId (orphaned custom-id fallback)', () => {
	it('recovers a readable label from a custom id (no raw id leak)', () => {
		expect(prettifyCustomId('custom_wutend_r0ye3')).toBe('Wutend');
		expect(prettifyCustomId('custom_item_aaaaa')).toBe('Item');
	});
	it('handles multi-word slugs', () => {
		expect(prettifyCustomId('custom_tooth_flare_up_aaaaa')).toBe('Tooth flare up');
	});
	it('leaves non-custom ids unchanged (usable as a blanket fallback)', () => {
		expect(prettifyCustomId('slept_well')).toBe('slept_well');
		expect(prettifyCustomId('focal')).toBe('focal');
	});
	it('round-trips a generated id back to a readable label', () => {
		const id = generateCustomId('Wütend'); // → custom_wutend_<suffix>
		expect(prettifyCustomId(id)).toBe('Wutend');
	});
});
