/**
 * CIPH-882 — CustomItemModal contract + behaviour test.
 *
 * Covers the prop boundary and the four kind-driven form modes:
 *   - mount with kind='symptom' → label input + group select rendered
 *   - mount with kind='vital'   → label + unit + min + max rendered
 *   - mount with kind='episode' → label + 6 color chips rendered
 *   - submit with empty label fires the validation error key
 *   - submit with valid input dispatches `save` with a generated
 *     `custom_*` id
 *   - submit while editing preserves the existing id
 *
 * Mounted via @testing-library/svelte; i18n loads its real store. No
 * store mocks needed — the modal is purely controlled by props.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import CustomItemModal from './CustomItemModal.svelte';
import { DATA_PALETTE } from '$lib/dataPalette';

afterEach(() => cleanup());

describe('CustomItemModal — symptom kind', () => {
	it('renders label input and group select with provided groups', () => {
		const { getByTestId } = render(CustomItemModal, {
			props: {
				open: true,
				kind: 'symptom',
				editing: null,
				groups: [
					{ id: 'physical', label: 'symptom_group.physical', items: [] },
				],
			},
		});
		expect(getByTestId('custom-item-label')).toBeTruthy();
		expect(getByTestId('custom-item-group')).toBeTruthy();
	});

	it('dispatches save with a generated custom_* id and the typed payload', async () => {
		const onSave = vi.fn();
		const { getByTestId, component } = render(CustomItemModal, {
			props: { open: true, kind: 'symptom', editing: null, groups: [] },
			events: { save: (e: CustomEvent) => onSave(e.detail) },
		});

		const labelInput = getByTestId('custom-item-label') as HTMLInputElement;
		await fireEvent.input(labelInput, { target: { value: 'Tooth flare-up' } });
		await fireEvent.click(getByTestId('custom-item-save'));

		expect(onSave).toHaveBeenCalledTimes(1);
		const detail = onSave.mock.calls[0][0];
		expect(detail.kind).toBe('symptom');
		expect(detail.item.label).toBe('Tooth flare-up');
		expect(detail.item.id).toMatch(/^custom_/);
	});

	it('preserves the id when editing', async () => {
		const onSave = vi.fn();
		const { getByTestId, component } = render(CustomItemModal, {
			props: {
				open: true,
				kind: 'symptom',
				editing: { id: 'custom_existing_aaaaa', label: 'Old name' },
				groups: [],
			},
			events: { save: (e: CustomEvent) => onSave(e.detail) },
		});

		const labelInput = getByTestId('custom-item-label') as HTMLInputElement;
		await fireEvent.input(labelInput, { target: { value: 'New name' } });
		await fireEvent.click(getByTestId('custom-item-save'));

		expect(onSave).toHaveBeenCalledTimes(1);
		const detail = onSave.mock.calls[0][0];
		expect(detail.item.id).toBe('custom_existing_aaaaa');
		expect(detail.item.label).toBe('New name');
	});
});

describe('CustomItemModal — trigger kind', () => {
	it('renders only the label input', () => {
		const { getByTestId, queryByTestId } = render(CustomItemModal, {
			props: { open: true, kind: 'trigger', editing: null, groups: [] },
		});
		expect(getByTestId('custom-item-label')).toBeTruthy();
		expect(queryByTestId('custom-item-unit')).toBeNull();
		expect(queryByTestId('custom-item-min')).toBeNull();
	});
});

describe('CustomItemModal — vital kind', () => {
	it('renders label + unit + min + max', () => {
		const { getByTestId } = render(CustomItemModal, {
			props: { open: true, kind: 'vital', editing: null, groups: [] },
		});
		expect(getByTestId('custom-item-label')).toBeTruthy();
		expect(getByTestId('custom-item-unit')).toBeTruthy();
		expect(getByTestId('custom-item-min')).toBeTruthy();
		expect(getByTestId('custom-item-max')).toBeTruthy();
	});

	it('shows error when unit is missing on submit', async () => {
		const onSave = vi.fn();
		const { getByTestId, component } = render(CustomItemModal, {
			props: { open: true, kind: 'vital', editing: null, groups: [] },
			events: { save: (e: CustomEvent) => onSave(e.detail) },
		});

		await fireEvent.input(getByTestId('custom-item-label'), {
			target: { value: 'Pain' },
		});
		// unit left blank
		await fireEvent.click(getByTestId('custom-item-save'));

		expect(onSave).not.toHaveBeenCalled();
		expect(getByTestId('custom-item-error')).toBeTruthy();
	});

	it('dispatches a fully-typed VitalField when valid', async () => {
		const onSave = vi.fn();
		const { getByTestId, component } = render(CustomItemModal, {
			props: { open: true, kind: 'vital', editing: null, groups: [] },
			events: { save: (e: CustomEvent) => onSave(e.detail) },
		});

		await fireEvent.input(getByTestId('custom-item-label'), {
			target: { value: 'Pain level' },
		});
		await fireEvent.input(getByTestId('custom-item-unit'), {
			target: { value: '0-10' },
		});
		await fireEvent.input(getByTestId('custom-item-min'), {
			target: { value: '0' },
		});
		await fireEvent.input(getByTestId('custom-item-max'), {
			target: { value: '10' },
		});
		await fireEvent.click(getByTestId('custom-item-save'));

		expect(onSave).toHaveBeenCalledTimes(1);
		const item = onSave.mock.calls[0][0].item;
		expect(item.label).toBe('Pain level');
		expect(item.unit).toBe('0-10');
		expect(item.min).toBe(0);
		expect(item.max).toBe(10);
	});
});

describe('CustomItemModal — episode kind', () => {
	it('renders all 6 DATA_PALETTE color chips', () => {
		const { getByTestId } = render(CustomItemModal, {
			props: { open: true, kind: 'episode', editing: null, groups: [] },
		});
		for (const hex of DATA_PALETTE) {
			expect(getByTestId(`custom-item-color-${hex}`)).toBeTruthy();
		}
	});

	it('selecting a chip and saving dispatches the chosen color', async () => {
		const onSave = vi.fn();
		const { getByTestId, component } = render(CustomItemModal, {
			props: { open: true, kind: 'episode', editing: null, groups: [] },
			events: { save: (e: CustomEvent) => onSave(e.detail) },
		});

		await fireEvent.input(getByTestId('custom-item-label'), {
			target: { value: 'Flare' },
		});
		const chip = getByTestId(`custom-item-color-${DATA_PALETTE[2]}`);
		await fireEvent.click(chip);
		await fireEvent.click(getByTestId('custom-item-save'));

		expect(onSave).toHaveBeenCalledTimes(1);
		const item = onSave.mock.calls[0][0].item;
		expect(item.color).toBe(DATA_PALETTE[2]);
		expect(item.id).toMatch(/^custom_/);
	});
});

describe('CustomItemModal — close + label-required', () => {
	it('clicking cancel dispatches close', async () => {
		const onClose = vi.fn();
		const { getByTestId, component } = render(CustomItemModal, {
			props: { open: true, kind: 'symptom', editing: null, groups: [] },
			events: { close: () => onClose() },
		});
		await fireEvent.click(getByTestId('custom-item-cancel'));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('shows label-required error when submitting empty', async () => {
		const onSave = vi.fn();
		const { getByTestId, component } = render(CustomItemModal, {
			props: { open: true, kind: 'symptom', editing: null, groups: [] },
			events: { save: (e: CustomEvent) => onSave(e.detail) },
		});
		await fireEvent.click(getByTestId('custom-item-save'));
		expect(onSave).not.toHaveBeenCalled();
		expect(getByTestId('custom-item-error')).toBeTruthy();
	});
});
