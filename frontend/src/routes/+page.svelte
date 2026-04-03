<script lang="ts">
	import { isAuthenticated, authReady } from '$lib/stores/auth';
	import { darkMode } from '$lib/stores/darkmode';
	import { t, locale, locales, localeNames } from '$lib/i18n';
	import type { Locale } from '$lib/i18n';
	import Companion from '$lib/components/Companion.svelte';
	import { onMount } from 'svelte';

	onMount(() => darkMode.init());

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

<a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-indigo-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:outline-none">
	{$t('landing.skip_to_content')}
</a>

<!-- Navigation -->
<nav class="border-b border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-stone-950/80 backdrop-blur-sm sticky top-0 z-40">
	<div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
		<a href="/" class="text-xl font-bold tracking-tight text-stone-900 dark:text-white">ciphra</a>
		<div class="flex items-center gap-3">
			<div class="hidden md:flex items-center gap-1">
				<a href="#how" class="text-sm font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 min-h-[44px] flex items-center px-3">{$t('landing.nav_how')}</a>
				<a href="#origin" class="text-sm font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 min-h-[44px] flex items-center px-3">{$t('landing.nav_origin')}</a>
				<a href="#security" class="text-sm font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 min-h-[44px] flex items-center px-3">{$t('landing.nav_security')}</a>
				<a href="#features" class="text-sm font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 min-h-[44px] flex items-center px-3">{$t('landing.nav_features')}</a>
			</div>
			<div class="w-px h-6 bg-stone-200 dark:bg-stone-700 hidden md:block"></div>
			<!-- Language switcher -->
			<select
				class="text-xs bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg px-2 py-1.5 text-stone-600 dark:text-stone-300 min-h-[36px]"
				value={$locale}
				on:change={setLocale}
			>
				{#each locales as l}
					<option value={l}>{localeNames[l]}</option>
				{/each}
			</select>
			<a href="/login" class="min-h-[44px] px-5 flex items-center text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">
				{$t('landing.nav_login')}
			</a>
			<button type="button" on:click={() => darkMode.toggle()} aria-label={$t('darkmode.toggle')}
				class="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700">
				{#if $darkMode}
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" stroke-width="2"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke-width="2" stroke-linecap="round"/></svg>
				{:else}
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				{/if}
			</button>
		</div>
	</div>
</nav>

<main id="main-content">

	<!-- ===== HERO ===== -->
	<section class="relative overflow-hidden">
		<!-- Gradient background -->
		<div class="absolute inset-0 bg-gradient-to-br from-indigo-50 via-stone-50 to-teal-50 dark:from-indigo-950/40 dark:via-stone-950 dark:to-teal-950/30"></div>
		<!-- Subtle grid pattern -->
		<div class="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]" style="background-image: url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22><rect width=%2260%22 height=%2260%22 fill=%22none%22 stroke=%22%23666%22 stroke-width=%220.5%22/></svg>')"></div>

		<div class="relative max-w-6xl mx-auto px-6 py-24 md:py-36 lg:py-44">
			<div class="max-w-3xl">
				<div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-100 dark:bg-indigo-500/15 mb-6">
					<svg class="w-4 h-4 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke-width="2"/></svg>
					<span class="text-sm font-semibold text-indigo-700 dark:text-indigo-300 tracking-wide">{$t('landing.hero_badge')}</span>
				</div>
				<h1 class="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6 text-stone-900 dark:text-white">
					{$t('landing.hero_title_1')}<br>
					<span class="bg-gradient-to-r from-indigo-600 to-teal-500 bg-clip-text text-transparent">{$t('landing.hero_title_2')}</span>
				</h1>
				<p class="text-xl md:text-2xl text-stone-600 dark:text-stone-400 leading-relaxed mb-4 max-w-2xl font-light">
					{@html $t('landing.hero_subtitle', { strong_start: '<strong class="font-semibold text-stone-900 dark:text-stone-200">', strong_end: '</strong>' })}
				</p>
				<p class="text-base text-stone-500 dark:text-stone-500 leading-relaxed mb-10 max-w-2xl">
					{$t('landing.hero_detail')}
				</p>
				<div class="flex flex-wrap gap-4">
					<a href="/login" class="inline-flex items-center justify-center min-h-[52px] px-8 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-base shadow-lg shadow-indigo-500/20">
						{$t('landing.hero_cta')}
					</a>
					<a href="#origin" class="inline-flex items-center justify-center min-h-[52px] px-8 border-2 border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300 hover:bg-white/50 dark:hover:bg-stone-800/50 font-medium rounded-xl text-base gap-2">
						{$t('landing.hero_learn_more')}
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 14l-7 7m0 0l-7-7m7 7V3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</a>
				</div>

				<!-- Trust badges -->
				<div class="flex flex-wrap items-center gap-6 mt-12 text-sm text-stone-500 dark:text-stone-400">
					<div class="flex items-center gap-2">
						<svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke-width="2" stroke-linecap="round"/><polyline points="22,4 12,14.01 9,11.01" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
						<span>{$t('landing.hero_badge_crypto')}</span>
					</div>
					<div class="flex items-center gap-2">
						<svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke-width="2" stroke-linecap="round"/><polyline points="22,4 12,14.01 9,11.01" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
						<span>{$t('landing.hero_badge_opensource')}</span>
					</div>
					<div class="flex items-center gap-2">
						<svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke-width="2" stroke-linecap="round"/><polyline points="22,4 12,14.01 9,11.01" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
						<span>{$t('landing.hero_badge_zk')}</span>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- ===== ORIGIN STORY ===== -->
	<section class="py-20 md:py-28 bg-white dark:bg-stone-900 border-y border-stone-200 dark:border-stone-800" id="origin">
		<div class="max-w-6xl mx-auto px-6">
			<div class="max-w-3xl">
				<h2 class="text-3xl md:text-4xl font-bold tracking-tight mb-6 text-stone-900 dark:text-white">{$t('landing.origin_title')}</h2>
				<p class="text-stone-600 dark:text-stone-400 text-lg leading-relaxed mb-10">
					{$t('landing.origin_intro')}
				</p>

				<!-- Anonymized caregiver story -->
				<div class="rounded-2xl border border-indigo-200 dark:border-indigo-800/50 p-6 md:p-8 bg-gradient-to-br from-indigo-50 to-stone-50 dark:from-indigo-950/20 dark:to-stone-950 mb-10">
					<div class="flex items-start gap-4 mb-4">
						<div class="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
							<svg class="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="7" r="4" stroke-width="2"/></svg>
						</div>
						<div>
							<p class="font-semibold text-stone-900 dark:text-white text-lg">{$t('landing.origin_feedback_label')}</p>
							<p class="text-sm text-stone-500 dark:text-stone-400">{$t('landing.origin_feedback_context')}</p>
						</div>
					</div>
					<blockquote class="text-stone-700 dark:text-stone-300 italic leading-relaxed mb-5 border-l-3 border-indigo-400 dark:border-indigo-600 pl-5 text-lg">
						{$t('landing.origin_quote')}
					</blockquote>
					<p class="text-stone-600 dark:text-stone-400 leading-relaxed mb-4">
						{$t('landing.origin_story')}
					</p>
					<p class="text-stone-600 dark:text-stone-400 leading-relaxed mb-4">
						{$t('landing.origin_lesson')}
					</p>
					<p class="text-stone-700 dark:text-stone-300 leading-relaxed font-medium">
						{$t('landing.origin_conclusion')}
					</p>
				</div>

				<!-- Excel comparison table -->
				<div class="rounded-2xl border border-stone-200 dark:border-stone-800 overflow-hidden mb-10">
					<div class="px-6 py-4 bg-stone-50 dark:bg-stone-950 border-b border-stone-200 dark:border-stone-800">
						<h3 class="font-bold text-stone-900 dark:text-white text-lg">{$t('landing.excel_title')}</h3>
					</div>
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b border-stone-200 dark:border-stone-800">
									<th class="text-left px-6 py-3 font-semibold text-stone-500 dark:text-stone-400">{$t('landing.excel_header_excel')}</th>
									<th class="text-left px-6 py-3 font-semibold text-indigo-600 dark:text-indigo-400">{$t('landing.excel_header_ciphra')}</th>
								</tr>
							</thead>
							<tbody class="text-stone-600 dark:text-stone-400">
								<tr class="border-b border-stone-100 dark:border-stone-800/50">
									<td class="px-6 py-3">{$t('landing.excel_row1_excel')}</td>
									<td class="px-6 py-3 text-stone-900 dark:text-stone-200 font-medium">{$t('landing.excel_row1_ciphra')}</td>
								</tr>
								<tr class="border-b border-stone-100 dark:border-stone-800/50">
									<td class="px-6 py-3">{$t('landing.excel_row2_excel')}</td>
									<td class="px-6 py-3 text-stone-900 dark:text-stone-200 font-medium">{$t('landing.excel_row2_ciphra')}</td>
								</tr>
								<tr class="border-b border-stone-100 dark:border-stone-800/50">
									<td class="px-6 py-3">{$t('landing.excel_row3_excel')}</td>
									<td class="px-6 py-3 text-stone-900 dark:text-stone-200 font-medium">{$t('landing.excel_row3_ciphra')}</td>
								</tr>
								<tr class="border-b border-stone-100 dark:border-stone-800/50">
									<td class="px-6 py-3">{$t('landing.excel_row4_excel')}</td>
									<td class="px-6 py-3 text-stone-900 dark:text-stone-200 font-medium">{$t('landing.excel_row4_ciphra')}</td>
								</tr>
								<tr>
									<td class="px-6 py-3">{$t('landing.excel_row5_excel')}</td>
									<td class="px-6 py-3 text-stone-900 dark:text-stone-200 font-medium">{$t('landing.excel_row5_ciphra')}</td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- ===== NOT A WELLNESS APP ===== -->
	<section class="py-20 md:py-28 bg-stone-50 dark:bg-stone-950 border-b border-stone-200 dark:border-stone-800">
		<div class="max-w-6xl mx-auto px-6">
			<div class="max-w-3xl">
				<h2 class="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-stone-900 dark:text-white">{$t('landing.notapp_title')}</h2>
				<p class="text-stone-600 dark:text-stone-400 text-lg leading-relaxed mb-10">
					{$t('landing.notapp_subtitle')}
				</p>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-8">
					<!-- Who it's for -->
					<div class="rounded-2xl border border-stone-200 dark:border-stone-800 p-6 bg-white dark:bg-stone-900">
						<h3 class="font-bold text-stone-900 dark:text-white mb-4">{$t('landing.notapp_who_title')}</h3>
						<ul class="space-y-3 text-sm text-stone-600 dark:text-stone-400">
							<li class="flex items-start gap-3">
								<svg class="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke-width="2" stroke-linecap="round"/><polyline points="22,4 12,14.01 9,11.01" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
								<span>{$t('landing.notapp_who_1')}</span>
							</li>
							<li class="flex items-start gap-3">
								<svg class="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke-width="2" stroke-linecap="round"/><polyline points="22,4 12,14.01 9,11.01" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
								<span>{$t('landing.notapp_who_2')}</span>
							</li>
							<li class="flex items-start gap-3">
								<svg class="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke-width="2" stroke-linecap="round"/><polyline points="22,4 12,14.01 9,11.01" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
								<span>{$t('landing.notapp_who_3')}</span>
							</li>
						</ul>
					</div>

					<!-- Evening routine -->
					<div class="rounded-2xl border border-indigo-200 dark:border-indigo-800/50 p-6 bg-gradient-to-br from-indigo-50 to-stone-50 dark:from-indigo-950/20 dark:to-stone-950">
						<h3 class="font-bold text-stone-900 dark:text-white mb-4">{$t('landing.notapp_routine_title')}</h3>
						<p class="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
							{$t('landing.notapp_routine_desc')}
						</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- ===== HOW IT WORKS ===== -->
	<section class="py-20 md:py-28 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800" id="how">
		<div class="max-w-6xl mx-auto px-6">
			<div class="text-center mb-14">
				<h2 class="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-stone-900 dark:text-white">{$t('landing.how_title')}</h2>
				<p class="text-stone-500 dark:text-stone-400 text-lg max-w-xl mx-auto">{$t('landing.how_subtitle')}</p>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-8">
				<div class="relative rounded-2xl border border-stone-200 dark:border-stone-800 p-8 bg-stone-50 dark:bg-stone-950">
					<div class="absolute -top-4 left-8 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-indigo-500/30">1</div>
					<div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-100 to-indigo-50 dark:from-indigo-900/30 dark:to-indigo-950/20 flex items-center justify-center mb-5 mt-2">
						<svg class="w-7 h-7 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" stroke-width="2"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke-width="2"/></svg>
					</div>
					<h3 class="text-xl font-bold text-stone-900 dark:text-white mb-3">{$t('landing.how_step1_title')}</h3>
					<p class="text-stone-500 dark:text-stone-400 leading-relaxed">{$t('landing.how_step1_desc')}</p>
				</div>

				<div class="relative rounded-2xl border border-stone-200 dark:border-stone-800 p-8 bg-stone-50 dark:bg-stone-950">
					<div class="absolute -top-4 left-8 w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-teal-500/30">2</div>
					<div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-100 to-teal-50 dark:from-teal-900/30 dark:to-teal-950/20 flex items-center justify-center mb-5 mt-2">
						<svg class="w-7 h-7 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" stroke-width="2" stroke-linecap="round"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1" stroke-width="2"/><path d="M9 12l2 2 4-4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</div>
					<h3 class="text-xl font-bold text-stone-900 dark:text-white mb-3">{$t('landing.how_step2_title')}</h3>
					<p class="text-stone-500 dark:text-stone-400 leading-relaxed">{$t('landing.how_step2_desc')}</p>
				</div>

				<div class="relative rounded-2xl border border-stone-200 dark:border-stone-800 p-8 bg-stone-50 dark:bg-stone-950">
					<div class="absolute -top-4 left-8 w-8 h-8 rounded-full bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-rose-500/30">3</div>
					<div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-100 to-rose-50 dark:from-rose-900/30 dark:to-rose-950/20 flex items-center justify-center mb-5 mt-2">
						<svg class="w-7 h-7 text-rose-600 dark:text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke-width="2"/><polyline points="14,2 14,8 20,8" stroke-width="2"/><line x1="16" y1="13" x2="8" y2="13" stroke-width="2" stroke-linecap="round"/><line x1="16" y1="17" x2="8" y2="17" stroke-width="2" stroke-linecap="round"/></svg>
					</div>
					<h3 class="text-xl font-bold text-stone-900 dark:text-white mb-3">{$t('landing.how_step3_title')}</h3>
					<p class="text-stone-500 dark:text-stone-400 leading-relaxed">{$t('landing.how_step3_desc')}</p>
				</div>
			</div>
		</div>
	</section>

	<!-- ===== CONDITION TEMPLATES ===== -->
	<section class="py-20 md:py-28 bg-stone-50 dark:bg-stone-950 border-b border-stone-200 dark:border-stone-800" id="templates">
		<div class="max-w-6xl mx-auto px-6">
			<div class="text-center mb-14">
				<h2 class="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-stone-900 dark:text-white">{$t('landing.templates_title_1')} <span class="bg-gradient-to-r from-indigo-600 to-teal-500 bg-clip-text text-transparent">{$t('landing.templates_title_2')}</span></h2>
				<p class="text-stone-500 dark:text-stone-400 text-lg max-w-xl mx-auto">{$t('landing.templates_subtitle')}</p>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
				{#each [
					{ nameKey: 'landing.template_epilepsy', descKey: 'landing.template_epilepsy_desc', color: '#DC2626', bg: 'from-red-50 to-rose-50 dark:from-red-950/20 dark:to-rose-950/10' },
					{ nameKey: 'landing.template_adhd', descKey: 'landing.template_adhd_desc', color: '#F59E0B', bg: 'from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/10' },
					{ nameKey: 'landing.template_diabetes', descKey: 'landing.template_diabetes_desc', color: '#0D9488', bg: 'from-teal-50 to-emerald-50 dark:from-teal-950/20 dark:to-emerald-950/10' },
					{ nameKey: 'landing.template_burnout', descKey: 'landing.template_burnout_desc', color: '#8B5CF6', bg: 'from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/10' },
					{ nameKey: 'landing.template_migraine', descKey: 'landing.template_migraine_desc', color: '#EC4899', bg: 'from-pink-50 to-rose-50 dark:from-pink-950/20 dark:to-rose-950/10' }
				] as tmpl}
					<div class="rounded-2xl border border-stone-200 dark:border-stone-800 p-6 bg-gradient-to-br {tmpl.bg} hover:shadow-lg hover:shadow-stone-200/50 dark:hover:shadow-stone-900/50">
						<div class="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style="background: {tmpl.color}15">
							<div class="w-5 h-5 rounded-full" style="background: {tmpl.color}"></div>
						</div>
						<h3 class="font-bold text-lg text-stone-900 dark:text-white mb-2">{$t(tmpl.nameKey)}</h3>
						<p class="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">{$t(tmpl.descKey)}</p>
					</div>
				{/each}
				<!-- Custom -->
				<div class="rounded-2xl border-2 border-dashed border-stone-300 dark:border-stone-700 p-6 flex flex-col items-center justify-center text-center hover:border-indigo-400 dark:hover:border-indigo-600">
					<div class="w-12 h-12 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center mb-4">
						<svg class="w-6 h-6 text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 5v14m-7-7h14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</div>
					<h3 class="font-bold text-lg text-stone-900 dark:text-white mb-2">{$t('landing.template_custom')}</h3>
					<p class="text-sm text-stone-500 dark:text-stone-400">{$t('landing.template_custom_desc')}</p>
				</div>
			</div>
		</div>
	</section>

	<!-- ===== SECURITY ===== -->
	<section class="py-20 md:py-28 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800" id="security">
		<div class="max-w-6xl mx-auto px-6">
			<div class="flex items-start gap-5 mb-10">
				<div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-100 to-indigo-50 dark:from-indigo-900/30 dark:to-indigo-950/20 flex items-center justify-center flex-shrink-0">
					<svg class="w-8 h-8 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke-width="2"/></svg>
				</div>
				<div>
					<h2 class="text-3xl md:text-4xl font-bold tracking-tight text-stone-900 dark:text-white">{$t('landing.security_title')}</h2>
					<p class="text-stone-500 dark:text-stone-400 text-lg mt-2 max-w-2xl">{$t('landing.security_subtitle')}</p>
				</div>
			</div>

			<!-- Key hierarchy -->
			<div class="rounded-2xl border border-stone-200 dark:border-stone-800 p-6 md:p-8 bg-stone-50 dark:bg-stone-950 mb-8">
				<h3 class="font-bold text-stone-900 dark:text-white mb-6 text-lg">{$t('landing.security_hierarchy_title')}</h3>
				<div class="font-mono text-sm text-stone-700 dark:text-stone-300 leading-relaxed overflow-x-auto">
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
				<div class="rounded-2xl border border-emerald-200 dark:border-emerald-800/50 p-6 bg-emerald-50/50 dark:bg-emerald-950/10">
					<div class="flex items-center gap-2 mb-4">
						<svg class="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke-width="2"/></svg>
						<h3 class="font-bold text-stone-900 dark:text-white">{$t('landing.security_server_sees')}</h3>
					</div>
					<ul class="space-y-2.5 text-sm text-stone-600 dark:text-stone-400">
						<li class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> {$t('landing.security_server_sees_1')}</li>
						<li class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> {$t('landing.security_server_sees_2')}</li>
						<li class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> {$t('landing.security_server_sees_3')}</li>
						<li class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> {$t('landing.security_server_sees_4')}</li>
					</ul>
				</div>
				<div class="rounded-2xl border border-red-200 dark:border-red-800/50 p-6 bg-red-50/50 dark:bg-red-950/10">
					<div class="flex items-center gap-2 mb-4">
						<svg class="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="1" y1="1" x2="23" y2="23" stroke-width="2" stroke-linecap="round"/></svg>
						<h3 class="font-bold text-stone-900 dark:text-white">{$t('landing.security_server_not')}</h3>
					</div>
					<ul class="space-y-2.5 text-sm text-stone-600 dark:text-stone-400">
						<li class="flex items-center gap-2"><svg class="w-3.5 h-3.5 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke-width="2.5" stroke-linecap="round"/></svg> {$t('landing.security_server_not_1')}</li>
						<li class="flex items-center gap-2"><svg class="w-3.5 h-3.5 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke-width="2.5" stroke-linecap="round"/></svg> {$t('landing.security_server_not_2')}</li>
						<li class="flex items-center gap-2"><svg class="w-3.5 h-3.5 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke-width="2.5" stroke-linecap="round"/></svg> {$t('landing.security_server_not_3')}</li>
						<li class="flex items-center gap-2"><svg class="w-3.5 h-3.5 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke-width="2.5" stroke-linecap="round"/></svg> {$t('landing.security_server_not_4')}</li>
					</ul>
				</div>
			</div>
		</div>
	</section>

	<!-- ===== FEATURES ===== -->
	<section class="py-20 md:py-28 bg-stone-50 dark:bg-stone-950 border-b border-stone-200 dark:border-stone-800" id="features">
		<div class="max-w-6xl mx-auto px-6">
			<div class="text-center mb-14">
				<h2 class="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-stone-900 dark:text-white">{$t('landing.features_title')}</h2>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
				{#each [
					{ titleKey: 'landing.feature_protocol', descKey: 'landing.feature_protocol_desc', color: 'indigo', icon: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' },
					{ titleKey: 'landing.feature_grid', descKey: 'landing.feature_grid_desc', color: 'teal', icon: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18' },
					{ titleKey: 'landing.feature_calendar', descKey: 'landing.feature_calendar_desc', color: 'blue', icon: 'M3 4h18v18H3zM16 2v4M8 2v4M3 10h18' },
					{ titleKey: 'landing.feature_pdf', descKey: 'landing.feature_pdf_desc', color: 'rose', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' },
					{ titleKey: 'landing.feature_offline', descKey: 'landing.feature_offline_desc', color: 'emerald', icon: 'M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01' },
					{ titleKey: 'landing.feature_multilang', descKey: 'landing.feature_multilang_desc', color: 'violet', icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' },
					{ titleKey: 'landing.feature_darkmode', descKey: 'landing.feature_darkmode_desc', color: 'stone', icon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' },
					{ titleKey: 'landing.feature_custom', descKey: 'landing.feature_custom_desc', color: 'amber', icon: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' }
				] as feat}
					<div class="rounded-2xl border border-stone-200 dark:border-stone-800 p-6 bg-white dark:bg-stone-900 hover:shadow-md">
						<div class="w-12 h-12 rounded-xl bg-{feat.color}-100 dark:bg-{feat.color}-900/20 flex items-center justify-center mb-4">
							<svg class="w-5 h-5 text-{feat.color}-600 dark:text-{feat.color}-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="{feat.icon}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
						</div>
						<h3 class="font-bold text-base mb-2 text-stone-900 dark:text-white">{$t(feat.titleKey)}</h3>
						<p class="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">{$t(feat.descKey)}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ===== CTA ===== -->
	<section class="py-20 md:py-28 relative overflow-hidden">
		<div class="absolute inset-0 bg-gradient-to-br from-indigo-600 to-indigo-800 dark:from-indigo-900 dark:to-indigo-950"></div>
		<div class="relative max-w-6xl mx-auto px-6 text-center">
			<h2 class="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-white">{$t('landing.cta_title')}</h2>
			<p class="text-indigo-100 text-lg mb-10 max-w-2xl mx-auto leading-relaxed">
				{$t('landing.cta_subtitle')}
			</p>
			<a href="/login" class="inline-flex items-center justify-center min-h-[52px] px-8 bg-white hover:bg-stone-100 text-indigo-700 font-semibold rounded-xl text-base shadow-lg">
				{$t('landing.cta_button')}
			</a>
		</div>
	</section>

</main>

<!-- Footer -->
<footer class="border-t border-stone-200 dark:border-stone-800 py-12 bg-white dark:bg-stone-900">
	<div class="max-w-6xl mx-auto px-6">
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
			<div>
				<span class="text-lg font-bold tracking-tight text-stone-900 dark:text-white">ciphra</span>
				<p class="text-xs font-semibold tracking-widest uppercase text-indigo-600 dark:text-indigo-400 mt-1">{$t('landing.footer_tagline')}</p>
				<p class="text-sm text-stone-500 dark:text-stone-400 mt-3 leading-relaxed">{@html $t('landing.footer_desc').replace('\n', '<br>')}</p>
			</div>
			<div>
				<h3 class="text-sm font-semibold mb-3 text-stone-900 dark:text-white">{$t('landing.footer_product')}</h3>
				<ul class="space-y-2 text-sm text-stone-500 dark:text-stone-400">
					<li><a href="#how" class="hover:text-stone-900 dark:hover:text-stone-100">{$t('landing.footer_how')}</a></li>
					<li><a href="#templates" class="hover:text-stone-900 dark:hover:text-stone-100">{$t('landing.footer_templates')}</a></li>
					<li><a href="#features" class="hover:text-stone-900 dark:hover:text-stone-100">{$t('landing.footer_features')}</a></li>
					<li><a href="#security" class="hover:text-stone-900 dark:hover:text-stone-100">{$t('landing.footer_security')}</a></li>
				</ul>
			</div>
			<div>
				<h3 class="text-sm font-semibold mb-3 text-stone-900 dark:text-white">{$t('landing.footer_links')}</h3>
				<ul class="space-y-2 text-sm text-stone-500 dark:text-stone-400">
					<li><a href="/login" class="hover:text-stone-900 dark:hover:text-stone-100">{$t('landing.footer_login')}</a></li>
					<li><a href="/login" class="hover:text-stone-900 dark:hover:text-stone-100">{$t('landing.footer_register')}</a></li>
				</ul>
			</div>
			<div>
				<h3 class="text-sm font-semibold mb-3 text-stone-900 dark:text-white">{$t('landing.footer_domains')}</h3>
				<ul class="space-y-2 text-sm text-stone-500 dark:text-stone-400">
					<li>ciphra.ch</li>
					<li>ciphra.app</li>
				</ul>
			</div>
		</div>
		<div class="border-t border-stone-200 dark:border-stone-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-stone-400 dark:text-stone-500">
			<span>&copy; 2026 ciphra</span>
			<span class="text-xs tracking-wider uppercase">{$t('landing.footer_tagline')}</span>
		</div>
	</div>
</footer>

{/if}
