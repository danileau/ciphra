<script lang="ts">
	import { t } from '$lib/i18n';
</script>

<svelte:head>
	<title>{$t('privacy.title')} — ciphra</title>
</svelte:head>

<main class="max-w-3xl mx-auto px-4 py-8 space-y-6">
	<header class="space-y-1">
		<h1 class="text-2xl font-bold" style="color: var(--text-primary)">{$t('privacy.title')}</h1>
		<p class="text-sm" style="color: var(--text-muted)">{$t('privacy.last_updated')}: 2026-04-12</p>
	</header>

	<section class="card p-5 space-y-2">
		<h2 class="text-sm font-semibold uppercase tracking-wide" style="color: var(--text-muted)">{$t('privacy.summary_heading')}</h2>
		<p class="text-sm leading-relaxed" style="color: var(--text-secondary)">{$t('privacy.summary_body')}</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold" style="color: var(--text-primary)">{$t('privacy.controller_heading')}</h2>
		<p class="text-sm leading-relaxed" style="color: var(--text-secondary)">{$t('privacy.controller_body')}</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold" style="color: var(--text-primary)">{$t('privacy.data_heading')}</h2>
		<p class="text-sm leading-relaxed" style="color: var(--text-secondary)">{$t('privacy.data_body')}</p>
		<ul class="list-disc pl-6 text-sm space-y-1" style="color: var(--text-secondary)">
			<li>{$t('privacy.data_item_credentials')}</li>
			<li>{$t('privacy.data_item_vault')}</li>
			<li>{$t('privacy.data_item_audit')}</li>
		</ul>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold" style="color: var(--text-primary)">{$t('privacy.basis_heading')}</h2>
		<p class="text-sm leading-relaxed" style="color: var(--text-secondary)">{$t('privacy.basis_body')}</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold" style="color: var(--text-primary)">{$t('privacy.retention_heading')}</h2>
		<p class="text-sm leading-relaxed" style="color: var(--text-secondary)">{$t('privacy.retention_body')}</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold" style="color: var(--text-primary)">{$t('privacy.ondevice_heading')}</h2>
		<p class="text-sm leading-relaxed" style="color: var(--text-secondary)">{$t('privacy.ondevice_body')}</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold" style="color: var(--text-primary)">{$t('privacy.infra_heading')}</h2>
		<p class="text-sm leading-relaxed" style="color: var(--text-secondary)">{$t('privacy.infra_body')}</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold" style="color: var(--text-primary)">{$t('privacy.analytics_heading')}</h2>
		<p class="text-sm leading-relaxed" style="color: var(--text-secondary)">{$t('privacy.analytics_body')}</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold" style="color: var(--text-primary)">{$t('privacy.rights_heading')}</h2>
		<p class="text-sm leading-relaxed" style="color: var(--text-secondary)">{$t('privacy.rights_body')}</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold" style="color: var(--text-primary)">{$t('privacy.authority_heading')}</h2>
		<p class="text-sm leading-relaxed" style="color: var(--text-secondary)">{$t('privacy.authority_body')}</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold" style="color: var(--text-primary)">{$t('privacy.contact_heading')}</h2>
		<p class="text-sm leading-relaxed" style="color: var(--text-secondary)">{$t('privacy.contact_body')}</p>
	</section>
</main>
