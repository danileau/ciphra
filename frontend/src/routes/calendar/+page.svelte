<script lang="ts">
	import { t } from '$lib/i18n';
	import { isAuthenticated } from '$lib/stores/auth';
	import { documents, type CiphraDocument } from '$lib/stores/documents';
	import { blueprint } from '$lib/blueprint';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import ChartWrapper from '$lib/components/ChartWrapper.svelte';

	let selectedDate: string | null = null;
	let currentYear = new Date().getFullYear();
	let currentMonth = new Date().getMonth();

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
			(d.data.type === 'daily_log' && Object.values(d.data.episodes || d.data.seizures || {}).some((v: number) => v > 0))
		);
	}

	function dayHasLog(day: number): boolean {
		return getDocsForDay(day).some(d => d.data.type === 'daily_log');
	}

	$: selectedDayDocs = selectedDate ? $documents.filter(d => String(d.data.date || '') === selectedDate) : [];
	$: monthName = new Date(currentYear, currentMonth).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

	const weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

	$: totalEpisodes = monthDocs.reduce((sum: number, d: CiphraDocument) => {
		if (d.data.type === 'daily_log' && (d.data.episodes || d.data.seizures)) {
			return sum + Object.values(d.data.episodes || d.data.seizures).reduce((a: number, b: number) => a + b, 0);
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
					return sum + Object.values(eps).reduce((a: number, b: number) => a + b, 0);
				}, 0);
		});
		return {
			labels: days.map(String),
			datasets: [{
				label: bp.episodeTypes[0]?.label || 'Episoden',
				data: counts,
				borderColor: '#ef4444',
				backgroundColor: 'rgba(239,68,68,0.1)',
				fill: true,
				tension: 0.3,
				pointRadius: 3,
				pointBackgroundColor: '#ef4444'
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
	<div class="lg:grid lg:grid-cols-[1fr,400px] lg:gap-6">
		<!-- Calendar grid -->
		<div>
			<!-- Month navigation -->
			<div class="flex items-center justify-between mb-4">
				<button on:click={prevMonth} class="p-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-500">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</button>
				<h1 class="text-lg font-bold text-stone-900 dark:text-white capitalize">{monthName}</h1>
				<button on:click={nextMonth} class="p-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-500">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</button>
			</div>

			<!-- Weekday headers -->
			<div class="grid grid-cols-7 gap-1 mb-1">
				{#each weekdays as wd}
					<div class="text-center text-xs font-medium text-stone-400 dark:text-stone-500 py-2">{wd}</div>
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
						class="relative aspect-square rounded-xl flex flex-col items-center justify-center transition-colors min-h-[44px]
							{isSelected ? 'bg-indigo-100 dark:bg-indigo-500/20 ring-2 ring-indigo-500' :
							 isToday ? 'bg-indigo-50 dark:bg-indigo-500/10' :
							 'hover:bg-stone-100 dark:hover:bg-stone-800'}"
					>
						<span class="text-sm font-medium {isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-stone-700 dark:text-stone-300'}">{day}</span>
						<div class="flex gap-0.5 mt-0.5">
							{#if hasEpisode}
								<span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>
							{/if}
							{#if hasLog}
								<span class="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
							{/if}
						</div>
					</button>
				{/each}
			</div>

			<!-- Monthly summary -->
			<div class="mt-6 grid grid-cols-2 gap-3">
				<div class="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4">
					<p class="text-2xl font-bold text-red-500">{totalEpisodes}</p>
					<p class="text-xs text-stone-500">{bp?.episodeTypes?.[0]?.label || $t('protocol.seizures')}</p>
				</div>
				<div class="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4">
					<p class="text-2xl font-bold text-indigo-500">{daysWithLogs}</p>
					<p class="text-xs text-stone-500">{$t('common.days')} logged</p>
				</div>
			</div>

			<!-- Monthly Episode Trend -->
			{#if monthlyLineData}
			<div class="mt-4 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4">
				<h3 class="text-sm font-semibold text-stone-900 dark:text-white mb-3">{bp?.episodeTypes?.[0]?.label || 'Episoden'} — {monthName}</h3>
				<div class="h-48">
					<ChartWrapper type="line" data={monthlyLineData} options={monthlyLineOptions} />
				</div>
			</div>
			{/if}
		</div>

		<!-- Day detail panel -->
		<aside class="mt-6 lg:mt-0">
			<div class="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5 sticky top-20">
				<h2 class="text-base font-semibold text-stone-900 dark:text-white mb-3">
					{#if selectedDate}
						{new Date(selectedDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
					{:else}
						{$t('calendar.day_detail')}
					{/if}
				</h2>

				{#if selectedDate && selectedDayDocs.length > 0}
					<div class="space-y-3">
						{#each selectedDayDocs as doc}
							<div class="border-l-4 {doc.data.type === 'daily_log' ? 'border-indigo-400' : doc.data.type === 'episode' ? 'border-red-400' : 'border-stone-300'} pl-3 py-1">
								<p class="text-sm font-medium text-stone-900 dark:text-white capitalize">{doc.data.type}</p>
								{#if doc.data.type === 'daily_log'}
									{@const activeSymptoms = Object.entries(doc.data.symptoms || {}).filter(([,v]) => v).map(([k]) => k)}
									{#if activeSymptoms.length > 0}
										<p class="text-xs text-stone-500 mt-1">{activeSymptoms.join(', ')}</p>
									{/if}
									{@const epCount = Object.values(doc.data.episodes || doc.data.seizures || {}).reduce((a, b) => a + b, 0)}
									{#if epCount > 0}
										<p class="text-xs text-red-500 mt-1">{epCount} {bp?.episodeTypes?.[0]?.label || 'Episoden'}</p>
									{/if}
								{/if}
								{#if doc.data.notes}
									<p class="text-xs text-stone-400 mt-1">{doc.data.notes}</p>
								{/if}
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-sm text-stone-400">{$t('calendar.no_entries')}</p>
				{/if}
			</div>
		</aside>
	</div>
</div>
