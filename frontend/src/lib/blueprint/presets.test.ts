/**
 * ciphra — Blueprint presets tests.
 *
 * Validates structural invariants across all presets:
 * required fields, cross-references between grid columns
 * and symptom/episode IDs, and preset registry consistency.
 */

import { describe, it, expect } from 'vitest';
import { presets, epilepsy, adhd, diabetes, burnout, migraine, custom } from './presets';
import type { Blueprint } from './types';

// All exported blueprint objects for iteration
const allBlueprints: Record<string, Blueprint> = {
    epilepsy,
    adhd,
    diabetes,
    burnout,
    migraine,
    custom,
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

            it('has streamFilters array', () => {
                expect(Array.isArray(bp.streamFilters)).toBe(true);
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
    it('contains all exported blueprints', () => {
        const registryIds = new Set(presets.map((p) => p.id));
        for (const name of Object.keys(allBlueprints)) {
            expect(registryIds.has(name)).toBe(true);
        }
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
