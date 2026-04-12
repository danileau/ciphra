/**
 * ciphra — Document store tests.
 *
 * The store relies heavily on Svelte runtime ($app/environment, etc.)
 * and the crypto module, so we focus on interface shape and basic
 * import validation rather than full integration testing.
 */

import { describe, it, expect } from 'vitest';
import type { CiphraDocument } from './documents';

// ---------------------------------------------------------------------------
// CiphraDocument interface shape
// ---------------------------------------------------------------------------

describe('CiphraDocument interface', () => {
    it('satisfies the expected shape with required fields', () => {
        const doc: CiphraDocument = {
            id: 1,
            serverCreatedAt: '2026-04-04T12:00:00Z',
            data: { type: 'daily_log', date: '2026-04-04', symptoms: ['tired'] },
        };
        expect(doc.id).toBe(1);
        expect(doc.serverCreatedAt).toBe('2026-04-04T12:00:00Z');
        expect(doc.data).toBeDefined();
        expect(doc.data.type).toBe('daily_log');
    });

    it('data field accepts any shape (opaque encrypted blob)', () => {
        const doc: CiphraDocument = {
            id: 2,
            serverCreatedAt: '2026-04-04T12:00:00Z',
            data: 'could be a string too',
        };
        expect(typeof doc.data).toBe('string');
    });

    it('data field accepts null', () => {
        const doc: CiphraDocument = {
            id: 3,
            serverCreatedAt: '2026-04-04T12:00:00Z',
            data: null,
        };
        expect(doc.data).toBeNull();
    });
});
