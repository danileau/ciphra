<script lang="ts">
	// CIPH-750 — Dashboard main-column wrapper.
	// Thin render-only component: receives all reactive state + handlers
	// from Companion.svelte and emits the main-column sections. Splitting
	// the markup (without duplicating the reactive cascade) is how we
	// de-risked the rail-layout story that was deferred twice.
	//
	// CIPH-900 — Dropped the episode bar-chart and the top-symptoms bar-
	// chart from the dashboard. Both lived as scope-pickered cards on the
	// main column since PI v6 / CIPH-781. Anna-test (cycle cohort) flagged
	// the dashboard as "lot of not matching colours, structurally
	// confusing". /reports owns the deep view (year heatmap + monthly grid
	// table + summary stats), which is stronger data presentation than
	// vertical-bar counts. The single trend that stays is howAreYou,
	// reshaped here into a sparkline-hero with the headline carrying the
	// takeaway and a "Verlauf ansehen →" link routing to /reports.
	import { t } from '$lib/i18n';
	import ChartWrapper from '$lib/components/ChartWrapper.svelte';
	import PhaseContextCard from '$lib/components/PhaseContextCard.svelte';
	import LastEntriesStrip from '$lib/components/LastEntriesStrip.svelte';
	import VitalTrendCard from '$lib/components/VitalTrendCard.svelte';
	import TopTriggersCard from '$lib/components/TopTriggersCard.svelte';
	import WithinPhaseRollupCard from '$lib/components/WithinPhaseRollupCard.svelte';
	import { cohortPalette } from '$lib/cohortPalette';
	import type { Cohort } from '$lib/blueprint/cohort';
	import type { DashboardCardSpec } from '$lib/blueprint/dashboardPrimary';
	import type { CiphraDocument } from '$lib/stores/documents';
	import type { Blueprint } from '$lib/blueprint/types';

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

	// CIPH-781 — "Wie geht's dir?" trend chart now lives in the main column
	// alongside the other charts. Rail keeps auxiliary content only.
	// CIPH-900 — only chart left on the dashboard, slimmed to sparkline.
	export let howAreYouChartData: unknown;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export let howAreYouChartOptions: any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export let howAreYouTrend: any;
	export let howAreYouHeadlineParts: { arrow: string; text: string } | null;
	export let episodeNoun: string;

	// pi24 dashboard rework — primary-card spec from
	// resolvePrimaryDashboardCard. Drives the switch in the primary slot
	// below. When spec.kind is 'cycle-phase' or 'active-phase', the
	// existing anchor blocks above already carry the answer; the primary
	// slot stays empty in those cases. When spec.kind is 'episode-trend'
	// the HowAreYou sparkline-hero renders as before. Other kinds will
	// route to dedicated cards in subsequent commits (VitalTrendCard,
	// TopTriggersCard, WithinPhaseRollup, TreatmentCycleCard); until
	// those ship the fall-through is LastEntriesStrip.
	export let primarySpec: DashboardCardSpec | null = null;
	export let allDocs: CiphraDocument[] = [];
	export let bp: Blueprint | null = null;

	// Cohort palette read locally so VitalTrendCard gets the same accent
	// the existing trend chart uses on the dashboard. Source of truth is
	// `cohortOf(bp)` upstream — we mirror it via the `cohort` prop.
	$: vitalAccentHex = cohortPalette(cohort)[0];
	$: vitalNeutralHex = cohortPalette(cohort)[4];

	// CIPH-763b — concrete number types for sr-only caption reductions
	// (inline annotations aren't allowed in {expression} blocks).
	$: howAreYouEpisodesTotal = howAreYouTrend
		? (howAreYouTrend.episodes as number[]).reduce((a: number, b: number) => a + b, 0)
		: 0;
	$: howAreYouSymptomDaysTotal = howAreYouTrend
		? (howAreYouTrend.symptomDays as number[]).reduce((a: number, b: number) => a + b, 0)
		: 0;
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

<!-- ═══ PRIMARY CARD SLOT (pi24 resolver-driven) ═══
     resolvePrimaryDashboardCard picks the kind based on cohort + data.
     - 'episode-trend' (CIPH-900): existing HowAreYou sparkline-hero
     - 'last-entries': universal fallback strip
     - 'cycle-phase' / 'active-phase': anchor blocks above already handle
       it; primary slot stays empty
     - 'vital-trend' / 'top-triggers' / 'treatment-cycle': dedicated
       cards land in later commits — until they do, fall through to
       LastEntriesStrip so no Helena-style void appears
     - null: silent empty state (hero only, per no-gaslight rule) -->
{#if primarySpec?.kind === 'episode-trend' && howAreYouChartData && howAreYouTrend}
	<a
		href="/reports"
		class="card card-rhythmic hay-hero block no-underline"
		aria-label={$t('companion.how_aria')}
	>
		<div class="flex items-baseline justify-between gap-2 mb-2">
			<h2 class="text-sm font-semibold" style="color: var(--text-primary)">{$t('companion.how_title')}</h2>
			<span class="text-xs hay-link" style="color: var(--accent)">
				{$t('companion.how_view_trend')} →
			</span>
		</div>
		{#if howAreYouHeadlineParts}
			<p class="text-base font-medium mb-3" style="color: var(--text-primary)">
				<span aria-hidden="true">{howAreYouHeadlineParts.arrow}</span>
				{howAreYouHeadlineParts.text}
			</p>
		{/if}
		<div class="hay-spark">
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
	</a>
{:else if primarySpec?.kind === 'vital-trend'}
	<VitalTrendCard
		docs={allDocs}
		{bp}
		primaryVitalId={primarySpec.primaryVitalId}
		secondaryVitalIds={primarySpec.secondaryVitalIds}
		accentHex={vitalAccentHex}
		neutralHex={vitalNeutralHex}
	/>
{:else if primarySpec?.kind === 'top-triggers'}
	<TopTriggersCard docs={allDocs} {bp} />
{:else if primarySpec?.kind === 'active-phase'}
	<!-- pi24 dashboard: active-phase resolver kind = PhaseContextCard
	     (anchor block above) + WithinPhaseRollupCard (here). Two cards
	     co-render during a flare: anchor for identity, rollup for data. -->
	<WithinPhaseRollupCard docs={allDocs} {bp} {activePhase} />
{:else if primarySpec?.kind === 'last-entries' || primarySpec?.kind === 'treatment-cycle'}
	<!-- pi24 fall-through: until TreatmentCycleCard ships, cancer users
	     get LastEntriesStrip — journal-primary cohort anyway, so the
	     strip is on-cohort. -->
	<LastEntriesStrip docs={allDocs} {bp} />
{/if}

<!-- CIPH-900 — Episode bar-chart + Top-symptoms bar-chart removed. The
     deep trend lives at /reports (year heatmap + monthly grid + sums).
     Today's entries moved to CompanionRail. Encryption badge moved to
     the authed footer (CIPH-903). -->

<style>
	/* CIPH-900 — howAreYou hero card. The whole card is an <a>; we add a
	   subtle hover affordance (border tint, view-trend chevron underline)
	   without making the card feel "buttoned." */
	.hay-hero {
		text-decoration: none;
		transition: border-color 0.15s ease-out, transform 0.15s ease-out;
	}
	.hay-hero:hover,
	.hay-hero:focus-visible {
		border-color: var(--accent);
	}
	.hay-hero:hover .hay-link,
	.hay-hero:focus-visible .hay-link {
		text-decoration: underline;
	}
	/* CIPH-915 — chart height bumped to accommodate the bottom legend
	   that now matches the /reports trend chart style. */
	.hay-spark {
		height: 200px;
	}
	@media (min-width: 768px) {
		.hay-spark {
			height: 240px;
		}
	}
</style>
