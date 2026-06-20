<script lang="ts">
	import { t, locale, plural } from '$lib/i18n';
	import { todayISO } from '$lib/date';
	import { auth } from '$lib/stores/auth';
	import { documents, documentsError, type CiphraDocument } from '$lib/stores/documents';
	import { resolvedBlueprint, hasBedarfMeds } from '$lib/blueprint';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import Asterisk from '$lib/components/Asterisk.svelte';
	import CompanionMain from '$lib/components/CompanionMain.svelte';
	import CompanionRail from '$lib/components/CompanionRail.svelte';
	import WelcomeCard from '$lib/components/WelcomeCard.svelte';

	// CIPH-764 reverted post senior review — country-specific helplines
	// without explicit user country selection conflict with zero-knowledge.
	// Replaced by CIPH-790 (settings-based opt-in help section).
	import { familyLinks } from '$lib/stores/familyLinks';
	import { cohortOf } from '$lib/blueprint/cohort';
	import {
		resolvePrimaryDashboardCard,
		type DashboardSummary,
		type DashboardCardSpec,
	} from '$lib/blueprint/dashboardPrimary';
	import { computeCycleStateToday, hasCycleTracking, PHASE_COLORS } from '$lib/cycleState';
	import { cohortPalette } from '$lib/cohortPalette';
	import { conditionInfoMap } from '$lib/conditionInfo';

	// CIPH-921 — the dashboard condition label must use the SAME per-condition
	// color as /conditions (the landing #conditions section + condition deep
	// pages), not a uniform olive badge. Source of truth is conditionInfoMap;
	// fall back to the blueprint's own accent for custom/unlisted conditions.
	// All three fallbacks are hex so the `{color}1a` / `{color}33` alpha
	// suffixes below stay valid CSS (never a var()).
	$: conditionColor =
		(bp && conditionInfoMap[bp.conditionId]?.color) || bp?.accentColor || cohortAccentHex;

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
	$: todayStr = todayISO();
	$: todayEntries = allDocs.filter(d => String(d.data.date || '').startsWith(todayStr));

	// CIPH-854 — Cohort drives home card ordering + which extra context
	// cards render. `cohortOf` reads blueprint.conditionId.
	$: cohort = cohortOf(bp);

	// pi24 dashboard rework — primary card slot is governed by
	// resolvePrimaryDashboardCard(bp, summary). The summary is computed
	// here from $documents + bp. CompanionMain switches on primarySpec.kind
	// to render the right card in the primary slot (or nothing, when the
	// cohort anchor blocks above already carry the answer).
	$: dashboardSummary = ((): DashboardSummary => {
		const presentVitalIds = new Set<string>();
		let hasAnyEntry = false;
		let hasEpisodeData = false;
		let hasSymptomData = false;
		let hasTriggerData = false;
		const triggerIds = bp?.triggers?.map((tr) => tr.id) ?? [];
		for (const d of allDocs) {
			const type = d.data?.type;
			if (type === 'entry' || type === 'event' || type === 'diary') {
				hasAnyEntry = true;
			}
			if (type !== 'entry') continue;
			const eps = (d.data.episodes || d.data.seizures || {}) as Record<string, number>;
			for (const v of Object.values(eps)) {
				if (Number(v) > 0) { hasEpisodeData = true; break; }
			}
			const syms = (d.data.symptoms || {}) as Record<string, unknown>;
			for (const v of Object.values(syms)) {
				if (v) { hasSymptomData = true; break; }
			}
			if (!hasTriggerData) {
				const trs = d.data.triggers as unknown;
				if (Array.isArray(trs)) {
					if (trs.length > 0) hasTriggerData = true;
				} else if (trs && typeof trs === 'object') {
					const obj = trs as Record<string, unknown>;
					for (const id of triggerIds) {
						if (obj[id] === true) { hasTriggerData = true; break; }
					}
				}
			}
			const vitals = (d.data.vitals || {}) as Record<string, unknown>;
			for (const [k, v] of Object.entries(vitals)) {
				if (v === '' || v === null || v === undefined) continue;
				presentVitalIds.add(k);
			}
		}
		return {
			hasAnyEntry,
			hasEpisodeData,
			hasSymptomData,
			hasTriggerData,
			hasActivePhase: !!activePhase,
			presentVitalIds,
		};
	})();
	$: primarySpec = resolvePrimaryDashboardCard(bp, dashboardSummary) as DashboardCardSpec | null;

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
		if (!hasBedarfMeds(bp)) return 0;
		const monthPrefix = todayStr.slice(0, 7);
		return allDocs.filter(
			(d) => d.data?.type === 'event'
				&& d.data?.kind === 'medication'
				&& String(d.data.date || '').startsWith(monthPrefix),
		).length;
	})();

	// ─── Cycle-phase card (CIPH-401 / CIPH-855a) ───────────────────────────
	// Only rendered for blueprints that track `cycle_day` (endometriosis,
	// menopause, PMOS). Heavy lifting lives in `$lib/cycleState.ts` so the
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

	// pi24 dogfood: the cohort-completeness chip-bar was removed. The
	// previous design treated "filled = N positive values today" — which
	// punished good days (no symptoms, no episodes = "you missed it"),
	// and forced 3 categories on cohorts whose users don't measure all
	// three daily. The new hero shows ONLY a positive recap when the
	// day has been logged; "no log = good day too" is also a valid state
	// and the hero stays silent rather than nagging. The "+ Eintrag"
	// affordances on BottomNav and /journal cover the add-today path.
	$: todayRecapParts = (() => {
		if (!todayLog) return [] as string[];
		const parts: string[] = [];
		if (todaySymptomCount > 0) {
			parts.push(plural($t, $locale, 'companion.recap_symptoms', todaySymptomCount));
		}
		if (todayEpisodeCount > 0) {
			// episodeNoun is cohort-aware (e.g. "Anfall", "Migräne"). Singular
			// form is used regardless of count — declining the noun in 4
			// locales for every blueprint isn't worth the i18n surface.
			parts.push(`${todayEpisodeCount} ${episodeNoun}`);
		}
		if (todayVitalCount > 0) {
			parts.push(plural($t, $locale, 'companion.recap_vitals', todayVitalCount));
		}
		return parts;
	})();

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
				borderColor: conditionColor,
				backgroundColor: 'transparent',
				borderWidth: 2,
				tension: 0.3,
				pointRadius: 2,
				pointHoverRadius: 5,
				pointBackgroundColor: conditionColor,
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

	// pi24 dogfood: tick-row visualization removed. The trigger-day count
	// per month bin is surfaced via tooltip enrichment instead (see the
	// tooltip callbacks below). Triggers carry a dual write shape — array
	// (DayDetail.svelte:71) or object map (EntryComposer.svelte:139,
	// Record<string, boolean>) — and EntryComposer's spread-merge can
	// graft list ids onto numeric keys with truthy string values, so a
	// naive `Object.values(trs).some(v => v)` over-counts. The detection
	// below treats the array shape as authoritative and only consults
	// known blueprint ids when reading the object shape.
	$: triggerIds = bp?.triggers?.map((t) => t.id) ?? [];
	$: monthlyTriggerDays = (() => {
		if (!howAreYouTrend || triggerIds.length === 0) return [] as number[];
		const months = howAreYouTrend.months as { y: number; m: number; key: string }[];
		const counts = months.map(() => 0);
		for (const d of allDocs) {
			if (d.data?.type !== 'entry') continue;
			const ds = String(d.data.date || '').slice(0, 10);
			if (!ds) continue;
			const moIdx = months.findIndex((mo) => ds.startsWith(mo.key));
			if (moIdx < 0) continue;
			const trs = d.data.triggers as unknown;
			let hasTrigger = false;
			if (Array.isArray(trs)) {
				hasTrigger = trs.length > 0;
			} else if (trs && typeof trs === 'object') {
				const obj = trs as Record<string, unknown>;
				for (const id of triggerIds) {
					if (obj[id] === true) { hasTrigger = true; break; }
				}
			}
			if (hasTrigger) counts[moIdx]++;
		}
		return counts;
	})();

	$: howAreYouChartOptions = {
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: {
				display: true,
				position: 'bottom' as const,
				labels: { boxWidth: 10, font: { size: 11 } },
			},
			tooltip: {
				callbacks: {
					title: (items: Array<{ dataIndex: number }>) => {
						if (!howAreYouTrend || !items.length) return '';
						const mo = howAreYouTrend.months[items[0].dataIndex];
						return new Date(mo.y, mo.m, 1).toLocaleDateString($locale, { month: 'long', year: 'numeric' });
					},
					// pi24 dogfood: trigger-day count surfaces as a hover line
					// instead of a sub-pixel tick row. Only renders when the
					// blueprint declares triggers and the month has at least one.
					afterBody: (items: Array<{ dataIndex: number }>) => {
						if (!items.length || monthlyTriggerDays.length === 0) return [];
						const n = monthlyTriggerDays[items[0].dataIndex] || 0;
						if (n === 0) return [];
						return [plural($t, $locale, 'companion.tooltip_trigger_days', n)];
					},
				},
			},
		},
		scales: {
			y: {
				type: 'linear' as const,
				position: 'left' as const,
				beginAtZero: true,
				// CIPH-918 — axis title disambiguates the two independently-
				// scaled lines. Dual-axis (CIPH-915) made "is this 1 or 2?"
				// ambiguous because each line reads against a different scale;
				// the title ties the left numbers to the accent episode line.
				title: { display: true, text: episodeNoun, font: { size: 10 }, color: conditionColor },
				ticks: { precision: 0, font: { size: 10 }, color: conditionColor, maxTicksLimit: 5 },
				grid: { color: 'rgba(0,0,0,0.04)' },
				border: { display: false },
			},
			y1: {
				type: 'linear' as const,
				position: 'right' as const,
				beginAtZero: true,
				title: { display: true, text: $t('companion.how_symptom_days'), font: { size: 10 }, color: cohortNeutralHex },
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

{#if !loaded || $documentsError || (!bp && $documents.some(d => d.data?.type === 'blueprint'))}
	<!-- ── Loading state (CIPH-204): the asterisk *is* the loading state.
	     The second condition prevents the caregiver-empty flash on hard
	     refresh: documents.load() can finish (loaded=true) before the
	     blueprint store has finished decrypting the blueprint doc. While a
	     blueprint doc exists in $documents but $blueprint is still null,
	     keep showing the loading state instead of falsely declaring the
	     user has no blueprint.
	     The $documentsError condition keeps us in the loading state while the
	     layout auto-retries a failed initial load (cacheless-device fetch
	     hiccup) — otherwise an authed returning user would flash the
	     caregiver-empty screen on top of the error banner. When the retry
	     succeeds the error clears and $documents/$blueprint populate. -->
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
		<!-- First-moment explainer for new + migrated users. Sits ABOVE the
		     greeting + primary card so it's the first thing a fresh user
		     sees on the dashboard. Variant is driven by
		     auth.registrationSource; dismiss is one-shot via localStorage
		     (per-variant key). Renders nothing once dismissed. -->
		<WelcomeCard />
		<!-- pi24 dogfood: hero is greeting + a positive recap WHEN today is
		     logged. When today isn't logged, the hero stays silent — a
		     blank day is also a valid good day. "+ Eintrag" affordances
		     on BottomNav and /journal cover the add-today path; no nag
		     here, no progress bar, no chips. -->
		<section class="card p-6">
			<div class="flex items-center justify-between gap-3">
				<div class="min-w-0">
					<h1 class="text-2xl font-bold" style="color: var(--text-primary)">{$t('companion.greeting', { name: $auth.username || '' })}</h1>
					<p class="text-sm mt-0.5" style="color: var(--text-secondary)">{new Date().toLocaleDateString($locale, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
				</div>
				{#if bp}<span class="badge shrink-0" style="background: {conditionColor}1a; color: {conditionColor}; border: 1px solid {conditionColor}33;">{$t(bp.conditionLabel)}</span>{/if}
			</div>

			{#if todayLog}
				<div class="mt-5 pt-5 flex items-center justify-between gap-3 flex-wrap" style="border-top: 1px solid var(--border)">
					<div class="flex items-baseline gap-2 flex-wrap min-w-0">
						<span class="inline-flex items-center gap-1.5 text-sm font-medium" style="color: var(--olive)">
							<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
							{$t('companion.today_logged')}
						</span>
						{#each todayRecapParts as part}
							<span class="text-sm" style="color: var(--text-muted)">· {part}</span>
						{/each}
					</div>
					<a href="/log/today" class="text-xs font-medium hover:underline shrink-0" style="color: var(--accent)">{$t('common.edit')}</a>
				</div>
			{:else}
				<!-- 2026-06-07 — no-today-log affordance. Mobile users reach
					 /log/today via the BottomNav center FAB; desktop users had
					 no entry point at all after the desktop FAB was dropped in
					 pi24. PI v24 memo "dashboard CTA (S5+S1 hero)" planned for
					 this slot — finally implementing it. Right-aligned + brick-
					 primary mirror the "Bearbeiten" link position when today
					 IS logged, so the hero divider area carries one consistent
					 "today's action" affordance in both states. No leading
					 prompt copy — feedback_no_gaslight_good_days requires the
					 absence of judgment; the button speaks for itself. -->
				<div class="mt-5 pt-5 flex items-center justify-end" style="border-top: 1px solid var(--border)">
					<a
						href="/log/today"
						class="btn-primary text-sm px-5 min-h-[44px] inline-flex items-center gap-2 rounded-xl font-medium"
						data-testid="companion-new-entry"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke-width="2.5" stroke-linecap="round"/></svg>
						{$t('companion.new_entry')}
					</a>
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
				{primarySpec}
				{allDocs}
				{bp}
				{conditionColor}
			/>
		</div>
		<aside class="min-w-0">
			<CompanionRail
				{rescueMedsThisMonth}
				{markerGapTrend}
				markerAccentHex={conditionColor}
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
