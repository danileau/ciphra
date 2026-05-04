<script lang="ts">
	import { t } from '$lib/i18n';
</script>

<svelte:head>
	<title>{$t('terms.title')} — ciphra</title>
</svelte:head>

<main id="main-content" class="max-w-3xl mx-auto px-4 py-8 space-y-6">
	<header class="space-y-1">
		<h1 class="text-2xl font-bold" style="color: var(--text-primary)">{$t('terms.title')}</h1>
		<p class="text-sm" style="color: var(--text-muted)">{$t('privacy.last_updated')}: 2026-04-12</p>
	</header>

	<section class="card p-5 space-y-2">
		<h2 class="text-sm font-semibold uppercase tracking-wide" style="color: var(--text-muted)">{$t('terms.summary_heading')}</h2>
		<p class="text-sm leading-relaxed" style="color: var(--text-secondary)">{$t('terms.summary_body')}</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold" style="color: var(--text-primary)">{$t('terms.use_heading')}</h2>
		<p class="text-sm leading-relaxed" style="color: var(--text-secondary)">{$t('terms.use_body')}</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold" style="color: var(--text-primary)">{$t('terms.forbidden_heading')}</h2>
		<p class="text-sm leading-relaxed" style="color: var(--text-secondary)">{$t('terms.forbidden_body')}</p>
		<ul class="list-disc pl-6 text-sm space-y-1" style="color: var(--text-secondary)">
			<li>{$t('terms.forbidden_item_illegal')}</li>
			<li>{$t('terms.forbidden_item_harm')}</li>
			<li>{$t('terms.forbidden_item_abuse')}</li>
			<li>{$t('terms.forbidden_item_minors')}</li>
			<li>{$t('terms.forbidden_item_spam')}</li>
		</ul>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold" style="color: var(--text-primary)">{$t('terms.medical_heading')}</h2>
		<p class="text-sm leading-relaxed" style="color: var(--text-secondary)">{$t('terms.medical_body')}</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold" style="color: var(--text-primary)">{$t('terms.cooperation_heading')}</h2>
		<p class="text-sm leading-relaxed" style="color: var(--text-secondary)">{$t('terms.cooperation_body')}</p>
		<div class="rounded-xl p-4 mt-3" style="background: var(--surface-muted); border: 1px solid var(--border)">
			<p class="text-xs font-semibold uppercase tracking-wide mb-2" style="color: var(--text-muted)">{$t('terms.cooperation_we_can_heading')}</p>
			<ul class="list-disc pl-5 text-sm space-y-1" style="color: var(--text-secondary)">
				<li>{$t('terms.cooperation_we_can_1')}</li>
				<li>{$t('terms.cooperation_we_can_2')}</li>
				<li>{$t('terms.cooperation_we_can_3')}</li>
			</ul>
			<p class="text-xs font-semibold uppercase tracking-wide mt-4 mb-2" style="color: var(--text-muted)">{$t('terms.cooperation_we_cannot_heading')}</p>
			<ul class="list-disc pl-5 text-sm space-y-1" style="color: var(--text-secondary)">
				<li>{$t('terms.cooperation_we_cannot_1')}</li>
				<li>{$t('terms.cooperation_we_cannot_2')}</li>
			</ul>
		</div>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold" style="color: var(--text-primary)">{$t('terms.liability_heading')}</h2>
		<p class="text-sm leading-relaxed" style="color: var(--text-secondary)">{$t('terms.liability_body')}</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold" style="color: var(--text-primary)">{$t('terms.changes_heading')}</h2>
		<p class="text-sm leading-relaxed" style="color: var(--text-secondary)">{$t('terms.changes_body')}</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold" style="color: var(--text-primary)">{$t('terms.contact_heading')}</h2>
		<p class="text-sm leading-relaxed" style="color: var(--text-secondary)">{$t('terms.contact_body')}</p>
	</section>
</main>
