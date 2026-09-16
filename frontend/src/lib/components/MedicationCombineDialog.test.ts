/**
 * Combining the one-entry-per-dose workaround into one history (2026-09-16).
 *
 * The reported case: "Fycompa" twice — the original at 10 mg (later changed to
 * 8 mg), a duplicate at 8 mg (later stopped). Deleting either lost history.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import MedicationCombineDialog from './MedicationCombineDialog.svelte';
import { medPeriods } from '$lib/blueprint/medicationHistory';
import type { MedicationSlot } from '$lib/blueprint/types';

afterEach(() => cleanup());

const schedule = '15min vor dem Schlafen gehen';
const original: MedicationSlot = {
	id: 'fyc-1', name: 'Fycompa', dose: '8mg', schedule, asNeeded: false,
	periods: [
		{ to: '2026-09-15', dose: '10mg', schedule },
		{ from: '2026-09-16', to: '2026-09-16', dose: '8mg', schedule },
		{ from: '2026-09-17', dose: '8mg', schedule },
	],
};
const duplicate: MedicationSlot = {
	id: 'fyc-2', name: 'Fycompa', dose: '8mg', schedule, asNeeded: false,
	periods: [{ to: '2026-09-16', dose: '8mg', schedule }],
};

function mount(props: Record<string, unknown> = {}) {
	const onApply = vi.fn();
	const utils = render(MedicationCombineDialog, {
		props: { open: true, pair: [original, duplicate], docs: [], dateFormat: 'dd.mm.yyyy', ...props },
		events: { apply: (e: CustomEvent) => onApply(e.detail) },
	});
	return { ...utils, onApply };
}

describe('MedicationCombineDialog', () => {
	it('asks for the switch day when both entries claim the same days, and applies nothing without it', () => {
		const { getByTestId, queryByTestId } = mount();
		expect(queryByTestId('combine-preview')).toBeNull();
		expect((getByTestId('combine-apply') as HTMLButtonElement).disabled).toBe(true);
		expect((getByTestId('combine-earlier-fyc-1') as HTMLInputElement).checked).toBe(true);
	});

	it('pre-fills the switch day from the first day logged against the later entry', () => {
		const docs = [
			{ data: { type: 'entry', date: '2026-08-05', missedMedications: ['fyc-2'] } },
			{ data: { type: 'entry', date: '2026-08-20', missedMedications: ['fyc-2'] } },
		];
		const { getByTestId } = mount({ docs });
		expect(getByTestId('combine-preview').textContent).toContain('05.08.2026');
	});

	it('previews and saves one history: 10mg until the switch, 8mg since; the duplicate becomes an alias', async () => {
		const docs = [{ data: { type: 'entry', date: '2026-08-01', missedMedications: ['fyc-2'] } }];
		const { getByTestId, onApply } = mount({ docs });
		const preview = getByTestId('combine-preview').textContent ?? '';
		expect(preview).toContain('31.07.2026');
		expect(preview).toContain('10mg');
		expect(preview).toContain('01.08.2026');
		await fireEvent.click(getByTestId('combine-apply'));
		const { replace, remove } = onApply.mock.calls[0][0];
		expect(remove).toBe('fyc-2');
		expect(replace.id).toBe('fyc-1');
		expect(replace.mergedIds).toEqual(['fyc-2']);
		expect(medPeriods(replace).map((p) => [p.from, p.to, p.dose])).toEqual([
			[undefined, '2026-07-31', '10mg'],
			['2026-08-01', undefined, '8mg'],
		]);
	});
});
