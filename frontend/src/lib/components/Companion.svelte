<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { auth } from '$lib/stores/auth';
	import { documents, type CiphraDocument } from '$lib/stores/documents';
	import { blueprint } from '$lib/blueprint';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import Asterisk from '$lib/components/Asterisk.svelte';
	import CompanionMain from '$lib/components/CompanionMain.svelte';
	import CompanionRail from '$lib/components/CompanionRail.svelte';

	// CIPH-764 reverted post senior review — country-specific helplines
	// without explicit user country selection conflict with zero-knowledge.
	// Replaced by CIPH-790 (settings-based opt-in help section).
	import { familyLinks } from '$lib/stores/familyLinks';
	import { cohortOf } from '$lib/blueprint/cohort';
	import { computeCycleStateToday, hasCycleTracking, PHASE_COLORS } from '$lib/cycleState';

	// CIPH-873 — exportForDoctor() helper + generateDoctorPdf import removed.
	// The "Export for doctor" rail button now deep-links to
	// /reports?action=export which opens the scope picker.

	let loaded = false;
	let confirmDeleteId: number | null = null;

	onMount(() => {
		documents.load().then(() => { loaded = true; });
	});

	$: bp = $blueprint;
	$: allDocs = $documents;
	$: todayStr = new Date().toISOString().slice(0, 10);
	$: todayEntries = allDocs.filter(d => String(d.data.date || '').startsWith(todayStr));

	// CIPH-854 — Cohort drives home card ordering + which extra context
	// cards render. `cohortOf` reads blueprint.conditionId.
	$: cohort = cohortOf(bp);

	// CIPH-854 — Active multi-day phase. For phase-band cohort only: find
	// the most-recent entry-streak where any multiDay episode type has
	// value > 0 on each consecutive day ending at today (or yesterday —
	// a user who hasn't logged yet today is still in the phase). Returns
	// the episode type + start date + day count. Null when no phase active.
	$: activePhase = (() => {
		if (cohort !== 'phase' || !bp?.episodeTypes?.length) return null;
		const multiDayTypes = bp.episodeTypes.filter(e => e.multiDay);
		if (!multiDayTypes.length) return null;

		// Index entries by YYYY-MM-DD → episodes map.
		const byDate = new Map<string, Record<string, number>>();
		for (const d of allDocs) {
			if (d.data.type !== 'entry') continue;
			const ds = String(d.data.date || '').slice(0, 10);
			if (!ds) continue;
			const eps = (d.data.episodes || d.data.seizures || {}) as Record<string, number>;
			// Merge if multiple entries same day.
			const prior = byDate.get(ds) || {};
			for (const [k, v] of Object.entries(eps)) {
				prior[k] = Math.max(Number(prior[k] || 0), Number(v || 0));
			}
			byDate.set(ds, prior);
		}

		// Today or yesterday as anchor. If today unlogged, fall back to
		// yesterday so the card doesn't flicker while the user hasn't
		// opened /log/today yet.
		const today = new Date();
		today.setHours(12, 0, 0, 0);
		const todayKey = today.toISOString().slice(0, 10);
		const y = new Date(today);
		y.setDate(y.getDate() - 1);
		const yKey = y.toISOString().slice(0, 10);

		// For each multiDay type, walk back consecutive days. Collect all
		// active phases so CIPH-855b can show "N phases active" when
		// multiple overlap (bipolar mixed states, long-covid + PEM, IBD
		// with two flare types).
		type ActivePhase = { ep: typeof multiDayTypes[0]; startedOn: string; dayN: number };
		const activePhases: ActivePhase[] = [];
		for (const ep of multiDayTypes) {
			let anchorKey: string | null = null;
			if ((byDate.get(todayKey)?.[ep.id] || 0) > 0) anchorKey = todayKey;
			else if ((byDate.get(yKey)?.[ep.id] || 0) > 0) anchorKey = yKey;
			if (!anchorKey) continue;

			// Walk backwards
			let started = anchorKey;
			let cursor = new Date(anchorKey + 'T12:00:00');
			while (true) {
				const prev = new Date(cursor);
				prev.setDate(prev.getDate() - 1);
				const prevKey = prev.toISOString().slice(0, 10);
				if ((byDate.get(prevKey)?.[ep.id] || 0) > 0) {
					started = prevKey;
					cursor = prev;
				} else {
					break;
				}
			}
			const startedD = new Date(started + 'T12:00:00');
			const anchorD = new Date(anchorKey + 'T12:00:00');
			const dayN = Math.max(
				1,
				Math.round((anchorD.getTime() - startedD.getTime()) / 86400000) + 1,
			);
			activePhases.push({ ep, startedOn: started, dayN });
		}
		if (!activePhases.length) return null;
		// Primary display = longest ongoing.
		const primary = activePhases.reduce((a, b) => (b.dayN > a.dayN ? b : a));
		return {
			id: primary.ep.id,
			label: primary.ep.label,
			color: primary.ep.color,
			dayN: primary.dayN,
			startedOn: primary.startedOn,
			activeCount: activePhases.length,
		};
	})();

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
	$: complianceTone = (complianceRatio >= 0.8 ? 'high' : complianceRatio >= 0.5 ? 'mid' : 'low') as 'high' | 'mid' | 'low';
	$: complianceMessage = $t(
		complianceTone === 'high' ? 'companion.compliance_high'
			: complianceTone === 'mid' ? 'companion.compliance_mid'
			: 'companion.compliance_low',
		{ logged: complianceLogged, total: complianceTotal }
	);
	$: complianceAccent = complianceTone === 'high' ? 'var(--olive)' : complianceTone === 'mid' ? 'var(--ochre)' : 'var(--text-muted)';

	// ─── Cycle-phase card (CIPH-401 / CIPH-855a) ───────────────────────────
	// Only rendered for blueprints that track `cycle_day` (endometriosis,
	// menopause, PCOS). Heavy lifting lives in `$lib/cycleState.ts` so the
	// Calendar route can reuse the anchor + phase math to render its
	// phase-colored day-cell overlay. PHASE_COLORS comes from the same
	// module (still pulled from data palette — CIPH-801).
	$: hasCycleVital = hasCycleTracking(bp);
	$: cycleState = hasCycleVital ? computeCycleStateToday(bp, allDocs) : null;

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
				yAxisID: 'y',
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
				yAxisID: 'y1',
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
			// CIPH-762 — dual y-axis so the primary episodes line stays
			// visible even when symptom-days (typically an order of
			// magnitude larger) would otherwise dominate the scale.
			// Left axis = episodes (brick), right axis = symptom-days (muted).
			y: {
				type: 'linear' as const,
				position: 'left' as const,
				beginAtZero: true,
				ticks: { precision: 0, font: { size: 10 }, color: '#DC2626' },
				grid: { color: 'rgba(0,0,0,0.04)' },
			},
			y1: {
				type: 'linear' as const,
				position: 'right' as const,
				beginAtZero: true,
				ticks: { precision: 0, font: { size: 10 }, color: 'rgba(120,113,108,0.85)' },
				grid: { display: false },
			},
			x: { ticks: { font: { size: 10 } }, grid: { display: false } },
		},
	};

	// CIPH-763a — split arrow from text so the decorative unicode glyph can
	// be `aria-hidden`. VoiceOver reads ↗ as "north-east arrow" which is
	// noise — the text itself already says "weniger/mehr als letzten Monat".
	$: howAreYouHeadlineParts = (() => {
		if (!howAreYouTrend) return null;
		const { epTrend, last, prev } = howAreYouTrend;
		const arrow = epTrend === 'up' ? '↗' : epTrend === 'down' ? '↘' : '→';
		const key = epTrend === 'up'
			? 'companion.how_headline_up'
			: epTrend === 'down'
				? 'companion.how_headline_down'
				: 'companion.how_headline_flat';
		let text = $t(key, { last, prev, noun: episodeNoun });
		if (epTrend === 'up' && (last > prev * 1.5 || last - prev >= 3)) {
			text += ` ${$t('companion.how_softener_up')}`;
		}
		return { arrow, text };
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
	<!-- CIPH-750: dashboard right-rail at ≥1024px.
		 layout-data (1152) stays as the overall shell. At `lg:` we switch
		 to a 2-column grid (main ~1fr, rail 340px) with secondary content
		 (trend chart, quick-action CTA, encryption badge) moved to the rail
		 so the main column can stay focused on today-first flow. Below lg
		 both components render as a single stacked stream — identical to
		 the pre-split layout. All reactive state (bp, cycle, compliance,
		 charts, confirm-delete) stays in this shell; the two subcomponents
		 are thin render-only wrappers to de-risk the split that was
		 deferred twice by keeping the reactive cascade in one place. -->
	<div class="layout-data py-6 fade-in space-y-6">
		<!-- Full-width header: greeting + today-status span both columns
		     (CIPH-781 follow-up — was cramped in the 2/3 column). -->
		<section>
			<div class="flex items-center justify-between">
				<div>
					<h1 class="text-2xl font-bold" style="color: var(--text-primary)">{$t('companion.greeting', { name: $auth.username || '' })}</h1>
					<p class="text-sm mt-0.5" style="color: var(--text-secondary)">{new Date().toLocaleDateString($locale, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
				</div>
				{#if bp}<span class="badge badge-olive">{$t(bp.conditionLabel)}</span>{/if}
			</div>
		</section>

		{#if !todayLog}
			<section class="card-brand p-6">
				<div class="flex items-center gap-4">
					<div class="w-14 h-14 rounded-2xl bg-white/60 flex items-center justify-center shrink-0">
						<Asterisk size={28} color="brand" />
					</div>
					<div class="flex-1">
						<p class="font-medium" style="color: var(--brand)">{$t('companion.today_not_filled')}</p>
						<p class="text-sm mt-0.5" style="color: var(--text-secondary)">~3 min</p>
					</div>
					<a href="/log/today" class="btn-primary px-5 py-2 text-sm shrink-0">
						{$t('companion.fill_today')}
					</a>
				</div>
			</section>
		{:else}
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

		<!-- 2/3 + 1/3 grid begins below the full-width header -->
		<div class="lg:grid lg:grid-cols-[1fr_340px] lg:gap-8 lg:items-start space-y-6 lg:space-y-0">
		<div class="space-y-6 min-w-0">
			<CompanionMain
				{cohort}
				{activePhase}
				{hasCycleVital}
				{cycleState}
				{PHASE_COLORS}
				{episodeChartData}
				{episodeChartOptions}
				{symptomChartData}
				{symptomChartOptions}
				{companionChartScope}
				{yearChartAvailable}
				{maxChartAvailable}
				{symptomChartScope}
				{symptomYearAvailable}
				{symptomMaxAvailable}
				{howAreYouChartData}
				{howAreYouChartOptions}
				{howAreYouTrend}
				{howAreYouHeadlineParts}
				{episodeNoun}
				onSetEpisodeScope={(s) => (companionChartScope = s)}
				onSetSymptomScope={(s) => (symptomChartScope = s)}
			/>
		</div>
		<aside class="min-w-0">
			<CompanionRail
				{complianceLogged}
				{complianceTotal}
				{complianceRatio}
				{complianceTone}
				{complianceMessage}
				{complianceAccent}
				canExport={!!bp && allDocs.length > 0}
				{todayEntries}
				{bp}
				allDocsStore={$documents}
				{confirmDeleteId}
				onEditEntry={handleEditEntry}
				onDeleteEntry={handleDeleteEntry}
				onRequestDelete={(id) => (confirmDeleteId = id)}
				onCancelDelete={() => (confirmDeleteId = null)}
			/>
		</aside>
		</div>

		<!-- Full-width encryption badge below the grid (1/1) -->
		<div class="pt-2">
			<div class="asterisk-divider py-3">
				<Asterisk size={14} color="muted" />
			</div>
			<p class="text-center text-xs" style="color: var(--text-muted)">{$t('encryption.badge')}</p>
		</div>
	</div>
{/if}
