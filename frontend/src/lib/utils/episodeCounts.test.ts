/**
 * ciphra — episode-counting helpers tests (CIPH-741).
 *
 * Covers date-window inclusivity, empty-doc edge cases, and back-compat
 * with the legacy `seizures` key alongside the canonical `episodes`.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { countEpisodesInWindow, totalEpisodesInWindow, daysWithEpisodes } from './episodeCounts';
import type { CiphraDocument } from '$lib/stores/documents';

let nextId = 1;
function entry(date: string, episodes: Record<string, number>, key: 'episodes' | 'seizures' = 'episodes'): CiphraDocument {
    return {
        id: nextId++,
        serverCreatedAt: '2026-04-14T00:00:00Z',
        data: { type: 'entry', date, [key]: episodes },
    } as CiphraDocument;
}

function event(date: string): CiphraDocument {
    return {
        id: nextId++,
        serverCreatedAt: '2026-04-14T00:00:00Z',
        data: { type: 'event', date, title: 'X' },
    } as CiphraDocument;
}

const IDS = ['focal', 'generalized'];
const START = '2026-01-01';
const END = '2026-01-31';

describe('countEpisodesInWindow', () => {
    it('returns zeros for empty docs', () => {
        expect(countEpisodesInWindow([], IDS, START, END)).toEqual({ focal: 0, generalized: 0 });
    });

    it('sums episodes within the window', () => {
        const docs = [
            entry('2026-01-05', { focal: 2, generalized: 1 }),
            entry('2026-01-12', { focal: 1 }),
        ];
        expect(countEpisodesInWindow(docs, IDS, START, END)).toEqual({ focal: 3, generalized: 1 });
    });

    it('is inclusive at both start and end', () => {
        const docs = [
            entry('2026-01-01', { focal: 1 }),
            entry('2026-01-31', { focal: 1 }),
        ];
        expect(countEpisodesInWindow(docs, IDS, START, END)).toEqual({ focal: 2, generalized: 0 });
    });

    it('excludes docs outside window', () => {
        const docs = [
            entry('2025-12-31', { focal: 10 }),
            entry('2026-02-01', { focal: 10 }),
            entry('2026-01-15', { focal: 1 }),
        ];
        expect(countEpisodesInWindow(docs, IDS, START, END)).toEqual({ focal: 1, generalized: 0 });
    });

    it('ignores non-entry docs (events)', () => {
        const docs = [event('2026-01-10'), entry('2026-01-10', { focal: 1 })];
        expect(countEpisodesInWindow(docs, IDS, START, END)).toEqual({ focal: 1, generalized: 0 });
    });

    it('supports legacy `seizures` key (back-compat)', () => {
        const docs = [entry('2026-01-10', { focal: 2 }, 'seizures')];
        expect(countEpisodesInWindow(docs, IDS, START, END)).toEqual({ focal: 2, generalized: 0 });
    });

    it('ignores docs with missing / blank date', () => {
        const docs: CiphraDocument[] = [
            { id: 99, serverCreatedAt: 'x', data: { type: 'entry', episodes: { focal: 5 } } } as CiphraDocument,
        ];
        expect(countEpisodesInWindow(docs, IDS, START, END)).toEqual({ focal: 0, generalized: 0 });
    });
});

describe('totalEpisodesInWindow', () => {
    it('sums across all episode ids', () => {
        const docs = [entry('2026-01-05', { focal: 2, generalized: 3 })];
        expect(totalEpisodesInWindow(docs, IDS, START, END)).toBe(5);
    });

    it('returns 0 for empty docs', () => {
        expect(totalEpisodesInWindow([], IDS, START, END)).toBe(0);
    });
});

describe('daysWithEpisodes', () => {
    it('returns empty set when no docs', () => {
        expect(daysWithEpisodes([], IDS, START, END).size).toBe(0);
    });

    it('returns distinct dates with at least one relevant episode', () => {
        const docs = [
            entry('2026-01-05', { focal: 1 }),
            entry('2026-01-05', { generalized: 2 }),
            entry('2026-01-10', { focal: 1 }),
        ];
        const days = daysWithEpisodes(docs, IDS, START, END);
        expect(days.size).toBe(2);
        expect(days.has('2026-01-05')).toBe(true);
        expect(days.has('2026-01-10')).toBe(true);
    });

    it('does not count days where all relevant ids are zero', () => {
        const docs = [entry('2026-01-05', { focal: 0, generalized: 0 })];
        expect(daysWithEpisodes(docs, IDS, START, END).size).toBe(0);
    });

    it('respects window bounds', () => {
        const docs = [
            entry('2025-12-31', { focal: 1 }),
            entry('2026-02-01', { focal: 1 }),
        ];
        expect(daysWithEpisodes(docs, IDS, START, END).size).toBe(0);
    });

    it('back-compat: legacy `seizures` key also counts', () => {
        const docs = [entry('2026-01-10', { focal: 1 }, 'seizures')];
        expect(daysWithEpisodes(docs, IDS, START, END).has('2026-01-10')).toBe(true);
    });
});
