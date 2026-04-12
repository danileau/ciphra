<script lang="ts">
	import { t } from '$lib/i18n';
	import { conditionInfoMap, conditionIds } from '$lib/conditionInfo';
	import { iconPath } from '$lib/conditionIcons';
	import Asterisk from '$lib/components/Asterisk.svelte';
</script>

<svelte:head>
	<title>ciphra — {$t('condition.index_title')}</title>
	<meta name="description" content="{$t('condition.index_description')}" />
	<meta property="og:title" content="ciphra — {$t('condition.index_title')}" />
	<meta property="og:description" content="{$t('condition.index_description')}" />
</svelte:head>

<div class="min-h-screen" style="background: var(--surface);">
	<main class="max-w-4xl mx-auto px-4 py-8 sm:py-12">
		<h1 class="text-3xl sm:text-4xl font-bold" style="color: var(--text-primary);">{$t('condition.index_title')}</h1>
		<p class="text-lg mt-2 mb-8" style="color: var(--text-muted);">{$t('condition.index_subtitle')}</p>
		<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
			{#each conditionIds as id}
				{@const info = conditionInfoMap[id]}
				<a
					href="/conditions/{id}"
					class="card-interactive rounded-xl p-5 group"
				>
					<div class="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style="background: {info.color}15; color: {info.color}">
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d={iconPath(info.icon)} stroke-width="2"/></svg>
					</div>
					<h2 class="text-base font-semibold transition-colors" style="color: var(--text-primary);">{$t(info.titleKey)}</h2>
					<p class="text-sm mt-1 line-clamp-2" style="color: var(--text-muted);">{$t(info.subtitleKey)}</p>
				</a>
			{/each}
		</div>

		<!-- Divider -->
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
