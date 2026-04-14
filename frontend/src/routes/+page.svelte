<script lang="ts">
	import { isAuthenticated, authReady } from '$lib/stores/auth';
	import { t, locale, locales, localeNames } from '$lib/i18n';
	import type { Locale } from '$lib/i18n';
	import Companion from '$lib/components/Companion.svelte';
	import Asterisk from '$lib/components/Asterisk.svelte';
	import { presets } from '$lib/blueprint/presets';
	import EncryptionDemo from '$lib/components/EncryptionDemo.svelte';
	import { iconPaths, iconPath } from '$lib/conditionIcons';
	import { conditionGroups } from '$lib/conditionGroups';
	import { conditionInfoMap } from '$lib/conditionInfo';

	let showTechnicalDetails = false;

	function setLocale(e: Event) {
		const val = /** @type {HTMLSelectElement} */ (e.currentTarget as HTMLSelectElement).value;
		locale.set(val);
	}
</script>

<svelte:head>
	{#if !$isAuthenticated}
		<title>ciphra — encrypted by design</title>
		<meta name="description" content={$t('landing.meta_description')} />
	{/if}
</svelte:head>

{#if $authReady && $isAuthenticated}
	<Companion />
{:else if $authReady}

<a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:outline-none" style="background: var(--brand); color: white;">
	{$t('landing.skip_to_content')}
</a>

<!-- Navigation -->
<nav class="sticky top-0 z-40 backdrop-blur-sm" style="border-bottom: 1px solid var(--border); background: rgba(255,255,255,0.85);">
	<div class="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
		<a href="/" class="flex items-center gap-1">
			<svg viewBox="0 0 150 36" class="h-7" aria-hidden="true">
				<text x="0" y="27" font-family="Inter, DM Sans, sans-serif" font-size="26" font-weight="500" letter-spacing="0.5" style="fill: var(--text-primary)">ciphra</text>
				<g transform="translate(98,8) rotate(8)" style="stroke: var(--brand)" stroke-linecap="round" fill="none">
					<path d="M -5 0 L 5 0" stroke-width="1.3"/>
					<path d="M -2 -3.5 L 2 3.5" stroke-width="1"/>
					<path d="M 2 -3.3 L -2 3.3" stroke-width="0.9"/>
				</g>
			</svg>
		</a>
		<div class="flex items-center gap-3">
			<div class="hidden md:flex items-center gap-1">
				<a href="#how" class="text-sm font-medium min-h-[44px] flex items-center px-3 transition-colors" style="color: var(--text-secondary);">{$t('landing.nav_how')}</a>
				<a href="#security" class="text-sm font-medium min-h-[44px] flex items-center px-3 transition-colors" style="color: var(--text-secondary);">{$t('landing.nav_security')}</a>
			</div>
			<div class="w-px h-6 hidden md:block" style="background: var(--border);"></div>
			<select
				class="text-xs rounded-lg px-2 py-1.5 min-h-[36px]"
				style="background: var(--surface-card); border: 1px solid var(--border); color: var(--text-secondary);"
				value={$locale}
				on:change={setLocale}
			>
				{#each locales as l}
					<option value={l}>{localeNames[l]}</option>
				{/each}
			</select>
			<a href="/login" class="hidden sm:inline-flex text-sm font-medium min-h-[44px] items-center px-3" style="color: var(--text-secondary);">
				{$t('auth.login')}
			</a>
			<a href="/login?mode=register" class="btn-primary min-h-[44px] px-5 text-sm font-semibold rounded-lg">
				{$t('landing.hero_cta')}
			</a>
		</div>
	</div>
</nav>

<main id="main-content" style="background: var(--surface);">

	<!-- ===== HERO ===== -->
	<section class="relative overflow-hidden" style="background: var(--surface);">
		<div class="relative max-w-5xl mx-auto px-6 py-24 sm:py-32 md:py-40 lg:py-48">
			<div class="max-w-2xl">
				<!-- Wordmark -->
				<svg viewBox="0 0 220 50" class="h-12 sm:h-16 mb-8" aria-hidden="true">
					<text x="0" y="36" font-family="Inter, DM Sans, sans-serif" font-size="36" font-weight="500" letter-spacing="1" style="fill: var(--text-primary)">ciphra</text>
					<g transform="translate(134,12) rotate(8)" style="stroke: var(--brand)" stroke-linecap="round" fill="none">
						<path d="M -6.5 0 L 6.5 0" stroke-width="1.5"/>
						<path d="M -2.7 -4.6 L 2.7 4.6" stroke-width="1.2"/>
						<path d="M 2.6 -4.4 L -2.6 4.4" stroke-width="1.1"/>
					</g>
				</svg>

				<!-- Tagline + subtagline — one brand line, one "what" line.
					 Subtagline replaces the audit-risky "for every condition"
					 claim with a specific, defensible promise. -->
				<h1 class="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-3" style="color: var(--text-primary);">
					{$t('landing.tagline')}
				</h1>
				<p class="text-xl sm:text-2xl leading-snug mb-6 max-w-xl font-medium" style="color: var(--brand);">
					{$t('landing.subtagline')}
				</p>

				<p class="text-lg sm:text-xl leading-relaxed mb-4 max-w-xl font-light" style="color: var(--text-secondary);">
					{@html $t('landing.hero_subtitle', { strong_start: `<strong class="font-semibold" style="color: var(--text-primary)">`, strong_end: '</strong>' })}
				</p>
				<p class="text-base leading-relaxed mb-10 max-w-xl" style="color: var(--text-muted);">
					{$t('landing.hero_detail')}
				</p>

				<div class="flex flex-wrap gap-4 mb-8">
					<a href="/login?mode=register" class="btn-primary min-h-[52px] px-8 font-semibold rounded-xl text-base shadow-lg transition-colors" style="box-shadow: 0 4px 14px rgba(178,60,44,0.2);">
						{$t('landing.hero_cta')}
					</a>
					<a href="#how" class="btn-secondary min-h-[52px] px-8 font-medium rounded-xl text-base gap-2 transition-colors" style="border: 1px solid var(--border);">
						{$t('landing.hero_learn_more')}
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 14l-7 7m0 0l-7-7m7 7V3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</a>
				</div>

				<!-- Named-chips row: answers the "does it work for mine?"
					 bounce. Each chip is a real link into the condition detail
					 page. Keeps the "build your own" promise concrete. -->
				<div class="mb-14 text-sm" style="color: var(--text-muted);">
					<p class="font-medium mb-3" style="color: var(--text-secondary);">{$t('landing.chips_prefix')}</p>
					<!-- Group chips: one per group, auto-derived from conditionGroups.
						 Mobile: horizontal scroll. Desktop: 4-col grid. -->
					<div class="flex gap-2 overflow-x-auto pb-2 sm:grid sm:grid-cols-4 sm:overflow-visible sm:pb-0">
						{#each conditionGroups as group}
							{@const firstInfo = conditionInfoMap[group.conditionIds[0]]}
							<a
								href="/conditions#group-{group.id}"
								title={$t(group.descriptionKey)}
								class="inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-colors hover:underline shrink-0 whitespace-nowrap sm:whitespace-normal"
								style="background: var(--surface-card); border: 1px solid var(--border); color: var(--text-secondary);"
							>
								{#if firstInfo}
									<svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: {firstInfo.color}" aria-hidden="true">
										<path d={iconPath(firstInfo.icon)} stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
									</svg>
								{/if}
								<span>{$t(group.titleKey)}</span>
							</a>
						{/each}
					</div>
					<p class="mt-2" style="color: var(--text-muted);">— {$t('landing.chips_custom')}</p>
				</div>

				<!-- Encryption badges -->
				<div class="flex flex-wrap items-center gap-5 text-sm" style="color: var(--text-muted);">
					<div class="flex items-center gap-2">
						<div class="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style="background: var(--olive-light); color: var(--olive);">
							<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke-width="2"/></svg>
							<span class="text-xs font-medium">{$t('landing.hero_badge_crypto')}</span>
						</div>
					</div>
					<div class="flex items-center gap-2">
						<div class="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style="background: var(--olive-light); color: var(--olive);">
							<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke-width="2" stroke-linecap="round"/><polyline points="22,4 12,14.01 9,11.01" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
							<span class="text-xs font-medium">{$t('landing.hero_badge_zk')}</span>
						</div>
					</div>
					<div class="flex items-center gap-2">
						<div class="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style="background: var(--olive-light); color: var(--olive);">
							<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke-width="2" stroke-linecap="round"/><polyline points="22,4 12,14.01 9,11.01" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
							<span class="text-xs font-medium">{$t('landing.hero_badge_opensource')}</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- ===== HOW IT WORKS ===== -->
	<section class="py-20 md:py-28" id="how" style="background: var(--surface-card); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);">
		<div class="max-w-5xl mx-auto px-6">
			<div class="text-center mb-16">
				<h2 class="text-3xl md:text-4xl font-bold tracking-tight mb-4" style="color: var(--text-primary);">{$t('landing.how_title')}</h2>
				<p class="text-lg max-w-xl mx-auto" style="color: var(--text-muted);">{$t('landing.how_subtitle')}</p>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
				<!-- Step 1 -->
				<div class="relative">
					<div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm mb-6" style="background: var(--ochre-light); color: var(--ochre);">1</div>
					<h3 class="text-xl font-bold mb-3" style="color: var(--text-primary);">{$t('landing.how_step1_title')}</h3>
					<p class="leading-relaxed text-base" style="color: var(--text-muted);">{$t('landing.how_step1_desc')}</p>
				</div>

				<!-- Step 2 -->
				<div class="relative">
					<div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm mb-6" style="background: var(--ochre-light); color: var(--ochre);">2</div>
					<h3 class="text-xl font-bold mb-3" style="color: var(--text-primary);">{$t('landing.how_step2_title')}</h3>
					<p class="leading-relaxed text-base" style="color: var(--text-muted);">{$t('landing.how_step2_desc')}</p>
				</div>

				<!-- Step 3 -->
				<div class="relative">
					<div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm mb-6" style="background: var(--ochre-light); color: var(--ochre);">3</div>
					<h3 class="text-xl font-bold mb-3" style="color: var(--text-primary);">{$t('landing.how_step3_title')}</h3>
					<p class="leading-relaxed text-base" style="color: var(--text-muted);">{$t('landing.how_step3_desc')}</p>
				</div>
			</div>
		</div>
	</section>

	<!-- ===== CONDITIONS GRID ===== -->
	<section class="py-20 md:py-28" id="conditions" style="background: var(--surface); border-bottom: 1px solid var(--border);">
		<div class="max-w-5xl mx-auto px-6">
			<div class="text-center mb-16">
				<h2 class="text-3xl md:text-4xl font-bold tracking-tight mb-4" style="color: var(--text-primary);">
					{$t('landing.templates_title_1')} <span style="color: var(--brand);">{$t('landing.templates_title_2')}</span>
				</h2>
				<p class="text-lg max-w-xl mx-auto" style="color: var(--text-muted);">{$t('landing.templates_subtitle')}</p>
			</div>

			<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
				{#each presets as preset}
					{#if preset.id === 'custom'}
						<!-- Custom card -->
						<div class="rounded-xl p-5 flex flex-col items-center justify-center text-center transition-colors min-h-[140px]" style="border: 2px dashed var(--border); cursor: default;">
							<div class="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style="background: var(--surface-muted);">
								<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted);"><path d="M12 5v14m-7-7h14"/></svg>
							</div>
							<h3 class="font-semibold text-sm mb-1" style="color: var(--text-primary);">{$t(preset.labelKey)}</h3>
							<p class="text-xs leading-snug" style="color: var(--text-muted);">{$t(preset.descriptionKey)}</p>
						</div>
					{:else}
						<!-- Condition card -->
						<a href="/conditions/{preset.id}" class="card-interactive rounded-xl p-5 min-h-[140px] block group">
							<div class="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style="background: {preset.color}12">
								<svg class="w-5 h-5" fill="none" stroke={preset.color} stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
									<path d="{iconPaths[preset.icon] || iconPaths['heart']}"/>
								</svg>
							</div>
							<h3 class="font-semibold text-sm mb-1 transition-colors" style="color: var(--text-primary);">{$t(preset.labelKey)}</h3>
							<p class="text-xs leading-snug" style="color: var(--text-muted);">{$t(preset.descriptionKey)}</p>
						</a>
					{/if}
				{/each}
			</div>

				<div class="text-center mt-8">
					<a href="/conditions" class="inline-flex items-center gap-2 text-sm font-medium transition-colors" style="color: var(--brand);">
						{$t('condition.index_title')}
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</a>
				</div>
		</div>
	</section>

	<!-- ===== SECURITY ===== -->
	<section class="py-20 md:py-28" id="security" style="background: var(--surface-card); border-bottom: 1px solid var(--border);">
		<div class="max-w-5xl mx-auto px-6">
			<div class="flex items-start gap-5 mb-12">
				<div class="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0" style="background: var(--ochre-light);">
					<svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--ochre);"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke-width="2"/></svg>
				</div>
				<div>
					<h2 class="text-3xl md:text-4xl font-bold tracking-tight" style="color: var(--text-primary);">{$t('landing.security_title')}</h2>
					<p class="text-lg mt-2 max-w-2xl" style="color: var(--text-muted);">{$t('landing.security_subtitle')}</p>
				</div>
			</div>

			<!-- Key hierarchy -->
			<div class="rounded-xl p-6 md:p-8 mb-8" style="background: var(--surface-muted); border: 1px solid var(--border);">
				<h3 class="font-bold text-lg mb-6" style="color: var(--text-primary);">{$t('landing.security_hierarchy_title')}</h3>
				<div class="font-mono text-sm leading-relaxed overflow-x-auto" style="color: var(--ochre);">
					<pre class="whitespace-pre">{$t('landing.security_hierarchy_password')}
  |
  +-- Argon2id (":AUTH")  --> {$t('landing.security_hierarchy_auth')}
  |
  +-- Argon2id (":VAULT") --> {$t('landing.security_hierarchy_vault')}

{$t('landing.security_hierarchy_master')}
  +-- AES-256-GCM --> {$t('landing.security_hierarchy_aes')}
  |     {$t('landing.security_hierarchy_never')}
  |
  +-- {$t('landing.security_hierarchy_recovery')}</pre>
				</div>
			</div>

			<!-- What server sees vs can't -->
			<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
				<div class="rounded-xl p-6" style="background: var(--surface-muted); border: 1px solid var(--border);">
					<div class="flex items-center gap-2 mb-4">
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--ochre);"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke-width="2"/></svg>
						<h3 class="font-bold" style="color: var(--text-primary);">{$t('landing.security_server_sees')}</h3>
					</div>
					<ul class="space-y-2.5 text-sm" style="color: var(--text-secondary);">
						<li class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full" style="background: var(--ochre);"></span> {$t('landing.security_server_sees_1')}</li>
						<li class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full" style="background: var(--ochre);"></span> {$t('landing.security_server_sees_2')}</li>
						<li class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full" style="background: var(--ochre);"></span> {$t('landing.security_server_sees_3')}</li>
						<li class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full" style="background: var(--ochre);"></span> {$t('landing.security_server_sees_4')}</li>
					</ul>
				</div>
				<div class="rounded-xl p-6" style="background: var(--surface-muted); border: 1px solid var(--border);">
					<div class="flex items-center gap-2 mb-4">
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--brand);"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="1" y1="1" x2="23" y2="23" stroke-width="2" stroke-linecap="round"/></svg>
						<h3 class="font-bold" style="color: var(--text-primary);">{$t('landing.security_server_not')}</h3>
					</div>
					<ul class="space-y-2.5 text-sm" style="color: var(--text-secondary);">
						<li class="flex items-center gap-2"><svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--brand);"><path d="M18 6L6 18M6 6l12 12" stroke-width="2.5" stroke-linecap="round"/></svg> {$t('landing.security_server_not_1')}</li>
						<li class="flex items-center gap-2"><svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--brand);"><path d="M18 6L6 18M6 6l12 12" stroke-width="2.5" stroke-linecap="round"/></svg> {$t('landing.security_server_not_2')}</li>
						<li class="flex items-center gap-2"><svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--brand);"><path d="M18 6L6 18M6 6l12 12" stroke-width="2.5" stroke-linecap="round"/></svg> {$t('landing.security_server_not_3')}</li>
						<li class="flex items-center gap-2"><svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--brand);"><path d="M18 6L6 18M6 6l12 12" stroke-width="2.5" stroke-linecap="round"/></svg> {$t('landing.security_server_not_4')}</li>
					</ul>
				</div>
			</div>
		</div>
	</section>

	<!-- ===== TECHNICAL DETAILS (expandable) ===== -->
	<section class="py-20 md:py-28" id="technical" style="background: var(--surface); border-bottom: 1px solid var(--border);">
		<div class="max-w-5xl mx-auto px-6">
			<!-- Toggle button -->
			<div class="text-center">
				<button
					type="button"
					on:click={() => showTechnicalDetails = !showTechnicalDetails}
					class="rounded-full px-6 py-3 font-semibold text-sm transition-all duration-200 inline-flex items-center gap-2"
					style="border: 1px solid var(--border); color: var(--text-secondary); background: var(--surface-card);"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					{showTechnicalDetails ? $t('tech.toggle_hide') : $t('tech.toggle_show')}
					<svg class="w-4 h-4 transition-transform duration-200" class:rotate-180={showTechnicalDetails} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</button>
			</div>

			{#if showTechnicalDetails}
			<div class="mt-12 space-y-16">

				<!-- Section A: Architecture Overview -->
				<div>
					<h3 class="text-2xl md:text-3xl font-bold tracking-tight mb-8" style="color: var(--text-primary);">{$t('tech.architecture_title')}</h3>
					<div class="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-6 items-center">
						<!-- Client card -->
						<div class="card rounded-xl p-6" style="border-left: 4px solid var(--ochre);">
							<h4 class="font-bold text-lg mb-4" style="color: var(--text-primary);">{$t('tech.client_title')}</h4>
							<ul class="space-y-2">
								{#each $t('tech.client_items').split(', ') as item}
									<li class="flex items-center gap-2">
										<span class="w-1.5 h-1.5 rounded-full" style="background: var(--ochre);"></span>
										<span class="font-mono text-sm px-2 py-0.5 rounded" style="background: var(--surface-muted); color: var(--text-secondary);">{item}</span>
									</li>
								{/each}
							</ul>
							<div class="mt-4 pt-4" style="border-top: 1px solid var(--border-subtle);">
								<div class="flex items-center gap-2 text-sm font-medium" style="color: var(--ochre);">
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 14l-7 7m0 0l-7-7m7 7V3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
									{$t('tech.client_note')}
								</div>
							</div>
						</div>
						<!-- Arrow -->
						<div class="hidden md:flex flex-col items-center gap-2" style="color: var(--text-muted);">
							<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 16l-4-4m0 0l4-4m-4 4h18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
							<span class="font-mono text-xs px-2 py-1 rounded" style="background: var(--surface-inset); color: var(--text-secondary);">HTTPS</span>
							<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 8l4 4m0 0l-4 4m4-4H3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
						</div>
						<!-- Mobile arrow -->
						<div class="md:hidden flex justify-center" style="color: var(--text-muted);">
							<div class="flex items-center gap-2">
								<svg class="w-5 h-5 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 16l-4-4m0 0l4-4m-4 4h18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
								<span class="font-mono text-xs px-2 py-1 rounded" style="background: var(--surface-inset); color: var(--text-secondary);">HTTPS</span>
								<svg class="w-5 h-5 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 8l4 4m0 0l-4 4m4-4H3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
							</div>
						</div>
						<!-- Server card -->
						<div class="card rounded-xl p-6" style="border-left: 4px solid var(--brand);">
							<h4 class="font-bold text-lg mb-4" style="color: var(--text-primary);">{$t('tech.server_title')}</h4>
							<ul class="space-y-2">
								{#each $t('tech.server_items').split(', ') as item}
									<li class="flex items-center gap-2">
										<span class="w-1.5 h-1.5 rounded-full" style="background: var(--brand);"></span>
										<span class="font-mono text-sm px-2 py-0.5 rounded" style="background: var(--surface-muted); color: var(--text-secondary);">{item}</span>
									</li>
								{/each}
							</ul>
							<div class="mt-4 pt-4" style="border-top: 1px solid var(--border-subtle);">
								<div class="flex items-center gap-2 text-sm font-medium" style="color: var(--brand);">
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 14l-7 7m0 0l-7-7m7 7V3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
									{$t('tech.server_note')}
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Section B: Encryption Flow -->
				<div>
					<h3 class="text-2xl md:text-3xl font-bold tracking-tight mb-8" style="color: var(--text-primary);">{$t('tech.flow_title')}</h3>
					<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
						{#each [
							{ num: 1, titleKey: 'tech.flow_register_title', descKey: 'tech.flow_register_desc', borderColor: 'var(--ochre)' },
							{ num: 2, titleKey: 'tech.flow_login_title', descKey: 'tech.flow_login_desc', borderColor: 'var(--brand)' },
							{ num: 3, titleKey: 'tech.flow_storage_title', descKey: 'tech.flow_storage_desc', borderColor: 'var(--ochre)' },
							{ num: 4, titleKey: 'tech.flow_recovery_title', descKey: 'tech.flow_recovery_desc', borderColor: 'var(--brand)' }
						] as step}
							<div class="card rounded-xl p-6" style="border-left: 4px solid {step.borderColor};">
								<div class="flex items-center gap-3 mb-3">
									<div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm" style="background: var(--ochre-light); color: var(--ochre);">{step.num}</div>
									<h4 class="font-bold text-lg" style="color: var(--text-primary);">{$t(step.titleKey)}</h4>
								</div>
								<p class="text-sm leading-relaxed" style="color: var(--text-secondary);">{$t(step.descKey)}</p>
							</div>
						{/each}
					</div>
				</div>

				<!-- Section B2: Live transformation demo -->
				<EncryptionDemo />

				<!-- Section C: Why these choices? -->
				<div>
					<h3 class="text-2xl md:text-3xl font-bold tracking-tight mb-8" style="color: var(--text-primary);">{$t('tech.why_title')}</h3>
					<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
						{#each [
							{ titleKey: 'tech.why_argon2_title', descKey: 'tech.why_argon2_desc', borderColor: 'var(--ochre)' },
							{ titleKey: 'tech.why_aes_title', descKey: 'tech.why_aes_desc', borderColor: 'var(--brand)' },
							{ titleKey: 'tech.why_client_title', descKey: 'tech.why_client_desc', borderColor: 'var(--ochre)' },
							{ titleKey: 'tech.why_metadata_title', descKey: 'tech.why_metadata_desc', borderColor: 'var(--brand)' },
							{ titleKey: 'tech.why_hardening_title', descKey: 'tech.why_hardening_desc', borderColor: 'var(--olive)' }
						] as choice}
							<div class="card rounded-xl p-6" style="border-left: 4px solid {choice.borderColor};">
								<h4 class="font-bold text-base mb-3" style="color: var(--text-primary);">{$t(choice.titleKey)}</h4>
								<p class="text-sm leading-relaxed" style="color: var(--text-secondary);">{$t(choice.descKey)}</p>
							</div>
						{/each}
					</div>
				</div>

				<!-- Section D: Open Source Verification -->
				<div>
					<div class="card rounded-xl p-6 md:p-8" style="border-left: 4px solid var(--olive);">
						<h3 class="text-xl md:text-2xl font-bold tracking-tight mb-3" style="color: var(--text-primary);">{$t('tech.verify_title')}</h3>
						<p class="leading-relaxed mb-6" style="color: var(--text-secondary);">{$t('tech.verify_desc')}</p>
						<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
							<div class="rounded-lg p-4" style="background: var(--surface-muted); border: 1px solid var(--border);">
								<div class="flex items-center gap-2 mb-2">
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--brand);"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke-width="2"/></svg>
									<span class="font-semibold text-sm" style="color: var(--text-primary);">{$t('tech.verify_encryption')}</span>
								</div>
								<code class="font-mono text-xs px-2 py-0.5 rounded" style="background: var(--surface-inset); color: var(--text-secondary);">frontend/src/lib/crypto.ts</code>
							</div>
							<div class="rounded-lg p-4" style="background: var(--surface-muted); border: 1px solid var(--border);">
								<div class="flex items-center gap-2 mb-2">
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--ochre);"><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
									<span class="font-semibold text-sm" style="color: var(--text-primary);">{$t('tech.verify_api')}</span>
								</div>
								<code class="font-mono text-xs px-2 py-0.5 rounded" style="background: var(--surface-inset); color: var(--text-secondary);">api/server.py</code>
							</div>
							<div class="rounded-lg p-4" style="background: var(--surface-muted); border: 1px solid var(--border);">
								<div class="flex items-center gap-2 mb-2">
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--olive);"><path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
									<span class="font-semibold text-sm" style="color: var(--text-primary);">{$t('tech.verify_crypto')}</span>
								</div>
								<code class="font-mono text-xs px-2 py-0.5 rounded" style="background: var(--surface-inset); color: var(--text-secondary);">frontend/src/lib/crypto.ts</code>
							</div>
						</div>
					</div>
				</div>

			</div>
			{/if}
		</div>
	</section>

	<!-- ===== CTA FOOTER ===== -->
	<section class="py-20 md:py-28 relative overflow-hidden" style="background: var(--surface-card); border-bottom: 1px solid var(--border);">
		<div class="relative max-w-5xl mx-auto px-6 text-center">
			<!-- Watermark asterisk -->
			<div class="absolute inset-0 flex items-center justify-center pointer-events-none">
				<Asterisk size={180} muted color="muted" />
			</div>
			<h2 class="text-3xl md:text-4xl font-bold tracking-tight mb-4" style="color: var(--text-primary);">{$t('landing.cta_title')}</h2>
			<p class="text-lg mb-10 max-w-2xl mx-auto leading-relaxed" style="color: var(--text-secondary);">
				{$t('landing.cta_subtitle')}
			</p>
			<a href="/login?mode=register" class="btn-primary min-h-[52px] px-8 font-semibold rounded-xl text-base shadow-lg transition-colors">
				{$t('landing.cta_button')}
			</a>
		</div>
	</section>

</main>

<!-- Footer -->
<footer class="py-12" style="background: var(--surface-card); border-top: 1px solid var(--border);">
	<div class="max-w-5xl mx-auto px-6">
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
			<div>
				<a href="/" aria-label="ciphra">
					<svg viewBox="0 0 220 50" class="h-8" aria-hidden="true">
						<text x="0" y="36" font-family="Inter, DM Sans, sans-serif" font-size="36" font-weight="500" letter-spacing="1" style="fill: var(--text-primary)">ciphra</text>
						<g transform="translate(134,12) rotate(8)" style="stroke: var(--brand)" stroke-linecap="round" fill="none">
							<path d="M -6.5 0 L 6.5 0" stroke-width="1.5"/>
							<path d="M -2.7 -4.6 L 2.7 4.6" stroke-width="1.2"/>
							<path d="M 2.6 -4.4 L -2.6 4.4" stroke-width="1.1"/>
						</g>
					</svg>
				</a>
				<p class="text-xs font-semibold tracking-widest uppercase mt-1" style="color: var(--brand);">{$t('landing.footer_tagline')}</p>
				<p class="text-sm mt-3 leading-relaxed" style="color: var(--text-muted);">{@html $t('landing.footer_desc').replace('\n', '<br>')}</p>
			</div>
			<div>
				<h3 class="text-sm font-semibold mb-3" style="color: var(--text-primary);">{$t('landing.footer_product')}</h3>
				<ul class="space-y-2 text-sm" style="color: var(--text-muted);">
					<li><a href="#how" class="hover:underline" style="color: inherit;">{$t('landing.footer_how')}</a></li>
					<li><a href="#conditions" class="hover:underline" style="color: inherit;">{$t('landing.footer_templates')}</a></li>
					<li><a href="#security" class="hover:underline" style="color: inherit;">{$t('landing.footer_security')}</a></li>
				</ul>
			</div>
			<div>
				<h3 class="text-sm font-semibold mb-3" style="color: var(--text-primary);">{$t('landing.footer_links')}</h3>
				<ul class="space-y-2 text-sm" style="color: var(--text-muted);">
					<li><a href="/login" class="hover:underline" style="color: inherit;">{$t('landing.footer_login')}</a></li>
					<li><a href="/login?mode=register" class="hover:underline" style="color: inherit;">{$t('landing.footer_register')}</a></li>
					<li><a href="/conditions" class="hover:underline" style="color: inherit;">{$t('nav.conditions')}</a></li>
				</ul>
			</div>
			<div>
				<h3 class="text-sm font-semibold mb-3" style="color: var(--text-primary);">{$t('landing.footer_legal')}</h3>
				<ul class="space-y-2 text-sm" style="color: var(--text-muted);">
					<li><a href="/privacy" class="hover:underline" style="color: inherit;">{$t('privacy.title')}</a></li>
					<li><a href="/terms" class="hover:underline" style="color: inherit;">{$t('terms.title')}</a></li>
					<li><a href="https://github.com/danileau/ciphra" target="_blank" rel="noopener" class="hover:underline inline-flex items-center gap-1" style="color: inherit;">
						<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.05-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.21.09 1.85 1.24 1.85 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22 0 1.6-.01 2.89-.01 3.29 0 .32.22.7.83.58C20.56 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z"/></svg>
						GitHub
					</a></li>
				</ul>
			</div>
			<div>
				<h3 class="text-sm font-semibold mb-3" style="color: var(--text-primary);">{$t('landing.footer_domains')}</h3>
				<ul class="space-y-2 text-sm" style="color: var(--text-muted);">
					<li>ciphra.ch</li>
					<li>ciphra.app</li>
				</ul>
			</div>
		</div>
		<!-- Divider with asterisk -->
		<div class="asterisk-divider mb-6">
			<Asterisk size={14} color="muted" />
		</div>
		<!-- Medical-device disclaimer — keeps ciphra clearly outside MDR/MepV scope. -->
		<p class="text-xs text-center mb-4 italic" style="color: var(--text-muted);">
			{$t('landing.disclaimer_medical')}
		</p>
		<div class="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm" style="color: var(--text-muted);">
			<span>&copy; 2026 ciphra</span>
			<div class="flex items-center gap-4">
				<select
					class="text-xs rounded-lg px-2 py-1.5 min-h-[36px]"
					style="background: var(--surface-card); border: 1px solid var(--border); color: var(--text-muted);"
					value={$locale}
					on:change={setLocale}
				>
					{#each locales as l}
						<option value={l}>{localeNames[l]}</option>
					{/each}
				</select>
			</div>
		</div>
	</div>
</footer>

{/if}
