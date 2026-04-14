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

	export let phase: {
		id: string;
		label: string;
		color: string;
		dayN: number;
		startedOn: string;
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
<section class="card-anchor" aria-labelledby="phase-context-heading">
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
					{$t(phase.label)}
				</span>
			</div>
			<p class="text-xs mt-1" style="color: var(--text-muted)">
				{$t('phase.started_on', { date: startedLabel })}
			</p>
		</div>
	</div>
</section>
{/if}
