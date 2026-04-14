<script lang="ts">
	import { t, locale, translateUnit } from '$lib/i18n';
	import { isAuthenticated } from '$lib/stores/auth';
	import { documents, type CiphraDocument } from '$lib/stores/documents';
	import { blueprint } from '$lib/blueprint';
	import type { Blueprint } from '$lib/blueprint';
	import { onMount, onDestroy, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Asterisk from '$lib/components/Asterisk.svelte';
	import { fade } from 'svelte/transition';

	let collapsed: Record<string, boolean> = {};
	function toggleSection(id: string) { collapsed[id] = !collapsed[id]; }

	// CIPH-420b — Section-jump nav (mobile)
	const sectionIds = ['symptoms', 'episodes', 'vitals', 'triggers', 'notes'];
	let activeSection = 'symptoms';
	let sectionObserver: IntersectionObserver | null = null;

	function setupSectionObserver() {
		if (typeof IntersectionObserver === 'undefined') return;
		if (sectionObserver) sectionObserver.disconnect();
		const visibleMap: Record<string, boolean> = {};
		sectionObserver = new IntersectionObserver((entries) => {
			for (const entry of entries) {
				const id = (entry.target as HTMLElement).id.replace('section-', '');
				visibleMap[id] = entry.isIntersecting;
			}
			// Pick first section in document order that is currently intersecting
			for (const id of sectionIds) {
				if (visibleMap[id]) { activeSection = id; break; }
			}
		}, { threshold: 0, rootMargin: '-80px 0px -50% 0px' });
		for (const id of sectionIds) {
			const el = document.getElementById(`section-${id}`);
			if (el) sectionObserver.observe(el);
		}
	}

	onDestroy(() => {
		if (sectionObserver) sectionObserver.disconnect();
	});

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
	// CIPH-713 — per-entry private flag. When true, this entry is hard-
	// excluded from every export (PDF/CSV/reports/share) via isExportable().
	let isPrivate = false;

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
		const prevDoc = $documents.find(d => d.data.type === 'entry' && d.data.date === prevStr);
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
		return d.data.type === 'entry' && d.data.date === prev.toISOString().slice(0, 10);
	});

	$: bp = $blueprint;

	$: if (bp) {
		initFromBlueprint(bp);
	}

	// CIPH-301b — Customization filter sets. Empty when blueprint has no
	// customizations field (pre-301b blueprints), so behavior is identical
	// to before for existing users.
	$: hiddenSymptomIds = new Set(bp?.customizations?.hiddenSymptoms || []);
	$: hiddenTriggerIds = new Set(bp?.customizations?.hiddenTriggers || []);
	$: hiddenVitalIds = new Set(bp?.customizations?.hiddenVitals || []);

	// Filtered views the template iterates over, so we don't have to thread
	// the filter into every {#each} block.
	$: visibleSymptomGroups = bp
		? bp.symptomGroups
			.map((g) => ({ ...g, items: g.items.filter((it) => !hiddenSymptomIds.has(it.id)) }))
			.filter((g) => g.items.length > 0)
		: [];
	$: visibleTriggers = bp ? bp.triggers.filter((tr) => !hiddenTriggerIds.has(tr.id)) : [];
	$: visibleVitals = bp ? bp.vitals.filter((v) => !hiddenVitalIds.has(v.id)) : [];

	// Group multi-entry vitals by pairLabel for side-by-side rendering
	$: pairedMultiEntryGroups = (() => {
		if (!bp) return [];
		const multi = visibleVitals.filter(v => v.multiEntry);
		const byPair = new Map<string, typeof multi>();
		for (const v of multi) {
			if (!v.pairLabel) continue;
			const arr = byPair.get(v.pairLabel) || [];
			arr.push(v);
			byPair.set(v.pairLabel, arr);
		}
		return Array.from(byPair.values()).filter(g => g.length === 2);
	})();
	$: unpairedMultiEntryVitals = bp ? visibleVitals.filter(v => v.multiEntry && !v.pairLabel) : [];

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

	$: existingDoc = $documents.find(d => d.data.type === 'entry' && d.data.date === currentDate) || null;

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
			tick().then(() => setupSectionObserver());
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
		const existing = $documents.find(d => d.data.type === 'entry' && d.data.date === currentDate);
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
			isPrivate = d.private === true;
			parseMultiEntryVitals();
		}
	}

	async function saveLog() {
		saving = true;
		const data: any = {
			type: 'entry',
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
			private: isPrivate || undefined,
		};

		const existing = $documents.find(d => d.data.type === 'entry' && d.data.date === currentDate);
		// Detect "this is the very first daily_log" BEFORE the save completes,
		// so we can fire a one-time onboarding event (CIPH-103) pointing the
		// user at the quick-add FAB / event-line feature.
		const priorDailyLogCount = $documents.filter(d => d.data.type === 'entry').length;
		const wasFirstDailyLog = !existing && priorDailyLogCount === 0;
		if (existing) {
			await documents.updateDoc(existing.id, data);
		} else {
			await documents.save(data);
		}
		saving = false;
		saved = true;
		if (wasFirstDailyLog && typeof window !== 'undefined') {
			try {
				if (localStorage.getItem('ciphra_event_line_tooltip_seen') !== 'true') {
					window.dispatchEvent(new CustomEvent('ciphra:first-daily-log'));
				}
			} catch {}
		}
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
		isPrivate = false;
		multiEntryVitals = {};
		multiEntryNewTime = {};
		multiEntryNewValue = {};
		hasChanges = false;
		if (bp) initFromBlueprint(bp);
		loadExistingLog();
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
		isPrivate = false;
		multiEntryVitals = {};
		multiEntryNewTime = {};
		multiEntryNewValue = {};
		hasChanges = false;
		if (bp) initFromBlueprint(bp);
		loadExistingLog();
	}

	function formatDisplayDate(dateStr: string): string {
		const d = new Date(dateStr + 'T12:00:00');
		return d.toLocaleDateString($locale, {
			weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
		});
	}

	$: isToday = currentDate === new Date().toISOString().slice(0, 10);

	/* ─── CIPH-302: Incomplete-entry CTA ───
	 * Look at the last 30 daily_log docs the user has authored. Any vital or
	 * trigger field filled in >50% of those days is "typical for this user".
	 * If today's log is missing any of them, surface chip buttons to nudge
	 * the user to fill them. Skipped for the first 3 days of use (not enough
	 * signal; nudging an empty baseline produces noise).
	 */
	type MissingField = { kind: 'vital' | 'trigger'; id: string; label: string; anchor: string };

	function hasVitalValue(doc: any, vid: string): boolean {
		const raw = doc?.data?.vitals?.[vid];
		if (!raw) return false;
		// Multi-entry vitals store JSON arrays; an empty array counts as missing.
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) return parsed.length > 0;
		} catch { /* single value */ }
		return String(raw).trim() !== '';
	}
	function hasTrigger(doc: any, tid: string): boolean {
		const trs = doc?.data?.triggers;
		if (!trs) return false;
		if (Array.isArray(trs)) return trs.includes(tid);
		return !!trs[tid];
	}

	$: typicalFields = (() => {
		if (!bp) return [] as { kind: 'vital' | 'trigger'; id: string; label: string }[];
		const logs = $documents
			.filter((d) => d.data.type === 'entry' && d.data.date !== currentDate)
			.sort((a, b) => String(b.data.date).localeCompare(String(a.data.date)))
			.slice(0, 30);
		if (logs.length < 3) return [];
		const threshold = logs.length * 0.5;
		const out: { kind: 'vital' | 'trigger'; id: string; label: string }[] = [];
		for (const v of bp.vitals) {
			const hits = logs.filter((d) => hasVitalValue(d, v.id)).length;
			if (hits > threshold) out.push({ kind: 'vital', id: v.id, label: $t(v.label) });
		}
		for (const tr of bp.triggers) {
			const hits = logs.filter((d) => hasTrigger(d, tr.id)).length;
			if (hits > threshold) out.push({ kind: 'trigger', id: tr.id, label: $t(tr.label) });
		}
		return out;
	})();

	$: incompleteFields = (() => {
		if (!isToday || typicalFields.length === 0) return [] as MissingField[];
		const out: MissingField[] = [];
		for (const tf of typicalFields) {
			if (tf.kind === 'vital') {
				const raw = vitals[tf.id];
				const me = multiEntryVitals[tf.id];
				const filled = (raw && String(raw).trim() !== '' && !(me && me.length === 0))
					|| (me && me.length > 0);
				if (!filled) out.push({ kind: 'vital', id: tf.id, label: tf.label, anchor: `vital-${tf.id}` });
			} else {
				if (!triggers[tf.id]) out.push({ kind: 'trigger', id: tf.id, label: tf.label, anchor: `trigger-${tf.id}` });
			}
		}
		return out;
	})();

	function jumpToField(kind: 'vital' | 'trigger', id: string) {
		// Open the right section if collapsed, then scroll to the field.
		if (kind === 'vital') collapsed['vitals'] = false;
		else collapsed['triggers'] = false;
		collapsed = collapsed;
		tick().then(() => {
			const el = document.getElementById(kind === 'vital' ? `vital-${id}` : `trigger-${id}`);
			if (el) {
				el.scrollIntoView({ behavior: 'smooth', block: 'center' });
				try { (el as HTMLElement).focus({ preventScroll: true }); } catch { /* non-focusable */ }
			}
		});
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if !bp}
	<div class="log-loading">
		<Asterisk size={32} spin color="muted" />
		<p class="log-loading-text">{$t('common.loading')}</p>
	</div>
{:else}
<div class="log-page">

	<!-- ─── Sticky section-jump chip bar (mobile only) — CIPH-420b ─── -->
	<nav class="log-section-nav md:hidden" aria-label={$t('protocol.symptoms')}>
		<div class="log-section-nav-scroll">
			{#each sectionIds as sid}
				<a
					href="#section-{sid}"
					class="log-section-chip {activeSection === sid ? 'log-section-chip--active' : ''}"
					aria-current={activeSection === sid ? 'true' : undefined}
				>{$t(`nav_section.${sid}`)}</a>
			{/each}
		</div>
	</nav>

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
				<!-- CIPH-713 — per-entry private toggle. Locked entries are
					 hard-excluded from every export (PDF/CSV/reports/share). -->
				<button
					type="button"
					on:click={() => { isPrivate = !isPrivate; markChanged(); }}
					class="ml-2 inline-flex items-center justify-center gap-1 px-2 h-8 rounded-full transition-colors text-xs"
					style="background: {isPrivate ? 'var(--surface-muted)' : 'transparent'}; color: {isPrivate ? 'var(--text-primary)' : 'var(--text-muted)'}"
					aria-pressed={isPrivate}
					aria-label={$t('private.label')}
					title={isPrivate ? $t('private.tooltip') : $t('private.toggle_make_private')}
				>
					{#if isPrivate}
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<rect x="4" y="11" width="16" height="10" rx="2" />
							<path d="M8 11V7a4 4 0 1 1 8 0v4" />
						</svg>
					{:else}
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<rect x="4" y="11" width="16" height="10" rx="2" />
							<path d="M8 11V7a4 4 0 0 1 7 1" />
						</svg>
					{/if}
					<span>{$t('private.label')}</span>
				</button>
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
			{#if visibleSymptomGroups.length > 0}
			<section id="section-symptoms" class="log-card log-card--olive">
				<button class="log-section-toggle" on:click={() => toggleSection('symptoms')}>
					<h2 class="log-section-header">{$t('protocol.symptoms')}</h2>
					<svg class="log-section-chevron" class:log-section-chevron--open={!collapsed['symptoms']} width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="6,9 12,15 18,9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</button>
				{#if !collapsed['symptoms']}
				{#each visibleSymptomGroups as group, gi}
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
			{#if visibleTriggers.length > 0}
			<section id="section-triggers" class="log-card log-card--ochre">
				<button class="log-section-toggle" on:click={() => toggleSection('triggers')}>
					<h2 class="log-section-header">{$t('protocol.triggers')}</h2>
					<svg class="log-section-chevron" class:log-section-chevron--open={!collapsed['triggers']} width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="6,9 12,15 18,9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</button>
				{#if !collapsed['triggers']}
				<div class="log-chip-wrap">
					{#each visibleTriggers as trig}
						<button
							type="button"
							id="trigger-{trig.id}"
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
			{/if}
			<!-- The empty-state medication card was dropping the user into a
			     dead end (linked to /settings, where medication management does
			     not exist yet). Hidden until the medication editor ships —
			     see CIPH-411 in the design backlog. -->
		</div>

		<!-- ─── Right column (desktop) ─── -->
		<div class="log-grid-col">
			<!-- ─── Episodes card ─── -->
			{#if bp.episodeTypes.length > 0}
			<section id="section-episodes" class="log-card log-card--red">
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
							{#if ep.multiDay}
								<button
									type="button"
									class="log-multiday-toggle {episodes[ep.id] > 0 ? 'log-multiday-toggle--on' : ''}"
									on:click={() => { episodes[ep.id] = episodes[ep.id] > 0 ? 0 : 1; markChanged(); }}
									aria-pressed={episodes[ep.id] > 0}
								>
									{episodes[ep.id] > 0 ? $t('protocol.ongoing_today') : $t('protocol.mark_ongoing')}
								</button>
							{:else}
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
							{/if}
						</div>
						<!-- Duration & time-of-day (shown when count > 0 and blueprint enables it) -->
						{#if episodes[ep.id] > 0 && (ep.trackDuration || ep.trackTimeOfDay)}
							<div class="log-episode-detail">
								{#if ep.trackTimeOfDay}
									<div class="log-episode-detail-field">
										<label class="log-detail-label" for="ep-time-{ep.id}">{$t('protocol.time_of_day')}</label>
										<input type="time" id="ep-time-{ep.id}" class="log-detail-input"
											bind:value={episodeTimes[ep.id]}
											on:input={markChanged}
										/>
									</div>
								{/if}
								{#if ep.trackDuration}
									<div class="log-episode-detail-field">
										<label class="log-detail-label" for="ep-dur-{ep.id}">{$t('protocol.duration')}</label>
										<select id="ep-dur-{ep.id}" class="log-detail-input"
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
			{#if visibleVitals.length > 0}
			<section id="section-vitals" class="log-card log-card--ochre">
				<button class="log-section-toggle" on:click={() => toggleSection('vitals')}>
					<h2 class="log-section-header">{$t('protocol.vitals')}</h2>
					<svg class="log-section-chevron" class:log-section-chevron--open={!collapsed['vitals']} width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="6,9 12,15 18,9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</button>
				{#if !collapsed['vitals']}
				<div class="log-vitals-grid">
					{#each visibleVitals.filter(v => !v.multiEntry) as vital}
						<div class="log-vital">
							<label class="log-vital-label" for="vital-{vital.id}">
								{$t(vital.label)}
								{#if vital.unit}<span class="log-vital-unit">({translateUnit($t, vital.unit)})</span>{/if}
							</label>
							{#if vital.min !== undefined && vital.max !== undefined}
								<input
									id="vital-{vital.id}"
									type="number"
									min={vital.min}
									max={vital.max}
									step="1"
									bind:value={vitals[vital.id]}
									placeholder={vital.placeholder}
									on:input={markChanged}
									class="input"
								/>
							{:else}
								<input
									id="vital-{vital.id}"
									type="text"
									inputmode="decimal"
									bind:value={vitals[vital.id]}
									placeholder={vital.placeholder}
									on:input={markChanged}
									class="input"
								/>
							{/if}
						</div>
					{/each}
				</div>

				<!-- Multi-entry vitals — paired vitals (same pairLabel) render side-by-side -->
				{#each pairedMultiEntryGroups as group}
					{#if group.length === 2}
						<div class="log-paired-vitals">
							{#each group as vital}
								{@const pairTitle = vital.pairLabel ? $t(`vital.pair_${vital.pairLabel}`) : ''}
								<div class="log-multi-entry log-multi-entry--paired">
									<p class="log-vital-label" style="margin-bottom: 8px">
										{$t(vital.label)}
										{#if vital.unit}<span class="log-vital-unit">({translateUnit($t, vital.unit)})</span>{/if}
									</p>
									{#if multiEntryVitals[vital.id]?.length > 0}
										<div class="log-multi-list">
											{#each multiEntryVitals[vital.id] as entry, i}
												<div class="log-multi-item">
													<span class="log-multi-time">{entry.time || '--:--'}</span>
													<span class="log-multi-value">{entry.value} {translateUnit($t, vital.unit)}</span>
													<button type="button" class="log-multi-remove"
														on:click={() => removeMultiEntry(vital.id, i)}
														aria-label={$t('vital.remove_entry')}>
														<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" stroke-width="2" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke-width="2" stroke-linecap="round"/></svg>
													</button>
												</div>
											{/each}
										</div>
									{/if}
									<div class="log-multi-add">
										<input type="time" class="log-detail-input log-multi-add-time"
											bind:value={multiEntryNewTime[vital.id]} placeholder="--:--" />
										<input type="text" inputmode="decimal" class="log-detail-input log-multi-add-value"
											bind:value={multiEntryNewValue[vital.id]} placeholder={vital.placeholder}
											on:keydown={(e) => { if (e.key === 'Enter') addMultiEntry(vital.id); }} />
										<button type="button" class="log-multi-add-btn"
											on:click={() => addMultiEntry(vital.id)}
											aria-label={$t('vital.add_entry')}>
											<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" stroke-width="2" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke-width="2" stroke-linecap="round"/></svg>
										</button>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				{/each}

				<!-- Multi-entry vitals — unpaired -->
				{#each unpairedMultiEntryVitals as vital}
					<div class="log-multi-entry">
						<p class="log-vital-label" style="margin-bottom: 8px">
							{$t(vital.label)}
							{#if vital.unit}<span class="log-vital-unit">({translateUnit($t, vital.unit)})</span>{/if}
						</p>

						<!-- Existing entries -->
						{#if multiEntryVitals[vital.id]?.length > 0}
							<div class="log-multi-list">
								{#each multiEntryVitals[vital.id] as entry, i}
									<div class="log-multi-item">
										<span class="log-multi-time">{entry.time || '--:--'}</span>
										<span class="log-multi-value">{entry.value} {translateUnit($t, vital.unit)}</span>
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
			<section id="section-notes" class="log-card log-card--gray">
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

	<!-- CIPH-302 — Incomplete-entry CTA (today only, after ≥3 days history) -->
	{#if incompleteFields.length > 0}
		<section class="log-incomplete-cta" aria-label={$t('log.incomplete_cta_title')}>
			<p class="log-incomplete-title">{$t('log.incomplete_cta_title')}</p>
			<div class="log-incomplete-chips">
				<span class="log-incomplete-prefix">{$t('log.incomplete_cta_chip_prefix')}</span>
				{#each incompleteFields as f}
					<button type="button" class="log-incomplete-chip" on:click={() => jumpToField(f.kind, f.id)}>
						{f.label}
					</button>
				{/each}
			</div>
		</section>
	{/if}

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
							<Asterisk size={24} mode="saved" color="olive" />
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
	/* ─── Section-jump nav (mobile) — CIPH-420b ─── */
	.log-section-nav {
		position: sticky;
		top: 56px; /* matches Tailwind top-14 = 3.5rem */
		z-index: 30;
		margin: -16px -16px 0;
		padding: 8px 0;
		background: var(--surface, #fff);
		border-bottom: 1px solid var(--border, #e5e5e0);
		backdrop-filter: blur(8px);
	}
	.log-section-nav-scroll {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		padding: 0 16px;
		scrollbar-width: none;
		-webkit-overflow-scrolling: touch;
	}
	.log-section-nav-scroll::-webkit-scrollbar { display: none; }
	.log-section-chip {
		flex-shrink: 0;
		padding: 6px 14px;
		border-radius: 999px;
		font-size: 13px;
		font-weight: 500;
		color: var(--text-muted, #888);
		background: var(--surface-muted, #f4f4f0);
		border: 1px solid transparent;
		text-decoration: none;
		scroll-margin: 8px;
		transition: color 0.15s, background 0.15s, border-color 0.15s;
	}
	.log-section-chip--active {
		color: var(--brand, #b04b2f);
		font-weight: 700;
		background: var(--surface, #fff);
		border-color: var(--brand, #b04b2f);
	}
	@media (min-width: 768px) {
		.log-section-nav { display: none; }
	}

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
		/* CIPH-203b — was #b91c1c (semantic destructive hover). Use brand-hover
		   style: a slightly darker tint of --danger via overlay shadow. */
		background: var(--danger);
		filter: brightness(0.88);
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

	/* ─── Paired vitals (e.g. left/right IOP) ─── */
	.log-paired-vitals {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		margin-top: 12px;
	}
	.log-multi-entry--paired {
		margin-top: 0;
	}
	@media (max-width: 480px) {
		.log-paired-vitals { grid-template-columns: 1fr; }
	}

	/* ─── Multi-day episode toggle ─── */
	.log-multiday-toggle {
		min-height: 44px;
		padding: 6px 14px;
		border-radius: 999px;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-secondary);
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
	}
	.log-multiday-toggle--on {
		background: var(--danger);
		border-color: var(--danger);
		color: white;
	}
	.log-multiday-toggle:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
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

	/* ─── CIPH-302 Incomplete-entry CTA ─── */
	.log-incomplete-cta {
		background: var(--ochre-light, rgba(159, 99, 11, 0.06));
		border: 1px solid var(--ochre, #9f630b);
		border-radius: 12px;
		padding: 14px 16px;
	}
	.log-incomplete-title {
		font-size: 13px;
		font-weight: 500;
		color: var(--text-primary);
		margin: 0 0 10px 0;
		line-height: 1.4;
	}
	.log-incomplete-chips {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.log-incomplete-prefix {
		font-size: 12px;
		color: var(--text-muted);
		font-weight: 500;
	}
	.log-incomplete-chip {
		font-size: 13px;
		font-weight: 500;
		padding: 6px 12px;
		min-height: 36px;
		border-radius: 999px;
		background: var(--surface-card);
		border: 1px solid var(--ochre, #9f630b);
		color: var(--ochre, #9f630b);
		cursor: pointer;
		transition: background 0.15s ease-out;
	}
	.log-incomplete-chip:hover {
		background: var(--ochre-light, rgba(159, 99, 11, 0.1));
	}
</style>
