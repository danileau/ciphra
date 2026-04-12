<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { isAuthenticated } from '$lib/stores/auth';
	import { documents, type CiphraDocument } from '$lib/stores/documents';
	import { blueprint } from '$lib/blueprint';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import Asterisk from '$lib/components/Asterisk.svelte';

	let filter = 'all';
	let searchQuery = '';
	let confirmDeleteId: number | null = null;
	let editingId: number | null = null;
	let editNotes = '';
	let editEpisodeType = '';
	let editTime = '';
	let editSaving = false;

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

	function typeBorderColor(type: string): string {
		if (type === 'daily_log') return 'var(--olive)';
		if (type === 'episode') return 'var(--danger)';
		if (type === 'event') return 'var(--ochre)';
		return 'var(--border)';
	}

	function typeBadgeClass(type: string): string {
		if (type === 'daily_log') return 'badge badge-olive';
		if (type === 'episode') return 'badge badge-danger';
		if (type === 'event') return 'badge badge-ochre';
		return 'badge';
	}

	function formatDate(doc: CiphraDocument): string {
		const d = String(doc.data.date || doc.serverCreatedAt);
		try {
			return new Date(d.includes('T') ? d : d + 'T12:00:00').toLocaleDateString($locale, {
				weekday: 'short', day: 'numeric', month: 'short'
			});
		} catch { return d; }
	}

	function typeLabel(type: string): string {
		if (type === 'daily_log') return $t('protocol.title');
		if (type === 'episode') return $t('quickadd.episode');
		if (type === 'event') return $t('stream.events');
		return type;
	}

	function getSummary(doc: CiphraDocument): string {
		const d = doc.data;
		if (d.type === 'daily_log') {
			const parts: string[] = [];
			const sympCount = Object.values(d.symptoms || {}).filter(Boolean).length;
			if (sympCount > 0) parts.push(`${sympCount} ${$t('companion.symptoms')}`);
			const epCount = (Object.values(d.episodes || d.seizures || {}) as number[]).reduce((a, b) => a + b, 0);
			if (epCount > 0) parts.push(`${epCount} ${$t('protocol.episodes')}`);
			return parts.join(' · ') || d.notes || '';
		}
		return d.notes || d.title || '';
	}

	async function handleDelete(id: number) {
		await documents.remove(id);
		confirmDeleteId = null;
	}

	function startEdit(doc: CiphraDocument) {
		if (doc.data.type === 'daily_log') {
			const date = String(doc.data.date || '');
			goto(`/protocol?date=${date}`);
			return;
		}
		editingId = doc.id;
		editNotes = doc.data.notes || '';
		editEpisodeType = doc.data.episodeType || '';
		editTime = doc.data.time || '';
	}

	function cancelEdit() {
		editingId = null;
		editNotes = '';
		editEpisodeType = '';
		editTime = '';
	}

	async function saveEdit(doc: CiphraDocument) {
		editSaving = true;
		const updatedData = { ...doc.data };
		if (doc.data.type === 'episode') {
			updatedData.episodeType = editEpisodeType;
			updatedData.time = editTime;
			updatedData.notes = editNotes;
		} else {
			updatedData.notes = editNotes;
		}
		await documents.updateDoc(doc.id, updatedData);
		editSaving = false;
		editingId = null;
	}
</script>

<div class="max-w-3xl mx-auto px-4 pt-4 pb-32">
	<h1 class="text-2xl font-bold mb-4" style="color: var(--text-primary)">{$t('stream.title')}</h1>

	<!-- Search -->
	<div class="relative mb-4">
		<svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style="color: var(--text-muted)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" stroke-width="2"/><line x1="21" y1="21" x2="16.65" y2="16.65" stroke-width="2"/></svg>
		<input
			type="text"
			bind:value={searchQuery}
			placeholder={$t('stream.search')}
			class="input pl-10"
		/>
	</div>

	<!-- Filter tabs (from blueprint) -->
	{#if bp}
		<div class="flex gap-2 mb-4 overflow-x-auto pb-1">
			{#each bp.streamFilters as tab}
				<button
					on:click={() => { filter = tab.key; }}
					class="px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors min-h-[36px]"
					style="{filter === tab.key
						? 'background: var(--olive-light); color: var(--olive);'
						: 'background: var(--surface-muted); color: var(--text-secondary);'}"
				>
					{$t(tab.label)}
				</button>
			{/each}
		</div>
	{/if}

	<!-- Entries -->
	{#if filteredDocs.length === 0}
		<div class="text-center py-12">
			<div class="mb-3 flex justify-center">
				<Asterisk size={64} muted color="muted" />
			</div>
			<p class="text-sm mb-3" style="color: var(--text-muted)">{$t('stream.no_entries')}</p>
			<a href="/log/today" class="btn-primary inline-flex items-center gap-2 px-4 py-2.5 text-sm">
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" stroke-width="2"/><line x1="5" y1="12" x2="19" y2="12" stroke-width="2"/></svg>
				{$t('companion.fill_today')}
			</a>
		</div>
	{:else}
		<div class="space-y-2">
			{#each filteredDocs as doc, i (doc.id)}
				<div
					class="card p-4 stagger-in"
					style="border-left: 4px solid {typeBorderColor(doc.data.type || '')}; animation-delay: {Math.min(i, 10) * 50}ms"
				>
					{#if editingId === doc.id}
						<!-- Inline edit form -->
						<div class="space-y-3">
							<div class="flex items-center gap-2 mb-1">
								<span class={typeBadgeClass(doc.data.type || '')}>{typeLabel(doc.data.type || '')}</span>
								<span class="text-xs" style="color: var(--text-muted)">{formatDate(doc)}</span>
							</div>
							{#if doc.data.type === 'episode' && bp}
								<div class="space-y-2">
									<label class="text-xs" style="color: var(--text-secondary)">{$t('quickadd.episode')}</label>
									<div class="flex flex-wrap gap-2">
										{#each bp.episodeTypes as ep}
											<button
												type="button"
												on:click={() => { editEpisodeType = ep.id; }}
												class="px-3 py-1.5 rounded-full text-sm font-medium transition-colors min-h-[36px]"
												style="{editEpisodeType === ep.id
													? 'background: rgba(220,38,38,0.1); color: var(--danger); box-shadow: inset 0 0 0 1px rgba(220,38,38,0.3);'
													: 'background: var(--surface-muted); color: var(--text-secondary);'}"
											>
												<span class="inline-block w-2 h-2 rounded-full mr-1" style="background: {ep.color}"></span>
												{$t(ep.label)}
											</button>
										{/each}
									</div>
									<label class="text-xs" style="color: var(--text-secondary)">{$t('common.today')}</label>
									<input
										type="time"
										bind:value={editTime}
										class="input"
									/>
								</div>
							{/if}
							<div>
								<label class="text-xs" style="color: var(--text-secondary)">{$t('common.notes')}</label>
								<textarea
									bind:value={editNotes}
									rows="2"
									class="input resize-y mt-1"
								></textarea>
							</div>
							<div class="flex gap-2 justify-end">
								<button
									on:click={cancelEdit}
									class="btn-secondary px-3 py-1.5 text-sm"
								>{$t('common.cancel')}</button>
								<button
									on:click={() => saveEdit(doc)}
									disabled={editSaving}
									class="btn-primary px-4 py-1.5 text-sm"
								>{editSaving ? $t('common.loading') : $t('common.save')}</button>
							</div>
						</div>
					{:else}
						<!-- Normal display -->
						<div class="flex items-start justify-between gap-3">
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2 mb-1">
									<span class={typeBadgeClass(doc.data.type || '')}>{typeLabel(doc.data.type || '')}</span>
									<span class="text-xs" style="color: var(--text-muted)">{formatDate(doc)}</span>
								</div>
								<p class="text-sm line-clamp-2" style="color: var(--text-primary)">{getSummary(doc)}</p>
								{#if doc.data.notes && doc.data.type === 'daily_log'}
									<p class="text-xs mt-1 line-clamp-1" style="color: var(--text-muted)">{doc.data.notes}</p>
								{/if}
							</div>
							<div class="flex items-center gap-1 shrink-0">
								<!-- Edit button -->
								<button
									on:click={() => startEdit(doc)}
									class="p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
									style="color: var(--text-muted)"
									aria-label={$t('common.edit')}
								>
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
								</button>
								<!-- Delete button / confirmation -->
								{#if confirmDeleteId === doc.id}
									<div class="flex items-center gap-1">
										<span class="text-xs font-medium whitespace-nowrap" style="color: var(--danger)">{$t('common.confirm_delete')}</span>
										<button
											on:click={() => handleDelete(doc.id)}
											class="p-2 rounded-lg text-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center text-xs font-medium"
											style="background: var(--danger)"
										>{$t('common.yes_delete')}</button>
										<button
											on:click={() => { confirmDeleteId = null; }}
											class="btn-secondary p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-xs font-medium"
										>{$t('common.cancel')}</button>
									</div>
								{:else}
									<button
										on:click={() => { confirmDeleteId = doc.id; }}
										class="p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
										style="color: var(--text-muted)"
										aria-label={$t('common.delete')}
									>
										<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3,6 5,6 21,6" stroke-width="2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke-width="2"/></svg>
									</button>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	button.p-2:hover {
		color: var(--brand);
		background: var(--brand-light);
	}
	button[aria-label]:last-child:hover {
		color: var(--danger);
		background: rgba(220, 38, 38, 0.05);
	}
</style>
