<!--
	CIPH-893 — Reports empty state.

	Clinical "Insufficient data" panel: tabular silhouette with greyed
	dashes as cell content + a footnote. Distinct from the Asterisk
	hero — speaks the language of a clinical report (rows + columns)
	even when empty.
-->
<script lang="ts">
	import { t } from '$lib/i18n';

	/** Number of days of data the user actually has. The threshold copy
	 *  surfaces this so the user knows how much more logging is needed. */
	export let daysLogged: number = 0;
	/** Threshold below which "insufficient data" applies. Default 7
	 *  matches the doctor-PDF scope minimum. */
	export let threshold: number = 7;
</script>

<section
	class="reports-empty"
	aria-label={$t('reports.empty_aria')}
	data-testid="reports-empty"
>
	<table class="reports-empty-table" aria-hidden="true">
		<thead>
			<tr>
				<th></th>
				<th></th>
				<th></th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each Array(4) as _}
				<tr>
					<td>—</td>
					<td>—</td>
					<td>—</td>
					<td>—</td>
				</tr>
			{/each}
		</tbody>
	</table>
	<p class="reports-empty-title">{$t('reports.empty_title')}</p>
	{#if daysLogged === 0}
		<!-- Fresh-account hint: the /reports grid is the historical answer
			 to "epilepc CRUD is too cumbersome, I want a 2-axis Excel-like
			 table" (see project_excel_view_provenance.md). On day 0 the
			 grid is hidden, so introduce its editing affordance up front
			 instead of only framing this surface as a report-quality
			 threshold. -->
		<p class="reports-empty-caption">{$t('reports.empty_caption_fresh')}</p>
	{:else}
		<p class="reports-empty-caption">
			{$t('reports.empty_caption', {
				logged: String(daysLogged),
				needed: String(Math.max(0, threshold - daysLogged)),
			})}
		</p>
	{/if}
</section>

<style>
	.reports-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		padding: 32px 16px;
		text-align: center;
	}
	.reports-empty-table {
		width: 100%;
		max-width: 320px;
		border-collapse: collapse;
		opacity: 0.45;
	}
	.reports-empty-table th {
		height: 24px;
		border-bottom: 1px solid var(--border);
		background: var(--surface-muted);
	}
	.reports-empty-table td {
		padding: 6px 8px;
		border-bottom: 1px solid var(--border-subtle);
		text-align: center;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
		font-size: 14px;
	}
	.reports-empty-title {
		font-size: 16px;
		font-weight: 600;
		color: var(--text-primary);
	}
	.reports-empty-caption {
		font-size: 14px;
		color: var(--text-muted);
		max-width: 320px;
	}
</style>
