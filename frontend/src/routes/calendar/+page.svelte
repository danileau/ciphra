<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { isAuthenticated } from '$lib/stores/auth';
	import { documents, type CiphraDocument } from '$lib/stores/documents';
	import { blueprint } from '$lib/blueprint';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { fade, fly } from 'svelte/transition';
	import ChartWrapper from '$lib/components/ChartWrapper.svelte';
	import Asterisk from '$lib/components/Asterisk.svelte';

	let selectedDate: string | null = null;
	let currentYear = new Date().getFullYear();
	let currentMonth = new Date().getMonth();
	let confirmDeleteId: number | null = null;

	$: bp = $blueprint;

	onMount(() => {
		if (!$isAuthenticated) { goto('/login'); return; }
		documents.load();
	});

	$: daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
	$: firstDayOfWeek = (new Date(currentYear, currentMonth, 1).getDay() + 6) % 7;
	$: monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
	$: monthDocs = $documents.filter(d => String(d.data.date || '').startsWith(monthPrefix));

	function prevMonth() {
		if (currentMonth === 0) { currentYear--; currentMonth = 11; }
		else currentMonth--;
		selectedDate = null;
	}
	function nextMonth() {
		if (currentMonth === 11) { currentYear++; currentMonth = 0; }
		else currentMonth++;
		selectedDate = null;
	}

	function getDocsForDay(day: number): CiphraDocument[] {
		const ds = `${monthPrefix}-${String(day).padStart(2, '0')}`;
		return $documents.filter(d => String(d.data.date || '') === ds);
	}

	function dayHasEpisode(day: number): boolean {
		return getDocsForDay(day).some(d =>
			d.data.type === 'episode' ||
			(d.data.type === 'daily_log' && (Object.values(d.data.episodes || d.data.seizures || {}) as number[]).some(v => v > 0))
		);
	}

	function dayHasLog(day: number): boolean {
		return getDocsForDay(day).some(d => d.data.type === 'daily_log');
	}

	$: selectedDayDocs = selectedDate ? $documents.filter(d => String(d.data.date || '') === selectedDate) : [];
	$: monthName = new Date(currentYear, currentMonth).toLocaleDateString($locale, { month: 'long', year: 'numeric' });

	function sumEpisodes(doc: CiphraDocument): number {
		return (Object.values(doc.data.episodes || doc.data.seizures || {}) as number[]).reduce((a, b) => a + b, 0);
	}

	function handleEditEntry(doc: CiphraDocument) {
		const date = String(doc.data.date || selectedDate || '');
		if (doc.data.type === 'daily_log') {
			goto(`/log/${date}`);
		} else {
			goto(`/journal`);
		}
	}

	async function handleDeleteEntry(id: number) {
		await documents.remove(id);
		confirmDeleteId = null;
	}

	$: weekdays = Array.from({ length: 7 }, (_, i) => {
		const d = new Date(2024, 0, i + 1); // Jan 1 2024 is Monday
		return d.toLocaleDateString($locale, { weekday: 'short' });
	});

	$: totalEpisodes = monthDocs.reduce((sum: number, d: CiphraDocument) => {
		if (d.data.type === 'daily_log' && (d.data.episodes || d.data.seizures)) {
			return sum + (Object.values(d.data.episodes || d.data.seizures || {}) as number[]).reduce((a, b) => a + b, 0);
		}
		return sum;
	}, 0);
	$: daysWithLogs = new Set(monthDocs.map(d => String(d.data.date || ''))).size;

	// --- Monthly episode line chart ---
	$: monthlyLineData = (() => {
		if (!bp?.episodeTypes?.length) return null;
		const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
		const counts = days.map(day => {
			const dayStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
			return $documents
				.filter(d => String(d.data.date || '') === dayStr)
				.reduce((sum, d) => {
					const eps = d.data.episodes || d.data.seizures || {};
					return sum + (Object.values(eps) as number[]).reduce((a, b) => a + b, 0);
				}, 0);
		});
		return {
			labels: days.map(String),
			datasets: [{
				label: bp.episodeTypes[0]?.label ? $t(bp.episodeTypes[0].label) : $t('protocol.episodes'),
				data: counts,
				borderColor: '#DC2626',
				backgroundColor: 'rgba(220,38,38,0.1)',
				fill: true,
				tension: 0.3,
				pointRadius: 3,
				pointBackgroundColor: '#DC2626'
			}]
		};
	})();

	$: monthlyLineOptions = {
		scales: {
			x: { ticks: { maxTicksLimit: 15 } },
			y: { beginAtZero: true, ticks: { stepSize: 1 } }
		},
		plugins: { legend: { display: false } }
	};
</script>

<div class="max-w-6xl mx-auto px-4 pt-4 pb-32">
	<div class="max-w-2xl mx-auto">
		<!-- Calendar grid -->
		<div>
			<!-- Month navigation -->
			<div class="flex items-center justify-between mb-4">
				<button
					on:click={prevMonth}
					class="p-2 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors"
					style="color: var(--text-secondary)"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</button>
				<h1 class="text-lg font-bold capitalize" style="color: var(--text-primary)">{monthName}</h1>
				<button
					on:click={nextMonth}
					class="p-2 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors"
					style="color: var(--text-secondary)"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</button>
			</div>

			<!-- Weekday headers -->
			<div class="grid grid-cols-7 gap-1 mb-1">
				{#each weekdays as wd}
					<div class="text-center text-xs font-medium py-2" style="color: var(--text-muted)">{wd}</div>
				{/each}
			</div>

			<!-- Days grid -->
			<div class="grid grid-cols-7 gap-1">
				{#each Array(firstDayOfWeek) as _}
					<div></div>
				{/each}

				{#each Array.from({ length: daysInMonth }, (_, i) => i + 1) as day}
					{@const dayStr = `${monthPrefix}-${String(day).padStart(2, '0')}`}
					{@const isToday = dayStr === new Date().toISOString().slice(0, 10)}
					{@const isSelected = dayStr === selectedDate}
					{@const hasEpisode = dayHasEpisode(day)}
					{@const hasLog = dayHasLog(day)}
					<button
						on:click={() => { selectedDate = dayStr; }}
						class="relative aspect-square rounded-xl flex flex-col items-center justify-center transition-colors min-h-[44px]"
						style="{isSelected
							? 'background: var(--olive-light); box-shadow: inset 0 0 0 2px var(--olive);'
							: isToday
								? 'background: var(--olive-light);'
								: ''}"
					>
						<span
							class="text-sm font-medium"
							style="color: {isToday ? 'var(--olive)' : 'var(--text-primary)'}"
						>{day}</span>
						<div class="flex gap-0.5 mt-0.5">
							{#if hasEpisode}
								<span class="w-1.5 h-1.5 rounded-full" style="background: var(--danger)"></span>
							{/if}
							{#if hasLog}
								<span class="w-1.5 h-1.5 rounded-full" style="background: var(--olive)"></span>
							{/if}
						</div>
					</button>
				{/each}
			</div>

			<!-- Monthly summary -->
			<div class="mt-6 grid grid-cols-2 gap-3">
				<div class="card p-4">
					<p class="text-2xl font-bold num-data" style="color: var(--ochre)">{totalEpisodes}</p>
					<p class="text-xs" style="color: var(--text-secondary)">{bp?.episodeTypes?.[0]?.label ? $t(bp.episodeTypes[0].label) : $t('protocol.episodes')}</p>
				</div>
				<div class="card p-4">
					<p class="text-2xl font-bold num-data" style="color: var(--ochre)">{daysWithLogs}</p>
					<p class="text-xs" style="color: var(--text-secondary)">{$t('calendar.days_logged')}</p>
				</div>
			</div>

			<!-- Monthly Episode Trend -->
			{#if monthlyLineData}
			<div class="card mt-4 p-4">
				<h3 class="text-sm font-semibold mb-3" style="color: var(--text-primary)">{bp?.episodeTypes?.[0]?.label ? $t(bp.episodeTypes[0].label) : $t('protocol.episodes')} — {monthName}</h3>
				<div class="h-48">
					<ChartWrapper type="line" data={monthlyLineData} options={monthlyLineOptions} />
				</div>
			</div>
			{/if}
		</div>

	</div>
</div>

<!-- Day detail bottom sheet -->
{#if selectedDate}
	<button
		class="fixed inset-0 z-[55] bg-black/40 backdrop-blur-sm"
		on:click={() => { selectedDate = null; confirmDeleteId = null; }}
		transition:fade={{ duration: 200 }}
		aria-label={$t('common.close')}
	></button>

	<div
		class="fixed bottom-0 left-0 right-0 z-[60] rounded-t-2xl max-h-[70vh] overflow-y-auto"
		style="background: var(--surface-card); border-top: 1px solid var(--border); box-shadow: 0 -4px 24px rgba(44,37,32,0.1)"
		transition:fly={{ y: 300, duration: 300 }}
	>
		<div class="p-5 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] max-w-lg mx-auto">
			<div class="flex justify-center mb-3">
				<div class="w-10 h-1 rounded-full" style="background: var(--border)"></div>
			</div>

			<div class="flex items-center justify-between mb-4">
				<h2 class="text-base font-semibold" style="color: var(--text-primary)">
					{new Date(selectedDate + 'T12:00:00').toLocaleDateString($locale, { weekday: 'long', day: 'numeric', month: 'long' })}
				</h2>
				<a
					href="/log/{selectedDate}"
					class="text-sm font-medium flex items-center gap-1"
					style="color: var(--brand)"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					{$t('common.edit')}
				</a>
			</div>

			{#if selectedDayDocs.length > 0}
				<div class="space-y-3">
					{#each selectedDayDocs as doc}
						<div
							class="pl-3 py-2 rounded-r-lg"
							style="border-left: 4px solid {doc.data.type === 'daily_log' ? 'var(--olive)' : doc.data.type === 'episode' ? 'var(--danger)' : 'var(--ochre)'}; background: var(--surface-muted)"
						>
							<div class="flex items-start justify-between gap-2">
								<div class="flex-1 min-w-0">
									<p class="text-sm font-medium" style="color: var(--text-primary)">{doc.data.type === 'daily_log' ? $t('protocol.title') : doc.data.type === 'episode' ? $t('quickadd.episode') : doc.data.type === 'event' ? $t('stream.events') : doc.data.type}</p>
									{#if doc.data.type === 'daily_log'}
										{@const activeSymptoms = Object.entries(doc.data.symptoms || {}).filter(([,v]) => v).map(([k]) => k)}
										{#if activeSymptoms.length > 0}
											<p class="text-xs mt-1" style="color: var(--text-secondary)">{activeSymptoms.join(', ')}</p>
										{/if}
										{@const epCount = sumEpisodes(doc)}
										{#if epCount > 0}
											<p class="text-xs mt-1" style="color: var(--danger)">{epCount} {bp?.episodeTypes?.[0]?.label ? $t(bp.episodeTypes[0].label) : $t('protocol.episodes')}</p>
										{/if}
									{/if}
									{#if doc.data.notes}
										<p class="text-xs mt-1" style="color: var(--text-muted)">{doc.data.notes}</p>
									{/if}
								</div>
								<div class="flex items-center gap-0.5 shrink-0">
									{#if confirmDeleteId === doc.id}
										<button
											on:click={() => handleDeleteEntry(doc.id)}
											class="p-1.5 rounded-lg text-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center text-xs font-medium"
											style="background: var(--danger)"
										>{$t('common.yes_delete')}</button>
										<button
											on:click={() => { confirmDeleteId = null; }}
											class="btn-secondary p-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-xs font-medium"
										>{$t('common.cancel')}</button>
									{:else}
										<button
											on:click={() => handleEditEntry(doc)}
											class="p-1.5 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
											style="color: var(--text-muted)"
											aria-label={$t('common.edit')}
										>
											<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
										</button>
										<button
											on:click={() => { confirmDeleteId = doc.id; }}
											class="p-1.5 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
											style="color: var(--text-muted)"
											aria-label={$t('common.delete')}
										>
											<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3,6 5,6 21,6" stroke-width="2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke-width="2"/></svg>
										</button>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="text-center py-4">
					<div class="mb-3 flex justify-center">
						<Asterisk size={48} muted color="muted" />
					</div>
					<p class="text-sm mb-3" style="color: var(--text-muted)">{$t('calendar.no_entries')}</p>
					<a
						href="/log/{selectedDate}"
						class="btn-primary inline-flex items-center gap-2 px-4 py-2.5 text-sm"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" stroke-width="2"/><line x1="5" y1="12" x2="19" y2="12" stroke-width="2"/></svg>
						{$t('companion.fill_today')}
					</a>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	button.p-2:hover,
	button.p-1\.5:hover {
		background: var(--surface-muted);
	}
	button[aria-label]:last-child:hover {
		color: var(--danger) !important;
		background: rgba(220, 38, 38, 0.05) !important;
	}
	a[style*="--brand"]:hover {
		text-decoration: underline;
	}
</style>
