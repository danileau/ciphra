<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { auth } from '$lib/stores/auth';
	import { documents, type CiphraDocument } from '$lib/stores/documents';
	import { blueprint } from '$lib/blueprint';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import ChartWrapper from '$lib/components/ChartWrapper.svelte';
	import Asterisk from '$lib/components/Asterisk.svelte';
	import { familyLinks } from '$lib/stores/familyLinks';
	import { generateDoctorPdf } from '$lib/pdf';

	function exportForDoctor() {
		if (!bp) return;
		const now = new Date();
		generateDoctorPdf(bp, allDocs, now.getFullYear(), now.getMonth(), $t, $locale, $auth.username || '');
	}

	let loaded = false;
	let confirmDeleteId: number | null = null;

	onMount(() => {
		documents.load().then(() => { loaded = true; });
	});

	$: bp = $blueprint;
	$: allDocs = $documents;
	$: todayStr = new Date().toISOString().slice(0, 10);
	$: todayEntries = allDocs.filter(d => String(d.data.date || '').startsWith(todayStr));
	$: streak = computeStreak(allDocs);

	// Today's status
	$: todayLog = todayEntries.find(d => d.data.type === 'daily_log');
	$: todaySymptomCount = todayEntries.reduce((sum, d) => {
		const syms = d.data.symptoms || {};
		return sum + Object.values(syms).filter(v => v).length;
	}, 0);
	$: todayEpisodeCount = todayEntries.reduce((sum, d) => {
		const eps = d.data.episodes || d.data.seizures || {};
		return sum + (Object.values(eps) as number[]).reduce((s, v) => s + (Number(v) || 0), 0);
	}, 0);

	function computeStreak(docs: CiphraDocument[]): number {
		const episodeDates = new Set<string>();
		for (const d of docs) {
			const eps = d.data.episodes || d.data.seizures || {};
			const total = (Object.values(eps) as number[]).reduce((s, v) => s + (Number(v) || 0), 0);
			if (total > 0) episodeDates.add(String(d.data.date || '').slice(0, 10));
		}
		let count = 0;
		const today = new Date();
		for (let i = 0; i < 365; i++) {
			const d = new Date(today);
			d.setDate(d.getDate() - i);
			if (episodeDates.has(d.toISOString().slice(0, 10))) break;
			count++;
		}
		return count;
	}

	$: streakLabel = bp?.episodeTypes?.length
		? (bp.episodeTypes.length === 1
			? $t('companion.streak_no_type', { type: $t(bp.episodeTypes[0].label) })
			: $t('companion.streak_no_episodes'))
		: $t('companion.streak_no_episodes');

	// 7-day episode chart
	$: last7Days = Array.from({ length: 7 }, (_, i) => {
		const d = new Date();
		d.setDate(d.getDate() - (6 - i));
		return d.toISOString().slice(0, 10);
	});

	$: episodeChartData = (() => {
		if (!bp?.episodeTypes?.length) return null;
		const datasets = bp.episodeTypes.map(et => ({
			label: $t(et.label),
			data: last7Days.map(day =>
				allDocs.filter(d => String(d.data.date || '').startsWith(day))
					.reduce((sum, d) => sum + (Number((d.data.episodes || d.data.seizures || {})[et.id]) || 0), 0)
			),
			backgroundColor: et.color,
			borderRadius: 4
		}));
		return {
			labels: last7Days.map(d => new Date(d + 'T12:00:00').toLocaleDateString($locale, { weekday: 'short' })),
			datasets
		};
	})();

	$: episodeChartOptions = {
		scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } } },
		plugins: { legend: { display: (bp?.episodeTypes?.length || 0) > 1 } }
	};

	// Top symptoms (30 days) — ochre for data
	$: symptomChartData = (() => {
		if (!bp?.symptomGroups?.length) return null;
		const cutoff = new Date();
		cutoff.setDate(cutoff.getDate() - 30);
		const cutoffStr = cutoff.toISOString().slice(0, 10);
		const counts: Record<string, number> = {};
		for (const d of allDocs) {
			if (String(d.data.date || '').slice(0, 10) < cutoffStr) continue;
			for (const [key, val] of Object.entries(d.data.symptoms || {})) {
				if (val) counts[key] = (counts[key] || 0) + 1;
			}
		}
		const labelMap: Record<string, string> = {};
		for (const g of bp.symptomGroups) for (const item of g.items) labelMap[item.id] = $t(item.label);
		const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 5);
		if (!sorted.length) return null;
		return {
			labels: sorted.map(([id]) => labelMap[id] || id),
			datasets: [{ data: sorted.map(([, c]) => c), backgroundColor: '#9f630b', borderRadius: 4 }]
		};
	})();

	$: symptomChartOptions = {
		indexAxis: 'y' as const,
		scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } },
		plugins: { legend: { display: false } }
	};

	function handleEditEntry(entry: CiphraDocument) {
		goto(entry.data.type === 'daily_log' ? `/log/${entry.data.date}` : '/journal');
	}

	async function handleDeleteEntry(id: number) {
		await documents.remove(id);
		confirmDeleteId = null;
	}
</script>

{#if !loaded}
	<!-- ── Loading skeleton ── -->
	<div class="max-w-3xl mx-auto px-4 py-6 space-y-5">
		<div class="h-8 w-48 skeleton"></div>
		<div class="h-32 skeleton" style="animation-delay: 0.05s"></div>
		<div class="h-20 skeleton" style="animation-delay: 0.1s"></div>
		<div class="h-48 skeleton" style="animation-delay: 0.15s"></div>
	</div>
{:else if !bp}
	<!-- Caregiver-mode empty state: user has no blueprint of their own.
		 Split links into live vs revoked so the page reads: "here's who
		 you're actively helping, and here's what was revoked — clean it up." -->
	{@const liveLinks = $familyLinks.filter(l => !l.revoked)}
	{@const revokedLinks = $familyLinks.filter(l => l.revoked)}
	<div class="max-w-2xl mx-auto px-4 py-10 space-y-5">
		<div class="text-center">
			<Asterisk size={40} color="muted" />
			<h1 class="text-xl font-semibold mt-4" style="color: var(--text-primary)">{$t('companion.caregiver_empty_title')}</h1>
			<p class="text-sm mt-2" style="color: var(--text-secondary)">
				{$t('companion.caregiver_empty_desc')}
			</p>
		</div>

		{#if liveLinks.length > 0}
			<section class="card p-5">
				<h2 class="text-xs font-medium uppercase tracking-wider mb-3" style="color: var(--text-muted)">{$t('family.linked_title')}</h2>
				<p class="text-xs mb-3" style="color: var(--text-muted)">{$t('companion.caregiver_switch_hint')}</p>
				<ul class="space-y-2">
					{#each liveLinks as l}
						<li class="flex items-center justify-between rounded-lg p-3" style="background: var(--surface-muted); border: 1px solid var(--border)">
							<p class="text-sm font-medium" style="color: var(--text-primary)">{l.sourceUsername}</p>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if revokedLinks.length > 0}
			<section class="card p-5" style="border-color: rgba(220,38,38,0.2)">
				<h2 class="text-xs font-medium uppercase tracking-wider mb-2" style="color: var(--danger)">{$t('companion.caregiver_revoked_title')}</h2>
				<p class="text-xs mb-3" style="color: var(--text-muted)">{$t('companion.caregiver_revoked_desc')}</p>
				<ul class="space-y-2">
					{#each revokedLinks as l}
						<li class="flex items-center justify-between rounded-lg p-3" style="background: rgba(220,38,38,0.04); border: 1px solid rgba(220,38,38,0.2)">
							<p class="text-sm font-medium" style="color: var(--text-primary)">{l.sourceUsername}</p>
							<span class="text-xs" style="color: var(--danger)">{$t('family.link_revoked')}</span>
						</li>
					{/each}
				</ul>
				<a href="/settings" class="text-xs underline block mt-3" style="color: var(--danger)">{$t('companion.caregiver_revoked_cleanup')}</a>
			</section>
		{/if}

		<div class="flex flex-wrap gap-2">
			<a href="/settings" class="btn-secondary px-4 min-h-[44px] flex items-center">
				{$t('companion.caregiver_open_settings')}
			</a>
			<a href="/setup" class="btn-primary px-4 min-h-[44px] flex items-center">
				{$t('companion.caregiver_setup_own')}
			</a>
		</div>
	</div>
{:else}
<div class="max-w-3xl mx-auto px-4 py-6 space-y-6 fade-in">

	<!-- ═══ GREETING ═══ -->
	<section>
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-2xl font-bold" style="color: var(--text-primary)">{$t('companion.greeting', { name: $auth.username || '' })}</h1>
				<p class="text-sm mt-0.5" style="color: var(--text-secondary)">{new Date().toLocaleDateString($locale, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
			</div>
			<span class="badge badge-olive">{$t(bp.conditionLabel)}</span>
		</div>
	</section>

	<!-- ═══ TODAY'S STATUS ═══ -->
	{#if !todayLog}
		<!-- Not yet logged — warm CTA -->
		<section class="card-brand p-6">
			<div class="flex items-center gap-4">
				<div class="w-14 h-14 rounded-2xl bg-white/60 flex items-center justify-center shrink-0">
					<Asterisk size={28} color="brand" />
				</div>
				<div class="flex-1">
					<p class="font-medium" style="color: var(--brand)">{$t('companion.today_not_filled')}</p>
					<p class="text-sm mt-0.5" style="color: var(--text-secondary)">~3 min</p>
				</div>
				<a href="/log/today" class="btn-primary px-5 py-2.5 text-sm shrink-0">
					{$t('companion.fill_today')}
				</a>
			</div>
		</section>
	{:else}
		<!-- Today logged — summary with olive checkmark -->
		<section class="card-olive p-5">
			<div class="flex items-center justify-between mb-3">
				<div class="flex items-center gap-2">
					<div class="w-6 h-6 rounded-full flex items-center justify-center" style="background: var(--olive)">
						<svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</div>
					<span class="text-sm font-medium" style="color: var(--olive)">{$t('companion.today_filled')}</span>
				</div>
				<a href="/log/today" class="text-xs font-medium hover:underline" style="color: var(--brand)">{$t('common.edit')}</a>
			</div>
			<div class="flex flex-wrap gap-2">
				{#if todaySymptomCount > 0}
					<span class="badge badge-ochre">{$t('companion.symptoms_count', { count: todaySymptomCount })}</span>
				{/if}
				{#if todayEpisodeCount > 0}
					<span class="badge badge-danger">{$t('companion.episodes_count', { count: todayEpisodeCount })}</span>
				{/if}
			</div>
		</section>
	{/if}

	<!-- ═══ STREAK ═══ -->
	<!-- Suppress streak framing for conditions where "X days since bad thing"
		 is hostile: cancer survivors trying to forget treatment, people in
		 burnout recovery, depression/anxiety where a broken streak reads as
		 failure. QA round flagged this in multiple personas. -->
	{#if bp.episodeTypes.length > 0 && !['burnout', 'anxiety_depression', 'cancer_treatment'].includes(bp.conditionId)}
	<section class="card p-5">
		<div class="flex items-center gap-4">
			<div class="text-center">
				<p class="text-3xl font-bold num-data">{streak}</p>
				<p class="text-[10px] uppercase tracking-wider font-medium" style="color: var(--text-muted)">{$t('common.days')}</p>
			</div>
			<div class="flex-1">
				<p class="text-sm font-medium" style="color: var(--text-primary)">{streakLabel}</p>
				<div class="mt-2 w-full rounded-full h-1.5" style="background: var(--surface-inset)">
					<div class="h-1.5 rounded-full transition-all duration-500" style="background: var(--ochre); width: {Math.min(streak * 3, 100)}%"></div>
				</div>
			</div>
		</div>
	</section>
	{/if}

	<!-- ═══ REPORTS & EXPORT ═══ -->
	<section class="card p-5">
		<div class="flex items-center gap-3 mb-3">
			<div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style="background: var(--ochre-light)">
				<svg class="w-5 h-5" style="color: var(--ochre)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="14,2 14,8 20,8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
			</div>
			<div class="flex-1 min-w-0">
				<p class="text-sm font-semibold" style="color: var(--text-primary)">{$t('reports.title')}</p>
				<p class="text-xs" style="color: var(--text-muted)">{$t('reports.analytics_desc')}</p>
			</div>
		</div>
		<div class="flex flex-wrap gap-2">
			<button
				type="button"
				on:click={exportForDoctor}
				disabled={!bp || allDocs.length === 0}
				class="btn-primary text-sm px-4 min-h-[44px] flex items-center gap-2"
			>
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				{$t('companion.export_for_doctor')}
			</button>
			<a href="/reports" class="btn-secondary text-sm px-4 min-h-[44px] flex items-center gap-2">
				{$t('companion.open_reports')}
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
			</a>
		</div>
	</section>

	<!-- ═══ 7-DAY EPISODES ═══ -->
	{#if episodeChartData}
	<section class="card p-5">
		<h2 class="text-sm font-semibold mb-3" style="color: var(--text-primary)">{$t('companion.episodes_7days')}</h2>
		<div class="h-48">
			<ChartWrapper type="bar" data={episodeChartData} options={episodeChartOptions} />
		</div>
	</section>
	{/if}

	<!-- ═══ TOP SYMPTOMS (30d) ═══ -->
	{#if symptomChartData}
	<section class="card p-5">
		<h2 class="text-sm font-semibold mb-3" style="color: var(--text-primary)">{$t('companion.top_symptoms')}</h2>
		<div class="h-48">
			<ChartWrapper type="bar" data={symptomChartData} options={symptomChartOptions} />
		</div>
	</section>
	{/if}

	<!-- ═══ TODAY'S ENTRIES ═══ -->
	{#if todayEntries.length > 0}
	<section>
		<h2 class="text-sm font-semibold mb-3" style="color: var(--text-primary)">{$t('companion.todays_entries')}</h2>
		<div class="space-y-2">
			{#each todayEntries as entry, i}
				<div
					class="card p-4 stagger-in"
					style="animation-delay: {i * 50}ms; border-left: 3px solid {entry.data.type === 'episode' ? 'var(--danger)' : 'var(--olive)'}"
				>
					<div class="flex justify-between items-start gap-2">
						<div class="flex-1 min-w-0">
							<p class="text-sm font-medium" style="color: var(--text-primary)">{entry.data.type === 'daily_log' ? $t('protocol.title') : entry.data.type === 'episode' ? $t('quickadd.episode') : $t('stream.events')}</p>
							{#if entry.data.episodeType && bp.episodeTypes}
								<p class="text-xs mt-0.5" style="color: var(--text-muted)">{$t(bp.episodeTypes.find(e => e.id === entry.data.episodeType)?.label || '') || entry.data.episodeType}</p>
							{/if}
							{#if entry.data.notes}
								<p class="text-xs mt-1 line-clamp-2" style="color: var(--text-muted)">{entry.data.notes}</p>
							{/if}
						</div>
						<div class="flex items-center gap-0.5 shrink-0">
							<button
								on:click={() => handleEditEntry(entry)}
								class="p-1.5 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-[var(--surface-muted)]"
								style="color: var(--text-muted)"
								aria-label={$t('common.edit')}
							>
								<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
							</button>
							{#if confirmDeleteId === entry.id}
								<button on:click={() => handleDeleteEntry(entry.id)}
									class="p-1.5 rounded-lg text-white bg-red-500 hover:bg-red-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center text-xs font-medium"
								>{$t('common.yes_delete')}</button>
								<button on:click={() => { confirmDeleteId = null; }}
									class="p-1.5 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center text-xs font-medium"
									style="background: var(--surface-muted); color: var(--text-secondary)"
								>{$t('common.cancel')}</button>
							{:else}
								<button
									on:click={() => { confirmDeleteId = entry.id; }}
									class="p-1.5 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-red-50 hover:text-red-500"
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
	</section>
	{/if}

	<!-- ═══ ENCRYPTION BADGE ═══ -->
	<div class="asterisk-divider py-4">
		<Asterisk size={14} color="muted" />
	</div>
	<p class="text-center text-xs" style="color: var(--text-muted)">{$t('encryption.badge')}</p>
</div>
{/if}
