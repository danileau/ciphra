/**
 * CIPH-850 — EntryComposer primitive contract + behaviour test.
 *
 * Covers the prop boundary established when /log/[date] was extracted:
 *   - mount with minimal props (empty blueprint arrays)
 *   - existingDoc → form state hydrated, including multi-entry JSON
 *   - saveEntry → onSave receives a full EntryData payload
 *   - auto-save 3 s debounce fires onSave
 *   - Ctrl+S / ⌘+S triggers an immediate save
 *   - ArrowLeft / ArrowRight emit onDateChange(±1)
 *   - delete-confirm banner: tap delete → tap confirm → onDelete fires
 *   - multi-entry vital JSON round-trip survives a save
 *   - private toggle flips `data.private` between true and undefined
 *   - copy-previous-day merges previousDoc fields into form state
 *
 * Mounted via @testing-library/svelte; i18n loads its real store (de
 * default in jsdom). No store mocks needed — the primitive doesn't touch
 * the documents store after extraction.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import EntryComposer from './EntryComposer.svelte';
import type { Blueprint } from '$lib/blueprint';
import type { CiphraDocument } from '$lib/stores/documents';

function makeBp(overrides: Partial<Blueprint> = {}): Blueprint {
	return {
		version: 1,
		conditionId: 'test',
		conditionLabel: 'Test',
		accentColor: '#000',
		symptomGroups: [
			{ id: 'g1', label: 'group1', items: [{ id: 'tired', label: 'sym.tired' }] },
		],
		episodeTypes: [
			{ id: 'attack', label: 'ep.attack', color: '#f00', trackDuration: true, trackTimeOfDay: true },
		],
		triggers: [{ id: 'stress', label: 'trig.stress' }],
		vitals: [
			{ id: 'mood', label: 'v.mood', unit: '', placeholder: '', min: 0, max: 10 },
			{ id: 'bp_sys', label: 'v.bp_sys', unit: 'mmHg', placeholder: '120', multiEntry: true },
		],
		medications: [
			{ id: 'med1', name: 'Med1', dose: '10mg', schedule: 'morgens', asNeeded: false },
		],
		gridSymptomColumns: ['tired'],
		gridEpisodeColumns: ['attack'],
		streamFilters: [],
		reportPreference: 'analytics',
		...overrides,
	};
}

function makeDoc(data: any, id = 1): CiphraDocument {
	return { id, serverCreatedAt: '2026-04-27T10:00:00Z', data };
}

const baseProps = () => ({
	date: '2026-04-27',
	bp: makeBp(),
	existingDoc: null,
	previousDoc: null,
	isToday: true,
	recentDocs: [],
	onSave: vi.fn().mockResolvedValue(undefined),
	onDelete: vi.fn().mockResolvedValue(undefined),
	onDateChange: vi.fn(),
	onJumpToToday: vi.fn(),
});

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('CIPH-850 EntryComposer contract', () => {
	it('mounts with minimal props', () => {
		const props = baseProps();
		expect(() => render(EntryComposer, { props })).not.toThrow();
	});

	it('hydrates form from existingDoc', async () => {
		const props = {
			...baseProps(),
			existingDoc: makeDoc({
				type: 'entry',
				date: '2026-04-27',
				symptoms: { tired: true },
				episodes: { attack: 2 },
				notes: 'feeling rough',
			}),
		};
		const { container } = render(EntryComposer, { props });
		await waitFor(() => {
			const ta = container.querySelector('textarea') as HTMLTextAreaElement;
			expect(ta.value).toBe('feeling rough');
		});
	});

	it('save button calls onSave with a full EntryData payload', async () => {
		const props = baseProps();
		const { container } = render(EntryComposer, { props });
		// "save" submit button (no existingDoc → full-width Save button)
		const saveBtn = Array.from(container.querySelectorAll('button')).find(
			(b) => b.classList.contains('log-btn-save'),
		) as HTMLButtonElement;
		expect(saveBtn).toBeTruthy();
		await fireEvent.click(saveBtn);
		await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1));
		const payload = props.onSave.mock.calls[0][0];
		expect(payload.type).toBe('entry');
		expect(payload.date).toBe('2026-04-27');
		expect(payload).toHaveProperty('symptoms');
		expect(payload).toHaveProperty('episodes');
		expect(payload).toHaveProperty('vitals');
		expect(payload).toHaveProperty('medications');
		expect(payload.private).toBeUndefined();
	});

	it('auto-saves 3s after a change', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		const props = baseProps();
		const { container } = render(EntryComposer, { props });
		const ta = container.querySelector('textarea') as HTMLTextAreaElement;
		await fireEvent.input(ta, { target: { value: 'auto-save me' } });
		expect(props.onSave).not.toHaveBeenCalled();
		vi.advanceTimersByTime(3001);
		await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1));
	});

	it('Ctrl+S triggers immediate save', async () => {
		const props = baseProps();
		render(EntryComposer, { props });
		await fireEvent.keyDown(window, { key: 's', ctrlKey: true });
		await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1));
	});

	it('ArrowLeft / ArrowRight emit onDateChange', async () => {
		const props = baseProps();
		render(EntryComposer, { props });
		await fireEvent.keyDown(window, { key: 'ArrowLeft' });
		await fireEvent.keyDown(window, { key: 'ArrowRight' });
		expect(props.onDateChange).toHaveBeenCalledWith(-1);
		expect(props.onDateChange).toHaveBeenCalledWith(1);
	});

	it('arrow keys ignored while focused inside an INPUT', async () => {
		const props = baseProps();
		const { container } = render(EntryComposer, { props });
		const input = container.querySelector('input') as HTMLInputElement;
		await fireEvent.keyDown(input, { key: 'ArrowLeft' });
		expect(props.onDateChange).not.toHaveBeenCalled();
	});

	it('delete confirm flow: tap delete → tap confirm → onDelete', async () => {
		const props = {
			...baseProps(),
			existingDoc: makeDoc({ type: 'entry', date: '2026-04-27' }),
		};
		const { container } = render(EntryComposer, { props });
		const deleteBtn = container.querySelector('.log-btn-delete') as HTMLButtonElement;
		expect(deleteBtn).toBeTruthy();
		await fireEvent.click(deleteBtn);
		await waitFor(() => {
			expect(container.querySelector('.log-delete-confirm')).toBeTruthy();
		});
		const confirmBtn = container.querySelector('.log-btn-danger') as HTMLButtonElement;
		await fireEvent.click(confirmBtn);
		await waitFor(() => expect(props.onDelete).toHaveBeenCalledTimes(1));
	});

	it('multi-entry vital JSON round-trips through save', async () => {
		const props = {
			...baseProps(),
			existingDoc: makeDoc({
				type: 'entry',
				date: '2026-04-27',
				vitals: { bp_sys: '[{"time":"08:00","value":"140"}]' },
			}),
		};
		const { container } = render(EntryComposer, { props });
		await waitFor(() => {
			expect(container.querySelector('.log-multi-list')).toBeTruthy();
		});
		const saveBtn = container.querySelector('.log-btn-save') as HTMLButtonElement;
		await fireEvent.click(saveBtn);
		await waitFor(() => expect(props.onSave).toHaveBeenCalled());
		const payload = props.onSave.mock.calls[0][0];
		const parsed = JSON.parse(payload.vitals.bp_sys);
		expect(parsed).toEqual([{ time: '08:00', value: '140' }]);
	});

	it('private toggle adds `private: true` then drops it back to undefined', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		const props = baseProps();
		const { container } = render(EntryComposer, { props });
		const privateBtn = container.querySelector('button[aria-pressed]') as HTMLButtonElement;
		expect(privateBtn).toBeTruthy();
		// Toggle on, save
		await fireEvent.click(privateBtn);
		await fireEvent.click(container.querySelector('.log-btn-save') as HTMLButtonElement);
		await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(1));
		expect(props.onSave.mock.calls[0][0].private).toBe(true);
		// Saved-feedback shows for 2.5s — advance past that so the save button
		// re-renders, then query a fresh node and click.
		vi.advanceTimersByTime(2600);
		await waitFor(() => {
			expect(container.querySelector('.log-btn-save')).toBeTruthy();
		});
		await fireEvent.click(privateBtn);
		await fireEvent.click(container.querySelector('.log-btn-save') as HTMLButtonElement);
		await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(2));
		expect(props.onSave.mock.calls[1][0].private).toBeUndefined();
	});

	it('copy-previous-day merges previousDoc fields into form state', async () => {
		const props = {
			...baseProps(),
			previousDoc: makeDoc({
				type: 'entry',
				date: '2026-04-26',
				symptoms: { tired: true },
				triggers: { stress: true },
			}),
		};
		const { container } = render(EntryComposer, { props });
		const copyBtn = container.querySelector('.log-copy-prev') as HTMLButtonElement;
		expect(copyBtn).toBeTruthy();
		await fireEvent.click(copyBtn);
		const saveBtn = container.querySelector('.log-btn-save') as HTMLButtonElement;
		await fireEvent.click(saveBtn);
		await waitFor(() => expect(props.onSave).toHaveBeenCalled());
		const payload = props.onSave.mock.calls[0][0];
		expect(payload.symptoms.tired).toBe(true);
		expect(payload.triggers.stress).toBe(true);
	});
});
