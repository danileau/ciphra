/**
 * The app's one dropdown (2026-09-20).
 *
 * Reported from the running app: "most of the dropdowns show the list on top
 * of the clicked field, and some show it only while the click is held". Every
 * one of those was a native `<select>`, whose options panel is browser chrome
 * — not in the DOM, not stylable, placed by the platform, and on Linux/GTK
 * operated by press-drag-release. This component replaces them, so the two
 * symptoms are what it is pinned against:
 *
 *   - a full click (down AND up) leaves the panel open;
 *   - the panel goes below the trigger, and flips above only when it really
 *     does not fit, measured from the rendered panel rather than guessed.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import Listbox from './Listbox.svelte';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

const OPTIONS = [
	{ value: 'light', label: 'Hell' },
	{ value: 'dark', label: 'Dunkel' },
	{ value: 'system', label: 'Automatisch' },
];

function mount(props: Record<string, unknown> = {}) {
	const onChange = vi.fn();
	const utils = render(Listbox, {
		props: { options: OPTIONS, value: 'light', testid: 'lb', ariaLabel: 'Erscheinungsbild', ...props },
		events: { change: (e: CustomEvent) => onChange(e.detail) },
	});
	return { ...utils, onChange };
}

/** Place the trigger in the viewport: `top` from the top, `height` tall. */
function placeTrigger(el: Element, top: number, height = 44) {
	vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
		top, bottom: top + height, left: 0, right: 200, width: 200, height, x: 0, y: top, toJSON: () => ({}),
	} as DOMRect);
}

describe('opening and closing', () => {
	it('stays open after a full click — press, release, still there', async () => {
		const { getByTestId } = mount();
		const trigger = getByTestId('lb');
		await fireEvent.mouseDown(trigger);
		await fireEvent.mouseUp(trigger);
		await fireEvent.click(trigger);
		expect(document.querySelector('[role="listbox"]'), 'the click that opened it also closed it').toBeTruthy();
		expect(trigger.getAttribute('aria-expanded')).toBe('true');
	});

	it('closes on a click outside, and on Escape', async () => {
		const { getByTestId } = mount();
		await fireEvent.click(getByTestId('lb'));
		expect(document.querySelector('[role="listbox"]')).toBeTruthy();

		await fireEvent.click(document.body);
		expect(document.querySelector('[role="listbox"]')).toBeNull();

		await fireEvent.click(getByTestId('lb'));
		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(document.querySelector('[role="listbox"]')).toBeNull();
	});

	it('picks a value, reports it, and closes', async () => {
		const { getByTestId, onChange } = mount();
		await fireEvent.click(getByTestId('lb'));
		const dark = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes('Dunkel'));
		await fireEvent.click(dark as Element);
		expect(onChange).toHaveBeenCalledWith({ value: 'dark' });
		expect(document.querySelector('[role="listbox"]')).toBeNull();
		expect(getByTestId('lb').textContent).toContain('Dunkel');
	});
});

describe('placement', () => {
	it('opens below when there is room', async () => {
		const { getByTestId } = mount();
		const trigger = getByTestId('lb');
		placeTrigger(trigger, 100);
		await fireEvent.click(trigger);
		const panel = document.querySelector('[role="listbox"]') as HTMLElement;
		expect(panel.className).toContain('lb-panel--below');
	});

	it('flips above only when the panel would not fit below', async () => {
		const { getByTestId } = mount();
		const trigger = getByTestId('lb');
		// jsdom gives every element a zero-height rect, so the panel has to
		// claim a height for the measurement to mean anything.
		placeTrigger(trigger, window.innerHeight - 60);
		const proto = Object.getPrototypeOf(document.createElement('ul'));
		const spy = vi.spyOn(proto, 'getBoundingClientRect').mockReturnValue({
			top: 0, bottom: 240, height: 240, left: 0, right: 200, width: 200, x: 0, y: 0, toJSON: () => ({}),
		} as DOMRect);
		await fireEvent.click(trigger);
		const panel = document.querySelector('[role="listbox"]') as HTMLElement;
		expect(panel.className).toContain('lb-panel--above');
		spy.mockRestore();
	});
});

describe('keyboard and semantics', () => {
	it('announces itself as a listbox trigger with the current value', () => {
		const { getByTestId } = mount();
		const trigger = getByTestId('lb');
		expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(trigger.getAttribute('aria-label')).toBe('Erscheinungsbild');
		expect(trigger.textContent).toContain('Hell');
	});

	it('opens with the keyboard and marks the selected option', async () => {
		const { getByTestId } = mount();
		await fireEvent.keyDown(getByTestId('lb'), { key: 'ArrowDown' });
		const options = [...document.querySelectorAll('[role="option"]')];
		expect(options).toHaveLength(3);
		expect(options.find((o) => o.getAttribute('aria-selected') === 'true')?.textContent).toContain('Hell');
	});

	it('moves through the options with the arrow keys', async () => {
		const { getByTestId } = mount();
		await fireEvent.click(getByTestId('lb'));
		await fireEvent.keyDown(window, { key: 'ArrowDown' });
		expect(document.activeElement?.textContent).toContain('Dunkel');
		await fireEvent.keyDown(window, { key: 'End' });
		expect(document.activeElement?.textContent).toContain('Automatisch');
	});

	it('shows the placeholder when nothing is selected yet', () => {
		const { getByTestId } = mount({ value: '', placeholder: 'Bitte wählen' });
		expect(getByTestId('lb').textContent).toContain('Bitte wählen');
	});
});
