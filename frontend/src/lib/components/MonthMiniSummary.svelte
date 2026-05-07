<!--
	MonthMiniSummary — calendar right-rail tail (CIPH-pi19-B).

	Sits at the bottom of the persistent rail (lg:+ only, hidden via the
	parent's `hidden lg:block` wrapper). Counts trigger-days and rescue-
	med-days for the visible month so the rail says something even when
	no day is selected.

	Render-only. Inputs are pre-computed in the parent so we don't
	re-traverse `monthDocs` here. Story C will add the heatmap row as a
	new section on this same component.
-->
<script lang="ts">
	import { t } from '$lib/i18n';

	export let monthName: string;
	export let triggerDayCount: number;
	export let rescueMedDayCount: number;
	export let showTrigger: boolean;
	export let showRescue: boolean;

	$: hasAnyRow = showTrigger || showRescue;
</script>

<section class="cal-mini" aria-label={$t('calendar.mini_summary_aria', { month: monthName })}>
	<h3 class="cal-mini-title">{$t('calendar.this_month')}</h3>
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
	{:else}
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
		border-left: 3px solid transparent;
		border-right: 3px solid transparent;
		border-bottom: 6px solid var(--ochre);
	}
	.cal-mini-glyph-rescue {
		width: 3px;
		height: 12px;
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
</style>
