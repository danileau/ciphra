<!--
	CIPH-854 — Phase context card.

	For the phase-band cohort (bipolar / MS / long-covid / IBD / IBS /
	chronic_pain / anxiety_depression / burnout). Reads the currently
	active multi-day episode from recent entries and renders:

		"<phase label> — day N"
		"Started <date>"

	Renders nothing when no phase is active today. For the phase cohort
	this is the most important context: you're in a flare/episode, the
	doctor needs to know which day. Position: above all charts.
-->
<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { isCustomItem } from '$lib/blueprint';

	export let phase: {
		id: string;
		label: string;
		color: string;
		dayN: number;
		startedOn: string;
		/** CIPH-855b — total number of multiDay phases active on anchor day. */
		activeCount?: number;
	} | null;

	$: startedLabel = phase
		? new Date(phase.startedOn + 'T12:00:00').toLocaleDateString($locale, {
				weekday: 'short',
				day: 'numeric',
				month: 'long',
			})
		: '';
</script>

{#if phase}
<!-- CIPH-894 — high-emphasis density: thicker accent left rail + subtle
	 cohort-tinted background pulls the card forward as the most important
	 cohort signal on the dashboard. -->
<section
	class="card-anchor phase-context-emphasis"
	aria-labelledby="phase-context-heading"
	data-density="emphasis"
>
	<div class="flex items-center gap-4">
		<div class="text-center shrink-0">
			<p class="text-3xl font-bold num-data" style="color: {phase.color}">
				{$t('phase.day_n', { n: phase.dayN })}
			</p>
			<p class="text-[10px] uppercase tracking-wider font-medium" style="color: var(--text-muted)">
				{$t('phase.day_label')}
			</p>
		</div>
		<div class="flex-1 min-w-0">
			<div class="flex items-center gap-2 flex-wrap">
				<p id="phase-context-heading" class="text-sm font-semibold" style="color: var(--text-primary)">
					{$t('phase.active_title')}
				</p>
				<span class="text-xs px-2 py-0.5 rounded-full" style="background: {phase.color}20; color: {phase.color}">
					{isCustomItem(phase.id) ? phase.label : $t(phase.label)}
				</span>
				{#if phase.activeCount && phase.activeCount > 1}
					<!-- CIPH-855b — neutral count-based pill for overlapping phases
						 (bipolar mixed states, long-covid PEM overlap, IBD with 2
						 flare types). Clinically honest without forcing DSM
						 terminology into the home UI. -->
					<span class="text-[10px] px-2 py-0.5 rounded-full font-medium" style="background: var(--surface-muted); color: var(--text-secondary); border: 1px solid var(--border)">
						{$t('phase.n_active', { n: phase.activeCount })}
					</span>
				{/if}
			</div>
			<p class="text-xs mt-1" style="color: var(--text-muted)">
				{$t('phase.started_on', { date: startedLabel })}
			</p>
		</div>
	</div>
</section>
{/if}

<style>
	/* CIPH-894 — emphasis density: heavier accent rail + cohort-tinted
	   background tint. Inherits from .card-anchor (CIPH-202 + CIPH-891
	   2px accent border + 24px padding). */
	.phase-context-emphasis {
		border-left-width: 6px;
		background: linear-gradient(
			to right,
			rgba(var(--accent-rgb), 0.05) 0%,
			var(--surface-card) 40%
		);
	}
</style>
