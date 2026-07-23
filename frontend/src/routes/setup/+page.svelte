<script lang="ts">
	/**
	 * CIPH-301 — Setup wizard expansion (3 screens with skip).
	 *
	 * Design decision (spec): the blueprint is kept STOCK for now. Screen 2 + 3
	 * collect informational overrides (`setupOverrides`) that are NOT persisted
	 * to the blueprint — they're session-only hints for onboarding. The only
	 * persisted output is `ciphra_vital_targets:<username>` in localStorage,
	 * which `generateDoctorPdf` reads as an override for `referenceLine.value`.
	 * Full blueprint customisation remains reachable via /settings (old 7-step
	 * wizard — not replaced here).
	 */
	import { t, translateUnit } from '$lib/i18n';
	import { browser } from '$app/environment';
	import { isAuthenticated, auth } from '$lib/stores/auth';
	import { blueprint, hasBlueprint, presets, isCustomItem, resolveBlueprint } from '$lib/blueprint';
	import type {
		Blueprint,
		BlueprintItem,
		CustomSymptomItem,
		EpisodeType,
		MedicationSlot,
		VitalField,
	} from '$lib/blueprint';
	import type { PresetInfo, CustomKind } from '$lib/blueprint';
	import CustomItemModal from '$lib/components/CustomItemModal.svelte';
	import { goto } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import { get } from 'svelte/store';
	import { slide } from 'svelte/transition';
	import { iconPath } from '$lib/conditionIcons';
	// CIPH-740 — symptom-group icons now live in a shared module so the daily
	// entry screen renders the same icons (see groupIcons.ts).
	import { GROUP_ICON } from '$lib/groupIcons';

	// step 0 is the caregiver-vs-own intro added for fresh registrants
	// (no existing blueprint, not arrived via ?customize=1). Returning
	// users who already have a blueprint skip straight to step 1. The
	// onMount block below may override this default once it knows.
	let step: 0 | 1 | 2 | 3 | 4 = 1;
	let working: Blueprint | null = null;
	// The user's blueprint at entry (if any). Used so switching template via the
	// preset picker preserves their own data (medications + customizations)
	// instead of cloning a bare preset over it. Defensive: existing users are
	// normally ejected before the picker, but this guards any future entry path.
	let existingBlueprint: Blueprint | null = null;
	// CIPH-882 — Resolved view for step-2/3 iteration so user-added
	// custom items render alongside preset ones. `working` stays the
	// source of truth that gets persisted at finishAndSave.
	$: workingResolved = working ? resolveBlueprint(working) : null;
	let saving = false;

	// Session-only overrides — not persisted to the blueprint. Document keys
	// are group ids / trigger ids / vital ids. `true` = keep asking, `false`
	// = hide from prompts. (Actual blueprint stays untouched; these are a UI
	// hint layer we can surface in future stories without schema migration.)
	//
	// CIPH-740 — symptoms are now toggled per ITEM (not per group). We keep
	// `symptomGroupOn` only to seed initial item state on re-entry; the
	// source of truth for persistence is `symptomItemOn[item.id]`.
	let symptomGroupOn: Record<string, boolean> = {};
	let symptomItemOn: Record<string, boolean> = {};
	let expandedGroup: string | null = null;
	let triggerOn: Record<string, boolean> = {};
	let vitalOn: Record<string, boolean> = {};
	let vitalTargets: Record<string, string> = {};

	// CIPH-411c — step 4 medication entry
	let medName = '';
	let medDose = '';
	let medSchedule = '';
	let medAsNeeded = false;

	function newMedId(): string {
		try {
			if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
				return crypto.randomUUID();
			}
		} catch { /* fallthrough */ }
		return `med-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
	}

	function addMed() {
		if (!working) return;
		const name = medName.trim();
		const dose = medDose.trim();
		if (!name || !dose) return;
		const schedule = medSchedule.trim();
		const med: MedicationSlot = { id: newMedId(), name, dose, schedule, asNeeded: medAsNeeded };
		working.medications = [...working.medications, med];
		medName = '';
		medDose = '';
		medSchedule = '';
		medAsNeeded = false;
	}

	function removeMed(id: string) {
		if (!working) return;
		working.medications = working.medications.filter(m => m.id !== id);
	}

	// CIPH-882 — custom-item modal in the wizard. Mutates `working`
	// directly so step-2/3 previews show just-added items. Iteration in
	// the templates uses `workingResolved.symptomGroups` etc. so custom
	// items appear without changing the toggle handlers.
	let customModalOpen = false;
	let customModalKind: CustomKind = 'symptom';
	let customModalEditing:
		| CustomSymptomItem
		| BlueprintItem
		| VitalField
		| EpisodeType
		| null = null;

	// CIPH-883 — Guided custom-preset wizard.
	// When the user picks the `custom` preset, the standard toggle
	// screens are empty (the preset has no symptoms / triggers / vitals
	// to opt out of). Instead, route them through a narrative flow that
	// pre-opens the CustomItemModal per kind. They walk away with their
	// own blueprint built from scratch.
	$: isCustomPreset = working?.conditionId === 'custom';

	// Track whether we've already auto-opened the modal for the current
	// step, so we don't re-trigger on every reactive recompute.
	let autoOpenedForStep: number | null = null;
	$: if (isCustomPreset && step === 2 && autoOpenedForStep !== 2) {
		autoOpenedForStep = 2;
		const hasCustoms =
			(working?.customizations?.customSymptoms?.length ?? 0) > 0;
		if (!hasCustoms) {
			tick().then(() => openCustomModal('symptom'));
		}
	}
	$: if (isCustomPreset && step === 3 && autoOpenedForStep !== 3) {
		autoOpenedForStep = 3;
		const hasCustoms =
			(working?.customizations?.customTriggers?.length ?? 0) > 0;
		if (!hasCustoms) {
			tick().then(() => openCustomModal('trigger'));
		}
	}

	function openCustomModal(kind: CustomKind) {
		customModalKind = kind;
		customModalEditing = null;
		customModalOpen = true;
	}
	function closeCustomModal() {
		customModalOpen = false;
		customModalEditing = null;
	}

	function handleCustomSave(
		event: CustomEvent<
			| { kind: 'symptom'; item: CustomSymptomItem }
			| { kind: 'trigger'; item: BlueprintItem }
			| { kind: 'vital'; item: VitalField }
			| { kind: 'episode'; item: EpisodeType }
		>,
	) {
		if (!working) return;
		const { kind, item } = event.detail;
		const cz = working.customizations || (working.customizations = {});
		if (kind === 'symptom') {
			cz.customSymptoms = [...(cz.customSymptoms || []), item];
			// Default new custom symptoms ON.
			symptomItemOn[item.id] = true;
		} else if (kind === 'trigger') {
			cz.customTriggers = [...(cz.customTriggers || []), item];
			triggerOn[item.id] = true;
		} else if (kind === 'vital') {
			cz.customVitals = [...(cz.customVitals || []), item];
			vitalOn[item.id] = true;
		} else {
			cz.customEpisodes = [...(cz.customEpisodes || []), item];
		}
		// Force the reactive cascade — assignments to nested fields don't
		// re-trigger Svelte's `$:` blocks otherwise.
		working = working;
		closeCustomModal();
	}

	// A fully set-up user should never sit on the onboarding wizard. The only
	// deliberate re-entry with an existing blueprint is Settings → "Profil
	// anpassen" (/setup?customize=1); every other path here (fresh registrant,
	// caregiver setting up their own tracking) has no blueprint yet. So: if a
	// blueprint exists and we did NOT arrive via ?customize=1, eject home.
	// Read the param synchronously at init so the reactive guard below has the
	// right value on its first run (before onMount).
	const arrivedViaCustomize = browser
		&& new URL(window.location.href).searchParams.get('customize') === '1';

	// Reactive (not just onMount): if the layout ever lands a set-up user here
	// during a transient empty-docs load, they auto-recover the moment the real
	// blueprint resolves — instead of getting stranded on the wizard until a
	// manual refresh (the post-login onboarding bug, defense-in-depth).
	$: if (browser && $isAuthenticated && $hasBlueprint && !arrivedViaCustomize) {
		goto('/');
	}

	onMount(() => {
		if (!$isAuthenticated) { goto('/login'); return; }
		// Fresh registrants see step 0 (caregiver vs own tracking).
		// Returning users with an existing blueprint go straight to step 1.
		const existing = get(blueprint);
		existingBlueprint = existing ? JSON.parse(JSON.stringify(existing)) : null;
		if (!existing) {
			step = 0;
		}
		// Re-entry with an existing blueprint: pre-seed `working` so the
		// toggle screens reflect what the user already has. They can Skip
		// out at any point — no destructive resave happens unless they
		// reach screen 3 and hit "Complete".
		if (existing) {
			working = JSON.parse(JSON.stringify(existing));
			// CIPH-301b — pre-seed toggle state from any prior customizations.
			// A symptom group is "on" iff none of its items are hidden.
			const cz = working!.customizations || {};
			const hSym = new Set(cz.hiddenSymptoms || []);
			const hTrg = new Set(cz.hiddenTriggers || []);
			const hVit = new Set(cz.hiddenVitals || []);
			for (const g of working!.symptomGroups) {
				symptomGroupOn[g.id] = !g.items.every((it) => hSym.has(it.id));
				for (const it of g.items) symptomItemOn[it.id] = !hSym.has(it.id);
			}
			for (const tr of working!.triggers) triggerOn[tr.id] = !hTrg.has(tr.id);
			for (const v of working!.vitals) vitalOn[v.id] = !hVit.has(v.id);

			// CIPH-874 — Deep-link from Settings/Tracking "Profil anpassen"
			// lands here. When an existing blueprint is loaded and the
			// caller passed `?customize=1`, skip the preset-picker (step 1)
			// and go straight to the symptom/trigger/vital finetuning.
			// Switching preset remains available via the separate "Vorlage
			// wechseln" list in Settings.
			const u = new URL(window.location.href);
			if (u.searchParams.get('customize') === '1') {
				step = 2;
				// CIPH-908 — remember we entered via settings so we can
				// render a back-to-settings link.
				isCustomizeMode = true;
			}
		}
	});

	// CIPH-908 — true when the user reached /setup via "Profil anpassen"
	// from /settings (not the initial post-signup setup). Drives the
	// "← Zurück zu Einstellungen" link in the wizard header.
	let isCustomizeMode = false;

	function selectPreset(preset: PresetInfo) {
		// Re-picking the SAME condition you already have keeps your whole
		// blueprint incl. customizations (no destructive reset). Picking a
		// DIFFERENT condition adopts that preset cleanly (plain) — each
		// condition's blueprint is independent.
		const sameCondition = !!(existingBlueprint && existingBlueprint.conditionId === preset.blueprint.conditionId);
		working = JSON.parse(JSON.stringify(sameCondition ? existingBlueprint : preset.blueprint));
		// Seed toggles: a DIFFERENT preset starts all-ON (no prior opt-outs);
		// the SAME condition re-seeds from its existing hidden* so the user's
		// previous hide selections survive a re-pick (mirrors onMount).
		if (working) {
			const cz = sameCondition ? (working.customizations || {}) : {};
			const hSym = new Set(cz.hiddenSymptoms || []);
			const hTrg = new Set(cz.hiddenTriggers || []);
			const hVit = new Set(cz.hiddenVitals || []);
			for (const g of working.symptomGroups) {
				symptomGroupOn[g.id] = !g.items.every((it) => hSym.has(it.id));
				for (const it of g.items) symptomItemOn[it.id] = !hSym.has(it.id);
			}
			for (const tr of working.triggers) triggerOn[tr.id] = !hTrg.has(tr.id);
			for (const v of working.vitals) vitalOn[v.id] = !hVit.has(v.id);
		}
		step = 2;
	}

	async function finishAndSave() {
		if (!working) { goto('/'); return; }
		saving = true;

		// CIPH-301b — Persist the wizard toggle state into
		// `blueprint.customizations.hidden*`.
		// CIPH-740 — symptoms are now toggled per item in the drill-in UI.
		// `symptomItemOn[item.id] === false` → hide that item. Triggers +
		// vitals remain per-item already.
		// CIPH-882 — iterate the resolved view so custom items the user
		// added in the wizard are included in the toggle-state walk.
		const merged = resolveBlueprint(working);
		const hiddenSymptoms: string[] = [];
		for (const g of merged.symptomGroups) {
			for (const item of g.items) {
				if (symptomItemOn[item.id] === false) hiddenSymptoms.push(item.id);
			}
		}
		const hiddenTriggers: string[] = [];
		for (const tr of merged.triggers) {
			if (triggerOn[tr.id] === false) hiddenTriggers.push(tr.id);
		}
		const hiddenVitals: string[] = [];
		for (const v of merged.vitals) {
			if (vitalOn[v.id] === false) hiddenVitals.push(v.id);
		}
		// Only attach `customizations` when something meaningful is set
		// (a hide list OR an additive custom* array already present from
		// the modal flow). Keeps blueprints clean for fresh users who
		// neither hid anything nor added customs. When the user previously
		// had hides + clears them all in a re-entry, the existing block
		// still gets overwritten because `working.customizations` carried
		// in from the loaded blueprint — see `onMount` re-seed.
		const cz = working.customizations;
		const hasCustoms = !!(
			cz?.customSymptoms?.length ||
			cz?.customTriggers?.length ||
			cz?.customVitals?.length ||
			cz?.customEpisodes?.length
		);
		const hasHides =
			hiddenSymptoms.length || hiddenTriggers.length || hiddenVitals.length;
		if (hasCustoms || hasHides || cz) {
			// `cz` truthy means the blueprint already has a customizations
			// object (re-entry); preserve that field but rewrite the hide
			// arrays (so toggling a hide off in re-entry actually clears).
			working.customizations = {
				...(cz || {}),
				hiddenSymptoms,
				hiddenTriggers,
				hiddenVitals,
			};
		}

		await blueprint.save(working);
		// Persist per-user vital target overrides (spec: CIPH-301 screen 3).
		const username = $auth.username || '';
		if (username) {
			const parsed: Record<string, number> = {};
			for (const [vid, raw] of Object.entries(vitalTargets)) {
				const n = Number(raw);
				if (!isNaN(n) && n !== 0 && raw.trim() !== '') parsed[vid] = n;
			}
			try {
				if (Object.keys(parsed).length > 0) {
					localStorage.setItem(`ciphra_vital_targets:${username}`, JSON.stringify(parsed));
				}
			} catch { /* private-mode or quota — non-fatal */ }
		}
		// Blueprint saved — clear the skip flag so the dashboard redirect
		// behaves normally going forward.
		clearSetupSkipped();
		saving = false;
		goto('/');
	}

	// `ciphra_setup_skipped` tells +layout.svelte to stop auto-redirecting
	// the user from `/` back into /setup. Set when the user explicitly opts
	// out of setting up their own tracking (skip from step 0/1 or picks
	// "help someone else"). Cleared in finishAndSave once a blueprint is
	// committed, so a future re-entry that bails again sets it again.
	function markSetupSkipped() {
		try { localStorage.setItem('ciphra_setup_skipped', '1'); } catch {}
	}
	function clearSetupSkipped() {
		try { localStorage.removeItem('ciphra_setup_skipped'); } catch {}
	}

	function chooseOwnTracking() {
		step = 1;
	}

	function chooseCaregiver() {
		// User has opted to be a caregiver only. Route to /settings#sharing
		// where the family-code linking UI lives. Set the skip flag so the
		// layout doesn't bounce them back into /setup before they get there.
		markSetupSkipped();
		goto('/settings?tab=sharing');
	}

	async function skipFromStep1() {
		// Skipping from screen 1 before choosing a preset → nothing to save.
		// Mark skipped so the layout doesn't bounce them straight back.
		markSetupSkipped();
		goto('/');
	}

	async function skipFromLater() {
		// Screens 2/3 — we already have a working blueprint from step 1.
		await finishAndSave();
	}

	function toggleGroupExpand(gid: string) {
		expandedGroup = expandedGroup === gid ? null : gid;
	}

	function countItemsOn(items: { id: string }[]): number {
		let n = 0;
		for (const it of items) if (symptomItemOn[it.id] !== false) n++;
		return n;
	}

	function toggleAllInGroup(items: { id: string }[], on: boolean) {
		for (const it of items) symptomItemOn[it.id] = on;
		symptomItemOn = symptomItemOn;
	}

	function goNext() {
		if (step === 2) step = 3;
		else if (step === 3) step = 4;
	}
	function goBack() {
		if (step === 4) step = 3;
		else if (step === 3) step = 2;
		else if (step === 2) {
			// Customize-mode fine-tuners (entered via Settings → "Profil
			// anpassen") must NOT fall back into the preset picker (step 1):
			// re-picking runs selectPreset, which resets toggles and risks
			// dropping customizations. "Zurück" here is a pure exit back to
			// Settings — nothing is saved on this path.
			if (isCustomizeMode) { goto('/settings?tab=tracking'); return; }
			step = 1;
		}
	}

	// Vitals worth a "target" input = vitals that already carry a
	// clinical `referenceLine`. No override for vitals without one —
	// the default placeholder value is fine and we'd need the clinical
	// label which we don't have here.
	$: targetableVitals = working
		? working.vitals.filter((v) => v.referenceLine)
		: [];

	// Focus management — step changes should move focus to the new heading
	// for screen-reader users (CIPH-402 landmarks work to come).
	let headingEl: HTMLElement | null = null;
	$: if (step) { tick().then(() => headingEl?.focus()); }
</script>

<!-- 2026-06-07 — was <main class="min-h-screen ..."> which nested a
	<main> inside the layout's own <main class="flex-1"> AND forced an
	inner 100vh that broke the layout's sticky-footer flex. Result: even
	on the lightest step the AuthedFooter was pushed beyond the viewport
	and required a scroll to see. Now a plain <div> that flows
	naturally — the layout's outer min-h-screen + flex + main(flex-1)
	already handles sticky-footer math correctly. -->
<div class="pb-12" style="background: var(--surface)">
	<!-- Header with step progress + skip -->
	<div style="background: var(--surface-card); border-bottom: 1px solid var(--border)">
		{#if isCustomizeMode}
			<!-- CIPH-908 — "Back to settings" only when reached via the
				 ?customize=1 deep-link (not the initial post-signup setup,
				 where there's no settings yet to go back to). -->
			<div class="max-w-2xl mx-auto px-4 pt-4">
				<a
					href="/settings?tab=tracking"
					class="inline-flex items-center gap-1.5 text-sm font-medium min-h-[36px]"
					style="color: var(--text-secondary)"
				>
					<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
						<polyline points="15,18 9,12 15,6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
					{$t('setup.back_to_settings')}
				</a>
			</div>
		{/if}
		<div class="max-w-2xl mx-auto px-4 py-5 flex items-center justify-between gap-3">
			<div class="flex-1 min-w-0">
				<h1 class="text-lg font-bold truncate" style="color: var(--text-primary)">{$t('setup.title')}</h1>
				{#if step > 0}
					<p class="text-xs mt-0.5" style="color: var(--text-muted)">{$t('setup.step_label', { n: step })}</p>
				{/if}
			</div>
			<!-- 2026-06-07 — Step 0 lost its skip ("Später entscheiden"): the
				 layout's redirect-to-/setup guard reads `ciphra_setup_skipped`
				 from localStorage non-reactively, so the user was bounced right
				 back to /setup on the next paint, making the affordance read
				 like a broken way-out. Step 0 now has no skip — chooseCaregiver
				 is still the legitimate "I'm here for someone else" exit. Step
				 1+ keep the Skip; their handlers either save (skipFromLater) or
				 hit the same flag-loop, but at least there the user has already
				 picked a preset so "skip and come back" is meaningful. -->
			{#if step > 0}
				<button
					type="button"
					on:click={step === 1 ? skipFromStep1 : skipFromLater}
					class="text-sm font-medium px-3 py-2 min-h-[44px] rounded-lg"
					style="color: var(--text-secondary); background: var(--surface-muted)"
				>
					{$t('setup.skip')}
				</button>
			{/if}
		</div>
		{#if step > 0}
			<div class="max-w-2xl mx-auto px-4 pb-3 flex gap-2">
				{#each [1, 2, 3, 4] as s}
					<div class="h-1 flex-1 rounded-full" style="background: {s <= step ? 'var(--olive)' : 'var(--surface-inset)'}"></div>
				{/each}
			</div>
		{/if}
	</div>

	<div class="max-w-2xl mx-auto px-4 py-6">
		<!-- ─── SCREEN 0: Caregiver question ─── -->
		<!-- Shown only to fresh registrants (no existing blueprint) so they
		     don't land on the caregiver-fallback dashboard page meant for
		     active caregivers. "Help someone else" routes to settings/sharing
		     and sets a skip flag to prevent the dashboard redirect loop. -->
		{#if step === 0}
			<section aria-labelledby="wizard-step0-heading" class="space-y-4">
				<div class="text-center mb-6">
					<h2 id="wizard-step0-heading" bind:this={headingEl} tabindex="-1" class="text-lg font-semibold" style="color: var(--text-primary)">{$t('setup.intro_title')}</h2>
					<p class="text-sm mt-1" style="color: var(--text-secondary)">{$t('setup.intro_subtitle')}</p>
				</div>

				<div class="grid gap-3">
					<button
						type="button"
						on:click={chooseOwnTracking}
						class="block w-full text-left rounded-xl p-5 transition-all"
						style="background: var(--surface-card); border: 1px solid var(--border)"
					>
						<div class="flex items-start gap-3">
							<span class="shrink-0 mt-0.5" style="color: var(--brand)">
								<svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
									<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
								</svg>
							</span>
							<div class="min-w-0">
								<p class="text-base font-semibold" style="color: var(--text-primary)">{$t('setup.intro_own_title')}</p>
								<p class="text-sm mt-1" style="color: var(--text-secondary)">{$t('setup.intro_own_desc')}</p>
							</div>
						</div>
					</button>

					<button
						type="button"
						on:click={chooseCaregiver}
						class="block w-full text-left rounded-xl p-5 transition-all"
						style="background: var(--surface-card); border: 1px solid var(--border)"
					>
						<div class="flex items-start gap-3">
							<span class="shrink-0 mt-0.5" style="color: var(--olive)">
								<svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
									<path d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-4a4 4 0 100-8 4 4 0 000 8zm6 4a3 3 0 100-6 3 3 0 000 6zM5 14a3 3 0 100-6 3 3 0 000 6z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
								</svg>
							</span>
							<div class="min-w-0">
								<p class="text-base font-semibold" style="color: var(--text-primary)">{$t('setup.intro_caregiver_title')}</p>
								<p class="text-sm mt-1" style="color: var(--text-secondary)">{$t('setup.intro_caregiver_desc')}</p>
							</div>
						</div>
					</button>
				</div>
			</section>
		{/if}

		<!-- ─── SCREEN 1: Condition picker ─── -->
		{#if step === 1}
			<section aria-labelledby="wizard-step1-heading" class="space-y-4">
				<div class="text-center mb-6">
					<h2 id="wizard-step1-heading" bind:this={headingEl} tabindex="-1" class="text-lg font-semibold" style="color: var(--text-primary)">{$t('setup.choose_title')}</h2>
					<p class="text-sm mt-1" style="color: var(--text-secondary)">{$t('setup.choose_subtitle')}</p>
				</div>

				<div class="grid gap-3">
					{#each presets as preset}
						<button
							on:click={() => selectPreset(preset)}
							class="w-full text-left rounded-xl p-5 transition-all"
							style="background: var(--surface-card); border: 1px solid var(--border)"
						>
							<div class="flex items-start gap-4">
								<div
									class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
									style="background: linear-gradient(135deg, {preset.color}26, {preset.color}10);
									       border: 1px solid {preset.color}40;"
								>
									<svg class="w-6 h-6" style="color: {preset.color}" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
										<path d={iconPath(preset.icon)} />
									</svg>
								</div>
								<div class="flex-1">
									<h3 class="text-base font-semibold" style="color: var(--text-primary)">{$t(preset.labelKey)}</h3>
									<p class="text-sm mt-0.5" style="color: var(--text-secondary)">{$t(preset.descriptionKey)}</p>
								</div>
							</div>
						</button>
					{/each}
				</div>
			</section>

		<!-- ─── SCREEN 2: Symptom group review ─── -->
		{:else if step === 2 && working && workingResolved}
			<section aria-labelledby="wizard-step2-heading" class="space-y-5">
				<div>
					<!-- CIPH-883 — narrative copy for the custom preset -->
					{#if isCustomPreset}
						<h2 id="wizard-step2-heading" bind:this={headingEl} tabindex="-1" class="text-lg font-semibold" style="color: var(--text-primary)">{$t('setup.guided_symptoms_title')}</h2>
						<p class="text-sm mt-1" style="color: var(--text-secondary)">{$t('setup.guided_symptoms_caption')}</p>
					{:else}
						<h2 id="wizard-step2-heading" bind:this={headingEl} tabindex="-1" class="text-lg font-semibold" style="color: var(--text-primary)">{$t('setup.symptoms_title')}</h2>
						<p class="text-sm mt-1" style="color: var(--text-secondary)">{$t('setup.wizard_symptoms_caption')}</p>
					{/if}
				</div>

				<div class="space-y-2">
					{#each workingResolved.symptomGroups as group (group.id)}
						{@const onCount = countItemsOn(group.items)}
						{@const total = group.items.length}
						{@const isOpen = expandedGroup === group.id}
						<div
							data-testid="symptom-group-row"
							class="rounded-xl overflow-hidden"
							style="background: var(--surface-card); border: 1px solid var(--border)"
						>
							<button
								type="button"
								on:click={() => toggleGroupExpand(group.id)}
								aria-expanded={isOpen}
								aria-controls="group-items-{group.id}"
								class="w-full flex items-center gap-3 p-4 text-left min-h-[56px]"
							>
								<div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style="background: var(--surface-muted)">
									<svg class="w-5 h-5" style="color: var(--olive)" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
										<path d={iconPath(GROUP_ICON[group.label] || 'donut')} />
									</svg>
								</div>
								<div class="flex-1 min-w-0">
									<p class="text-sm font-medium" style="color: var(--text-primary)">{$t(group.label)}</p>
									<p class="text-xs mt-0.5" style="color: var(--text-muted)">
										{onCount} / {total} {$t('protocol.symptoms')}
									</p>
								</div>
								<svg
									class="w-5 h-5 shrink-0 transition-transform"
									style="color: var(--text-muted); transform: rotate({isOpen ? 180 : 0}deg)"
									fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"
									aria-hidden="true"
								>
									<polyline points="6 9 12 15 18 9" />
								</svg>
							</button>
							{#if isOpen}
								<div
									id="group-items-{group.id}"
									transition:slide={{ duration: 180 }}
									class="px-3 pb-3 pt-1 space-y-1"
									style="border-top: 1px solid var(--border)"
								>
									<div class="flex justify-end gap-2 py-2">
										<button
											type="button"
											on:click={() => toggleAllInGroup(group.items, true)}
											class="text-xs font-medium px-2 py-1 rounded-lg min-h-[32px]"
											style="color: var(--olive); background: var(--surface-muted)"
										>
											{$t('setup.select_all')}
										</button>
										<button
											type="button"
											on:click={() => toggleAllInGroup(group.items, false)}
											class="text-xs font-medium px-2 py-1 rounded-lg min-h-[32px]"
											style="color: var(--text-muted); background: var(--surface-muted)"
										>
											{$t('setup.select_none')}
										</button>
									</div>
									{#each group.items as item (item.id)}
										<label
											data-testid="symptom-item-toggle"
											class="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer min-h-[44px]"
											style="background: var(--surface-muted)"
										>
											<span class="text-sm flex-1 min-w-0" style="color: var(--text-primary)">{isCustomItem(item.id) ? item.label : $t(item.label)}</span>
											<input
												type="checkbox"
												bind:checked={symptomItemOn[item.id]}
												class="w-5 h-5 ml-3 shrink-0"
												style="accent-color: var(--olive)"
											/>
										</label>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>

				<!-- CIPH-882 — Add your own symptom or episode-type. -->
				<div class="flex flex-wrap gap-2 pt-2">
					<button
						type="button"
						on:click={() => openCustomModal('symptom')}
						class="text-sm font-medium px-3 py-2 min-h-[44px] rounded-lg"
						style="color: var(--olive); background: var(--surface-muted); border: 1px dashed var(--border)"
						data-testid="setup-add-custom-symptom"
					>
						+ {$t('customization.add_symptom')}
					</button>
					<button
						type="button"
						on:click={() => openCustomModal('episode')}
						class="text-sm font-medium px-3 py-2 min-h-[44px] rounded-lg"
						style="color: var(--olive); background: var(--surface-muted); border: 1px dashed var(--border)"
						data-testid="setup-add-custom-episode"
					>
						+ {$t('customization.add_episode')}
					</button>
				</div>
			</section>

		<!-- ─── SCREEN 3: Triggers + vitals (with optional targets) ─── -->
		{:else if step === 3 && working && workingResolved}
			<section aria-labelledby="wizard-step3-heading" class="space-y-6">
				<div>
					<!-- CIPH-883 — narrative copy for the custom preset -->
					{#if isCustomPreset}
						<h2 id="wizard-step3-heading" bind:this={headingEl} tabindex="-1" class="text-lg font-semibold" style="color: var(--text-primary)">{$t('setup.guided_triggers_title')}</h2>
						<p class="text-sm mt-1" style="color: var(--text-secondary)">{$t('setup.guided_triggers_caption')}</p>
					{:else}
						<h2 id="wizard-step3-heading" bind:this={headingEl} tabindex="-1" class="text-lg font-semibold" style="color: var(--text-primary)">{$t('setup.triggers_title')}</h2>
						<p class="text-sm mt-1" style="color: var(--text-secondary)">{$t('setup.wizard_triggers_caption')}</p>
					{/if}
				</div>

				{#if workingResolved.triggers.length > 0}
					<div class="flex flex-wrap gap-2">
						{#each workingResolved.triggers as trig}
							<button
								type="button"
								on:click={() => { triggerOn[trig.id] = !triggerOn[trig.id]; triggerOn = triggerOn; }}
								class="px-3 py-2 rounded-full text-sm font-medium min-h-[40px]"
								style="background: {triggerOn[trig.id] ? 'var(--ochre-light)' : 'var(--surface-muted)'}; color: {triggerOn[trig.id] ? 'var(--ochre)' : 'var(--text-muted)'}; border: 1px solid {triggerOn[trig.id] ? 'var(--ochre)' : 'var(--border)'};"
								aria-pressed={triggerOn[trig.id]}
							>
								{isCustomItem(trig.id) ? trig.label : $t(trig.label)}
							</button>
						{/each}
					</div>
				{/if}

				<div>
					<h3 class="text-lg font-semibold" style="color: var(--text-primary)">{$t('setup.vitals_title')}</h3>
					<p class="text-sm mt-1" style="color: var(--text-secondary)">{$t('setup.wizard_vitals_caption')}</p>
				</div>

				<div class="space-y-2">
					{#each workingResolved.vitals as vital}
						<div class="p-4 rounded-xl" style="background: var(--surface-card); border: 1px solid var(--border)">
							<label class="flex items-center justify-between min-h-[32px] cursor-pointer">
								<div class="flex-1 min-w-0">
									<span class="text-sm font-medium" style="color: var(--text-primary)">{isCustomItem(vital.id) ? vital.label : $t(vital.label)}</span>
									{#if vital.unit}<span class="text-xs ml-1" style="color: var(--text-muted)">({translateUnit($t, vital.unit)})</span>{/if}
								</div>
								<input
									type="checkbox"
									bind:checked={vitalOn[vital.id]}
									class="w-5 h-5 ml-3"
									style="accent-color: var(--olive)"
								/>
							</label>
							{#if vital.referenceLine && vitalOn[vital.id]}
								<div class="mt-3 flex items-center gap-2">
									<label class="text-xs flex-1" for="target-{vital.id}" style="color: var(--text-secondary)">
										{$t('setup.target_label')}
									</label>
									<input
										id="target-{vital.id}"
										type="number"
										inputmode="decimal"
										bind:value={vitalTargets[vital.id]}
										placeholder={`${$t('setup.target_placeholder')} (${$t(vital.referenceLine.labelKey)}: ${vital.referenceLine.value})`}
										class="input w-32"
									/>
								</div>
							{/if}
						</div>
					{/each}
					{#if targetableVitals.length === 0 && workingResolved.vitals.length === 0}
						<p class="text-sm text-center py-4" style="color: var(--text-muted)">—</p>
					{/if}
				</div>

				<!-- CIPH-882 — Add your own trigger or measurement. -->
				<div class="flex flex-wrap gap-2 pt-2">
					<button
						type="button"
						on:click={() => openCustomModal('trigger')}
						class="text-sm font-medium px-3 py-2 min-h-[44px] rounded-lg"
						style="color: var(--olive); background: var(--surface-muted); border: 1px dashed var(--border)"
						data-testid="setup-add-custom-trigger"
					>
						+ {$t('customization.add_trigger')}
					</button>
					<button
						type="button"
						on:click={() => openCustomModal('vital')}
						class="text-sm font-medium px-3 py-2 min-h-[44px] rounded-lg"
						style="color: var(--olive); background: var(--surface-muted); border: 1px dashed var(--border)"
						data-testid="setup-add-custom-vital"
					>
						+ {$t('customization.add_vital')}
					</button>
				</div>
			</section>

		<!-- ─── SCREEN 4: Medications (CIPH-411c) ─── -->
		{:else if step === 4 && working}
			<section aria-labelledby="wizard-step4-heading" class="space-y-5">
				<div>
					<h2 id="wizard-step4-heading" bind:this={headingEl} tabindex="-1" class="text-lg font-semibold" style="color: var(--text-primary)">{$t('setup.medications_title')}</h2>
					<p class="text-sm mt-1" style="color: var(--text-secondary)">{$t('setup.medications_subtitle')}</p>
				</div>

				{#if working.medications.length > 0}
					<ul class="space-y-2">
						{#each working.medications as med (med.id)}
							<li class="flex items-center gap-3 p-3 rounded-xl" style="background: var(--surface-card); border: 1px solid var(--border)">
								<div class="flex-1 min-w-0">
									<p class="text-sm font-medium truncate" style="color: var(--text-primary)">{med.name}</p>
									<p class="text-xs mt-0.5 truncate" style="color: var(--text-secondary)">
										{med.dose}{med.schedule ? ' · ' + med.schedule : ''}{med.asNeeded ? ' · ' + $t('settings.medication_as_needed') : ''}
									</p>
								</div>
								<button
									type="button"
									on:click={() => removeMed(med.id)}
									class="text-xs font-medium px-2 py-1.5 rounded-lg min-h-[36px]"
									style="color: var(--danger); background: rgba(220,38,38,0.05); border: 1px solid rgba(220,38,38,0.2)"
								>
									{$t('common.delete')}
								</button>
							</li>
						{/each}
					</ul>
				{/if}

				<div class="space-y-3 p-4 rounded-xl" style="background: var(--surface-card); border: 1px solid var(--border)">
					<div>
						<label class="text-xs block mb-1" for="wiz-med-name" style="color: var(--text-secondary)">{$t('settings.medication_name')}</label>
						<input id="wiz-med-name" type="text" bind:value={medName} class="input" />
					</div>
					<div>
						<label class="text-xs block mb-1" for="wiz-med-dose" style="color: var(--text-secondary)">{$t('settings.medication_dose')}</label>
						<input id="wiz-med-dose" type="text" bind:value={medDose} class="input" placeholder="10mg" />
					</div>
					<div>
						<label class="text-xs block mb-1" for="wiz-med-schedule" style="color: var(--text-secondary)">{$t('settings.medication_schedule')}</label>
						<input id="wiz-med-schedule" type="text" bind:value={medSchedule} class="input" placeholder={$t('setup.med_schedule_placeholder')} />
					</div>
					<label class="flex items-center gap-2 text-sm cursor-pointer" style="color: var(--text-primary)">
						<input type="checkbox" bind:checked={medAsNeeded} class="w-4 h-4" style="accent-color: var(--olive)" />
						{$t('settings.medication_as_needed')}
					</label>
					<button
						type="button"
						on:click={addMed}
						disabled={!medName.trim() || !medDose.trim()}
						class="btn-secondary w-full rounded-xl text-sm font-medium min-h-[44px] disabled:opacity-50"
					>
						{$t('settings.add_medication')}
					</button>
				</div>
			</section>
		{/if}

		<!-- Navigation buttons -->
		{#if step > 1}
			<div class="flex gap-3 mt-8">
				<button on:click={goBack}
					class="btn-secondary flex-1 rounded-xl font-medium min-h-[48px]">
					{$t('setup.back')}
				</button>
				{#if step < 4}
					<button on:click={goNext}
						data-testid="wizard-next"
						class="btn-primary flex-1 rounded-xl font-medium min-h-[48px]">
						{$t('setup.next')}
					</button>
				{:else}
					<button on:click={finishAndSave} disabled={saving}
						data-testid="wizard-finish"
						class="btn-primary flex-1 rounded-xl font-medium min-h-[48px]">
						{saving ? $t('setup.saving') : $t('setup.complete_button')}
					</button>
				{/if}
			</div>
		{/if}
	</div>
</div>

<!-- CIPH-882 — Add-your-own-item modal. Mounts at the end of the page
	so it's outside any conditional `{#if step === N}` block. The wizard
	mutates `working.customizations.custom*` directly and the resolved
	view (workingResolved) shows the new items immediately. -->
<CustomItemModal
	open={customModalOpen}
	kind={customModalKind}
	editing={customModalEditing}
	groups={working?.symptomGroups ?? []}
	on:save={handleCustomSave}
	on:close={closeCustomModal}
/>
