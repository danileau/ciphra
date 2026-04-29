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

	Diary text gets a serif treatment so narrative reads differently from
	data. Per-chip color stripes and the +N truncation on chips were
	dropped (see EntryPreview); the journal now lets card height carry
	"loud day vs quiet day" as visual rhythm.
-->
<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { isAuthenticated } from '$lib/stores/auth';
	import { documents, type CiphraDocument } from '$lib/stores/documents';
	import { resolvedBlueprint, isCustomItem } from '$lib/blueprint';
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import EntryPreview from '$lib/components/EntryPreview.svelte';
	import JournalEmpty from '$lib/components/JournalEmpty.svelte';
	import Modal from '$lib/components/Modal.svelte';

	let filter = 'all';
	let searchQuery = '';
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

	$: filteredDocs = $documents
		.filter(d => {
			if (d.data?.type === 'blueprint') return false;
			if (filter !== 'all' && d.data.type !== filter) return false;
			if (searchQuery) {
				// CIPH-767d — narrative-text-only search.
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

	// CIPH-902 — Group docs by month → day for the timeline rendering.
	type DayGroup = { dayKey: string; docs: CiphraDocument[] };
	type MonthGroup = { monthKey: string; days: DayGroup[] };

	$: groupedDocs = (() => {
		const monthMap = new Map<string, Map<string, CiphraDocument[]>>();
		for (const doc of filteredDocs) {
			const dateStr = String(doc.data.date || doc.serverCreatedAt);
			const day = dateStr.slice(0, 10);
			const month = dateStr.slice(0, 7);
			if (!monthMap.has(month)) monthMap.set(month, new Map());
			const days = monthMap.get(month)!;
			if (!days.has(day)) days.set(day, []);
			days.get(day)!.push(doc);
		}
		const out: MonthGroup[] = [];
		for (const [monthKey, days] of monthMap) {
			const dayList: DayGroup[] = [];
			for (const [dayKey, docs] of days) {
				// Within a day, sort by time desc when present, else stable.
				const sorted = [...docs].sort((a, b) => {
					const ta = String(a.data.time || '');
					const tb = String(b.data.time || '');
					if (ta && tb) return tb.localeCompare(ta);
					return 0;
				});
				dayList.push({ dayKey, docs: sorted });
			}
			out.push({ monthKey, days: dayList });
		}
		return out;
	})();

	// CIPH-907b — Per-day phase tags. For day-groups containing an
	// entry doc with active multiDay episodes, surface them as chips on
	// the day-header so the user can scan a column and see "manic /
	// flare / depressive" days at a glance, even before reading the
	// cards. Mirrors the calendar bottom-sheet pattern (CIPH-880).
	type PhaseTag = { id: string; color: string; label: string };
	type ClosedStreak = {
		epId: string;
		color: string;
		label: string;
		startDate: string; // chronologically first
		endDate: string;   // chronologically last
		dayCount: number;
	};
	type RenderItem =
		| { kind: 'day'; day: DayGroup }
		| { kind: 'streak'; days: DayGroup[]; streak: ClosedStreak };
	function phasesActiveOn(docs: CiphraDocument[]): PhaseTag[] {
		if (!bp?.episodeTypes) return [];
		const out: PhaseTag[] = [];
		for (const ep of bp.episodeTypes) {
			if (!ep.multiDay) continue;
			const active = docs.some(
				(d) =>
					d.data.type === 'entry' &&
					Number(
						(d.data.episodes || d.data.seizures || {})[ep.id] || 0,
					) > 0,
			);
			if (active) {
				out.push({
					id: ep.id,
					color: ep.color,
					label: ep.label,
				});
			}
		}
		return out;
	}

	// CIPH-911 — Closed-phase brackets. Group consecutive calendar days
	// in the journal that share an active multiDay episode AND whose
	// most-recent day is in the past (closed in real time). Render the
	// run inside a wrapper with a vertical rail + label on the right
	// ("Manie · 4 Tage" with a `{`-style bracket). Open phases (still
	// active today) keep using the per-day phase tag — no bracket, since
	// the streak hasn't ended.
	const TODAY_DATE = new Date().toISOString().slice(0, 10);
	function computeRenderGroups(monthDays: DayGroup[]): RenderItem[] {
		const out: RenderItem[] = [];
		let i = 0;
		while (i < monthDays.length) {
			// monthDays sorted desc; index i = most-recent unprocessed day.
			const day = monthDays[i];
			const dayPhases = phasesActiveOn(day.docs);
			if (dayPhases.length === 0) {
				out.push({ kind: 'day', day });
				i++;
				continue;
			}
			// Find the longest run of calendar-consecutive days from i forward
			// that share at least one active multiDay episode.
			let bestRun = 1;
			let bestPhase: PhaseTag | null = null;
			for (const ph of dayPhases) {
				let run = 1;
				let cursor = i;
				while (cursor + 1 < monthDays.length) {
					const prevDay = monthDays[cursor + 1];
					// Calendar adjacency: prevDay's date = monthDays[cursor]'s date - 1.
					const expectedPrev = new Date(monthDays[cursor].dayKey + 'T12:00:00');
					expectedPrev.setDate(expectedPrev.getDate() - 1);
					const expectedKey = expectedPrev.toISOString().slice(0, 10);
					if (prevDay.dayKey !== expectedKey) break;
					const prevPhases = phasesActiveOn(prevDay.docs);
					if (!prevPhases.some((p) => p.id === ph.id)) break;
					run++;
					cursor++;
				}
				if (run > bestRun) {
					bestRun = run;
					bestPhase = ph;
				}
			}
			if (bestRun >= 2 && bestPhase) {
				const streakDays = monthDays.slice(i, i + bestRun);
				const latestDate = streakDays[0].dayKey; // chronologically last
				const earliestDate = streakDays[bestRun - 1].dayKey;
				// Closed when the streak's most-recent day is before today.
				const isClosed = latestDate < TODAY_DATE;
				if (isClosed) {
					out.push({
						kind: 'streak',
						days: streakDays,
						streak: {
							epId: bestPhase.id,
							color: bestPhase.color,
							label: bestPhase.label,
							startDate: earliestDate,
							endDate: latestDate,
							dayCount: bestRun,
						},
					});
					i += bestRun;
					continue;
				}
			}
			out.push({ kind: 'day', day });
			i++;
		}
		return out;
	}

	// CIPH-907 — Journal cards take their rail color from the LOGGED DATA,
	// not just the doc type. An entry day with an active multiDay episode
	// (flare, manic, MS relapse, IBD flare, endo flare...) gets that
	// episode's color. An entry day with a counter episode logged gets
	// that episode's color. Empty entry days fall back to olive. Events
	// stay ochre, diaries stay brand — those types are intrinsic, not
	// data-driven. Result: scrolling the journal visually surfaces phase
	// patterns at a glance instead of reading every chip.
	function railColor(doc: CiphraDocument): string {
		const t = doc.data.type;
		if (t === 'diary') return 'var(--brand)';
		if (t === 'event') return 'var(--ochre)';
		if (t === 'entry' && bp) {
			const eps = (doc.data.episodes || doc.data.seizures || {}) as Record<string, number>;
			// Prefer multiDay-active episodes (a flare day IS a flare day).
			for (const ep of bp.episodeTypes) {
				if (ep.multiDay && Number(eps[ep.id] || 0) > 0) return ep.color;
			}
			// Else first counter-bearing episode color.
			for (const ep of bp.episodeTypes) {
				if (Number(eps[ep.id] || 0) > 0) return ep.color;
			}
		}
		return 'var(--olive)';
	}

	function formatMonthHeader(monthKey: string): string {
		const d = new Date(monthKey + '-01T12:00:00');
		return d.toLocaleDateString($locale, { month: 'long', year: 'numeric' });
	}

	function formatDayHeader(dayKey: string): { label: string; weekday: string } {
		const d = new Date(dayKey + 'T12:00:00');
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);
		const target = new Date(d);
		target.setHours(0, 0, 0, 0);

		const dayMs = 86400000;
		const diff = (today.getTime() - target.getTime()) / dayMs;

		if (diff === 0) return { label: $t('common.today'), weekday: '' };
		if (diff === 1) return { label: $t('common.yesterday'), weekday: '' };
		if (diff > 0 && diff < 7) {
			return {
				label: d.toLocaleDateString($locale, { weekday: 'long' }),
				weekday: d.toLocaleDateString($locale, { day: 'numeric', month: 'short' }),
			};
		}
		return {
			label: d.toLocaleDateString($locale, { day: 'numeric', month: 'long' }),
			weekday: d.toLocaleDateString($locale, { weekday: 'short' }),
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
	<h1 class="text-2xl font-bold mb-4" style="color: var(--text-primary)">{$t('stream.title')}</h1>

	<!-- Search + filter row (CIPH-424) — filter chips are now cohort-aware
		 via --accent; the previous hardcoded olive bled brand-discrete color
		 onto cycle / phase / narrative cohorts. -->
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
						class="journal-filter-chip {filter === tab.key ? 'journal-filter-chip--active' : ''}"
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

	<!-- Stream -->
	{#if filteredDocs.length === 0}
		<JournalEmpty
			variant={filter === 'diary' ? 'diary' : 'all'}
			hideCta={filter === 'diary' || !!searchQuery}
			onLogToday={() => goto('/log/today')}
		/>
	{:else}
		<!-- CIPH-763b — aria-live announces new additions. -->
		<div aria-live="polite" aria-relevant="additions" aria-atomic="false">
			{#each groupedDocs as month (month.monthKey)}
				<section class="journal-month">
					<h2 class="journal-month-header">{formatMonthHeader(month.monthKey)}</h2>
					{#each computeRenderGroups(month.days) as item, itemIdx (itemIdx)}
						{#if item.kind === 'streak'}
							<!-- CIPH-911 — closed-phase streak group. Rail + label
								 on the right brackets the consecutive days. Per-day
								 phase tags are suppressed inside the group (the rail
								 label carries the phase identity). -->
							<div class="journal-streak-group" style="--streak-color: {item.streak.color}">
								<!-- Header banner above the grouped days. Carries the
									 phase identity + day count once for the whole run.
									 The vertical rail to the LEFT of the days is decoration
									 (aria-hidden); semantic header lives in this <p>. -->
								<p class="journal-streak-header">
									<span class="journal-streak-name">{isCustomItem(item.streak.epId) ? item.streak.label : $t(item.streak.label)}</span>
									<span class="journal-streak-meta">· {$t('reports.glance_n_days', { n: item.streak.dayCount })}</span>
								</p>
								<aside class="journal-streak-rail" aria-hidden="true"></aside>
								<div class="journal-streak-days">
									{#each item.days as day (day.dayKey)}
										{@const dh = formatDayHeader(day.dayKey)}
										<div class="journal-day">
											<p class="journal-day-header">
												<span class="journal-day-label">{dh.label}</span>
												{#if dh.weekday}<span class="journal-day-meta">· {dh.weekday}</span>{/if}
											</p>
											<div class="journal-day-stack">
												{#each day.docs as doc (doc.id)}
													{@const href = cardHref(doc)}
													{@const railHex = railColor(doc)}
													{#if href}
														<a href={href} class="journal-card" style="border-left-color: {railHex}">
															{#if doc.data.time}<span class="journal-card-time">{doc.data.time}</span>{/if}
															<EntryPreview entry={doc} {bp} showDate={false} hideType={true} recentDocs={$documents} />
														</a>
													{:else}
														<button type="button" on:click={() => openMoment(doc)} class="journal-card journal-card--button" style="border-left-color: {railHex}">
															{#if doc.data.time}<span class="journal-card-time">{doc.data.time}</span>{/if}
															<EntryPreview entry={doc} {bp} showDate={false} hideType={true} recentDocs={$documents} />
														</button>
													{/if}
												{/each}
											</div>
										</div>
									{/each}
								</div>
							</div>
						{:else}
							{@const day = item.day}
							{@const dh = formatDayHeader(day.dayKey)}
							{@const phases = phasesActiveOn(day.docs)}
							<div class="journal-day">
								<p class="journal-day-header">
									<span class="journal-day-label">{dh.label}</span>
									{#if dh.weekday}<span class="journal-day-meta">· {dh.weekday}</span>{/if}
									{#each phases as p}
										<span
											class="journal-phase-tag"
											style="background: {p.color}1f; color: {p.color}; border-color: {p.color}66"
										>{isCustomItem(p.id) ? p.label : $t(p.label)}</span>
									{/each}
								</p>
								<div class="journal-day-stack">
									{#each day.docs as doc (doc.id)}
										{@const href = cardHref(doc)}
										{@const railHex = railColor(doc)}
										{#if href}
											<a
												href={href}
												class="journal-card"
												style="border-left-color: {railHex}"
											>
												{#if doc.data.time}
													<span class="journal-card-time">{doc.data.time}</span>
												{/if}
												<EntryPreview entry={doc} {bp} showDate={false} hideType={true} recentDocs={$documents} />
											</a>
										{:else}
											<button
												type="button"
												on:click={() => openMoment(doc)}
												class="journal-card journal-card--button"
												style="border-left-color: {railHex}"
											>
												{#if doc.data.time}
													<span class="journal-card-time">{doc.data.time}</span>
												{/if}
												<EntryPreview entry={doc} {bp} showDate={false} hideType={true} recentDocs={$documents} />
											</button>
										{/if}
									{/each}
								</div>
							</div>
						{/if}
					{/each}
				</section>
			{/each}
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
						class="input resize-y mt-1 diary-text-edit"
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
				<span style="color: var(--text-muted)">— {$t('private.tooltip')}</span>
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
							class="px-3 py-1.5 text-sm rounded-lg"
							style="background: var(--danger); color: white"
						>{$t('common.yes_delete')}</button>
					</div>
				{:else}
					<button
						type="button"
						on:click={() => (momentConfirmDelete = true)}
						class="text-sm px-3 py-1.5 mr-auto"
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
	@keyframes journalSearchSlide {
		from { transform: translateX(-8px); opacity: 0; }
		to { transform: translateX(0); opacity: 1; }
	}
	.journal-search-anim {
		animation: journalSearchSlide 180ms ease-out;
	}

	/* CIPH-902 — filter-chip cohort-awareness. Active state uses
	   --accent (cohort primary) instead of hardcoded olive. */
	.journal-filter-chip {
		padding: 6px 12px;
		font-size: 13px;
		font-weight: 500;
		border-radius: 9999px;
		white-space: nowrap;
		min-height: 36px;
		background: var(--surface-muted);
		color: var(--text-secondary);
		border: 1px solid transparent;
		transition: background 0.15s, color 0.15s, border-color 0.15s;
	}
	.journal-filter-chip:hover {
		color: var(--text-primary);
	}
	.journal-filter-chip--active {
		background: var(--surface-card);
		color: var(--accent);
		border-color: var(--accent);
	}

	/* CIPH-911 — Closed-phase streak bracket.
	   - Header banner above the run: "{phase name} · 4 Tage" in phase color.
	   - Left vertical rail in the phase color with top + bottom corner
	     ticks pointing right (toward the days), forming the `{`-style
	     bracket silhouette.
	   - Days flow to the right of the rail.
	   Mobile (<480px): rail collapses to a thin top hairline; the header
	   already carries the phase identity. */
	.journal-streak-group {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0 12px;
		margin-bottom: 16px;
	}
	.journal-streak-header {
		grid-column: 1 / -1;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--streak-color);
		margin: 0 0 6px;
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		align-items: baseline;
	}
	.journal-streak-name {
		font-weight: 600;
	}
	.journal-streak-meta {
		font-weight: 400;
		color: var(--text-muted);
		text-transform: none;
		letter-spacing: normal;
	}
	.journal-streak-rail {
		grid-column: 1;
		grid-row: 2;
		position: relative;
		width: 14px;
		border-right: 2px solid var(--streak-color);
		margin-right: 0;
	}
	/* Corner ticks pointing right, completing the `{`-style silhouette. */
	.journal-streak-rail::before,
	.journal-streak-rail::after {
		content: '';
		position: absolute;
		right: -2px;
		width: 6px;
		height: 2px;
		background: var(--streak-color);
	}
	.journal-streak-rail::before { top: 0; }
	.journal-streak-rail::after { bottom: 0; }
	.journal-streak-days {
		grid-column: 2;
		grid-row: 2;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.journal-streak-days > .journal-day {
		margin-bottom: 12px;
	}
	.journal-streak-days > .journal-day:last-child {
		margin-bottom: 0;
	}
	/* Mobile: the rail becomes a thin left bar, header sits above. The
	   bracket-corner ticks are dropped — the header already labels the
	   phase, so the rail just needs to indicate "these days are grouped." */
	@media (max-width: 479px) {
		.journal-streak-group {
			gap: 0 8px;
		}
		.journal-streak-rail {
			width: 0;
			border-right: 2px solid var(--streak-color);
		}
		.journal-streak-rail::before,
		.journal-streak-rail::after {
			display: none;
		}
	}

	/* CIPH-902 — Threema-style timeline. Month header sticks at the top;
	   day header is muted small text; cards stack with a 2px type-color
	   left rail. Card height grows with content (no chip truncation). */
	.journal-month {
		margin-top: 8px;
	}
	.journal-month-header {
		position: sticky;
		/* Authed top header is h-14 (56px). Sticky below it. */
		top: 56px;
		z-index: 10;
		margin: 0 -16px 12px;
		padding: 8px 16px;
		background: var(--surface);
		border-bottom: 1px solid var(--border-subtle, var(--border));
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		backdrop-filter: blur(6px);
	}

	.journal-day {
		margin-bottom: 16px;
	}
	.journal-day-header {
		font-size: 12px;
		color: var(--text-secondary);
		margin: 0 0 8px;
		display: flex;
		align-items: baseline;
		gap: 6px;
	}
	.journal-day-label {
		font-weight: 600;
		color: var(--text-primary);
	}
	.journal-day-meta {
		color: var(--text-muted);
	}
	/* CIPH-907b — per-day phase tags. Small inline chip per active
	   multiDay episode on the day, tinted with the episode's color so
	   the user can scan a column and see "manic / flare / depressive"
	   patterns without reading every card. */
	.journal-phase-tag {
		display: inline-flex;
		align-items: center;
		font-size: 10px;
		font-weight: 600;
		padding: 1px 8px;
		border-radius: 9999px;
		border: 1px solid;
		letter-spacing: 0.02em;
		margin-left: 4px;
	}

	.journal-day-stack {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.journal-card {
		display: block;
		position: relative;
		padding: 12px 16px;
		border-radius: 8px;
		background: var(--surface-card);
		border: 1px solid var(--border);
		border-left: 3px solid var(--border);
		text-decoration: none;
		color: inherit;
		text-align: left;
		width: 100%;
		font: inherit;
		cursor: pointer;
		transition: border-color 0.15s ease-out, transform 0.15s ease-out, box-shadow 0.15s ease-out;
	}
	.journal-card--button {
		font-family: inherit;
		font-size: inherit;
	}
	.journal-card:hover,
	.journal-card:focus-visible {
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
		outline: none;
	}
	.journal-card:focus-visible {
		box-shadow: 0 0 0 2px var(--accent), 0 1px 3px rgba(0, 0, 0, 0.05);
	}
	.journal-card:active {
		transform: scale(0.998);
	}
	.journal-card-time {
		position: absolute;
		top: 12px;
		right: 16px;
		font-size: 11px;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}

	/* Diary text editing: same serif treatment as the read-only excerpt
	   inside EntryPreview. Narrative reads narrative, even in the editor. */
	.diary-text-edit {
		font-family: 'Charter', 'Bitstream Charter', 'Sitka Text', Cambria, 'Times New Roman', serif;
		font-size: 15px;
		line-height: 1.5;
	}
</style>
