/**
 * ciphra — Epilepc mapping tests (CIPH-741).
 *
 * Covers the security-critical migration surface:
 *  - strict schema validation (accept v1.1, reject v1.0 / v9.9 / malformed /
 *    unknown top-level fields)
 *  - case-insensitive seizure type_name → ciphra episode key mapping
 *  - mapBundle shape for entries / events / diaries (with private:true) and
 *    appended medications
 *  - mergeMedications dedup by id
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import {
    SUPPORTED_SCHEMA_VERSION,
    validateBundle,
    mapSeizureType,
    mapBundle,
    mergeMedications,
    allSourceIds,
    defaultEpilepsyBlueprint,
    type EpilepcBundle,
} from './epilepcMapping';
import type { MedicationSlot } from '$lib/blueprint/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function minimalBundle(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        schema_version: SUPPORTED_SCHEMA_VERSION,
        exported_at: '2026-04-14T08:00:00Z',
        epilepc_decommission_at: '2026-12-31T00:00:00Z',
        epilepc_user_id: 'user-1',
        seizures: [],
        events: [],
        medications: [],
        diary: [],
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// validateBundle
// ---------------------------------------------------------------------------

describe('validateBundle', () => {
    it('accepts a minimal v1.1 bundle', () => {
        const b = validateBundle(minimalBundle());
        expect(b.schema_version).toBe('1.1');
    });

    it('rejects v1.0', () => {
        expect(() => validateBundle(minimalBundle({ schema_version: '1.0' }))).toThrow(
            'wrong_schema_version'
        );
    });

    it('rejects v9.9', () => {
        expect(() => validateBundle(minimalBundle({ schema_version: '9.9' }))).toThrow(
            'wrong_schema_version'
        );
    });

    it('rejects missing schema_version', () => {
        const b = minimalBundle();
        delete (b as Record<string, unknown>).schema_version;
        expect(() => validateBundle(b)).toThrow('wrong_schema_version');
    });

    it('rejects unknown top-level fields', () => {
        expect(() => validateBundle(minimalBundle({ extra: 'nope' }))).toThrow(/unknown_field:extra/);
    });

    it('rejects null', () => {
        expect(() => validateBundle(null)).toThrow('bundle_not_object');
    });

    it('rejects array', () => {
        expect(() => validateBundle([])).toThrow('bundle_not_object');
    });

    it('rejects non-object (string)', () => {
        expect(() => validateBundle('bundle' as unknown)).toThrow('bundle_not_object');
    });

    it('rejects when seizures is not an array', () => {
        expect(() => validateBundle(minimalBundle({ seizures: {} }))).toThrow('bad_seizures');
    });

    it('rejects when events is not an array', () => {
        expect(() => validateBundle(minimalBundle({ events: 'nope' }))).toThrow('bad_events');
    });

    it('rejects bad exported_at', () => {
        expect(() => validateBundle(minimalBundle({ exported_at: 123 }))).toThrow('bad_exported_at');
    });

    it('rejects bad epilepc_user_id', () => {
        expect(() => validateBundle(minimalBundle({ epilepc_user_id: null }))).toThrow('bad_user_id');
    });
});

// ---------------------------------------------------------------------------
// mapSeizureType
// ---------------------------------------------------------------------------

describe('mapSeizureType', () => {
    it('maps focal variants (case-insensitive)', () => {
        expect(mapSeizureType('Focal')).toBe('focal');
        expect(mapSeizureType('FOCAL aware')).toBe('focal');
        expect(mapSeizureType('fokal')).toBe('focal');
    });

    it('maps generalized / GTC / tonic-clonic', () => {
        expect(mapSeizureType('Generalized')).toBe('generalized');
        expect(mapSeizureType('GTC')).toBe('generalized');
        expect(mapSeizureType('tonic-clonic')).toBe('generalized');
        expect(mapSeizureType('Generalisiert tonisch-klonisch')).toBe('generalized');
    });

    it('maps absence', () => {
        expect(mapSeizureType('Absence')).toBe('absence');
        expect(mapSeizureType('ABSENZ')).toBe('absence');
    });

    it('maps myoclonic (reorder fix — myoclonic tested before clonic/klonisch)', () => {
        // Fix: the myoclonic branch now runs BEFORE the generalized branch,
        // so 'Myoclonic' / 'myoklonisch' correctly map to 'myoclonic' rather
        // than being swallowed by the 'clonic' / 'klonisch' substring check.
        expect(mapSeizureType('Myoclonic')).toBe('myoclonic');
        expect(mapSeizureType('myoklonisch')).toBe('myoclonic');
    });

    it('maps null / undefined / empty to unknown', () => {
        expect(mapSeizureType(null)).toBe('unknown');
        expect(mapSeizureType(undefined)).toBe('unknown');
        expect(mapSeizureType('')).toBe('unknown');
    });

    it('maps unrecognized strings to unknown (edge)', () => {
        expect(mapSeizureType('something weird')).toBe('unknown');
        expect(mapSeizureType('partial')).toBe('unknown');
    });
});

// ---------------------------------------------------------------------------
// mapBundle shape
// ---------------------------------------------------------------------------

describe('mapBundle', () => {
    const bundle: EpilepcBundle = {
        schema_version: '1.1',
        exported_at: '2026-04-14T08:00:00Z',
        epilepc_decommission_at: '2026-12-31T00:00:00Z',
        epilepc_user_id: 'u-1',
        seizures: [
            { epilepc_id: 's1', date: '2026-01-02', time: '08:30', type_name: 'Focal', notes: 'aura' },
            { epilepc_id: 's2', date: '2026-01-03', type_name: null, notes: null },
        ],
        events: [{ epilepc_id: 'e1', date: '2026-01-05', title: 'MRI', notes: 'clear' }],
        medications: [
            {
                epilepc_id: 'm1',
                name: 'Keppra',
                dose: '500mg',
                notes: '2x/day',
                as_needed: false,
                started_at: '2025-06-01',
                ended_at: null,
            },
        ],
        diary: [
            { epilepc_id: 'd1', date: '2026-01-06', time: '20:00', text: 'rough day' },
        ],
    };

    const mapped = mapBundle(bundle);

    it('entries carry type:entry, date, episodes map, source marker', () => {
        expect(mapped.entries).toHaveLength(2);
        const e1 = mapped.entries[0];
        expect(e1.type).toBe('entry');
        expect(e1.date).toBe('2026-01-02');
        expect(e1.episodes).toEqual({ focal: 1 });
        expect(e1.source).toBe('epilepc');
        expect(e1.source_id).toBe('s-s1');
        expect(e1.time).toBe('08:30');
        expect(e1.notes).toBe('aura');
    });

    // CIPH-760 — preserve raw epilepc type_name (granularity like
    // "Fokal rechts", "Absence mit Sturz") alongside the coarse ciphra key.
    it('preserves epilepc_original_type on mapped entries when type_name present', () => {
        expect(mapped.entries[0].epilepc_original_type).toBe('Focal');
    });

    it('omits epilepc_original_type when source type_name is null/empty', () => {
        expect(mapped.entries[1].epilepc_original_type).toBeUndefined();
    });

    it('preserves custom granular type_name strings verbatim', () => {
        const customBundle: EpilepcBundle = {
            schema_version: '1.1',
            exported_at: '2026-04-14T08:00:00Z',
            epilepc_decommission_at: '2026-12-31T00:00:00Z',
            epilepc_user_id: 'u-2',
            seizures: [
                { epilepc_id: 'c1', date: '2026-01-01', type_name: 'Fokal rechts', notes: null },
                { epilepc_id: 'c2', date: '2026-01-02', type_name: 'Fokal links', notes: null },
                { epilepc_id: 'c3', date: '2026-01-03', type_name: 'Absence mit Sturz', notes: null },
            ],
            events: [],
            medications: [],
            diary: [],
        };
        const m = mapBundle(customBundle);
        expect(m.entries[0].epilepc_original_type).toBe('Fokal rechts');
        expect(m.entries[0].episodes).toEqual({ focal: 1 });
        expect(m.entries[1].epilepc_original_type).toBe('Fokal links');
        expect(m.entries[1].episodes).toEqual({ focal: 1 });
        expect(m.entries[2].epilepc_original_type).toBe('Absence mit Sturz');
        expect(m.entries[2].episodes).toEqual({ absence: 1 });
    });

    it('entry with null type_name maps to unknown', () => {
        expect(mapped.entries[1].episodes).toEqual({ unknown: 1 });
    });

    it('entries omit time/notes when missing', () => {
        expect(mapped.entries[1].time).toBeUndefined();
        expect(mapped.entries[1].notes).toBeUndefined();
    });

    it('events carry title + notes (notes default to empty string)', () => {
        expect(mapped.events).toHaveLength(1);
        expect(mapped.events[0].type).toBe('event');
        expect(mapped.events[0].title).toBe('MRI');
        expect(mapped.events[0].notes).toBe('clear');
        expect(mapped.events[0].source_id).toBe('e-e1');
    });

    // CIPH-760 — title (epilepc `name`) and notes (epilepc `description`)
    // must stay separate fields; prior code risked concatenating them.
    it('keeps event title and notes as separate fields (no concatenation)', () => {
        const b2: EpilepcBundle = {
            ...bundle,
            events: [
                {
                    epilepc_id: 'eX',
                    date: '2026-02-01',
                    title: 'Neurology follow-up',
                    notes: 'Discussed dose adjustment and sleep hygiene.',
                },
            ],
        };
        const m2 = mapBundle(b2);
        expect(m2.events[0].title).toBe('Neurology follow-up');
        expect(m2.events[0].notes).toBe('Discussed dose adjustment and sleep hygiene.');
        // Neither field should have leaked into the other.
        expect(String(m2.events[0].title)).not.toContain('dose adjustment');
        expect(String(m2.events[0].notes)).not.toContain('Neurology follow-up');
    });

    it('event with null notes becomes empty string', () => {
        const b2 = { ...bundle, events: [{ epilepc_id: 'e9', date: '2026-01-05', title: 'X', notes: null }] };
        const m2 = mapBundle(b2);
        expect(m2.events[0].notes).toBe('');
    });

    it('diaries carry type:diary AND private:true', () => {
        expect(mapped.diaries).toHaveLength(1);
        const d = mapped.diaries[0];
        expect(d.type).toBe('diary');
        expect(d.private).toBe(true);
        expect(d.text).toBe('rough day');
        expect(d.source_id).toBe('d-d1');
    });

    it('medications are produced with prefixed id and carried fields', () => {
        expect(mapped.medications).toHaveLength(1);
        const m = mapped.medications[0];
        expect(m.id).toBe('epilepc-m-m1');
        expect(m.name).toBe('Keppra');
        expect(m.dose).toBe('500mg');
        expect(m.schedule).toBe('2x/day');
        expect(m.asNeeded).toBe(false);
    });

    it('allSourceIds covers entries + events + diaries but not medications', () => {
        const ids = allSourceIds(mapped);
        expect(ids).toEqual(['s-s1', 's-s2', 'e-e1', 'd-d1']);
    });
});

// ---------------------------------------------------------------------------
// mergeMedications
// ---------------------------------------------------------------------------

describe('mergeMedications', () => {
    const med = (id: string, name = id): MedicationSlot =>
        ({ id, name, dose: '', schedule: '', asNeeded: false } as MedicationSlot);

    it('appends incoming when no overlap', () => {
        const merged = mergeMedications([med('a')], [med('b')]);
        expect(merged.map((m) => m.id)).toEqual(['a', 'b']);
    });

    it('dedupes by id — keeps existing', () => {
        const existing = [med('a', 'keep')];
        const incoming = [med('a', 'overwrite'), med('b')];
        const merged = mergeMedications(existing, incoming);
        expect(merged).toHaveLength(2);
        expect(merged[0].name).toBe('keep');
        expect(merged[1].id).toBe('b');
    });

    it('empty inputs are handled', () => {
        expect(mergeMedications([], [])).toEqual([]);
        expect(mergeMedications([med('a')], [])).toHaveLength(1);
        expect(mergeMedications([], [med('a')])).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// defaultEpilepsyBlueprint
// ---------------------------------------------------------------------------

describe('defaultEpilepsyBlueprint', () => {
    it('returns a deep clone (mutation-safe)', () => {
        const a = defaultEpilepsyBlueprint();
        const b = defaultEpilepsyBlueprint();
        expect(a).not.toBe(b);
        (a.medications as unknown[]).push({ id: 'x', name: 'x', dose: '', schedule: '', asNeeded: false });
        expect(b.medications.length).not.toBe(a.medications.length);
    });

    it('has conditionId set to epilepsy', () => {
        const bp = defaultEpilepsyBlueprint();
        expect(bp.conditionId).toBe('epilepsy');
    });
});
