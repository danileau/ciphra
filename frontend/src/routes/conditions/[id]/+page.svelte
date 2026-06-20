<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { page } from '$app/stores';
	import { conditionInfoMap } from '$lib/conditionInfo';
	import type { ConditionInfo } from '$lib/conditionInfo';
	import { iconPath } from '$lib/conditionIcons';
	import Asterisk from '$lib/components/Asterisk.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { isAuthenticated } from '$lib/stores/auth';
	import { blueprint, presets } from '$lib/blueprint';
	import { goto } from '$app/navigation';
	import { get } from 'svelte/store';

	$: conditionId = $page.params.id || '';
	$: info = conditionId ? conditionInfoMap[conditionId] as ConditionInfo | undefined : undefined;
	$: title = info ? $t(info.titleKey) : '';
	$: subtitle = info ? $t(info.subtitleKey) : '';
	$: relatedInfos = (info?.relatedConditions || [])
		.map(id => conditionInfoMap[id])
		.filter(Boolean);
	$: matchingPreset = presets.find((p) => p.id === conditionId);

	let switching = false;
	let toastMsg = '';
	let toastShow = false;

	async function switchBlueprint() {
		if (!matchingPreset) return;
		const current = get(blueprint);
		// You already track this condition — NEVER reset your own data. Switching
		// to the condition you already have used to clone a bare preset over your
		// blueprint, wiping your medication list + custom items. Just go to today.
		if (current && current.conditionId === matchingPreset.blueprint.conditionId) {
			goto('/log/today');
			return;
		}
		// A real switch replaces the condition's symptom/trigger/vital setup —
		// confirm it, since it's destructive.
		if (current && typeof confirm === 'function' && !confirm($t('conditions.switch_warn'))) return;
		switching = true;
		const newBp = JSON.parse(JSON.stringify(matchingPreset.blueprint));
		// Carry over the user's own data that isn't condition-specific so a switch
		// never silently deletes it: their medication list and custom items.
		if (current) {
			if (current.medications?.length) newBp.medications = JSON.parse(JSON.stringify(current.medications));
			if (current.customizations) newBp.customizations = JSON.parse(JSON.stringify(current.customizations));
		}
		const ok = await blueprint.save(newBp);
		switching = false;
		if (ok) {
			toastMsg = $t('conditions.switch_confirm', { condition: $t(matchingPreset.labelKey) });
			toastShow = true;
			setTimeout(() => { goto('/log/today'); }, 1200);
		}
	}
</script>

<svelte:head>
	{#if info}
		<title>{title} — ciphra | {$t('condition.seo_suffix')}</title>
		<meta name="description" content="{subtitle} — {$t('condition.seo_description')}" />
		<meta property="og:title" content="{title} — ciphra" />
		<meta property="og:description" content={subtitle} />
		<meta property="og:type" content="article" />
		<meta property="og:url" content="https://ciphra.ch/conditions/{conditionId}" />
		<meta name="twitter:card" content="summary" />
		<meta name="twitter:title" content="{title} — ciphra" />
		<meta name="twitter:description" content={subtitle} />
		<!-- JSON-LD structured data. Defensive `</` → `<\/` escape so a
		     condition title containing the literal closing-script-tag
		     can't break out of the JSON-LD context (security review,
		     PI v13). Marginal in practice since `title` is preset
		     metadata, but the escape is free. -->
		{@html `<script type="application/ld+json">${JSON.stringify({
			"@context": "https://schema.org",
			"@type": "MedicalWebPage",
			"name": title,
			"description": subtitle,
			"url": `https://ciphra.ch/conditions/${conditionId}`,
			"about": {
				"@type": "MedicalCondition",
				"name": title
			},
			"publisher": {
				"@type": "Organization",
				"name": "ciphra",
				"url": "https://ciphra.ch"
			}
		}).replace(/<\//g, '<\\/')}</script>`}
	{/if}
</svelte:head>

{#if toastShow}
	<Toast message={toastMsg} bind:show={toastShow} />
{/if}

{#if !info}
	<div class="min-h-screen flex items-center justify-center" style="background: var(--surface);">
		<div class="text-center">
			<p class="text-4xl font-bold mb-2" style="color: var(--border);">404</p>
			<p style="color: var(--text-muted);">{$t('condition.not_found')}</p>
			<a href="/" class="mt-4 inline-block" style="color: var(--brand);">{$t('condition.back_home')}</a>
		</div>
	</div>
{:else}
	<!-- CSS-var override scopes the page's --brand to the condition's own
	     palette tone. Every var(--brand) / var(--brand-light) inside this
	     subtree (back link, vitals tile, PubMed links, scale chevrons,
	     CTA shadow) re-resolves to info.color without per-site edits.
	     The layout's nav header sits OUTSIDE this wrapper so it keeps
	     invariant rust — nav chrome stays brand. -->
	<div
		class="min-h-screen"
		style="background: var(--surface);
		       --brand: {info.color};
		       --brand-light: {info.color}1a;"
	>
		<main id="main-content" class="layout-default py-8 sm:py-12">
			<a href="/#conditions" class="text-sm mb-6 inline-block transition-colors" style="color: var(--brand);">&larr; {$t('condition.index_title')}</a>
			<div class="flex items-center gap-4 mb-4">
				<div
					class="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
					style="background: linear-gradient(135deg, {info.color}26, {info.color}10);
					       color: {info.color};
					       border: 1px solid {info.color}40;"
				>
					<svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d={iconPath(info.icon)} stroke-width="2.2"/></svg>
				</div>
				<div>
					<h1 class="text-3xl sm:text-4xl font-bold" style="color: var(--text-primary);">{title}</h1>
					<p class="text-lg mt-1" style="color: var(--text-muted);">{subtitle}</p>
				</div>
			</div>
			{#if $isAuthenticated && matchingPreset}
				<div class="mb-8 card-olive rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
					<p class="text-sm" style="color: var(--text-primary);">{$t('conditions.switch_logged_in_hint')}</p>
					<button
						type="button"
						on:click={switchBlueprint}
						disabled={switching}
						class="btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm disabled:opacity-50"
					>
						{switching ? $t('common.loading') : $t('conditions.switch_cta')}
					</button>
				</div>
			{/if}
			<!-- Introduction -->
			<article class="prose max-w-none mb-12">
				<p class="text-lg leading-relaxed" style="color: var(--text-secondary);">{$t(info.introKey)}</p>
			</article>

			<!-- What ciphra tracks -->
			<section class="mb-12">
				<h2 class="text-2xl font-bold mb-6" style="color: var(--text-primary);">{$t('condition.what_tracked')}</h2>

				<div class="grid gap-6">
					{#each info.symptomGroups as group}
						<div class="card rounded-xl p-6">
							<h3 class="text-lg font-semibold mb-2" style="color: var(--text-primary);">{$t(group.labelKey)}</h3>
							<p class="text-sm mb-4" style="color: var(--text-secondary);">{$t(group.rationaleKey)}</p>
							<div class="flex flex-wrap gap-2">
								{#each group.items as itemKey}
									<span class="px-3 py-1.5 rounded-full text-sm" style="background: {info.color}1a; color: {info.color}; border: 1px solid {info.color}33;">{$t(itemKey)}</span>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</section>

			<!-- Episodes, Triggers, Vitals -->
			<section class="mb-12 grid sm:grid-cols-3 gap-6">
				<div class="card rounded-xl p-6">
					<div class="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style="background: rgba(var(--danger-rgb),0.1);">
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--danger);"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10" stroke-width="2"/></svg>
					</div>
					<h3 class="text-base font-semibold mb-2" style="color: var(--text-primary);">{$t('condition.section_episodes')}</h3>
					<p class="text-sm" style="color: var(--text-secondary);">{$t(info.episodesKey)}</p>
				</div>
				<div class="card rounded-xl p-6">
					<div class="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style="background: {info.color}1f;">
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: {info.color};"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke-width="2"/><line x1="12" y1="9" x2="12" y2="13" stroke-width="2"/><line x1="12" y1="17" x2="12.01" y2="17" stroke-width="2"/></svg>
					</div>
					<h3 class="text-base font-semibold mb-2" style="color: var(--text-primary);">{$t('condition.section_triggers')}</h3>
					<p class="text-sm" style="color: var(--text-secondary);">{$t(info.triggersKey)}</p>
				</div>
				<div class="card rounded-xl p-6">
					<div class="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style="background: var(--brand-light);">
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--brand);"><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</div>
					<h3 class="text-base font-semibold mb-2" style="color: var(--text-primary);">{$t('condition.section_vitals')}</h3>
					<p class="text-sm" style="color: var(--text-secondary);">{$t(info.vitalsKey)}</p>
				</div>
			</section>

			<!-- Clinical scales -->
			<section class="mb-12">
				<h2 class="text-2xl font-bold mb-6" style="color: var(--text-primary);">{$t('condition.clinical_basis')}</h2>
				<div class="rounded-xl" style="overflow: hidden; background: {info.color}14; border: 1px solid {info.color}26;">
					{#each info.scales as scale, i}
						<div class="p-5" style="{i > 0 ? `border-top: 1px solid ${info.color}26;` : ''}">
							<div class="flex items-start justify-between gap-4">
								<div>
									<h3 class="text-base font-semibold" style="color: var(--text-primary);">{$t(scale.nameKey)}</h3>
									<p class="text-sm mt-1" style="color: var(--text-secondary);">{$t(scale.descriptionKey)}</p>
								</div>
								{#if scale.url}
									<a
										href={scale.url}
										target="_blank"
										rel="noopener noreferrer"
										class="shrink-0 text-xs flex items-center gap-1 mt-1 transition-colors"
										style="color: var(--brand);"
									>
										PubMed
										<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke-width="2"/><polyline points="15,3 21,3 21,9" stroke-width="2"/><line x1="10" y1="14" x2="21" y2="3" stroke-width="2"/></svg>
									</a>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</section>

			<!-- For your doctor -->
			<section class="mb-12">
				<h2 class="text-2xl font-bold mb-4" style="color: var(--text-primary);">{$t('condition.for_doctor_title')}</h2>
				<div class="rounded-xl p-6" style="background: {info.color}14; border: 1px solid {info.color}26;">
					<div class="flex items-start gap-3">
						<svg class="w-6 h-6 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: {info.color};"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke-width="2"/><polyline points="14,2 14,8 20,8" stroke-width="2"/></svg>
						<p class="text-sm leading-relaxed" style="color: {info.color};">{$t(info.forDoctorKey)}</p>
					</div>
				</div>
			</section>

			<!-- Privacy -->
			<section class="mb-12">
				<h2 class="text-2xl font-bold mb-4" style="color: var(--text-primary);">{$t('condition.privacy_title')}</h2>
				<div class="card-olive rounded-xl p-6">
					<div class="grid sm:grid-cols-3 gap-4">
						<div class="text-center">
							<div class="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2" style="background: rgba(127,130,27,0.15);">
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--olive);"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke-width="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4" stroke-width="2"/></svg>
							</div>
							<p class="text-sm font-medium" style="color: var(--text-primary);">{$t('condition.privacy_e2e')}</p>
							<p class="text-xs mt-1" style="color: var(--text-muted);">{$t('condition.privacy_e2e_desc')}</p>
						</div>
						<div class="text-center">
							<div class="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2" style="background: rgba(127,130,27,0.15);">
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--olive);"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke-width="2"/></svg>
							</div>
							<p class="text-sm font-medium" style="color: var(--text-primary);">{$t('condition.privacy_zero')}</p>
							<p class="text-xs mt-1" style="color: var(--text-muted);">{$t('condition.privacy_zero_desc')}</p>
						</div>
						<div class="text-center">
							<div class="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2" style="background: rgba(127,130,27,0.15);">
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--olive);"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke-width="2"/></svg>
							</div>
							<p class="text-sm font-medium" style="color: var(--text-primary);">{$t('condition.privacy_yours')}</p>
							<p class="text-xs mt-1" style="color: var(--text-muted);">{$t('condition.privacy_yours_desc')}</p>
						</div>
					</div>
				</div>
			</section>

			<!-- Related conditions -->
			{#if relatedInfos.length > 0}
			<section class="mb-12">
				<h2 class="text-2xl font-bold mb-4" style="color: var(--text-primary);">{$t('condition.related')}</h2>
				<div class="grid sm:grid-cols-3 gap-3">
					{#each relatedInfos as related}
						<a
							href="/conditions/{related.id}"
							class="card-interactive rounded-xl p-4"
						>
							<div class="flex items-center gap-3">
								<div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: {related.color}15; color: {related.color}">
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d={iconPath(related.icon)} stroke-width="2"/></svg>
								</div>
								<span class="text-sm font-medium" style="color: var(--text-primary);">{$t(related.titleKey)}</span>
							</div>
						</a>
					{/each}
				</div>
			</section>
			{/if}

			<!-- Divider -->
			<div class="asterisk-divider my-8">
				<Asterisk size={14} color="muted" />
			</div>

			<!-- CTA -->
			<section class="text-center py-8">
				<h2 class="text-2xl font-bold mb-3" style="color: var(--text-primary);">{$t('condition.cta_title')}</h2>
				<p class="mb-6 max-w-lg mx-auto" style="color: var(--text-muted);">{$t('condition.cta_subtitle')}</p>
				<a
					href="/login"
					class="btn-primary inline-flex items-center gap-2 px-8 py-3 rounded-xl font-medium text-lg"
				>
					{$t('condition.cta_button')}
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</a>
			</section>
		</main>

		<!-- CIPH-917 — inline footer (cross-link to other conditions +
			 disclaimer) removed. PublicFooter from +layout.svelte now
			 covers the disclaimer (`landing.disclaimer_medical`); the
			 cross-link list was the "sumup layer" duplicated against
			 the merged landing #conditions catalogue. -->
	</div>
{/if}
