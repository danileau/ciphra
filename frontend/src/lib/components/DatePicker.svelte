<!--
	DatePicker — fully custom, brand-consistent, locale-aware.

	Replaces the native browser date-picker popover entirely. The native
	`<input type="date">` chrome is browser-OS controlled — it can't be
	restyled, and its calendar UI ignores the page's `$locale` (often
	rendering in English even when ciphra is set to DE/FR/IT). We render
	our own popover instead.

	Value contract: ISO `YYYY-MM-DD` (matches the previous native-input
	contract), so callers don't need to update.

	Display format defaults to `dd.mm.yyyy` (Swiss/EU). Settings toggle
	for alternative formats is queued for PI v18.

	PI v17 — addressed user feedback "datepicker breaks the design with
	its sharp edges and 2000ish design" + "in english and doesnt respect
	the selected language".

	`mode="month"` (2026-09-19) picks a month instead of a day, for history
	entered from memory: nobody knows the day a dose changed three years ago,
	and a picker that demands one gets an invented answer. The value stays an
	ISO date — the first day of the month, or its last when `monthEdge="end"`
	— so every reader keeps comparing plain dates; the caller records the
	precision beside it. `max` bounds both modes: history cannot end in the
	future.
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { locale, t } from '$lib/i18n';

	export let value: string = '';
	export let id: string = '';
	export let format: 'dd.mm.yyyy' | 'dd/mm/yyyy' | 'iso' | 'us' = 'dd.mm.yyyy';
	export let ariaLabel: string | undefined = undefined;
	/** `day` picks a date, `month` picks a month (see the header comment). */
	export let mode: 'day' | 'month' = 'day';
	/** Which day of the chosen month the value lands on, in month mode. */
	export let monthEdge: 'start' | 'end' = 'start';
	/** Latest selectable date, ISO. Later days and months are disabled. */
	export let max: string = '';

	let triggerEl: HTMLButtonElement | null = null;
	let popoverEl: HTMLDivElement | null = null;
	let open = false;

	// Cursor month (what the popover is showing). Initialised from `value`
	// or today on first open.
	let cursorYear = new Date().getFullYear();
	let cursorMonth = new Date().getMonth(); // 0-indexed

	function pad(n: number): string {
		return String(n).padStart(2, '0');
	}

	function formatDisplay(iso: string): string {
		if (!iso) return '';
		const [y, m, d] = iso.split('-');
		if (!y || !m || !d) return iso;
		if (mode === 'month') return `${m}/${y}`;
		switch (format) {
			case 'dd/mm/yyyy':
				return `${d}/${m}/${y}`;
			case 'iso':
				return `${y}-${m}-${d}`;
			case 'us':
				return `${m}/${d}/${y}`;
			case 'dd.mm.yyyy':
			default:
				return `${d}.${m}.${y}`;
		}
	}

	$: display = formatDisplay(value);
	// The hint has to be readable in the reader's language: "TT.MM.JJJJ" is
	// only a hint if you know T is for Tag (2026-09-19).
	$: placeholder = (() => {
		if (mode === 'month') return $t('common.month_placeholder');
		switch (format) {
			case 'dd/mm/yyyy': return $t('common.date_placeholder_slash');
			case 'iso': return $t('common.date_placeholder_iso');
			case 'us': return $t('common.date_placeholder_us');
			case 'dd.mm.yyyy':
			default: return $t('common.date_placeholder_dot');
		}
	})();

	function toggleOpen() {
		if (open) {
			open = false;
			return;
		}
		// Seed cursor from current value or today
		if (value) {
			const [y, m] = value.split('-').map(Number);
			cursorYear = y;
			cursorMonth = m - 1;
		} else {
			const now = new Date();
			cursorYear = now.getFullYear();
			cursorMonth = now.getMonth();
		}
		open = true;
	}

	function closePopover() {
		open = false;
	}

	const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
	const lastDayOf = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
	const beyondMax = (iso: string) => !!max && iso > max;

	function commit(iso: string) {
		if (beyondMax(iso)) return;
		value = iso;
		open = false;
		// Return focus to trigger so keyboard users don't get stranded.
		triggerEl?.focus();
	}

	function selectDay(day: number) {
		commit(isoOf(cursorYear, cursorMonth, day));
	}

	/** In month mode the value is a real date at the chosen edge of the month,
	 *  clamped so "this month" never reaches past `max`. */
	function selectMonth(month: number) {
		const last = lastDayOf(cursorYear, month);
		const iso = monthEdge === 'end' ? isoOf(cursorYear, month, last) : isoOf(cursorYear, month, 1);
		if (beyondMax(iso) && !beyondMax(isoOf(cursorYear, month, 1))) {
			commit(max);
			return;
		}
		commit(iso);
	}

	function shiftMonth(delta: number) {
		const d = new Date(cursorYear, cursorMonth + delta, 1);
		cursorYear = d.getFullYear();
		cursorMonth = d.getMonth();
	}

	function shiftYear(delta: number) {
		cursorYear += delta;
	}

	$: monthNames = Array.from({ length: 12 }, (_, i) =>
		new Date(2024, i, 1).toLocaleDateString($locale, { month: 'short' }),
	);
	$: monthDisabled = (m: number) => beyondMax(isoOf(cursorYear, m, 1));
	$: dayDisabled = (d: number) => beyondMax(isoOf(cursorYear, cursorMonth, d));
	$: navDisabled = mode === 'month'
		? beyondMax(isoOf(cursorYear + 1, 0, 1))
		: beyondMax(isoOf(cursorYear, cursorMonth + 1, 1));

	function jumpToToday() {
		const now = new Date();
		commit(isoOf(now.getFullYear(), now.getMonth(), now.getDate()));
	}

	function clearValue() {
		value = '';
		open = false;
		triggerEl?.focus();
	}

	// Month/weekday names — locale-driven.
	$: monthLabel = new Date(cursorYear, cursorMonth, 1)
		.toLocaleDateString($locale, { month: 'long', year: 'numeric' });
	// Monday-first week order, narrow weekday headers (M, D, M, D, F, S, S).
	$: weekdayHeaders = Array.from({ length: 7 }, (_, i) => {
		const d = new Date(2024, 0, i + 1); // Jan 1 2024 is Monday
		return d.toLocaleDateString($locale, { weekday: 'narrow' });
	});

	// Compute the day grid for the cursor month. 6 rows × 7 cols. Empty
	// leading cells until day-1's weekday slot, then 1..daysInMonth, then
	// trailing empties to fill the grid (kept null so they don't render
	// as clickable).
	$: gridDays = (() => {
		const first = new Date(cursorYear, cursorMonth, 1);
		const dayOfWeek = (first.getDay() + 6) % 7; // Mon=0 ... Sun=6
		const daysInMonth = new Date(cursorYear, cursorMonth + 1, 0).getDate();
		const out: (number | null)[] = [];
		for (let i = 0; i < dayOfWeek; i++) out.push(null);
		for (let d = 1; d <= daysInMonth; d++) out.push(d);
		while (out.length % 7 !== 0) out.push(null);
		return out;
	})();

	// Highlight today + the selected day.
	const todayY = new Date().getFullYear();
	const todayM = new Date().getMonth();
	const todayD = new Date().getDate();
	$: selectedY = value ? Number(value.slice(0, 4)) : -1;
	$: selectedM = value ? Number(value.slice(5, 7)) - 1 : -1;
	$: selectedD = value ? Number(value.slice(8, 10)) : -1;

	function dayClass(day: number): string {
		const isToday = day === todayD && cursorYear === todayY && cursorMonth === todayM;
		const isSelected = day === selectedD && cursorYear === selectedY && cursorMonth === selectedM;
		return [
			'dp-day',
			isToday ? 'dp-day--today' : '',
			isSelected ? 'dp-day--selected' : '',
		].filter(Boolean).join(' ');
	}

	function monthClass(month: number): string {
		const isSelected = month === selectedM && cursorYear === selectedY;
		return ['dp-month', isSelected ? 'dp-day--selected' : ''].filter(Boolean).join(' ');
	}

	// Outside-click + Escape close.
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

<div class="dp-root">
	<button
		bind:this={triggerEl}
		type="button"
		class="dp-trigger"
		on:click={toggleOpen}
		aria-haspopup="dialog"
		aria-expanded={open}
		aria-label={ariaLabel}
		{id}
	>
		<span class="dp-display" class:dp-display--placeholder={!value}>
			{display || placeholder}
		</span>
		<svg class="dp-icon" width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
			<rect x="3" y="4" width="18" height="18" rx="2" stroke-width="2" />
			<line x1="16" y1="2" x2="16" y2="6" stroke-width="2" stroke-linecap="round" />
			<line x1="8" y1="2" x2="8" y2="6" stroke-width="2" stroke-linecap="round" />
			<line x1="3" y1="10" x2="21" y2="10" stroke-width="2" />
		</svg>
	</button>

	{#if open}
		<div
			bind:this={popoverEl}
			class="dp-popover"
			role="dialog"
			aria-modal="false"
			aria-label={ariaLabel || $t('common.date')}
		>
			<div class="dp-header">
				<button
					type="button"
					class="dp-nav"
					on:click={() => (mode === 'month' ? shiftYear(-1) : shiftMonth(-1))}
					aria-label={mode === 'month' ? $t('common.previous_year') : $t('common.previous_month')}
				>
					<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</button>
				<span class="dp-month-label">{mode === 'month' ? cursorYear : monthLabel}</span>
				<button
					type="button"
					class="dp-nav"
					on:click={() => (mode === 'month' ? shiftYear(1) : shiftMonth(1))}
					disabled={navDisabled}
					aria-label={mode === 'month' ? $t('common.next_year') : $t('common.next_month')}
				>
					<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</button>
			</div>
			{#if mode === 'month'}
				<div class="dp-months">
					{#each monthNames as name, i}
						<button
							type="button"
							class={monthClass(i)}
							disabled={monthDisabled(i)}
							on:click={() => selectMonth(i)}
						>
							{name}
						</button>
					{/each}
				</div>
			{:else}
				<div class="dp-weekdays">
					{#each weekdayHeaders as wd}
						<span class="dp-wd">{wd}</span>
					{/each}
				</div>
				<div class="dp-grid">
					{#each gridDays as day}
						{#if day === null}
							<span class="dp-day-empty"></span>
						{:else}
							<button
								type="button"
								class={dayClass(day)}
								disabled={dayDisabled(day)}
								on:click={() => selectDay(day)}
							>
								{day}
							</button>
						{/if}
					{/each}
				</div>
			{/if}
			<div class="dp-footer">
				<button type="button" class="dp-action" on:click={clearValue}>
					{$t('common.clear') ?? 'Clear'}
				</button>
				{#if mode !== 'month'}
					<button type="button" class="dp-action dp-action--primary" on:click={jumpToToday}>
						{$t('common.today')}
					</button>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.dp-root {
		position: relative;
		width: 100%;
	}
	.dp-trigger {
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
	.dp-trigger:hover { border-color: var(--text-muted); }
	.dp-trigger:focus-visible {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px rgba(var(--brand-rgb, 99,102,241), 0.18);
	}
	.dp-display {
		font-variant-numeric: tabular-nums;
	}
	.dp-display--placeholder { color: var(--text-muted); }
	.dp-icon {
		flex-shrink: 0;
		color: var(--text-muted);
	}

	.dp-popover {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		z-index: 50;
		width: 280px;
		max-width: calc(100vw - 32px);
		padding: 12px;
		background: var(--surface-card);
		border: 1px solid var(--border);
		border-radius: 14px;
		box-shadow: 0 12px 32px rgba(44, 37, 32, 0.18);
		font-size: 13px;
	}
	.dp-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		margin-bottom: 8px;
	}
	.dp-nav {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		background: transparent;
		border: 1px solid transparent;
		color: var(--text-secondary);
		cursor: pointer;
	}
	.dp-nav:hover {
		background: var(--surface-muted);
		border-color: var(--border);
	}
	.dp-month-label {
		flex: 1;
		text-align: center;
		font-weight: 600;
		color: var(--text-primary);
		text-transform: capitalize;
	}
	.dp-weekdays {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 2px;
		margin-bottom: 4px;
	}
	.dp-wd {
		text-align: center;
		font-size: 11px;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 4px 0;
	}
	.dp-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 2px;
	}
	.dp-day-empty {
		display: block;
		min-height: 32px;
	}
	.dp-day {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 32px;
		padding: 4px;
		border-radius: 6px;
		background: transparent;
		border: 1px solid transparent;
		font: inherit;
		font-size: 13px;
		color: var(--text-primary);
		cursor: pointer;
		font-variant-numeric: tabular-nums;
	}
	.dp-day:hover {
		background: var(--surface-muted);
	}
	.dp-day:focus-visible {
		outline: none;
		border-color: var(--accent);
	}
	.dp-day--today {
		font-weight: 700;
		color: var(--accent);
	}
	.dp-day--selected {
		background: var(--accent);
		color: var(--on-brand, #fff);
	}
	.dp-day--selected:hover {
		background: var(--accent);
		opacity: 0.9;
	}
	.dp-day:disabled,
	.dp-month:disabled,
	.dp-nav:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.dp-day:disabled:hover,
	.dp-month:disabled:hover {
		background: transparent;
	}
	.dp-months {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 4px;
	}
	.dp-month {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 40px;
		padding: 4px 8px;
		border-radius: 8px;
		background: transparent;
		border: 1px solid transparent;
		font: inherit;
		font-size: 13px;
		color: var(--text-primary);
		cursor: pointer;
	}
	.dp-month:hover {
		background: var(--surface-muted);
	}
	.dp-month:focus-visible {
		outline: none;
		border-color: var(--accent);
	}
	.dp-footer {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		margin-top: 10px;
		padding-top: 8px;
		border-top: 1px solid var(--border);
	}
	.dp-action {
		padding: 6px 10px;
		font-size: 12px;
		font-weight: 500;
		border-radius: 8px;
		background: transparent;
		border: 1px solid var(--border);
		color: var(--text-secondary);
		cursor: pointer;
	}
	.dp-action:hover {
		background: var(--surface-muted);
	}
	.dp-action--primary {
		background: var(--accent);
		color: var(--on-brand, #fff);
		border-color: var(--accent);
	}
	.dp-action--primary:hover {
		background: var(--accent);
		opacity: 0.9;
	}
</style>
