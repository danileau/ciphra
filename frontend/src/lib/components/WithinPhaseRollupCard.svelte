<!--
	pi24 dashboard — WithinPhaseRollupCard.

	Rendered when resolvePrimaryDashboardCard returns kind='active-phase'.
	Sits adjacent to PhaseContextCard (the anchor block at the top of
	CompanionMain) — that card says "you're in a flare, day N";
	this card says "during this flare you've logged X, Y, Z".

	Campfire consensus: PhaseContextCard alone isn't enough during a
	flare. The user wants the within-episode rollup (sparse-safe), not a
	12-month trend dominated by historical data. No pressure language:
	this is reflection, not an exhortation to log more.

	Renders: top 2-3 symptom-day counts inside the phase window, total
	episode count, rescue-med tally. Skips any line whose count is 0.
	If everything is 0 (a healthy day inside an ongoing flare), the card
	still mounts with a single neutral "{N} days logged" line.
-->
<script lang="ts">
	import { t, locale, plural } from '$lib/i18n';
	import { todayISO } from '$lib/date';
	import type { CiphraDocument } from '$lib/stores/documents';
	import type { Blueprint } from '$lib/blueprint/types';
	import { isCustomItem } from '$lib/blueprint';

	export let docs: CiphraDocument[];
	export let bp: Blueprint | null = null;
	export let activePhase: {
		id: string;
		label: string;
		color: string;
		dayN: number;
		startedOn: string;
	} | null = null;
	export let limitSymptoms = 3;

	function symptomLabel(id: string): string {
		for (const g of bp?.symptomGroups || []) {
			const it = g.items.find((x) => x.id === id);
			if (it) return isCustomItem(it.id) ? it.label : $t(it.label);
		}
		return id;
	}

	$: today = todayISO();
	$: rollup = (() => {
		if (!activePhase) return null;
		const startedOn = activePhase.startedOn;
		const symptomDayCounts = new Map<string, number>();
		let daysLogged = 0;
		let episodeCount = 0;
		let rescueMedCount = 0;
		for (const d of docs) {
			const ds = String(d.data?.date || '');
			if (ds < startedOn || ds > today) continue;
			if (d.data?.type === 'entry') {
				daysLogged++;
				const eps = (d.data.episodes || d.data.seizures || {}) as Record<string, number>;
				for (const v of Object.values(eps)) episodeCount += Number(v) || 0;
				const syms = (d.data.symptoms || {}) as Record<string, unknown>;
				for (const [k, v] of Object.entries(syms)) {
					if (v) symptomDayCounts.set(k, (symptomDayCounts.get(k) || 0) + 1);
				}
			} else if (d.data?.type === 'event' && (d.data as Record<string, unknown>).kind === 'medication') {
				rescueMedCount++;
			}
		}
		const topSymptoms = [...symptomDayCounts.entries()]
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.slice(0, limitSymptoms)
			.map(([id, count]) => ({ id, label: symptomLabel(id), count }));
		return { daysLogged, episodeCount, rescueMedCount, topSymptoms };
	})();
</script>

{#if rollup}
	<section class="card p-4">
		<h2 class="text-sm font-semibold mb-3" style="color: var(--text-primary)">
			{$t('companion.within_phase_title', { label: activePhase ? $t(activePhase.label) : '' })}
		</h2>
		<ul class="flex flex-col gap-1.5 text-sm">
			{#if rollup.topSymptoms.length === 0 && rollup.episodeCount === 0 && rollup.rescueMedCount === 0}
				<li style="color: var(--text-muted)">
					{plural($t, $locale, 'companion.within_phase_days_logged', rollup.daysLogged)}
				</li>
			{:else}
				{#each rollup.topSymptoms as item}
					<li style="color: var(--text-primary)">
						<span class="font-mono tabular-nums text-xs mr-2" style="color: var(--text-muted)">{item.count}×</span>
						<span>{item.label}</span>
					</li>
				{/each}
				{#if rollup.episodeCount > 0}
					<li style="color: var(--text-primary)">
						<span class="font-mono tabular-nums text-xs mr-2" style="color: var(--text-muted)">{rollup.episodeCount}×</span>
						<span>{$t('companion.within_phase_episodes')}</span>
					</li>
				{/if}
				{#if rollup.rescueMedCount > 0}
					<li style="color: var(--text-primary)">
						<span class="font-mono tabular-nums text-xs mr-2" style="color: var(--text-muted)">{rollup.rescueMedCount}×</span>
						<span>{$t('companion.within_phase_rescue_meds')}</span>
					</li>
				{/if}
			{/if}
		</ul>
	</section>
{/if}
