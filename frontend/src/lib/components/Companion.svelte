<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { auth } from '$lib/stores/auth';
	import { documents, type CiphraDocument } from '$lib/stores/documents';
	import { blueprint } from '$lib/blueprint';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import ChartWrapper from '$lib/components/ChartWrapper.svelte';
	import Asterisk from '$lib/components/Asterisk.svelte';
	import EntryPreview from '$lib/components/EntryPreview.svelte';
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

	// Compliance metric: unique days logged in the last 30, framed as
	// data-reliability (not a streak). Klara / QA called out streak framing
	// as hostile during chronic flares — "days since last episode" gamifies
	// symptom-free days and shames people in flare cycles.
	$: complianceLogged = (() => {
		const cutoff = new Date();
		cutoff.setHours(0, 0, 0, 0);
		cutoff.setDate(cutoff.getDate() - 29); // inclusive 30-day window
		const cutoffStr = cutoff.toISOString().slice(0, 10);
		const days = new Set<string>();
		for (const d of allDocs) {
			if (d.data.type !== 'entry') continue;
			const ds = String(d.data.date || '').slice(0, 10);
			if (ds && ds >= cutoffStr && ds <= todayStr) days.add(ds);
		}
		return days.size;
	})();
	$: complianceTotal = 30;
	$: complianceRatio = complianceLogged / complianceTotal;
	$: complianceTone = complianceRatio >= 0.8 ? 'high' : complianceRatio >= 0.5 ? 'mid' : 'low';
	$: complianceMessage = $t(
		complianceTone === 'high' ? 'companion.compliance_high'
			: complianceTone === 'mid' ? 'companion.compliance_mid'
			: 'companion.compliance_low',
		{ logged: complianceLogged, total: complianceTotal }
	);
	$: complianceAccent = complianceTone === 'high' ? 'var(--olive)' : complianceTone === 'mid' ? 'var(--ochre)' : 'var(--text-muted)';

	// ─── Cycle-phase card (CIPH-401) ────────────────────────────────────────
	// Only rendered for blueprints that track `cycle_day` (endometriosis,
	// menopause, PCOS). Computes current cycle day from the most recent logged
	// cycle_day, advances by elapsed calendar days, then wraps modulo
	// cycle_length. Irregular-cycle badge shown for PCOS or when variance of
	// recent cycle_length values exceeds 5 days.
	$: hasCycleVital = !!bp?.vitals?.some(v => v.id === 'cycle_day');

	$: cycleState = (() => {
		if (!hasCycleVital) return null;
		const logs = allDocs
			.filter(d => d.data.type === 'entry' && d.data.date)
			.sort((a, b) => String(a.data.date).localeCompare(String(b.data.date)));

		// Most recent cycle_day value
		let anchorDate: string | null = null;
		let anchorDay: number | null = null;
		for (let i = logs.length - 1; i >= 0; i--) {
			const v = Number((logs[i].data.vitals || {}).cycle_day);
			if (Number.isFinite(v) && v > 0) {
				anchorDate = String(logs[i].data.date).slice(0, 10);
				anchorDay = v;
				break;
			}
		}

		// Most recent cycle_length (fallback 28)
		let cycleLength = 28;
		for (let i = logs.length - 1; i >= 0; i--) {
			const v = Number((logs[i].data.vitals || {}).cycle_length);
			if (Number.isFinite(v) && v > 0) {
				cycleLength = v;
				break;
			}
		}
		if (cycleLength < 1) cycleLength = 28;

		// Collect last 6 cycle_length values for variance
		const lengths: number[] = [];
		for (let i = logs.length - 1; i >= 0 && lengths.length < 6; i--) {
			const v = Number((logs[i].data.vitals || {}).cycle_length);
			if (Number.isFinite(v) && v > 0) lengths.push(v);
		}
		let variance = 0;
		if (lengths.length >= 2) {
			const mean = lengths.reduce((s, n) => s + n, 0) / lengths.length;
			variance = Math.sqrt(lengths.reduce((s, n) => s + (n - mean) ** 2, 0) / lengths.length);
		}
		const irregular = variance > 5 || bp?.conditionId === 'pcos';

		if (!anchorDate || anchorDay == null) {
			return { hasData: false, irregular, cycleLength } as const;
		}

		// Elapsed calendar days since the anchor log
		const a = new Date(anchorDate + 'T12:00:00');
		const now = new Date();
		now.setHours(12, 0, 0, 0);
		const elapsed = Math.max(0, Math.round((now.getTime() - a.getTime()) / 86400000));
		let day = anchorDay + elapsed;
		// Wrap modulo cycle_length; guard against day 0 / negatives
		day = ((day - 1) % cycleLength + cycleLength) % cycleLength + 1;

		// Phase thresholds scale proportionally to cycle_length from the
		// 28-day canonical (menstrual 1-5 / follicular 6-13 / ovulation 14-16 / luteal 17+).
		const scale = cycleLength / 28;
		const endMenstrual = Math.max(1, Math.round(5 * scale));
		const endFollicular = Math.max(endMenstrual + 1, Math.round(13 * scale));
		const endOvulation = Math.max(endFollicular + 1, Math.round(16 * scale));

		let phase: 'menstrual' | 'follicular' | 'ovulation' | 'luteal';
		if (day <= endMenstrual) phase = 'menstrual';
		else if (day <= endFollicular) phase = 'follicular';
		else if (day <= endOvulation) phase = 'ovulation';
		else phase = 'luteal';

		return {
			hasData: true,
			day,
			cycleLength,
			phase,
			irregular,
			endMenstrual,
			endFollicular,
			endOvulation,
			progressPct: Math.max(0, Math.min(100, ((day - 1) / cycleLength) * 100)),
		} as const;
	})();

	const PHASE_COLORS: Record<string, string> = {
		menstrual: '#c0392b',
		follicular: '#e4a853',
		ovulation: '#7ba05b',
		luteal: '#8e7cc3',
	};

	// Today's status
	$: todayLog = todayEntries.find(d => d.data.type === 'entry');
	$: todaySymptomCount = todayEntries.reduce((sum, d) => {
		const syms = d.data.symptoms || {};
		return sum + Object.values(syms).filter(v => v).length;
	}, 0);
	$: todayEpisodeCount = todayEntries.reduce((sum, d) => {
		const eps = d.data.episodes || d.data.seizures || {};
		return sum + (Object.values(eps) as number[]).reduce((s, v) => s + (Number(v) || 0), 0);
	}, 0);

	// Episode trend chart with 3 horizons. 7-day was replaced because a single
	// week tells the doctor nothing — patients pull this out for context, and
	// context lives in months and years. 'max' extends back to the oldest doc.
	type ChartScope = 'month' | 'year' | 'max';
	let companionChartScope: ChartScope = 'month';

	function dataSpanMonths(docs: CiphraDocument[]): number {
		const dates = docs.filter(d => d.data?.type === 'entry')
			.map(d => String(d.data.date || ''))
			.filter(s => s.length >= 7);
		if (dates.length === 0) return 0;
		const oldest = dates.reduce((a, b) => (a < b ? a : b));
		const o = new Date(oldest + 'T12:00:00');
		const now = new Date();
		return (now.getFullYear() - o.getFullYear()) * 12 + (now.getMonth() - o.getMonth()) + 1;
	}
	$: spanMonths = dataSpanMonths(allDocs);
	$: yearChartAvailable = spanMonths >= 2;
	$: maxChartAvailable = spanMonths > 12;

	// Bucket size adapts to scope: month=daily bars, year=monthly bars,
	// max=monthly bars across the whole history.
	$: chartBuckets = (() => {
		if (!bp) return { labels: [] as string[], keys: [] as string[], mode: 'day' as 'day' | 'month' };
		if (companionChartScope === 'month') {
			const now = new Date();
			const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
			const keys: string[] = [];
			const labels: string[] = [];
			for (let d = 1; d <= days; d++) {
				const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
				keys.push(dateStr);
				labels.push(String(d));
			}
			return { labels, keys, mode: 'day' as const };
		}
		// month-bucketed for year + max
		const monthCount = companionChartScope === 'year' ? 12 : Math.max(1, spanMonths);
		const now = new Date();
		const keys: string[] = [];
		const labels: string[] = [];
		for (let k = monthCount - 1; k >= 0; k--) {
			const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
			keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
			labels.push(d.toLocaleDateString($locale, { month: 'short', year: monthCount > 12 || d.getMonth() === 0 ? '2-digit' : undefined }));
		}
		return { labels, keys, mode: 'month' as const };
	})();

	// ─── "Wie geht's dir?" — 12-month combined trend (CIPH-715) ─────────────
	// Team-designed: one headline answer + one shared-axis line chart (no
	// double-y-axis, no normalization). Episodes bold + brand, symptom-days
	// faint + secondary. Linus's veto: text caption for SR users.
	$: howAreYouTrend = (() => {
		if (!bp?.episodeTypes?.length) return null;
		const epIds = bp.episodeTypes.map((e) => e.id);
		const now = new Date();
		const months: { y: number; m: number; key: string; label: string }[] = [];
		for (let i = 11; i >= 0; i--) {
			const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
			months.push({
				y: d.getFullYear(),
				m: d.getMonth(),
				key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
				label: d.toLocaleDateString($locale, { month: 'short' }),
			});
		}
		const episodes = months.map(() => 0);
		const symptomDays = months.map(() => 0);
		for (const doc of allDocs) {
			if (doc.data?.type !== 'entry') continue;
			const ds = String(doc.data.date || '');
			const idx = months.findIndex((mo) => ds.startsWith(mo.key));
			if (idx < 0) continue;
			const eps = (doc.data.episodes || doc.data.seizures || {}) as Record<string, number>;
			let epCount = 0;
			for (const id of epIds) epCount += Number(eps[id] || 0);
			episodes[idx] += epCount;
			const syms = (doc.data.symptoms || {}) as Record<string, unknown>;
			if (Object.values(syms).some((v) => v)) symptomDays[idx] += 1;
		}
		const totalEpisodes = episodes.reduce((a, b) => a + b, 0);
		const totalSymptomDays = symptomDays.reduce((a, b) => a + b, 0);
		if (totalEpisodes === 0 && totalSymptomDays === 0) return null;
		const last = episodes[11];
		const prev = episodes[10];
		const epDelta = last - prev;
		const epTrend = epDelta > 0 ? 'up' : epDelta < 0 ? 'down' : 'flat';
		return { months, episodes, symptomDays, epTrend, epDelta, last, prev };
	})();

	// CIPH-723 — condition-specific noun for episodes (e.g. "Anfall", "Tremor",
	// "IOP-Spitze"). Falls back to the generic "Episoden" when the blueprint
	// doesn't override.
	$: episodeNoun = bp?.episodeNoun ? $t(bp.episodeNoun) : $t('companion.how_episodes');

	$: howAreYouChartData = howAreYouTrend ? {
		labels: howAreYouTrend.months.map((m) => m.label),
		datasets: [
			{
				label: episodeNoun,
				data: howAreYouTrend.episodes,
				borderColor: '#DC2626',
				backgroundColor: 'rgba(220,38,38,0.08)',
				borderWidth: 2.5,
				tension: 0.3,
				pointRadius: 2.5,
				pointBackgroundColor: '#DC2626',
				fill: false,
			},
			{
				label: $t('companion.how_symptom_days'),
				data: howAreYouTrend.symptomDays,
				borderColor: 'rgba(120,113,108,0.55)',
				backgroundColor: 'transparent',
				borderWidth: 1.5,
				borderDash: [3, 3],
				tension: 0.3,
				pointRadius: 1.5,
				pointBackgroundColor: 'rgba(120,113,108,0.55)',
				fill: false,
			},
		],
	} : null;

	$: howAreYouChartOptions = {
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: { display: true, position: 'bottom' as const, labels: { boxWidth: 10, font: { size: 11 } } },
			tooltip: {
				callbacks: {
					title: (items: Array<{ dataIndex: number }>) => {
						if (!howAreYouTrend || !items.length) return '';
						const mo = howAreYouTrend.months[items[0].dataIndex];
						return new Date(mo.y, mo.m, 1).toLocaleDateString($locale, { month: 'long', year: 'numeric' });
					},
				},
			},
		},
		scales: {
			y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
			x: { ticks: { font: { size: 10 } }, grid: { display: false } },
		},
	};

	$: howAreYouHeadline = (() => {
		if (!howAreYouTrend) return '';
		const { epTrend, last, prev } = howAreYouTrend;
		const arrow = epTrend === 'up' ? '↗' : epTrend === 'down' ? '↘' : '→';
		const key = epTrend === 'up'
			? 'companion.how_headline_up'
			: epTrend === 'down'
				? 'companion.how_headline_down'
				: 'companion.how_headline_flat';
		return `${arrow} ${$t(key, { last, prev, noun: episodeNoun })}`;
	})();

	$: episodeChartData = (() => {
		if (!bp?.episodeTypes?.length) return null;
		const { keys, labels, mode } = chartBuckets;
		const datasets = bp.episodeTypes.map(et => ({
			label: $t(et.label),
			data: keys.map(key =>
				allDocs.filter(d => {
					const ds = String(d.data.date || '');
					return mode === 'day' ? ds === key : ds.startsWith(key);
				}).reduce((sum, d) => sum + (Number((d.data.episodes || d.data.seizures || {})[et.id]) || 0), 0)
			),
			backgroundColor: et.color,
			borderRadius: 3
		}));
		return { labels, datasets };
	})();

	$: episodeChartOptions = {
		scales: {
			x: { stacked: true, ticks: { maxTicksLimit: companionChartScope === 'month' ? 16 : 12 } },
			y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } },
		},
		plugins: { legend: { display: (bp?.episodeTypes?.length || 0) > 1 } }
	};

	// Positive markers (slept_well) aren't symptoms — suppress them from
	// the "top symptoms" chart. Legacy stored blueprints still list them,
	// so we filter at render time rather than at preset time.
	const POSITIVE_MARKERS = new Set(['slept_well']);

	// Top symptoms scope mirrors the episode-chart scope: month / year / all.
	let symptomChartScope: ChartScope = 'month';
	$: symptomYearAvailable = spanMonths >= 2;
	$: symptomMaxAvailable = spanMonths > 12;

	$: symptomCutoffStr = (() => {
		if (symptomChartScope === 'max') return '0000-00-00';
		const cutoff = new Date();
		const daysBack = symptomChartScope === 'month' ? 30 : 365;
		cutoff.setDate(cutoff.getDate() - daysBack);
		return cutoff.toISOString().slice(0, 10);
	})();

	$: symptomChartData = (() => {
		if (!bp?.symptomGroups?.length) return null;
		const counts: Record<string, number> = {};
		for (const d of allDocs) {
			if (String(d.data.date || '').slice(0, 10) < symptomCutoffStr) continue;
			for (const [key, val] of Object.entries(d.data.symptoms || {})) {
				if (val && !POSITIVE_MARKERS.has(key)) {
					counts[key] = (counts[key] || 0) + 1;
				}
			}
		}
		const labelMap: Record<string, string> = {};
		for (const g of bp.symptomGroups) {
			for (const item of g.items) {
				if (POSITIVE_MARKERS.has(item.id)) continue;
				labelMap[item.id] = $t(item.label);
			}
		}
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
		goto(entry.data.type === 'entry' ? `/log/${entry.data.date}` : '/journal');
	}

	async function handleDeleteEntry(id: number) {
		await documents.remove(id);
		confirmDeleteId = null;
	}
</script>

{#if !loaded || (!bp && $documents.some(d => d.data?.type === 'blueprint'))}
	<!-- ── Loading state (CIPH-204): the asterisk *is* the loading state.
	     The second condition prevents the caregiver-empty flash on hard
	     refresh: documents.load() can finish (loaded=true) before the
	     blueprint store has finished decrypting the blueprint doc. While a
	     blueprint doc exists in $documents but $blueprint is still null,
	     keep showing the loading state instead of falsely declaring the
	     user has no blueprint. -->
	<div class="max-w-3xl mx-auto px-4 py-20 flex flex-col items-center justify-center">
		<Asterisk size={56} mode="loading" color="brand" />
		<p class="mt-4 text-sm" style="color: var(--text-muted)">{$t('common.loading')}</p>
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

	<!-- ═══ COMPLIANCE (data-reliability) ═══ -->
	<!-- Replaces the old streak card. Streak framing ("X days without an
		 episode") gamified symptom-free days and shamed people during chronic
		 flares. The compliance card reframes the same slot as data-reliability
		 for the next appointment: how many of the last 30 days you logged. -->
	<section class="card-anchor">
		<div class="flex items-center gap-4">
			<div class="text-center shrink-0">
				<p class="text-3xl font-bold num-data" style="color: {complianceAccent}">{Math.round(complianceRatio * 100)}%</p>
				<p class="text-[10px] uppercase tracking-wider font-medium" style="color: var(--text-muted)">{complianceLogged}/{complianceTotal} {$t('common.days')}</p>
			</div>
			<div class="flex-1 min-w-0">
				<p class="text-sm font-medium" style="color: var(--text-primary)">{complianceMessage}</p>
				{#if complianceTone === 'low'}
					<p class="text-xs mt-1" style="color: var(--text-muted)">{$t('companion.compliance_subtitle')}</p>
				{/if}
				<div class="mt-2 w-full rounded-full h-1.5" style="background: var(--surface-inset)">
					<div class="h-1.5 rounded-full transition-all duration-500" style="background: {complianceAccent}; width: {Math.round(complianceRatio * 100)}%"></div>
				</div>
			</div>
		</div>
	</section>

	<!-- ═══ CYCLE PHASE (CIPH-401) — only for cycle-tracking blueprints ═══ -->
	{#if hasCycleVital && cycleState}
		<section class="card-anchor">
			{#if !cycleState.hasData}
				<a href="/log/today" class="flex items-center gap-3 no-underline">
					<div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style="background: var(--ochre-light); color: var(--ochre)">
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke-width="2"/><path d="M12 7v5l3 2" stroke-width="2" stroke-linecap="round"/></svg>
					</div>
					<div class="flex-1 min-w-0">
						<p class="text-sm font-semibold" style="color: var(--text-primary)">{$t('cycle.title')}</p>
						<p class="text-xs mt-0.5" style="color: var(--text-muted)">{$t('cycle.first_entry_prompt')}</p>
					</div>
				</a>
			{:else}
				{@const cs = cycleState}
				<div class="flex items-center gap-4">
					<div class="text-center shrink-0">
						<p class="text-3xl font-bold num-data" style="color: {PHASE_COLORS[cs.phase]}">{$t('cycle.day_n', { n: cs.day })}</p>
						<p class="text-[10px] uppercase tracking-wider font-medium" style="color: var(--text-muted)">/ {cs.cycleLength}</p>
					</div>
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-2 flex-wrap">
							<p class="text-sm font-semibold" style="color: var(--text-primary)">{$t('cycle.title')}</p>
							<span class="text-xs px-2 py-0.5 rounded-full" style="background: {PHASE_COLORS[cs.phase]}20; color: {PHASE_COLORS[cs.phase]}">{$t('cycle.phase_' + cs.phase)}</span>
							{#if cs.irregular}
								<span class="text-[10px] px-2 py-0.5 rounded-full font-medium" style="background: var(--ochre-light); color: var(--ochre)">{$t('cycle.irregular')}</span>
							{/if}
						</div>
						<!-- Segmented progress bar -->
						<div class="mt-2 relative w-full rounded-full h-2 overflow-hidden flex" style="background: var(--surface-inset)">
							<div style="width: {(cs.endMenstrual / cs.cycleLength) * 100}%; background: {PHASE_COLORS.menstrual}40"></div>
							<div style="width: {((cs.endFollicular - cs.endMenstrual) / cs.cycleLength) * 100}%; background: {PHASE_COLORS.follicular}40"></div>
							<div style="width: {((cs.endOvulation - cs.endFollicular) / cs.cycleLength) * 100}%; background: {PHASE_COLORS.ovulation}40"></div>
							<div style="flex: 1; background: {PHASE_COLORS.luteal}40"></div>
							<!-- Position marker -->
							<div class="absolute top-0 bottom-0" style="left: {cs.progressPct}%; width: 2px; background: var(--text-primary); transform: translateX(-1px);"></div>
						</div>
					</div>
				</div>
			{/if}
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

	<!-- ═══ "WIE GEHT'S DIR?" — 12-month combined trend (CIPH-715) ═══ -->
	{#if howAreYouChartData && howAreYouTrend}
	<section class="card p-5" aria-label={$t('companion.how_aria')}>
		<h2 class="text-sm font-semibold mb-1" style="color: var(--text-primary)">{$t('companion.how_title')}</h2>
		<p class="text-base font-medium mb-3" style="color: var(--text-primary)">{howAreYouHeadline}</p>
		<div class="h-44">
			<ChartWrapper type="line" data={howAreYouChartData} options={howAreYouChartOptions} />
		</div>
		<p class="sr-only">
			{$t('companion.how_sr_caption', {
				last: howAreYouTrend.last,
				prev: howAreYouTrend.prev,
				total: howAreYouTrend.episodes.reduce((a, b) => a + b, 0),
				symptomDays: howAreYouTrend.symptomDays.reduce((a, b) => a + b, 0),
				noun: episodeNoun,
			})}
		</p>
	</section>
	{/if}

	<!-- ═══ EPISODE TREND — month / year / max ═══ -->
	{#if episodeChartData}
	<section class="card p-5">
		<div class="flex items-center justify-between mb-3 gap-2">
			<h2 class="text-sm font-semibold" style="color: var(--text-primary)">
				{companionChartScope === 'month'
					? $t('companion.episodes_this_month')
					: companionChartScope === 'year'
						? $t('companion.episodes_year')
						: $t('companion.episodes_max')}
			</h2>
			<div class="flex gap-1 text-xs" style="color: var(--text-muted)">
				<button
					class="px-2 py-1 rounded"
					class:font-semibold={companionChartScope === 'month'}
					style="{companionChartScope === 'month' ? 'background: var(--surface-muted); color: var(--text-primary)' : ''}"
					on:click={() => companionChartScope = 'month'}
				>{$t('pdf.scope_month_label')}</button>
				<button
					class="px-2 py-1 rounded"
					class:font-semibold={companionChartScope === 'year'}
					class:opacity-40={!yearChartAvailable}
					disabled={!yearChartAvailable}
					style="{companionChartScope === 'year' ? 'background: var(--surface-muted); color: var(--text-primary)' : ''}"
					on:click={() => companionChartScope = 'year'}
				>{$t('pdf.scope_year_label')}</button>
				<button
					class="px-2 py-1 rounded"
					class:font-semibold={companionChartScope === 'max'}
					class:opacity-40={!maxChartAvailable}
					disabled={!maxChartAvailable}
					style="{companionChartScope === 'max' ? 'background: var(--surface-muted); color: var(--text-primary)' : ''}"
					on:click={() => companionChartScope = 'max'}
				>{$t('companion.scope_max_label')}</button>
			</div>
		</div>
		<div class="h-48">
			<ChartWrapper type="bar" data={episodeChartData} options={episodeChartOptions} />
		</div>
	</section>
	{/if}

	<!-- ═══ TOP SYMPTOMS — scope switcher ═══ -->
	{#if symptomChartData}
	<section class="card p-5">
		<div class="flex items-center justify-between mb-3 gap-2">
			<h2 class="text-sm font-semibold" style="color: var(--text-primary)">
				{symptomChartScope === 'month'
					? $t('companion.top_symptoms_month')
					: symptomChartScope === 'year'
						? $t('companion.top_symptoms_year')
						: $t('companion.top_symptoms_max')}
			</h2>
			<div class="flex gap-1 text-xs" style="color: var(--text-muted)">
				<button
					class="px-2 py-1 rounded"
					class:font-semibold={symptomChartScope === 'month'}
					style="{symptomChartScope === 'month' ? 'background: var(--surface-muted); color: var(--text-primary)' : ''}"
					on:click={() => symptomChartScope = 'month'}
				>{$t('pdf.scope_month_label')}</button>
				<button
					class="px-2 py-1 rounded"
					class:font-semibold={symptomChartScope === 'year'}
					class:opacity-40={!symptomYearAvailable}
					disabled={!symptomYearAvailable}
					style="{symptomChartScope === 'year' ? 'background: var(--surface-muted); color: var(--text-primary)' : ''}"
					on:click={() => symptomChartScope = 'year'}
				>{$t('pdf.scope_year_label')}</button>
				<button
					class="px-2 py-1 rounded"
					class:font-semibold={symptomChartScope === 'max'}
					class:opacity-40={!symptomMaxAvailable}
					disabled={!symptomMaxAvailable}
					style="{symptomChartScope === 'max' ? 'background: var(--surface-muted); color: var(--text-primary)' : ''}"
					on:click={() => symptomChartScope = 'max'}
				>{$t('companion.scope_max_label')}</button>
			</div>
		</div>
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
				{@const epEntries = Object.entries(entry.data.episodes || entry.data.seizures || {}).filter(([, n]) => Number(n) > 0)}
				<div
					class="card p-4 stagger-in"
					style="animation-delay: {i * 50}ms; border-left: 3px solid {epEntries.length > 0 ? 'var(--danger)' : 'var(--olive)'}"
				>
					<div class="flex justify-between items-start gap-2">
						<div class="flex-1 min-w-0">
							<EntryPreview {entry} {bp} showDate={false} recentDocs={$documents} />
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
									class="p-1.5 rounded-lg text-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center text-xs font-medium"
									style="background: var(--danger)"
								>{$t('common.yes_delete')}</button>
								<button on:click={() => { confirmDeleteId = null; }}
									class="p-1.5 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center text-xs font-medium"
									style="background: var(--surface-muted); color: var(--text-secondary)"
								>{$t('common.cancel')}</button>
							{:else}
								<button
									on:click={() => { confirmDeleteId = entry.id; }}
									class="p-1.5 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center hover-danger"
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
