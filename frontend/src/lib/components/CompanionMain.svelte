<script lang="ts">
	// CIPH-750 — Dashboard main-column wrapper.
	// Thin render-only component: receives all reactive state + handlers
	// from Companion.svelte and emits the main-column sections. Splitting
	// the markup (without duplicating the reactive cascade) is how we
	// de-risked the rail-layout story that was deferred twice.
	import { t } from '$lib/i18n';
	import ChartWrapper from '$lib/components/ChartWrapper.svelte';
	import PhaseContextCard from '$lib/components/PhaseContextCard.svelte';
	import type { Cohort } from '$lib/blueprint/cohort';

	// CIPH-854 — cohort drives ordering + which extra cards render.
	export let cohort: Cohort;
	export let activePhase: {
		id: string;
		label: string;
		color: string;
		dayN: number;
		startedOn: string;
	} | null = null;

	export let hasCycleVital: boolean;
	// Discriminated-union cycle state from Companion.svelte. Kept `any` at
	// the boundary to avoid re-exporting the inline type — all the typed
	// logic lives in the parent.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export let cycleState: any;
	export let PHASE_COLORS: Record<string, string>;

	export let episodeChartData: unknown;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export let episodeChartOptions: any;
	export let symptomChartData: unknown;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export let symptomChartOptions: any;

	export let companionChartScope: 'month' | 'year' | 'max';
	export let yearChartAvailable: boolean;
	export let maxChartAvailable: boolean;
	export let symptomChartScope: 'month' | 'year' | 'max';
	export let symptomYearAvailable: boolean;
	export let symptomMaxAvailable: boolean;

	// CIPH-781 — "Wie geht's dir?" trend chart now lives in the main column
	// alongside the other charts. Rail keeps auxiliary content only.
	export let howAreYouChartData: unknown;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export let howAreYouChartOptions: any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export let howAreYouTrend: any;
	export let howAreYouHeadlineParts: { arrow: string; text: string } | null;
	export let episodeNoun: string;

	// CIPH-763b — concrete number types for sr-only caption reductions
	// (inline annotations aren't allowed in {expression} blocks).
	$: howAreYouEpisodesTotal = howAreYouTrend
		? (howAreYouTrend.episodes as number[]).reduce((a: number, b: number) => a + b, 0)
		: 0;
	$: howAreYouSymptomDaysTotal = howAreYouTrend
		? (howAreYouTrend.symptomDays as number[]).reduce((a: number, b: number) => a + b, 0)
		: 0;

	export let onSetEpisodeScope: (s: 'month' | 'year' | 'max') => void;
	export let onSetSymptomScope: (s: 'month' | 'year' | 'max') => void;
</script>

<!-- Greeting + Today's Status moved to Companion.svelte parent so they
     render as a full-width header above the 2/3+1/3 grid. -->

<!-- ═══ PHASE CONTEXT (CIPH-854) ═══
	 Phase-band cohort (bipolar/MS/long-covid/IBD/IBS/chronic_pain/
	 anxiety_depression/burnout): when a multiDay episode is ongoing,
	 this is the most important context. Position: above all charts. -->
{#if cohort === 'phase' && activePhase}
	<PhaseContextCard phase={activePhase} />
{/if}

<!-- ═══ CYCLE PHASE ═══ -->
{#if hasCycleVital && cycleState}
	<section class="card-anchor">
		{#if !cycleState.hasData}
			<a href="/log/today" class="flex items-center gap-3 no-underline">
				<div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style="background: var(--ochre-light); color: var(--ochre)">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke-width="2"/><path d="M12 7v5l3 2" stroke-width="2" stroke-linecap="round"/></svg>
				</div>
				<div class="flex-1 min-w-0">
					<p class="text-sm font-semibold" style="color: var(--text-primary)">{$t('cycle.title')}</p>
					<p class="text-xs mt-0.5" style="color: var(--text-muted)">{$t('cycle.first_entry_prompt')}</p>
				</div>
			</a>
		{:else}
			{@const cs = cycleState}
			<div class="flex items-center gap-4">
				<div class="text-center shrink-0">
					<p class="text-3xl font-bold num-data" style="color: {PHASE_COLORS[cs.phase]}">{$t('cycle.day_n', { n: cs.day })}</p>
					<p class="text-[10px] uppercase tracking-wider font-medium" style="color: var(--text-muted)">/ {cs.cycleLength}</p>
				</div>
				<div class="flex-1 min-w-0">
					<div class="flex items-center gap-2 flex-wrap">
						<p class="text-sm font-semibold" style="color: var(--text-primary)">{$t('cycle.title')}</p>
						<span class="text-xs px-2 py-0.5 rounded-full" style="background: {PHASE_COLORS[cs.phase]}20; color: {PHASE_COLORS[cs.phase]}">{$t('cycle.phase_' + cs.phase)}</span>
						{#if cs.irregular}
							<span class="text-[10px] px-2 py-0.5 rounded-full font-medium" style="background: var(--ochre-light); color: var(--ochre)">{$t('cycle.irregular')}</span>
						{/if}
					</div>
					<div class="mt-2 relative w-full rounded-full h-2 overflow-hidden flex" style="background: var(--surface-inset)">
						<div style="width: {(cs.endMenstrual / cs.cycleLength) * 100}%; background: {PHASE_COLORS.menstrual}40"></div>
						<div style="width: {((cs.endFollicular - cs.endMenstrual) / cs.cycleLength) * 100}%; background: {PHASE_COLORS.follicular}40"></div>
						<div style="width: {((cs.endOvulation - cs.endFollicular) / cs.cycleLength) * 100}%; background: {PHASE_COLORS.ovulation}40"></div>
						<div style="flex: 1; background: {PHASE_COLORS.luteal}40"></div>
						<div class="absolute top-0 bottom-0" style="left: {cs.progressPct}%; width: 2px; background: var(--text-primary); transform: translateX(-1px);"></div>
					</div>
				</div>
			</div>
		{/if}
	</section>
{/if}

<!-- ═══ "WIE GEHT'S DIR?" TREND (CIPH-781: moved to main column) ═══ -->
{#if howAreYouChartData && howAreYouTrend}
<section class="card card-rhythmic" aria-label={$t('companion.how_aria')}>
	<h2 class="text-sm font-semibold mb-1" style="color: var(--text-primary)">{$t('companion.how_title')}</h2>
	{#if howAreYouHeadlineParts}
		<p class="text-base font-medium mb-3" style="color: var(--text-primary)">
			<span aria-hidden="true">{howAreYouHeadlineParts.arrow}</span>
			{howAreYouHeadlineParts.text}
		</p>
	{/if}
	<div class="h-48">
		<ChartWrapper type="line" data={howAreYouChartData} options={howAreYouChartOptions} />
	</div>
	<p class="sr-only">
		{$t('companion.how_sr_caption', {
			last: howAreYouTrend.last,
			prev: howAreYouTrend.prev,
			total: howAreYouEpisodesTotal,
			symptomDays: howAreYouSymptomDaysTotal,
			noun: episodeNoun,
		})}
	</p>
</section>
{/if}

<!-- ═══ EPISODE TREND ═══ -->
{#if episodeChartData}
<section class="card card-rhythmic">
	<div class="flex items-center justify-between mb-3 gap-2">
		<h2 class="text-sm font-semibold" style="color: var(--text-primary)">
			{companionChartScope === 'month'
				? $t('companion.episodes_this_month')
				: companionChartScope === 'year'
					? $t('companion.episodes_year')
					: $t('companion.episodes_max')}
		</h2>
		<div class="flex gap-1 text-xs" style="color: var(--text-muted)">
			<button
				class="px-2 py-1 rounded"
				class:font-semibold={companionChartScope === 'month'}
				style="{companionChartScope === 'month' ? 'background: var(--surface-muted); color: var(--text-primary)' : ''}"
				on:click={() => onSetEpisodeScope('month')}
			>{$t('pdf.scope_month_label')}</button>
			<button
				class="px-2 py-1 rounded"
				class:font-semibold={companionChartScope === 'year'}
				class:opacity-40={!yearChartAvailable}
				disabled={!yearChartAvailable}
				style="{companionChartScope === 'year' ? 'background: var(--surface-muted); color: var(--text-primary)' : ''}"
				on:click={() => onSetEpisodeScope('year')}
			>{$t('pdf.scope_year_label')}</button>
			<button
				class="px-2 py-1 rounded"
				class:font-semibold={companionChartScope === 'max'}
				class:opacity-40={!maxChartAvailable}
				disabled={!maxChartAvailable}
				style="{companionChartScope === 'max' ? 'background: var(--surface-muted); color: var(--text-primary)' : ''}"
				on:click={() => onSetEpisodeScope('max')}
			>{$t('companion.scope_max_label')}</button>
		</div>
	</div>
	<div class="h-48">
		<ChartWrapper type="bar" data={episodeChartData} options={episodeChartOptions} />
	</div>
</section>
{/if}

<!-- ═══ TOP SYMPTOMS ═══ -->
{#if symptomChartData}
<section class="card card-rhythmic">
	<div class="flex items-center justify-between mb-3 gap-2">
		<h2 class="text-sm font-semibold" style="color: var(--text-primary)">
			{symptomChartScope === 'month'
				? $t('companion.top_symptoms_month')
				: symptomChartScope === 'year'
					? $t('companion.top_symptoms_year')
					: $t('companion.top_symptoms_max')}
		</h2>
		<div class="flex gap-1 text-xs" style="color: var(--text-muted)">
			<button
				class="px-2 py-1 rounded"
				class:font-semibold={symptomChartScope === 'month'}
				style="{symptomChartScope === 'month' ? 'background: var(--surface-muted); color: var(--text-primary)' : ''}"
				on:click={() => onSetSymptomScope('month')}
			>{$t('pdf.scope_month_label')}</button>
			<button
				class="px-2 py-1 rounded"
				class:font-semibold={symptomChartScope === 'year'}
				class:opacity-40={!symptomYearAvailable}
				disabled={!symptomYearAvailable}
				style="{symptomChartScope === 'year' ? 'background: var(--surface-muted); color: var(--text-primary)' : ''}"
				on:click={() => onSetSymptomScope('year')}
			>{$t('pdf.scope_year_label')}</button>
			<button
				class="px-2 py-1 rounded"
				class:font-semibold={symptomChartScope === 'max'}
				class:opacity-40={!symptomMaxAvailable}
				disabled={!symptomMaxAvailable}
				style="{symptomChartScope === 'max' ? 'background: var(--surface-muted); color: var(--text-primary)' : ''}"
				on:click={() => onSetSymptomScope('max')}
			>{$t('companion.scope_max_label')}</button>
		</div>
	</div>
	<div class="h-48">
		<ChartWrapper type="bar" data={symptomChartData} options={symptomChartOptions} />
	</div>
</section>
{/if}

<!-- Today's entries moved to CompanionRail. Encryption badge moved to
     Companion.svelte parent (full-width below grid). -->
