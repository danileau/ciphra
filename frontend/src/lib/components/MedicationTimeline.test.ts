/**
 * /reports medication timeline (dose history, 2026-09-16).
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import MedicationTimeline from './MedicationTimeline.svelte';
import type { MedicationSlot } from '$lib/blueprint/types';

afterEach(() => cleanup());

const lamotrigin: MedicationSlot = {
	id: 'lam', name: 'Lamotrigin', dose: '12 mg', schedule: '2× täglich', asNeeded: false,
	periods: [
		{ to: '2026-09-16', dose: '10 mg', schedule: '2× täglich' },
		{ from: '2026-09-17', dose: '12 mg', schedule: '2× täglich' },
	],
};
const midazolam: MedicationSlot = { id: 'mid', name: 'Midazolam', dose: '5 mg', schedule: '', asNeeded: true };

describe('MedicationTimeline', () => {
	it('draws one segment per dose period, split at the change, and lists the change', () => {
		const { container, getByTestId } = render(MedicationTimeline, {
			props: { meds: [lamotrigin], from: '2026-09-01', to: '2026-09-30', dateFormat: 'dd.mm.yyyy' },
		});
		const segs = container.querySelectorAll<HTMLElement>('.medtl-seg');
		expect(segs).toHaveLength(2);
		// 16 of 30 days at 10 mg, 14 at 12 mg.
		expect(parseFloat(segs[0].style.width)).toBeCloseTo((16 / 30) * 100, 1);
		expect(parseFloat(segs[1].style.left)).toBeCloseTo((16 / 30) * 100, 1);
		expect(segs[1].classList.contains('medtl-seg--step')).toBe(true);
		expect(getByTestId('med-timeline').textContent).toContain('17.09.2026');
	});

	it('leaves out an unchanged as-needed medication (a solid bar would read as taken daily)', () => {
		const { container } = render(MedicationTimeline, {
			props: { meds: [lamotrigin, midazolam], from: '2026-09-01', to: '2026-09-30' },
		});
		expect(container.textContent).not.toContain('Midazolam');
	});

	it('renders nothing when no medication overlaps the window', () => {
		const stopped: MedicationSlot = { ...lamotrigin, periods: [{ to: '2026-01-31', dose: '10 mg', schedule: '' }] };
		const { queryByTestId } = render(MedicationTimeline, {
			props: { meds: [stopped], from: '2026-09-01', to: '2026-09-30' },
		});
		expect(queryByTestId('med-timeline')).toBeNull();
	});
});
