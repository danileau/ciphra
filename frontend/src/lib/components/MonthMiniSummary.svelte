<!--
	MonthMiniSummary — calendar right-rail tail (CIPH-pi19-B + C).

	Sits at the bottom of the persistent rail (lg:+ only, hidden via the
	parent's `hidden lg:block` wrapper). Counts trigger-days and rescue-
	med-days for the visible month so the rail says something even when
	no day is selected.

	CIPH-pi19-C — adds a 28-31-cell trigger-pressure strip above the
	count rows when the blueprint declares triggers. Each cell maps a
	day of the visible month; opacity buckets the trigger-count into
	5 levels (none / 1 / 2 / 3-4 / 5+). Click dispatches `selectday`
	with an ISO date string so the parent can update `selectedDate`.

	Render-only. Inputs are pre-computed in the parent so we don't
	re-traverse `monthDocs` here.
-->
<script lang="ts">
	import { t, locale, plural } from '$lib/i18n';
	import { createEventDispatcher } from 'svelte';

	export let monthName: string;
	export let triggerDayCount: number;
	export let rescueMedDayCount: number;
	export let showTrigger: boolean;
	export let showRescue: boolean;
	// CIPH-pi19-C — heatmap inputs. monthPrefix is the YYYY-MM string the
	// parent already computes (e.g. "2026-05"); daysInMonth is 28-31.
	// triggerCountByDay maps the same `${monthPrefix}-DD` keys used in
	// the calendar's per-cell tally. Defaulted so older callers still
	// compile during the staged rollout.
	export let monthPrefix: string = '';
	export let daysInMonth: number = 0;
	export let triggerCountByDay: Map<string, number> = new Map();

	const dispatch = createEventDispatcher<{ selectday: string }>();

	$: hasAnyRow = showTrigger || showRescue;
	// Heatmap renders only when the blueprint declares triggers AND the
	// parent has wired the day-tally inputs. Below lg the component isn't
	// mounted at all (parent's `hidden lg:block` wrapper handles that).
	$: showHeatmap = showTrigger && daysInMonth > 0 && monthPrefix.length > 0;

	/** Discrete 5-bucket opacity ramp for the ochre cell tint. */
	function bucketOpacity(count: number): number {
		if (count <= 0) return 0;
		if (count === 1) return 0.3;
		if (count === 2) return 0.5;
		if (count <= 4) return 0.7;
		return 0.9;
	}
</script>

<section class="cal-mini" aria-label={$t('calendar.mini_summary_aria', { month: monthName })}>
	<h3 class="cal-mini-title">{$t('calendar.this_month')}</h3>
	{#if showHeatmap}
		<!-- CIPH-pi19-C — trigger pressure strip. One cell per day of the
			 visible month, colored ochre at bucketed opacity. Click jumps
			 to that day via the `selectday` event. Empty days render as a
			 hairline so the column position stays readable. -->
		<div class="cal-mini-heat-wrap">
			<p class="cal-mini-heat-label">{$t('calendar.trigger_pressure')}</p>
			<div
				class="cal-mini-heat"
				role="group"
				aria-label={$t('calendar.trigger_pressure_aria', { month: monthName })}
				style="grid-template-columns: repeat({daysInMonth}, 1fr);"
			>
				{#each Array.from({ length: daysInMonth }, (_, i) => i + 1) as day}
					{@const dateStr = `${monthPrefix}-${String(day).padStart(2, '0')}`}
					{@const count = triggerCountByDay.get(dateStr) ?? 0}
					{@const opacity = bucketOpacity(count)}
					<button
						type="button"
						class="cal-mini-heat-cell"
						class:is-empty={count === 0}
						style="--cal-heat-alpha: {opacity};"
						aria-label={count > 0
							? plural($t, $locale, 'calendar.trigger_pressure_cell', count, { day: String(day) })
							: $t('calendar.trigger_pressure_cell_empty', { day: String(day) })}
						on:click={() => dispatch('selectday', dateStr)}
					></button>
				{/each}
			</div>
		</div>
	{/if}
	{#if hasAnyRow}
		<dl class="cal-mini-rows">
			{#if showTrigger}
				<div class="cal-mini-row">
					<dt class="cal-mini-label">
						<span aria-hidden="true" class="cal-mini-glyph cal-mini-glyph-trigger"></span>
						{$t('calendar.mini_trigger_days')}
					</dt>
					<dd class="cal-mini-value">{triggerDayCount}</dd>
				</div>
			{/if}
			{#if showRescue}
				<div class="cal-mini-row">
					<dt class="cal-mini-label">
						<span aria-hidden="true" class="cal-mini-glyph cal-mini-glyph-rescue"></span>
						{$t('calendar.mini_rescue_days')}
					</dt>
					<dd class="cal-mini-value">{rescueMedDayCount}</dd>
				</div>
			{/if}
		</dl>
	{:else if !showHeatmap}
		<p class="cal-mini-empty">{$t('calendar.mini_summary_empty')}</p>
	{/if}
</section>

<style>
	.cal-mini {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 16px 0 0;
		margin-top: 16px;
		border-top: 1px solid var(--border-subtle, var(--border));
	}
	.cal-mini-title {
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-secondary);
		margin: 0;
	}
	.cal-mini-rows {
		display: flex;
		flex-direction: column;
		gap: 0;
		margin: 0;
	}
	.cal-mini-row {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: baseline;
		gap: 12px;
		padding: 6px 0;
		border-bottom: 1px solid var(--border-subtle, var(--border));
	}
	.cal-mini-row:last-child {
		border-bottom: none;
	}
	.cal-mini-label {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		font-size: 13px;
		color: var(--text-secondary);
		margin: 0;
	}
	.cal-mini-glyph {
		display: inline-block;
		flex-shrink: 0;
	}
	.cal-mini-glyph-trigger {
		width: 0;
		height: 0;
		border-left: 4px solid transparent;
		border-right: 4px solid transparent;
		border-bottom: 8px solid var(--ochre);
	}
	.cal-mini-glyph-rescue {
		width: 4px;
		height: 14px;
		border-radius: 2px;
		background: var(--brand);
	}
	.cal-mini-value {
		font-size: 14px;
		font-weight: 500;
		color: var(--text-primary);
		font-variant-numeric: tabular-nums;
		margin: 0;
	}
	.cal-mini-empty {
		font-size: 13px;
		color: var(--text-muted);
		margin: 0;
		font-style: italic;
	}

	/* CIPH-pi19-C — trigger heatmap. Row of day-cells, ochre at bucketed
	   opacity. Empty cells render as a hairline so the strip's spatial
	   meaning (left = day 1 → right = day N) is preserved even on a
	   silent month. Cell heights are intentionally squat to read as a
	   summary strip rather than a calendar substitute. */
	.cal-mini-heat-wrap {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.cal-mini-heat-label {
		font-size: 11px;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin: 0;
	}
	.cal-mini-heat {
		display: grid;
		gap: 2px;
		width: 100%;
	}
	.cal-mini-heat-cell {
		height: 14px;
		min-width: 0;
		padding: 0;
		border: none;
		border-radius: 2px;
		cursor: pointer;
		background: var(--ochre);
		opacity: var(--cal-heat-alpha, 0);
		transition: transform 0.1s ease-out, outline-color 0.15s ease-out;
		outline: 2px solid transparent;
		outline-offset: 1px;
	}
	.cal-mini-heat-cell.is-empty {
		background: transparent;
		opacity: 1;
		box-shadow: inset 0 0 0 1px var(--border-subtle, var(--border));
	}
	.cal-mini-heat-cell:hover {
		transform: scaleY(1.15);
	}
	.cal-mini-heat-cell:focus-visible {
		outline-color: var(--brand);
	}
</style>
