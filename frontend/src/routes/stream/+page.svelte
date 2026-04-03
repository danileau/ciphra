<script lang="ts">
	import { t } from '$lib/i18n';
	import { isAuthenticated } from '$lib/stores/auth';
	import { documents, type CiphraDocument } from '$lib/stores/documents';
	import { blueprint } from '$lib/blueprint';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	let filter = 'all';
	let searchQuery = '';

	onMount(() => {
		if (!$isAuthenticated) { goto('/login'); return; }
		documents.load();
	});

	$: bp = $blueprint;

	$: filteredDocs = $documents
		.filter(d => {
			if (d.data?.type === 'blueprint') return false;
			if (filter !== 'all' && d.data.type !== filter) return false;
			if (searchQuery) {
				const json = JSON.stringify(d.data).toLowerCase();
				if (!json.includes(searchQuery.toLowerCase())) return false;
			}
			return true;
		})
		.sort((a, b) => {
			const da = String(a.data.date || a.serverCreatedAt);
			const db = String(b.data.date || b.serverCreatedAt);
			return db.localeCompare(da);
		});

	function typeColor(type: string): string {
		if (type === 'daily_log') return 'border-indigo-400 bg-indigo-500/5';
		if (type === 'episode') return 'border-red-400 bg-red-500/5';
		if (type === 'event') return 'border-teal-400 bg-teal-500/5';
		return 'border-stone-300';
	}

	function typeBadge(type: string): string {
		if (type === 'daily_log') return 'bg-indigo-500/10 text-indigo-600';
		if (type === 'episode') return 'bg-red-500/10 text-red-600';
		if (type === 'event') return 'bg-teal-500/10 text-teal-600';
		return 'bg-stone-100 text-stone-600';
	}

	function formatDate(doc: CiphraDocument): string {
		const d = String(doc.data.date || doc.serverCreatedAt);
		try {
			return new Date(d.includes('T') ? d : d + 'T12:00:00').toLocaleDateString(undefined, {
				weekday: 'short', day: 'numeric', month: 'short'
			});
		} catch { return d; }
	}

	function getSummary(doc: CiphraDocument): string {
		const d = doc.data;
		if (d.type === 'daily_log') {
			const parts: string[] = [];
			const sympCount = Object.values(d.symptoms || {}).filter(Boolean).length;
			if (sympCount > 0) parts.push(`${sympCount} symptoms`);
			const epCount = Object.values(d.episodes || d.seizures || {}).reduce((a: number, b: number) => a + b, 0);
			if (epCount > 0) parts.push(`${epCount} episodes`);
			return parts.join(' · ') || d.notes || '';
		}
		return d.notes || d.title || '';
	}

	async function handleDelete(id: number) {
		await documents.remove(id);
	}
</script>

<div class="max-w-3xl mx-auto px-4 pt-4 pb-32">
	<h1 class="text-2xl font-bold text-stone-900 dark:text-white mb-4">{$t('stream.title')}</h1>

	<!-- Search -->
	<div class="relative mb-4">
		<svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" stroke-width="2"/><line x1="21" y1="21" x2="16.65" y2="16.65" stroke-width="2"/></svg>
		<input
			type="text"
			bind:value={searchQuery}
			placeholder={$t('stream.search')}
			class="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-sm text-stone-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none min-h-[44px]"
		/>
	</div>

	<!-- Filter tabs (from blueprint) -->
	{#if bp}
		<div class="flex gap-2 mb-4 overflow-x-auto pb-1">
			{#each bp.streamFilters as tab}
				<button
					on:click={() => { filter = tab.key; }}
					class="px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors min-h-[36px]
						{filter === tab.key
							? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
							: 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400'}"
				>
					{tab.label}
				</button>
			{/each}
		</div>
	{/if}

	<!-- Entries -->
	{#if filteredDocs.length === 0}
		<div class="text-center py-12">
			<svg class="w-12 h-12 text-stone-300 dark:text-stone-700 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke-width="2"/><polyline points="14,2 14,8 20,8" stroke-width="2"/></svg>
			<p class="text-sm text-stone-400">{$t('stream.no_entries')}</p>
		</div>
	{:else}
		<div class="space-y-2">
			{#each filteredDocs as doc (doc.id)}
				<div class="bg-white dark:bg-stone-900 rounded-xl border-l-4 {typeColor(doc.data.type || '')} border border-stone-200 dark:border-stone-800 p-4">
					<div class="flex items-start justify-between gap-3">
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2 mb-1">
								<span class="text-xs font-medium px-2 py-0.5 rounded-full {typeBadge(doc.data.type || '')} capitalize">{doc.data.type}</span>
								<span class="text-xs text-stone-400">{formatDate(doc)}</span>
							</div>
							<p class="text-sm text-stone-700 dark:text-stone-300 line-clamp-2">{getSummary(doc)}</p>
							{#if doc.data.notes && doc.data.type === 'daily_log'}
								<p class="text-xs text-stone-400 mt-1 line-clamp-1">{doc.data.notes}</p>
							{/if}
						</div>
						<button
							on:click={() => handleDelete(doc.id)}
							class="p-2 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
							aria-label={$t('common.delete')}
						>
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3,6 5,6 21,6" stroke-width="2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke-width="2"/></svg>
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
