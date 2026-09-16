/**
 * `withEpisodeCountChanged` — the /reports grid's +/- on an episode cell.
 *
 * The grid edited only `episodes[id]`. EntryComposer prefers
 * `episodeInstances[id]` whenever an entry has any, so opening that day in
 * /log and saving anything put the old count back: a "+" in the grid was
 * silently reverted. The last test round-trips through the real composer.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { withEpisodeCountChanged } from './episodeCounts';
import EntryComposer from '$lib/components/EntryComposer.svelte';
import type { Blueprint } from '$lib/blueprint';

describe('withEpisodeCountChanged — entries with per-occurrence rows', () => {
	const base = {
		type: 'entry',
		date: '2026-09-01',
		episodes: { attack: 2, aura: 1 },
		episodeInstances: {
			attack: [{ time: '08:00', note: 'morning' }, { time: '19:30' }],
			aura: [{ time: '07:00' }],
		},
		episodeTimes: { attack: '08:00', aura: '07:00' },
		episodeNotes: { attack: 'morning' },
	};

	it('+1 appends an untimed row and keeps the count in step', () => {
		const next = withEpisodeCountChanged(base, 'attack', 1);
		expect(next.episodeInstances.attack).toEqual([{ time: '08:00', note: 'morning' }, { time: '19:30' }, {}]);
		expect(next.episodes.attack).toBe(3);
		// Nothing else moves.
		expect(next.episodes.aura).toBe(1);
		expect(next.episodeTimes).toEqual(base.episodeTimes);
		expect(next.episodeNotes).toEqual(base.episodeNotes);
	});

	it('-1 removes the last UNTIMED row first — a grid "+" is undone by a grid "-"', () => {
		const plus = withEpisodeCountChanged(base, 'attack', 1);
		const minus = withEpisodeCountChanged(plus, 'attack', -1);
		expect(minus.episodeInstances.attack).toEqual(base.episodeInstances.attack);
		expect(minus.episodes.attack).toBe(2);
	});

	it('-1 with every row timed removes the last row', () => {
		const next = withEpisodeCountChanged(base, 'attack', -1);
		expect(next.episodeInstances.attack).toEqual([{ time: '08:00', note: 'morning' }]);
		expect(next.episodes.attack).toBe(1);
	});

	it('removing the first row refreshes the first-occurrence mirrors, and a noted row the note', () => {
		const one = { ...base, episodeInstances: { ...base.episodeInstances, attack: [{ time: '08:00', note: 'morning' }] }, episodes: { ...base.episodes, attack: 1 } };
		const next = withEpisodeCountChanged(one, 'attack', -1);
		expect(next.episodeInstances.attack).toBeUndefined();
		expect(next.episodes.attack).toBeUndefined();
		expect(next.episodeTimes.attack).toBe('');
		expect(next.episodeNotes.attack).toBe('');
		expect(next.episodeInstances.aura).toEqual([{ time: '07:00' }]);
	});

	it('does not mutate its input', () => {
		const snapshot = JSON.parse(JSON.stringify(base));
		withEpisodeCountChanged(base, 'attack', 1);
		withEpisodeCountChanged(base, 'attack', -1);
		expect(base).toEqual(snapshot);
	});
});

describe('withEpisodeCountChanged — count-only entries', () => {
	it('changes the count and leaves the entry count-only', () => {
		const legacy = { type: 'entry', date: '2026-09-01', episodes: { attack: 1 } };
		const next = withEpisodeCountChanged(legacy, 'attack', 1);
		expect(next.episodes.attack).toBe(2);
		expect(next.episodeInstances).toBeUndefined();
		expect(withEpisodeCountChanged(next, 'attack', -1).episodes.attack).toBe(1);
	});

	it('returns null when there is nothing to remove', () => {
		expect(withEpisodeCountChanged({ type: 'entry', episodes: {} }, 'attack', -1)).toBeNull();
	});

	it('carries a legacy `seizures` map into `episodes` whole', () => {
		const next = withEpisodeCountChanged({ type: 'entry', seizures: { focal: 2, generalized: 1 } }, 'focal', 1);
		expect(next.episodes).toEqual({ focal: 3, generalized: 1 });
	});
});

describe('/reports grid wiring', () => {
	it('every grid edit goes through the per-day queue, and episodes through withEpisodeCountChanged', async () => {
		const { readFileSync } = await import('node:fs');
		const { join } = await import('node:path');
		const src = readFileSync(join(__dirname, '..', '..', 'routes', 'reports', '+page.svelte'), 'utf8');
		for (const fn of ['toggleGridSymptom', 'toggleGridTrigger', 'incrementGridEpisode', 'decrementGridEpisode']) {
			expect(src, fn).toMatch(new RegExp(`function ${fn}\\([^)]*\\) \\{\\s*return onGridDay\\(dayStr,`));
		}
		expect(src).toMatch(/withEpisodeCountChanged\(existing\.data, episodeId, 1\)/);
		expect(src).toMatch(/withEpisodeCountChanged\(existing\.data, episodeId, -1\)/);
	});
});

describe('the next /log save keeps what the grid changed', () => {
	const bp: Blueprint = {
		version: 1,
		conditionId: 'test',
		conditionLabel: 'Test',
		accentColor: '#000',
		symptomGroups: [],
		episodeTypes: [{ id: 'attack', label: 'ep.attack', color: '#f00', trackTimeOfDay: true }],
		triggers: [],
		vitals: [],
		medications: [],
		gridSymptomColumns: [],
		gridEpisodeColumns: ['attack'],
		reportPreference: 'analytics',
	} as unknown as Blueprint;

	it('a grid "+" on an entry with rows survives opening and saving the day', async () => {
		const stored = {
			type: 'entry',
			date: '2026-09-01',
			episodes: { attack: 1 },
			episodeInstances: { attack: [{ time: '08:00' }] },
		};
		const afterGrid = withEpisodeCountChanged(stored, 'attack', 1);
		const onSave = vi.fn().mockResolvedValue(true);
		const { container } = render(EntryComposer, {
			props: {
				date: '2026-09-01',
				bp,
				existingDoc: { id: 1, serverCreatedAt: '2026-09-01T10:00:00Z', data: afterGrid },
				previousDoc: null,
				isToday: false,
				recentDocs: [],
				onSave,
				onDelete: vi.fn(),
				onDateChange: vi.fn(),
				onJumpToToday: vi.fn(),
			},
		});
		const ta = container.querySelector('textarea') as HTMLTextAreaElement;
		await fireEvent.input(ta, { target: { value: 'unrelated edit' } });
		await fireEvent.click(container.querySelector('.log-btn-save') as HTMLButtonElement);
		await waitFor(() => expect(onSave).toHaveBeenCalled());
		expect(onSave.mock.calls[0][0].episodes.attack).toBe(2);
		expect(onSave.mock.calls[0][0].episodeInstances.attack).toHaveLength(2);
	});
});
