<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { auth } from '$lib/stores/auth';
	import { documents, type CiphraDocument } from '$lib/stores/documents';
	import { resolvedBlueprint } from '$lib/blueprint';
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
	import { cohortPalette } from '$lib/cohortPalette';

	// CIPH-873 — exportForDoctor() helper + generateDoctorPdf import removed.
	// The "Export for doctor" rail button now deep-links to
	// /reports?action=export which opens the scope picker.

	let loaded = false;
	let confirmDeleteId: number | null = null;

	onMount(() => {
		documents.load().then(() => { loaded = true; });
	});

	$: bp = $resolvedBlueprint;
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
	// CIPH-904 — Suppress the compliance card for new users. Day-1 users
	// would otherwise read "0% logged in 30 days" as a failure on first
	// visit. Threshold = 3 entry docs (~3 days of use); after that, the
	// percentage is meaningful even at "low" tones.
	$: entryDocCount = allDocs.filter((d) => d.data?.type === 'entry').length;
	$: complianceVisible = entryDocCount >= 3;

	// CIPH-pi24-5c — Marker-event gap-trend. Only computed for presets that
	// declare `markerEvent` (10 cleanly-episodic conditions: epilepsy,
	// migraine, bipolar, MS, long-COVID, asthma, RA, IBD, IBS, diabetes).
	// Returns null for ≥3-events gate, hiding the card on day-1 users and on
	// presets where the chronic-flare / no-discrete-marker pattern would
	// trigger Klara's prior objection (see Companion.svelte:124).
	$: markerGapTrend = (() => {
		if (!bp?.markerEvent) return null;
		const markerIds = new Set(bp.markerEvent.episodeIds);

		const dates: string[] = [];
		for (const d of allDocs) {
			if (d.data?.type !== 'entry') continue;
			const eps = (d.data.episodes || d.data.seizures || {}) as Record<string, number>;
			let hit = false;
			for (const id of Object.keys(eps)) {
				if (markerIds.has(id) && Number(eps[id]) > 0) {
					hit = true;
					break;
				}
			}
			if (hit) {
				const ds = String(d.data.date || '').slice(0, 10);
				if (ds) dates.push(ds);
			}
		}
		if (dates.length < 3) return null;

		dates.sort();
		const gaps: number[] = [];
		for (let i = 1; i < dates.length; i++) {
			const prev = new Date(dates[i - 1] + 'T12:00:00');
			const curr = new Date(dates[i] + 'T12:00:00');
			gaps.push(Math.round((curr.getTime() - prev.getTime()) / 86400000));
		}

		const lastDate = dates[dates.length - 1];
		const today = new Date(todayStr + 'T12:00:00');
		const last = new Date(lastDate + 'T12:00:00');
		const currentGap = Math.max(0, Math.round((today.getTime() - last.getTime()) / 86400000));

		// Show last 5 historical gaps + the trailing in-progress current gap.
		const historicalGaps = gaps.slice(-5);
		const bestGap = Math.max(...gaps, currentGap);
		return { historicalGaps, currentGap, bestGap, nounKey: bp.markerEvent.nounKey };
	})();

	// CIPH-881b — Count rescue-medication events in the current month so the
	// dashboard rail can render a "Rescue meds this month" counter card. Only
	// surfaced when the active blueprint declares rescueMedications, so
	// presets without a clinical rescue protocol stay clean.
	$: rescueMedsThisMonth = (() => {
		if (!bp?.rescueMedications || bp.rescueMedications.length === 0) return 0;
		const monthPrefix = todayStr.slice(0, 7);
		return allDocs.filter(
			(d) => d.data?.type === 'event'
				&& d.data?.kind === 'medication'
				&& String(d.data.date || '').startsWith(monthPrefix),
		).length;
	})();

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
	$: todayVitalCount = todayEntries.reduce((sum, d) => {
		const vs = (d.data.vitals || {}) as Record<string, unknown>;
		return sum + Object.values(vs).filter((v) => v !== '' && v !== null && v !== undefined).length;
	}, 0);

	// CIPH-pi24-5c — S5+S1: cohort-aware completeness gauge merged into the
	// hero header. Categories are derived from what the active blueprint
	// declares (symptoms/episodes/vitals) so day-1 users without episodes
	// don't see an unfillable "Episodes" slot. The hero shows a single block:
	// greeting → progress → unfilled chips → continue CTA.
	$: todayCategories = (() => {
		if (!bp) return [];
		const cats: { id: string; labelKey: string; filled: boolean }[] = [];
		if (bp.symptomGroups?.length) {
			cats.push({ id: 'symptoms', labelKey: 'companion.cat_symptoms', filled: todaySymptomCount > 0 });
		}
		if (bp.episodeTypes?.length) {
			cats.push({ id: 'episodes', labelKey: 'companion.cat_episodes', filled: todayEpisodeCount > 0 });
		}
		if (bp.vitals?.length) {
			cats.push({ id: 'vitals', labelKey: 'companion.cat_vitals', filled: todayVitalCount > 0 });
		}
		return cats;
	})();
	$: todayDoneCount = todayCategories.filter((c) => c.filled).length;
	$: todayTotalCount = todayCategories.length;
	$: todayAllDone = todayTotalCount > 0 && todayDoneCount === todayTotalCount;
	$: todayNothingYet = todayDoneCount === 0;

	// CIPH-900 — Episode bar-chart and Top-symptoms bar-chart removed from
	// the dashboard. Both lived as scope-pickered charts on Companion since
	// PI v6; Anna-test (cycle cohort) flagged the dashboard as a "lot of not
	// matching colours and structurally confusing". /reports already surfaces
	// per-month coverage + sums + year heatmap, which is stronger data
	// presentation than a vertical bar count. The dashboard now keeps a
	// single sparkline-hero ("Wie geht's dir?") that links into /reports for
	// the full trend view.

	// ─── "Wie geht's dir?" — 12-month combined trend (CIPH-715, slimmed for CIPH-900) ─────────────
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

	// CIPH-900 — Cohort-aware sparkline. Episode line uses cohort slot 1
	// (the cohort's primary), symptom-days line uses slot 5 (anchor slate,
	// cohort-invariant). The previous hardcoded `#DC2626` brick-red bled
	// danger semantics into a cycle-cohort dashboard themed magenta-rose.
	$: cohortAccentHex = cohortPalette(cohort)[0];
	$: cohortNeutralHex = cohortPalette(cohort)[4]; // anchor slate, shared

	// CIPH-915 — Dashboard chart aligned to the /reports trend style.
	// Visible point markers, bottom legend, dual y-axis with tick labels.
	// One chart "look" across the app so dashboard ↔ reports feel like
	// the same product. Data window stays at 12 months on the dashboard
	// (vs. 24 in reports) — dashboard is the at-a-glance view.
	$: howAreYouChartData = howAreYouTrend ? {
		labels: howAreYouTrend.months.map((m) => m.label),
		datasets: [
			{
				label: episodeNoun,
				data: howAreYouTrend.episodes,
				borderColor: cohortAccentHex,
				backgroundColor: 'transparent',
				borderWidth: 2,
				tension: 0.3,
				pointRadius: 2,
				pointHoverRadius: 5,
				pointBackgroundColor: cohortAccentHex,
				fill: false,
				yAxisID: 'y',
			},
			{
				label: $t('companion.how_symptom_days'),
				data: howAreYouTrend.symptomDays,
				borderColor: cohortNeutralHex,
				backgroundColor: 'transparent',
				borderWidth: 1,
				borderDash: [3, 3],
				tension: 0.3,
				pointRadius: 1.5,
				pointHoverRadius: 4,
				pointBackgroundColor: cohortNeutralHex,
				fill: false,
				yAxisID: 'y1',
			},
		],
	} : null;

	// CIPH-pi24-5e — Vertical event-markers for the "Wie geht's dir?" line
	// chart. Per user dogfood: "a fine line every time a Episode/trigger
	// has been created. so the diagram instantly tells 'something happened
	// here'". For each day in the 12-month window that has at least one
	// episode (any episodeType, count > 0) OR at least one trigger, we
	// emit a fractional x-position (0..11.999 — the chart's category
	// axis indexes months 0-11, so day-13 of month 3 ≈ 3 + 13/30 = 3.43).
	// The plugin reads `markersEpisode` / `markersTrigger` off the chart
	// options and draws hairlines via `afterDatasetsDraw`. Hairlines do
	// not shift the y-scale because they're drawn after the dataset pass.
	$: eventMarkers = (() => {
		if (!howAreYouTrend) return { episodes: [] as number[], triggers: [] as number[] };
		const months = howAreYouTrend.months as { y: number; m: number; key: string }[];
		const eps: number[] = [];
		const trg: number[] = [];
		for (const d of allDocs) {
			if (d.data?.type !== 'entry') continue;
			const ds = String(d.data.date || '').slice(0, 10);
			if (!ds) continue;
			const moIdx = months.findIndex((mo) => ds.startsWith(mo.key));
			if (moIdx < 0) continue;
			const dayN = Math.max(1, Number(ds.slice(8, 10)) || 1);
			const daysInMonth = new Date(months[moIdx].y, months[moIdx].m + 1, 0).getDate();
			const x = moIdx + (dayN - 1) / daysInMonth;
			const epMap = (d.data.episodes || d.data.seizures || {}) as Record<string, number>;
			if (Object.values(epMap).some((v) => Number(v) > 0)) eps.push(x);
			const trList = (d.data.triggers || []) as unknown[];
			if (Array.isArray(trList) && trList.length > 0) trg.push(x);
		}
		return { episodes: eps, triggers: trg };
	})();

	$: howAreYouChartOptions = {
		responsive: true,
		maintainAspectRatio: false,
		// Plugin payload — read by the inline `eventMarkerPlugin` registered
		// at chart creation in ChartWrapper. Kept off the standard plugins
		// namespace so Chart.js' built-in plugin discovery doesn't try to
		// validate them as legend / tooltip / etc.
		markersTrigger: eventMarkers.triggers,
		markerTriggerColor: '#9F630B',
		markerTriggerLabel: $t('companion.trigger_days'),
		plugins: {
			legend: {
				display: true,
				position: 'bottom' as const,
				labels: {
					boxWidth: 10,
					font: { size: 11 },
					// CIPH-pi24-5e — inject a synthetic legend entry for the
					// trigger-tick row so the user can decode what the marks
					// at the chart bottom mean. Dataset entries come first
					// (the two existing lines), then the trigger swatch.
					generateLabels(chart: { data: { datasets: Array<{ label: string; borderColor?: string; backgroundColor?: string }> }; isDatasetVisible: (i: number) => boolean; options: Record<string, unknown> }) {
						const datasets = chart.data.datasets || [];
						const items = datasets.map((d, i) => ({
							text: d.label,
							fillStyle: d.borderColor || d.backgroundColor,
							strokeStyle: d.borderColor || d.backgroundColor,
							lineWidth: 0,
							hidden: !chart.isDatasetVisible(i),
							datasetIndex: i,
						}));
						const trgColor = (chart.options.markerTriggerColor as string) || '#9F630B';
						const trgLabel = (chart.options.markerTriggerLabel as string) || 'Triggers';
						const trgs = (chart.options.markersTrigger as number[]) || [];
						if (trgs.length > 0) {
							items.push({
								text: trgLabel,
								fillStyle: trgColor,
								strokeStyle: trgColor,
								lineWidth: 0,
								hidden: false,
								datasetIndex: -1,
							});
						}
						return items;
					},
				},
			},
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
			y: {
				type: 'linear' as const,
				position: 'left' as const,
				beginAtZero: true,
				ticks: { precision: 0, font: { size: 10 }, color: cohortAccentHex, maxTicksLimit: 5 },
				grid: { color: 'rgba(0,0,0,0.04)' },
				border: { display: false },
			},
			y1: {
				type: 'linear' as const,
				position: 'right' as const,
				beginAtZero: true,
				ticks: { precision: 0, font: { size: 10 }, color: cohortNeutralHex, maxTicksLimit: 5 },
				grid: { display: false },
				border: { display: false },
			},
			x: {
				ticks: { font: { size: 10 }, color: 'rgba(120,113,108,0.7)', maxRotation: 0 },
				grid: { display: false },
				border: { display: false },
			},
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

	// CIPH-900 — episodeChart + symptomChart bar charts removed from
	// dashboard (see comment near howAreYou). /reports owns the deep view.

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
		<!-- CIPH-pi24-5c — S5+S1 merged hero: greeting + cohort-aware
		     completeness in a single full-width card. Previously two
		     separate sections (header + today-status); the consolidation
		     drops one surface while adding named missing-category chips
		     when partially filled (the morbus-AI "what should I log next"
		     answer). Three states: nothing-yet → CTA banner, partial →
		     progress bar + unfilled chips, all-done → green check + edit
		     link. -->
		<section class="card p-6">
			<div class="flex items-center justify-between gap-3">
				<div class="min-w-0">
					<h1 class="text-2xl font-bold" style="color: var(--text-primary)">{$t('companion.greeting', { name: $auth.username || '' })}</h1>
					<p class="text-sm mt-0.5" style="color: var(--text-secondary)">{new Date().toLocaleDateString($locale, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
				</div>
				{#if bp}<span class="badge badge-olive shrink-0">{$t(bp.conditionLabel)}</span>{/if}
			</div>

			{#if todayTotalCount > 0}
				<div class="mt-5 pt-5" style="border-top: 1px solid var(--border)">
					{#if todayNothingYet}
						<div class="flex items-center gap-4">
							<div class="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style="background: var(--brand-light, rgba(176,75,47,0.08))">
								<Asterisk size={24} color="brand" />
							</div>
							<div class="flex-1 min-w-0">
								<p class="font-medium" style="color: var(--brand)">{$t('companion.today_not_filled')}</p>
								<p class="text-sm mt-0.5" style="color: var(--text-secondary)">~3 min</p>
							</div>
							<a href="/log/today" class="btn-primary px-5 py-2 text-sm shrink-0">
								{$t('companion.fill_today')}
							</a>
						</div>
					{:else if todayAllDone}
						<div class="flex items-center justify-between gap-3">
							<div class="flex items-center gap-2 min-w-0">
								<div class="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style="background: var(--olive)">
									<svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
								</div>
								<span class="text-sm font-medium" style="color: var(--olive)">{$t('companion.completeness_all_done')}</span>
							</div>
							<a href="/log/today" class="text-xs font-medium hover:underline shrink-0" style="color: var(--brand)">{$t('common.edit')}</a>
						</div>
					{:else}
						<div class="flex items-center justify-between gap-3 mb-3">
							<p class="text-sm font-medium" style="color: var(--text-primary)">
								{$t('companion.completeness_done', { done: todayDoneCount, total: todayTotalCount })}
							</p>
							<a href="/log/today" class="btn-primary px-4 py-1.5 text-xs shrink-0">
								{$t('companion.completeness_continue')}
							</a>
						</div>
						<div class="w-full rounded-full h-1.5 mb-3" style="background: var(--surface-inset)">
							<div class="h-1.5 rounded-full transition-all duration-500" style="background: var(--olive); width: {(todayDoneCount / todayTotalCount) * 100}%"></div>
						</div>
						<div class="flex flex-wrap gap-1.5">
							{#each todayCategories as cat}
								<span
									class="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
									style="background: {cat.filled ? 'rgba(132,154,84,0.12)' : 'var(--surface-muted)'}; color: {cat.filled ? 'var(--olive)' : 'var(--text-muted)'};"
								>
									{#if cat.filled}
										<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
									{:else}
										<span class="inline-block w-1.5 h-1.5 rounded-full" style="background: var(--text-muted); opacity: 0.5" aria-hidden="true"></span>
									{/if}
									{$t(cat.labelKey)}
								</span>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</section>

		<!-- 2/3 + 1/3 grid begins below the full-width header -->
		<div class="lg:grid lg:grid-cols-[1fr_340px] lg:gap-8 lg:items-start space-y-6 lg:space-y-0">
		<div class="space-y-6 min-w-0">
			<CompanionMain
				{cohort}
				{activePhase}
				{hasCycleVital}
				{cycleState}
				{PHASE_COLORS}
				{howAreYouChartData}
				{howAreYouChartOptions}
				{howAreYouTrend}
				{howAreYouHeadlineParts}
				{episodeNoun}
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
				{complianceVisible}
				{rescueMedsThisMonth}
				{markerGapTrend}
				markerAccentHex={cohortAccentHex}
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

		<!-- CIPH-903 — encryption.badge + asterisk-divider moved into the
			 authed footer so the trust signal renders on every authed page,
			 not just the dashboard. -->
	</div>
{/if}
