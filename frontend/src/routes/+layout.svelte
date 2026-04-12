<script lang="ts">
	import '../app.css';
	import { isAuthenticated, authReady, auth } from '$lib/stores/auth';
	import { t, locale, locales, localeNames } from '$lib/i18n';
	import type { Locale } from '$lib/i18n';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { documents, documentsError } from '$lib/stores/documents';
	import { blueprint, hasBlueprint } from '$lib/blueprint';
	import { fade, fly } from 'svelte/transition';

	let docsLoadStarted = false;
	let docsLoaded = false;
	let docsLoading = false;

	// FAB quick-add state
	let showQuickAdd = false;
	let quickAddNote = '';
	let quickAddSelectedEpisode: string | null = null;
	let quickAddSaving = false;
	let quickAddSaved = false;

	$: bp = $blueprint;

	function selectEpisodeType(id: string) {
		quickAddSelectedEpisode = quickAddSelectedEpisode === id ? null : id;
	}

	async function quickAddSave() {
		if (!quickAddSelectedEpisode && !quickAddNote.trim()) return;
		quickAddSaving = true;
		const now = new Date();
		const todayStr = now.toISOString().slice(0, 10);

		if (quickAddSelectedEpisode) {
			await documents.save({
				type: 'episode',
				date: todayStr,
				episodeType: quickAddSelectedEpisode,
				time: now.toTimeString().slice(0, 5),
				episodes: { [quickAddSelectedEpisode]: 1 },
				notes: quickAddNote.trim() || undefined,
			});
		} else if (quickAddNote.trim()) {
			await documents.save({
				type: 'event',
				date: todayStr,
				notes: quickAddNote.trim(),
			});
		}

		quickAddSaving = false;
		quickAddSaved = true;
		setTimeout(() => {
			quickAddSaved = false;
			quickAddSelectedEpisode = null;
			quickAddNote = '';
			showQuickAdd = false;
		}, 1200);
	}

	function quickAddReset() {
		showQuickAdd = false;
		quickAddSelectedEpisode = null;
		quickAddNote = '';
	}

	// Load documents and blueprint when authenticated
	$: if (browser && $isAuthenticated && !docsLoadStarted) {
		docsLoadStarted = true;
		docsLoading = true;
		documents.load().then(() => {
			blueprint.loadFromDocuments();
			docsLoading = false;
			docsLoaded = true;
		});
	}

	// Redirect to setup when authenticated but no blueprint (and not already on /setup or /login or /admin)
	// Only redirect AFTER documents have fully loaded and blueprint has been checked
	$: if (browser && $authReady && $isAuthenticated && docsLoaded && !$hasBlueprint
		&& currentPath !== '/setup' && currentPath !== '/login' && currentPath !== '/settings' && currentPath !== '/admin') {
		goto('/setup');
	}

	function handleLogout() {
		auth.logout();
		docsLoadStarted = false;
		docsLoaded = false;
		blueprint.clear();
		documents.clear();
		goto('/login');
	}

	function setLocale(e: Event) {
		const target = e.currentTarget as HTMLSelectElement;
		locale.set(target.value);
	}

	$: currentPath = $page.url.pathname as string;

	// Redirect to login when auth is ready but user is not authenticated
	// (except if already on /login)
	// Only force redirect to /login for app pages (not / which shows landing for guests)
	$: if (browser && $authReady && !$isAuthenticated
		&& currentPath !== '/login' && currentPath !== '/'
		&& currentPath !== '/setup' && !currentPath.startsWith('/conditions')) {
		goto('/login');
	}

	const navItems = [
		{ path: '/', icon: 'home', labelKey: 'nav.today' },
		{ path: '/journal', icon: 'book-open', labelKey: 'nav.journal' },
		{ path: '/calendar', icon: 'calendar', labelKey: 'nav.calendar' },
		{ path: '/settings', icon: 'settings', labelKey: 'nav.settings' },
	];
</script>

{#if !$authReady}
	<!-- Stable background while auth hydrates — no content to prevent flashing -->
	<div class="min-h-screen bg-surface"></div>
{:else if $isAuthenticated && currentPath !== '/login'}
	<!-- Top Bar -->
	<header class="sticky top-0 z-40 bg-white/95 backdrop-blur border-b">
		<div class="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
			<a href="/" class="flex items-center" aria-label="ciphra">
				<svg viewBox="0 0 220 50" class="h-7" aria-hidden="true">
					<text x="0" y="36" font-family="Inter, DM Sans, sans-serif" font-size="36" font-weight="500" letter-spacing="1" class="fill-surface-slate">ciphra</text>
					<g transform="translate(134,12) rotate(8)" class="stroke-brand" stroke-linecap="round" fill="none">
						<path d="M -6.5 0 L 6.5 0" stroke-width="1.5"/>
						<path d="M -2.7 -4.6 L 2.7 4.6" stroke-width="1.2"/>
						<path d="M 2.6 -4.4 L -2.6 4.4" stroke-width="1.1"/>
					</g>
				</svg>
			</a>
			<div class="flex items-center gap-1">
				<!-- Admin link -->
				{#if $auth.isAdmin}
					<a
						href="/admin"
						class="p-2.5 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center
							{currentPath === '/admin'
								? 'text-brand bg-surface-muted'
								: 'text-slate-500 hover:bg-surface-muted'}"
						aria-label={$t('admin.title')}
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4.354a4 4 0 1 1 0 5.292M15 21H3v-1a6 6 0 0 1 12 0v1zm0 0h6v-1a6 6 0 0 0-9-5.197" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</a>
				{/if}
				<!-- Logout -->
				<button
					type="button"
					on:click={handleLogout}
					aria-label={$t('auth.logout')}
					class="p-2.5 rounded-lg text-slate-500 hover:bg-surface-muted transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14l5-5-5-5m5 5H9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</button>
			</div>
		</div>
	</header>

	{#if docsLoading}
		<div class="fixed top-14 left-0 right-0 z-50 h-0.5 bg-brand/10 overflow-hidden">
			<div class="h-full bg-brand animate-pulse" style="width: 60%"></div>
		</div>
	{/if}

	{#if $documentsError}
		<div class="mx-4 mt-2 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
			<svg class="w-5 h-5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2"/><line x1="15" y1="9" x2="9" y2="15" stroke-width="2" stroke-linecap="round"/><line x1="9" y1="9" x2="15" y2="15" stroke-width="2" stroke-linecap="round"/></svg>
			<p class="text-sm text-red-700">{$documentsError}</p>
			<button on:click={() => { documentsError.set(null); documents.load(); }} class="ml-auto text-xs font-medium text-red-600 hover:text-red-800 min-h-[44px] px-2">{$t('common.retry')}</button>
		</div>
	{/if}

	<main style="padding-bottom: calc(6rem + env(safe-area-inset-bottom, 0px))">
		<slot />
	</main>

	<!-- FAB (+) button -->
	{#if bp && $hasBlueprint && currentPath !== '/login' && currentPath !== '/setup'}
		<button
			on:click={() => showQuickAdd = true}
			class="fab"
			style="bottom: calc(4.5rem + env(safe-area-inset-bottom, 0px)); right: 1rem;"
			aria-label={$t('companion.quick_add')}
		>
			<svg class="w-7 h-7" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
		</button>

		{#if showQuickAdd}
			<button
				class="fixed inset-0 z-[55] bg-black/40 backdrop-blur-sm"
				on:click={quickAddReset}
				transition:fade={{ duration: 200 }}
				aria-label={$t('common.close')}
			></button>

			<div
				class="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-2xl shadow-2xl max-h-[80vh] overflow-y-auto"
				style="border-top: 1px solid var(--border)"
				transition:fly={{ y: 300, duration: 300 }}
			>
				<div class="p-5 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] max-w-lg mx-auto">
					<div class="flex justify-center mb-4">
						<div class="w-10 h-1 rounded-full" style="background: var(--border)"></div>
					</div>

					{#if quickAddSaved}
						<div class="text-center py-6" transition:fade={{ duration: 150 }}>
							<div class="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center" style="background: var(--olive-light)">
								<svg class="w-7 h-7" style="color: var(--olive)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
							</div>
							<p class="text-lg font-medium" style="color: var(--text-primary)">{$t('quickadd.saved')}</p>
						</div>
					{:else}
						<h3 class="text-lg font-semibold mb-1" style="color: var(--text-primary)">{$t('quickadd.title')}</h3>
						<p class="text-sm mb-5" style="color: var(--text-muted)">{$t('quickadd.what_happened')}</p>

						<!-- Episode type selection (tap to select, not instant-save) -->
						{#if bp.episodeTypes.length > 0}
							<div class="mb-5">
								<p class="text-xs font-medium uppercase tracking-wider mb-2" style="color: var(--text-muted)">{$t('quickadd.episode')}</p>
								<div class="flex flex-wrap gap-2">
									{#each bp.episodeTypes as ep}
										<button
											on:click={() => selectEpisodeType(ep.id)}
											class="flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all min-h-[44px]"
											style="border-color: {quickAddSelectedEpisode === ep.id ? ep.color : 'var(--border)'}; background: {quickAddSelectedEpisode === ep.id ? ep.color + '10' : 'var(--surface-muted)'}"
										>
											<span class="w-3 h-3 rounded-full shrink-0" style="background: {ep.color}"></span>
											<span class="text-sm font-medium" style="color: {quickAddSelectedEpisode === ep.id ? ep.color : 'var(--text-primary)'}">{$t(ep.label)}</span>
										</button>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Note (optional) -->
						<div class="mb-5">
							<p class="text-xs font-medium uppercase tracking-wider mb-2" style="color: var(--text-muted)">{$t('quickadd.note')}</p>
							<input
								type="text"
								bind:value={quickAddNote}
								placeholder={$t('quickadd.note')}
								class="input"
								on:keydown={(e) => { if (e.key === 'Enter' && (quickAddSelectedEpisode || quickAddNote.trim())) quickAddSave(); }}
							/>
						</div>

						<!-- Save button -->
						<button
							on:click={quickAddSave}
							disabled={quickAddSaving || (!quickAddSelectedEpisode && !quickAddNote.trim())}
							class="btn-primary w-full py-3 text-sm mb-3"
						>
							{quickAddSaving ? $t('common.loading') : $t('quickadd.save')}
						</button>

						<!-- Full daily log link -->
						<a
							href="/log/today"
							on:click={quickAddReset}
							class="block w-full text-center py-3 rounded-xl text-sm font-medium transition-colors min-h-[44px] flex items-center justify-center gap-2"
							style="color: var(--text-secondary)"
						>
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
							{$t('companion.fill_today')}
						</a>
					{/if}
				</div>
			</div>
		{/if}
	{/if}

	<!-- Bottom Navigation -->
	<nav class="fixed bottom-0 left-0 right-0 z-50 bg-white border-t" style="padding-bottom: env(safe-area-inset-bottom, 0px)" aria-label="Main navigation">
		<div class="max-w-2xl mx-auto flex justify-around">
			{#each navItems as item}
				<a
					href={item.path}
					class="flex flex-col items-center py-2 px-3 min-w-[64px] min-h-[56px] justify-center transition-colors
						{currentPath === item.path
							? 'text-brand'
							: 'text-warm-400 hover:text-warm-600'}"
					aria-current={currentPath === item.path ? 'page' : undefined}
				>
					{#if item.icon === 'home'}
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="9,22 9,12 15,12 15,22" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					{:else if item.icon === 'book-open'}
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					{:else if item.icon === 'calendar'}
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke-width="2"/><line x1="16" y1="2" x2="16" y2="6" stroke-width="2" stroke-linecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="10" x2="21" y2="10" stroke-width="2"/></svg>
					{:else if item.icon === 'settings'}
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" stroke-width="2"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" stroke-width="2"/></svg>
					{/if}
					<span class="text-[10px] mt-0.5 font-medium">{$t(item.labelKey)}</span>
				</a>
			{/each}
		</div>
	</nav>
{:else}
	<slot />
{/if}
