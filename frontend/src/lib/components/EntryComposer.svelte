<!-- CIPH-850 — full-form entry surface used by /log/[date]. The route is a
	 thin auth + URL + CRUD adapter that wraps this primitive in {#key date}
	 so every date change is a fresh instance (auto-cancels in-flight save
	 timers, resets form state). Reserved density="quick" for PI v13 FAB
	 quick-add consolidation. -->
<!-- primitive-exempt: ConfirmDelete — uses a full-width red-tinted *banner*
	 form ("Delete this entry?" + Yes / Cancel) styled by per-page
	 `.log-delete-confirm`/`.log-btn-danger`/`.log-btn-cancel` CSS. The
	 ConfirmDelete primitive renders the compact icon-pair used on journal +
	 calendar rows; merging the two variants would regress this surface's
	 visual. Candidate for a future banner-variant addition. -->
<script context="module" lang="ts">
	import type { Phase as CyclePhase } from '$lib/cycleState';

	export type EntryData = {
		type: 'entry';
		date: string;
		symptoms: Record<string, boolean>;
		episodes: Record<string, number>;
		episodeTimes: Record<string, string>;
		episodeDurations: Record<string, string>;
		episodeNotes: Record<string, string>;
		triggers: Record<string, boolean>;
		vitals: Record<string, string>;
		medications: Record<string, boolean>;
		// CIPH — scheduled (non-asNeeded) meds the user marked MISSED this day.
		// Assume-taken model: daily meds need no per-day "taken" tap; we record
		// only the exceptions. As-needed meds stay in `medications`.
		missedMedications?: string[];
		notes: string;
		private?: true;
		// CIPH-886 — per-day phase override for the cycle cohort. When present,
		// calendar.dayPhase() prefers it over the derived phase. Undefined =
		// "Automatisch" (use derivation).
		phaseOverride?: CyclePhase;
	};
</script>

<script lang="ts">
	import { t, locale, translateUnit } from '$lib/i18n';
	import type { Blueprint, CustomKind, MedicationSlot } from '$lib/blueprint';
	import { isCustomItem, blueprint } from '$lib/blueprint';
	import { get } from 'svelte/store';
	import CustomItemModal from '$lib/components/CustomItemModal.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import type { CiphraDocument } from '$lib/stores/documents';
	import { cohortOf } from '$lib/blueprint/cohort';
	import type { Phase } from '$lib/cycleState';
	import { onMount, onDestroy, tick } from 'svelte';
	import Asterisk from '$lib/components/Asterisk.svelte';
	import TimePicker from '$lib/components/TimePicker.svelte';
	import { fade } from 'svelte/transition';

	export let date: string;
	export let bp: Blueprint;
	export let existingDoc: CiphraDocument | null;
	export let previousDoc: CiphraDocument | null;
	export let isToday: boolean;
	export let onSave: (data: EntryData) => Promise<void>;
	export let onDelete: () => Promise<void>;
	export let onDateChange: (delta: number) => void;
	export let onJumpToToday: () => void;
	// `density` prop is reserved for PI v13 FAB quick-add consolidation.
	// Re-add as `export let density: 'detail' | 'quick' = 'detail'` and
	// branch the template when the second mode lands.

	let collapsed: Record<string, boolean> = {};
	function toggleSection(id: string) { collapsed[id] = !collapsed[id]; }

	// Inline "add a new symptom / trigger" from the entry screen (the common
	// need: you're logging and the item you want isn't in your set yet). Adds it
	// to the blueprint's customizations (APPEND — never a destructive replace),
	// persists, and pre-selects it for the entry you're composing. The new item
	// renders via the reactive `bp` ($resolvedBlueprint) prop.
	let customModalOpen = false;
	let customModalKind: CustomKind = 'symptom';
	function openInlineCustom(kind: CustomKind) { customModalKind = kind; customModalOpen = true; }
	async function handleInlineCustomSave(
		e: CustomEvent<{ kind: CustomKind; item: { id: string } }>,
	) {
		const { kind, item } = e.detail;
		if (kind !== 'symptom' && kind !== 'trigger') { customModalOpen = false; return; }
		const raw = get(blueprint);
		if (!raw) { customModalOpen = false; return; }
		const next: Blueprint = JSON.parse(JSON.stringify(raw));
		const cz = next.customizations || (next.customizations = {});
		const arrKey = kind === 'symptom' ? 'customSymptoms' : 'customTriggers';
		const arr = ((cz as Record<string, { id: string }[]>)[arrKey] ||= []);
		if (!arr.some((x) => x.id === item.id)) arr.push(item);
		await blueprint.save(next);
		// Pre-select the freshly added item for the entry being composed.
		if (kind === 'symptom') symptoms = { ...symptoms, [item.id]: true };
		else triggers = { ...triggers, [item.id]: true };
		markChanged();
		customModalOpen = false;
	}

	// Inline "add a new medication" from the entry screen. Same append-only
	// semantics: a new MedicationSlot is pushed onto blueprint.medications,
	// persisted, and selected for the current entry.
	let medAddOpen = false;
	let newMedName = '';
	let newMedDose = '';
	let newMedSchedule = '';
	let newMedAsNeeded = false;
	function openAddMed() {
		newMedName = ''; newMedDose = ''; newMedSchedule = ''; newMedAsNeeded = false;
		medAddOpen = true;
	}
	function newMedId(): string {
		try {
			if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
		} catch { /* fallthrough */ }
		return `med-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
	}
	async function handleAddMed() {
		const name = newMedName.trim();
		const dose = newMedDose.trim();
		if (!name || !dose) return;
		const raw = get(blueprint);
		if (!raw) { medAddOpen = false; return; }
		const next: Blueprint = JSON.parse(JSON.stringify(raw));
		const med: MedicationSlot = { id: newMedId(), name, dose, schedule: newMedSchedule.trim(), asNeeded: newMedAsNeeded };
		(next.medications ||= []).push(med);
		await blueprint.save(next);
		medications = { ...medications, [med.id]: true };
		markChanged();
		medAddOpen = false;
	}

	// CIPH-420b — Section-jump nav (mobile).
	// CIPH-904 — `medications` and `phaseOverride` were missing from the
	// chip bar; medications had been added without updating this constant
	// since CIPH-411b, and phaseOverride since CIPH-886. Cycle-cohort users
	// who needed to override phase had to scroll past 4 cards to find it.
	// Now driven reactively by the blueprint so a cohort with no
	// medications doesn't render a dead chip pointing to nowhere.
	$: sectionIds = (() => {
		const ids: string[] = [];
		if (visibleSymptomGroups.length > 0) ids.push('symptoms');
		if (bp.episodeTypes.length > 0) ids.push('episodes');
		if (visibleVitals.length > 0) ids.push('vitals');
		if (bp.medications.length > 0) ids.push('medications');
		if (visibleTriggers.length > 0) ids.push('triggers');
		if (showPhaseOverride) ids.push('phaseOverride');
		ids.push('notes');
		return ids;
	})();
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
			saveEntry();
		}
		if (e.key === 'ArrowLeft') onDateChange(-1);
		if (e.key === 'ArrowRight') onDateChange(1);
	}

	let saving = false;
	let saved = false;
	let confirmDelete = false;
	let deleting = false;
	// CIPH-905 — autosave removed. The 3 s debounced background save
	// hid the "saved vs not saved" state from users who couldn't tell
	// when they were "done." The Save button is now the explicit
	// contract; `hasChanges` drives its enabled/disabled state.
	let hasChanges = false;
	// CIPH-904 — Persistent save timestamp. The 2.5 s saved-flash gave
	// users no signal that the form was still saved after the asterisk
	// pulse faded. Now we keep the time visible until the user starts
	// editing again (or until we get a fresher save). Initialised from
	// `existingDoc.serverCreatedAt` on mount; updated on each save.
	let lastSavedAt: Date | null = null;

	let symptoms: Record<string, boolean> = {};
	let episodes: Record<string, number> = {};
	let episodeTimes: Record<string, string> = {};
	let episodeDurations: Record<string, string> = {};
	let episodeNotes: Record<string, string> = {};
	let triggers: Record<string, boolean> = {};
	let vitals: Record<string, string> = {};
	let medications: Record<string, boolean> = {};
	// Scheduled meds marked as missed today (assume-taken model). Default {}
	// = nothing missed = all scheduled doses assumed taken.
	let missedMeds: Record<string, boolean> = {};
	let notes = '';
	// CIPH-713 — per-entry private flag. When true, this entry is hard-
	// excluded from every export (PDF/CSV/reports/share) via isExportable().
	let isPrivate = false;
	// CIPH-886 — phase override (cycle cohort). Empty string means "Automatisch"
	// (use derivation). Stored on the doc as `phaseOverride: Phase | undefined`.
	let phaseOverride: Phase | '' = '';
	const PHASES_FOR_OVERRIDE: Phase[] = ['menstrual', 'follicular', 'ovulation', 'luteal'];
	$: cohort = cohortOf(bp);
	$: showPhaseOverride = cohort === 'cycle';

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

	function markChanged() {
		// CIPH-905 — autosave removed. This now only flips the dirty
		// flag; users save explicitly via the save bar. The persistent
		// "Gespeichert · 14:32" stamp + the Save button's enabled state
		// are the affordances that replace the silent debounce.
		hasChanges = true;
	}

	function copyPreviousDay() {
		if (!previousDoc) return;
		const d = previousDoc.data;
		if (d.symptoms) symptoms = { ...symptoms, ...d.symptoms };
		if (d.episodes) episodes = { ...episodes, ...d.episodes };
		if (d.triggers) triggers = { ...triggers, ...d.triggers };
		if (d.medications) medications = { ...medications, ...d.medications };
		markChanged();
	}

	// CIPH-906 — Phase carryover. Multi-day episodes (flares, manic/
	// depressive states, MS relapses, IBD flares, endo flares...) by
	// definition span days — but the form starts every new day at zero,
	// forcing the user to manually re-toggle "ongoing today" or the
	// calendar shows yesterday-active / today-quiet, which is wrong.
	//
	// On hydration of a NEW day's entry (no existingDoc), if a multiDay
	// episode was active in `previousDoc`, pre-fill `episodes[ep.id] = 1`
	// AND record the streak start date in `phaseCarryover` so the form
	// can render "Phase aktiv seit X. April" + a "Beenden" affordance.
	let phaseCarryover: Record<string, string> = {};

	function findPhaseStart(epId: string): string | null {
		if (!previousDoc) return null;
		const prevDate = String(previousDoc.data.date || '');
		if (!prevDate) return null;
		let started = prevDate;
		let cursor = new Date(prevDate + 'T12:00:00');
		// Walk backwards through recentDocs for as long as the streak
		// holds. Cap at 60 days — if the user has had a flare for >60d
		// they're not surprised by a "since 60 days ago" hint.
		for (let i = 0; i < 60; i++) {
			const earlier = new Date(cursor);
			earlier.setDate(earlier.getDate() - 1);
			const earlierStr = earlier.toISOString().slice(0, 10);
			const earlierDoc = recentDocs.find(
				(d) => d.data?.type === 'entry' && d.data?.date === earlierStr,
			);
			const wasActive = earlierDoc
				? Number(
						(earlierDoc.data.episodes || earlierDoc.data.seizures || {})[epId] || 0,
					) > 0
				: false;
			if (!wasActive) break;
			started = earlierStr;
			cursor = earlier;
		}
		return started;
	}

	function applyPhaseCarryover() {
		if (existingDoc) return; // Editing an existing day — never override the doc.
		if (!previousDoc) return;
		const prevEps = (previousDoc.data.episodes ||
			previousDoc.data.seizures ||
			{}) as Record<string, number>;
		// IMPORTANT — Svelte 4 needs reassignment, not mutation, to trigger
		// reactivity. Build new objects locally then assign at the end so
		// every reactive consumer (chip rendering, hasChanges flag, the
		// saved-stamp time) sees the change. Earlier mutation-based code
		// looked correct but the form rendered the empty default until the
		// user touched another field.
		const nextEpisodes = { ...episodes };
		const nextCarryover: Record<string, string> = {};
		let mutated = false;
		for (const ep of bp.episodeTypes) {
			if (!ep.multiDay) continue;
			if (Number(prevEps[ep.id] || 0) <= 0) continue;
			nextEpisodes[ep.id] = 1;
			mutated = true;
			const start = findPhaseStart(ep.id);
			if (start) nextCarryover[ep.id] = start;
		}
		// Always reassign carryover so the previous-day's hint clears
		// when the user navigates to a date with no preceding phase.
		phaseCarryover = nextCarryover;
		if (mutated) {
			episodes = nextEpisodes;
			// Mark dirty so the user can save the "yes still ongoing"
			// path without first touching another field.
			hasChanges = true;
		}
	}

	$: hasPreviousDay = previousDoc !== null;

	$: hiddenSymptomIds = new Set(bp.customizations?.hiddenSymptoms || []);
	$: hiddenTriggerIds = new Set(bp.customizations?.hiddenTriggers || []);
	$: hiddenVitalIds = new Set(bp.customizations?.hiddenVitals || []);

	$: visibleSymptomGroups = bp.symptomGroups
		.map((g) => ({ ...g, items: g.items.filter((it) => !hiddenSymptomIds.has(it.id)) }))
		.filter((g) => g.items.length > 0);
	$: visibleTriggers = bp.triggers.filter((tr) => !hiddenTriggerIds.has(tr.id));
	$: visibleVitals = bp.vitals.filter((v) => !hiddenVitalIds.has(v.id));

	$: pairedMultiEntryGroups = (() => {
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
	$: unpairedMultiEntryVitals = visibleVitals.filter(v => v.multiEntry && !v.pairLabel);

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
			// Only as-needed meds use the "taken today" toggle. Scheduled meds
			// are assumed taken and tracked by exception (missedMeds).
			for (const med of b.medications) if (med.asNeeded) medications[med.id] = false;
		}
	}

	$: initFromBlueprint(bp);

	// Hydrate form state from existingDoc as soon as both bp and the doc are
	// available. Running this from a reactive declaration (rather than
	// onMount) ensures the form is populated before the first render, so
	// users never see a half-blank flash before the entry data appears.
	// Idempotent via the _existingLoadedKey guard.
	let _existingLoadedKey = '';
	$: {
		const key = `${date}|${existingDoc?.id ?? 'none'}`;
		if (existingDoc && _existingLoadedKey !== key) {
			_existingLoadedKey = key;
			loadExistingEntry();
		}
	}

	// CIPH-906 — apply phase carryover for new-day entries (no existingDoc)
	// once both `bp` and `previousDoc` have resolved. Same guard pattern
	// as the existingDoc hydration so it runs once per date change.
	let _phaseCarryKey = '';
	$: {
		const key = `${date}|${previousDoc?.id ?? 'none'}|${existingDoc ? 'has' : 'no'}`;
		if (!existingDoc && _phaseCarryKey !== key) {
			_phaseCarryKey = key;
			applyPhaseCarryover();
		}
	}

	function loadExistingEntry() {
		if (!existingDoc) return;
		// CIPH-904 — initialise the persistent save stamp from the doc's
		// server-created time. Best signal we have absent an `updatedAt`
		// field; further saves overwrite this in `saveEntry`.
		try { lastSavedAt = new Date(existingDoc.serverCreatedAt); } catch { /* keep null */ }
		const d = existingDoc.data;
		if (d.symptoms) symptoms = { ...symptoms, ...d.symptoms };
		if (d.episodes) episodes = { ...episodes, ...d.episodes };
		if (d.seizures && !d.episodes) episodes = { ...episodes, ...d.seizures };
		if (d.triggers) triggers = { ...triggers, ...d.triggers };
		if (d.vitals) vitals = { ...vitals, ...d.vitals };
		if (d.medications) medications = { ...medications, ...d.medications };
		if (Array.isArray(d.missedMedications)) {
			missedMeds = {};
			for (const id of d.missedMedications) missedMeds[id] = true;
		}
		if (d.episodeTimes) episodeTimes = { ...episodeTimes, ...d.episodeTimes };
		if (d.episodeDurations) episodeDurations = { ...episodeDurations, ...d.episodeDurations };
		if (d.episodeNotes) episodeNotes = { ...episodeNotes, ...d.episodeNotes };
		if (d.notes) notes = d.notes;
		isPrivate = d.private === true;
		// CIPH-886 — hydrate phase override if present (cycle cohort only).
		if (d.phaseOverride && PHASES_FOR_OVERRIDE.includes(d.phaseOverride as Phase)) {
			phaseOverride = d.phaseOverride as Phase;
		} else {
			phaseOverride = '';
		}
		parseMultiEntryVitals();
	}

	async function saveEntry() {
		saving = true;
		const data: EntryData = {
			type: 'entry',
			date,
			symptoms,
			episodes,
			episodeTimes,
			episodeDurations,
			episodeNotes,
			triggers,
			vitals,
			medications,
			missedMedications: (() => {
				const ids = Object.keys(missedMeds).filter((id) => missedMeds[id]);
				return ids.length > 0 ? ids : undefined;
			})(),
			notes,
			private: isPrivate ? true : undefined,
			phaseOverride: phaseOverride || undefined,
		};
		await onSave(data);
		saving = false;
		saved = true;
		hasChanges = false;
		lastSavedAt = new Date();
		setTimeout(() => { saved = false; }, 2500);
	}

	// CIPH-904 — formatted persistent save stamp for the save bar.
	$: savedStamp = lastSavedAt
		? lastSavedAt.toLocaleTimeString($locale, { hour: '2-digit', minute: '2-digit' })
		: '';

	async function handleDeleteConfirmed() {
		deleting = true;
		await onDelete();
		deleting = false;
		confirmDelete = false;
	}

	function formatDisplayDate(dateStr: string): string {
		const d = new Date(dateStr + 'T12:00:00');
		return d.toLocaleDateString($locale, {
			weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
		});
	}

	/* ─── CIPH-302: Incomplete-entry CTA ───
	 * Look at the last 30 entry docs the user has authored. Any vital or
	 * trigger field filled in >50% of those days is "typical for this user".
	 * If today's entry is missing any of them, surface chip buttons to nudge
	 * the user to fill them. Skipped for the first 3 days of use (not enough
	 * signal; nudging an empty baseline produces noise).
	 *
	 * The historical-doc set was previously read from the global $documents
	 * store inside the route. After CIPH-850 extraction the primitive only
	 * sees the previousDoc prop, so the typical-fields signal is computed
	 * once at mount from a recentDocs-derived shape if/when the route hands
	 * it down. For PI v12 the primitive computes typical fields from the
	 * existingDoc + previousDoc only; the route can pass a fuller history
	 * via a future `recentDocs` prop without changing the contract.
	 */
	type MissingField = { kind: 'vital' | 'trigger'; id: string; label: string; anchor: string };

	export let recentDocs: CiphraDocument[] = [];

	function hasVitalValue(doc: CiphraDocument | null | undefined, vid: string): boolean {
		const raw = (doc as any)?.data?.vitals?.[vid];
		if (!raw) return false;
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) return parsed.length > 0;
		} catch { /* single value */ }
		return String(raw).trim() !== '';
	}
	function hasTrigger(doc: CiphraDocument | null | undefined, tid: string): boolean {
		const trs = (doc as any)?.data?.triggers;
		if (!trs) return false;
		if (Array.isArray(trs)) return trs.includes(tid);
		return !!trs[tid];
	}

	$: typicalFields = (() => {
		const logs = recentDocs
			.filter((d) => d.data.type === 'entry' && d.data.date !== date)
			.sort((a, b) => String(b.data.date).localeCompare(String(a.data.date)))
			.slice(0, 30);
		if (logs.length < 3) return [] as { kind: 'vital' | 'trigger'; id: string; label: string }[];
		const threshold = logs.length * 0.5;
		const out: { kind: 'vital' | 'trigger'; id: string; label: string }[] = [];
		for (const v of bp.vitals) {
			const hits = logs.filter((d) => hasVitalValue(d, v.id)).length;
			if (hits > threshold) out.push({ kind: 'vital', id: v.id, label: isCustomItem(v.id) ? v.label : $t(v.label) });
		}
		for (const tr of bp.triggers) {
			const hits = logs.filter((d) => hasTrigger(d, tr.id)).length;
			if (hits > threshold) out.push({ kind: 'trigger', id: tr.id, label: isCustomItem(tr.id) ? tr.label : $t(tr.label) });
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

	onMount(() => {
		tick().then(() => setupSectionObserver());
	});
</script>

<svelte:window on:keydown={handleKeydown} />

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
			<button on:click={() => onDateChange(-1)} class="log-nav-btn" aria-label={$t("common.previous_day")}>
				<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
			</button>

			<div class="log-date-center">
				<span class="log-date-text">{formatDisplayDate(date)}</span>
				{#if isToday}
					<span class="log-today-badge">{$t('common.today')}</span>
				{/if}
				<!-- CIPH-713 — per-entry private toggle. Locked entries are
					 hard-excluded from every export (PDF/CSV/reports/share). -->
				<button
					type="button"
					on:click={() => { isPrivate = !isPrivate; markChanged(); }}
					class="ml-2 inline-flex items-center justify-center gap-1 px-2 h-8 rounded-full transition-all duration-150 text-xs"
					style="background: {isPrivate ? 'var(--surface-muted)' : 'transparent'}; color: {isPrivate ? 'var(--text-primary)' : 'var(--text-muted)'}"
					aria-pressed={isPrivate}
					aria-label={isPrivate ? $t('private.toggle_to_public') : $t('private.toggle_to_private')}
					title={isPrivate ? $t('private.toggle_to_public') : $t('private.toggle_to_private')}
				>
					{#if isPrivate}
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="transition-all duration-150">
							<rect x="4" y="11" width="16" height="10" rx="2" />
							<path d="M8 11V7a4 4 0 1 1 8 0v4" />
						</svg>
					{:else}
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="transition-all duration-150">
							<rect x="4" y="11" width="16" height="10" rx="2" />
							<path d="M8 11V7a4 4 0 0 1 7 -1.5" />
						</svg>
					{/if}
					<span>{isPrivate ? $t('private.state_private') : $t('private.state_public')}</span>
				</button>
			</div>

			<button on:click={() => onDateChange(1)} class="log-nav-btn" aria-label={$t("common.next_day")}>
				<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
			</button>
		</div>

		{#if !isToday}
			<button on:click={onJumpToToday} class="log-goto-today">
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
				{#each visibleSymptomGroups as group}
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
								{isCustomItem(item.id) ? item.label : $t(item.label)}
							</button>
						{/each}
					</div>
				{/each}
				<div class="log-chip-wrap">
					<button type="button" class="log-chip log-chip--add" on:click={() => openInlineCustom('symptom')}>
						<span class="log-chip-plus" aria-hidden="true">+</span> {$t('customization.add_symptom')}
					</button>
				</div>
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
							{isCustomItem(trig.id) ? trig.label : $t(trig.label)}
						</button>
					{/each}
					<button type="button" class="log-chip log-chip--add" on:click={() => openInlineCustom('trigger')}>
						<span class="log-chip-plus" aria-hidden="true">+</span> {$t('customization.add_trigger')}
					</button>
				</div>
				{/if}
			</section>
			{/if}

			<!-- ─── Medications card ─── -->
			{#if bp.medications.length > 0}
				{@const standardMeds = bp.medications.filter(m => !m.asNeeded)}
				{@const asNeededMeds = bp.medications.filter(m => m.asNeeded)}
				<section id="section-medications" class="log-card log-card--olive">
					<button class="log-section-toggle" on:click={() => toggleSection('medications')}>
						<h2 class="log-section-header">{$t('protocol.medications')}</h2>
						<svg class="log-section-chevron" class:log-section-chevron--open={!collapsed['medications']} width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="6,9 12,15 18,9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</button>
					{#if !collapsed['medications']}
					{#if standardMeds.length > 0}
						<!-- Assume-taken model: scheduled meds are part of the daily
							 regimen, so there's no per-day "taken" tap. Tapping a chip
							 marks that dose MISSED for this day (the exception). -->
						<p class="log-group-label log-meds-hint">{$t('protocol.meds_daily_hint')}</p>
						<div class="log-chip-wrap">
							{#each standardMeds as med}
								<button
									type="button"
									on:click={() => { missedMeds[med.id] = !missedMeds[med.id]; markChanged(); }}
									class="log-chip log-chip--med {missedMeds[med.id] ? 'log-chip--missed' : ''}"
									aria-pressed={missedMeds[med.id]}
									title={missedMeds[med.id] ? $t('protocol.meds_missed_on') : $t('protocol.meds_missed_off')}
								>
									<span class="log-chip-med-name">{med.name}</span>
									<span class="log-chip-med-dose">{med.dose}</span>
									{#if missedMeds[med.id]}<span class="log-chip-missed-tag">{$t('protocol.meds_missed_tag')}</span>{/if}
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
					<div class="log-chip-wrap">
						<button type="button" class="log-chip log-chip--add" on:click={openAddMed}>
							<span class="log-chip-plus" aria-hidden="true">+</span> {$t('settings.add_medication')}
						</button>
					</div>
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
						{@const epLabel = isCustomItem(ep.id) ? ep.label : $t(ep.label)}
						<div class="log-episode-row">
							<div class="log-episode-label">
								<span class="log-episode-dot" style="background: {ep.color}"></span>
								<span>{epLabel}</span>
							</div>
							{#if ep.multiDay}
								{@const carriedFrom = phaseCarryover[ep.id]}
								<div class="log-multiday-cell">
									{#if carriedFrom}
										<!-- CIPH-906 — phase carryover: yesterday's entry had
											 this multiDay episode active, so today's entry
											 pre-fills as continuing. The hint surfaces the
											 streak start; the button reframes to "Beenden"
											 when active so the action is the explicit "this
											 phase ended today" gesture, not a generic toggle. -->
										<p class="log-phase-hint">
											{$t('protocol.phase_active_since', {
												date: new Date(carriedFrom + 'T12:00:00').toLocaleDateString($locale, { day: 'numeric', month: 'short' }),
											})}
										</p>
									{/if}
									<button
										type="button"
										class="log-multiday-toggle {episodes[ep.id] > 0 ? 'log-multiday-toggle--on' : ''} {carriedFrom && episodes[ep.id] > 0 ? 'log-multiday-toggle--end' : ''}"
										title={
											carriedFrom && episodes[ep.id] > 0 ? $t('protocol.phase_finish_hint') :
											carriedFrom ? $t('protocol.phase_resume_hint') :
											episodes[ep.id] > 0 ? $t('protocol.phase_end_today_hint') :
											$t('protocol.phase_start_hint')
										}
										on:click={() => { episodes[ep.id] = episodes[ep.id] > 0 ? 0 : 1; markChanged(); }}
										aria-pressed={episodes[ep.id] > 0}
									>
										{#if carriedFrom && episodes[ep.id] > 0}
											{$t('protocol.phase_finish')}
										{:else if carriedFrom}
											{$t('protocol.phase_resume')}
										{:else if episodes[ep.id] > 0}
											{$t('protocol.ongoing_today')}
										{:else}
											{$t('protocol.mark_ongoing')}
										{/if}
									</button>
								</div>
							{:else}
								<div class="log-counter">
									<button
										on:click={() => { if (episodes[ep.id] > 0) { episodes[ep.id]--; markChanged(); } }}
										class="log-counter-btn"
										aria-label="{$t('common.decrease')} {epLabel}"
									>
										<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12" stroke-width="2" stroke-linecap="round"/></svg>
									</button>
									<span class="log-counter-num {episodes[ep.id] > 0 ? 'log-counter-num--active' : ''}">{episodes[ep.id] || 0}</span>
									<button
										on:click={() => { episodes[ep.id] = (episodes[ep.id] || 0) + 1; markChanged(); }}
										class="log-counter-btn"
										aria-label="{$t('common.increase')} {epLabel}"
									>
										<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" stroke-width="2" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke-width="2" stroke-linecap="round"/></svg>
									</button>
								</div>
							{/if}
						</div>
						{#if episodes[ep.id] > 0 && (ep.trackDuration || ep.trackTimeOfDay)}
							<div class="log-episode-detail">
								{#if ep.trackTimeOfDay}
									<div class="log-episode-detail-field">
										<label class="log-detail-label" for="ep-time-{ep.id}">{$t('protocol.time_of_day')}</label>
										<TimePicker
											id="ep-time-{ep.id}"
											bind:value={episodeTimes[ep.id]}
											ariaLabel={$t('protocol.time_of_day')}
											compact
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
						{#if episodes[ep.id] > 0}
							<!-- CIPH-904 — episode-notes input gets a real <label>
								 instead of placeholder-only. Placeholder disappears
								 on focus; mobile users tapping into a 4-character
								 input then lost context. -->
							<div class="log-episode-detail" style="margin-top: 4px">
								<div class="log-episode-detail-field" style="flex: 1">
									<label class="log-detail-label" for="ep-notes-{ep.id}">{$t('protocol.episode_notes')}</label>
									<input
										id="ep-notes-{ep.id}"
										type="text"
										class="log-detail-input"
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
								{isCustomItem(vital.id) ? vital.label : $t(vital.label)}
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
								<div class="log-multi-entry log-multi-entry--paired">
									<p class="log-vital-label" style="margin-bottom: 8px">
										{isCustomItem(vital.id) ? vital.label : $t(vital.label)}
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
										<div class="log-multi-add-time">
											<TimePicker
												bind:value={multiEntryNewTime[vital.id]}
												ariaLabel={$t('common.time')}
												compact
											/>
										</div>
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
							{isCustomItem(vital.id) ? vital.label : $t(vital.label)}
							{#if vital.unit}<span class="log-vital-unit">({translateUnit($t, vital.unit)})</span>{/if}
						</p>

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

						<div class="log-multi-add">
							<div class="log-multi-add-time">
								<TimePicker
									bind:value={multiEntryNewTime[vital.id]}
									ariaLabel={$t('common.time')}
									compact
								/>
							</div>
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

			<!-- ─── CIPH-886 Phase-override card (cycle cohort only) ─── -->
			{#if showPhaseOverride}
				<section id="section-phaseOverride" class="log-card log-card--ochre">
					<button class="log-section-toggle" on:click={() => toggleSection('phaseOverride')}>
						<h2 class="log-section-header">{$t('cycle.phase_override_title')}</h2>
						<svg class="log-section-chevron" class:log-section-chevron--open={!collapsed['phaseOverride']} width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="6,9 12,15 18,9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</button>
					{#if !collapsed['phaseOverride']}
						<p class="log-group-label" style="margin-top: 0">{$t('cycle.phase_override_hint')}</p>
						<div class="log-chip-wrap" role="radiogroup" aria-label={$t('cycle.phase_override_title')}>
							<button
								type="button"
								role="radio"
								aria-checked={phaseOverride === ''}
								on:click={() => { phaseOverride = ''; markChanged(); }}
								class="log-chip {phaseOverride === '' ? 'log-chip--ochre-active' : ''}"
							>
								{#if phaseOverride === ''}<svg class="log-chip-check" width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>{/if}
								{$t('cycle.phase_override_auto')}
							</button>
							{#each PHASES_FOR_OVERRIDE as ph}
								<button
									type="button"
									role="radio"
									aria-checked={phaseOverride === ph}
									on:click={() => { phaseOverride = ph; markChanged(); }}
									class="log-chip {phaseOverride === ph ? 'log-chip--ochre-active' : ''}"
								>
									{#if phaseOverride === ph}<svg class="log-chip-check" width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>{/if}
									{$t(`cycle.phase_${ph}`)}
								</button>
							{/each}
						</div>
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
						on:click={handleDeleteConfirmed}
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
				<!-- CIPH-904 — persistent save stamp + transient asterisk flash.
					 The flash plays for 2.5s after each save; once it fades, the
					 stamp keeps showing "Gespeichert · 14:32" so the user always
					 knows their data is saved without watching for a pulse. -->
				<div class="log-save-status" aria-live="polite">
					{#if saved}
						<div class="log-saved-feedback" transition:fade={{ duration: 300 }}>
							<Asterisk size={20} mode="saved" color="olive" />
							<span>{$t('protocol.auto_saved')}</span>
						</div>
					{:else if savedStamp}
						<span class="log-saved-stamp">{$t('protocol.saved_at', { time: savedStamp })}</span>
					{/if}
				</div>
				<button
					on:click={saveEntry}
					disabled={saving || !hasChanges}
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
		{:else}
			{#if saved}
				<div class="log-saved-feedback" transition:fade={{ duration: 300 }}>
					<Asterisk size={24} color="olive" />
					<span>{$t('protocol.auto_saved')}</span>
				</div>
			{:else}
				<button
					on:click={saveEntry}
					disabled={saving || !hasChanges}
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

<!-- Inline add-new (symptom / trigger) from the entry screen. Appends to the
	 blueprint customizations and pre-selects the new item. -->
<CustomItemModal
	open={customModalOpen}
	kind={customModalKind}
	groups={bp.symptomGroups}
	on:save={handleInlineCustomSave}
	on:close={() => (customModalOpen = false)}
/>

<!-- Inline add-new medication (name / dose / schedule / as-needed). Appends to
	 blueprint.medications and pre-selects it for the entry. -->
<Modal open={medAddOpen} title={$t('settings.add_medication')} onClose={() => (medAddOpen = false)}>
	<form on:submit|preventDefault={handleAddMed} class="space-y-3">
		<div>
			<label class="text-xs block mb-1" for="ec-med-name" style="color: var(--text-secondary)">{$t('settings.medication_name')}</label>
			<input id="ec-med-name" type="text" bind:value={newMedName} class="input" required />
		</div>
		<div>
			<label class="text-xs block mb-1" for="ec-med-dose" style="color: var(--text-secondary)">{$t('settings.medication_dose')}</label>
			<input id="ec-med-dose" type="text" bind:value={newMedDose} class="input" placeholder="10mg" required />
		</div>
		<div>
			<label class="text-xs block mb-1" for="ec-med-schedule" style="color: var(--text-secondary)">{$t('settings.medication_schedule')}</label>
			<input id="ec-med-schedule" type="text" bind:value={newMedSchedule} class="input" placeholder={$t('setup.med_schedule_placeholder')} />
		</div>
		<label class="flex items-center gap-2 text-sm cursor-pointer" style="color: var(--text-primary)">
			<input type="checkbox" bind:checked={newMedAsNeeded} class="w-4 h-4" style="accent-color: var(--olive)" />
			{$t('settings.medication_as_needed')}
		</label>
		<div class="flex gap-3 pt-1">
			<button type="button" on:click={() => (medAddOpen = false)} class="btn-secondary flex-1 rounded-xl text-sm font-medium min-h-[44px]">{$t('common.cancel')}</button>
			<button type="submit" disabled={!newMedName.trim() || !newMedDose.trim()} class="btn-primary flex-1 rounded-xl text-sm font-medium min-h-[44px]">{$t('settings.medication_save')}</button>
		</div>
	</form>
</Modal>

<style>
	/* ─── Section-jump nav (mobile) — CIPH-420b ─── */
	.log-section-nav {
		position: sticky;
		top: 56px;
		z-index: 30;
		margin: -16px -16px 0;
		padding: 8px 0;
		background: var(--surface, #faf8f6);
		border-bottom: 1px solid var(--border, #e8e3dd);
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
		color: var(--text-muted, #736d63);
		background: var(--surface-muted, #f3f0ed);
		border: 1px solid transparent;
		text-decoration: none;
		scroll-margin: 8px;
		transition: color 0.15s, background 0.15s, border-color 0.15s;
	}
	.log-section-chip--active {
		/* CIPH-891 — cohort-aware active section chip. */
		color: var(--accent, #b23c2c);
		font-weight: 700;
		background: var(--surface, #faf8f6);
		border-color: var(--accent, #b23c2c);
	}
	@media (min-width: 768px) {
		.log-section-nav { display: none; }
	}

	/* ─── Page container ─── */
	.log-page {
		max-width: 768px;
		margin: 0 auto;
		/* Bottom padding clears: save bar (~72px tall, sits 64px above
		   viewport bottom) + bottom nav (~64px) + safe-area inset.
		   The previous 160px was too tight on viewports where the
		   delete-confirm row pushed the save bar to ~80px tall. */
		padding: 16px 16px 220px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	@media (min-width: 640px) {
		.log-page {
			padding: 20px 24px 220px;
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
		color: var(--accent);
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
		/* Critique (PI v13): the form previously used 4 different rail
		   colors across 7 sections (olive / ochre / red / border) which
		   read as decoration without semantics. Unified on
		   --accent-neutral (cohort slot 5, anchor slate) so the form
		   reads quietly and lets the section headings + chips carry the
		   visual hierarchy. The variant classes remain in case a future
		   semantics decision wants to bring color back. */
		border-left: 3px solid var(--accent-neutral);
	}
	@media (min-width: 640px) {
		.log-card {
			padding: 20px;
		}
	}
	.log-card--olive,
	.log-card--red,
	.log-card--ochre,
	.log-card--gray {
		border-left-color: var(--accent-neutral);
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
	/* Inline "add new" chip — dashed outline to read as an affordance, not a
	   selectable value. Theme-token colors (dark-mode safe). */
	.log-chip--add {
		background: transparent;
		border: 1px dashed var(--border);
		color: var(--text-muted);
		/* Own full-width row, clearly separated from the item chips above
		   (their borders sat too close otherwise). */
		flex-basis: 100%;
		justify-content: center;
		margin-top: 10px;
	}
	.log-chip--add:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.log-chip-plus {
		font-weight: 600;
		margin-right: 2px;
	}

	.log-chip--olive-active {
		background: var(--olive-light);
		color: var(--olive);
		border-color: rgba(127, 130, 27, 0.25);
		font-weight: 500;
	}

	.log-chip--ochre-active {
		background: var(--ochre-light);
		color: var(--ochre);
		border-color: rgba(159, 99, 11, 0.25);
		font-weight: 500;
	}

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

	.log-chip:focus-visible,
	.log-counter-btn:focus-visible,
	.log-nav-btn:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}

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

	/* Assume-taken hint above the scheduled-med chips. Overrides the
	   uppercase group-label treatment — it's a sentence, not a label. */
	.log-meds-hint {
		text-transform: none;
		letter-spacing: 0;
		font-weight: 400;
		margin-bottom: 10px;
	}
	/* A scheduled med tapped as MISSED for this day. Danger tint + strike
	   so a skipped dose reads clearly against the assumed-taken default. */
	.log-chip--missed {
		background: var(--danger-light, rgba(178, 60, 44, 0.12));
		color: var(--danger);
		border-color: rgba(178, 60, 44, 0.35);
		font-weight: 500;
	}
	.log-chip--missed .log-chip-med-name {
		text-decoration: line-through;
	}
	.log-chip-missed-tag {
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
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
	/* iOS Safari auto-zooms any focused input under 16px and never zooms back
	   out (viewport meta omits maximum-scale for a11y). Match the .input fix in
	   app.css: bump to 16px on touch devices only, leaving desktop density. */
	@media (pointer: coarse) {
		.log-detail-input { font-size: 16px; }
	}
	.log-detail-input:focus {
		border-color: var(--accent);
	}
	/* CIPH-pi24-5d — Bring <select.log-detail-input> in line with the rest
	   of the app: strip the native chevron + paint the brand SVG one. */
	select.log-detail-input {
		appearance: none;
		-webkit-appearance: none;
		-moz-appearance: none;
		padding-right: 32px;
		background-repeat: no-repeat;
		background-position: right 10px center;
		background-size: 12px 12px;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpolyline points='3,4.5 6,7.5 9,4.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
		cursor: pointer;
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
		line-height: 1.25;
	}
	/* PI v17 — reserve 2 lines so labels that wrap (e.g. DE
	   "Stimmungspolarität" in the bipolar blueprint) don't push their
	   <input> down and break grid-row alignment with sibling cells.
	   Short labels show 1 line + spacer; long labels show 2 lines.
	   Scoped to the grid: standalone <p class="log-vital-label"> headers
	   on the multi-entry sections aren't in a grid, so they shouldn't
	   reserve dead space (Jonas dry-run #3). */
	.log-vitals-grid .log-vital-label {
		min-height: 2.5em;
	}
	.log-vital-unit {
		font-weight: 400;
		color: var(--text-muted);
	}

	/* ─── Notes ─── */
	.log-textarea {
		resize: vertical;
		min-height: 80px;
		font-size: 16px;
	}

	/* ─── Save bar — CIPH-784 ─── */
	.log-save-bar {
		position: fixed;
		/* Mobile: clear the BottomNav (md:hidden, ~70px tall). Desktop:
		   nav is hidden, so the save bar should sit flush at the
		   viewport bottom — otherwise there's empty space below it. */
		bottom: calc(4rem + env(safe-area-inset-bottom, 0px));
		left: 0;
		right: 0;
		z-index: 30;
		padding: 10px 16px;
		background: var(--surface-card);
		border-top: 1px solid var(--border);
		box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.04);
	}
	@media (min-width: 768px) {
		.log-save-bar {
			bottom: env(safe-area-inset-bottom, 0px);
		}
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
		color: var(--on-danger, #fff);
		border: none;
		cursor: pointer;
		transition: all 0.15s ease-out;
	}
	.log-btn-danger:hover {
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

	/* ─── Paired vitals ─── */
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
	.log-multiday-cell {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 4px;
	}
	.log-phase-hint {
		font-size: 11px;
		color: var(--text-muted);
		margin: 0;
		text-align: right;
		white-space: nowrap;
	}
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
		transition: transform 0.12s ease-out, box-shadow 0.12s ease-out, background 0.12s ease-out;
	}
	/* CIPH-906 hover affordance — explains "this button does something"
	   on pointer-over with a subtle lift + shadow. The native title=…
	   tooltip carries the verbal explanation for AT users. Reduced-
	   motion users still get the title; the lift is dropped via the
	   global app.css prefers-reduced-motion block. */
	.log-multiday-toggle:hover {
		transform: translateY(-1px);
		/* Accent-tinted lift reads in both themes; a black shadow vanished on
		   the dark surface. */
		box-shadow: 0 2px 6px rgba(var(--accent-rgb), 0.15);
		background: var(--surface-muted);
	}
	.log-multiday-toggle--on {
		background: var(--danger);
		border-color: var(--danger);
		color: var(--on-danger, #fff);
	}
	.log-multiday-toggle--on:hover {
		background: var(--danger);
		filter: brightness(0.92);
	}
	/* CIPH-906 — when the phase carried over and is still active, the
	   action button means "end the phase," not "toggle." Visually muted
	   (outline + danger text) so it doesn't feel like the destructive
	   delete in the save bar but still reads as a deliberate action. */
	.log-multiday-toggle--end {
		background: transparent;
		border-color: var(--danger);
		color: var(--danger);
	}
	.log-multiday-toggle--end:hover {
		background: rgba(220, 38, 38, 0.06);
		filter: none;
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
		/* A11y review (PI v13): bumped 28→44px to meet WCAG 2.5.5
		   minimum touch-target. Hit area is the full 44; the icon
		   stays small visually so the row doesn't feel chunky. */
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border-radius: 8px;
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

	.log-saved-feedback {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
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
	/* CIPH-904 — save-status slot. Holds the persistent stamp OR the
	   transient asterisk-flash. Same width either way so the save button
	   on the right doesn't jump when the flash appears/disappears. */
	.log-save-status {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 32px;
		font-size: 12px;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
	.log-saved-stamp {
		font-weight: 500;
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
