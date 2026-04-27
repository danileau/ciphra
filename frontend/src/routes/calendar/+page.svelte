<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { isAuthenticated } from '$lib/stores/auth';
	import { documents, type CiphraDocument } from '$lib/stores/documents';
	import { resolvedBlueprint, isCustomItem } from '$lib/blueprint';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { fade, fly } from 'svelte/transition';
	import Asterisk from '$lib/components/Asterisk.svelte';
	import EntryPreview from '$lib/components/EntryPreview.svelte';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import { cohortOf } from '$lib/blueprint/cohort';
	import {
		computeCycleAnchor,
		cycleStateForDate,
		PHASE_COLORS,
		type Phase,
	} from '$lib/cycleState';

	let selectedDate: string | null = null;
	let currentYear = new Date().getFullYear();
	let currentMonth = new Date().getMonth();
	let confirmDeleteId: number | null = null;

	$: bp = $resolvedBlueprint;

	// CIPH-855a — Cycle-overlay mode. For cycle-cohort blueprints
	// (endometriosis / menopause / PCOS) the calendar renders a soft
	// phase-colored background on each day cell so the monthly phase
	// pattern is readable at a glance. Starts at 15% opacity — can be
	// tuned up to 20% or down to 10% post-persona dry-run.
	$: cohort = cohortOf(bp);
	$: cycleOverlayActive = cohort === 'cycle';
	$: cycleAnchor = cycleOverlayActive ? computeCycleAnchor(bp, $documents) : null;

	// CIPH-855b — Phase-bands polish. For phase-cohort blueprints
	// (bipolar/MS/long-covid/IBD/IBS/chronic_pain/anx_dep/burnout) the
	// multiDay bands are the clinical unit. Render them at 6px (vs 3px
	// default) and dim the counter-dots on days that also have a phase
	// band so the band reads first. Legend above the grid exposes the
	// multiDay types so users know what each color means.
	$: phaseBandEmphasis = cohort === 'phase';
	$: multiDayTypes = (bp?.episodeTypes || []).filter((e) => e.multiDay);
	$: bandLegendVisible = phaseBandEmphasis && multiDayTypes.length > 0;

	function dayPhase(day: number): Phase | null {
		if (!cycleOverlayActive) return null;
		const dateStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
		// CIPH-886 — manual override on the entry doc takes precedence over the
		// derived phase. Used when the user knows their actual phase on a given
		// day differs from the cycle-length-based derivation.
		const override = dayPhaseOverride(day);
		if (override) return override;
		if (!cycleAnchor) return null;
		const state = cycleStateForDate(cycleAnchor, dateStr);
		return state?.phase ?? null;
	}

	// CIPH-886 — return the explicit phase override on the entry for `day`, if
	// one was set in /log/[date]'s phase-override section. Used by both
	// dayPhase() (precedence) and the day-cell template (triangle indicator).
	function dayPhaseOverride(day: number): Phase | null {
		const dateStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
		const doc = $documents.find((d) => d.data?.type === 'entry' && d.data?.date === dateStr);
		const v = (doc?.data as any)?.phaseOverride;
		if (v === 'menstrual' || v === 'follicular' || v === 'ovulation' || v === 'luteal') return v;
		return null;
	}

	// CIPH-886 — number of overridden days in the visible month, used to
	// extend the anchor hint with "N days manually overridden".
	$: overrideCountThisMonth = (() => {
		if (!cycleOverlayActive) return 0;
		let n = 0;
		for (let d = 1; d <= daysInMonth; d++) {
			if (dayPhaseOverride(d)) n++;
		}
		return n;
	})();

	const PHASES: Phase[] = ['menstrual', 'follicular', 'ovulation', 'luteal'];

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
	// CIPH-878 — "go back to now" shortcut. Jumps to today's month and puts
	// keyboard focus on today's cell, but does NOT set `selectedDate` —
	// otherwise the day-detail sheet would pop open and feel like a dialog
	// the user didn't ask for. The user can still tap today to open details.
	function jumpToToday() {
		const now = new Date();
		currentYear = now.getFullYear();
		currentMonth = now.getMonth();
		selectedDate = null;
		focusedDay = now.getDate();
	}
	$: todayYear = new Date().getFullYear();
	$: todayMonth = new Date().getMonth();
	$: isOnCurrentMonth = currentYear === todayYear && currentMonth === todayMonth;

	function getDocsForDay(day: number): CiphraDocument[] {
		const ds = `${monthPrefix}-${String(day).padStart(2, '0')}`;
		return $documents.filter(d => String(d.data.date || '') === ds);
	}

	function dayHasEpisode(day: number): boolean {
		// Counter-style episodes only — multiDay episodes are shown as bars below
		const docs = getDocsForDay(day);
		const multiDayIds = new Set((bp?.episodeTypes || []).filter(e => e.multiDay).map(e => e.id));
		return docs.some(d =>
			d.data.type === 'entry' &&
			Object.entries((d.data.episodes || d.data.seizures || {}) as Record<string, number>)
				.some(([id, v]) => v > 0 && !multiDayIds.has(id))
		);
	}

	/** Returns the list of multiDay episode types active on `day`, with color. */
	function dayMultiDayBands(day: number): { id: string; color: string; label: string }[] {
		if (!bp?.episodeTypes) return [];
		const docs = getDocsForDay(day);
		const result: { id: string; color: string; label: string }[] = [];
		for (const ep of bp.episodeTypes) {
			if (!ep.multiDay) continue;
			const active = docs.some(d =>
				d.data.type === 'entry' && (((d.data.episodes || d.data.seizures || {}) as Record<string, number>)[ep.id] || 0) > 0
			);
			if (active) result.push({ id: ep.id, color: ep.color, label: ep.label });
		}
		return result;
	}

	function dayHasLog(day: number): boolean {
		return getDocsForDay(day).some(d => d.data.type === 'entry');
	}

	/** Count active symptoms across all entry docs on this day. */
	function countSymptomsForDay(day: number): number {
		const docs = getDocsForDay(day);
		let sum = 0;
		for (const d of docs) {
			if (d.data.type !== 'entry') continue;
			const syms = (d.data.symptoms || {}) as Record<string, boolean>;
			for (const k of Object.keys(syms)) if (syms[k]) sum++;
		}
		return sum;
	}

	/** Sum counter-style episodes on this day (excluding multi-day bands). */
	function countEpisodesForDay(day: number): number {
		const docs = getDocsForDay(day);
		const multiDayIds = new Set((bp?.episodeTypes || []).filter(e => e.multiDay).map(e => e.id));
		let sum = 0;
		for (const d of docs) {
			if (d.data.type !== 'entry') continue;
			const eps = (d.data.episodes || d.data.seizures || {}) as Record<string, number>;
			for (const [id, v] of Object.entries(eps)) if (!multiDayIds.has(id)) sum += Number(v) || 0;
		}
		return sum;
	}

	function dayAriaLabel(day: number): string {
		const dateStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
		const dateFmt = new Date(dateStr + 'T12:00:00').toLocaleDateString($locale, {
			day: 'numeric', month: 'long', year: 'numeric'
		});
		const epCount = countEpisodesForDay(day);
		const symCount = countSymptomsForDay(day);
		if (epCount > 0) {
			return $t('calendar.aria_day_episode', { date: dateFmt, episodes: epCount, symptoms: symCount });
		}
		if (dayHasLog(day)) {
			return $t('calendar.aria_day_logged', { date: dateFmt, count: symCount });
		}
		return $t('calendar.aria_day_empty', { date: dateFmt });
	}

	$: selectedDayDocs = selectedDate ? $documents.filter(d => String(d.data.date || '') === selectedDate) : [];
	$: monthName = new Date(currentYear, currentMonth).toLocaleDateString($locale, { month: 'long', year: 'numeric' });

	// CIPH-880 — Cohort-aware sheet header. Cycle cohort gets a phase chip
	// (matches the day-cell ring colour from CIPH-879). Phase cohort gets
	// pills for any multiDay band active on the selected day.
	$: selectedDayPhase = (cycleOverlayActive && selectedDate && cycleAnchor)
		? (cycleStateForDate(cycleAnchor, selectedDate)?.phase ?? null)
		: null;
	$: selectedDayBands = (() => {
		if (cohort !== 'phase' || !selectedDate || !bp?.episodeTypes) return [];
		const docs = $documents.filter(d => String(d.data.date || '') === selectedDate);
		const out: { id: string; color: string; label: string }[] = [];
		for (const ep of bp.episodeTypes) {
			if (!ep.multiDay) continue;
			const active = docs.some(d =>
				d.data.type === 'entry' &&
				(((d.data.episodes || d.data.seizures || {}) as Record<string, number>)[ep.id] || 0) > 0,
			);
			if (active) out.push({ id: ep.id, color: ep.color, label: ep.label });
		}
		return out;
	})();
	// CIPH-880 — Surface the "Copy previous day" affordance in the empty-state.
	// Routes the user to /log/{date} where the existing copy-previous button
	// from EntryComposer (CIPH-850) handles the actual merge.
	$: previousDayHasEntry = (() => {
		if (!selectedDate) return false;
		const prev = new Date(selectedDate + 'T12:00:00');
		prev.setDate(prev.getDate() - 1);
		const prevStr = prev.toISOString().slice(0, 10);
		return $documents.some(d => d.data.type === 'entry' && d.data.date === prevStr);
	})();

	function adjustSelectedDate(delta: number) {
		if (!selectedDate) return;
		const d = new Date(selectedDate + 'T12:00:00');
		d.setDate(d.getDate() + delta);
		const newDate = d.toISOString().slice(0, 10);
		selectedDate = newDate;
		const newY = d.getFullYear();
		const newM = d.getMonth();
		if (newY !== currentYear || newM !== currentMonth) {
			currentYear = newY;
			currentMonth = newM;
			focusedDay = d.getDate();
		}
		confirmDeleteId = null;
	}

	function handleEditEntry(doc: CiphraDocument) {
		const date = String(doc.data.date || selectedDate || '');
		if (doc.data.type === 'entry') {
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

	// CIPH-763c — roving-tabindex focus model for the day grid. Only one
	// cell is in the tab sequence at a time; arrow keys move focus within
	// the grid (WAI-ARIA Grid pattern). Default focus = today when visible,
	// otherwise day 1.
	let focusedDay: number = (() => {
		const now = new Date();
		if (now.getFullYear() === currentYear && now.getMonth() === currentMonth) {
			return now.getDate();
		}
		return 1;
	})();
	$: if (focusedDay > daysInMonth) focusedDay = daysInMonth;

	function handleGridKey(e: KeyboardEvent, day: number) {
		let next = day;
		switch (e.key) {
			case 'ArrowLeft':  next = day - 1; break;
			case 'ArrowRight': next = day + 1; break;
			case 'ArrowUp':    next = day - 7; break;
			case 'ArrowDown':  next = day + 7; break;
			case 'Home':       next = 1; break;
			case 'End':        next = daysInMonth; break;
			default: return;
		}
		e.preventDefault();
		if (next < 1) {
			prevMonth();
			// After month change daysInMonth reflects the new month next tick.
			focusedDay = Math.max(1, Math.min(31, next + 31));
			return;
		}
		if (next > daysInMonth) {
			nextMonth();
			focusedDay = next - daysInMonth;
			return;
		}
		focusedDay = next;
		// Move DOM focus to the new cell.
		queueMicrotask(() => {
			const el = document.querySelector<HTMLElement>(`[data-calendar-day="${focusedDay}"]`);
			el?.focus();
		});
	}

	$: totalEpisodes = monthDocs.reduce((sum: number, d: CiphraDocument) => {
		if (d.data.type === 'entry' && (d.data.episodes || d.data.seizures)) {
			return sum + (Object.values(d.data.episodes || d.data.seizures || {}) as number[]).reduce((a, b) => a + b, 0);
		}
		return sum;
	}, 0);
	$: daysWithLogs = new Set(monthDocs.map(d => String(d.data.date || ''))).size;

	// Events occurring within the selected month, sorted chronologically.
	// Used to render the event strip under the monthly trend chart.
	$: monthEvents = $documents
		.filter(d => d.data?.type === 'event' && String(d.data.date || '').startsWith(monthPrefix))
		.map(d => ({ date: String(d.data.date), notes: String(d.data.notes || '').trim() || $t('stream.events') }))
		.sort((a, b) => a.date.localeCompare(b.date));
</script>

<!-- CIPH-746: widened to layout-data and dropped the nested max-w-2xl
	 that used to pinch the month grid + event timeline on desktop.
	 CIPH-782: tighter desktop spacing so month + event strip + day list
	 fit in a 900px-tall viewport without scroll. Mobile sizing preserved
	 by gating shrinkage on `md:` — tap targets stay ≥44px on phones. -->
<div class="layout-data pt-2 md:pt-3 pb-32">
	<div>
		<!-- Calendar grid -->
		<div>
			<!-- Month navigation -->
			<div class="flex items-center justify-between mb-2 md:mb-3">
				<button
					on:click={prevMonth}
					class="p-2 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors"
					style="color: var(--text-secondary)"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</button>
				<div class="flex items-center gap-2 min-w-0">
					<h1 class="text-base md:text-base font-bold capitalize truncate" style="color: var(--text-primary)">{monthName}</h1>
					{#if !isOnCurrentMonth}
						<button
							on:click={jumpToToday}
							class="cal-today-btn"
							aria-label={$t('common.today')}
						>{$t('common.today')}</button>
					{/if}
				</div>
				<button
					on:click={nextMonth}
					class="p-2 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors"
					style="color: var(--text-secondary)"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</button>
			</div>

			<!-- CIPH-855a — Cycle-phase legend. Shown only for the cycle
				 cohort so non-cycle users don't see unused chrome. Day-cell
				 background color at 15% opacity maps 1:1 to these swatches. -->
			{#if cycleOverlayActive}
				<div class="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]" aria-label={$t('cycle.phase_legend_aria')}>
					<span class="uppercase tracking-wider font-medium" style="color: var(--text-muted)">{$t('cycle.phase_legend')}</span>
					{#each PHASES as ph}
						<span class="inline-flex items-center gap-1.5">
							<span class="w-3 h-3 rounded" style="background: {PHASE_COLORS[ph]}26; border: 1px solid {PHASE_COLORS[ph]}"></span>
							<span style="color: var(--text-secondary)">{$t('cycle.phase_' + ph)}</span>
						</span>
					{/each}
				</div>
				<!-- CIPH-879 — anchor correction hint. Shows which logged day the
					 calculated phases are pivoting on, and one-tap links the user
					 to that date's log so she can correct the period start if the
					 calculation doesn't match reality. -->
				<div class="mb-3 text-[11px]" style="color: var(--text-muted)">
					{#if cycleAnchor}
						<span>{$t('cycle.anchor_hint').replace('{date}', new Date(cycleAnchor.anchorDate + 'T12:00:00').toLocaleDateString($locale, { day: 'numeric', month: 'short', year: 'numeric' }))}</span>
						<a href="/log/{cycleAnchor.anchorDate}" class="ml-1 underline" style="color: var(--brand)">{$t('cycle.anchor_fix')}</a>
					{:else}
						<span>{$t('cycle.anchor_none')}</span>
					{/if}
					<!-- CIPH-886 — show how many days in this month have manual phase
						 overrides, so the user understands the calendar isn't fully
						 derived. Hidden when zero (no clutter). -->
					{#if overrideCountThisMonth > 0}
						<span class="ml-1">· {$t('cycle.anchor_overrides_count').replace('{count}', String(overrideCountThisMonth))}</span>
					{/if}
				</div>
			{/if}

			<!-- CIPH-855b — MultiDay-band legend. Shown only for phase cohort
				 with declared multiDay episode types. Each swatch mirrors the
				 6px band color at the bottom of the day cells. -->
			{#if bandLegendVisible}
				<div class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]" aria-label={$t('calendar.band_legend_aria')}>
					<span class="uppercase tracking-wider font-medium" style="color: var(--text-muted)">{$t('calendar.band_legend')}</span>
					{#each multiDayTypes as ep}
						<span class="inline-flex items-center gap-1.5">
							<span class="block w-4 h-[6px] rounded-sm" style="background: {ep.color}"></span>
							<span style="color: var(--text-secondary)">{isCustomItem(ep.id) ? ep.label : $t(ep.label)}</span>
						</span>
					{/each}
				</div>
			{/if}

			<!-- Weekday headers -->
			<div class="grid grid-cols-7 gap-1 md:gap-0.5 mb-1" role="row">
				{#each weekdays as wd}
					<div class="text-center text-xs md:text-[10px] font-medium py-2 md:py-1" role="columnheader" style="color: var(--text-muted)">{wd}</div>
				{/each}
			</div>

			<!-- Days grid — CIPH-763c: ARIA grid pattern + roving tabindex
				 CIPH-782: md: breakpoint shrinks the grid rhythm on desktop. -->
			<div class="grid grid-cols-7 gap-1 md:gap-0.5" role="grid" aria-label={monthName}>
				{#each Array(firstDayOfWeek) as _}
					<div role="gridcell"></div>
				{/each}

				{#each Array.from({ length: daysInMonth }, (_, i) => i + 1) as day}
					{@const dayStr = `${monthPrefix}-${String(day).padStart(2, '0')}`}
					{@const isToday = dayStr === new Date().toISOString().slice(0, 10)}
					{@const isSelected = dayStr === selectedDate}
					{@const hasEpisode = dayHasEpisode(day)}
					{@const hasLog = dayHasLog(day)}
					{@const bands = dayMultiDayBands(day)}
					{@const phase = dayPhase(day)}
					{@const phaseIsOverridden = dayPhaseOverride(day) !== null}
					<button
						on:click={() => { selectedDate = dayStr; focusedDay = day; }}
						on:keydown={(e) => handleGridKey(e, day)}
						aria-label={dayAriaLabel(day)}
						aria-selected={isSelected}
						role="gridcell"
						data-calendar-day={day}
						tabindex={day === focusedDay ? 0 : -1}
						class="relative aspect-square md:aspect-auto md:h-12 lg:h-14 rounded-xl md:rounded-lg flex flex-col items-center justify-center transition-colors min-h-[44px] overflow-hidden"
						style="{isSelected
							? (phase
								? `background: ${PHASE_COLORS[phase]}59; box-shadow: inset 0 0 0 2px ${PHASE_COLORS[phase]};`
								: 'background: var(--olive-light); box-shadow: inset 0 0 0 2px var(--olive);')
							: isToday
								? (phase
									? `background: ${PHASE_COLORS[phase]}59; box-shadow: inset 0 0 0 2px ${PHASE_COLORS[phase]};`
									: 'box-shadow: inset 0 0 0 2px var(--brand);')
								: phase
									? `background: ${PHASE_COLORS[phase]}26;`
									: ''}"
					>
						<span
							class="text-sm font-medium"
							style="color: var(--text-primary)"
						>{day}</span>
						<!-- CIPH-855b — counter-dots dim to 40% when a phase band is
							 active on this cell AND the blueprint is a phase cohort,
							 so the band reads as the primary signal. -->
						<div class="flex gap-0.5 mt-0.5" style="opacity: {phaseBandEmphasis && bands.length > 0 ? 0.4 : 1}">
							{#if hasEpisode}
								<span class="w-1.5 h-1.5 rounded-full" style="background: var(--danger)"></span>
							{/if}
							{#if hasLog}
								<span class="w-1.5 h-1.5 rounded-full" style="background: var(--olive)"></span>
							{/if}
						</div>
						{#if bands.length > 0}
							<!-- CIPH-855b — 6px bands for phase cohort (foreground),
								 3px default for everyone else (backward-compat). -->
							<div class="absolute bottom-0 left-0 right-0 flex flex-col">
								{#each bands as band}
									<span
										class="block w-full"
										style="background: {band.color}; height: {phaseBandEmphasis ? '6px' : '3px'}"
										title={isCustomItem(band.id) ? band.label : $t(band.label)}
									></span>
								{/each}
							</div>
						{/if}
						{#if phaseIsOverridden && phase}
							<!-- CIPH-886 — triangle indicator on days where the user
								 set an explicit phaseOverride. Distinguishes manually-
								 set days from derived days. -->
							<svg
								class="absolute top-0.5 right-0.5"
								width="8"
								height="8"
								viewBox="0 0 8 8"
								aria-hidden="true"
							>
								<polygon points="0,8 8,8 8,0" fill={PHASE_COLORS[phase]} />
							</svg>
						{/if}
					</button>
				{/each}
			</div>

			<!-- Monthly summary — CIPH-782 tighter on desktop -->
			<div class="mt-4 md:mt-3 grid grid-cols-2 gap-3 md:gap-2">
				<div class="card p-4 md:p-3">
					<p class="text-2xl md:text-xl font-bold num-data" style="color: var(--ochre)">{totalEpisodes}</p>
					<p class="text-xs" style="color: var(--text-secondary)">{$t('pdf.total_episodes')}</p>
				</div>
				<div class="card p-4 md:p-3">
					<p class="text-2xl md:text-xl font-bold num-data" style="color: var(--ochre)">{daysWithLogs}</p>
					<p class="text-xs" style="color: var(--text-secondary)">{$t('calendar.days_logged')}</p>
				</div>
			</div>

			<!-- Trend chart removed (PI v8 close — team consensus: calendars are
			     spatial, not temporal-trend; trend belongs on /reports). Event
			     strip preserved as standalone card since it's spatial info
			     (which days had events) not trend info.
			     Calendar v2 (PI v9 — CIPH-820..825) replaces this section
			     entirely with multi-type overlay + ongoing-phase bands. -->
			{#if monthEvents.length > 0}
				<div class="card mt-4 md:mt-3 p-4 md:p-3">
					<p class="text-[11px] uppercase tracking-wide mb-2" style="color: var(--text-muted)">{$t('calendar.events_in_month')}</p>
					<div class="flex flex-wrap gap-1.5">
						{#each monthEvents as ev}
							<button
								on:click={() => { selectedDate = ev.date; }}
								class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px]"
								style="background: var(--ochre-light); color: var(--ochre)"
								title={ev.notes}
							>
								<span class="font-semibold">{new Date(ev.date + 'T12:00:00').getDate()}.</span>
								<span class="max-w-[180px] truncate">{ev.notes}</span>
							</button>
						{/each}
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

			<!-- CIPH-880 — Header: prev arrow, date, next arrow, edit-link.
				 The edit-link is a stable affordance to the form for this day,
				 distinct from the per-doc edit buttons rendered below. -->
			<div class="flex items-center justify-between gap-2 mb-2">
				<button
					on:click={() => adjustSelectedDate(-1)}
					class="cal-sheet-nav"
					aria-label={$t('common.previous_day')}
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</button>
				<h2 class="text-base font-semibold flex-1 text-center min-w-0 truncate" style="color: var(--text-primary)">
					{new Date(selectedDate + 'T12:00:00').toLocaleDateString($locale, { weekday: 'long', day: 'numeric', month: 'long' })}
				</h2>
				<button
					on:click={() => adjustSelectedDate(1)}
					class="cal-sheet-nav"
					aria-label={$t('common.next_day')}
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</button>
				<a
					href="/log/{selectedDate}"
					class="text-sm font-medium flex items-center gap-1 ml-1"
					style="color: var(--brand)"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					{$t('common.edit')}
				</a>
			</div>

			<!-- CIPH-880 — Cohort-aware framing. Cycle cohort: phase chip
				 matching the day-cell ring colour. Phase cohort: active band
				 pills. Discrete / narrative cohorts get nothing here. -->
			{#if selectedDayPhase}
				<div class="flex justify-center mb-3">
					<span
						class="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full"
						style="background: {PHASE_COLORS[selectedDayPhase]}26; color: {PHASE_COLORS[selectedDayPhase]}; border: 1px solid {PHASE_COLORS[selectedDayPhase]}"
					>
						<span class="w-1.5 h-1.5 rounded-full" style="background: {PHASE_COLORS[selectedDayPhase]}"></span>
						{$t(`cycle.phase_${selectedDayPhase}`)}
					</span>
				</div>
			{:else if selectedDayBands.length > 0}
				<div class="flex flex-wrap justify-center gap-2 mb-3">
					{#each selectedDayBands as band}
						<span
							class="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full"
							style="background: {band.color}1f; color: {band.color}; border: 1px solid {band.color}"
						>
							<span class="w-1.5 h-1.5 rounded-full" style="background: {band.color}"></span>
							{isCustomItem(band.id) ? band.label : $t(band.label)}
						</span>
					{/each}
				</div>
			{/if}

			{#if selectedDayDocs.length > 0}
				<div class="space-y-3">
					{#each selectedDayDocs as doc}
						<div
							class="pl-3 py-2 rounded-r-lg"
							style="border-left: 4px solid {doc.data.type === 'entry' ? 'var(--olive)' : 'var(--ochre)'}; background: var(--surface-muted)"
						>
							<div class="flex items-start justify-between gap-2">
								<div class="flex-1 min-w-0">
									<EntryPreview entry={doc} {bp} showDate={false} compact={true} recentDocs={$documents} />
								</div>
								<div class="flex items-center gap-0.5 shrink-0">
									{#if confirmDeleteId === doc.id}
										<ConfirmDelete
											padding="p-1.5"
											onConfirm={() => handleDeleteEntry(doc.id)}
											onCancel={() => { confirmDeleteId = null; }}
										/>
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
					<div class="flex flex-wrap justify-center gap-2">
						<a
							href="/log/{selectedDate}"
							class="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
						>
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" stroke-width="2"/><line x1="5" y1="12" x2="19" y2="12" stroke-width="2"/></svg>
							{$t('companion.fill_today')}
						</a>
						{#if previousDayHasEntry}
							<!-- CIPH-880 — Routes to the form; EntryComposer's existing
								 copy-previous-day button (CIPH-850) finishes the merge. -->
							<a
								href="/log/{selectedDate}"
								class="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg"
								style="border: 1px dashed var(--border); color: var(--text-secondary)"
							>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke-width="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke-width="2"/></svg>
								{$t('protocol.copy_previous')}
							</a>
						{/if}
					</div>
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
		background: rgba(var(--danger-rgb), 0.05) !important;
	}
	a[style*="--brand"]:hover {
		text-decoration: underline;
	}
	/* CIPH-880 — sheet-header arrow nav (prev/next day). Mirrors the
	   `.log-nav-btn` rhythm from /log/[date] so the two surfaces feel like
	   the same surface. */
	.cal-sheet-nav {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 44px;
		min-height: 44px;
		border-radius: 12px;
		color: var(--text-secondary);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: background 0.15s ease-out;
		flex-shrink: 0;
	}
	.cal-sheet-nav:hover { background: var(--surface-muted); }
	.cal-sheet-nav:active { transform: scale(0.97); }
	.cal-sheet-nav:focus-visible {
		outline: 2px solid var(--brand);
		outline-offset: 2px;
	}

	/* CIPH-878 — jump-to-today pill next to month name. Subtle by default,
	   brand-tinted on hover. Only rendered when off the current month. */
	.cal-today-btn {
		font-size: 11px;
		font-weight: 500;
		padding: 2px 8px;
		border-radius: 9999px;
		border: 1px solid var(--border-subtle, rgba(0,0,0,0.1));
		background: transparent;
		color: var(--text-secondary);
		line-height: 1.4;
		white-space: nowrap;
		cursor: pointer;
		transition: color .15s, background .15s, border-color .15s;
	}
	.cal-today-btn:hover,
	.cal-today-btn:focus-visible {
		color: var(--brand);
		border-color: var(--brand);
		background: rgba(var(--brand-rgb, 99,102,241), 0.08);
	}
</style>
