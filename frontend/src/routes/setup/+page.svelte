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
	import { isAuthenticated, auth } from '$lib/stores/auth';
	import { blueprint, presets } from '$lib/blueprint';
	import type { Blueprint, MedicationSlot } from '$lib/blueprint';
	import type { PresetInfo } from '$lib/blueprint';
	import { goto } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import { get } from 'svelte/store';
	import { slide } from 'svelte/transition';
	import { iconPath } from '$lib/conditionIcons';

	/** CIPH-740 — map symptom_group.* label keys to icons from the shared
	 *  iconPaths registry. Falls back to a generic "donut" (category) icon. */
	const GROUP_ICON: Record<string, string> = {
		'symptom_group.behavior': 'brain',
		'symptom_group.physical': 'activity',
		'symptom_group.sleep': 'battery-low',
		'symptom_group.focus': 'focus',
		'symptom_group.impulse': 'zap',
		'symptom_group.emotion': 'heart',
		'symptom_group.energy': 'battery-low',
		'symptom_group.hypo_signs': 'droplet',
		'symptom_group.hyper_signs': 'droplet',
		'symptom_group.general': 'donut',
		'symptom_group.mental': 'brain',
		'symptom_group.social': 'shield',
		'symptom_group.prodrome': 'waves',
		'symptom_group.aura': 'waves',
		'symptom_group.attack': 'zap',
		'symptom_group.postdrome': 'battery-low',
		'symptom_group.pain_quality': 'flame',
		'symptom_group.cognitive_emotional': 'brain',
		'symptom_group.motor': 'activity',
		'symptom_group.sensory': 'waves',
		'symptom_group.vision': 'eye',
		'symptom_group.cognitive': 'brain',
		'symptom_group.fatigue_bladder': 'battery-low',
		'symptom_group.mood_affect': 'heart',
		'symptom_group.anxiety_fear': 'cloud-lightning',
		'symptom_group.abdominal': 'activity',
		'symptom_group.bowel': 'activity',
		'symptom_group.respiratory': 'wind',
		'symptom_group.activity': 'activity',
		'symptom_group.pelvic_pain': 'flower',
		'symptom_group.gi_symptoms': 'activity',
		'symptom_group.gi': 'activity',
		'symptom_group.fatigue': 'battery-low',
		'symptom_group.neuro': 'brain',
		'symptom_group.pain': 'flame',
		'symptom_group.emotional': 'heart',
		'symptom_group.skin_symptoms': 'flower',
		'symptom_group.quality_of_life': 'shield-plus',
		'symptom_group.executive': 'focus',
		'symptom_group.masking': 'shield',
		'symptom_group.regulation': 'heart-pulse',
		'symptom_group.cardiac': 'heart-pulse',
		'symptom_group.circulation': 'heart-pulse',
	};

	let step: 1 | 2 | 3 | 4 = 1;
	let working: Blueprint | null = null;
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

	onMount(() => {
		if (!$isAuthenticated) { goto('/login'); return; }
		// Re-entry with an existing blueprint: pre-seed `working` so the
		// toggle screens reflect what the user already has. They can Skip
		// out at any point — no destructive resave happens unless they
		// reach screen 3 and hit "Complete".
		const existing = get(blueprint);
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
		}
	});

	function selectPreset(preset: PresetInfo) {
		working = JSON.parse(JSON.stringify(preset.blueprint));
		// Defaults: all groups / items / triggers / vitals ON (spec: "default ALL ON").
		if (working) {
			for (const g of working.symptomGroups) {
				symptomGroupOn[g.id] = true;
				for (const it of g.items) symptomItemOn[it.id] = true;
			}
			for (const tr of working.triggers) triggerOn[tr.id] = true;
			for (const v of working.vitals) vitalOn[v.id] = true;
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
		const hiddenSymptoms: string[] = [];
		for (const g of working.symptomGroups) {
			for (const item of g.items) {
				if (symptomItemOn[item.id] === false) hiddenSymptoms.push(item.id);
			}
		}
		const hiddenTriggers: string[] = [];
		for (const tr of working.triggers) {
			if (triggerOn[tr.id] === false) hiddenTriggers.push(tr.id);
		}
		const hiddenVitals: string[] = [];
		for (const v of working.vitals) {
			if (vitalOn[v.id] === false) hiddenVitals.push(v.id);
		}
		// Only attach `customizations` when something was actually hidden,
		// so blueprints stay clean for users who toggled nothing off.
		if (hiddenSymptoms.length || hiddenTriggers.length || hiddenVitals.length) {
			working.customizations = {
				...(working.customizations || {}),
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
		saving = false;
		goto('/');
	}

	async function skipFromStep1() {
		// Skipping from screen 1 before choosing a preset → nothing to save.
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
		else if (step === 2) step = 1;
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

<main class="min-h-screen pb-12" style="background: var(--surface)">
	<!-- Header with step progress + skip -->
	<div style="background: var(--surface-card); border-bottom: 1px solid var(--border)">
		<div class="max-w-2xl mx-auto px-4 py-5 flex items-center justify-between gap-3">
			<div class="flex-1 min-w-0">
				<h1 class="text-lg font-bold truncate" style="color: var(--text-primary)">{$t('setup.title')}</h1>
				<p class="text-xs mt-0.5" style="color: var(--text-muted)">{$t('setup.step_label', { n: step })}</p>
			</div>
			<button
				type="button"
				on:click={step === 1 ? skipFromStep1 : skipFromLater}
				class="text-sm font-medium px-3 py-2 min-h-[44px] rounded-lg"
				style="color: var(--text-secondary); background: var(--surface-muted)"
			>
				{$t('setup.skip')}
			</button>
		</div>
		<div class="max-w-2xl mx-auto px-4 pb-3 flex gap-2">
			{#each [1, 2, 3, 4] as s}
				<div class="h-1 flex-1 rounded-full" style="background: {s <= step ? 'var(--olive)' : 'var(--surface-inset)'}"></div>
			{/each}
		</div>
	</div>

	<div class="max-w-2xl mx-auto px-4 py-6">
		<!-- ─── SCREEN 1: Condition picker ─── -->
		{#if step === 1}
			<section aria-labelledby="wizard-step1-heading" class="space-y-4">
				<div class="text-center mb-6">
					<h2 id="wizard-step1-heading" bind:this={headingEl} tabindex="-1" class="text-lg font-semibold" style="color: var(--text-primary)">{$t('setup.choose_title')}</h2>
					<p class="text-sm mt-1" style="color: var(--text-secondary)">{$t('setup.choose_subtitle')}</p>
				</div>

				<div class="grid gap-3">
					<a href="/settings" class="block w-full text-left rounded-xl p-4 mb-2 transition-all"
						style="background: var(--surface-muted); border: 1px dashed var(--border)">
						<p class="text-sm font-semibold" style="color: var(--text-primary)">{$t('setup.skip_caregiver_title')}</p>
						<p class="text-xs mt-0.5" style="color: var(--text-muted)">{$t('setup.skip_caregiver_desc')}</p>
					</a>

					{#each presets as preset}
						<button
							on:click={() => selectPreset(preset)}
							class="w-full text-left rounded-xl p-5 transition-all"
							style="background: var(--surface-card); border: 1px solid var(--border)"
						>
							<div class="flex items-start gap-4">
								<div class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style="background: {preset.color}15">
									<svg class="w-6 h-6" style="color: {preset.color}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
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
		{:else if step === 2 && working}
			<section aria-labelledby="wizard-step2-heading" class="space-y-5">
				<div>
					<h2 id="wizard-step2-heading" bind:this={headingEl} tabindex="-1" class="text-lg font-semibold" style="color: var(--text-primary)">{$t('setup.symptoms_title')}</h2>
					<p class="text-sm mt-1" style="color: var(--text-secondary)">{$t('setup.wizard_symptoms_caption')}</p>
				</div>

				<div class="space-y-2">
					{#each working.symptomGroups as group (group.id)}
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
											<span class="text-sm flex-1 min-w-0" style="color: var(--text-primary)">{$t(item.label)}</span>
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
			</section>

		<!-- ─── SCREEN 3: Triggers + vitals (with optional targets) ─── -->
		{:else if step === 3 && working}
			<section aria-labelledby="wizard-step3-heading" class="space-y-6">
				<div>
					<h2 id="wizard-step3-heading" bind:this={headingEl} tabindex="-1" class="text-lg font-semibold" style="color: var(--text-primary)">{$t('setup.triggers_title')}</h2>
					<p class="text-sm mt-1" style="color: var(--text-secondary)">{$t('setup.wizard_triggers_caption')}</p>
				</div>

				{#if working.triggers.length > 0}
					<div class="flex flex-wrap gap-2">
						{#each working.triggers as trig}
							<button
								type="button"
								on:click={() => { triggerOn[trig.id] = !triggerOn[trig.id]; triggerOn = triggerOn; }}
								class="px-3 py-2 rounded-full text-sm font-medium min-h-[40px]"
								style="background: {triggerOn[trig.id] ? 'var(--ochre-light)' : 'var(--surface-muted)'}; color: {triggerOn[trig.id] ? 'var(--ochre)' : 'var(--text-muted)'}; border: 1px solid {triggerOn[trig.id] ? 'var(--ochre)' : 'var(--border)'};"
								aria-pressed={triggerOn[trig.id]}
							>
								{$t(trig.label)}
							</button>
						{/each}
					</div>
				{/if}

				<div>
					<h3 class="text-lg font-semibold" style="color: var(--text-primary)">{$t('setup.vitals_title')}</h3>
					<p class="text-sm mt-1" style="color: var(--text-secondary)">{$t('setup.wizard_vitals_caption')}</p>
				</div>

				<div class="space-y-2">
					{#each working.vitals as vital}
						<div class="p-4 rounded-xl" style="background: var(--surface-card); border: 1px solid var(--border)">
							<label class="flex items-center justify-between min-h-[32px] cursor-pointer">
								<div class="flex-1 min-w-0">
									<span class="text-sm font-medium" style="color: var(--text-primary)">{$t(vital.label)}</span>
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
					{#if targetableVitals.length === 0 && working.vitals.length === 0}
						<p class="text-sm text-center py-4" style="color: var(--text-muted)">—</p>
					{/if}
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
						<input id="wiz-med-schedule" type="text" bind:value={medSchedule} class="input" placeholder="morgens, abends" />
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
</main>
