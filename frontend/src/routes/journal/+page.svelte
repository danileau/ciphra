<!-- primitive-exempt: ConfirmDelete — the moment-view modal renders an
	 inline yes-delete/cancel row inside the modal body, with a full-width
	 confirmation step that swaps the bottom action band. ConfirmDelete
	 primitive is the compact icon-pair used on journal/calendar rows;
	 inside a modal that already has its own action chrome, the icon pair
	 would feel out of register. Pattern matches EntryComposer's banner-
	 variant exemption. -->
<!--
	CIPH-902 — Journal redesign.

	Threema-style chronological timeline. Day-grouped cards under floating
	month headers. Each card's left-rail color signals doc type (olive
	entry / ochre event / brand diary); no badge, no per-type icon. The
	whole card is the affordance: entries link to /log/{date}, events and
	diaries open a moment-view modal with the edit form. Per-card edit /
	delete icons are gone — delete is hidden inside the moment-view (or,
	for entries, behind the EntryComposer save bar) so it can't be
	triggered in panic or by mistake.

	Diary text uses the same sans body treatment as the rest of the app
	(the earlier serif treatment was reverted — it read as inconsistent).
	Per-chip color stripes and the +N truncation on chips were dropped
	(see EntryPreview); the journal now lets card height carry "loud day
	vs quiet day" as visual rhythm.
-->
<script lang="ts">
	import { t, locale, plural } from '$lib/i18n';
	import { todayISO } from '$lib/date';
	import { isAuthenticated } from '$lib/stores/auth';
	import { documents, type CiphraDocument } from '$lib/stores/documents';
	import { resolvedBlueprint, isCustomItem } from '$lib/blueprint';
	import { quickAddOpen } from '$lib/stores/quickAdd';
	import { onMount, onDestroy, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import EntryPreview from '$lib/components/EntryPreview.svelte';
	import JournalEmpty from '$lib/components/JournalEmpty.svelte';
	import { buildNarrative, groupByMonth, type JournalDay, type JournalText } from '$lib/journal/narrative';
	import Modal from '$lib/components/Modal.svelte';

	// ── Filters ──────────────────────────────────────────────────────────
	// The old bar was three tabs — All / Entries / Note markers — two of
	// which selected nearly the same thing, plus a search icon that expanded
	// into a field. Search is the reason to be on this page, so it is the
	// page now, and the narrowing controls sit beside it.
	let filter: 'all' | 'diary' | 'note' | 'marker' = 'all';
	let withEpisodeOnly = false;
	let rangeMonths: 0 | 3 | 12 = 0;   // 0 = everything
	let searchQuery = '';

	const KIND_CHIPS: Array<{ id: 'all' | 'diary' | 'note' | 'marker'; key: string }> = [
		{ id: 'all', key: 'stream.filter_all' },
		{ id: 'note', key: 'stream.filter_notes' },
		{ id: 'diary', key: 'stream.filter_diary' },
		{ id: 'marker', key: 'stream.filter_markers' },
	];
	const RANGE_CHIPS: Array<{ months: 0 | 3 | 12; key: string }> = [
		{ months: 0, key: 'stream.range_all' },
		{ months: 12, key: 'stream.range_12m' },
		{ months: 3, key: 'stream.range_3m' },
	];

	$: rangeFromISO = (() => {
		if (!rangeMonths) return undefined;
		const d = new Date();
		d.setMonth(d.getMonth() - rangeMonths);
		return d.toISOString().slice(0, 10);
	})();
	let searchOpen = false;
	let searchInputEl: HTMLInputElement | null = null;

	// CIPH-711 / CIPH-725 — soft clarification banner for the Tagebuch tab.
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

	// CIPH-902 — Moment-view modal state. Events and diaries open here for
	// editing; entries route to /log/{date} where EntryComposer handles
	// edit + delete via its existing save bar.
	let momentDoc: CiphraDocument | null = null;
	let momentNotes = '';
	let momentText = '';
	let momentPrivate = false;
	let momentSaving = false;
	let momentConfirmDelete = false;

	// A note lives on its entry, so it routes into the form where the rest of
	// that day is editable. Diaries and markers are standalone and open the
	// moment view. The card is the only affordance — the old layout had a
	// "Show details" link inside a card that was itself a link, on some cards
	// but not others.
	function openText(txt: JournalText) {
		const doc = $documents.find((d) => d.id === txt.id);
		if (!doc) return;
		if (txt.docType === 'entry') {
			goto(`/log/${txt.dateISO}`);
			return;
		}
		openMoment(doc);
	}

	function openMoment(doc: CiphraDocument) {
		momentDoc = doc;
		momentNotes = doc.data.notes || '';
		momentText = String(doc.data.text || '');
		momentPrivate = doc.data.private === true;
		momentConfirmDelete = false;
	}

	function closeMoment() {
		momentDoc = null;
		momentNotes = '';
		momentText = '';
		momentPrivate = false;
		momentConfirmDelete = false;
	}

	async function saveMoment() {
		if (!momentDoc) return;
		momentSaving = true;
		const updated: Record<string, unknown> = { ...momentDoc.data };
		updated.notes = momentNotes;
		if (momentDoc.data.type === 'diary') {
			updated.text = momentText;
		}
		// CIPH-713 — preserve absence of `private` rather than writing `false`.
		if (momentPrivate) updated.private = true;
		else delete updated.private;
		await documents.updateDoc(momentDoc.id, updated);
		momentSaving = false;
		closeMoment();
	}

	async function deleteMoment() {
		if (!momentDoc) return;
		await documents.remove(momentDoc.id);
		closeMoment();
	}

	onMount(() => {
		if (!$isAuthenticated) { goto('/login'); return; }
		documents.load();
		try {
			diaryViews = parseInt(localStorage.getItem('ciphra_tagebuch_views') || '0', 10) || 0;
		} catch {}
	});

	// CIPH-725 — view-counter increment for the diary-hint timeout.
	let lastCountedFilter = '';
	$: if (filter === 'diary' && lastCountedFilter !== 'diary') {
		lastCountedFilter = 'diary';
		diaryViews += 1;
		try { localStorage.setItem('ciphra_tagebuch_views', String(diaryViews)); } catch {}
	} else if (filter !== 'diary') {
		lastCountedFilter = filter;
	}

	$: bp = $resolvedBlueprint;

	// ── The narrative feed ──────────────────────────────────────────────
	// Days that hold WRITING, newest first. The metric cards this replaced
	// rendered one ~110px block per logged day — 631 of them for a two-year
	// persona, 69,000px of page — each holding one grey line of numbers, so
	// the day with an attack looked exactly like the day with 7h of sleep.
	// Measured values live in /reports; the calendar answers "what happened
	// on day X". What no other surface holds is what the person wrote.
	$: narrative = buildNarrative($documents, bp, {
		query: searchQuery,
		kind: filter as any,
		withEpisodeOnly,
		fromISO: rangeFromISO,
	});

	// ── Windowing ────────────────────────────────────────────────────────
	// Every matching day used to mount at once. A sentinel below the list
	// extends the window as it scrolls into view, so a five-year account
	// costs the same first paint as a five-day one.
	const PAGE = 40;
	let windowSize = PAGE;
	// Any filter change resets the window — otherwise a narrowing filter
	// leaves the user scrolled past the end of the new result set.
	$: {
		void searchQuery; void filter; void withEpisodeOnly; void rangeFromISO;
		windowSize = PAGE;
	}
	$: visibleDays = narrative.slice(0, windowSize);
	$: hasMore = narrative.length > visibleDays.length;
	$: groupedMonths = groupByMonth(visibleDays);

	let sentinel: HTMLDivElement | null = null;
	$: if (sentinel && typeof IntersectionObserver !== 'undefined') {
		const el = sentinel;
		const io = new IntersectionObserver((entries) => {
			if (entries.some((e) => e.isIntersecting)) windowSize += PAGE;
		}, { rootMargin: '600px' });
		io.observe(el);
		observers.forEach((o) => o.disconnect());
		observers = [io];
	}
	let observers: IntersectionObserver[] = [];
	onDestroy(() => observers.forEach((o) => o.disconnect()));

	function formatMonthHeader(monthKey: string): string {
		const d = new Date(monthKey + '-01T12:00:00');
		return d.toLocaleDateString($locale, { month: 'long', year: 'numeric' });
	}

	function formatDayHeader(dayKey: string): { label: string; meta: string } {
		const d = new Date(dayKey + 'T12:00:00');
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);
		const target = new Date(d);
		target.setHours(0, 0, 0, 0);

		const dayMs = 86400000;
		const diff = (today.getTime() - target.getTime()) / dayMs;

		// ONE shape for every row. It used to swap at day 7 — "Wednesday ·
		// Aug 19" above, "August 8 · Sat" below — so primary and secondary
		// traded places in the middle of the same list. Both branches also
		// wrote the date into a field called `weekday`, which is how the swap
		// slipped in unnoticed.
		//
		// Today / Yesterday keep their names because those are how people
		// refer to them, and they carry the date alongside rather than
		// instead of it.
		const date = d.toLocaleDateString($locale, { day: 'numeric', month: 'short' });
		if (diff === 0) return { label: $t('common.today'), meta: date };
		if (diff === 1) return { label: $t('common.yesterday'), meta: date };
		return {
			label: d.toLocaleDateString($locale, { weekday: 'long' }),
			meta: date,
		};
	}

	function cardHref(doc: CiphraDocument): string | null {
		// Entries route into the form. Events / diaries open the moment modal.
		if (doc.data.type === 'entry') {
			return `/log/${String(doc.data.date || '')}`;
		}
		return null;
	}
</script>

<div class="layout-data pt-4">
	<div class="flex items-center justify-between gap-3 mb-4">
		<h1 class="text-2xl font-bold" style="color: var(--text-primary)">{$t('stream.title')}</h1>
		<!-- CIPH-pi24-5d — Desktop add affordance. Replaces the dropped
			 global FAB for the one surface where it was uniquely useful
			 (calendar has day-click; dashboard has the S5+S1 CTA). Hidden
			 on mobile because BottomNav center-+ already covers the role. -->
		<button
			type="button"
			on:click={() => quickAddOpen.set(true)}
			class="btn-primary px-4 py-2 text-sm hidden md:inline-flex items-center gap-1.5 shrink-0"
			data-testid="journal-add"
		>
			<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
			{$t('nav.add')}
		</button>
	</div>

	<!-- ── Search + narrowing ──────────────────────────────────────────
		 Search is the page, not an icon on it: finding and re-reading is the
		 only job no other surface covers. The narrowing controls sit under
		 it rather than as tabs, because "diary" and "note marker" are kinds
		 of writing, not separate feeds. -->
	<div class="jr-controls">
		<div class="jr-search">
			<svg class="jr-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" stroke-linecap="round" />
			</svg>
			<input
				type="search"
				bind:value={searchQuery}
				placeholder={$t('stream.search_placeholder')}
				aria-label={$t('stream.search_placeholder')}
				class="jr-search-input"
				data-testid="journal-search"
			/>
			{#if searchQuery}
				<button type="button" class="jr-search-clear" on:click={() => (searchQuery = '')}
					aria-label={$t('common.cancel')}>×</button>
			{/if}
		</div>

		<div class="jr-chips" role="group" aria-label={$t('stream.title')}>
			{#each KIND_CHIPS as c (c.id)}
				<button
					type="button"
					class="jr-chip"
					class:active={filter === c.id}
					aria-pressed={filter === c.id}
					data-testid="journal-filter-{c.id}"
					on:click={() => (filter = c.id)}
				>{$t(c.key)}</button>
			{/each}
			<span class="jr-chip-sep" aria-hidden="true"></span>
			{#each RANGE_CHIPS as r (r.months)}
				<button
					type="button"
					class="jr-chip"
					class:active={rangeMonths === r.months}
					aria-pressed={rangeMonths === r.months}
					on:click={() => (rangeMonths = r.months)}
				>{$t(r.key)}</button>
			{/each}
			{#if (bp?.episodeTypes?.length ?? 0) > 0}
				<span class="jr-chip-sep" aria-hidden="true"></span>
				<button
					type="button"
					class="jr-chip"
					class:active={withEpisodeOnly}
					aria-pressed={withEpisodeOnly}
					data-testid="journal-filter-episode"
					on:click={() => (withEpisodeOnly = !withEpisodeOnly)}
				>{$t('stream.filter_with_episode')}</button>
			{/if}
		</div>

		<p class="jr-count" aria-live="polite">
			{plural($t, $locale, 'stream.result_count', narrative.length)}
		</p>
	</div>

	{#if showDiaryHint}
		<p class="jr-hint">{$t('journal.diary_hint')}</p>
	{/if}

	{#if narrative.length === 0}
		{#if searchQuery || filter !== 'all' || withEpisodeOnly || rangeMonths}
			<p class="jr-none" data-testid="journal-no-results">{$t('stream.no_results')}</p>
		{:else}
			<JournalEmpty on:add={() => quickAddOpen.set(true)} />
		{/if}
	{:else}
		<div class="jr-feed" data-testid="journal-feed">
			{#each groupedMonths as month (month.monthKey)}
				<section class="jr-month">
					<h2 class="jr-month-header">{formatMonthHeader(month.monthKey)}</h2>
					{#each month.days as day (day.dayKey)}
						{@const dh = formatDayHeader(day.dayKey)}
						<article class="jr-day" data-testid="journal-day">
							<header class="jr-day-head">
								<span class="jr-day-label">{dh.label}</span>
								<span class="jr-day-meta">{dh.meta}</span>
								{#if day.episodes.length > 0}
									<span class="jr-eps">
										{#each day.episodes as ep (ep.id)}
											<span class="jr-ep" data-testid="journal-episode">
												{ep.count > 1 ? `${ep.count}× ` : ''}{ep.isCustom ? ep.label : $t(ep.label)}
											</span>
										{/each}
									</span>
								{/if}
							</header>
							{#each day.texts as txt (txt.id)}
								<button
									type="button"
									class="jr-text jr-text--{txt.kind}"
									data-testid="journal-text"
									on:click={() => openText(txt)}
								>
									{#if txt.time}<span class="jr-time">{txt.time}</span>{/if}
									<span class="jr-body">{txt.text}</span>
								</button>
							{/each}
						</article>
					{/each}
				</section>
			{/each}
			{#if hasMore}
				<div bind:this={sentinel} class="jr-sentinel" aria-hidden="true"></div>
			{/if}
		</div>
	{/if}
</div>

<!-- CIPH-902 — Moment-view modal for events / diaries. Edit + delete
	 live here; the journal card itself is now read-only. Delete moves
	 behind a confirm step inside the modal so it can't fire by mistake. -->
{#if momentDoc}
	<Modal
		open={true}
		title={momentDoc.data.type === 'diary' ? $t('quickadd.mode_diary') : $t('stream.events')}
		onClose={closeMoment}
		maxWidth="max-w-md"
	>
		<div class="space-y-4">
			{#if momentDoc.data.date}
				<p class="text-xs" style="color: var(--text-muted)">
					{new Date(momentDoc.data.date + (momentDoc.data.time ? 'T' + momentDoc.data.time : 'T12:00:00')).toLocaleDateString($locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
					{#if momentDoc.data.time}
						<span> · {momentDoc.data.time}</span>
					{/if}
				</p>
			{/if}

			{#if momentDoc.data.type === 'diary'}
				<div>
					<label class="text-xs" style="color: var(--text-secondary)" for="moment-text">{$t('quickadd.diary_text_label')}</label>
					<textarea
						id="moment-text"
						bind:value={momentText}
						rows="6"
						class="input resize-y mt-1"
					></textarea>
				</div>
			{/if}

			<div>
				<label class="text-xs" style="color: var(--text-secondary)" for="moment-notes">{$t('common.notes')}</label>
				<textarea
					id="moment-notes"
					bind:value={momentNotes}
					rows="2"
					class="input resize-y mt-1"
				></textarea>
			</div>

			<label class="flex items-center gap-2 text-xs" style="color: var(--text-secondary)"
				aria-label={momentPrivate ? $t('private.toggle_to_public') : $t('private.toggle_to_private')}>
				<input type="checkbox" bind:checked={momentPrivate} class="w-4 h-4" />
				{#if momentPrivate}
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<rect x="4" y="11" width="16" height="10" rx="2" />
						<path d="M8 11V7a4 4 0 1 1 8 0v4" />
					</svg>
				{:else}
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<rect x="4" y="11" width="16" height="10" rx="2" />
						<path d="M8 11V7a4 4 0 0 1 7 -1.5" />
					</svg>
				{/if}
				{momentPrivate ? $t('private.state_private') : $t('private.state_public')}
				<!-- Same bug as the quick-add sheet: the hint must follow the state. -->
				<span style="color: var(--text-muted)">— {momentPrivate ? $t('private.tooltip') : $t('private.state_public_hint')}</span>
			</label>

			<div class="flex flex-wrap gap-2 justify-end pt-2" style="border-top: 1px solid var(--border)">
				{#if momentConfirmDelete}
					<div class="flex items-center gap-2 w-full" transition:fade={{ duration: 150 }}>
						<span class="text-sm flex-1" style="color: var(--danger)">{$t('common.confirm_delete')}</span>
						<button
							type="button"
							on:click={() => (momentConfirmDelete = false)}
							class="btn-secondary px-3 py-1.5 text-sm"
						>{$t('common.cancel')}</button>
						<button
							type="button"
							on:click={deleteMoment}
							class="px-3 py-1.5 text-sm rounded-lg min-h-[44px] inline-flex items-center"
							style="background: var(--danger); color: white"
						>{$t('common.yes_delete')}</button>
					</div>
				{:else}
					<button
						type="button"
						on:click={() => (momentConfirmDelete = true)}
						class="text-sm px-3 py-1.5 mr-auto min-h-[44px] inline-flex items-center"
						style="color: var(--text-muted)"
					>{$t('common.delete')}</button>
					<button
						type="button"
						on:click={closeMoment}
						class="btn-secondary px-3 py-1.5 text-sm"
					>{$t('common.cancel')}</button>
					<button
						type="button"
						on:click={saveMoment}
						disabled={momentSaving}
						class="btn-primary px-4 py-1.5 text-sm"
					>{momentSaving ? $t('common.loading') : $t('common.save')}</button>
				{/if}
			</div>
		</div>
	</Modal>
{/if}

<style>
	/* ── Journal v2 ────────────────────────────────────────────────────────
	   The old card was chrome around nothing: a 1100px-wide bordered box with
	   a rail and padding, holding one short grey line. Here the WRITING is
	   the object — it sets the type size and the vertical rhythm — and the
	   frame is a rule, not a box. */

	.jr-controls { margin-bottom: 1.25rem; }

	.jr-search {
		position: relative;
		display: flex;
		align-items: center;
	}
	.jr-search-icon {
		position: absolute;
		left: 0.7rem;
		width: 15px;
		height: 15px;
		color: var(--text-muted);
		pointer-events: none;
	}
	.jr-search-input {
		width: 100%;
		min-height: 44px;
		padding: 0 2.2rem 0 2.1rem;
		font-size: 0.9375rem;
		color: var(--text-primary);
		background: var(--surface-card);
		border: 1px solid var(--border);
		border-radius: 10px;
	}
	.jr-search-input::-webkit-search-cancel-button { display: none; }
	.jr-search-input:focus-visible {
		outline: none;
		border-color: var(--accent, var(--brand));
		box-shadow: 0 0 0 3px rgba(var(--accent-rgb, 178 60 44), 0.12);
	}
	.jr-search-clear {
		position: absolute;
		right: 0.2rem;
		min-width: 44px;
		min-height: 44px;
		font-size: 1.15rem;
		line-height: 1;
		color: var(--text-muted);
		background: none;
		border: none;
		cursor: pointer;
	}

	.jr-chips {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
		margin-top: 0.6rem;
	}
	.jr-chip {
		/* 44px WCAG 2.5.5 floor — the /journal touch-target contract
		   (CIPH-pi22-JC-1). These have no equivalent path elsewhere, so the
		   grid-cell exception does not apply. */
		min-height: 44px;
		padding: 0 0.7rem;
		font-size: 0.75rem;
		color: var(--text-secondary);
		background: var(--surface-muted);
		border: 1px solid transparent;
		border-radius: 9999px;
		cursor: pointer;
		transition: background 0.12s ease-out, color 0.12s ease-out;
	}
	.jr-chip:hover { color: var(--text-primary); }
	.jr-chip.active {
		color: var(--accent, var(--brand));
		background: var(--surface-card);
		border-color: var(--accent, var(--brand));
		font-weight: 600;
	}
	.jr-chip:focus-visible {
		outline: 2px solid var(--accent, var(--brand));
		outline-offset: 1px;
	}
	.jr-chip-sep {
		width: 1px;
		height: 18px;
		margin: 0 0.25rem;
		background: var(--border);
	}

	.jr-count {
		margin: 0.55rem 0 0;
		font-size: 0.6875rem;
		color: var(--text-muted);
	}
	.jr-hint, .jr-none {
		margin: 0 0 1rem;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.jr-month + .jr-month { margin-top: 1.75rem; }
	.jr-month-header {
		position: sticky;
		top: 0;
		z-index: 1;
		margin: 0 0 0.6rem;
		padding: 0.4rem 0;
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
		background: var(--surface-page, var(--surface-muted));
	}

	.jr-day {
		padding: 0.7rem 0 0.85rem;
		border-top: 1px solid var(--border-subtle, var(--border));
	}
	.jr-day-head {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.45rem;
		margin-bottom: 0.3rem;
	}
	.jr-day-label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text-primary);
	}
	.jr-day-meta {
		font-size: 0.6875rem;
		color: var(--text-muted);
	}

	/* Episodes are CONTEXT for the writing beside them — a note about aura
	   means something different next to "1× Migraine with aura". They never
	   put a day in this list; see lib/journal/narrative.ts. */
	.jr-eps { display: inline-flex; flex-wrap: wrap; gap: 0.25rem; }
	.jr-ep {
		padding: 1px 0.45rem;
		font-size: 0.625rem;
		font-weight: 600;
		color: var(--accent, var(--brand));
		background: var(--surface-card);
		border: 1px solid var(--accent, var(--brand));
		border-radius: 9999px;
	}

	.jr-text {
		display: block;
		width: 100%;
		padding: 0.3rem 0 0.3rem 0.7rem;
		text-align: left;
		background: none;
		border: none;
		border-left: 2px solid var(--border);
		cursor: pointer;
		font: inherit;
	}
	.jr-text:hover { border-left-color: var(--text-muted); }
	.jr-text:focus-visible {
		outline: 2px solid var(--accent, var(--brand));
		outline-offset: 2px;
	}
	/* The rail is the only type signal — no badge, no icon, matching the
	   convention the previous design established. */
	.jr-text--diary { border-left-color: var(--brand); }
	.jr-text--marker { border-left-color: var(--ochre, #9f630b); }
	.jr-text--note { border-left-color: var(--olive, #7f821b); }

	.jr-time {
		display: inline-block;
		margin-right: 0.4rem;
		font-size: 0.6875rem;
		font-variant-numeric: tabular-nums;
		color: var(--text-muted);
	}
	.jr-body {
		font-size: 0.9375rem;
		line-height: 1.5;
		color: var(--text-primary);
		overflow-wrap: anywhere;
	}
	.jr-text--diary .jr-body { font-style: italic; }

	/* On a phone the eight chips wrap to three rows — ~156px of controls
	   before any content on an 844px screen. One scrollable row instead:
	   every option stays reachable (nothing is hidden behind a disclosure,
	   which is the mistake the old search icon made), and the separators
	   keep the groups legible while scrolling. */
	@media (max-width: 640px) {
		.jr-chips {
			flex-wrap: nowrap;
			overflow-x: auto;
			scrollbar-width: none;
			-webkit-overflow-scrolling: touch;
			padding-bottom: 0.2rem;
		}
		.jr-chips::-webkit-scrollbar { display: none; }
		.jr-chip { flex: 0 0 auto; }
	}

	.jr-sentinel { height: 1px; }

	@media (prefers-reduced-motion: reduce) {
		.jr-chip, .jr-text { transition: none; }
	}
</style>
