<!--
	TimePicker — fully custom, brand-consistent.

	Replaces the native browser time-picker popover. Native chrome is
	browser-OS controlled (the AM/PM dropdown in some browsers) and
	doesn't honor `$locale`. We render two scrollable columns (hours +
	minutes) ourselves, always 24h.

	Value contract: 24h `HH:MM` string (matches the previous native input
	contract), so callers don't change.

	PI v17 — same brand-consistency + locale fix as DatePicker.svelte.
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { t } from '$lib/i18n';

	export let value: string = '';
	export let id: string = '';
	export let ariaLabel: string | undefined = undefined;
	/**
	 * Smaller chip variant for inline use inside the entry composer's
	 * episode rows. Drops to 32px min-height + smaller padding/font.
	 */
	export let compact: boolean = false;
	/** Step in minutes (default 5). 1 = every minute; 15 = quarter-hour. */
	export let minuteStep: number = 5;

	let triggerEl: HTMLButtonElement | null = null;
	let popoverEl: HTMLDivElement | null = null;
	let hoursListEl: HTMLDivElement | null = null;
	let minutesListEl: HTMLDivElement | null = null;
	let open = false;

	function pad(n: number): string {
		return String(n).padStart(2, '0');
	}

	$: parsed = (() => {
		if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return { h: -1, m: -1 };
		const [h, m] = value.split(':').map(Number);
		return { h, m };
	})();

	const hourOptions: number[] = Array.from({ length: 24 }, (_, i) => i);
	$: minuteOptions = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep);

	function toggleOpen() {
		open = !open;
		if (open) {
			// Wait for the popover to mount, then scroll the selected/default
			// option into view inside each column.
			requestAnimationFrame(() => {
				scrollSelectedIntoView();
			});
		}
	}

	function closePopover() {
		open = false;
	}

	function selectHour(h: number) {
		const m = parsed.m >= 0 ? parsed.m : 0;
		value = `${pad(h)}:${pad(m)}`;
	}
	function selectMinute(m: number) {
		const h = parsed.h >= 0 ? parsed.h : 0;
		value = `${pad(h)}:${pad(m)}`;
	}

	function clearValue() {
		value = '';
		open = false;
		triggerEl?.focus();
	}

	function applyAndClose() {
		open = false;
		triggerEl?.focus();
	}

	function scrollSelectedIntoView() {
		const h = parsed.h >= 0 ? parsed.h : new Date().getHours();
		const m = parsed.m >= 0 ? parsed.m : 0;
		const hourEl = hoursListEl?.querySelector(`[data-hour="${h}"]`) as HTMLElement | null;
		// Match minute to nearest step.
		const targetMin = minuteOptions.reduce((best, cur) =>
			Math.abs(cur - m) < Math.abs(best - m) ? cur : best, minuteOptions[0]);
		const minEl = minutesListEl?.querySelector(`[data-min="${targetMin}"]`) as HTMLElement | null;
		hourEl?.scrollIntoView({ block: 'center' });
		minEl?.scrollIntoView({ block: 'center' });
	}

	function onWindowClick(e: MouseEvent) {
		if (!open) return;
		const target = e.target as Node;
		if (popoverEl?.contains(target)) return;
		if (triggerEl?.contains(target)) return;
		open = false;
	}
	function onWindowKey(e: KeyboardEvent) {
		if (open && e.key === 'Escape') {
			open = false;
			triggerEl?.focus();
		}
	}

	onMount(() => {
		window.addEventListener('click', onWindowClick, true);
		window.addEventListener('keydown', onWindowKey);
	});
	onDestroy(() => {
		if (typeof window !== 'undefined') {
			window.removeEventListener('click', onWindowClick, true);
			window.removeEventListener('keydown', onWindowKey);
		}
	});
</script>

<div class="tp-root">
	<button
		bind:this={triggerEl}
		type="button"
		class="tp-trigger"
		class:tp-trigger--compact={compact}
		on:click={toggleOpen}
		aria-haspopup="dialog"
		aria-expanded={open}
		aria-label={ariaLabel}
		{id}
	>
		<span class="tp-display" class:tp-display--placeholder={!value}>
			{value || '--:--'}
		</span>
		<svg class="tp-icon" width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
			<circle cx="12" cy="12" r="10" stroke-width="2" />
			<polyline points="12 6 12 12 16 14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
	</button>

	{#if open}
		<div
			bind:this={popoverEl}
			class="tp-popover"
			role="dialog"
			aria-modal="false"
			aria-label={ariaLabel || $t('common.time')}
		>
			<div class="tp-cols">
				<div class="tp-col" bind:this={hoursListEl}>
					{#each hourOptions as h}
						<button
							type="button"
							class="tp-cell"
							class:tp-cell--selected={parsed.h === h}
							data-hour={h}
							on:click={() => selectHour(h)}
						>
							{pad(h)}
						</button>
					{/each}
				</div>
				<div class="tp-sep" aria-hidden="true">:</div>
				<div class="tp-col" bind:this={minutesListEl}>
					{#each minuteOptions as m}
						<button
							type="button"
							class="tp-cell"
							class:tp-cell--selected={parsed.m === m}
							data-min={m}
							on:click={() => selectMinute(m)}
						>
							{pad(m)}
						</button>
					{/each}
				</div>
			</div>
			<div class="tp-footer">
				<button type="button" class="tp-action" on:click={clearValue}>
					{$t('common.clear') ?? 'Clear'}
				</button>
				<button type="button" class="tp-action tp-action--primary" on:click={applyAndClose}>
					{$t('common.done') ?? 'Done'}
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.tp-root {
		position: relative;
		width: 100%;
	}
	.tp-trigger {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		width: 100%;
		min-height: 44px;
		padding: 8px 12px;
		font: inherit;
		font-size: 14px;
		color: var(--text-primary);
		background: var(--surface-card);
		border: 1px solid var(--border);
		border-radius: 12px;
		cursor: pointer;
		text-align: left;
		transition: border-color 150ms ease-out, box-shadow 150ms ease-out;
	}
	.tp-trigger--compact {
		min-height: 32px;
		padding: 4px 8px;
		font-size: 13px;
		gap: 6px;
		border-radius: 8px;
	}
	.tp-trigger:hover { border-color: var(--text-muted); }
	.tp-trigger:focus-visible {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px rgba(var(--brand-rgb, 99,102,241), 0.18);
	}
	.tp-display { font-variant-numeric: tabular-nums; }
	.tp-display--placeholder { color: var(--text-muted); }
	.tp-icon {
		flex-shrink: 0;
		color: var(--text-muted);
	}

	.tp-popover {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		z-index: 50;
		min-width: 200px;
		padding: 12px;
		background: var(--surface-card);
		border: 1px solid var(--border);
		border-radius: 14px;
		box-shadow: 0 12px 32px rgba(44, 37, 32, 0.18);
		font-size: 13px;
	}
	.tp-cols {
		display: flex;
		align-items: stretch;
		gap: 6px;
	}
	.tp-col {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 196px;
		overflow-y: auto;
		flex: 1;
		padding: 2px;
		scroll-snap-type: y mandatory;
	}
	.tp-sep {
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		color: var(--text-muted);
	}
	.tp-cell {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 32px;
		min-width: 56px;
		padding: 4px 8px;
		border-radius: 6px;
		background: transparent;
		border: 1px solid transparent;
		font: inherit;
		font-size: 14px;
		color: var(--text-primary);
		cursor: pointer;
		font-variant-numeric: tabular-nums;
		scroll-snap-align: center;
	}
	.tp-cell:hover {
		background: var(--surface-muted);
	}
	.tp-cell:focus-visible {
		outline: none;
		border-color: var(--accent);
	}
	.tp-cell--selected {
		background: var(--accent);
		color: var(--on-brand, #fff);
	}
	.tp-cell--selected:hover {
		background: var(--accent);
		opacity: 0.9;
	}
	.tp-footer {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		margin-top: 10px;
		padding-top: 8px;
		border-top: 1px solid var(--border);
	}
	.tp-action {
		padding: 6px 10px;
		font-size: 12px;
		font-weight: 500;
		border-radius: 8px;
		background: transparent;
		border: 1px solid var(--border);
		color: var(--text-secondary);
		cursor: pointer;
	}
	.tp-action:hover {
		background: var(--surface-muted);
	}
	.tp-action--primary {
		background: var(--accent);
		color: var(--on-brand, #fff);
		border-color: var(--accent);
	}
	.tp-action--primary:hover {
		background: var(--accent);
		opacity: 0.9;
	}
</style>
