/**
 * The journal's narrative feed.
 *
 * The contract: a day appears because someone WROTE something. Measured
 * values do not put a day in this list and are not repeated on it — that is
 * /reports. Episodes ride along as context on a written day, and never make
 * an unwritten day appear.
 */
import { describe, it, expect } from 'vitest';
import { buildNarrative, groupByMonth, textOf } from './narrative';

const bp = {
	episodeTypes: [
		{ id: 'migraine_aura', label: 'ep.migraine_aura' },
		{ id: 'tension', label: 'ep.tension' },
	],
} as any;

let nextId = 1;
const doc = (data: Record<string, unknown>) => ({ id: nextId++, serverCreatedAt: '', data }) as any;
const entry = (date: string, extra: Record<string, unknown> = {}) =>
	doc({ type: 'entry', date, ...extra });

describe('textOf — what counts as writing', () => {
	it('takes the notes field of an entry', () => {
		expect(textOf(entry('2025-03-04', { notes: 'Aura zuerst' }))?.kind).toBe('note');
	});

	it('ignores an entry that only holds measurements', () => {
		expect(textOf(entry('2025-03-04', { vitals: { mood: 7 }, episodes: { tension: 1 } }))).toBeNull();
	});

	it('takes diary text', () => {
		const t = textOf(doc({ type: 'diary', date: '2025-03-04', text: 'Langer Tag' }));
		expect(t?.kind).toBe('diary');
		expect(t?.text).toBe('Langer Tag');
	});

	it('prefers a marker title over its prose', () => {
		// The epilepc migration puts the short human title in `title` and the
		// long description in `notes` — same preference the PDF applies.
		const t = textOf(doc({ type: 'event', date: '2025-03-04', title: 'Dosis erhöht', notes: 'Langer Fliesstext …' }));
		expect(t?.text).toBe('Dosis erhöht');
	});

	it('rejects a rescue-medication event — a record, not prose', () => {
		expect(textOf(doc({ type: 'event', kind: 'medication', date: '2025-03-04', notes: 'x' }))).toBeNull();
	});

	it('treats whitespace as nothing written', () => {
		expect(textOf(entry('2025-03-04', { notes: '   \n\t ' }))).toBeNull();
	});

	it('collapses internal whitespace', () => {
		expect(textOf(entry('2025-03-04', { notes: 'zwei   Zeilen\numgebrochen' }))?.text)
			.toBe('zwei Zeilen umgebrochen');
	});

	it('rejects a malformed date', () => {
		expect(textOf(entry('2025-3-4', { notes: 'x' }))).toBeNull();
	});
});

describe('buildNarrative — only written days appear', () => {
	const docs = [
		entry('2025-03-01', { vitals: { mood: 7 } }),                       // silent
		entry('2025-03-02', { notes: 'Kopfschmerz ab Mittag' }),            // written
		entry('2025-03-03', { episodes: { tension: 2 } }),                  // episode, no text
		doc({ type: 'diary', date: '2025-03-04', text: 'Langer Tag' }),     // written
	];

	it('lists exactly the days that hold writing', () => {
		expect(buildNarrative(docs, bp).map((d) => d.dayKey)).toEqual(['2025-03-04', '2025-03-02']);
	});

	it('an episode alone does not put a day in the journal', () => {
		// It is real data, and it belongs to the calendar and /reports. Letting
		// it in here would rebuild the metric list this view replaced.
		expect(buildNarrative(docs, bp).map((d) => d.dayKey)).not.toContain('2025-03-03');
	});

	it('newest day first', () => {
        const got = buildNarrative(docs, bp);
		expect(got[0].dayKey > got[1].dayKey).toBe(true);
	});

	it('tolerates null input', () => {
		expect(buildNarrative(null, bp)).toEqual([]);
		expect(buildNarrative(undefined, null)).toEqual([]);
	});
});

describe('episodes are context, not content', () => {
	it('a written day carries the episodes recorded that day', () => {
		const docs = [entry('2025-03-02', { notes: 'Aura zuerst', episodes: { migraine_aura: 1 } })];
		const [day] = buildNarrative(docs, bp);
		expect(day.episodes).toEqual([
			{ id: 'migraine_aura', label: 'ep.migraine_aura', isCustom: false, count: 1 },
		]);
	});

	it('context survives when the writing lives on a SEPARATE document', () => {
		// The note is a diary doc; the episode is on that day's entry. The day
		// qualifies through the diary and must still show the attack.
		const docs = [
			entry('2025-03-02', { episodes: { migraine_aura: 1 } }),
			doc({ type: 'diary', date: '2025-03-02', text: 'Kaum geschlafen' }),
		];
		const [day] = buildNarrative(docs, bp);
		expect(day.texts).toHaveLength(1);
		expect(day.episodes.map((e) => e.id)).toEqual(['migraine_aura']);
	});

	it('sums a repeated episode across a day', () => {
		const docs = [
			entry('2025-03-02', { notes: 'a', episodes: { tension: 1 } }),
			entry('2025-03-02', { episodes: { tension: 2 } }),
		];
		expect(buildNarrative(docs, bp)[0].episodes[0].count).toBe(3);
	});

	it('reports no episodes when the blueprint declares none', () => {
		const docs = [entry('2025-03-02', { notes: 'a', episodes: { tension: 1 } })];
		expect(buildNarrative(docs, null)[0].episodes).toEqual([]);
	});
});

describe('filters', () => {
	const docs = [
		entry('2025-01-10', { notes: 'Schlecht geschlafen' }),
		doc({ type: 'diary', date: '2025-02-14', text: 'Guter Tag im Garten' }),
		doc({ type: 'event', date: '2025-03-20', title: 'Dosis erhöht' }),
		entry('2025-04-02', { notes: 'Attacke morgens', episodes: { migraine_aura: 1 } }),
	];

	it('free text matches the writing, case-insensitively', () => {
		expect(buildNarrative(docs, bp, { query: 'GARTEN' }).map((d) => d.dayKey)).toEqual(['2025-02-14']);
	});

	it('kind narrows to one sort of writing', () => {
		expect(buildNarrative(docs, bp, { kind: 'marker' }).map((d) => d.dayKey)).toEqual(['2025-03-20']);
		expect(buildNarrative(docs, bp, { kind: 'diary' }).map((d) => d.dayKey)).toEqual(['2025-02-14']);
	});

	it("'all' is the same as no kind filter", () => {
		expect(buildNarrative(docs, bp, { kind: 'all' })).toHaveLength(4);
	});

	it('withEpisodeOnly narrows, it never widens', () => {
		const got = buildNarrative(docs, bp, { withEpisodeOnly: true });
		expect(got.map((d) => d.dayKey)).toEqual(['2025-04-02']);
		// and still only written days — an episode-only day stays out
		const withSilentEpisode = [...docs, entry('2025-05-05', { episodes: { tension: 9 } })];
		expect(buildNarrative(withSilentEpisode, bp, { withEpisodeOnly: true }).map((d) => d.dayKey))
			.toEqual(['2025-04-02']);
	});

	it('date bounds are inclusive', () => {
		const got = buildNarrative(docs, bp, { fromISO: '2025-02-14', toISO: '2025-03-20' });
		expect(got.map((d) => d.dayKey)).toEqual(['2025-03-20', '2025-02-14']);
	});

	it('combines filters', () => {
		expect(buildNarrative(docs, bp, { query: 'attacke', withEpisodeOnly: true }).map((d) => d.dayKey))
			.toEqual(['2025-04-02']);
	});
});

describe('ordering within a day', () => {
	it('newest moment first, untimed writing last', () => {
		const docs = [
			doc({ type: 'diary', date: '2025-03-02', text: 'ohne Zeit' }),
			doc({ type: 'event', date: '2025-03-02', time: '08:15', title: 'früh' }),
			doc({ type: 'event', date: '2025-03-02', time: '19:40', title: 'spät' }),
		];
		expect(buildNarrative(docs, bp)[0].texts.map((t) => t.text)).toEqual(['spät', 'früh', 'ohne Zeit']);
	});
});

describe('groupByMonth', () => {
	it('buckets consecutive days and preserves order', () => {
		const docs = [
			entry('2025-03-02', { notes: 'a' }),
			entry('2025-03-20', { notes: 'b' }),
			entry('2025-04-02', { notes: 'c' }),
		];
		const got = groupByMonth(buildNarrative(docs, bp));
		expect(got.map((m) => m.monthKey)).toEqual(['2025-04', '2025-03']);
		expect(got[1].days.map((d) => d.dayKey)).toEqual(['2025-03-20', '2025-03-02']);
	});

	it('is empty for an empty narrative', () => {
		expect(groupByMonth([])).toEqual([]);
	});
});
