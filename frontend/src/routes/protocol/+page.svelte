<script lang="ts">
	import { t } from '$lib/i18n';
	import { auth, isAuthenticated } from '$lib/stores/auth';
	import { documents, type CiphraDocument } from '$lib/stores/documents';
	import { blueprint } from '$lib/blueprint';
	import type { Blueprint } from '$lib/blueprint';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { generateMonthlyPdf } from '$lib/pdf';

	let view: 'day' | 'month' = 'day';
	let currentDate = new Date().toISOString().slice(0, 10);
	let saving = false;
	let saved = false;

	// Daily log state — initialized dynamically from blueprint
	let symptoms: Record<string, boolean> = {};
	let episodes: Record<string, number> = {};
	let triggers: Record<string, boolean> = {};
	let vitals: Record<string, string> = {};
	let notes = '';

	$: bp = $blueprint;

	// Initialize form state from blueprint
	$: if (bp) {
		initFromBlueprint(bp);
	}

	function initFromBlueprint(b: Blueprint) {
		// Only init if empty (don't overwrite user edits)
		if (Object.keys(symptoms).length === 0) {
			for (const g of b.symptomGroups) {
				for (const item of g.items) symptoms[item.id] = false;
			}
		}
		if (Object.keys(episodes).length === 0) {
			for (const ep of b.episodeTypes) episodes[ep.id] = 0;
		}
		if (Object.keys(triggers).length === 0) {
			for (const trig of b.triggers) triggers[trig.id] = false;
		}
		if (Object.keys(vitals).length === 0) {
			for (const v of b.vitals) vitals[v.id] = '';
		}
	}

	onMount(() => {
		if (!$isAuthenticated) { goto('/login'); return; }
		documents.load().then(loadExistingLog);
	});

	function loadExistingLog() {
		const existing = $documents.find(d => d.data.type === 'daily_log' && d.data.date === currentDate);
		if (existing) {
			const d = existing.data;
			if (d.symptoms) symptoms = { ...symptoms, ...d.symptoms };
			if (d.episodes) episodes = { ...episodes, ...d.episodes };
			// Backwards compat: old data might use "seizures" key
			if (d.seizures && !d.episodes) episodes = { ...episodes, ...d.seizures };
			if (d.triggers) triggers = { ...triggers, ...d.triggers };
			if (d.vitals) vitals = { ...vitals, ...d.vitals };
			if (d.notes) notes = d.notes;
		}
	}

	async function saveLog() {
		saving = true;
		const data: any = {
			type: 'daily_log',
			date: currentDate,
			symptoms,
			episodes,
			triggers,
			vitals,
			notes,
		};

		const existing = $documents.find(d => d.data.type === 'daily_log' && d.data.date === currentDate);
		if (existing) {
			await documents.updateDoc(existing.id, data);
		} else {
			await documents.save(data);
		}
		saving = false;
		saved = true;
		setTimeout(() => { saved = false; }, 2000);
	}

	function changeDate(delta: number) {
		const d = new Date(currentDate);
		d.setDate(d.getDate() + delta);
		currentDate = d.toISOString().slice(0, 10);
		// Reset and reload
		if (bp) {
			symptoms = {};
			episodes = {};
			triggers = {};
			vitals = {};
			notes = '';
			initFromBlueprint(bp);
		}
		loadExistingLog();
	}

	function formatDisplayDate(dateStr: string): string {
		return new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, {
			weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
		});
	}

	// Monthly grid helpers
	$: monthDocs = getMonthDocs($documents, currentDate);

	function getMonthDocs(docs: CiphraDocument[], refDate: string) {
		const d = new Date(refDate);
		const year = d.getFullYear();
		const month = d.getMonth();
		const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
		return docs.filter(doc =>
			doc.data.type === 'daily_log' && String(doc.data.date || '').startsWith(prefix)
		);
	}

	function getDaysInMonth(dateStr: string): number {
		const d = new Date(dateStr);
		return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
	}

	// Grid column accessors (avoid TS casts in templates)
	function getSymptom(doc: any, col: string): boolean {
		return doc?.data?.symptoms?.[col] || false;
	}
	function getEpisodeCount(doc: any, col: string): number {
		return doc?.data?.episodes?.[col] || doc?.data?.seizures?.[col] || 0;
	}
	function symptomSum(col: string): number {
		return monthDocs.filter(d => d.data.symptoms?.[col]).length;
	}
	function episodeSum(col: string): number {
		return monthDocs.reduce((sum: number, d: any) => sum + (d.data.episodes?.[col] || d.data.seizures?.[col] || 0), 0);
	}

	function exportPdf() {
		if (!bp) return;
		const d = new Date(currentDate);
		generateMonthlyPdf(bp, $documents, d.getFullYear(), d.getMonth());
	}

	// Find label for an item id from the blueprint
	function itemLabel(id: string): string {
		if (!bp) return id;
		for (const g of bp.symptomGroups) {
			const item = g.items.find(i => i.id === id);
			if (item) return item.label;
		}
		const ep = bp.episodeTypes.find(e => e.id === id);
		if (ep) return ep.label;
		return id;
	}
</script>

{#if !bp}
	<div class="max-w-6xl mx-auto px-4 py-12 text-center">
		<p class="text-stone-400">{$t('common.loading')}</p>
	</div>
{:else}
<div class="max-w-6xl mx-auto px-4 pt-4 pb-32">
	<!-- Header with date nav and view toggle -->
	<div class="flex items-center justify-between mb-4">
		<div class="flex items-center gap-2">
			<button on:click={() => changeDate(-1)} class="p-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-500">
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
			</button>
			<span class="text-sm font-semibold text-stone-900 dark:text-white">{formatDisplayDate(currentDate)}</span>
			<button on:click={() => changeDate(1)} class="p-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-500">
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
			</button>
			<button on:click={() => { currentDate = new Date().toISOString().slice(0, 10); }} class="ml-1 text-xs font-medium px-2.5 py-1.5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 min-h-[44px] flex items-center">
				{$t('common.today')}
			</button>
		</div>

		<div class="flex bg-stone-100 dark:bg-stone-800 rounded-lg p-0.5">
			<button on:click={() => { view = 'day'; }}
				class="px-3 py-1.5 text-sm font-medium rounded-md min-h-[44px] flex items-center transition-colors
					{view === 'day' ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm' : 'text-stone-500'}">
				{$t('common.day')}
			</button>
			<button on:click={() => { view = 'month'; }}
				class="px-3 py-1.5 text-sm font-medium rounded-md min-h-[44px] flex items-center transition-colors
					{view === 'month' ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm' : 'text-stone-500'}">
				{$t('common.month')}
			</button>
		</div>
	</div>

	{#if view === 'day'}
		<div class="space-y-4">
			<!-- Symptoms (from blueprint) -->
			{#if bp.symptomGroups.length > 0}
			<section class="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5">
				<h2 class="text-base font-semibold text-stone-900 dark:text-white mb-4 flex items-center gap-2">
					<svg class="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					{$t('protocol.symptoms')}
				</h2>
				{#each bp.symptomGroups as group}
					<p class="text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider mt-3 mb-2">{group.label}</p>
					<div class="flex flex-wrap gap-2">
						{#each group.items as item}
							<button
								type="button"
								on:click={() => { symptoms[item.id] = !symptoms[item.id]; }}
								class="px-3 py-1.5 rounded-full text-sm font-medium transition-colors min-h-[36px]
									{symptoms[item.id]
										? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-300 dark:ring-indigo-500/40'
										: 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400'}"
							>
								{item.label}
							</button>
						{/each}
					</div>
				{/each}
			</section>
			{/if}

			<!-- Episodes (from blueprint) -->
			{#if bp.episodeTypes.length > 0}
			<section class="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5">
				<h2 class="text-base font-semibold text-stone-900 dark:text-white mb-4 flex items-center gap-2">
					<svg class="w-5 h-5" style="color: {bp.episodeTypes[0]?.color || '#DC2626'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					{$t('protocol.seizures')}
				</h2>
				<div class="space-y-3">
					{#each bp.episodeTypes as ep}
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<div class="w-3 h-3 rounded-full" style="background: {ep.color}"></div>
								<span class="text-sm text-stone-700 dark:text-stone-300">{ep.label}</span>
							</div>
							<div class="flex items-center gap-3">
								<button on:click={() => { if (episodes[ep.id] > 0) episodes[ep.id]--; }}
									class="w-9 h-9 rounded-lg bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700 min-w-[44px] min-h-[44px]">
									-
								</button>
								<span class="w-8 text-center font-semibold text-stone-900 dark:text-white">{episodes[ep.id] || 0}</span>
								<button on:click={() => { episodes[ep.id] = (episodes[ep.id] || 0) + 1; }}
									class="w-9 h-9 rounded-lg bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700 min-w-[44px] min-h-[44px]">
									+
								</button>
							</div>
						</div>
					{/each}
				</div>
			</section>
			{/if}

			<!-- Triggers (from blueprint) -->
			{#if bp.triggers.length > 0}
			<section class="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5">
				<h2 class="text-base font-semibold text-stone-900 dark:text-white mb-4">{$t('protocol.triggers')}</h2>
				<div class="flex flex-wrap gap-2">
					{#each bp.triggers as trig}
						<button
							type="button"
							on:click={() => { triggers[trig.id] = !triggers[trig.id]; }}
							class="px-3 py-1.5 rounded-full text-sm font-medium transition-colors min-h-[36px]
								{triggers[trig.id]
									? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 ring-1 ring-amber-300 dark:ring-amber-500/40'
									: 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400'}"
						>
							{trig.label}
						</button>
					{/each}
				</div>
			</section>
			{/if}

			<!-- Vitals (from blueprint) -->
			{#if bp.vitals.length > 0}
			<section class="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5">
				<h2 class="text-base font-semibold text-stone-900 dark:text-white mb-4">{$t('protocol.vitals')}</h2>
				<div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
					{#each bp.vitals as vital}
						<div>
							<label class="text-xs text-stone-500 dark:text-stone-400 mb-1 block">
								{vital.label}
								{#if vital.unit}<span class="text-stone-400">({vital.unit})</span>{/if}
							</label>
							<input
								type="text"
								bind:value={vitals[vital.id]}
								placeholder={vital.placeholder}
								class="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none min-h-[44px]"
							/>
						</div>
					{/each}
				</div>
			</section>
			{/if}

			<!-- Notes -->
			<section class="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5">
				<h2 class="text-base font-semibold text-stone-900 dark:text-white mb-3">{$t('common.notes')}</h2>
				<textarea
					bind:value={notes}
					rows="3"
					class="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-y"
				></textarea>
			</section>

			<!-- Save -->
			<button
				on:click={saveLog}
				disabled={saving}
				class="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-stone-300 text-white rounded-xl font-medium transition-colors min-h-[48px] flex items-center justify-center gap-2"
			>
				{#if saved}
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20,6 9,17 4,12" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					{$t('protocol.auto_saved')}
				{:else if saving}
					{$t('common.loading')}
				{:else}
					{$t('common.save')}
				{/if}
			</button>
		</div>
	{:else}
		<!-- MONTHLY GRID (columns from blueprint) -->
		<div class="flex justify-end mb-3">
			<button
				on:click={exportPdf}
				class="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-colors min-h-[44px]"
			>
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="7,10 12,15 17,10" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="15" x2="12" y2="3" stroke-width="2" stroke-linecap="round"/></svg>
				PDF exportieren
			</button>
		</div>
		<div class="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
			<div class="overflow-x-auto">
				<table class="grid-table w-full text-xs">
					<thead>
						<tr class="bg-stone-50 dark:bg-stone-800">
							<th class="bg-stone-50 dark:bg-stone-800 px-3 py-2 text-left font-medium text-stone-500 border-b border-stone-200 dark:border-stone-700">{$t('common.day')}</th>
							{#each bp.gridSymptomColumns as col}
								<th class="px-2 py-2 text-center font-medium text-stone-500 border-b border-stone-200 dark:border-stone-700 whitespace-nowrap">{itemLabel(col)}</th>
							{/each}
							{#each bp.gridEpisodeColumns as col}
								<th class="px-2 py-2 text-center font-medium border-b border-stone-200 dark:border-stone-700 whitespace-nowrap" style="color: {bp.episodeTypes.find(e => e.id === col)?.color || '#DC2626'}">{itemLabel(col)}</th>
							{/each}
							<th class="px-2 py-2 text-center font-medium text-stone-500 border-b border-stone-200 dark:border-stone-700">{$t('common.notes')}</th>
						</tr>
					</thead>
					<tbody>
						{#each Array.from({ length: getDaysInMonth(currentDate) }, (_, i) => i + 1) as day}
							{@const dayStr = `${currentDate.slice(0, 8)}${String(day).padStart(2, '0')}`}
							{@const dayDoc = monthDocs.find(d => d.data.date === dayStr)}
							<tr class="border-b border-stone-100 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50">
								<td class="bg-white dark:bg-stone-900 px-3 py-1.5 font-medium text-stone-700 dark:text-stone-300 whitespace-nowrap">{day}</td>
								{#each bp.gridSymptomColumns as col}
									<td class="px-2 py-1.5 text-center">
										{#if getSymptom(dayDoc, col)}
											<span class="inline-block w-4 h-4 bg-indigo-500 rounded-sm"></span>
										{:else}
											<span class="inline-block w-4 h-4 bg-stone-100 dark:bg-stone-800 rounded-sm"></span>
										{/if}
									</td>
								{/each}
								{#each bp.gridEpisodeColumns as col}
									<td class="px-2 py-1.5 text-center font-mono">
										{#if getEpisodeCount(dayDoc, col) > 0}
											<span class="font-bold" style="color: {bp.episodeTypes.find(e => e.id === col)?.color || '#DC2626'}">{getEpisodeCount(dayDoc, col)}</span>
										{:else}
											<span class="text-stone-300 dark:text-stone-600">-</span>
										{/if}
									</td>
								{/each}
								<td class="px-2 py-1.5 text-stone-500 dark:text-stone-400 max-w-[120px] truncate">
									{dayDoc?.data?.notes || ''}
								</td>
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr class="bg-stone-50 dark:bg-stone-800 font-medium">
							<td class="bg-stone-50 dark:bg-stone-800 px-3 py-2 text-stone-700 dark:text-stone-300">{$t('protocol.sum')}</td>
							{#each bp.gridSymptomColumns as col}
								<td class="px-2 py-2 text-center text-stone-700 dark:text-stone-300">{symptomSum(col)}</td>
							{/each}
							{#each bp.gridEpisodeColumns as col}
								<td class="px-2 py-2 text-center font-bold" style="color: {bp.episodeTypes.find(e => e.id === col)?.color || '#DC2626'}">{episodeSum(col)}</td>
							{/each}
							<td></td>
						</tr>
						<tr class="bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
							<td class="bg-stone-50 dark:bg-stone-800 px-3 py-2">{$t('protocol.percent')}</td>
							{#each bp.gridSymptomColumns as col}
								{@const total = getDaysInMonth(currentDate)}
								{@const count = symptomSum(col)}
								<td class="px-2 py-2 text-center text-xs">{total > 0 ? Math.round(count / total * 100) : 0}%</td>
							{/each}
							{#each bp.gridEpisodeColumns as _}
								<td></td>
							{/each}
							<td></td>
						</tr>
					</tfoot>
				</table>
			</div>
		</div>
	{/if}
</div>
{/if}
