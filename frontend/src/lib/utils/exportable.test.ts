/**
 * ciphra — isExportable predicate tests (CIPH-741).
 *
 * Guards the privacy boundary: diary docs and private-flagged docs must
 * never be eligible for export (PDF / CSV / share link / reports).
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { isExportable } from './exportable';
import type { CiphraDocument } from '$lib/stores/documents';

function doc(data: unknown): CiphraDocument {
    return { id: 1, serverCreatedAt: '2026-04-14T00:00:00Z', data } as CiphraDocument;
}

describe('isExportable', () => {
    it('returns true for a normal entry', () => {
        expect(isExportable(doc({ type: 'entry', date: '2026-04-14' }))).toBe(true);
    });

    it('returns true for a normal event', () => {
        expect(isExportable(doc({ type: 'event', date: '2026-04-14', title: 'MRI' }))).toBe(true);
    });

    it('returns false when type is diary', () => {
        expect(isExportable(doc({ type: 'diary', date: '2026-04-14', text: 'x' }))).toBe(false);
    });

    it('returns false when data.private === true (entry)', () => {
        expect(isExportable(doc({ type: 'entry', date: '2026-04-14', private: true }))).toBe(false);
    });

    it('returns false when data.private === true (event)', () => {
        expect(isExportable(doc({ type: 'event', date: '2026-04-14', title: 'X', private: true }))).toBe(false);
    });

    it('returns true when data.private is a non-true truthy (strict ===)', () => {
        // guard against loose checks: 'true' string must NOT mark private
        expect(isExportable(doc({ type: 'entry', private: 'true' }))).toBe(true);
        expect(isExportable(doc({ type: 'entry', private: 1 }))).toBe(true);
    });

    it('returns false for null / undefined doc', () => {
        expect(isExportable(null)).toBe(false);
        expect(isExportable(undefined)).toBe(false);
    });

    it('returns false when data is missing', () => {
        expect(isExportable({ data: null } as unknown as CiphraDocument)).toBe(false);
        expect(isExportable({} as unknown as CiphraDocument)).toBe(false);
    });

    it('diary flag dominates even if private is false', () => {
        expect(isExportable(doc({ type: 'diary', private: false }))).toBe(false);
    });
});
