<script lang="ts">
	import '../app.css';
	import { isAuthenticated, authReady, auth } from '$lib/stores/auth';
	import { darkMode } from '$lib/stores/darkmode';
	import { t, locale, locales, localeNames } from '$lib/i18n';
	import type { Locale } from '$lib/i18n';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { documents } from '$lib/stores/documents';
	import { blueprint, hasBlueprint } from '$lib/blueprint';

	let docsLoaded = false;

	onMount(() => {
		darkMode.init();
	});

	// Load documents and blueprint when authenticated
	$: if (browser && $isAuthenticated && !docsLoaded) {
		docsLoaded = true;
		documents.load().then(() => {
			blueprint.loadFromDocuments();
		});
	}

	// Redirect to setup when authenticated but no blueprint (and not already on /setup or /login)
	$: if (browser && $authReady && $isAuthenticated && docsLoaded && !$hasBlueprint
		&& currentPath !== '/setup' && currentPath !== '/login' && currentPath !== '/settings') {
		goto('/setup');
	}

	function handleLogout() {
		auth.logout();
		docsLoaded = false;
		blueprint.clear();
		documents.clear();
		goto('/login');
	}

	function setLocale(e: Event) {
		const target = e.currentTarget as HTMLSelectElement;
		locale.set(target.value);
	}

	$: currentPath = $page.url.pathname;

	// Redirect to login when auth is ready but user is not authenticated
	// (except if already on /login)
	// Only force redirect to /login for app pages (not / which shows landing for guests)
	$: if (browser && $authReady && !$isAuthenticated
		&& currentPath !== '/login' && currentPath !== '/'
		&& currentPath !== '/setup') {
		goto('/login');
	}

	const navItems = [
		{ path: '/', icon: 'home', labelKey: 'nav.today' },
		{ path: '/protocol', icon: 'clipboard-list', labelKey: 'nav.protocol' },
		{ path: '/calendar', icon: 'calendar', labelKey: 'nav.calendar' },
		{ path: '/stream', icon: 'activity', labelKey: 'nav.stream' },
		{ path: '/settings', icon: 'more', labelKey: 'nav.more' },
	];
</script>

{#if !$authReady}
	<!-- Loading state while auth hydrates -->
	<div class="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950">
		<p class="text-stone-400 text-sm">Loading...</p>
	</div>
{:else if $isAuthenticated}
	<!-- Top Bar -->
	<header class="sticky top-0 z-40 bg-white/95 dark:bg-stone-950/95 backdrop-blur border-b border-stone-200 dark:border-stone-800">
		<div class="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
			<a href="/" class="text-xl font-bold tracking-tight text-stone-900 dark:text-white">ciphra</a>
			<div class="flex items-center gap-1">
				<!-- Locale switcher -->
				<select
					class="text-xs bg-stone-100 dark:bg-stone-800 border-0 rounded-lg px-2 py-1.5 text-stone-600 dark:text-stone-300 min-h-[44px] cursor-pointer"
					value={$locale}
					on:change={setLocale}
					aria-label="Language"
				>
					{#each locales as l}
						<option value={l}>{localeNames[l]}</option>
					{/each}
				</select>
				<!-- Dark mode -->
				<button
					type="button"
					on:click={() => darkMode.toggle()}
					aria-label={$t('darkmode.toggle')}
					class="p-2.5 rounded-lg text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
				>
					{#if $darkMode}
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke-width="2" stroke-linecap="round"/></svg>
					{:else}
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					{/if}
				</button>
				<!-- Logout -->
				<button
					type="button"
					on:click={handleLogout}
					aria-label={$t('auth.logout')}
					class="p-2.5 rounded-lg text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14l5-5-5-5m5 5H9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</button>
			</div>
		</div>
	</header>

	<main class="pb-24">
		<slot />
	</main>

	<!-- Bottom Navigation -->
	<nav class="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-stone-950 border-t border-stone-200 dark:border-stone-800 safe-area-bottom" aria-label="Main navigation">
		<div class="max-w-2xl mx-auto flex justify-around">
			{#each navItems as item}
				<a
					href={item.path}
					class="flex flex-col items-center py-2 px-3 min-w-[64px] min-h-[56px] justify-center transition-colors
						{currentPath === item.path
							? 'text-indigo-600 dark:text-indigo-400'
							: 'text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300'}"
					aria-current={currentPath === item.path ? 'page' : undefined}
				>
					{#if item.icon === 'home'}
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="9,22 9,12 15,12 15,22" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					{:else if item.icon === 'clipboard-list'}
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" stroke-width="2" stroke-linecap="round"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1" stroke-width="2"/><path d="M9 12h6m-6 4h6" stroke-width="2" stroke-linecap="round"/></svg>
					{:else if item.icon === 'calendar'}
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke-width="2"/><line x1="16" y1="2" x2="16" y2="6" stroke-width="2" stroke-linecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="10" x2="21" y2="10" stroke-width="2"/></svg>
					{:else if item.icon === 'activity'}
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					{:else if item.icon === 'more'}
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1" stroke-width="2"/><circle cx="12" cy="5" r="1" stroke-width="2"/><circle cx="12" cy="19" r="1" stroke-width="2"/></svg>
					{/if}
					<span class="text-[10px] mt-0.5 font-medium">{$t(item.labelKey)}</span>
				</a>
			{/each}
		</div>
	</nav>
{:else}
	<slot />
{/if}
