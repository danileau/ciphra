<script lang="ts">
	import { t } from '$lib/i18n';
	import { auth, isAuthenticated } from '$lib/stores/auth';
	import { documents, type CiphraDocument } from '$lib/stores/documents';
	import { blueprint } from '$lib/blueprint';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	let loaded = false;

	onMount(() => {
		if (!$isAuthenticated) { goto('/login'); return; }
		documents.load().then(() => { loaded = true; });
	});

	$: bp = $blueprint;
	$: allDocs = $documents;
	$: todayStr = new Date().toISOString().slice(0, 10);
	$: todayEntries = allDocs.filter(d => String(d.data.date || '').startsWith(todayStr));
	$: streak = computeStreak(allDocs);

	function computeStreak(docs: CiphraDocument[]): number {
		const episodeDates = new Set<string>();
		for (const d of docs) {
			const hasEpisodes = d.data.episodes && Object.values(d.data.episodes).some((v: number) => v > 0);
			const hasSeizures = d.data.seizures && Object.values(d.data.seizures).some((v: number) => v > 0);
			if (d.data.type === 'episode' || hasEpisodes || hasSeizures) {
				const dt = String(d.data.date || '').slice(0, 10);
				if (dt) episodeDates.add(dt);
			}
		}
		let count = 0;
		const now = new Date();
		for (let i = 0; i < 365; i++) {
			const d = new Date(now);
			d.setDate(d.getDate() - i);
			const ds = d.toISOString().slice(0, 10);
			if (episodeDates.has(ds)) break;
			count++;
		}
		return count;
	}

	function typeColor(type: string): string {
		if (type === 'daily_log') return 'border-indigo-400';
		if (type === 'episode') return 'border-red-400';
		if (type === 'event') return 'border-teal-400';
		return 'border-stone-300';
	}

	function formatDate(dateStr: string): string {
		try {
			return new Date(dateStr).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
		} catch { return dateStr; }
	}

	// Streak label depends on blueprint
	$: streakLabel = bp?.episodeTypes?.length
		? (bp.episodeTypes.length === 1
			? `Tage ohne ${bp.episodeTypes[0].label}`
			: `Tage ohne Episoden`)
		: 'Tage ohne Episoden';
</script>

{#if !bp}
	<div class="max-w-3xl mx-auto px-4 py-12 text-center">
		<p class="text-stone-400">{$t('common.loading')}</p>
	</div>
{:else}
<div class="max-w-3xl mx-auto px-4 py-6 space-y-5">
	<!-- Greeting -->
	<section>
		<h1 class="text-2xl font-bold text-stone-900 dark:text-white">{$t('companion.greeting', { name: $auth.username || '' })}</h1>
		<div class="flex items-center gap-2 mt-0.5">
			<p class="text-stone-500 dark:text-stone-400">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
			<span class="text-xs px-2 py-0.5 rounded-full text-stone-500 dark:text-stone-400" style="background: {bp.accentColor}15; color: {bp.accentColor}">{bp.conditionLabel}</span>
		</div>
	</section>

	<!-- Streak (only if episodeTypes exist) -->
	{#if bp.episodeTypes.length > 0}
	<section class="rounded-xl p-5" style="background: {bp.accentColor}08">
		<div class="flex items-baseline gap-3">
			<span class="text-4xl font-bold" style="color: {bp.accentColor}">{streak}</span>
			<span class="text-base font-medium text-stone-700 dark:text-stone-300">{streakLabel}</span>
		</div>
		<div class="mt-3">
			<div class="w-full rounded-full h-2" style="background: {bp.accentColor}20">
				<div class="h-2 rounded-full" style="background: {bp.accentColor}; width: {Math.min(streak * 3, 100)}%"></div>
			</div>
		</div>
	</section>
	{/if}

	<!-- Quick Actions (from blueprint) -->
	<section>
		<h2 class="text-base font-semibold text-stone-900 dark:text-white mb-3">{$t('companion.quick_actions')}</h2>
		<div class="grid grid-cols-2 gap-3">
			{#each bp.quickActions as action}
				<a href={action.href} class="flex items-center gap-3 p-4 rounded-xl {action.color} transition-colors min-h-[56px]">
					{#if action.icon === 'zap'}
						<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					{:else if action.icon === 'book'}
						<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke-width="2"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke-width="2"/></svg>
					{:else if action.icon === 'flag'}
						<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" stroke-width="2"/><line x1="4" y1="22" x2="4" y2="15" stroke-width="2"/></svg>
					{:else if action.icon === 'droplet'}
						<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" stroke-width="2"/></svg>
					{:else}
						<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke-width="2"/><polyline points="14,2 14,8 20,8" stroke-width="2"/></svg>
					{/if}
					<span class="text-sm font-medium">{action.label}</span>
				</a>
			{/each}
		</div>
	</section>

	<!-- Today's Entries -->
	<section>
		<h2 class="text-base font-semibold text-stone-900 dark:text-white mb-3">{$t('companion.todays_entries')}</h2>
		{#if !loaded}
			<p class="text-sm text-stone-400">{$t('common.loading')}</p>
		{:else if todayEntries.length === 0}
			<div class="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-6 text-center">
				<p class="text-sm text-stone-500 dark:text-stone-400">{$t('companion.no_entries')}</p>
			</div>
		{:else}
			<div class="space-y-2">
				{#each todayEntries as entry}
					<div class="bg-white dark:bg-stone-900 rounded-xl border-l-4 {typeColor(entry.data.type || '')} border border-stone-200 dark:border-stone-800 p-4">
						<div class="flex justify-between items-start">
							<div>
								<p class="text-sm font-medium text-stone-900 dark:text-white capitalize">{entry.data.type || 'Entry'}</p>
								{#if entry.data.notes}
									<p class="text-xs text-stone-500 mt-1 line-clamp-2">{entry.data.notes}</p>
								{/if}
							</div>
							<span class="text-xs text-stone-400">{formatDate(entry.serverCreatedAt)}</span>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<!-- E2E Badge -->
	<div class="flex items-center justify-center gap-2 py-4">
		<svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke-width="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4" stroke-width="2"/></svg>
		<span class="text-xs text-stone-400 dark:text-stone-500">{$t('encryption.badge')}</span>
	</div>
</div>
{/if}
