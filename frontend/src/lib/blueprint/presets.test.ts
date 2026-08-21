/**
 * ciphra — Blueprint presets tests.
 *
 * Validates structural invariants across all presets:
 * required fields, cross-references between grid columns
 * and symptom/episode IDs, and preset registry consistency.
 */

import { describe, it, expect } from 'vitest';
import {
	presets,
	epilepsy,
	adhd,
	diabetes,
	burnout,
	migraine,
	custom,
	chronic_pain,
	ms,
	anxiety_depression,
	ibs,
	asthma,
	endometriosis,
	cancer_treatment,
	dermatology,
	autism,
	cardiovascular,
	hypertension,
	long_covid,
	menopause,
	bipolar,
	glaucoma,
	parkinson,
	ibd,
	pcos,
	hashimoto,
	rheumatoid_arthritis,
} from './presets';
import type { Blueprint } from './types';

// EVERY exported blueprint, not a hand-picked sample.
//
// This map used to list six of the twenty-six presets while the suite below
// was titled "all presets have required fields". The twenty that arrived
// after those six — ms, ibs, bipolar, pcos, hashimoto and the rest — were
// never shape-checked at all. Found 2026-08-21 while removing `streamFilters`:
// the removal only registered as six lost tests, which is what exposed the gap.
//
// Keep this exhaustive. A preset that is not in here is a preset nothing
// validates.
const allBlueprints: Record<string, Blueprint> = {
	epilepsy,
	adhd,
	diabetes,
	burnout,
	migraine,
	custom,
	chronic_pain,
	ms,
	anxiety_depression,
	ibs,
	asthma,
	endometriosis,
	cancer_treatment,
	dermatology,
	autism,
	cardiovascular,
	hypertension,
	long_covid,
	menopause,
	bipolar,
	glaucoma,
	parkinson,
	ibd,
	pcos,
	hashimoto,
	rheumatoid_arthritis,
};

// ---------------------------------------------------------------------------
// Required fields on every preset
// ---------------------------------------------------------------------------

describe('all presets have required fields', () => {
    for (const [name, bp] of Object.entries(allBlueprints)) {
        describe(name, () => {
            it('has conditionId', () => {
                expect(bp.conditionId).toBeTruthy();
                expect(typeof bp.conditionId).toBe('string');
            });

            it('has version', () => {
                expect(bp.version).toBeGreaterThanOrEqual(1);
            });

            it('has accentColor as hex', () => {
                expect(bp.accentColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
            });

            it('has symptomGroups array', () => {
                expect(Array.isArray(bp.symptomGroups)).toBe(true);
                expect(bp.symptomGroups.length).toBeGreaterThanOrEqual(1);
            });

            it('has episodeTypes array', () => {
                expect(Array.isArray(bp.episodeTypes)).toBe(true);
            });

            it('has triggers array', () => {
                expect(Array.isArray(bp.triggers)).toBe(true);
            });

            it('has vitals array', () => {
                expect(Array.isArray(bp.vitals)).toBe(true);
            });

            it('has medications array', () => {
                expect(Array.isArray(bp.medications)).toBe(true);
            });

            it('has gridSymptomColumns array', () => {
                expect(Array.isArray(bp.gridSymptomColumns)).toBe(true);
            });

            it('has gridEpisodeColumns array', () => {
                expect(Array.isArray(bp.gridEpisodeColumns)).toBe(true);
            });
        });
    }
});

// ---------------------------------------------------------------------------
// Symptom group items have id + label
// ---------------------------------------------------------------------------

describe('symptom group items are well-formed', () => {
    for (const [name, bp] of Object.entries(allBlueprints)) {
        it(`${name}: every symptom item has id and label`, () => {
            for (const group of bp.symptomGroups) {
                expect(group.id).toBeTruthy();
                expect(group.label).toBeTruthy();
                for (const item of group.items) {
                    expect(item.id).toBeTruthy();
                    expect(item.label).toBeTruthy();
                }
            }
        });
    }
});

// ---------------------------------------------------------------------------
// Episode types have color
// ---------------------------------------------------------------------------

describe('episode types are well-formed', () => {
    for (const [name, bp] of Object.entries(allBlueprints)) {
        it(`${name}: every episode type has id, label, and hex color`, () => {
            for (const ep of bp.episodeTypes) {
                expect(ep.id).toBeTruthy();
                expect(ep.label).toBeTruthy();
                expect(ep.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
            }
        });
    }
});

// ---------------------------------------------------------------------------
// Grid columns reference valid symptom / episode IDs
// ---------------------------------------------------------------------------

describe('gridSymptomColumns reference valid symptom IDs', () => {
    for (const [name, bp] of Object.entries(allBlueprints)) {
        it(`${name}: all gridSymptomColumns exist in symptomGroups`, () => {
            const allSymptomIds = new Set(
                bp.symptomGroups.flatMap((g) => g.items.map((i) => i.id))
            );
            for (const colId of bp.gridSymptomColumns) {
                expect(allSymptomIds.has(colId)).toBe(true);
            }
        });
    }
});

describe('gridEpisodeColumns reference valid episode type IDs', () => {
    for (const [name, bp] of Object.entries(allBlueprints)) {
        it(`${name}: all gridEpisodeColumns exist in episodeTypes`, () => {
            const allEpisodeIds = new Set(bp.episodeTypes.map((e) => e.id));
            for (const colId of bp.gridEpisodeColumns) {
                expect(allEpisodeIds.has(colId)).toBe(true);
            }
        });
    }
});

// ---------------------------------------------------------------------------
// Preset registry consistency
// ---------------------------------------------------------------------------

describe('preset registry', () => {
    // Three blueprints are defined but deliberately not offered: product
    // review pulled them, and presets.ts keeps the definitions for a possible
    // re-enable. Naming them here means dropping a preset from the registry
    // by accident fails this test instead of passing unnoticed.
    const SHELVED = ['autism', 'cardiovascular', 'dermatology'];

    it('offers every exported blueprint except the shelved ones', () => {
        const registryIds = new Set(presets.map((p) => p.id));
        const missing = Object.keys(allBlueprints).filter((n) => !registryIds.has(n));
        expect(missing.sort()).toEqual([...SHELVED].sort());
    });

    it('every preset has id, labelKey, descriptionKey, icon, color, and blueprint', () => {
        for (const p of presets) {
            expect(p.id).toBeTruthy();
            expect(p.labelKey).toBeTruthy();
            expect(p.descriptionKey).toBeTruthy();
            expect(p.icon).toBeTruthy();
            expect(p.color).toMatch(/^#/);
            expect(p.blueprint).toBeDefined();
            expect(p.blueprint.conditionId).toBe(p.id);
        }
    });

    it('no duplicate preset IDs', () => {
        const ids = presets.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

// ---------------------------------------------------------------------------
// No duplicate IDs within a single blueprint
// ---------------------------------------------------------------------------

describe('no duplicate IDs within a blueprint', () => {
    for (const [name, bp] of Object.entries(allBlueprints)) {
        it(`${name}: symptom IDs are unique across all groups`, () => {
            const ids = bp.symptomGroups.flatMap((g) => g.items.map((i) => i.id));
            expect(new Set(ids).size).toBe(ids.length);
        });

        it(`${name}: episode type IDs are unique`, () => {
            const ids = bp.episodeTypes.map((e) => e.id);
            expect(new Set(ids).size).toBe(ids.length);
        });

        it(`${name}: trigger IDs are unique`, () => {
            const ids = bp.triggers.map((t) => t.id);
            expect(new Set(ids).size).toBe(ids.length);
        });
    }
});
