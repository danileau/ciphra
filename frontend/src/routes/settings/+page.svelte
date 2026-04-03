<script lang="ts">
	import { t } from '$lib/i18n';
	import { auth, isAuthenticated } from '$lib/stores/auth';
	import { documents } from '$lib/stores/documents';
	import { blueprint, hasBlueprint, presets } from '$lib/blueprint';
	import type { Blueprint } from '$lib/blueprint';
	import type { PresetInfo } from '$lib/blueprint';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	let showConfirmSwitch = false;
	let selectedPreset: PresetInfo | null = null;

	onMount(() => {
		if (!$isAuthenticated) goto('/login');
	});

	$: bp = $blueprint;

	function startSwitch(preset: PresetInfo) {
		selectedPreset = preset;
		showConfirmSwitch = true;
	}

	async function confirmSwitch() {
		if (!selectedPreset) return;
		// Save new blueprint but keep existing data
		const newBp = JSON.parse(JSON.stringify(selectedPreset.blueprint));
		await blueprint.save(newBp);
		showConfirmSwitch = false;
		selectedPreset = null;
	}

	function goToSetup() {
		goto('/setup');
	}

	function handleLogout() {
		auth.logout();
		goto('/login');
	}
</script>

<div class="max-w-3xl mx-auto px-4 py-6 space-y-6">
	<h1 class="text-2xl font-bold text-stone-900 dark:text-white">{$t('nav.more')}</h1>

	<!-- Current profile -->
	{#if bp}
	<section class="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5">
		<h2 class="text-sm font-medium text-stone-400 uppercase tracking-wider mb-3">Aktuelles Profil</h2>
		<div class="flex items-center justify-between">
			<div>
				<p class="text-lg font-semibold text-stone-900 dark:text-white">{bp.conditionLabel || bp.conditionId}</p>
				<p class="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
					{bp.symptomGroups.reduce((n, g) => n + g.items.length, 0)} Symptome ·
					{bp.episodeTypes.length} Episoden-Typen ·
					{bp.triggers.length} Auslöser ·
					{bp.vitals.length} Vitalwerte
				</p>
			</div>
			<div class="w-10 h-10 rounded-xl" style="background: {bp.accentColor}"></div>
		</div>
		<button
			on:click={goToSetup}
			class="mt-4 w-full py-2.5 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-xl text-sm font-medium hover:bg-stone-200 dark:hover:bg-stone-700 min-h-[44px] transition-colors"
		>
			Profil anpassen (Setup-Assistent)
		</button>
	</section>
	{/if}

	<!-- Quick switch -->
	<section class="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5">
		<h2 class="text-sm font-medium text-stone-400 uppercase tracking-wider mb-3">Vorlage wechseln</h2>
		<p class="text-sm text-stone-500 dark:text-stone-400 mb-4">Wechseln Sie zu einer anderen Vorlage. Ihre bisherigen Daten bleiben erhalten.</p>
		<div class="grid gap-2">
			{#each presets as preset}
				<button
					on:click={() => startSwitch(preset)}
					disabled={bp?.conditionId === preset.id}
					class="w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors min-h-[48px]
						{bp?.conditionId === preset.id
							? 'border-indigo-300 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-500/10'
							: 'border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700'}"
				>
					<div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: {preset.color}15">
						<div class="w-3 h-3 rounded-full" style="background: {preset.color}"></div>
					</div>
					<div class="flex-1">
						<span class="text-sm font-medium text-stone-900 dark:text-white">{preset.label}</span>
						{#if bp?.conditionId === preset.id}
							<span class="text-xs text-indigo-500 ml-2">(aktiv)</span>
						{/if}
					</div>
				</button>
			{/each}
		</div>
	</section>

	<!-- Account -->
	<section class="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5">
		<h2 class="text-sm font-medium text-stone-400 uppercase tracking-wider mb-3">Konto</h2>
		<div class="space-y-2">
			<div class="flex items-center justify-between py-2">
				<span class="text-sm text-stone-700 dark:text-stone-300">Angemeldet als</span>
				<span class="text-sm font-medium text-stone-900 dark:text-white">{$auth.username}</span>
			</div>
			<div class="flex items-center justify-between py-2">
				<span class="text-sm text-stone-700 dark:text-stone-300">Verschlüsselung</span>
				<span class="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">AES-256-GCM + Argon2id</span>
			</div>
		</div>
		<button
			on:click={handleLogout}
			class="mt-4 w-full py-2.5 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium hover:bg-red-100 dark:hover:bg-red-500/20 min-h-[44px] transition-colors"
		>
			{$t('auth.logout')}
		</button>
	</section>

	<!-- E2E badge -->
	<div class="flex items-center justify-center gap-2 py-4">
		<svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke-width="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4" stroke-width="2"/></svg>
		<span class="text-xs text-stone-400 dark:text-stone-500">{$t('encryption.badge')}</span>
	</div>
</div>

<!-- Confirm switch modal -->
{#if showConfirmSwitch && selectedPreset}
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" on:click|self={() => { showConfirmSwitch = false; }}>
	<div class="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-6 max-w-sm w-full shadow-xl">
		<h3 class="text-lg font-semibold text-stone-900 dark:text-white mb-2">Vorlage wechseln?</h3>
		<p class="text-sm text-stone-500 dark:text-stone-400 mb-4">
			Wechsel zu <strong>{selectedPreset.label}</strong>. Ihre bisherigen Daten bleiben erhalten, aber das Tagesprotokoll zeigt die neuen Felder.
		</p>
		<div class="flex gap-3">
			<button
				on:click={() => { showConfirmSwitch = false; }}
				class="flex-1 py-2.5 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-xl text-sm font-medium min-h-[44px]"
			>
				Abbrechen
			</button>
			<button
				on:click={confirmSwitch}
				class="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 min-h-[44px]"
			>
				Wechseln
			</button>
		</div>
	</div>
</div>
{/if}
