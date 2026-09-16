/**
 * The guided medication change (dose history, 2026-09-16).
 *
 * The operator's scenario, end to end through the dialog: 2× 10 mg today,
 * 2× 12 mg from tomorrow. What has to hold:
 *   - the preview says, before saving, that earlier days keep 10 mg;
 *   - what is dispatched is exactly that — a new period, same id;
 *   - "delete" on a medication with logged days leads with "stop instead";
 *   - a typo correction is a separate, explicitly retroactive action.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import MedicationChangeDialog from './MedicationChangeDialog.svelte';
import { periodOn } from '$lib/blueprint/medicationHistory';
import type { MedicationSlot } from '$lib/blueprint/types';

afterEach(() => cleanup());

const lamotrigin: MedicationSlot = {
	id: 'lam', name: 'Lamotrigin', dose: '10 mg', schedule: '2× täglich', asNeeded: false,
};

function mount(props: Record<string, unknown> = {}) {
	const onApply = vi.fn();
	const utils = render(MedicationChangeDialog, {
		props: { open: true, med: lamotrigin, today: '2026-09-16', dateFormat: 'dd.mm.yyyy', ...props },
		events: { apply: (e: CustomEvent) => onApply(e.detail) },
	});
	return { ...utils, onApply };
}

describe('dose change', () => {
	it('defaults to tomorrow, previews both sides of the change, and saves a new period on the same id', async () => {
		const { getByTestId, onApply } = mount();
		await fireEvent.input(getByTestId('med-change-dose'), { target: { value: '12 mg' } });

		const preview = getByTestId('med-change-preview').textContent ?? '';
		expect(preview).toContain('16.09.2026');
		expect(preview).toContain('10 mg');
		expect(preview).toContain('17.09.2026');
		expect(preview).toContain('12 mg');

		await fireEvent.click(getByTestId('med-change-apply'));
		expect(onApply).toHaveBeenCalledTimes(1);
		const { replace, add, remove } = onApply.mock.calls[0][0];
		expect(add).toBeUndefined();
		expect(remove).toBeUndefined();
		expect(replace.id).toBe('lam');
		expect(periodOn(replace, '2026-09-16')?.dose).toBe('10 mg');
		expect(periodOn(replace, '2026-09-17')?.dose).toBe('12 mg');
	});

	it('stop records the day the medication is no longer taken', async () => {
		const { getByTestId, onApply } = mount();
		await fireEvent.click(getByTestId('med-kind-stop'));
		await fireEvent.click(getByTestId('med-change-apply'));
		const { replace } = onApply.mock.calls[0][0];
		expect(periodOn(replace, '2026-09-16')?.dose).toBe('10 mg');
		expect(periodOn(replace, '2026-09-17')).toBeNull();
	});

	it('switch stops this medication and starts the new one the same day', async () => {
		const { getByTestId, onApply } = mount();
		await fireEvent.click(getByTestId('med-kind-switch'));
		await fireEvent.input(getByTestId('med-switch-name'), { target: { value: 'Levetiracetam' } });
		await fireEvent.input(getByTestId('med-switch-dose'), { target: { value: '500 mg' } });
		await fireEvent.click(getByTestId('med-change-apply'));
		const { replace, add } = onApply.mock.calls[0][0];
		expect(periodOn(replace, '2026-09-17')).toBeNull();
		expect(add.name).toBe('Levetiracetam');
		expect(periodOn(add, '2026-09-16')).toBeNull();
		expect(periodOn(add, '2026-09-17')?.dose).toBe('500 mg');
	});

	it('refuses a date before the recorded start', async () => {
		const started: MedicationSlot = { ...lamotrigin, periods: [{ from: '2026-09-10', dose: '10 mg', schedule: '' }] };
		const { getByTestId, queryByTestId } = mount({ med: started, today: '2026-09-05' });
		// today + 1 = 06.09., before the 10.09. start
		expect(getByTestId('med-change-error')).toBeTruthy();
		expect(queryByTestId('med-change-preview')).toBeNull();
		expect((getByTestId('med-change-apply') as HTMLButtonElement).disabled).toBe(true);
	});
});

describe('correction', () => {
	it('is reached separately and rewrites the latest period in place', async () => {
		const { getByTestId, onApply } = mount();
		await fireEvent.click(getByTestId('med-open-correct'));
		expect(getByTestId('med-correct-scope').textContent).toBeTruthy();
		await fireEvent.input(getByTestId('med-correct-dose'), { target: { value: '100 mg' } });
		await fireEvent.click(getByTestId('med-correct-apply'));
		const { replace } = onApply.mock.calls[0][0];
		expect(periodOn(replace, '2020-01-01')?.dose).toBe('100 mg');
	});
});

describe('delete', () => {
	it('with logged history leads with "stop instead" and needs a second step to delete', async () => {
		const { getByTestId, queryByTestId, onApply } = mount({ historyDays: 12 });
		await fireEvent.click(getByTestId('med-open-delete'));
		expect(getByTestId('med-delete-history').textContent).toContain('12');
		expect(getByTestId('med-delete-stop-instead')).toBeTruthy();
		expect(queryByTestId('med-delete-confirm')).toBeNull();

		await fireEvent.click(getByTestId('med-delete-anyway'));
		await fireEvent.click(getByTestId('med-delete-confirm'));
		expect(onApply).toHaveBeenCalledWith({ remove: 'lam' });
	});

	it('"stop instead" switches to the stop form rather than deleting', async () => {
		const { getByTestId, onApply } = mount({ historyDays: 3 });
		await fireEvent.click(getByTestId('med-open-delete'));
		await fireEvent.click(getByTestId('med-delete-stop-instead'));
		expect((getByTestId('med-kind-stop') as HTMLInputElement).checked).toBe(true);
		expect(onApply).not.toHaveBeenCalled();
	});

	it('without history deletes after one confirmation', async () => {
		const { getByTestId, queryByTestId, onApply } = mount({ historyDays: 0 });
		await fireEvent.click(getByTestId('med-open-delete'));
		expect(queryByTestId('med-delete-stop-instead')).toBeNull();
		await fireEvent.click(getByTestId('med-delete-confirm'));
		expect(onApply).toHaveBeenCalledWith({ remove: 'lam' });
	});
});

describe('a change to what already applies', () => {
	it('is refused with a note instead of recording "8 mg → 8 mg"', async () => {
		const { getByTestId, onApply } = mount();
		// Default dose/schedule = current, default date = tomorrow.
		expect(getByTestId('med-change-noop').textContent).toContain('10 mg');
		expect((getByTestId('med-change-apply') as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.input(getByTestId('med-change-dose'), { target: { value: '12 mg' } });
		expect((getByTestId('med-change-apply') as HTMLButtonElement).disabled).toBe(false);
		expect(onApply).not.toHaveBeenCalled();
	});
});

describe('delete with a same-named entry', () => {
	it('offers combining first', async () => {
		const other: MedicationSlot = { ...lamotrigin, id: 'lam-2', dose: '12 mg' };
		const onCombine = vi.fn();
		const { getByTestId } = render(MedicationChangeDialog, {
			props: { open: true, med: lamotrigin, today: '2026-09-16', historyDays: 5, duplicates: [other] },
			events: { combine: (e: CustomEvent) => onCombine(e.detail) },
		});
		await fireEvent.click(getByTestId('med-open-delete'));
		expect(getByTestId('med-delete-duplicate')).toBeTruthy();
		await fireEvent.click(getByTestId('med-delete-combine'));
		expect(onCombine).toHaveBeenCalledWith({ with: other });
	});
});
