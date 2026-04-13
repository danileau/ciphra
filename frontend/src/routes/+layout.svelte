<script lang="ts">
	import '../app.css';
	import { isAuthenticated, authReady, auth, needsUnlock } from '$lib/stores/auth';
	import { familyLinks, activeVault } from '$lib/stores/familyLinks';
	import { t, locale, locales, localeNames } from '$lib/i18n';
	import type { Locale } from '$lib/i18n';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { documents, documentsError } from '$lib/stores/documents';
	import { blueprint, hasBlueprint } from '$lib/blueprint';
	import { quickAddOpen } from '$lib/stores/quickAdd';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import { fade, fly } from 'svelte/transition';

	let docsLoadStarted = false;
	let docsLoaded = false;
	let docsLoading = false;

	// WebCrypto is only exposed to secure contexts (HTTPS, or localhost).
	// When a user opens ciphra over http://<LAN-IP>:port from their phone
	// the API is undefined and every auth + decrypt step throws a cryptic
	// "undefined is not an object" instead of a useful message. Detect once
	// on boot and render a plain-language notice.
	$: secureContextMissing = browser && (!window.isSecureContext || !window.crypto?.subtle);

	// FAB quick-add state. The bottom-nav center FAB (CIPH-201) writes to
	// the `quickAddOpen` store; we mirror it into the local `showQuickAdd`
	// flag so the existing sheet markup keeps working unchanged.
	let showQuickAdd = false;
	$: if ($quickAddOpen && !showQuickAdd) showQuickAdd = true;
	let quickAddNote = '';
	let quickAddSelectedEpisode: string | null = null;
	let quickAddSaving = false;
	let quickAddSaved = false;

	// FAB onboarding (CIPH-102): pulse + tooltip for the first 3 sessions so
	// the quick-add affordance isn't invisible. Klara missed it for 3 min in
	// her walkthrough. Session count is incremented once per app load in
	// onMount below. Tooltip is dismissable and its dismissal is remembered.
	let fabSeenCount = 0;
	let fabTooltipDismissed = true;
	$: fabPulse = browser && fabSeenCount < 3;
	$: fabShowTooltip = browser && fabSeenCount < 3 && !fabTooltipDismissed;

	function dismissFabTooltip() {
		fabTooltipDismissed = true;
		if (browser) {
			try { localStorage.setItem('ciphra_fab_tooltip_dismissed', 'true'); } catch {}
		}
	}

	// CIPH-103 — after the user's first daily_log save, show a one-time
	// tooltip explaining event lines. Triggered from /log/[date] by
	// dispatching a `ciphra:first-daily-log` CustomEvent on window.
	let showEventLineTooltip = false;
	function dismissEventLineTooltip() {
		showEventLineTooltip = false;
		if (browser) {
			try { localStorage.setItem('ciphra_event_line_tooltip_seen', 'true'); } catch {}
		}
	}

	onMount(() => {
		if (!browser) return;
		try {
			const raw = localStorage.getItem('ciphra_fab_seen_count');
			const n = raw ? parseInt(raw, 10) : 0;
			fabSeenCount = Number.isFinite(n) ? n + 1 : 1;
			localStorage.setItem('ciphra_fab_seen_count', String(fabSeenCount));
			fabTooltipDismissed = localStorage.getItem('ciphra_fab_tooltip_dismissed') === 'true';
		} catch {
			fabSeenCount = 3; // fail-safe: suppress rather than spam
			fabTooltipDismissed = true;
		}

		const onFirstDailyLog = () => {
			try {
				if (localStorage.getItem('ciphra_event_line_tooltip_seen') === 'true') return;
			} catch {}
			showEventLineTooltip = true;
		};
		window.addEventListener('ciphra:first-daily-log', onFirstDailyLog);
		return () => window.removeEventListener('ciphra:first-daily-log', onFirstDailyLog);
	});

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
			quickAddOpen.set(false);
		}, 1200);
	}

	function quickAddReset() {
		showQuickAdd = false;
		quickAddOpen.set(false);
		quickAddSelectedEpisode = null;
		quickAddNote = '';
	}

	// Load documents and blueprint when authenticated
	$: if (browser && $isAuthenticated && !docsLoadStarted) {
		docsLoadStarted = true;
		docsLoading = true;
		Promise.all([
			documents.load(),
			familyLinks.load(),
		]).then(() => {
			blueprint.loadFromDocuments();
			docsLoading = false;
			docsLoaded = true;
		});
	}

	// Redirect to setup when authenticated but no blueprint (and not already on /setup or /login or /admin)
	// Only redirect AFTER documents have fully loaded and blueprint has been checked.
	// Caregivers who have already linked to someone else's vault don't need to
	// set up their own condition — they can skip the wizard and still use the
	// app. They can always run /setup later if they want their own tracking.
	$: if (browser && $authReady && $isAuthenticated && docsLoaded && !$hasBlueprint
		&& $familyLinks.length === 0
		&& currentPath !== '/setup' && currentPath !== '/login' && currentPath !== '/settings' && currentPath !== '/admin') {
		goto('/setup');
	}

	function handleLogout() {
		auth.logout();
		docsLoadStarted = false;
		docsLoaded = false;
		blueprint.clear();
		documents.clear();
		familyLinks.clear();
		activeVault.set(null);
		goto('/login');
	}

	// When the caregiver switches vault, clear cached docs + blueprint and
	// reload from the new vault. `lastVault` lets us detect real changes and
	// skip the initial render that fires while the store hydrates.
	let lastVault: number | null | undefined = undefined;
	$: {
		const v = $activeVault;
		if (browser && lastVault !== undefined && v !== lastVault && docsLoaded) {
			docsLoaded = false;
			documents.clear();
			blueprint.clear();
			documents.load().then(() => {
				blueprint.loadFromDocuments();
				docsLoaded = true;
			});
		}
		lastVault = v;
	}

	// If the currently-selected vault has been revoked server-side (patient
	// clicked their panic button), snap the switcher back to the caregiver's
	// own view so they don't sit staring at a broken /family/documents 403.
	$: if (browser && $activeVault !== null && $familyLinks.some(l => l.sourceUserId === $activeVault && l.revoked)) {
		activeVault.set(null);
	}

	$: liveLinks = $familyLinks.filter(l => !l.revoked);

	function setLocale(e: Event) {
		const target = e.currentTarget as HTMLSelectElement;
		locale.set(target.value);
	}

	function onVaultChange(e: Event) {
		const target = e.currentTarget as HTMLSelectElement;
		activeVault.set(target.value ? Number(target.value) : null);
	}

	$: currentPath = $page.url.pathname as string;

	// Redirect to login when auth is ready but user is not authenticated
	// (except if already on /login)
	// Only force redirect to /login for app pages (not / which shows landing for guests)
	$: if (browser && $authReady && !$isAuthenticated
		&& currentPath !== '/login' && currentPath !== '/'
		&& currentPath !== '/setup' && currentPath !== '/privacy' && currentPath !== '/terms'
		&& !currentPath.startsWith('/conditions')
		&& !currentPath.startsWith('/join/')) {
		goto('/login');
	}

	// Session-scoped master_key is gone (browser restarted) but JWT persists.
	// Force re-login so the password unlocks the vault again. Avoids leaving
	// an authenticated but decrypt-useless state.
	$: if (browser && $needsUnlock && currentPath !== '/login') {
		auth.logout();
		goto('/login');
	}

</script>

{#if secureContextMissing}
	<div class="min-h-screen flex items-center justify-center p-6" style="background: var(--surface)">
		<div class="max-w-md w-full rounded-2xl p-6" style="background: var(--surface-card); border: 1px solid rgba(220,38,38,0.3)">
			<svg class="w-8 h-8 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--danger)"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
			<h1 class="text-lg font-semibold mb-2" style="color: var(--text-primary)">{$t('secure_context.title')}</h1>
			<p class="text-sm leading-relaxed mb-3" style="color: var(--text-secondary)">{$t('secure_context.desc')}</p>
			<p class="text-xs font-mono break-all p-2 rounded" style="background: var(--surface-muted); color: var(--text-muted)">{browser ? window.location.href : ''}</p>
		</div>
	</div>
{:else if !$authReady}
	<!-- Stable background while auth hydrates — no content to prevent flashing -->
	<div class="min-h-screen bg-surface"></div>
{:else if (currentPath === '/login' || currentPath === '/privacy' || currentPath === '/terms' || currentPath.startsWith('/conditions') || currentPath.startsWith('/join/')) && !$isAuthenticated}
	<!-- Public-page chrome: the same nav as the landing page, not a reduced
		 "lean" variant, so visitors see one identity across every
		 unauthenticated view. Anchors like #how / #security point back to
		 the landing page so they keep working from any sub-page. -->
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
				<!-- /conditions dropped from top nav per UX review — it remains
					 discoverable from the landing page's Conditions section and
					 the footer. #how + #security anchors cover the marketing
					 narrative. -->
				<div class="hidden md:flex items-center gap-1">
					<a href="/#how" class="text-sm font-medium min-h-[44px] flex items-center px-3 transition-colors" style="color: var(--text-secondary);">{$t('landing.nav_how')}</a>
					<a href="/#security" class="text-sm font-medium min-h-[44px] flex items-center px-3 transition-colors" style="color: var(--text-secondary);">{$t('landing.nav_security')}</a>
				</div>
				<div class="w-px h-6 hidden md:block" style="background: var(--border);"></div>
				<select
					aria-label="Language"
					class="text-xs rounded-lg px-2 py-1.5 min-h-[36px]"
					style="background: var(--surface-card); border: 1px solid var(--border); color: var(--text-secondary);"
					value={$locale}
					on:change={setLocale}
				>
					{#each locales as l}
						<option value={l}>{localeNames[l]}</option>
					{/each}
				</select>
				<!-- On /login the CTA would just point at the page you're on —
					 hide it entirely and show a "Log in" text link elsewhere if
					 needed. Elsewhere: acquisition-first CTA ("Kostenlos
					 starten") and a quieter Anmelden link for returning users. -->
				{#if currentPath !== '/login'}
					<a
						href="/login"
						class="hidden sm:inline-flex text-sm font-medium min-h-[44px] items-center px-3"
						style="color: var(--text-secondary);"
					>{$t('auth.login')}</a>
					<a
						href="/login?mode=register"
						class="btn-primary min-h-[44px] px-5 text-sm font-semibold rounded-lg"
					>{$t('landing.hero_cta')}</a>
				{/if}
			</div>
		</div>
	</nav>
	<slot />
{:else if $isAuthenticated && currentPath !== '/login' && currentPath !== '/setup'}
	<!-- Top Bar -->
	<header class="sticky top-0 z-40 bg-white/95 backdrop-blur border-b">
		<div class="max-w-6xl mx-auto px-4 flex items-center justify-between h-14 gap-2">
			<a href="/" class="flex items-center shrink-0" aria-label="ciphra">
				<svg viewBox="0 0 220 50" class="h-7" aria-hidden="true">
					<text x="0" y="36" font-family="Inter, DM Sans, sans-serif" font-size="36" font-weight="500" letter-spacing="1" class="fill-surface-slate">ciphra</text>
					<g transform="translate(134,12) rotate(8)" class="stroke-brand" stroke-linecap="round" fill="none">
						<path d="M -6.5 0 L 6.5 0" stroke-width="1.5"/>
						<path d="M -2.7 -4.6 L 2.7 4.6" stroke-width="1.2"/>
						<path d="M 2.6 -4.4 L -2.6 4.4" stroke-width="1.1"/>
					</g>
				</svg>
			</a>

			<!-- Desktop primary nav (CIPH-201 follow-up) — bottom-nav handles
			     mobile, but on >=md the only navigation in the header was logo
			     + settings + logout, leaving users stranded. Mirror the 4 main
			     routes here. Active route gets brand color + brand bottom border. -->
			<nav class="hidden md:flex items-center gap-1 ml-2" aria-label="Primary">
				{#each [
					{ href: '/',         label: $t('nav.today') },
					{ href: '/calendar', label: $t('nav.calendar') },
					{ href: '/journal',  label: $t('nav.journal') },
					{ href: '/reports',  label: $t('nav.reports') }
				] as item}
					{@const active = item.href === '/'
						? currentPath === '/'
						: currentPath === item.href || currentPath.startsWith(item.href + '/')}
					<a
						href={item.href}
						class="text-sm font-medium px-3 py-2 rounded-lg transition-colors"
						style="color: {active ? 'var(--brand)' : 'var(--text-secondary)'};
						       {active ? 'background: var(--surface-muted);' : ''}"
						aria-current={active ? 'page' : undefined}
					>{item.label}</a>
				{/each}
			</nav>

			{#if liveLinks.length > 0}
				<!-- Vault switcher: visible label + eye icon so it reads as
					 "you're viewing X" rather than a bare dropdown. -->
				<label class="flex items-center gap-1.5 rounded-lg px-2.5 py-1 min-h-[36px] cursor-pointer"
					style="background: {$activeVault ? 'rgba(159, 99, 11, 0.12)' : 'var(--surface-muted)'};
					       border: 1px solid {$activeVault ? 'var(--ochre)' : 'var(--border)'};">
					<svg class="w-4 h-4 shrink-0" style="color: {$activeVault ? 'var(--ochre)' : 'var(--text-muted)'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke-width="2"/></svg>
					<span class="text-xs hidden sm:inline" style="color: var(--text-muted)">{$t('family.switcher_viewing')}</span>
					<select
						aria-label={$t('family.switcher_label')}
						class="text-sm bg-transparent border-none outline-none cursor-pointer font-medium pr-1"
						style="color: {$activeVault ? 'var(--ochre)' : 'var(--text-primary)'}"
						value={$activeVault ?? ''}
						on:change={onVaultChange}
					>
						<option value="">{$t('family.switcher_self')}</option>
						{#each liveLinks as l}
							<option value={l.sourceUserId}>{l.sourceUsername}</option>
						{/each}
					</select>
				</label>
			{/if}
			<div class="flex items-center gap-1 ml-auto">
				<!-- Admin link -->
				{#if $auth.isAdmin}
					<a
						href="/admin"
						class="p-2.5 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center
							{currentPath === '/admin'
								? 'text-brand bg-surface-muted'
								: 'text-slate-500 hover:bg-surface-muted'}"
						aria-label={$t('admin.title')}
						title={$t('admin.title')}
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.031 9-11.622 0-1.042-.133-2.052-.382-3.016z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</a>
				{/if}
				<!-- Settings (kept in header per CIPH-201; not a primary daily action) -->
				<a
					href="/settings"
					class="p-2.5 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center
						{currentPath === '/settings'
							? 'text-brand bg-surface-muted'
							: 'text-slate-500 hover:bg-surface-muted'}"
					aria-label={$t('nav.settings')}
					title={$t('nav.settings')}
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" stroke-width="2"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" stroke-width="2"/></svg>
				</a>
				<!-- Logout -->
				<button
					type="button"
					on:click={handleLogout}
					aria-label={$t('auth.logout')}
					title={$t('auth.logout')}
					class="p-2.5 rounded-lg text-slate-500 hover:bg-surface-muted transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14l5-5-5-5m5 5H9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</button>
			</div>
		</div>
	</header>

	{#if $activeVault}
		{@const activeLink = $familyLinks.find(l => l.sourceUserId === $activeVault)}
		<div class="border-b px-4 py-2" style="background: rgba(159, 99, 11, 0.08); border-color: rgba(159, 99, 11, 0.2)">
			<div class="max-w-6xl mx-auto flex items-center justify-between gap-3">
				<p class="text-sm" style="color: var(--ochre)">
					<strong>{$t('family.banner_viewing', { user: activeLink?.sourceUsername ?? '' })}</strong>
					<span style="color: var(--text-secondary)">— {$t('family.banner_desc')}</span>
				</p>
				<button
					type="button"
					on:click={() => activeVault.set(null)}
					class="text-xs font-medium px-3 py-1 rounded-lg shrink-0 min-h-[32px]"
					style="background: rgba(159,99,11,0.15); color: var(--ochre)"
				>
					{$t('family.banner_switch_back')}
				</button>
			</div>
		</div>
	{/if}

	{#if docsLoading}
		<div class="fixed top-14 left-0 right-0 z-50 h-0.5 bg-brand/10 overflow-hidden">
			<div class="h-full bg-brand animate-pulse" style="width: 60%"></div>
		</div>
	{/if}

	{#if $documentsError}
		<div class="mx-4 mt-2 p-3 rounded-xl flex items-center gap-3" style="background: rgba(220,38,38,0.05); border: 1px solid rgba(220,38,38,0.2)">
			<svg class="w-5 h-5 shrink-0" style="color: var(--danger)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2"/><line x1="15" y1="9" x2="9" y2="15" stroke-width="2" stroke-linecap="round"/><line x1="9" y1="9" x2="15" y2="15" stroke-width="2" stroke-linecap="round"/></svg>
			<p class="text-sm" style="color: var(--danger)">{$documentsError}</p>
			<button on:click={() => { documentsError.set(null); documents.load(); }} class="ml-auto text-xs font-medium min-h-[44px] px-2" style="color: var(--danger)">{$t('common.retry')}</button>
		</div>
	{/if}

	<main style="padding-bottom: calc(6rem + env(safe-area-inset-bottom, 0px))">
		<slot />
	</main>

	<!-- FAB (+) button -->
	{#if bp && $hasBlueprint && currentPath !== '/login' && currentPath !== '/setup'}
		{#if fabShowTooltip}
			<!-- First-session onboarding tooltip: dismissable, never shown after. -->
			<button
				type="button"
				on:click={dismissFabTooltip}
				class="fab-tooltip"
				style="bottom: calc(8rem + env(safe-area-inset-bottom, 0px)); right: 1rem;"
				transition:fade={{ duration: 200 }}
				aria-label={$t('fab.tooltip_dismiss')}
			>
				<p class="text-xs leading-snug">{$t('fab.tooltip_text')}</p>
				<p class="text-[10px] mt-1 opacity-80 underline">{$t('fab.tooltip_dismiss')}</p>
			</button>
		{/if}
		{#if showEventLineTooltip}
			<!-- One-time event-line onboarding tooltip after the user's first
				 daily_log. Points at the FAB; click to dismiss forever. -->
			<button
				type="button"
				on:click={dismissEventLineTooltip}
				class="fab-tooltip fab-tooltip--event"
				style="bottom: calc(8rem + env(safe-area-inset-bottom, 0px)); right: 1rem;"
				transition:fade={{ duration: 200 }}
				aria-label={$t('fab.tooltip_dismiss')}
			>
				<p class="text-xs leading-snug">{$t('tooltip.event_line_intro')}</p>
				<p class="text-[10px] mt-1 opacity-80 underline">{$t('fab.tooltip_dismiss')}</p>
			</button>
		{/if}
		<button
			on:click={() => { if (fabShowTooltip) dismissFabTooltip(); if (showEventLineTooltip) dismissEventLineTooltip(); showQuickAdd = true; }}
			class="fab hidden md:flex"
			class:fab-pulse={fabPulse}
			style="bottom: calc(4.5rem + env(safe-area-inset-bottom, 0px)); right: 1rem;"
			aria-label={$t('fab.aria_label')}
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
								on:input={() => { if (fabShowTooltip) dismissFabTooltip(); }}
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

	<!-- Mobile bottom-tab navigation (CIPH-201). md:hidden — desktop uses
		 the existing FAB + header. -->
	<BottomNav />
{:else}
	<slot />
{/if}

<!-- Mount BottomNav on public chrome too, but it self-hides on those routes
	 via its own pathname check. Keeping the mount point inside the auth
	 branch above is fine — public routes don't need it. -->
