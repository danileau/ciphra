/**
 * History from before ciphra (2026-09-19).
 *
 * The scenario: Fycompa is recorded from 01.06.2026, but the person has been
 * on it since 2023 and went 12 → 10 → 8 mg on the way. And before that there
 * was a drug that was tried and given up. What has to hold:
 *   - an earlier dose leaves every recorded day exactly as it was;
 *   - a start nobody remembers stays unknown instead of becoming a guess;
 *   - a medication with no recorded start gets one, and the dialog says so
 *     before it is saved;
 *   - a range that contradicts the record is refused with a reason.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import MedicationHistoryDialog from './MedicationHistoryDialog.svelte';
import { medPeriods } from '$lib/blueprint/medicationHistory';
import type { MedicationSlot } from '$lib/blueprint/types';

afterEach(() => cleanup());

const fycompa: MedicationSlot = {
	id: 'fyc', name: 'Fycompa', dose: '8mg', schedule: 'abends', asNeeded: false,
	periods: [{ from: '2026-06-01', dose: '8mg', schedule: 'abends' }],
};
/** The shape of almost everything in the wild: no recorded start. */
const unbounded: MedicationSlot = { id: 'lam', name: 'Lamotrigin', dose: '50 mg', schedule: '', asNeeded: false };

function mount(props: Record<string, unknown> = {}) {
	const onApply = vi.fn();
	const utils = render(MedicationHistoryDialog, {
		props: { open: true, mode: 'earlier', med: fycompa, today: '2026-09-19', dateFormat: 'dd.mm.yyyy', ...props },
		events: { apply: (e: CustomEvent) => onApply(e.detail) },
	});
	return { ...utils, onApply };
}

describe('an earlier dose', () => {
	it('runs up to the day before the recorded start and keeps the recorded period', async () => {
		const { getByTestId, onApply } = mount();
		await fireEvent.input(getByTestId('history-dose'), { target: { value: '10mg' } });

		expect(getByTestId('history-preview').textContent).toContain('10mg');
		await fireEvent.click(getByTestId('history-apply'));

		const med = onApply.mock.calls[0][0].replace as MedicationSlot;
		expect(med.id).toBe('fyc');
		expect(medPeriods(med).map((p) => [p.from, p.to, p.dose, p.reported])).toEqual([
			[undefined, '2026-05-31', '10mg', true],
			['2026-06-01', undefined, '8mg', undefined],
		]);
	});

	it('leaves the start unknown rather than inventing a day', async () => {
		const { getByTestId } = mount();
		await fireEvent.input(getByTestId('history-dose'), { target: { value: '10mg' } });
		expect(getByTestId('history-start-unknown')).toBeTruthy();
	});

	it('gives a medication without a recorded start one, and says so first', async () => {
		const { getByTestId, onApply } = mount({ med: unbounded });
		await fireEvent.input(getByTestId('history-dose'), { target: { value: '25 mg' } });
		// Nothing to run up to: the dialog asks for the end.
		expect(getByTestId('history-error').textContent).toContain('until when');

		await fireEvent.click(document.getElementById('history-until') as Element);
		// The month grid: pick May of the current cursor year.
		const may = Array.from(document.querySelectorAll('.dp-month')).find((b) => /Mai|May/.test(b.textContent ?? ''));
		await fireEvent.click(may as Element);

		expect(getByTestId('history-adopts-start').textContent).toContain('Lamotrigin');
		await fireEvent.click(getByTestId('history-apply'));
		const med = onApply.mock.calls[0][0].replace as MedicationSlot;
		const periods = medPeriods(med);
		expect(periods[0].dose).toBe('25 mg');
		expect(periods[0].toPrecision).toBe('month');
		expect(periods[1].from).toBe('2026-06-01');
	});

	it('refuses a period that reaches into the recorded history', async () => {
		const { getByTestId } = mount();
		await fireEvent.input(getByTestId('history-dose'), { target: { value: '10mg' } });
		await fireEvent.click(document.getElementById('history-until') as Element);
		const july = Array.from(document.querySelectorAll('.dp-month')).find((b) => /Jul/.test(b.textContent ?? ''));
		await fireEvent.click(july as Element);
		expect(getByTestId('history-error').textContent).toContain('01.06.2026');
	});
});

describe('a medication from the past', () => {
	it('is saved as one remembered period with the reason it ended', async () => {
		const { getByTestId, onApply } = mount({ mode: 'past', med: null });
		await fireEvent.input(getByTestId('history-name'), { target: { value: 'Levetiracetam' } });
		await fireEvent.input(getByTestId('history-dose'), { target: { value: '1000 mg' } });
		// A Listbox now, not a <select> (2026-09-20): open it and pick.
		await fireEvent.click(getByTestId('history-stop-reason'));
		const sideEffects = [...document.querySelectorAll('[role="option"]')]
			.find((o) => /Nebenwirkungen|Side effects/.test(o.textContent ?? ''));
		await fireEvent.click(sideEffects as Element);

		await fireEvent.click(document.getElementById('history-until') as Element);
		const march = Array.from(document.querySelectorAll('.dp-month')).find((b) => /Mär|Mar/.test(b.textContent ?? ''));
		await fireEvent.click(march as Element);

		await fireEvent.click(getByTestId('history-apply'));
		const med = onApply.mock.calls[0][0].add as MedicationSlot;
		expect(med.name).toBe('Levetiracetam');
		const period = medPeriods(med)[0];
		expect([period.from, period.to, period.stopReason, period.reported]).toEqual([
			undefined, '2026-03-31', 'side_effects', true,
		]);
	});

	it('needs an end — a medication from the past has one by definition', async () => {
		const { getByTestId } = mount({ mode: 'past', med: null });
		await fireEvent.input(getByTestId('history-name'), { target: { value: 'Levetiracetam' } });
		await fireEvent.input(getByTestId('history-dose'), { target: { value: '1000 mg' } });
		expect(getByTestId('history-error')).toBeTruthy();
		expect((getByTestId('history-apply') as HTMLButtonElement).disabled).toBe(true);
	});
});
