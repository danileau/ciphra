<!--
	ciphra — period picker for the /reports doctor export.

	Renders the PANEL only; the trigger is the export card in
	routes/reports/+page.svelte, which owns `aria-haspopup` / `aria-expanded`
	and takes focus back on close. Pass that card in as `anchor` so
	click-outside can tell "clicked the trigger again" from "clicked away".

	Two presentations, one behaviour:
	  ≥640px  anchored listbox under the card, keyboard-driven like
	          LocaleSelect (the repo's custom-listbox precedent — a native
	          <select> panel is browser chrome CSS cannot reach).
	  <640px  BottomSheet. Touch has no hover, and a layer anchored under
	          the third card in a 3-up grid gets clipped at the viewport
	          edge. BottomSheet also brings its own focus trap.

	Every row states its real coverage. Sparse windows are offered rather
	than hidden — a 2-year pair straddling an empty year is a legitimate
	thing to hand a doctor — but they are labelled, not flattered.
-->
<script lang="ts">
	import { createEventDispatcher, onMount, tick } from 'svelte';
	import { t, locale, plural } from '$lib/i18n';
	import BottomSheet from './BottomSheet.svelte';
	import { formatPeriodLabel, type PeriodOption } from '$lib/reports/exportPeriods';

	export let open = false;
	export let options: PeriodOption[] = [];
	/** Row pre-selected on open — the period covering the month on screen. */
	export let selectedIndex = 0;
	export let heading = '';
	/** The trigger card, so an outside-click check can exclude it. */
	export let anchor: HTMLElement | null = null;

	const dispatch = createEventDispatcher<{ pick: PeriodOption; close: void }>();

	let listbox: HTMLUListElement | null = null;
	let activeIdx = 0;
	let isNarrow = false;
	// Mirrors LocaleSelect: default below, flip up only when there is
	// genuinely no room. The export cards sit low on /reports, so on short
	// windows the panel would otherwise open off-screen.
	let placement: 'below' | 'above' = 'below';

	/** Sparse enough that the user should see it before handing it to a doctor. */
	const SPARSE_RATIO = 0.5;

	function focusRow(i: number) {
		listbox?.querySelector<HTMLButtonElement>(`[data-i="${i}"]`)?.focus();
	}

	function updatePlacement() {
		if (!anchor || typeof window === 'undefined') return;
		const rect = anchor.getBoundingClientRect();
		const estimated = Math.min(options.length * 52 + 16, 320);
		const spaceBelow = window.innerHeight - rect.bottom;
		placement = spaceBelow < estimated + 24 && rect.top > spaceBelow ? 'above' : 'below';
	}

	// Open: land focus on the pre-selected row so Enter repeats the PDF the
	// old one-click flow produced.
	$: if (open) {
		activeIdx = selectedIndex >= 0 && selectedIndex < options.length ? selectedIndex : 0;
		updatePlacement();
		tick().then(() => focusRow(activeIdx));
	}

	function onKey(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			dispatch('close');
			return;
		}
		// BottomSheet runs its own focus trap; only the anchored panel needs
		// roving focus.
		if (isNarrow || options.length === 0) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			activeIdx = (activeIdx + 1) % options.length;
			focusRow(activeIdx);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			activeIdx = (activeIdx - 1 + options.length) % options.length;
			focusRow(activeIdx);
		} else if (e.key === 'Home') {
			e.preventDefault();
			activeIdx = 0;
			focusRow(activeIdx);
		} else if (e.key === 'End') {
			e.preventDefault();
			activeIdx = options.length - 1;
			focusRow(activeIdx);
		}
	}

	function onWindowClick(e: MouseEvent) {
		if (!open || isNarrow) return;
		const target = e.target as Node;
		if (listbox?.contains(target) || anchor?.contains(target)) return;
		dispatch('close');
	}

	onMount(() => {
		if (typeof window === 'undefined') return;
		if (typeof window.matchMedia === 'function') {
			const mq = window.matchMedia('(max-width: 639px)');
			isNarrow = mq.matches;
			const onChange = (e: MediaQueryListEvent) => { isNarrow = e.matches; };
			mq.addEventListener('change', onChange);
			window.addEventListener('click', onWindowClick);
			window.addEventListener('resize', updatePlacement);
			return () => {
				mq.removeEventListener('change', onChange);
				window.removeEventListener('click', onWindowClick);
				window.removeEventListener('resize', updatePlacement);
			};
		}
		window.addEventListener('click', onWindowClick);
		return () => window.removeEventListener('click', onWindowClick);
	});

	function coverageOf(option: PeriodOption): string {
		const days = plural($t, $locale, 'reports.period_days', option.daysLogged);
		if (option.monthsInWindow === 1) return days;
		return `${days} · ${$t('reports.period_months_covered', {
			covered: option.monthsWithData,
			total: option.monthsInWindow,
		})}`;
	}

	const isSparse = (o: PeriodOption) =>
		o.monthsInWindow > 1 && o.monthsWithData / o.monthsInWindow < SPARSE_RATIO;
</script>

<svelte:window on:keydown={onKey} />

{#if isNarrow}
	<BottomSheet {open} on:close={() => dispatch('close')}>
		<h3 class="period-sheet-heading">{heading}</h3>
		<ul class="period-list" data-testid="period-picker" role="listbox" aria-label={heading}>
			{#each options as option, i (option.id)}
				<li role="presentation">
					<button
						type="button"
						data-testid="period-option"
						data-period-id={option.id}
						class="period-option"
						class:selected={i === selectedIndex}
						role="option"
						aria-selected={i === selectedIndex}
						data-i={i}
						on:click={() => dispatch('pick', option)}
					>
						<span class="period-option__label">{formatPeriodLabel(option, $locale)}</span>
						<span class="period-option__meta">
							{coverageOf(option)}
							{#if isSparse(option)}
								<span class="period-option__sparse">{$t('reports.period_sparse')}</span>
							{/if}
						</span>
					</button>
				</li>
			{/each}
		</ul>
	</BottomSheet>
{:else if open}
	<ul
		bind:this={listbox}
		class="period-list period-list--anchored placement-{placement}"
		data-testid="period-picker"
		role="listbox"
		aria-label={heading}
	>
		{#each options as option, i (option.id)}
			<li role="presentation">
				<button
					type="button"
					data-testid="period-option"
					data-period-id={option.id}
					class="period-option"
					class:selected={i === selectedIndex}
					role="option"
					aria-selected={i === selectedIndex}
					data-i={i}
					on:click={() => dispatch('pick', option)}
				>
					<span class="period-option__label">{formatPeriodLabel(option, $locale)}</span>
					<span class="period-option__meta">
						{coverageOf(option)}
						{#if isSparse(option)}
							<span class="period-option__sparse">{$t('reports.period_sparse')}</span>
						{/if}
					</span>
				</button>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.period-sheet-heading {
		margin: 0 0 0.5rem;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.period-list {
		margin: 0;
		padding: 4px;
		list-style: none;
	}

	.period-list--anchored {
		position: absolute;
		left: 0;
		right: 0;
		min-width: 12rem;
		max-height: 320px;
		overflow-y: auto;
		background: var(--surface-card);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04);
		z-index: 50;
	}
	.period-list--anchored.placement-below {
		top: calc(100% + 6px);
		bottom: auto;
	}
	.period-list--anchored.placement-above {
		bottom: calc(100% + 6px);
		top: auto;
	}

	.period-option {
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 100%;
		/* 44px floor — the /reports touch-target contract. */
		min-height: 44px;
		padding: 8px 12px;
		text-align: left;
		background: transparent;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		transition: background 0.12s ease-out, color 0.12s ease-out;
	}
	.period-option:hover,
	.period-option:focus-visible {
		background: var(--surface-muted);
		outline: none;
	}
	.period-option.selected .period-option__label {
		font-weight: 600;
	}

	.period-option__label {
		font-size: 0.875rem;
		color: var(--text-primary);
	}

	.period-option__meta {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.6875rem;
		color: var(--text-muted);
	}

	.period-option__sparse {
		padding: 1px 6px;
		font-size: 0.625rem;
		border-radius: 9999px;
		background: var(--surface-muted);
		color: var(--text-secondary);
		border: 1px solid var(--border);
	}

	@media (prefers-reduced-motion: reduce) {
		.period-option {
			transition: none;
		}
	}
</style>
