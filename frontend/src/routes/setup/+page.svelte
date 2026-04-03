<script lang="ts">
	import { t } from '$lib/i18n';
	import { isAuthenticated } from '$lib/stores/auth';
	import { documents } from '$lib/stores/documents';
	import { blueprint, presets } from '$lib/blueprint';
	import type { Blueprint, BlueprintItem, BlueprintGroup, EpisodeType, VitalField } from '$lib/blueprint';
	import type { PresetInfo } from '$lib/blueprint';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	let step = 1; // 1=pick preset, 2=symptoms, 3=episodes, 4=triggers, 5=vitals, 6=confirm
	const totalSteps = 6;
	let working: Blueprint | null = null;
	let saving = false;

	// For adding custom items — per-group input state
	let groupInputs: Record<number, string> = {};
	let newGroupLabel = '';
	let newEpisodeLabel = '';
	let newTriggerLabel = '';
	let newVitalLabel = '';
	let newVitalUnit = '';

	onMount(() => {
		if (!$isAuthenticated) { goto('/login'); return; }
		// If blueprint already exists (re-entry from settings), load it for editing
		const existing = $blueprint;
		if (existing) {
			working = JSON.parse(JSON.stringify(existing));
			step = 2; // skip preset selection, go straight to editing
		}
	});

	function selectPreset(preset: PresetInfo) {
		working = JSON.parse(JSON.stringify(preset.blueprint));
		if (preset.id === 'custom') {
			working.conditionLabel = '';
		}
		step = 2;
	}

	function toggleSymptom(groupIdx: number, itemId: string) {
		if (!working) return;
		const group = working.symptomGroups[groupIdx];
		const idx = group.items.findIndex(i => i.id === itemId);
		if (idx >= 0) {
			group.items.splice(idx, 1);
		}
		working = working; // trigger reactivity
	}

	function addSymptomToGroup(groupIdx: number) {
		const val = (groupInputs[groupIdx] || '').trim();
		if (!working || !val) return;
		const id = val.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_äöüàéèêïôùûç]/g, '');
		working.symptomGroups[groupIdx].items.push({ id, label: val });
		groupInputs[groupIdx] = '';
		groupInputs = groupInputs; // trigger reactivity
		working = working;
	}

	function addGroup() {
		if (!working || !newGroupLabel.trim()) return;
		const id = newGroupLabel.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
		working.symptomGroups.push({ id, label: newGroupLabel.trim(), items: [] });
		newGroupLabel = '';
		working = working;
	}

	function removeGroup(idx: number) {
		if (!working) return;
		working.symptomGroups.splice(idx, 1);
		working = working;
	}

	function addEpisodeType() {
		if (!working || !newEpisodeLabel.trim()) return;
		const id = newEpisodeLabel.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
		const colors = ['#DC2626', '#F59E0B', '#8B5CF6', '#EC4899', '#0D9488', '#6366F1'];
		working.episodeTypes.push({
			id,
			label: newEpisodeLabel.trim(),
			color: colors[working.episodeTypes.length % colors.length],
		});
		newEpisodeLabel = '';
		working = working;
	}

	function removeEpisode(idx: number) {
		if (!working) return;
		working.episodeTypes.splice(idx, 1);
		working = working;
	}

	function addTrigger() {
		if (!working || !newTriggerLabel.trim()) return;
		const id = newTriggerLabel.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
		working.triggers.push({ id, label: newTriggerLabel.trim() });
		newTriggerLabel = '';
		working = working;
	}

	function removeTrigger(idx: number) {
		if (!working) return;
		working.triggers.splice(idx, 1);
		working = working;
	}

	function addVital() {
		if (!working || !newVitalLabel.trim()) return;
		const id = newVitalLabel.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
		working.vitals.push({ id, label: newVitalLabel.trim(), unit: newVitalUnit.trim() || '', placeholder: '' });
		newVitalLabel = '';
		newVitalUnit = '';
		working = working;
	}

	function removeVital(idx: number) {
		if (!working) return;
		working.vitals.splice(idx, 1);
		working = working;
	}

	async function finalize() {
		if (!working) return;
		saving = true;

		// Auto-populate grid columns from first items
		working.gridSymptomColumns = working.symptomGroups
			.flatMap(g => g.items.map(i => i.id))
			.slice(0, 7);
		working.gridEpisodeColumns = working.episodeTypes
			.map(e => e.id)
			.slice(0, 3);

		// Auto-populate stream filters
		if (working.episodeTypes.length > 0 && !working.streamFilters.find(f => f.key === 'episode')) {
			working.streamFilters = [
				{ key: 'all', label: 'Alle' },
				{ key: 'daily_log', label: 'Protokolle' },
				{ key: 'episode', label: working.episodeTypes.length === 1 ? working.episodeTypes[0].label : 'Episoden' },
				{ key: 'event', label: 'Ereignisse' },
			];
		}

		await blueprint.save(working);
		saving = false;
		goto('/');
	}

	function nextStep() { if (step < totalSteps) step++; }
	function prevStep() { if (step > 1) step--; }

	$: allSymptoms = working ? working.symptomGroups.flatMap(g => g.items) : [];
</script>

<div class="min-h-screen bg-stone-50 dark:bg-stone-950 pb-12">
	<!-- Header -->
	<div class="bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800">
		<div class="max-w-2xl mx-auto px-4 py-6">
			<h1 class="text-2xl font-bold text-stone-900 dark:text-white">ciphra einrichten</h1>
			{#if step > 1}
				<div class="flex items-center gap-2 mt-3">
					{#each Array(totalSteps) as _, i}
						<div class="h-1.5 flex-1 rounded-full {i < step ? 'bg-indigo-500' : 'bg-stone-200 dark:bg-stone-700'}"></div>
					{/each}
					<span class="text-xs text-stone-400 ml-2">{step}/{totalSteps}</span>
				</div>
			{/if}
		</div>
	</div>

	<div class="max-w-2xl mx-auto px-4 py-6">

		<!-- STEP 1: Pick preset -->
		{#if step === 1}
			<div class="space-y-4">
				<div class="text-center mb-6">
					<h2 class="text-lg font-semibold text-stone-900 dark:text-white">Was möchten Sie dokumentieren?</h2>
					<p class="text-sm text-stone-500 dark:text-stone-400 mt-1">Wählen Sie eine Vorlage oder erstellen Sie ein eigenes Profil</p>
				</div>

				<div class="grid gap-3">
					{#each presets as preset}
						<button
							on:click={() => selectPreset(preset)}
							class="w-full text-left bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors group"
						>
							<div class="flex items-start gap-4">
								<div class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style="background: {preset.color}15">
									{#if preset.icon === 'zap'}
										<svg class="w-6 h-6" style="color: {preset.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
									{:else if preset.icon === 'brain'}
										<svg class="w-6 h-6" style="color: {preset.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-7 7c0 3 2 5.5 4 7.5S12 20 12 22c0-2 1-3.5 3-5.5s4-4.5 4-7.5a7 7 0 0 0-7-7z" stroke-width="2"/></svg>
									{:else if preset.icon === 'droplet'}
										<svg class="w-6 h-6" style="color: {preset.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" stroke-width="2"/></svg>
									{:else if preset.icon === 'battery-low'}
										<svg class="w-6 h-6" style="color: {preset.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="1" y="6" width="18" height="12" rx="2" ry="2" stroke-width="2"/><line x1="23" y1="13" x2="23" y2="11" stroke-width="2"/><line x1="5" y1="10" x2="5" y2="14" stroke-width="2"/></svg>
									{:else if preset.icon === 'cloud-lightning'}
										<svg class="w-6 h-6" style="color: {preset.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9" stroke-width="2"/><polyline points="13,11 9,17 15,17 11,23" stroke-width="2"/></svg>
									{:else}
										<svg class="w-6 h-6" style="color: {preset.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" stroke-width="2"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" stroke-width="2"/></svg>
									{/if}
								</div>
								<div>
									<h3 class="text-base font-semibold text-stone-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{preset.label}</h3>
									<p class="text-sm text-stone-500 dark:text-stone-400 mt-0.5">{preset.description}</p>
								</div>
							</div>
						</button>
					{/each}
				</div>
			</div>

		<!-- STEP 2: Customize symptoms -->
		{:else if step === 2 && working}
			<div class="space-y-5">
				<div>
					<h2 class="text-lg font-semibold text-stone-900 dark:text-white">Symptome & Anzeichen</h2>
					<p class="text-sm text-stone-500 dark:text-stone-400 mt-1">Entfernen oder ergänzen Sie Symptome nach Bedarf</p>
				</div>

				{#each working.symptomGroups as group, gi}
					<div class="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4">
						<div class="flex items-center justify-between mb-3">
							<h3 class="text-sm font-semibold text-stone-700 dark:text-stone-300">{group.label}</h3>
							<button on:click={() => removeGroup(gi)} class="text-xs text-stone-400 hover:text-red-500 min-h-[44px] px-2">Gruppe löschen</button>
						</div>
						<div class="flex flex-wrap gap-2">
							{#each group.items as item}
								<button
									on:click={() => toggleSymptom(gi, item.id)}
									class="px-3 py-1.5 rounded-full text-sm font-medium bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-500/20 dark:hover:text-red-400 transition-colors group min-h-[36px]"
								>
									{item.label} <span class="opacity-0 group-hover:opacity-100 ml-1">×</span>
								</button>
							{/each}
						</div>
						<!-- Add to this group -->
						<div class="flex gap-2 mt-3">
							<input type="text" bind:value={groupInputs[gi]} placeholder="Neues Symptom..."
								on:keydown={(e) => { if (e.key === 'Enter') addSymptomToGroup(gi); }}
								class="flex-1 px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg text-sm min-h-[44px] outline-none focus:ring-2 focus:ring-indigo-500" />
							<button on:click={() => addSymptomToGroup(gi)}
								class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 min-h-[44px]">+</button>
						</div>
					</div>
				{/each}

				<!-- Add new group -->
				<div class="flex gap-2">
					<input type="text" bind:value={newGroupLabel} placeholder="Neue Kategorie..."
						on:keydown={(e) => { if (e.key === 'Enter') addGroup(); }}
						class="flex-1 px-3 py-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg text-sm min-h-[44px] outline-none focus:ring-2 focus:ring-indigo-500" />
					<button on:click={addGroup}
						class="px-4 py-2 bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-lg text-sm font-medium hover:bg-stone-300 dark:hover:bg-stone-700 min-h-[44px]">Kategorie hinzufügen</button>
				</div>
			</div>

		<!-- STEP 3: Episodes -->
		{:else if step === 3 && working}
			<div class="space-y-5">
				<div>
					<h2 class="text-lg font-semibold text-stone-900 dark:text-white">Episoden / Anfälle</h2>
					<p class="text-sm text-stone-500 dark:text-stone-400 mt-1">Welche Episoden-Typen möchten Sie zählen?</p>
				</div>

				<div class="space-y-2">
					{#each working.episodeTypes as ep, i}
						<div class="flex items-center justify-between bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4">
							<div class="flex items-center gap-3">
								<div class="w-4 h-4 rounded-full" style="background: {ep.color}"></div>
								<span class="text-sm font-medium text-stone-900 dark:text-white">{ep.label}</span>
							</div>
							<button on:click={() => removeEpisode(i)} class="text-stone-400 hover:text-red-500 min-h-[44px] px-2 text-sm">Entfernen</button>
						</div>
					{/each}
				</div>

				<div class="flex gap-2">
					<input type="text" bind:value={newEpisodeLabel} placeholder="Neuer Episoden-Typ..."
						on:keydown={(e) => { if (e.key === 'Enter') addEpisodeType(); }}
						class="flex-1 px-3 py-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg text-sm min-h-[44px] outline-none focus:ring-2 focus:ring-indigo-500" />
					<button on:click={addEpisodeType}
						class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 min-h-[44px]">Hinzufügen</button>
				</div>

				{#if working.episodeTypes.length === 0}
					<p class="text-sm text-stone-400 dark:text-stone-500 text-center py-4">Keine Episoden-Typen. Sie können diesen Schritt überspringen, wenn Sie keine Episoden zählen möchten.</p>
				{/if}
			</div>

		<!-- STEP 4: Triggers -->
		{:else if step === 4 && working}
			<div class="space-y-5">
				<div>
					<h2 class="text-lg font-semibold text-stone-900 dark:text-white">Auslöser</h2>
					<p class="text-sm text-stone-500 dark:text-stone-400 mt-1">Welche Auslöser möchten Sie tracken?</p>
				</div>

				<div class="flex flex-wrap gap-2">
					{#each working.triggers as trig, i}
						<button
							on:click={() => removeTrigger(i)}
							class="px-3 py-1.5 rounded-full text-sm font-medium bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-500/20 dark:hover:text-red-400 transition-colors group min-h-[36px]"
						>
							{trig.label} <span class="opacity-0 group-hover:opacity-100 ml-1">×</span>
						</button>
					{/each}
				</div>

				<div class="flex gap-2">
					<input type="text" bind:value={newTriggerLabel} placeholder="Neuer Auslöser..."
						on:keydown={(e) => { if (e.key === 'Enter') addTrigger(); }}
						class="flex-1 px-3 py-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg text-sm min-h-[44px] outline-none focus:ring-2 focus:ring-indigo-500" />
					<button on:click={addTrigger}
						class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 min-h-[44px]">Hinzufügen</button>
				</div>
			</div>

		<!-- STEP 5: Vitals -->
		{:else if step === 5 && working}
			<div class="space-y-5">
				<div>
					<h2 class="text-lg font-semibold text-stone-900 dark:text-white">Vitalwerte</h2>
					<p class="text-sm text-stone-500 dark:text-stone-400 mt-1">Welche Messwerte möchten Sie erfassen?</p>
				</div>

				<div class="space-y-2">
					{#each working.vitals as vital, i}
						<div class="flex items-center justify-between bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4">
							<div>
								<span class="text-sm font-medium text-stone-900 dark:text-white">{vital.label}</span>
								{#if vital.unit}
									<span class="text-xs text-stone-400 ml-1">({vital.unit})</span>
								{/if}
							</div>
							<button on:click={() => removeVital(i)} class="text-stone-400 hover:text-red-500 min-h-[44px] px-2 text-sm">Entfernen</button>
						</div>
					{/each}
				</div>

				<div class="flex gap-2">
					<input type="text" bind:value={newVitalLabel} placeholder="Name (z.B. Blutzucker)"
						on:keydown={(e) => { if (e.key === 'Enter') addVital(); }}
						class="flex-1 px-3 py-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg text-sm min-h-[44px] outline-none focus:ring-2 focus:ring-indigo-500" />
					<input type="text" bind:value={newVitalUnit} placeholder="Einheit"
						on:keydown={(e) => { if (e.key === 'Enter') addVital(); }}
						class="w-24 px-3 py-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg text-sm min-h-[44px] outline-none focus:ring-2 focus:ring-indigo-500" />
					<button on:click={addVital}
						class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 min-h-[44px]">+</button>
				</div>
			</div>

		<!-- STEP 6: Confirm -->
		{:else if step === 6 && working}
			<div class="space-y-5">
				<div>
					<h2 class="text-lg font-semibold text-stone-900 dark:text-white">Zusammenfassung</h2>
					<p class="text-sm text-stone-500 dark:text-stone-400 mt-1">Überprüfen Sie Ihr Profil. Sie können es jederzeit später anpassen.</p>
				</div>

				<div class="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5 space-y-4">
					<div>
						<h3 class="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">Profil</h3>
						<p class="text-sm font-semibold text-stone-900 dark:text-white">{working.conditionLabel || working.conditionId}</p>
					</div>
					<div>
						<h3 class="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">Symptome</h3>
						<p class="text-sm text-stone-700 dark:text-stone-300">{allSymptoms.length} in {working.symptomGroups.length} Kategorien</p>
						<div class="flex flex-wrap gap-1 mt-1">
							{#each allSymptoms.slice(0, 10) as s}
								<span class="text-xs bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded-full text-stone-600 dark:text-stone-400">{s.label}</span>
							{/each}
							{#if allSymptoms.length > 10}
								<span class="text-xs text-stone-400">+{allSymptoms.length - 10} weitere</span>
							{/if}
						</div>
					</div>
					<div>
						<h3 class="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">Episoden</h3>
						{#if working.episodeTypes.length > 0}
							<div class="flex flex-wrap gap-2">
								{#each working.episodeTypes as ep}
									<span class="text-xs px-2 py-1 rounded-full text-white" style="background: {ep.color}">{ep.label}</span>
								{/each}
							</div>
						{:else}
							<p class="text-sm text-stone-400">Keine</p>
						{/if}
					</div>
					<div>
						<h3 class="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">Auslöser</h3>
						<p class="text-sm text-stone-700 dark:text-stone-300">{working.triggers.length} konfiguriert</p>
					</div>
					<div>
						<h3 class="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">Vitalwerte</h3>
						<p class="text-sm text-stone-700 dark:text-stone-300">{working.vitals.length} konfiguriert</p>
					</div>
				</div>
			</div>
		{/if}

		<!-- Navigation buttons -->
		{#if step > 1}
			<div class="flex gap-3 mt-8">
				<button on:click={prevStep}
					class="flex-1 py-3 bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-xl font-medium hover:bg-stone-300 dark:hover:bg-stone-700 min-h-[48px]">
					Zurück
				</button>
				{#if step < totalSteps}
					<button on:click={nextStep}
						class="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 min-h-[48px]">
						Weiter
					</button>
				{:else}
					<button on:click={finalize} disabled={saving}
						class="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:bg-stone-300 min-h-[48px]">
						{saving ? 'Speichern...' : 'Profil speichern & starten'}
					</button>
				{/if}
			</div>
		{/if}
	</div>
</div>
