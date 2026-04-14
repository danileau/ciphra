<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { isAuthenticated } from '$lib/stores/auth';
	import { documents, type CiphraDocument } from '$lib/stores/documents';
	import { blueprint } from '$lib/blueprint';
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import Asterisk from '$lib/components/Asterisk.svelte';
	import EntryPreview from '$lib/components/EntryPreview.svelte';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';

	let filter = 'all';
	let searchQuery = '';
	let searchOpen = false;
	let searchInputEl: HTMLInputElement | null = null;

	// CIPH-711 / CIPH-725 — soft clarification banner shown until the user
	// has authored at least one diary entry OR has visited the Tagebuch tab
	// N≥3 times. No dismiss button; the hint fades on its own.
	let diaryViews = 0;
	$: diaryDocCount = $documents.filter((d) => d.data?.type === 'diary').length;
	$: showDiaryHint = filter === 'diary' && diaryDocCount === 0 && diaryViews < 3;

	async function openSearch() {
		searchOpen = true;
		await tick();
		searchInputEl?.focus();
	}
	function handleSearchKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			searchQuery = '';
			searchOpen = false;
		}
	}
	function handleSearchBlur() {
		if (!searchQuery) searchOpen = false;
	}

	let confirmDeleteId: number | null = null;
	let editingId: number | null = null;
	let editNotes = '';
	let editPrivate = false;
	let editSaving = false;

	onMount(() => {
		if (!$isAuthenticated) { goto('/login'); return; }
		documents.load();
		try {
			diaryViews = parseInt(localStorage.getItem('ciphra_tagebuch_views') || '0', 10) || 0;
		} catch {}
	});

	// CIPH-725 — increment view count each time the user selects the Tagebuch
	// tab (not on every reactive recompute). Guards against runaway writes by
	// only firing on the transition into `filter === 'diary'`.
	let lastCountedFilter = '';
	$: if (filter === 'diary' && lastCountedFilter !== 'diary') {
		lastCountedFilter = 'diary';
		diaryViews += 1;
		try { localStorage.setItem('ciphra_tagebuch_views', String(diaryViews)); } catch {}
	} else if (filter !== 'diary') {
		lastCountedFilter = filter;
	}

	$: bp = $blueprint;

	$: filteredDocs = $documents
		.filter(d => {
			if (d.data?.type === 'blueprint') return false;
			if (filter !== 'all' && d.data.type !== filter) return false;
			if (searchQuery) {
				// CIPH-767d — scope search to user-authored text only. The
				// previous full-JSON stringify matched field names like "type"
				// and "date", producing false positives. Only search the three
				// narrative fields: notes, title, and (diary) text.
				const haystack = [d.data.notes, d.data.title, d.data.text]
					.filter(Boolean)
					.join(' ')
					.toLowerCase();
				if (!haystack.includes(searchQuery.toLowerCase())) return false;
			}
			return true;
		})
		.sort((a, b) => {
			const da = String(a.data.date || a.serverCreatedAt);
			const db = String(b.data.date || b.serverCreatedAt);
			return db.localeCompare(da);
		});

	function typeBorderColor(type: string): string {
		if (type === 'entry') return 'var(--olive)';
		if (type === 'event') return 'var(--ochre)';
		return 'var(--border)';
	}

	function typeBadgeClass(type: string): string {
		if (type === 'entry') return 'badge badge-olive';
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
		if (type === 'entry') return $t('protocol.title');
		if (type === 'event') return $t('stream.events');
		return type;
	}

	async function handleDelete(id: number) {
		await documents.remove(id);
		confirmDeleteId = null;
	}

	function startEdit(doc: CiphraDocument) {
		if (doc.data.type === 'entry') {
			const date = String(doc.data.date || '');
			goto(`/log/${date}`);
			return;
		}
		editingId = doc.id;
		editNotes = doc.data.notes || '';
		editPrivate = doc.data.private === true;
	}

	function cancelEdit() {
		editingId = null;
		editNotes = '';
		editPrivate = false;
	}

	async function saveEdit(doc: CiphraDocument) {
		editSaving = true;
		const updatedData = { ...doc.data };
		updatedData.notes = editNotes;
		// CIPH-713 — preserve absence of `private` rather than writing `false`,
		// so re-encryption diffs stay minimal.
		if (editPrivate) updatedData.private = true;
		else delete updatedData.private;
		await documents.updateDoc(doc.id, updatedData);
		editSaving = false;
		editingId = null;
	}
</script>

<div class="layout-data pt-4 pb-32">
	<h1 class="text-2xl font-bold mb-4" style="color: var(--text-primary)">{$t('stream.title')}</h1>

	<!-- Search + filter row (CIPH-424) -->
	<div class="flex items-center gap-2 mb-4">
		{#if !searchOpen}
			<button
				type="button"
				on:click={openSearch}
				aria-label={$t('journal.search_aria')}
				class="shrink-0 p-2 rounded-lg min-w-[40px] min-h-[40px] flex items-center justify-center transition-colors"
				style="background: var(--surface-muted); color: var(--text-secondary)"
			>
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" stroke-width="2"/><line x1="21" y1="21" x2="16.65" y2="16.65" stroke-width="2"/></svg>
			</button>
		{:else}
			<div class="relative flex-1 min-w-0 journal-search-anim">
				<svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style="color: var(--text-muted)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" stroke-width="2"/><line x1="21" y1="21" x2="16.65" y2="16.65" stroke-width="2"/></svg>
				<input
					bind:this={searchInputEl}
					type="text"
					bind:value={searchQuery}
					on:keydown={handleSearchKeydown}
					on:blur={handleSearchBlur}
					placeholder={$t('stream.search')}
					aria-label={$t('journal.search_aria')}
					class="input pl-10 pr-10"
				/>
				<button
					type="button"
					on:click={() => { searchQuery = ''; searchOpen = false; }}
					aria-label={$t('journal.search_close_aria')}
					class="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded"
					style="color: var(--text-muted)"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" stroke-width="2"/><line x1="6" y1="6" x2="18" y2="18" stroke-width="2"/></svg>
				</button>
			</div>
		{/if}

		{#if bp}
			<div
				class="flex gap-2 overflow-x-auto pb-1 flex-1 min-w-0 transition-opacity"
				style="opacity: {searchQuery ? 0.5 : 1}"
			>
				{#each bp.streamFilters as tab}
					<button
						on:click={() => { filter = tab.key; }}
						data-testid="filter-tab-{tab.key}"
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
	</div>

	<!-- CIPH-711 — Tagebuch first-view soft clarification -->
	{#if showDiaryHint}
		<div
			class="mb-4 p-3 rounded-lg flex items-start gap-2 text-sm md:text-base"
			style="background: var(--surface-muted); color: var(--text-secondary); border: 1px solid var(--border)"
			role="status"
		>
			<svg class="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">
				<rect x="4" y="11" width="16" height="10" rx="2" />
				<path d="M8 11V7a4 4 0 1 1 8 0v4" />
			</svg>
			<span class="flex-1">{$t('journal.diary_hint')}</span>
		</div>
	{/if}

	<!-- Entries -->
	{#if filteredDocs.length === 0}
		<div class="text-center py-12">
			<div class="mb-3 flex justify-center">
				<Asterisk size={48} mode="empty" color="muted" />
			</div>
			{#if filter === 'diary'}
				<p class="text-sm mb-3" style="color: var(--text-muted)">{$t('journal.diary_empty')}</p>
			{:else}
				<p class="text-sm mb-3" style="color: var(--text-muted)">{$t('stream.no_entries')}</p>
				<a href="/log/today" class="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" stroke-width="2"/><line x1="5" y1="12" x2="19" y2="12" stroke-width="2"/></svg>
					{$t('companion.fill_today')}
				</a>
			{/if}
		</div>
	{:else}
		<!-- CIPH-763b — aria-live announces new additions to the entry list
			 (e.g. quick-add diary entry). aria-relevant="additions" scopes
			 announcements to newly-appearing nodes so SR users don't hear
			 the full list re-read when filters change. -->
		<div class="space-y-2" aria-live="polite" aria-relevant="additions" aria-atomic="false">
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
							<div>
								<label class="text-xs" style="color: var(--text-secondary)" for="journal-edit-notes-{doc.id}">{$t('common.notes')}</label>
								<textarea
									id="journal-edit-notes-{doc.id}"
									bind:value={editNotes}
									rows="2"
									class="input resize-y mt-1"
								></textarea>
							</div>
							<!-- CIPH-713 / CIPH-783 — private toggle with semantic lock state -->
							<label class="flex items-center gap-2 text-xs" style="color: var(--text-secondary)"
								aria-label={editPrivate ? $t('private.toggle_to_public') : $t('private.toggle_to_private')}>
								<input type="checkbox" bind:checked={editPrivate} class="w-4 h-4" />
								{#if editPrivate}
									<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="transition-all duration-150">
										<rect x="4" y="11" width="16" height="10" rx="2" />
										<path d="M8 11V7a4 4 0 1 1 8 0v4" />
									</svg>
								{:else}
									<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="transition-all duration-150">
										<rect x="4" y="11" width="16" height="10" rx="2" />
										<path d="M8 11V7a4 4 0 0 1 7 -1.5" />
									</svg>
								{/if}
								{editPrivate ? $t('private.state_private') : $t('private.state_public')}
								<span style="color: var(--text-muted)">— {$t('private.tooltip')}</span>
							</label>
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
								<EntryPreview entry={doc} {bp} recentDocs={$documents} />
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
										<ConfirmDelete
											onConfirm={() => handleDelete(doc.id)}
											onCancel={() => { confirmDeleteId = null; }}
										/>
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
	@keyframes journalSearchSlide {
		from { transform: translateX(-8px); opacity: 0; }
		to { transform: translateX(0); opacity: 1; }
	}
	.journal-search-anim {
		animation: journalSearchSlide 180ms ease-out;
	}
	button.p-2:hover {
		color: var(--brand);
		background: var(--brand-light);
	}
	button[aria-label]:last-child:hover {
		color: var(--danger);
		background: rgba(220, 38, 38, 0.05);
	}
</style>
