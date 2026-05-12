<script lang="ts">
	import { isAuthenticated, authReady } from '$lib/stores/auth';
	import { t } from '$lib/i18n';
	import Asterisk from '$lib/components/Asterisk.svelte';
	import Wordmark from '$lib/components/Wordmark.svelte';
	import { inview } from '$lib/actions/inview';
	import { presets } from '$lib/blueprint/presets';
	import EncryptionDemo from '$lib/components/EncryptionDemo.svelte';
	import { iconPaths, iconPath } from '$lib/conditionIcons';
	import { conditionGroups } from '$lib/conditionGroups';
	import { conditionInfoMap } from '$lib/conditionInfo';
	import type { ComponentType } from 'svelte';
	import { onMount } from 'svelte';

	let showTechnicalDetails = false;

	// CIPH-917 — custom-preset card lives at the bottom of the merged
	// conditions section as the open-ended alternative to the named
	// conditions. Hoisted from a template `{@const}` to the script so
	// it can sit between `{/each}` and `{#if}` (which Svelte's
	// `{@const}` placement rules don't allow).
	$: customPreset = presets.find((p) => p.id === 'custom');

	// Perf review (PI v13): Companion + CompanionMain + CompanionRail +
	// ChartWrapper + chart.js together pulled ~250 KB gzip into the
	// landing chunk despite only rendering when authenticated. Dynamic-
	// import + reactive load keeps unauth visitors at a tight bundle.
	let CompanionComponent: ComponentType | null = null;
	$: if ($authReady && $isAuthenticated && !CompanionComponent) {
		import('$lib/components/Companion.svelte').then((m) => {
			CompanionComponent = m.default as ComponentType;
		});
	}

	// CIPH-916 — `setLocale` removed: locale switcher moved into the
	// shared <PublicFooter /> mounted from +layout.svelte.

	// Hero choreography — three quiet signature moments. Originally
	// drafted on motion.one, but the Web Animations API (built into
	// every modern browser) gives us identical capability for keyframe
	// + cubic-bezier easing with zero bundle cost and no dev-mode
	// import-resolution issues. The CSS `.hero-content` 700ms entrance
	// + the inview action still cover no-JS / reduced-motion / pre-load
	// paint. Photosensitivity rules: every animation ≥400ms, no
	// flashing, no rapid repeats; reduced-motion users skip everything.
	onMount(() => {
		if (typeof window === 'undefined') return;
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduce) return;
		// Run after the CSS hero entrance has finished so the two
		// don't fight. requestIdleCallback keeps motion off the initial
		// paint critical path on slow devices.
		const start = () => runHeroChoreography();
		if ('requestIdleCallback' in window) {
			(window as Window & { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback?.(start);
		} else {
			setTimeout(start, 250);
		}
	});

	function runHeroChoreography(): void {
		// Cubic-bezier with overshoot >1 gives the spring-feel.
		const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
		const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

		// Asterisk settle — the brand-identity moment. The mark wobble-
		// rotates around its 8° rest pose and ticks back, like it just
		// landed. Delayed to t=720ms so the draw-in (CSS, finishes at
		// ~620ms) plays cleanly first; the wobble then takes over the
		// fully-drawn asterisk and adds the punctuation. SVG transform-
		// origin is set inline on the inner <g> so this rotates around
		// the asterisk centre, not the SVG origin.
		const asterisk = document.querySelector<SVGGElement>(
			'.hero-section .wordmark-asterisk',
		);
		if (asterisk) {
			asterisk.animate(
				[
					{ transform: 'rotate(8deg) scale(1)' },
					{ transform: 'rotate(18deg) scale(1.08)' },
					{ transform: 'rotate(3deg) scale(0.98)' },
					{ transform: 'rotate(8deg) scale(1)' },
				],
				{ duration: 1100, delay: 720, easing: SPRING, fill: 'forwards' },
			);
		}

		// CTA pulse — one soft scale tick. Draws the eye to "Get started
		// for free" without nagging. No repeat, no glow, no color shift.
		const cta = document.querySelector<HTMLElement>(
			'.hero-section [data-anim="hero-cta"]',
		);
		if (cta) {
			cta.animate(
				[
					{ transform: 'scale(1)' },
					{ transform: 'scale(1.025)' },
					{ transform: 'scale(1)' },
				],
				{ duration: 700, delay: 1900, easing: EASE_OUT },
			);
		}

		// (The condition-tile stagger was dropped — relying on
		// IntersectionObserver firing during fullPage screenshots /
		// hydration is fragile, and on a tile-grid that's already mostly
		// above the fold the entrance read as a flicker rather than as
		// delight. The asterisk wobble is the brand identity moment;
		// the CTA pulse is the eye-catch. Two is enough.)
	}
</script>

<svelte:head>
	{#if !$isAuthenticated}
		<title>ciphra — encrypted by design</title>
		<meta name="description" content={$t('landing.meta_description')} />
	{/if}
</svelte:head>

{#if $authReady && $isAuthenticated}
	{#if CompanionComponent}
		<svelte:component this={CompanionComponent} />
	{/if}
{:else if $authReady}

<!-- Skip-to-content moved into `+layout.svelte`'s public-shell branch
     (PI v16 LB-15) so /privacy /terms /protocol /conditions/[id] all
     inherit it. <main id="main-content"> below is the target. -->

<!-- Top nav now lives in `+layout.svelte` (the unified public nav),
     so every unauth public route — landing, /login, /migrate,
     /conditions, /privacy, /terms, /join/* — renders the same
     header. The previous local <nav> here was redundant. -->

<main id="main-content" style="background: var(--surface);">

	<!-- ===== HERO ===== -->
	<section class="relative overflow-hidden hero-section" style="background: var(--surface);">
		<div class="relative max-w-5xl mx-auto px-6 py-24 sm:py-32 md:py-40 lg:py-48">
			<div class="max-w-2xl hero-content">
				<!-- Wordmark — `drawIn` triggers the asterisk-arms draw-in
				     entrance only here (the landing hero), so chrome
				     wordmarks elsewhere don't replay the animation on
				     every page navigation. -->
				<div class="mb-8">
					<span class="sm:hidden"><Wordmark size={48} drawIn /></span>
					<span class="hidden sm:inline"><Wordmark size={64} drawIn /></span>
				</div>

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
					<a href="/login?mode=register" data-anim="hero-cta" class="btn-primary min-h-[52px] px-8 font-semibold rounded-xl text-base shadow-lg transition-colors" style="box-shadow: 0 4px 14px rgba(178,60,44,0.2);">
						{$t('landing.hero_cta')}
					</a>
				</div>

				<!-- Named-chips row: answers the "does it work for mine?"
					 bounce. Each chip is a real link into the condition detail
					 page. Keeps the "build your own" promise concrete. -->
				<div class="mb-12 text-sm" style="color: var(--text-muted);">
					<p class="font-medium mb-3" style="color: var(--text-secondary);">{$t('landing.chips_prefix')}</p>
					<!-- Group chips: one per group, auto-derived from conditionGroups.
						 Mobile: horizontal scroll. Desktop: 4-col grid. -->
					<div class="flex gap-2 overflow-x-auto pb-2 sm:flex-wrap sm:overflow-visible sm:pb-0">
						{#each conditionGroups as group}
							{@const firstInfo = conditionInfoMap[group.conditionIds[0]]}
							<a
								href="/#group-{group.id}"
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

		<!-- "More below" affordance — replaces the old "Read the story"
		     secondary button that jumped past the now-promoted Conditions
		     grid. This sits at the hero's bottom edge, gently bobs to
		     signal there's more content, and scrolls smoothly to the
		     conditions section on click. The bob is reduced-motion-safe. -->
		<a
			href="#conditions"
			class="hero-scroll-cue"
			aria-label={$t('landing.hero_scroll_cue')}
		>
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
				<polyline points="6,9 12,15 18,9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
		</a>
	</section>

	<!-- ===== CONDITIONS GRID =====
	     CIPH-917 — was a flat 4-col preset grid + a "See all conditions →"
	     link to a separate /conditions page. The standalone page duplicated
	     the same content with a slightly different layout (categorised). The
	     two have been merged here: full 19-condition catalogue grouped by
	     category, with the per-condition detail still living at
	     /conditions/{id}. /conditions itself is now a 308-redirect to the
	     #conditions anchor on this page. -->
	<section class="py-20 md:py-28 reveal" use:inview id="conditions" style="background: var(--surface-card); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);">
		<div class="max-w-5xl mx-auto px-6">
			<div class="text-center mb-12">
				<h2 class="text-3xl md:text-4xl font-bold tracking-tight mb-4" style="color: var(--text-primary);">
					{$t('landing.templates_title_1')} <span style="color: var(--brand);">{$t('landing.templates_title_2')}</span>
				</h2>
				<p class="text-lg max-w-xl mx-auto" style="color: var(--text-muted);">{$t('landing.templates_subtitle')}</p>
			</div>

			{#each conditionGroups as group}
				<section id="group-{group.id}" class="mb-10 scroll-mt-20">
					<header class="mb-4">
						<h3 class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">{$t(group.titleKey)}</h3>
						<p class="text-sm mt-1" style="color: var(--text-secondary);">{$t(group.descriptionKey)}</p>
					</header>
					<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
						{#each group.conditionIds as id}
							{@const info = conditionInfoMap[id]}
							{#if info}
								<a href="/conditions/{id}" data-anim="condition-tile" class="card-interactive rounded-xl p-5 min-h-[140px] block group">
									<div
										class="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
										style="background: linear-gradient(135deg, {info.color}26, {info.color}10);
										       border: 1px solid {info.color}40;"
									>
										<svg class="w-5 h-5" fill="none" stroke={info.color} stroke-width="2.2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
											<path d="{iconPaths[info.icon] || iconPaths['heart']}"/>
										</svg>
									</div>
									<h4 class="font-semibold text-sm mb-1 transition-colors" style="color: var(--text-primary);">{$t(info.titleKey)}</h4>
									<p class="text-xs leading-snug" style="color: var(--text-muted);">{$t(info.subtitleKey)}</p>
								</a>
							{/if}
						{/each}
					</div>
				</section>
			{/each}

			<!-- "Build your own" — final group, surfaced visually via the
				 dashed-border treatment so it reads as the open-ended
				 alternative to the named conditions. -->
			{#if customPreset}
				<section class="mb-2">
					<header class="mb-4">
						<h3 class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">{$t('landing.templates_custom_group')}</h3>
					</header>
					<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
						<div class="rounded-xl p-5 flex flex-col items-center justify-center text-center transition-colors min-h-[140px]" style="border: 2px dashed var(--border); cursor: default;">
							<div class="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style="background: var(--surface-muted);">
								<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted);"><path d="M12 5v14m-7-7h14"/></svg>
							</div>
							<h4 class="font-semibold text-sm mb-1" style="color: var(--text-primary);">{$t(customPreset.labelKey)}</h4>
							<p class="text-xs leading-snug" style="color: var(--text-muted);">{$t(customPreset.descriptionKey)}</p>
						</div>
					</div>
				</section>
			{/if}

			<!-- pi24 P-Land-1 — Blueprint-request escape hatch. The "is this
			     for me?" question peaks here; if the visitor's condition
			     isn't in the grid above, this is where they need a path.
			     Mailto (not a server form) because a server endpoint here
			     would create the wrong affordance on a "we can't read your
			     data" page. Boundary copy belongs in the footer mailto;
			     this card just opens the same mailto with a prefilled
			     subject so the email lands sorted. -->
			<div class="mt-10 text-center text-sm" style="color: var(--text-muted);">
				<p class="mb-2">{$t('landing.blueprint_request_prompt')}</p>
				<a
					href="mailto:info@ciphra.ch?subject=Blueprint%20request"
					class="inline-flex items-center gap-1.5 font-medium hover:underline"
					style="color: var(--brand);"
				>
					{$t('landing.blueprint_request_cta')}
					<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8l9 6 9-6m-18 0v10a2 2 0 002 2h14a2 2 0 002-2V8m-18 0a2 2 0 012-2h14a2 2 0 012 2"/></svg>
				</a>
			</div>
		</div>
	</section>

	<!-- ===== HOW IT WORKS =====
	     Demoted from the slot right after the hero — the user has now
	     seen "yes my condition is here" via the conditions grid; this
	     is the "how does it work?" follow-up. Background flipped to
	     surface (was surface-card) for the alternation rhythm. -->
	<section class="py-20 md:py-28 reveal" use:inview id="how" style="background: var(--surface); border-bottom: 1px solid var(--border);">
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

	<!-- ===== SECURITY ===== -->
	<section class="py-20 md:py-28 reveal" use:inview id="security" style="background: var(--surface-card); border-bottom: 1px solid var(--border);">
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
					<ul class="space-y-3 text-sm" style="color: var(--text-secondary);">
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
					<ul class="space-y-3 text-sm" style="color: var(--text-secondary);">
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
	<section class="py-20 md:py-28 reveal" use:inview id="technical" style="background: var(--surface); border-bottom: 1px solid var(--border);">
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
	<section class="py-20 md:py-28 relative overflow-hidden reveal" use:inview style="background: var(--surface-card); border-bottom: 1px solid var(--border);">
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

<!-- CIPH-916 — Footer extracted to <PublicFooter /> and mounted from
	 +layout.svelte for landing + public-doc shells. -->

{/if}

<style>
	/* CIPH-895 — Landing motion.
	   Hero content fades up + asterisk wordmark settles on page mount.
	   Sections marked `.reveal use:inview` fade up when scrolled into
	   view. Trust-app motion budget: 500ms duration, 12px translate, no
	   parallax, no scroll-linked transforms, no looping animations. The
	   inview action handles `prefers-reduced-motion` — when reduced,
	   the class is added immediately so content is visible without
	   transition. */
	.hero-content {
		animation: heroEntrance 700ms ease-out both;
	}
	@keyframes heroEntrance {
		from {
			opacity: 0;
			transform: translateY(16px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	.reveal {
		opacity: 0;
		transform: translateY(12px);
		transition: opacity 0.5s ease-out, transform 0.5s ease-out;
	}
	:global(.reveal.in-view) {
		opacity: 1;
		transform: none;
	}

	/* Hero scroll cue — chevron at the hero's bottom edge that gently
	   bobs to signal there's more below. Replaces the old "Read the
	   story" button that pre-empted the conditions section. Bob is
	   slow (2.4s), low-amplitude (6px), infinite — but kept under
	   reduced-motion via the @media block. Smooth-scroll on click is
	   inherited from the html selector via app.css if set; the anchor
	   navigates to #conditions either way. */
	.hero-scroll-cue {
		position: absolute;
		bottom: 1.5rem;
		left: 50%;
		transform: translateX(-50%);
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		color: var(--text-muted);
		text-decoration: none;
		transition: color 200ms ease-out, background 200ms ease-out;
	}
	.hero-scroll-cue:hover,
	.hero-scroll-cue:focus-visible {
		color: var(--brand);
		background: var(--surface-card);
		outline: none;
	}
	@media (prefers-reduced-motion: reduce) {
		.hero-content {
			animation: none;
		}
		.reveal {
			opacity: 1;
			transform: none;
			transition: none;
		}
	}
</style>
