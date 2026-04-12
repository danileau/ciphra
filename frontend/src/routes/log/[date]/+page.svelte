<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { isAuthenticated } from '$lib/stores/auth';
	import { documents, type CiphraDocument } from '$lib/stores/documents';
	import { blueprint } from '$lib/blueprint';
	import type { Blueprint } from '$lib/blueprint';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Asterisk from '$lib/components/Asterisk.svelte';
	import { fade } from 'svelte/transition';

	let collapsed: Record<string, boolean> = {};
	function toggleSection(id: string) { collapsed[id] = !collapsed[id]; }

	function handleKeydown(e: KeyboardEvent) {
		const tag = (e.target as HTMLElement)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA') return;
		if ((e.ctrlKey || e.metaKey) && e.key === 's') {
			e.preventDefault();
			saveLog();
		}
		if (e.key === 'ArrowLeft') changeDate(-1);
		if (e.key === 'ArrowRight') changeDate(1);
	}

	let currentDate = new Date().toISOString().slice(0, 10);
	let saving = false;
	let saved = false;
	let confirmDelete = false;
	let deleting = false;
	let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
	let hasChanges = false;

	// Daily log state
	let symptoms: Record<string, boolean> = {};
	let episodes: Record<string, number> = {};
	let episodeTimes: Record<string, string> = {};       // time of day per episode type
	let episodeDurations: Record<string, string> = {};   // duration category per episode type
	let episodeNotes: Record<string, string> = {};       // per-episode notes
	let triggers: Record<string, boolean> = {};
	let vitals: Record<string, string> = {};
	let medications: Record<string, boolean> = {};
	let notes = '';

	// Multi-entry vitals: stores parsed arrays for multiEntry fields
	let multiEntryVitals: Record<string, Array<{time: string, value: string}>> = {};
	let multiEntryNewTime: Record<string, string> = {};
	let multiEntryNewValue: Record<string, string> = {};

	function addMultiEntry(vitalId: string) {
		const time = multiEntryNewTime[vitalId] || '';
		const value = multiEntryNewValue[vitalId] || '';
		if (!value) return;
		if (!multiEntryVitals[vitalId]) multiEntryVitals[vitalId] = [];
		multiEntryVitals[vitalId] = [...multiEntryVitals[vitalId], { time, value }];
		vitals[vitalId] = JSON.stringify(multiEntryVitals[vitalId]);
		multiEntryNewTime[vitalId] = '';
		multiEntryNewValue[vitalId] = '';
		markChanged();
	}

	function removeMultiEntry(vitalId: string, index: number) {
		if (!multiEntryVitals[vitalId]) return;
		multiEntryVitals[vitalId] = multiEntryVitals[vitalId].filter((_, i) => i !== index);
		vitals[vitalId] = multiEntryVitals[vitalId].length > 0 ? JSON.stringify(multiEntryVitals[vitalId]) : '';
		markChanged();
	}

	function parseMultiEntryVitals() {
		if (!bp) return;
		for (const v of bp.vitals) {
			if (v.multiEntry && vitals[v.id]) {
				try {
					multiEntryVitals[v.id] = JSON.parse(vitals[v.id]);
				} catch { multiEntryVitals[v.id] = []; }
			}
		}
	}

	const durationOptions = [
		{ value: '', labelKey: 'protocol.duration_select' },
		{ value: '<1min', labelKey: 'protocol.duration_under1' },
		{ value: '1-5min', labelKey: 'protocol.duration_1to5' },
		{ value: '>5min', labelKey: 'protocol.duration_over5' },
	];

	// Auto-save: debounce 3 seconds after any change
	function markChanged() {
		hasChanges = true;
		if (autoSaveTimer) clearTimeout(autoSaveTimer);
		autoSaveTimer = setTimeout(() => {
			if (hasChanges && !saving) saveLog();
		}, 3000);
	}

	// Copy previous day's log
	function copyPreviousDay() {
		const prev = new Date(currentDate + 'T12:00:00');
		prev.setDate(prev.getDate() - 1);
		const prevStr = prev.toISOString().slice(0, 10);
		const prevDoc = $documents.find(d => d.data.type === 'daily_log' && d.data.date === prevStr);
		if (prevDoc) {
			if (prevDoc.data.symptoms) symptoms = { ...symptoms, ...prevDoc.data.symptoms };
			if (prevDoc.data.episodes) episodes = { ...episodes, ...prevDoc.data.episodes };
			if (prevDoc.data.triggers) triggers = { ...triggers, ...prevDoc.data.triggers };
			if (prevDoc.data.medications) medications = { ...medications, ...prevDoc.data.medications };
			markChanged();
		}
	}

	$: hasPreviousDay = $documents.some(d => {
		const prev = new Date(currentDate + 'T12:00:00');
		prev.setDate(prev.getDate() - 1);
		return d.data.type === 'daily_log' && d.data.date === prev.toISOString().slice(0, 10);
	});

	$: bp = $blueprint;

	$: if (bp) {
		initFromBlueprint(bp);
	}

	function initFromBlueprint(b: Blueprint) {
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
		if (Object.keys(medications).length === 0) {
			for (const med of b.medications) medications[med.id] = false;
		}
	}

	$: existingDoc = $documents.find(d => d.data.type === 'daily_log' && d.data.date === currentDate) || null;

	// Pre-populate episodes from quick-captured episode docs for this date
	function mergeQuickCapturedEpisodes() {
		const quickEpisodes = $documents.filter(d => d.data.type === 'episode' && d.data.date === currentDate);
		for (const qe of quickEpisodes) {
			const epType = qe.data.episodeType as string;
			if (epType && episodes[epType] !== undefined) {
				episodes[epType] = (episodes[epType] || 0) + (Number(qe.data.episodes?.[epType]) || 1);
			}
		}
	}

	onMount(() => {
		if (!$isAuthenticated) { goto('/login'); return; }
		// Read date from route param
		const paramDate = $page.params.date;
		if (paramDate === 'today') {
			currentDate = new Date().toISOString().slice(0, 10);
		} else if (paramDate && /^\d{4}-\d{2}-\d{2}$/.test(paramDate)) {
			currentDate = paramDate;
		}
		documents.load().then(() => {
			loadExistingLog();
			mergeQuickCapturedEpisodes();
		});
	});

	async function deleteLog() {
		if (!existingDoc) return;
		deleting = true;
		await documents.remove(existingDoc.id);
		deleting = false;
		confirmDelete = false;
		history.back();
	}

	function loadExistingLog() {
		const existing = $documents.find(d => d.data.type === 'daily_log' && d.data.date === currentDate);
		if (existing) {
			const d = existing.data;
			if (d.symptoms) symptoms = { ...symptoms, ...d.symptoms };
			if (d.episodes) episodes = { ...episodes, ...d.episodes };
			if (d.seizures && !d.episodes) episodes = { ...episodes, ...d.seizures };
			if (d.triggers) triggers = { ...triggers, ...d.triggers };
			if (d.vitals) vitals = { ...vitals, ...d.vitals };
			if (d.medications) medications = { ...medications, ...d.medications };
			if (d.episodeTimes) episodeTimes = { ...episodeTimes, ...d.episodeTimes };
			if (d.episodeDurations) episodeDurations = { ...episodeDurations, ...d.episodeDurations };
			if (d.episodeNotes) episodeNotes = { ...episodeNotes, ...d.episodeNotes };
			if (d.notes) notes = d.notes;
			parseMultiEntryVitals();
		}
	}

	async function saveLog() {
		saving = true;
		const data: any = {
			type: 'daily_log',
			date: currentDate,
			symptoms,
			episodes,
			episodeTimes,
			episodeDurations,
			episodeNotes,
			triggers,
			vitals,
			medications,
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
		setTimeout(() => { saved = false; }, 2500);
	}

	function changeDate(delta: number) {
		const d = new Date(currentDate + 'T12:00:00');
		d.setDate(d.getDate() + delta);
		const newDate = d.toISOString().slice(0, 10);
		goto(`/log/${newDate}`, { replaceState: true });
		currentDate = newDate;
		symptoms = {};
		episodes = {};
		episodeTimes = {};
		episodeDurations = {};
		episodeNotes = {};
		triggers = {};
		vitals = {};
		medications = {};
		notes = '';
		multiEntryVitals = {};
		multiEntryNewTime = {};
		multiEntryNewValue = {};
		hasChanges = false;
		if (bp) initFromBlueprint(bp);
		loadExistingLog();
		mergeQuickCapturedEpisodes();
	}

	function goToToday() {
		const today = new Date().toISOString().slice(0, 10);
		goto(`/log/${today}`, { replaceState: true });
		currentDate = today;
		symptoms = {};
		episodes = {};
		episodeTimes = {};
		episodeDurations = {};
		episodeNotes = {};
		triggers = {};
		vitals = {};
		medications = {};
		notes = '';
		multiEntryVitals = {};
		multiEntryNewTime = {};
		multiEntryNewValue = {};
		hasChanges = false;
		if (bp) initFromBlueprint(bp);
		loadExistingLog();
		mergeQuickCapturedEpisodes();
	}

	function formatDisplayDate(dateStr: string): string {
		const d = new Date(dateStr + 'T12:00:00');
		return d.toLocaleDateString($locale, {
			weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
		});
	}

	$: isToday = currentDate === new Date().toISOString().slice(0, 10);
</script>

<svelte:window on:keydown={handleKeydown} />

{#if !bp}
	<div class="log-loading">
		<Asterisk size={32} spin color="muted" />
		<p class="log-loading-text">{$t('common.loading')}</p>
	</div>
{:else}
<div class="log-page">

	<!-- ─── Date header card ─── -->
	<div class="log-date-card">
		<div class="log-date-nav">
			<button on:click={() => changeDate(-1)} class="log-nav-btn" aria-label={$t("common.previous_day")}>
				<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
			</button>

			<div class="log-date-center">
				<span class="log-date-text">{formatDisplayDate(currentDate)}</span>
				{#if isToday}
					<span class="log-today-badge">{$t('common.today')}</span>
				{/if}
			</div>

			<button on:click={() => changeDate(1)} class="log-nav-btn" aria-label={$t("common.next_day")}>
				<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
			</button>
		</div>

		{#if !isToday}
			<button on:click={goToToday} class="log-goto-today">
				{$t('common.today')}
			</button>
		{/if}
	</div>

	<!-- ─── Copy previous day ─── -->
	{#if hasPreviousDay && !existingDoc}
		<button on:click={copyPreviousDay} class="log-copy-prev">
			<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke-width="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke-width="2"/></svg>
			{$t('protocol.copy_previous')}
		</button>
	{/if}

	<div class="log-grid">
		<!-- ─── Left column (desktop) ─── -->
		<div class="log-grid-col">
			<!-- ─── Symptoms card ─── -->
			{#if bp.symptomGroups.length > 0}
			<section class="log-card log-card--olive">
				<button class="log-section-toggle" on:click={() => toggleSection('symptoms')}>
					<h2 class="log-section-header">{$t('protocol.symptoms')}</h2>
					<svg class="log-section-chevron" class:log-section-chevron--open={!collapsed['symptoms']} width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="6,9 12,15 18,9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</button>
				{#if !collapsed['symptoms']}
				{#each bp.symptomGroups as group, gi}
					<p class="log-group-label">{$t(group.label)}</p>
					<div class="log-chip-wrap">
						{#each group.items as item}
							<button
								type="button"
								on:click={() => { symptoms[item.id] = !symptoms[item.id]; markChanged(); }}
								class="log-chip {symptoms[item.id] ? 'log-chip--olive-active' : ''}"
								aria-pressed={symptoms[item.id]}
							>
								{#if symptoms[item.id]}<svg class="log-chip-check" width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>{/if}
								{$t(item.label)}
							</button>
						{/each}
					</div>
				{/each}
				{/if}
			</section>
			{/if}

			<!-- ─── Triggers card ─── -->
			{#if bp.triggers.length > 0}
			<section class="log-card log-card--ochre">
				<button class="log-section-toggle" on:click={() => toggleSection('triggers')}>
					<h2 class="log-section-header">{$t('protocol.triggers')}</h2>
					<svg class="log-section-chevron" class:log-section-chevron--open={!collapsed['triggers']} width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="6,9 12,15 18,9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</button>
				{#if !collapsed['triggers']}
				<div class="log-chip-wrap">
					{#each bp.triggers as trig}
						<button
							type="button"
							on:click={() => { triggers[trig.id] = !triggers[trig.id]; markChanged(); }}
							class="log-chip {triggers[trig.id] ? 'log-chip--ochre-active' : ''}"
							aria-pressed={triggers[trig.id]}
						>
							{#if triggers[trig.id]}<svg class="log-chip-check" width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>{/if}
							{$t(trig.label)}
						</button>
					{/each}
				</div>
				{/if}
			</section>
			{/if}

			<!-- ─── Medications card ─── -->
			{#if bp.medications.length > 0}
				{@const standardMeds = bp.medications.filter(m => !m.asNeeded)}
				{@const asNeededMeds = bp.medications.filter(m => m.asNeeded)}
				<section class="log-card log-card--olive">
					<button class="log-section-toggle" on:click={() => toggleSection('medications')}>
						<h2 class="log-section-header">{$t('protocol.medications')}</h2>
						<svg class="log-section-chevron" class:log-section-chevron--open={!collapsed['medications']} width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="6,9 12,15 18,9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</button>
					{#if !collapsed['medications']}
					{#if standardMeds.length > 0}
						<div class="log-chip-wrap">
							{#each standardMeds as med}
								<button
									type="button"
									on:click={() => { medications[med.id] = !medications[med.id]; markChanged(); }}
									class="log-chip log-chip--med {medications[med.id] ? 'log-chip--olive-active' : ''}"
								aria-pressed={medications[med.id]}
								>
									<span class="log-chip-med-name">{med.name}</span>
									<span class="log-chip-med-dose">{med.dose}</span>
								</button>
							{/each}
						</div>
					{/if}
					{#if asNeededMeds.length > 0}
						<p class="log-group-label" style="margin-top: 16px">{$t('protocol.as_needed')}</p>
						<div class="log-chip-wrap">
							{#each asNeededMeds as med}
								<button
									type="button"
									on:click={() => { medications[med.id] = !medications[med.id]; markChanged(); }}
									class="log-chip log-chip--med {medications[med.id] ? 'log-chip--olive-active' : ''}"
								aria-pressed={medications[med.id]}
								>
									<span class="log-chip-med-name">{med.name}</span>
									<span class="log-chip-med-dose">{med.dose}</span>
								</button>
							{/each}
						</div>
					{/if}
					{/if}
				</section>
			{:else}
				<section class="log-card log-card--olive">
					<button class="log-section-toggle" on:click={() => toggleSection('medications')}>
						<h2 class="log-section-header">{$t('protocol.medications')}</h2>
						<svg class="log-section-chevron" class:log-section-chevron--open={!collapsed['medications']} width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="6,9 12,15 18,9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</button>
					{#if !collapsed['medications']}
					<p class="log-empty-hint">
						{$t('protocol.no_meds')}
						<a href="/settings" class="log-link">{$t('protocol.add_in_settings')}</a>
					</p>
					{/if}
				</section>
			{/if}
		</div>

		<!-- ─── Right column (desktop) ─── -->
		<div class="log-grid-col">
			<!-- ─── Episodes card ─── -->
			{#if bp.episodeTypes.length > 0}
			<section class="log-card log-card--red">
				<button class="log-section-toggle" on:click={() => toggleSection('episodes')}>
					<h2 class="log-section-header">{$t('protocol.episodes')}</h2>
					<svg class="log-section-chevron" class:log-section-chevron--open={!collapsed['episodes']} width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="6,9 12,15 18,9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</button>
				{#if !collapsed['episodes']}
				<div class="log-episodes">
					{#each bp.episodeTypes as ep}
						<div class="log-episode-row">
							<div class="log-episode-label">
								<span class="log-episode-dot" style="background: {ep.color}"></span>
								<span>{$t(ep.label)}</span>
							</div>
							<div class="log-counter">
								<button
									on:click={() => { if (episodes[ep.id] > 0) { episodes[ep.id]--; markChanged(); } }}
									class="log-counter-btn"
									aria-label="{$t('common.decrease')} {$t(ep.label)}"
								>
									<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12" stroke-width="2" stroke-linecap="round"/></svg>
								</button>
								<span class="log-counter-num {episodes[ep.id] > 0 ? 'log-counter-num--active' : ''}">{episodes[ep.id] || 0}</span>
								<button
									on:click={() => { episodes[ep.id] = (episodes[ep.id] || 0) + 1; markChanged(); }}
									class="log-counter-btn"
									aria-label="{$t('common.increase')} {$t(ep.label)}"
								>
									<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" stroke-width="2" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke-width="2" stroke-linecap="round"/></svg>
								</button>
							</div>
						</div>
						<!-- Duration & time-of-day (shown when count > 0 and blueprint enables it) -->
						{#if episodes[ep.id] > 0 && (ep.trackDuration || ep.trackTimeOfDay)}
							<div class="log-episode-detail">
								{#if ep.trackTimeOfDay}
									<div class="log-episode-detail-field">
										<label class="log-detail-label">{$t('protocol.time_of_day')}</label>
										<input type="time" class="log-detail-input"
											bind:value={episodeTimes[ep.id]}
											on:input={markChanged}
										/>
									</div>
								{/if}
								{#if ep.trackDuration}
									<div class="log-episode-detail-field">
										<label class="log-detail-label">{$t('protocol.duration')}</label>
										<select class="log-detail-input"
											bind:value={episodeDurations[ep.id]}
											on:change={markChanged}
										>
											{#each durationOptions as opt}
												<option value={opt.value}>{$t(opt.labelKey)}</option>
											{/each}
										</select>
									</div>
								{/if}
							</div>
						{/if}
						<!-- Per-episode notes (shown when count > 0) -->
						{#if episodes[ep.id] > 0}
							<div class="log-episode-detail" style="margin-top: 4px">
								<div class="log-episode-detail-field" style="flex: 1">
									<input
										type="text"
										class="log-detail-input"
										placeholder={$t('protocol.episode_notes')}
										bind:value={episodeNotes[ep.id]}
										on:input={markChanged}
									/>
								</div>
							</div>
						{/if}
					{/each}
				</div>
				{/if}
			</section>
			{/if}

			<!-- ─── Vitals card ─── -->
			{#if bp.vitals.length > 0}
			<section class="log-card log-card--ochre">
				<button class="log-section-toggle" on:click={() => toggleSection('vitals')}>
					<h2 class="log-section-header">{$t('protocol.vitals')}</h2>
					<svg class="log-section-chevron" class:log-section-chevron--open={!collapsed['vitals']} width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="6,9 12,15 18,9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</button>
				{#if !collapsed['vitals']}
				<div class="log-vitals-grid">
					{#each bp.vitals.filter(v => !v.multiEntry) as vital}
						<div class="log-vital">
							<label class="log-vital-label" for="vital-{vital.id}">
								{$t(vital.label)}
								{#if vital.unit}<span class="log-vital-unit">({vital.unit})</span>{/if}
							</label>
							<input
								id="vital-{vital.id}"
								type="text"
								inputmode="decimal"
								bind:value={vitals[vital.id]}
								placeholder={vital.placeholder}
								on:input={markChanged}
								class="input"
							/>
						</div>
					{/each}
				</div>

				<!-- Multi-entry vitals -->
				{#each bp.vitals.filter(v => v.multiEntry) as vital}
					<div class="log-multi-entry">
						<p class="log-vital-label" style="margin-bottom: 8px">
							{$t(vital.label)}
							{#if vital.unit}<span class="log-vital-unit">({vital.unit})</span>{/if}
						</p>

						<!-- Existing entries -->
						{#if multiEntryVitals[vital.id]?.length > 0}
							<div class="log-multi-list">
								{#each multiEntryVitals[vital.id] as entry, i}
									<div class="log-multi-item">
										<span class="log-multi-time">{entry.time || '--:--'}</span>
										<span class="log-multi-value">{entry.value} {vital.unit}</span>
										<button
											type="button"
											class="log-multi-remove"
											on:click={() => removeMultiEntry(vital.id, i)}
											aria-label={$t('vital.remove_entry')}
										>
											<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" stroke-width="2" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke-width="2" stroke-linecap="round"/></svg>
										</button>
									</div>
								{/each}
							</div>
						{/if}

						<!-- Add new entry -->
						<div class="log-multi-add">
							<input
								type="time"
								class="log-detail-input log-multi-add-time"
								bind:value={multiEntryNewTime[vital.id]}
								placeholder="--:--"
							/>
							<input
								type="text"
								inputmode="decimal"
								class="log-detail-input log-multi-add-value"
								bind:value={multiEntryNewValue[vital.id]}
								placeholder={vital.placeholder}
								on:keydown={(e) => { if (e.key === 'Enter') addMultiEntry(vital.id); }}
							/>
							<button
								type="button"
								class="log-multi-add-btn"
								on:click={() => addMultiEntry(vital.id)}
								aria-label={$t('vital.add_entry')}
							>
								<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" stroke-width="2" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke-width="2" stroke-linecap="round"/></svg>
								{$t('vital.add_entry')}
							</button>
						</div>
					</div>
				{/each}
				{/if}
			</section>
			{/if}

			<!-- ─── Notes card ─── -->
			<section class="log-card log-card--gray">
				<button class="log-section-toggle" on:click={() => toggleSection('notes')}>
					<h2 class="log-section-header">{$t('common.notes')}</h2>
					<svg class="log-section-chevron" class:log-section-chevron--open={!collapsed['notes']} width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="6,9 12,15 18,9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</button>
				{#if !collapsed['notes']}
				<textarea
					bind:value={notes}
					on:input={markChanged}
					rows="3"
					class="input log-textarea"
				></textarea>
				{/if}
			</section>
		</div>
	</div>

</div>

<!-- ─── Sticky save bar ─── -->
<div class="log-save-bar">
	<div class="log-save-inner">
		{#if existingDoc}
			{#if confirmDelete}
				<div class="log-delete-confirm">
					<span class="log-delete-text">{$t('common.confirm_delete')}</span>
					<button
						on:click={deleteLog}
						disabled={deleting}
						class="log-btn-danger"
					>{deleting ? $t('common.loading') : $t('common.yes_delete')}</button>
					<button
						on:click={() => { confirmDelete = false; }}
						class="btn-secondary log-btn-cancel"
					>{$t('common.cancel')}</button>
				</div>
			{:else}
				<button
					on:click={() => { confirmDelete = true; }}
					class="log-btn-delete"
					aria-label={$t("common.delete")}
				>
					<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3,6 5,6 21,6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</button>
				{#if saved}
						<div class="log-saved-feedback" transition:fade={{ duration: 300 }}>
							<Asterisk size={24} color="olive" />
							<span>{$t('protocol.auto_saved')}</span>
						</div>
					{:else}
						<button
							on:click={saveLog}
							disabled={saving}
							class="btn-primary log-btn-save"
						>
							{#if saving}
								<Asterisk size={18} spin color="white" />
								{$t('common.loading')}
							{:else}
								{$t('protocol.update')}
							{/if}
						</button>
					{/if}
			{/if}
		{:else}
			{#if saved}
				<div class="log-saved-feedback" transition:fade={{ duration: 300 }}>
					<Asterisk size={24} color="olive" />
					<span>{$t('protocol.auto_saved')}</span>
				</div>
			{:else}
				<button
					on:click={saveLog}
					disabled={saving}
					class="btn-primary log-btn-save log-btn-save--full"
				>
					{#if saving}
						<Asterisk size={18} spin color="white" />
						{$t('common.loading')}
					{:else}
						{$t('common.save')}
					{/if}
				</button>
			{/if}
		{/if}
	</div>
</div>
{/if}

<style>
	/* ─── Loading state ─── */
	.log-loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 48px 16px;
		gap: 12px;
	}
	.log-loading-text {
		font-size: 14px;
		color: var(--text-muted);
	}

	/* ─── Page container ─── */
	.log-page {
		max-width: 768px;
		margin: 0 auto;
		padding: 16px 16px 160px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	@media (min-width: 640px) {
		.log-page {
			padding: 20px 24px 160px;
		}
	}

	/* ─── Date header card ─── */
	.log-date-card {
		background: var(--surface-card);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}
	.log-date-nav {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		justify-content: space-between;
	}
	.log-nav-btn {
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
	}
	.log-nav-btn:hover {
		background: var(--surface-muted);
	}
	.log-nav-btn:active {
		transform: scale(0.97);
	}
	.log-date-center {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		flex: 1;
		min-width: 0;
	}
	.log-date-text {
		font-size: 16px;
		font-weight: 600;
		color: var(--text-primary);
		text-align: center;
	}
	.log-today-badge {
		display: inline-flex;
		align-items: center;
		font-size: 12px;
		font-weight: 500;
		padding: 4px 10px;
		border-radius: 9999px;
		background: var(--olive-light);
		color: var(--olive);
	}
	.log-goto-today {
		font-size: 12px;
		font-weight: 500;
		color: var(--brand);
		background: none;
		border: none;
		cursor: pointer;
		padding: 4px 8px;
		border-radius: 8px;
		transition: background 0.15s ease-out;
	}
	.log-goto-today:hover {
		background: var(--brand-light);
	}

	/* ─── Section cards ─── */
	.log-card {
		background: var(--surface-card);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 16px;
		border-left: 3px solid var(--border);
	}
	@media (min-width: 640px) {
		.log-card {
			padding: 20px;
		}
	}
	.log-card--olive {
		border-left-color: var(--olive);
	}
	.log-card--red {
		border-left-color: var(--danger);
	}
	.log-card--ochre {
		border-left-color: var(--ochre);
	}
	.log-card--gray {
		border-left-color: var(--border);
	}

	/* ─── Section headers ─── */
	.log-section-header {
		font-size: 16px;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0 0 12px;
		line-height: 1.3;
	}
	@media (min-width: 1024px) {
		.log-section-header {
			font-size: 18px;
		}
	}

	/* ─── Group label ─── */
	.log-group-label {
		font-size: 13px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
		margin: 14px 0 8px;
	}
	.log-group-label:first-of-type {
		margin-top: 0;
	}

	/* ─── Chips ─── */
	.log-chip-wrap {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
	}
	.log-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px;
		min-height: 44px;
		border-radius: 9999px;
		font-size: 14px;
		font-weight: 400;
		border: 1px solid transparent;
		cursor: pointer;
		transition: all 0.2s ease-out;
		background: var(--surface-muted);
		color: var(--text-secondary);
	}
	.log-chip:active {
		transform: scale(0.97);
	}

	/* Olive active (symptoms, medications) */
	.log-chip--olive-active {
		background: var(--olive-light);
		color: var(--olive);
		border-color: rgba(127, 130, 27, 0.25);
		font-weight: 500;
	}

	/* Ochre active (triggers) */
	.log-chip--ochre-active {
		background: var(--ochre-light);
		color: var(--ochre);
		border-color: rgba(159, 99, 11, 0.25);
		font-weight: 500;
	}

	/* Checkmark on active chips */
	.log-chip-check {
		flex-shrink: 0;
	}

	/* Copy previous day button */
	.log-copy-prev {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: 100%;
		padding: 12px;
		min-height: 44px;
		border-radius: 12px;
		border: 1px dashed var(--border);
		background: transparent;
		color: var(--text-secondary);
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease-out;
	}
	.log-copy-prev:hover {
		border-color: var(--ochre);
		color: var(--ochre);
		background: var(--ochre-light);
	}

	/* Focus visible for accessibility */
	.log-chip:focus-visible,
	.log-counter-btn:focus-visible,
	.log-nav-btn:focus-visible {
		outline: 3px solid var(--brand);
		outline-offset: 2px;
	}

	/* Medication chip variant */
	.log-chip--med {
		gap: 6px;
	}
	.log-chip-med-name {
		font-weight: 500;
	}
	.log-chip-med-dose {
		font-size: 12px;
		opacity: 0.7;
	}

	/* ─── Episodes ─── */
	.log-episodes {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.log-episode-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.log-episode-label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		font-weight: 400;
		color: var(--text-secondary);
	}
	.log-episode-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.log-counter {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.log-counter-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		border-radius: 12px;
		background: var(--surface-muted);
		color: var(--text-secondary);
		border: 1px solid var(--border-subtle);
		cursor: pointer;
		transition: all 0.15s ease-out;
	}
	.log-counter-btn:hover {
		background: var(--surface-inset);
	}
	.log-counter-btn:active {
		transform: scale(0.97);
	}
	.log-counter-num {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		font-size: 18px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--text-muted);
		text-align: center;
	}
	.log-counter-num--active {
		color: var(--ochre);
	}

	/* Episode detail (duration, time) — shown when count > 0 */
	.log-episode-detail {
		display: flex;
		gap: 12px;
		padding: 8px 0 4px 18px;
		border-left: 2px solid var(--border-subtle);
		margin-left: 4px;
	}
	.log-episode-detail-field {
		flex: 1;
	}
	.log-detail-label {
		display: block;
		font-size: 11px;
		font-weight: 500;
		color: var(--text-muted);
		margin-bottom: 4px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.log-detail-input {
		width: 100%;
		padding: 8px 10px;
		min-height: 40px;
		border-radius: 8px;
		border: 1px solid var(--border);
		background: var(--surface-muted);
		font-size: 14px;
		color: var(--text-primary);
		outline: none;
		transition: border-color 0.15s ease-out;
	}
	.log-detail-input:focus {
		border-color: var(--brand);
	}

	/* ─── Vitals ─── */
	.log-vitals-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 12px;
	}
	@media (min-width: 640px) {
		.log-vitals-grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}
	.log-vital {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.log-vital-label {
		font-size: 12px;
		font-weight: 500;
		color: var(--ochre);
		display: block;
	}
	.log-vital-unit {
		font-weight: 400;
		color: var(--text-muted);
	}

	/* ─── Notes ─── */
	.log-textarea {
		resize: vertical;
		min-height: 80px;
		font-size: 16px; /* Prevents iOS auto-zoom */
	}

	/* ─── Empty hint ─── */
	.log-empty-hint {
		font-size: 14px;
		color: var(--text-muted);
	}
	.log-link {
		color: var(--brand);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.log-link:hover {
		color: var(--brand-hover);
	}

	/* ─── Save bar ─── */
	.log-save-bar {
		position: fixed;
		bottom: calc(4rem + env(safe-area-inset-bottom, 0px));
		left: 0;
		right: 0;
		z-index: 30;
		padding: 0 16px 8px;
		background: linear-gradient(to top, rgba(250, 248, 246, 0.95) 70%, rgba(250, 248, 246, 0) 100%);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
	}
	.log-save-inner {
		max-width: 768px;
		margin: 0 auto;
		display: flex;
		gap: 8px;
	}
	.log-btn-save {
		flex: 1;
		padding: 14px 20px;
		font-size: 14px;
		font-weight: 600;
	}
	.log-btn-save--full {
		width: 100%;
	}
	.log-btn-delete {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 48px;
		min-height: 48px;
		border-radius: 12px;
		background: var(--surface-card);
		border: 1px solid rgba(220, 38, 38, 0.25);
		color: var(--danger);
		cursor: pointer;
		transition: all 0.15s ease-out;
	}
	.log-btn-delete:hover {
		background: rgba(220, 38, 38, 0.05);
	}
	.log-btn-delete:active {
		transform: scale(0.97);
	}

	/* Delete confirmation */
	.log-delete-confirm {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		background: var(--surface-card);
		border: 1px solid rgba(220, 38, 38, 0.2);
		border-radius: 12px;
		padding: 12px;
	}
	.log-delete-text {
		flex: 1;
		font-size: 14px;
		font-weight: 500;
		color: var(--danger);
	}
	.log-btn-danger {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 8px 16px;
		min-height: 44px;
		border-radius: 12px;
		font-size: 14px;
		font-weight: 500;
		background: var(--danger);
		color: white;
		border: none;
		cursor: pointer;
		transition: all 0.15s ease-out;
	}
	.log-btn-danger:hover {
		background: #b91c1c;
	}
	.log-btn-danger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.log-btn-cancel {
		padding: 8px 16px;
		font-size: 14px;
	}

	/* ─── 2-column grid (desktop) ─── */
	.log-grid {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.log-grid-col {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	@media (min-width: 1024px) {
		.log-page {
			max-width: 1024px;
		}
		.log-grid {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 16px;
		}
	}

	/* ─── Collapsible section toggle ─── */
	.log-section-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		min-height: 44px;
	}
	.log-section-toggle .log-section-header {
		margin: 0;
	}
	.log-section-chevron {
		transition: transform 0.2s ease-out;
		color: var(--text-muted);
		flex-shrink: 0;
	}
	.log-section-chevron--open {
		transform: rotate(180deg);
	}

	/* ─── Multi-entry vitals ─── */
	.log-multi-entry {
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--border-subtle);
	}
	.log-multi-entry:first-of-type {
		margin-top: 0;
		padding-top: 0;
		border-top: none;
	}
	.log-multi-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 8px;
	}
	.log-multi-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		border-radius: 8px;
		background: var(--surface-muted);
		font-size: 14px;
	}
	.log-multi-time {
		font-size: 12px;
		font-weight: 500;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
		min-width: 44px;
	}
	.log-multi-value {
		flex: 1;
		font-weight: 600;
		color: var(--ochre);
		font-variant-numeric: tabular-nums;
	}
	.log-multi-remove {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 6px;
		border: none;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		transition: all 0.15s ease-out;
	}
	.log-multi-remove:hover {
		background: rgba(220, 38, 38, 0.1);
		color: var(--danger);
	}
	.log-multi-add {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.log-multi-add-time {
		width: 100px;
		flex-shrink: 0;
	}
	.log-multi-add-value {
		flex: 1;
		min-width: 60px;
	}
	.log-multi-add-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 8px 12px;
		min-height: 40px;
		border-radius: 8px;
		border: 1px solid var(--border);
		background: var(--surface-card);
		color: var(--olive);
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.15s ease-out;
	}
	.log-multi-add-btn:hover {
		background: var(--olive-light);
		border-color: var(--olive);
	}
	.log-multi-add-btn:active {
		transform: scale(0.97);
	}

	/* ─── Save feedback animation ─── */
	.log-saved-feedback {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 12px;
		width: 100%;
		font-size: 14px;
		font-weight: 500;
		color: var(--olive);
		animation: savedPulse 0.5s ease-out;
	}
	@keyframes savedPulse {
		0% { transform: scale(0.95); opacity: 0; }
		50% { transform: scale(1.02); }
		100% { transform: scale(1); opacity: 1; }
	}
</style>
