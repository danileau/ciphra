<script lang="ts">
	import '../app.css';
	import { isAuthenticated, authReady, auth, needsUnlock } from '$lib/stores/auth';
	import { familyLinks, activeVault } from '$lib/stores/familyLinks';
	import { t, translateUnit } from '$lib/i18n';
	import type { Locale } from '$lib/i18n';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { documents, documentsError } from '$lib/stores/documents';
	import { get } from 'svelte/store';
	import { blueprint, hasBlueprint, resolvedBlueprint, isCustomItem } from '$lib/blueprint';
	import { cohortOf } from '$lib/blueprint/cohort';
	import { pathToRoute } from '$lib/cohortPalette';
	import { quickAddOpen } from '$lib/stores/quickAdd';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import AuthedFooter from '$lib/components/AuthedFooter.svelte';
	import PublicFooter from '$lib/components/PublicFooter.svelte';
	import Wordmark from '$lib/components/Wordmark.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import TimePicker from '$lib/components/TimePicker.svelte';
	import { shellFor } from '$lib/routeShells';
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
	// CIPH-710 — third quick-add mode: a private diary entry. Default 'log'
	// preserves the existing flow (episode chip + note → entry/event); 'diary'
	// switches to a date+time+text form that writes a `type: 'diary'` doc,
	// hard-excluded from every export.
	// CIPH-881 — fourth mode 'med' for rescue / breakthrough meds, surfaced
	// only when the active blueprint declares `rescueMedications`. Writes a
	// `type:'event'` + `kind:'medication'` doc with the current time.
	let quickAddMode: 'log' | 'diary' | 'med' = 'log';
	let diaryDate = '';
	let diaryTime = '';
	let diaryText = '';
	let quickAddSelectedMedId: string | null = null;
	let quickAddDose = '';
	// CIPH-713 — private toggle on quick-add log/event flow.
	let quickAddPrivate = false;

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

	// CIPH-767c — FAB long-press (≥500ms) skips the mode picker and opens
	// directly into the user's most-recently-used quick-add mode, persisted
	// in localStorage. Normal tap behavior is unchanged (picker shown).
	const QUICKADD_LAST_MODE_KEY = 'ciphra_quickadd_last_mode';
	// CIPH-884 — remember the most-recently-selected FAB episode type so
	// subsequent quick-adds float it to the front of the picker. Persists
	// across sessions. One value per user (per-device).
	const QUICKADD_LAST_EP_KEY = 'ciphra_quickadd_last_episode';
	let lastEpisodeId: string | null = null;
	let fabPressTimer: ReturnType<typeof setTimeout> | null = null;
	let fabLongPressed = false;

	function fabOpenPicker() {
		if (fabShowTooltip) dismissFabTooltip();
		if (showEventLineTooltip) dismissEventLineTooltip();
		showQuickAdd = true;
	}
	function fabOpenLastMode() {
		let last: 'log' | 'diary' | 'med' = 'log';
		if (browser) {
			try {
				const v = localStorage.getItem(QUICKADD_LAST_MODE_KEY);
				if (v === 'diary' || v === 'log' || v === 'med') last = v;
			} catch {}
		}
		// CIPH-881 — if user previously used 'med' but switched to a blueprint
		// without rescue meds, the third mode chip won't render. Fall back.
		if (last === 'med' && !(bp?.rescueMedications && bp.rescueMedications.length > 0)) {
			last = 'log';
		}
		quickAddMode = last;
		if (last === 'diary' && !diaryDate) diaryDate = new Date().toISOString().slice(0, 10);
		fabOpenPicker();
	}
	function onFabPointerDown() {
		fabLongPressed = false;
		fabPressTimer = setTimeout(() => {
			fabLongPressed = true;
			fabOpenLastMode();
		}, 500);
	}
	function onFabPointerUp() {
		if (fabPressTimer) { clearTimeout(fabPressTimer); fabPressTimer = null; }
	}
	function onFabPointerCancel() {
		if (fabPressTimer) { clearTimeout(fabPressTimer); fabPressTimer = null; }
		fabLongPressed = false;
	}
	function onFabClick() {
		// If long-press already opened + primed the mode, swallow the
		// subsequent click to avoid toggling state twice.
		if (fabLongPressed) { fabLongPressed = false; return; }
		fabOpenPicker();
	}
	// Persist last-used mode whenever it changes (observer runs after save).
	$: if (browser) {
		try { localStorage.setItem(QUICKADD_LAST_MODE_KEY, quickAddMode); } catch {}
	}

	// CIPH-767e — sync indicator (Astrid) + PWA install prompt.
	let syncToastShow = false;
	let syncToastKey = 0;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let deferredInstallPrompt: any = null;
	let pwaInstallVisible = false;
	const PWA_DISMISS_KEY = 'ciphra_pwa_install_dismissed_at';

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
			lastEpisodeId = localStorage.getItem(QUICKADD_LAST_EP_KEY);
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

		// CIPH-767e — "Synced" toast on save round-trips (dispatched from
		// documents.save). Re-keying the Toast via syncToastKey forces a
		// fresh mount so its onMount duration timer restarts cleanly when a
		// user saves several entries in quick succession.
		const onSynced = () => {
			syncToastKey += 1;
			syncToastShow = true;
			setTimeout(() => { syncToastShow = false; }, 1800);
		};
		window.addEventListener('ciphra:synced', onSynced);

		// CIPH-767e — PWA install prompt (Astrid / Samsung). Capture the
		// beforeinstallprompt event so we can offer install from our own UI.
		// Suppressed for 7 days after dismissal, forever after successful install.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const onBeforeInstall = (e: any) => {
			e.preventDefault?.();
			deferredInstallPrompt = e;
			// Respect prior dismissal (7-day cool-off).
			try {
				const raw = localStorage.getItem(PWA_DISMISS_KEY);
				const ts = raw ? parseInt(raw, 10) : 0;
				const sevenDays = 7 * 24 * 60 * 60 * 1000;
				if (ts && Date.now() - ts < sevenDays) return;
			} catch {}
			pwaInstallVisible = true;
		};
		window.addEventListener('beforeinstallprompt', onBeforeInstall as EventListener);
		const onAppInstalled = () => {
			pwaInstallVisible = false;
			deferredInstallPrompt = null;
			try { localStorage.setItem(PWA_DISMISS_KEY, String(Date.now())); } catch {}
		};
		window.addEventListener('appinstalled', onAppInstalled);

		return () => {
			window.removeEventListener('ciphra:first-daily-log', onFirstDailyLog);
			window.removeEventListener('ciphra:synced', onSynced);
			window.removeEventListener('beforeinstallprompt', onBeforeInstall as EventListener);
			window.removeEventListener('appinstalled', onAppInstalled);
		};
	});

	async function acceptPwaInstall() {
		if (!deferredInstallPrompt) { pwaInstallVisible = false; return; }
		try {
			deferredInstallPrompt.prompt();
			await deferredInstallPrompt.userChoice;
		} catch {}
		deferredInstallPrompt = null;
		pwaInstallVisible = false;
	}
	function dismissPwaInstall() {
		pwaInstallVisible = false;
		if (browser) {
			try { localStorage.setItem(PWA_DISMISS_KEY, String(Date.now())); } catch {}
		}
	}

	$: bp = $resolvedBlueprint;

	function selectEpisodeType(id: string) {
		quickAddSelectedEpisode = quickAddSelectedEpisode === id ? null : id;
		if (quickAddSelectedEpisode && browser) {
			lastEpisodeId = id;
			try { localStorage.setItem(QUICKADD_LAST_EP_KEY, id); } catch {}
		}
	}
	// Reorder so the last-used episode is the first chip. Non-destructive —
	// the full list is preserved, we just sort the last-used to index 0.
	$: episodeTypesOrdered = bp
		? (lastEpisodeId && bp.episodeTypes.some((e) => e.id === lastEpisodeId)
			? [
				bp.episodeTypes.find((e) => e.id === lastEpisodeId)!,
				...bp.episodeTypes.filter((e) => e.id !== lastEpisodeId),
			]
			: bp.episodeTypes)
		: [];

	function selectRescueMed(id: string) {
		quickAddSelectedMedId = quickAddSelectedMedId === id ? null : id;
		// Pre-fill the dose input with the preset's defaultDose so the user
		// can confirm by tapping save, or override before saving.
		if (quickAddSelectedMedId) {
			const m = bp?.rescueMedications?.find((r) => r.id === id);
			if (m?.defaultDose && !quickAddDose.trim()) quickAddDose = m.defaultDose;
		} else {
			quickAddDose = '';
		}
	}

	async function quickAddSave() {
		const now = new Date();
		const todayStr = now.toISOString().slice(0, 10);

		// CIPH-881 — rescue medication writes a `type:'event' kind:'medication'`
		// doc, distinct from the freeform note-marker event used by the log mode.
		if (quickAddMode === 'med') {
			if (!quickAddSelectedMedId) return;
			quickAddSaving = true;
			const nowTime = now.toTimeString().slice(0, 5);
			const med = bp?.rescueMedications?.find((m) => m.id === quickAddSelectedMedId);
			const dose = quickAddDose.trim() || med?.defaultDose || undefined;
			await documents.save({
				type: 'event',
				kind: 'medication',
				date: todayStr,
				time: nowTime,
				medicationId: quickAddSelectedMedId,
				dose,
				private: quickAddPrivate || undefined,
			});
			quickAddSaving = false;
			quickAddSaved = true;
			setTimeout(() => {
				quickAddSaved = false;
				quickAddSelectedMedId = null;
				quickAddDose = '';
				quickAddMode = 'log';
				showQuickAdd = false;
				quickAddOpen.set(false);
			}, 1200);
			return;
		}

		// CIPH-710 — diary mode writes a `type: 'diary'` doc that is hard-
		// excluded from every export surface (PDF/CSV/reports/share).
		if (quickAddMode === 'diary') {
			if (!diaryText.trim()) return;
			quickAddSaving = true;
			await documents.save({
				type: 'diary',
				date: diaryDate || todayStr,
				time: diaryTime || undefined,
				text: diaryText.trim(),
				private: true,
			});
			quickAddSaving = false;
			quickAddSaved = true;
			setTimeout(() => {
				quickAddSaved = false;
				diaryDate = '';
				diaryTime = '';
				diaryText = '';
				quickAddMode = 'log';
				showQuickAdd = false;
				quickAddOpen.set(false);
			}, 1200);
			return;
		}

		if (!quickAddSelectedEpisode && !quickAddNote.trim()) return;
		quickAddSaving = true;

		if (quickAddSelectedEpisode) {
			// Merge into today's existing `type:'entry'` if one exists — otherwise
			// `/log/[date]` and FAB quick-add each mint separate rows for the same
			// date, doubling journal and confusing reports/PDF.
			const nowTime = now.toTimeString().slice(0, 5);
			const note = quickAddNote.trim();
			const existing = get(documents).find(
				(d: any) => d.data?.type === 'entry' && d.data?.date === todayStr
			);
			if (existing) {
				const cur: any = existing.data;
				const prevCount = Number(cur.episodes?.[quickAddSelectedEpisode] || 0);
				const prevNote = cur.episodeNotes?.[quickAddSelectedEpisode] || '';
				const appendedNote = note
					? (prevNote ? `${prevNote}\n${nowTime}: ${note}` : `${nowTime}: ${note}`)
					: prevNote || undefined;
				await documents.updateDoc(existing.id, {
					...cur,
					episodes: { ...(cur.episodes || {}), [quickAddSelectedEpisode]: prevCount + 1 },
					episodeTimes: {
						...(cur.episodeTimes || {}),
						[quickAddSelectedEpisode]: cur.episodeTimes?.[quickAddSelectedEpisode] || nowTime,
					},
					episodeNotes: {
						...(cur.episodeNotes || {}),
						...(appendedNote !== undefined ? { [quickAddSelectedEpisode]: appendedNote } : {}),
					},
				});
			} else {
				await documents.save({
					type: 'entry',
					date: todayStr,
					episodeType: quickAddSelectedEpisode,
					time: nowTime,
					episodes: { [quickAddSelectedEpisode]: 1 },
					episodeTimes: { [quickAddSelectedEpisode]: nowTime },
					episodeNotes: note ? { [quickAddSelectedEpisode]: `${nowTime}: ${note}` } : undefined,
					private: quickAddPrivate || undefined,
				});
			}
		} else if (quickAddNote.trim()) {
			await documents.save({
				type: 'event',
				date: todayStr,
				notes: quickAddNote.trim(),
				private: quickAddPrivate || undefined,
			});
		}

		quickAddSaving = false;
		quickAddSaved = true;
		setTimeout(() => {
			quickAddSaved = false;
			quickAddSelectedEpisode = null;
			quickAddNote = '';
			quickAddPrivate = false;
			showQuickAdd = false;
			quickAddOpen.set(false);
		}, 1200);
	}

	function quickAddReset() {
		showQuickAdd = false;
		quickAddOpen.set(false);
		quickAddSelectedEpisode = null;
		quickAddNote = '';
		quickAddMode = 'log';
		diaryDate = '';
		diaryTime = '';
		diaryText = '';
		quickAddPrivate = false;
		quickAddSelectedMedId = null;
		quickAddDose = '';
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

	// Redirect to setup when authenticated but no blueprint, only for
	// routes that require a blueprint per the registry. Caregivers who
	// have already linked to someone else's vault don't need to set up
	// their own condition — they can skip the wizard and still use the
	// app. Only redirect AFTER documents have fully loaded and blueprint
	// has been checked. The per-route allow-list (login/setup/settings/
	// admin/migrate) that used to live here is now encoded in the
	// registry via `requiresBlueprint=false` on each of those shells.
	$: if (browser && $authReady && $isAuthenticated && docsLoaded && !$hasBlueprint
		&& $familyLinks.length === 0
		&& shellFor(currentPath).requiresBlueprint) {
		goto('/setup');
	}

	async function handleLogout() {
		// PI v16 — wait for the on-disk wipe before goto so the SW + IndexedDB
		// purge has finished before any subsequent navigation could repopulate
		// caches. UI already flipped (logout sets empty state synchronously).
		await auth.logout();
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

	// CIPH-pi24-1B — `setLocale` removed from the layout. The language
	// picker now lives only in PublicFooter, which has its own local
	// copy of the handler.

	function onVaultChange(e: Event) {
		const target = e.currentTarget as HTMLSelectElement;
		activeVault.set(target.value ? Number(target.value) : null);
	}

	$: currentPath = $page.url.pathname as string;
	// CIPH-833 — route-shell registry. One lookup per route drives
	// both the chrome selection and the auth/blueprint guards below,
	// replacing the old multi-branch `currentPath !== '/X' && …`
	// chains that each new route had to be patched into.
	$: currentShell = shellFor(currentPath);
	// CIPH-890 — `data-route` and `data-cohort` on <main> drive the
	// cohort×route palette modulation in `app.css`. Pure attributes;
	// CIPH-891 will migrate consumers to use the resulting CSS vars.
	$: currentRoute = pathToRoute(currentPath);
	$: currentCohort = cohortOf($resolvedBlueprint);

	// Redirect to login when auth is ready but user is not authenticated
	// and the current route requires auth. Public routes (landing,
	// /login itself, /privacy, /terms, /conditions/*, /join/*, /migrate,
	// /stream) all have requiresAuth=false in the registry.
	$: if (browser && $authReady && !$isAuthenticated
		&& currentShell.requiresAuth
		&& currentPath !== '/login') {
		goto('/login');
	}

	// Session-scoped master_key is gone (browser restarted) but JWT persists.
	// Force re-login so the password unlocks the vault again. Avoids leaving
	// an authenticated but decrypt-useless state.
	//
	// Gated on `requiresAuth`: public routes (/, /migrate, /join/*, /privacy,
	// etc.) have their own signup/auth-handling and must not be hijacked.
	// Previously this fired on /migrate when a user with a stale JWT hit
	// the inbound migration link — bounced them to /login instead of letting
	// them sign up a fresh ciphra account via the inline SignupFlow.
	$: if (browser && $needsUnlock && currentShell.requiresAuth && currentPath !== '/login') {
		// auth.logout() is async (PI v16); fire-and-forget here is fine
		// because the master key is already gone — no plaintext to leak.
		// The wipe still runs in background.
		void auth.logout();
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
{:else if !$isAuthenticated && (currentShell.shell === 'landing' || currentShell.shell === 'auth-flow' || currentShell.shell === 'public-doc' || currentShell.shell === 'family-claim')}
	<!-- PI v16 LB-15 — skip-to-content for the public shell. Was only on
		 the landing page; now every public-doc + auth-flow + family-claim
		 page inherits it so /privacy /terms /protocol /conditions/[id] no
		 longer force keyboard / SR users through 4-6 nav stops on entry. -->
	<a
		href="#main-content"
		class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:outline-none"
		style="background: var(--brand); color: white;"
	>{$t('landing.skip_to_content')}</a>
	<!-- Single unified public nav — covers landing, /login, /migrate,
		 /conditions, /privacy, /terms, /join/*. One identity for every
		 unauthenticated visitor; anchor links resolve back to the
		 landing page so they keep working from any sub-page. The
		 separate "Anmelden" text link was dropped — it was redundant
		 with the primary CTA and visually competed with it. Returning
		 users find the Login tab inside /login itself. -->
	<nav class="sticky top-0 z-40 backdrop-blur-sm" style="border-bottom: 1px solid var(--border); background: rgba(255,255,255,0.85);">
		<div class="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
			<a href="/" class="flex items-center gap-1">
				<Wordmark size={28} />
			</a>
			<div class="flex items-center gap-3">
				<div class="hidden md:flex items-center gap-1">
					<a href="/#conditions" class="text-sm font-medium min-h-[44px] flex items-center px-3 transition-colors" style="color: var(--text-secondary);">{$t('nav.conditions')}</a>
					<a href="/#how" class="text-sm font-medium min-h-[44px] flex items-center px-3 transition-colors" style="color: var(--text-secondary);">{$t('landing.nav_how')}</a>
					<a href="/#security" class="text-sm font-medium min-h-[44px] flex items-center px-3 transition-colors" style="color: var(--text-secondary);">{$t('landing.nav_security')}</a>
				</div>
				<!-- CIPH-pi24-1B — Language picker lives in PublicFooter only.
					 Header was the wrong slot: chrome density at 4 nav links +
					 dropdown + CTA crowded the bar; trust-aware Swiss apps
					 (Threema, Proton) put language in the footer where users
					 actually look for it. -->
				<!-- CIPH-pi24-1A — Header CTA returns returning users to /login.
					 The "kostenlos starten" CTA appears 3x in landing body
					 (hero, conditions section, final CTA) — a 4th in the header
					 wasn't helping new users and was misdirecting returning
					 ones who needed to log in. Hidden on auth-flow shell
					 (/login, /migrate, /stream) for the same loop-prevention
					 reason as before. -->
				{#if currentShell.shell !== 'auth-flow'}
					<a
						href="/login"
						class="btn-secondary min-h-[44px] px-5 text-sm font-semibold rounded-lg"
					>{$t('auth.login')}</a>
				{/if}
			</div>
		</div>
	</nav>
	<slot />
	<!-- CIPH-916 — public footer for landing + public-doc shells
		 (/conditions, /privacy, /terms, /protocol). Auth-flow + family-
		 claim shells skip it intentionally — those are focus surfaces. -->
	{#if currentShell.shell === 'landing' || currentShell.shell === 'public-doc'}
		<PublicFooter />
	{/if}
{:else if $isAuthenticated && currentPath !== '/login' && currentPath !== '/setup'}
	<!-- CIPH-904 — Skip-to-content link for keyboard / AT users. Public
		 landing already had this; the authed shell didn't, leaving 8-9
		 nav stops in the header before reaching content on every page. -->
	<a
		href="#main-content"
		class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:outline-none"
		style="background: var(--brand); color: white;"
	>{$t('landing.skip_to_content')}</a>
	<!-- Top Bar -->
	<header class="sticky top-0 z-40 bg-white/95 backdrop-blur border-b">
		<div class="max-w-6xl mx-auto px-4 flex items-center justify-between h-14 gap-2">
			<a href="/" class="flex items-center shrink-0" aria-label="ciphra">
				<Wordmark size={28} />
			</a>

			<!-- Desktop primary nav (CIPH-201 follow-up) — bottom-nav handles
			     mobile, but on >=md the only navigation in the header was logo
			     + settings + logout, leaving users stranded. Mirror the 4 main
			     routes here. Active route gets brand color + brand bottom border. -->
			<nav class="hidden md:flex items-center gap-1 ml-2" aria-label="Primary">
				{#each [
					{ href: '/',         label: $t('nav.dashboard') },
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
				<label class="flex items-center gap-1.5 rounded-lg px-2 py-1 min-h-[36px] cursor-pointer"
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
						class="p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center
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
					class="p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center
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
					class="p-2 rounded-lg text-slate-500 hover:bg-surface-muted transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14l5-5-5-5m5 5H9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</button>
			</div>
		</div>
	</header>

	{#if $activeVault}
		{@const activeLink = $familyLinks.find(l => l.sourceUserId === $activeVault)}
		{@const hiddenCount = $documents.filter(d => d.data?.type === 'diary' || d.data?.private === true).length}
		{@const visibleCount = $documents.length - hiddenCount}
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
			{#if hiddenCount > 0}
				<!-- CIPH-726 — caregivers need to know they are not seeing the
					 private/diary entries. Muted, lock-iconed, non-alarmist. -->
				<div class="max-w-6xl mx-auto mt-1 flex items-center gap-1.5 text-xs" style="color: var(--text-muted)">
					<svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" stroke-width="2"/><path d="M8 11V8a4 4 0 018 0v3" stroke-width="2" stroke-linecap="round"/></svg>
					<span>{$t('family.private_context', { visible: String(visibleCount), private: String(hiddenCount) })}</span>
				</div>
			{/if}
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

	<main
		id="main-content"
		data-route={currentRoute}
		data-cohort={currentCohort}
		style="padding-bottom: 2rem"
	>
		<slot />
	</main>

	<!-- CIPH-903 — minimal authed footer. Watermark + Privacy/Terms/Security
		 links + encryption.badge trust signal that used to live in Companion's
		 bottom block. Self-hides on /log/[date], /setup, /login, /migrate so
		 focus surfaces stay clean. The footer's own margin-bottom clears the
		 BottomNav (mobile) and safe-area (desktop). -->
	<AuthedFooter />

	<!-- CIPH-pi24-5d — Desktop FAB + its 2 onboarding tooltips removed.
		 Dogfood read it as "off-grid (too far right) and breaks the style
		 of the page" — the floating accent circle pinned at `right: 1rem`
		 (viewport edge, not content grid) felt orphaned against the
		 max-w-6xl content. Mobile BottomNav center-+ stays (it's grid-
		 native). Per-page add affordances replace the desktop FAB:
		 dashboard CTA (S5+S1 hero) + /journal header button. Calendar
		 already has day-cell click → /log/{date} as its add path. -->
	{#if bp && $hasBlueprint && currentPath !== '/login' && currentPath !== '/setup'}
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
						<p class="text-sm mb-4" style="color: var(--text-muted)">{$t('quickadd.what_happened')}</p>

						<!-- CIPH-710 — top-level mode switch: log entry vs private diary.
							 CIPH-881 — third "med" chip surfaced only when the active
							 blueprint declares rescueMedications. -->
						<div class="flex gap-2 mb-4 p-1 rounded-lg" style="background: var(--surface-muted)">
							<button
								type="button"
								on:click={() => { quickAddMode = 'log'; }}
								data-testid="quickadd-mode-log"
								class="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors min-h-[40px]"
								style="background: {quickAddMode === 'log' ? 'white' : 'transparent'}; color: {quickAddMode === 'log' ? 'var(--text-primary)' : 'var(--text-muted)'}"
							>{$t('quickadd.mode_entry')} / {$t('quickadd.mode_event')}</button>
							<button
								type="button"
								on:click={() => { quickAddMode = 'diary'; if (!diaryDate) diaryDate = new Date().toISOString().slice(0, 10); }}
								data-testid="quickadd-mode-diary"
								class="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors min-h-[40px] inline-flex items-center justify-center gap-1.5"
								style="background: {quickAddMode === 'diary' ? 'white' : 'transparent'}; color: {quickAddMode === 'diary' ? 'var(--text-primary)' : 'var(--text-muted)'}"
							>
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<rect x="4" y="11" width="16" height="10" rx="2" />
									<path d="M8 11V7a4 4 0 1 1 8 0v4" />
								</svg>
								{$t('quickadd.mode_diary')}
							</button>
							{#if bp.rescueMedications && bp.rescueMedications.length > 0}
								<button
									type="button"
									on:click={() => { quickAddMode = 'med'; }}
									data-testid="quickadd-mode-med"
									class="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors min-h-[40px] inline-flex items-center justify-center gap-1.5"
									style="background: {quickAddMode === 'med' ? 'white' : 'transparent'}; color: {quickAddMode === 'med' ? 'var(--text-primary)' : 'var(--text-muted)'}"
								>
									<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
										<path d="M19 14l-7 7-7-7a7 7 0 1 1 14 0z"/>
										<circle cx="12" cy="11" r="3"/>
									</svg>
									{$t('quickadd.mode_med')}
								</button>
							{/if}
						</div>

						{#if quickAddMode === 'med' && bp.rescueMedications && bp.rescueMedications.length > 0}
							<!-- CIPH-881 — Rescue medication picker. Tap a chip to select;
								 dose pre-fills from preset defaultDose, override if needed. -->
							<p class="text-xs font-medium uppercase tracking-wider mb-2" style="color: var(--text-muted)">{$t('quickadd.pick_med')}</p>
							<div class="flex flex-wrap gap-2 mb-4">
								{#each bp.rescueMedications as med}
									<button
										type="button"
										on:click={() => selectRescueMed(med.id)}
										data-testid="quickadd-med-{med.id}"
										class="flex items-center gap-2 px-4 py-2 rounded-xl border transition-all min-h-[44px]"
										style="border-color: {quickAddSelectedMedId === med.id ? 'var(--brand)' : 'var(--border)'}; background: {quickAddSelectedMedId === med.id ? 'var(--brand-light, rgba(176,75,47,0.08))' : 'var(--surface-muted)'}"
									>
										<span class="text-sm font-medium" style="color: {quickAddSelectedMedId === med.id ? 'var(--brand)' : 'var(--text-primary)'}">{$t(med.label)}</span>
										{#if med.defaultDose}
											<span class="text-[11px]" style="color: var(--text-muted)">{med.defaultDose}{med.unit ? ' ' + translateUnit($t, med.unit) : ''}</span>
										{/if}
									</button>
								{/each}
							</div>
							{#if quickAddSelectedMedId}
								{@const selectedMed = bp.rescueMedications.find(m => m.id === quickAddSelectedMedId)}
								<div class="mb-3">
									<label class="text-xs" style="color: var(--text-secondary)" for="qa-dose">
										{$t('quickadd.dose')}
										{#if selectedMed?.unit}
											<span style="color: var(--text-muted)">({translateUnit($t, selectedMed.unit)})</span>
										{/if}
										<span style="color: var(--text-muted)">— {$t('quickadd.dose_optional')}</span>
									</label>
									<input
										id="qa-dose"
										type="text"
										inputmode="decimal"
										bind:value={quickAddDose}
										placeholder={selectedMed?.defaultDose ?? ''}
										data-testid="quickadd-dose"
										class="input mt-1"
									/>
								</div>
							{/if}
							<p class="text-[11px] mb-3" style="color: var(--text-muted)">{$t('quickadd.med_save_hint')}</p>
							<button
								on:click={quickAddSave}
								disabled={quickAddSaving || !quickAddSelectedMedId}
								data-testid="quickadd-save-med"
								class="btn-primary w-full py-3 text-sm mb-3"
							>{quickAddSaving ? $t('common.loading') : $t('quickadd.save')}</button>
						{:else if quickAddMode === 'diary'}
							<p class="text-[11px] mb-3" style="color: var(--text-muted)">{$t('quickadd.diary_hint')}</p>
							<div class="grid grid-cols-2 gap-2 mb-3">
								<div>
									<label class="text-xs" style="color: var(--text-secondary)" for="qa-diary-date">{$t('common.date')}</label>
									<div class="mt-1">
										<DatePicker
											id="qa-diary-date"
											bind:value={diaryDate}
											format={$resolvedBlueprint?.dateFormat ?? 'dd.mm.yyyy'}
											ariaLabel={$t('common.date')}
										/>
									</div>
								</div>
								<div>
									<label class="text-xs" style="color: var(--text-secondary)" for="qa-diary-time">{$t('common.time')} <span style="color: var(--text-muted)">({$t('common.optional')})</span></label>
									<div class="mt-1">
										<TimePicker
											id="qa-diary-time"
											bind:value={diaryTime}
											ariaLabel={$t('common.time')}
										/>
									</div>
								</div>
							</div>
							<div class="mb-4">
								<label class="text-xs" style="color: var(--text-secondary)" for="qa-diary-text">{$t('quickadd.diary_text_label')}</label>
								<textarea id="qa-diary-text" bind:value={diaryText} rows="5" data-testid="quickadd-diary-text" class="input mt-1 resize-y" placeholder={$t('quickadd.diary_placeholder')}></textarea>
							</div>
							<button
								on:click={quickAddSave}
								disabled={quickAddSaving || !diaryText.trim()}
								data-testid="quickadd-save"
								class="btn-primary w-full py-3 text-sm mb-3"
							>{quickAddSaving ? $t('common.loading') : $t('quickadd.save')}</button>
						{:else}

						<!-- Mode heading — two entry kinds coexist here:
							 1) Episode (tap a chip) — recurring clinical event, counted.
							 2) Note marker (leave chips alone, fill the note) — singular
							    narrative marker that renders as a vertical line on the
							    trend chart. Users couldn't discover (2) without a label. -->
						<p class="text-xs font-medium uppercase tracking-wider mb-3" style="color: var(--text-muted)">{$t('quickadd.mode_heading')}</p>

						<!-- Episode type selection (tap to select, not instant-save) -->
						{#if bp.episodeTypes.length > 0}
							<div class="mb-5">
								<p class="text-xs font-medium uppercase tracking-wider mb-2" style="color: var(--text-muted)">1. {$t('quickadd.mode_entry')}</p>
								<div class="flex flex-wrap gap-2">
									{#each episodeTypesOrdered as ep, epIdx}
										<button
											on:click={() => selectEpisodeType(ep.id)}
											data-testid="quickadd-episode-{ep.id}"
											class="flex items-center gap-2 px-4 py-2 rounded-xl border transition-all min-h-[44px]"
											style="border-color: {quickAddSelectedEpisode === ep.id ? ep.color : 'var(--border)'}; background: {quickAddSelectedEpisode === ep.id ? ep.color + '10' : 'var(--surface-muted)'}"
										>
											<span class="w-3 h-3 rounded-full shrink-0" style="background: {ep.color}"></span>
											<span class="text-sm font-medium" style="color: {quickAddSelectedEpisode === ep.id ? ep.color : 'var(--text-primary)'}">{isCustomItem(ep.id) ? ep.label : $t(ep.label)}</span>
											{#if epIdx === 0 && lastEpisodeId === ep.id && bp.episodeTypes.length > 1}
												<span class="text-[10px] px-1.5 py-0.5 rounded-full" style="background: var(--surface-inset); color: var(--text-muted)">{$t('quickadd.last_used')}</span>
											{/if}
										</button>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Note (optional) — doubles as the text for a stand-alone
							 "note marker" event when no episode chip is selected. -->
						<div class="mb-5">
							<p class="text-xs font-medium uppercase tracking-wider mb-1" style="color: var(--text-muted)">2. {$t('quickadd.mode_event')} / {$t('quickadd.note')}</p>
							<p class="text-[11px] mb-2" style="color: var(--text-muted)">{$t('quickadd.mode_event_hint')}</p>
							<input
								type="text"
								bind:value={quickAddNote}
								placeholder={$t('quickadd.note')}
								data-testid="quickadd-note"
								class="input"
								on:input={() => { if (fabShowTooltip) dismissFabTooltip(); }}
								on:keydown={(e) => { if (e.key === 'Enter' && (quickAddSelectedEpisode || quickAddNote.trim())) quickAddSave(); }}
							/>
						</div>

						<!-- CIPH-713 / CIPH-783 — private toggle with semantic lock state -->
						<label class="flex items-center gap-2 text-xs mb-3" style="color: var(--text-secondary)"
							aria-label={quickAddPrivate ? $t('private.toggle_to_public') : $t('private.toggle_to_private')}>
							<input type="checkbox" bind:checked={quickAddPrivate} class="w-4 h-4" />
							{#if quickAddPrivate}
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="transition-all duration-150">
									<rect x="4" y="11" width="16" height="10" rx="2" />
									<path d="M8 11V7a4 4 0 1 1 8 0v4" />
								</svg>
							{:else}
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="transition-all duration-150">
									<rect x="4" y="11" width="16" height="10" rx="2" />
									<path d="M8 11V7a4 4 0 0 1 7 -1.5" />
								</svg>
							{/if}
							{quickAddPrivate ? $t('private.state_private') : $t('private.state_public')}
							<span style="color: var(--text-muted)">— {$t('private.tooltip')}</span>
						</label>

						<!-- Save button -->
						<button
							on:click={quickAddSave}
							disabled={quickAddSaving || (!quickAddSelectedEpisode && !quickAddNote.trim())}
							data-testid="quickadd-save"
							class="btn-primary w-full py-3 text-sm mb-3"
						>
							{quickAddSaving ? $t('common.loading') : $t('quickadd.save')}
						</button>
						{/if}

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

	<!-- CIPH-767e — Sync toast (brief, top-centered). Re-keyed so each new
		 save restarts the fade-out timer cleanly. -->
	{#key syncToastKey}
		<Toast message={syncToastShow ? $t('sync.synced') : ''} duration={1800} show={syncToastShow} />
	{/key}

	<!-- CIPH-767e — PWA install banner (Astrid / Samsung). Shown only when
		 beforeinstallprompt fires and the user hasn't dismissed in the last
		 7 days. `appinstalled` also suppresses it permanently for this profile. -->
	{#if pwaInstallVisible}
		<div
			class="fixed left-4 right-4 z-[70] rounded-xl p-3 flex items-center gap-3"
			style="bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px)); background: var(--surface-card); border: 1px solid var(--border); box-shadow: 0 6px 20px rgba(0,0,0,0.08); max-width: 480px; margin-left: auto; margin-right: auto;"
			role="dialog"
			aria-label={$t('pwa.install_title')}
			transition:fade={{ duration: 200 }}
		>
			<svg class="w-5 h-5 shrink-0" style="color: var(--brand)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">
				<rect x="5" y="2" width="14" height="20" rx="2"/>
				<line x1="12" y1="18" x2="12" y2="18"/>
			</svg>
			<p class="text-sm flex-1" style="color: var(--text-primary)">{$t('pwa.install_title')}</p>
			<button on:click={dismissPwaInstall} class="text-xs px-2 min-h-[36px]" style="color: var(--text-muted)">{$t('pwa.install_dismiss')}</button>
			<button on:click={acceptPwaInstall} class="btn-primary text-xs px-3 min-h-[36px]">{$t('pwa.install_cta')}</button>
		</div>
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
