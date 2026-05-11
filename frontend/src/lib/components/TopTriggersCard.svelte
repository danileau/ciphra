<!--
	pi24 dashboard — TopTriggersCard.

	Rendered when resolvePrimaryDashboardCard returns kind='top-triggers'.
	Used by migraine and dermatology — cohorts whose clinical workflow IS
	trigger-hunting (see cohort.ts:60). Lists the top 5 recorded triggers
	with occurrence counts across the last 12 months.

	OBSERVATIONAL copy only. Title is "Top recorded triggers" / "Häufigste
	erfasste Auslöser" — never "Your triggers" / "Causes" / "What's hitting
	you". Codex flagged this constraint on the campfire round: the
	dashboard mirrors what the patient has noted, never claims causality
	the app cannot know. Counts the patient's own observation pattern;
	it's data reflection, not diagnosis.

	Trigger data is dual-shape (array of ids from DayDetail OR object-map
	from EntryComposer). Only blueprint-declared trigger ids count when
	reading the object shape — naive truthy scans over-count because
	EntryComposer's spread-merge grafts list ids onto numeric keys with
	truthy string values.
-->
<script lang="ts">
	import { t, locale, plural } from '$lib/i18n';
	import type { CiphraDocument } from '$lib/stores/documents';
	import type { Blueprint } from '$lib/blueprint/types';
	import { isCustomItem } from '$lib/blueprint';

	export let docs: CiphraDocument[];
	export let bp: Blueprint | null = null;
	export let windowMonths = 12;
	export let limit = 5;

	$: triggerLabels = (() => {
		const map = new Map<string, string>();
		for (const tr of bp?.triggers || []) {
			map.set(tr.id, isCustomItem(tr.id) ? tr.label : $t(tr.label));
		}
		for (const tr of bp?.customizations?.customTriggers || []) {
			map.set(tr.id, isCustomItem(tr.id) ? tr.label : $t(tr.label));
		}
		return map;
	})();

	$: ranked = (() => {
		if (!bp) return [] as { id: string; label: string; count: number }[];
		const cutoff = new Date();
		cutoff.setMonth(cutoff.getMonth() - windowMonths);
		const cutoffStr = cutoff.toISOString().slice(0, 10);
		const counts = new Map<string, number>();
		const blueprintIds = new Set<string>(triggerLabels.keys());
		for (const d of docs) {
			if (d.data?.type !== 'entry') continue;
			const ds = String(d.data.date || '');
			if (ds < cutoffStr) continue;
			const trs = d.data.triggers as unknown;
			if (Array.isArray(trs)) {
				for (const raw of trs) {
					const id = String(raw);
					if (!blueprintIds.has(id)) continue;
					counts.set(id, (counts.get(id) || 0) + 1);
				}
			} else if (trs && typeof trs === 'object') {
				const obj = trs as Record<string, unknown>;
				for (const id of blueprintIds) {
					if (obj[id] === true) {
						counts.set(id, (counts.get(id) || 0) + 1);
					}
				}
			}
		}
		const sorted: { id: string; label: string; count: number }[] = [];
		for (const [id, count] of counts) {
			sorted.push({ id, label: triggerLabels.get(id) || id, count });
		}
		sorted.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
		return sorted.slice(0, limit);
	})();

	$: totalCount = ranked.reduce((sum, t) => sum + t.count, 0);
	$: maxCount = ranked.length > 0 ? ranked[0].count : 0;
</script>

{#if ranked.length > 0}
	<a
		href="/reports"
		class="card card-rhythmic top-triggers-card block no-underline"
		aria-label={$t('companion.top_triggers_aria')}
	>
		<div class="flex items-baseline justify-between gap-2 mb-3">
			<h2 class="text-sm font-semibold" style="color: var(--text-primary)">
				{$t('companion.top_triggers_title')}
			</h2>
			<span class="text-xs trigger-link" style="color: var(--accent)">
				{$t('companion.how_view_trend')} →
			</span>
		</div>
		<ul class="flex flex-col gap-2">
			{#each ranked as item}
				<li class="flex items-center gap-3 text-sm">
					<span class="flex-1 min-w-0 truncate" style="color: var(--text-primary)">{item.label}</span>
					<span class="flex-1 max-w-[60%] rounded-full h-1.5" style="background: var(--surface-inset)">
						<span
							class="block h-1.5 rounded-full"
							style="width: {(item.count / maxCount) * 100}%; background: var(--accent)"
						></span>
					</span>
					<span class="text-xs font-mono tabular-nums shrink-0 min-w-[2.5em] text-right" style="color: var(--text-muted)">{item.count}×</span>
				</li>
			{/each}
		</ul>
		<p class="text-xs mt-3" style="color: var(--text-muted)">
			{plural($t, $locale, 'companion.top_triggers_footer', totalCount, { months: windowMonths })}
		</p>
	</a>
{/if}

<style>
	.top-triggers-card {
		text-decoration: none;
		transition: border-color 0.15s ease-out;
	}
	.top-triggers-card:hover,
	.top-triggers-card:focus-visible {
		border-color: var(--accent);
	}
	.top-triggers-card:hover .trigger-link,
	.top-triggers-card:focus-visible .trigger-link {
		text-decoration: underline;
	}
</style>
