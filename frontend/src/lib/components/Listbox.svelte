<!--
	Listbox — one dropdown for the whole app (2026-09-20).

	ciphra had two kinds of dropdown. Its own — LocaleSelect, VaultSwitcher,
	the export period popover — opened below the field, stayed open on a
	click, and looked like ciphra. Everywhere a form needed a choice there was
	a native `<select>` instead, and the options panel of a `<select>` is
	browser chrome: not in the DOM, unreachable by CSS, placed by the platform
	(Chromium lays the selected row over the trigger, and flips the list
	upward near the window's bottom edge), and on Linux/GTK operated by
	press-drag-release. So half the app's dropdowns opened over the field they
	belonged to and closed when the mouse came up, while the other half behaved.
	The trigger was styled to match ciphra; the panel never could be.

	The cost of writing a listbox by hand is what kept spreading the native
	one, so this is the primitive the earlier design pass asked for: the
	behaviour lives here once, and a form field is as cheap to write as a
	`<select>` was.

	Deliberately still native below 640px: a phone's own picker is the better
	control — big targets, no tiny panel to place — and that is the same call
	ExportPeriodPopover already made. The difference is that it is now one
	decision in one file instead of a per-field accident.
-->
<script context="module" lang="ts">
	export interface ListboxOption {
		value: string;
		label: string;
		disabled?: boolean;
	}
</script>

<script lang="ts">
	import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';

	export let options: ListboxOption[] = [];
	export let value = '';
	/** Put this on the trigger so a `<label for=…>` still points at it. */
	export let id = '';
	export let ariaLabel: string | undefined = undefined;
	/** Id of the element labelling this control, when there is a visible one. */
	export let ariaLabelledby: string | undefined = undefined;
	/** Shown when `value` matches no option (an empty form field). */
	export let placeholder = '';
	export let disabled = false;
	/** `field` fills its container like an input; `chip` hugs its label. */
	export let variant: 'field' | 'chip' = 'field';
	/** Which edge of the trigger the panel lines up with. */
	export let align: 'start' | 'end' = 'start';
	/** Extra classes for the trigger — callers keep their own form styling. */
	export let buttonClass = '';
	export let testid: string | undefined = undefined;
	/** Hand over to the platform picker on a phone. See the header comment. */
	export let nativeOnNarrow = true;

	const dispatch = createEventDispatcher<{ change: { value: string } }>();

	let trigger: HTMLButtonElement | null = null;
	let panel: HTMLUListElement | null = null;
	let open = false;
	let activeIdx = -1;
	let isNarrow = false;
	/** Below unless the panel genuinely does not fit there — measured, not
	 *  guessed, because a guessed height flips lists that would have fit. */
	let placement: 'below' | 'above' = 'below';

	$: selected = options.find((o) => o.value === value) ?? null;
	$: label = selected?.label ?? placeholder;
	$: selectedIdx = options.findIndex((o) => o.value === value);

	async function updatePlacement() {
		if (!trigger || typeof window === 'undefined') return;
		await tick();
		const t = trigger.getBoundingClientRect();
		// The real panel, now that it exists: an estimate is what makes a
		// dropdown open upward in front of a screen with room to spare.
		const height = panel?.getBoundingClientRect().height ?? 0;
		const GAP = 8;
		const spaceBelow = window.innerHeight - t.bottom;
		const spaceAbove = t.top;
		placement =
			spaceBelow < height + GAP && spaceAbove > spaceBelow ? 'above' : 'below';
	}

	function focusOption(i: number) {
		panel?.querySelector<HTMLButtonElement>(`[data-i="${i}"]`)?.focus();
	}

	async function openPanel() {
		if (disabled) return;
		open = true;
		activeIdx = selectedIdx >= 0 ? selectedIdx : 0;
		await updatePlacement();
		focusOption(activeIdx);
	}

	function close(returnFocus = true) {
		open = false;
		if (returnFocus) trigger?.focus();
	}

	function toggle() {
		if (open) close();
		else void openPanel();
	}

	function pick(option: ListboxOption) {
		if (option.disabled) return;
		value = option.value;
		dispatch('change', { value });
		close();
	}

	function move(delta: number) {
		if (options.length === 0) return;
		let next = activeIdx;
		for (let step = 0; step < options.length; step++) {
			next = (next + delta + options.length) % options.length;
			if (!options[next].disabled) break;
		}
		activeIdx = next;
		focusOption(activeIdx);
	}

	function onTriggerKey(e: KeyboardEvent) {
		if (open) return;
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			void openPanel();
		}
	}

	function onWindowKey(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			move(1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			move(-1);
		} else if (e.key === 'Home') {
			e.preventDefault();
			activeIdx = 0;
			focusOption(0);
		} else if (e.key === 'End') {
			e.preventDefault();
			activeIdx = options.length - 1;
			focusOption(activeIdx);
		} else if (e.key === 'Tab') {
			// Leaving the control closes it; the choice already made stands.
			close(false);
		}
	}

	/** The click that opened it must not also close it: both the trigger and
	 *  the panel are excluded, and the listener only acts while open. */
	function onWindowClick(e: MouseEvent) {
		if (!open) return;
		const target = e.target as Node;
		if (trigger?.contains(target) || panel?.contains(target)) return;
		close(false);
	}

	function onWindowResize() {
		if (open) void updatePlacement();
	}

	onMount(() => {
		if (nativeOnNarrow && typeof window.matchMedia === 'function') {
			const mq = window.matchMedia('(max-width: 639px)');
			isNarrow = mq.matches;
			const onChange = (e: MediaQueryListEvent) => {
				isNarrow = e.matches;
				if (isNarrow) open = false;
			};
			mq.addEventListener('change', onChange);
			onDestroy(() => mq.removeEventListener('change', onChange));
		}
		window.addEventListener('click', onWindowClick);
		window.addEventListener('keydown', onWindowKey);
		window.addEventListener('resize', onWindowResize);
		return () => {
			window.removeEventListener('click', onWindowClick);
			window.removeEventListener('keydown', onWindowKey);
			window.removeEventListener('resize', onWindowResize);
		};
	});
</script>

{#if isNarrow}
	<!-- The phone's own picker. Same value, same events, no panel to place. -->
	<select
		{id}
		class="lb-native select-chevron {buttonClass}"
		class:lb-native--field={variant === 'field'}
		aria-label={ariaLabel}
		aria-labelledby={ariaLabelledby}
		{disabled}
		bind:value
		on:change={() => dispatch('change', { value })}
		data-testid={testid}
	>
		{#if placeholder && selectedIdx < 0}
			<option value="" disabled selected>{placeholder}</option>
		{/if}
		{#each options as option (option.value)}
			<option value={option.value} disabled={option.disabled}>{option.label}</option>
		{/each}
	</select>
{:else}
	<div class="lb-root" class:lb-root--field={variant === 'field'}>
		<button
			bind:this={trigger}
			{id}
			type="button"
			class="lb-trigger {buttonClass}"
			class:lb-trigger--field={variant === 'field'}
			class:lb-trigger--placeholder={selectedIdx < 0}
			aria-haspopup="listbox"
			aria-expanded={open}
			aria-label={ariaLabel}
			aria-labelledby={ariaLabelledby}
			{disabled}
			data-testid={testid}
			on:click={toggle}
			on:keydown={onTriggerKey}
		>
			<span class="lb-label">{label}</span>
			<svg class="lb-chevron" class:lb-chevron--open={open} viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<polyline points="3,4.5 6,7.5 9,4.5" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		</button>

		{#if open}
			<ul
				bind:this={panel}
				class="lb-panel lb-panel--{placement} lb-panel--{align}"
				class:lb-panel--field={variant === 'field'}
				role="listbox"
				aria-label={ariaLabel}
				aria-labelledby={ariaLabelledby}
				data-testid={testid ? `${testid}-panel` : undefined}
			>
				{#each options as option, i (option.value)}
					<li role="presentation">
						<button
							type="button"
							class="lb-option"
							class:lb-option--selected={option.value === value}
							role="option"
							aria-selected={option.value === value}
							disabled={option.disabled}
							data-i={i}
							on:click={() => pick(option)}
						>
							<span>{option.label}</span>
							{#if option.value === value}
								<svg class="lb-check" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
									<polyline points="2.5,6.5 5,9 9.5,3.5" stroke-linecap="round" stroke-linejoin="round" />
								</svg>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}

<style>
	.lb-root {
		position: relative;
		display: inline-block;
	}
	.lb-root--field {
		display: block;
		width: 100%;
	}
	.lb-native--field {
		width: 100%;
	}

	.lb-trigger {
		display: inline-flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		min-height: 36px;
		font-size: 0.75rem;
		line-height: 1.25;
		background-color: var(--surface-muted);
		color: var(--text-secondary);
		border: 1px solid var(--border);
		border-radius: 10px;
		cursor: pointer;
		transition: border-color 0.15s ease-out, box-shadow 0.15s ease-out, background-color 0.15s ease-out;
	}
	/* A form field: the same box as `.input`, so a listbox and a text input
	   sitting next to each other are the same control. */
	.lb-trigger--field {
		width: 100%;
		min-height: 44px;
		padding: 0.625rem 0.75rem;
		font-size: 0.875rem;
		color: var(--text-primary);
		background-color: var(--surface-card);
		border-radius: 12px;
		text-align: left;
	}
	.lb-trigger--placeholder {
		color: var(--text-muted);
	}
	.lb-trigger:hover:not(:disabled) {
		border-color: var(--text-muted);
	}
	.lb-trigger:focus-visible {
		outline: none;
		border-color: var(--accent, var(--brand));
		box-shadow: 0 0 0 3px rgba(var(--accent-rgb, 178 60 44), 0.12);
	}
	.lb-trigger:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.lb-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.lb-chevron {
		width: 12px;
		height: 12px;
		flex-shrink: 0;
		opacity: 0.6;
		transition: transform 0.15s ease-out;
	}
	.lb-chevron--open {
		transform: rotate(180deg);
	}

	.lb-panel {
		position: absolute;
		min-width: 10rem;
		max-height: min(320px, 55vh);
		overflow-y: auto;
		margin: 0;
		padding: 4px;
		list-style: none;
		background: var(--surface-card);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04);
		/* Above a Modal's own stacking context (z-[65]) — a dropdown inside a
		   dialog must not open behind it. */
		z-index: 70;
	}
	.lb-panel--field {
		width: 100%;
	}
	.lb-panel--start {
		left: 0;
	}
	.lb-panel--end {
		right: 0;
	}
	.lb-panel--below {
		top: calc(100% + 6px);
		bottom: auto;
	}
	.lb-panel--above {
		bottom: calc(100% + 6px);
		top: auto;
	}
	.lb-option {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		width: 100%;
		min-height: 40px;
		padding: 8px 12px;
		font-size: 0.8125rem;
		text-align: left;
		color: var(--text-secondary);
		background: transparent;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		transition: background 0.12s ease-out, color 0.12s ease-out;
	}
	.lb-option:hover:not(:disabled),
	.lb-option:focus-visible {
		background: var(--surface-muted);
		color: var(--text-primary);
		outline: none;
	}
	.lb-option--selected {
		color: var(--text-primary);
		font-weight: 600;
	}
	.lb-option:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.lb-check {
		width: 12px;
		height: 12px;
		color: var(--olive);
	}
</style>
