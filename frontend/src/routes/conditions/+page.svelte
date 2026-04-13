<script lang="ts">
	import { t } from '$lib/i18n';
	import { conditionInfoMap } from '$lib/conditionInfo';
	import { conditionGroups } from '$lib/conditionGroups';
	import { iconPath } from '$lib/conditionIcons';
	import Asterisk from '$lib/components/Asterisk.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { isAuthenticated } from '$lib/stores/auth';
	import { blueprint, presets } from '$lib/blueprint';
	import { goto } from '$app/navigation';

	let switching = '';
	let toastMsg = '';
	let toastShow = false;

	async function switchBlueprint(id: string) {
		const preset = presets.find((p) => p.id === id);
		if (!preset) return;
		switching = id;
		const newBp = JSON.parse(JSON.stringify(preset.blueprint));
		const ok = await blueprint.save(newBp);
		switching = '';
		if (ok) {
			toastMsg = $t('conditions.switch_confirm', { condition: $t(preset.labelKey) });
			toastShow = true;
			setTimeout(() => { goto('/log/today'); }, 1200);
		}
	}

	function presetExists(id: string): boolean {
		return presets.some((p) => p.id === id);
	}
</script>

<svelte:head>
	<title>ciphra — {$t('condition.index_title')}</title>
	<meta name="description" content="{$t('condition.index_description')}" />
	<meta property="og:title" content="ciphra — {$t('condition.index_title')}" />
	<meta property="og:description" content="{$t('condition.index_description')}" />
</svelte:head>

{#if toastShow}
	<Toast message={toastMsg} bind:show={toastShow} />
{/if}

<div class="min-h-screen" style="background: var(--surface);">
	<main class="max-w-4xl mx-auto px-4 py-8 sm:py-12">
		<h1 class="text-3xl sm:text-4xl font-bold" style="color: var(--text-primary);">{$t('condition.index_title')}</h1>
		<p class="text-lg mt-2 mb-10" style="color: var(--text-muted);">{$t('condition.index_subtitle')}</p>

		{#each conditionGroups as group}
			<section class="mb-10">
				<header class="mb-4">
					<h2 class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">{$t(group.titleKey)}</h2>
					<p class="text-sm mt-1" style="color: var(--text-secondary);">{$t(group.descriptionKey)}</p>
				</header>
				<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{#each group.conditionIds as id}
						{@const info = conditionInfoMap[id]}
						{#if info}
							<div class="card-interactive rounded-xl p-5 group flex flex-col">
								<a href="/conditions/{id}" class="block flex-1">
									<div class="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style="background: {info.color}15; color: {info.color}">
										<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d={iconPath(info.icon)} stroke-width="2"/></svg>
									</div>
									<h3 class="text-base font-semibold transition-colors" style="color: var(--text-primary);">{$t(info.titleKey)}</h3>
									<p class="text-sm mt-1 line-clamp-2" style="color: var(--text-muted);">{$t(info.subtitleKey)}</p>
								</a>
								{#if $isAuthenticated && presetExists(id)}
									<button
										type="button"
										on:click|stopPropagation={() => switchBlueprint(id)}
										disabled={switching === id}
										class="mt-3 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
										style="background: var(--olive-light); color: var(--olive);"
									>
										{switching === id ? $t('common.loading') : $t('conditions.switch_cta')}
									</button>
								{/if}
							</div>
						{/if}
					{/each}
				</div>
			</section>
		{/each}

		<div class="asterisk-divider my-10">
			<Asterisk size={14} color="muted" />
		</div>

		<div class="text-center">
			<a
				href="/login"
				class="btn-primary inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-medium text-lg"
			>
				{$t('condition.cta_button')}
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
			</a>
		</div>
	</main>
</div>
