<script lang="ts">
	import '../app.css';
	import { isAuthenticated, authReady, auth, needsUnlock } from '$lib/stores/auth';
	import { familyLinks, activeVault } from '$lib/stores/familyLinks';
	import { t, locale, plural } from '$lib/i18n';
	import { todayISO, toLocalISODate } from '$lib/date';
	import type { Locale } from '$lib/i18n';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { documents, documentsError, caregiverHiddenCount } from '$lib/stores/documents';
	import { pendingCount } from '$lib/outbox';
	import { get } from 'svelte/store';
	import { blueprint, hasBlueprint, resolvedBlueprint, isCustomItem, hasBedarfMeds, bedarfMedsForPicker, foldRescueMedications } from '$lib/blueprint';
	import { cohortOf } from '$lib/blueprint/cohort';
	import { clearLegacyVitalTargets, migrateLegacyVitalTargets } from '$lib/blueprint/vitalTargets';
	import { pathToRoute } from '$lib/cohortPalette';
	import { conditionAccent } from '$lib/conditionAccent';
	import { resolvedTheme } from '$lib/stores/theme';
	import { quickAddOpen } from '$lib/stores/quickAdd';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import VaultSwitcher from '$lib/components/VaultSwitcher.svelte';
	import AuthedFooter from '$lib/components/AuthedFooter.svelte';
	import PublicFooter from '$lib/components/PublicFooter.svelte';
	import Wordmark from '$lib/components/Wordmark.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import TimePicker from '$lib/components/TimePicker.svelte';
	import { shellFor } from '$lib/routeShells';
	import { sweepLegacyLocalStorage } from '$lib/legacy-cleanup';
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
	// In a linked vault the caregiver writes into someone else's account. The
	// server files those writes as shareable whatever they say, while the
	// caregiver's own view drops private plaintext — so a diary note or a
	// locked entry written there vanished for its author on reload, and every
	// other caregiver of that account could read it. Neither is offered there.
	$: quickAddLinked = $activeVault !== null;
	$: if (quickAddLinked && quickAddMode === 'diary') quickAddMode = 'log';
	$: if (quickAddLinked && quickAddPrivate) quickAddPrivate = false;

	// Quick-add sheet as a modal dialog: focus moves in when it opens, Tab
	// stays inside, Escape closes, and focus returns to what opened it (the
	// FAB). It had none of this — keyboard and screen-reader users tabbed
	// into the page behind it. BottomSheet.svelte has the same behaviour but
	// not the stacking: its backdrop shares z-50 with BottomNav, which comes
	// later in the DOM and would stay live above it.
	let quickAddSheetEl: HTMLDivElement | null = null;
	let quickAddReturnFocus: HTMLElement | null = null;
	let quickAddWasOpen = false;

	function quickAddFocusables(): HTMLElement[] {
		if (!quickAddSheetEl) return [];
		const sel =
			'a[href], button:not([disabled]), input:not([disabled]), ' +
			'select:not([disabled]), textarea:not([disabled]), ' +
			'[tabindex]:not([tabindex="-1"])';
		return Array.from(quickAddSheetEl.querySelectorAll<HTMLElement>(sel)).filter(
			(el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed',
		);
	}

	$: if (browser && showQuickAdd !== quickAddWasOpen) {
		quickAddWasOpen = showQuickAdd;
		if (showQuickAdd) {
			quickAddReturnFocus = document.activeElement as HTMLElement | null;
			tick().then(() => {
				const f = quickAddFocusables();
				(f[0] ?? quickAddSheetEl)?.focus();
			});
		} else if (quickAddReturnFocus) {
			try { quickAddReturnFocus.focus(); } catch { /* element may be gone */ }
			quickAddReturnFocus = null;
		}
	}

	function onQuickAddKeydown(e: KeyboardEvent) {
		if (!showQuickAdd || !quickAddSheetEl) return;
		if (e.key === 'Escape') {
			// A date/time picker open inside the sheet closes itself on the
			// same key; only its popover goes, not the whole sheet.
			if (quickAddSheetEl.querySelector('[aria-expanded="true"]')) return;
			e.preventDefault();
			quickAddReset();
			return;
		}
		if (e.key !== 'Tab') return;
		const f = quickAddFocusables();
		if (f.length === 0) {
			e.preventDefault();
			quickAddSheetEl.focus();
			return;
		}
		const first = f[0];
		const last = f[f.length - 1];
		const active = document.activeElement as HTMLElement | null;
		if (!active || !quickAddSheetEl.contains(active)) {
			e.preventDefault();
			first.focus();
		} else if (e.shiftKey && active === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && active === last) {
			e.preventDefault();
			first.focus();
		}
	}

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
		// CIPH-881 — if user previously used 'med' but has no as-needed meds
		// configured, the third mode chip won't render. Fall back.
		if (last === 'med' && !hasBedarfMeds(bp)) {
			last = 'log';
		}
		quickAddMode = last;
		if (last === 'diary' && !diaryDate) diaryDate = todayISO();
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
	let queuedToastShow = false;
	let queuedToastKey = 0;
	let revokedToastShow = false;
	let revokedToastKey = 0;
	let quotaToastShow = false;
	let quotaToastKey = 0;
	// Generic confirmation toast — any screen can fire a `ciphra:toast` window
	// event with `detail.message` to confirm an action (e.g. saving a custom
	// episode type in Settings, which previously closed with no feedback).
	let genericToastShow = false;
	let genericToastKey = 0;
	let genericToastMsg = '';
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
		// One-shot sweep of localStorage keys from a pre-zero-knowledge
		// build (masterKey / user_admin / username / ciphra_dark). Gated
		// by a sentinel so it runs once per browser. See
		// `lib/legacy-cleanup.ts`.
		sweepLegacyLocalStorage();
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

		// Offline-write outbox: a save made while unreachable is encrypted and
		// queued. Show a brief "saved offline" toast, and replay the queue when
		// the network returns, the tab regains focus, or on next launch.
		const onQueued = () => {
			queuedToastKey += 1;
			queuedToastShow = true;
			setTimeout(() => { queuedToastShow = false; }, 2400);
		};
		window.addEventListener('ciphra:queued', onQueued);

		const onUnauthorizedEvt = () => { onUnauthorized(); };
		window.addEventListener('ciphra:unauthorized', onUnauthorizedEvt);

		// Cross-tab logout sync. `storage` fires in OTHER tabs when localStorage
		// changes; if another tab cleared `ciphra_auth` (logout / account delete),
		// mirror it here so a shared device doesn't leave a second tab authed with
		// a live in-memory master key.
		const onStorage = (e: StorageEvent) => {
			if (e.key === 'ciphra_auth' && !e.newValue && get(auth).token) onUnauthorized();
		};
		window.addEventListener('storage', onStorage);

		// A linked patient revoked the caregiver's grant mid-view (403 on the
		// family vault). Reconcile links — the reactive below snaps activeVault
		// back to the caregiver's own vault — and surface a brief notice.
		const onFamilyRevoked = () => {
			familyLinks.load();
			revokedToastKey += 1;
			revokedToastShow = true;
			setTimeout(() => { revokedToastShow = false; }, 3000);
		};
		window.addEventListener('ciphra:family-revoked', onFamilyRevoked);

		// Generic confirmation toast (see the state decl above).
		const onToast = (e: Event) => {
			const msg = (e as CustomEvent<{ message?: string }>).detail?.message;
			if (!msg) return;
			genericToastMsg = msg;
			genericToastKey += 1;
			genericToastShow = true;
			setTimeout(() => { genericToastShow = false; }, 2200);
		};
		window.addEventListener('ciphra:toast', onToast as EventListener);

		// The outbox set a vault's queued writes aside because its owner is
		// at the document cap (documents.ts drainOutbox). They stay queued —
		// say why the pending pill is not going away.
		const onSyncBlocked = () => {
			quotaToastKey += 1;
			quotaToastShow = true;
			setTimeout(() => { quotaToastShow = false; }, 6000);
		};
		window.addEventListener('ciphra:sync-blocked', onSyncBlocked);

		const onOnline = () => { documents.flushOutbox(); };
		window.addEventListener('online', onOnline);
		const onVisible = () => {
			if (document.visibilityState === 'visible') documents.flushOutbox();
		};
		document.addEventListener('visibilitychange', onVisible);

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
			window.removeEventListener('ciphra:queued', onQueued);
			window.removeEventListener('ciphra:unauthorized', onUnauthorizedEvt);
			window.removeEventListener('storage', onStorage);
			window.removeEventListener('ciphra:family-revoked', onFamilyRevoked);
			window.removeEventListener('ciphra:toast', onToast as EventListener);
			window.removeEventListener('ciphra:sync-blocked', onSyncBlocked);
			window.removeEventListener('online', onOnline);
			document.removeEventListener('visibilitychange', onVisible);
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
	// FAB "Bedarfsmedikation" picker source — the user's configured as-needed
	// meds (single source of truth, edited in Settings). Replaces the old
	// preset-only `rescueMedications` list.
	$: bedarfMeds = bedarfMedsForPicker(bp);

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
		// Pre-fill the dose input with the configured med's dose so the user
		// can confirm by tapping save, or override before saving.
		if (quickAddSelectedMedId) {
			const m = bedarfMedsForPicker(bp).find((r) => r.id === id);
			if (m?.dose && !quickAddDose.trim()) quickAddDose = m.dose;
		} else {
			quickAddDose = '';
		}
	}

	// The last quick-add did not reach the vault (not even the offline
	// queue). The sheet stays open with everything still filled in.
	let quickAddError = false;

	// A save that did not happen must not flash "saved" and close the sheet
	// with the input gone. `reset` runs only on success.
	function quickAddFinish(ok: boolean, reset: () => void) {
		quickAddSaving = false;
		if (!ok) {
			quickAddError = true;
			return;
		}
		quickAddError = false;
		quickAddSaved = true;
		setTimeout(() => {
			quickAddSaved = false;
			reset();
			showQuickAdd = false;
			quickAddOpen.set(false);
		}, 1200);
	}

	async function quickAddSave() {
		// Enter in the note field reached here without the Save button's
		// disabled gate — a double press minted two entries for the day.
		if (quickAddSaving) return;
		const now = new Date();
		// LOCAL date, like the time next to it. The UTC date put everything
		// logged between midnight and ~02:00 Swiss time on yesterday — and
		// merged it into yesterday's entry.
		const todayStr = toLocalISODate(now);
		// In someone else's vault the server files every write as shareable,
		// and a private flag would only hide the entry from the caregiver who
		// wrote it (see quickAddLinked).
		const privateFlag = !quickAddLinked && quickAddPrivate ? true : undefined;

		// CIPH-881 — rescue medication writes a `type:'event' kind:'medication'`
		// doc, distinct from the freeform note-marker event used by the log mode.
		if (quickAddMode === 'med') {
			if (!quickAddSelectedMedId) return;
			quickAddSaving = true;
			quickAddError = false;
			const nowTime = now.toTimeString().slice(0, 5);
			const med = bedarfMedsForPicker(bp).find((m) => m.id === quickAddSelectedMedId);
			const dose = quickAddDose.trim() || med?.dose || undefined;
			const ok = await documents.save({
				type: 'event',
				kind: 'medication',
				date: todayStr,
				time: nowTime,
				medicationId: quickAddSelectedMedId,
				dose,
				private: privateFlag,
			});
			quickAddFinish(ok, () => {
				quickAddSelectedMedId = null;
				quickAddDose = '';
				quickAddMode = 'log';
			});
			return;
		}

		// CIPH-710 — diary mode writes a `type: 'diary'` doc that is hard-
		// excluded from every export surface (PDF/CSV/reports/share).
		if (quickAddMode === 'diary') {
			if (!diaryText.trim() || quickAddLinked) return;
			quickAddSaving = true;
			quickAddError = false;
			const ok = await documents.save({
				type: 'diary',
				date: diaryDate || todayStr,
				time: diaryTime || undefined,
				text: diaryText.trim(),
				private: true,
			});
			quickAddFinish(ok, () => {
				diaryDate = '';
				diaryTime = '';
				diaryText = '';
				quickAddMode = 'log';
			});
			return;
		}

		if (!quickAddSelectedEpisode && !quickAddNote.trim()) return;
		quickAddSaving = true;
		quickAddError = false;
		let ok = false;

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
				// Per-occurrence rows: keep existing instances, or synthesize them
				// from the legacy count for a pre-feature entry so none of its
				// occurrences are lost, then append this one with its own time.
				// Length stays in lockstep with prevCount + 1 so /log/[date]
				// round-trips it (see synthesizeEpisodeInstances in EntryComposer).
				const epId: string = quickAddSelectedEpisode;
				const prevInstances = Array.isArray(cur.episodeInstances?.[epId])
					? cur.episodeInstances[epId]
					: Array.from({ length: prevCount }, (_, i) =>
						i === 0
							? { time: cur.episodeTimes?.[epId] || '', note: cur.episodeNotes?.[epId] || '' }
							: {});
				const nextInstances = [...prevInstances, { time: nowTime, ...(note ? { note } : {}) }];
				ok = await documents.updateDoc(existing.id, {
					...cur,
					episodes: { ...(cur.episodes || {}), [quickAddSelectedEpisode]: prevCount + 1 },
					episodeInstances: { ...(cur.episodeInstances || {}), [quickAddSelectedEpisode]: nextInstances },
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
				ok = await documents.save({
					type: 'entry',
					date: todayStr,
					episodeType: quickAddSelectedEpisode,
					time: nowTime,
					episodes: { [quickAddSelectedEpisode]: 1 },
					episodeInstances: { [quickAddSelectedEpisode]: [{ time: nowTime, ...(note ? { note } : {}) }] },
					episodeTimes: { [quickAddSelectedEpisode]: nowTime },
					episodeNotes: note ? { [quickAddSelectedEpisode]: `${nowTime}: ${note}` } : undefined,
					private: privateFlag,
				});
			}
		} else if (quickAddNote.trim()) {
			ok = await documents.save({
				type: 'event',
				date: todayStr,
				notes: quickAddNote.trim(),
				private: privateFlag,
			});
		}

		quickAddFinish(ok, () => {
			quickAddSelectedEpisode = null;
			quickAddNote = '';
			quickAddPrivate = false;
		});
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
		quickAddError = false;
	}

	// Load documents and blueprint when authenticated
	$: if (browser && $isAuthenticated && !docsLoadStarted) {
		docsLoadStarted = true;
		docsLoading = true;
		loadInitialDocs();
	}

	// Initial post-login document load, with auto-retry. We only flip
	// `docsLoaded` once the SERVER fetch genuinely succeeds. The old code set
	// `docsLoaded = true` unconditionally in `.then()`, so a transient fetch
	// failure on a CACHELESS device (a brand-new browser/phone, where there's
	// no IndexedDB copy to fall back on) left `$documents` empty, made
	// `loadFromDocuments()` find no blueprint, and the setup-redirect guard
	// below bounced a fully-set-up returning user onto the wizard — until they
	// manually refreshed and the second fetch happened to work. We now do that
	// refresh automatically instead of stranding them.
	//
	// A reload inside a linked vault restores `activeVault` from
	// sessionStorage, but the patient's key lives in the family links. Loading
	// both in parallel used to let the documents load win the race, fall back
	// to the caregiver's OWN vault, and render it under the patient's banner.
	// With a vault active, the links load first; a vault they do not know is
	// dropped back to "own" before any document is read.
	async function loadInitialDocs(attempt = 1): Promise<void> {
		const seq = ++vaultLoadSeq;
		let docsOk: boolean;
		let linksOk: boolean;
		let vault = get(activeVault);
		if (vault !== null) {
			linksOk = await familyLinks.load();
			if (linksOk) {
				linksLoaded = true;
				snapToKnownVault();
			}
			vault = get(activeVault);
			docsOk = await documents.load();
		} else {
			[docsOk, linksOk] = await Promise.all([documents.load(), familyLinks.load()]);
			if (linksOk) linksLoaded = true;
		}
		// Superseded by a newer (re)load — a Retry, or a scheduled attempt.
		if (seq !== vaultLoadSeq) return;
		// The vault changed while that was on the wire (the switcher, a
		// revoke snap-back): those documents are for a vault nobody is
		// looking at. Start over for the one that is active now.
		if (get(activeVault) !== vault) {
			documents.clear();
			blueprint.clear();
			return loadInitialDocs(attempt);
		}
		blueprint.loadFromDocuments();
		// Require BOTH loads: a docs-success / links-failure combo would leave
		// `$familyLinks` empty and wrongly bounce a caregiver-only user to /setup.
		if (docsOk && linksOk) {
			docsLoading = false;
			docsLoaded = true;
			initialLoadOk = true;
			initialLoadSettled = true;
			// One-time single-source migration: fold any legacy preset
			// `rescueMedications` into the editable `medications` list so the
			// FAB + Settings read one source. No-op for blueprints already in
			// the new shape (incl. all new presets). Persist once; subsequent
			// loads find nothing to fold.
			let migrated = foldRescueMedications(get(blueprint), $t);
			// One-time: vital targets move from plaintext localStorage into the
			// encrypted blueprint. Own vault only — a device's legacy targets
			// belong to the logged-in user, never to a linked patient. The key
			// is removed only once the blueprint carrying them is saved.
			const legacyTargetsFor = get(activeVault) === null ? get(auth).username : null;
			const withTargets = migrateLegacyVitalTargets(migrated ?? get(blueprint), legacyTargetsFor);
			if (withTargets) migrated = withTargets;
			if (migrated) {
				blueprint.save(migrated).then((ok) => {
					if (ok && withTargets) clearLegacyVitalTargets(legacyTargetsFor);
				});
			}
			// Replay anything queued while offline in a previous session.
			documents.flushOutbox();
		} else if (attempt < 4) {
			// Back off a little between attempts (0.8s, 1.6s, 2.4s).
			setTimeout(() => loadInitialDocs(attempt + 1), attempt * 800);
		} else {
			// Give up after a few tries. Leave `docsLoaded` false so the
			// redirect never fires; the $documentsError banner + manual retry
			// button (below) stay visible for the user to act on.
			docsLoading = false;
			initialLoadSettled = true;
		}
	}

	// The first-load sequence has run to an end (loaded, or gave up). Vault
	// switches before that are handled by loadInitialDocs itself.
	let initialLoadSettled = false;
	// ...and it actually loaded. Until then a "reload" means the whole
	// sequence, links included.
	let initialLoadOk = false;
	// A family-links load has succeeded this session, so "no link for the
	// active vault" is a fact rather than "not loaded yet".
	let linksLoaded = false;
	// Bumped by every (re)load; one that finds it moved was superseded and
	// must not touch the blueprint or `docsLoaded`.
	let vaultLoadSeq = 0;

	/** Drop an active vault the loaded links do not (or no longer) grant. */
	function snapToKnownVault() {
		const v = get(activeVault);
		if (v !== null && !get(familyLinks).some((l) => l.sourceUserId === v && !l.revoked)) {
			activeVault.set(null);
		}
	}

	/**
	 * Load the active vault's documents + blueprint. Every call supersedes
	 * the previous one, so however fast the switcher is clicked — A→B→C, or
	 * a 403 snap-back mid-load — the vault that ends up loaded is the one
	 * that is active. `keepShown` (Retry) leaves the current view in place
	 * while the reload runs.
	 */
	async function reloadVault(opts: { keepShown?: boolean } = {}): Promise<void> {
		if (!initialLoadOk) {
			if (!initialLoadSettled) return; // the first load is still retrying
			initialLoadSettled = false;
			docsLoading = true;
			return loadInitialDocs();
		}
		const seq = ++vaultLoadSeq;
		docsLoaded = false;
		if (!opts.keepShown) {
			documents.clear();
			blueprint.clear();
		}
		const ok = await documents.load();
		if (seq !== vaultLoadSeq) return;
		blueprint.loadFromDocuments();
		// Only commit docsLoaded on a genuine fetch success — a failed
		// switch (offline / transient / revoked 403) must not flip to an
		// authoritative empty state for the linked vault. The
		// $documentsError banner + retry button stay visible instead.
		if (ok) docsLoaded = true;
	}

	function resetLoadState() {
		docsLoadStarted = false;
		docsLoaded = false;
		initialLoadSettled = false;
		initialLoadOk = false;
		linksLoaded = false;
		vaultLoadSeq++;
		// auth.logout() removed the stored copy; drop the in-memory one too so
		// the next account on this tab does not see it floated first.
		lastEpisodeId = null;
	}

	// Redirect to setup when authenticated but no blueprint, only for
	// routes that require a blueprint per the registry. Caregivers who
	// have already linked to someone else's vault don't need to set up
	// their own condition — they can skip the wizard and still use the
	// app. Only redirect AFTER documents have fully loaded and blueprint
	// has been checked. The per-route allow-list (login/setup/settings/
	// admin/migrate) that used to live here is now encoded in the
	// registry via `requiresBlueprint=false` on each of those shells.
	// `ciphra_setup_skipped` is set by /setup when the user picks "help
	// someone else" or "maybe later" on the wizard's step 0. Without it,
	// a fresh user who opts to caregiver-only would land back on `/` and
	// get bounced right into /setup again. Cleared on successful blueprint
	// save (in /setup's finishAndSave) so the redirect resumes its job
	// once the user is in a state that genuinely needs the wizard again.
	// Reactive on currentPath so the value refreshes on every navigation
	// (incl. post-login goto('/')). Earlier version had no reactive
	// dependency so the IIFE ran exactly once at mount and a flag set
	// later in the same session was never picked up — and a stale flag
	// from a previous session locked out the auto-redirect-to-/setup.
	// auth.login()/logout() also clear the flag now, so this read mostly
	// returns false; the explicit dependency is the belt for the braces.
	$: setupSkipped = browser && currentPath
		? (() => { try { return localStorage.getItem('ciphra_setup_skipped') === '1'; } catch { return false; } })()
		: false;
	$: if (browser && $authReady && $isAuthenticated && docsLoaded && !$hasBlueprint
		&& $familyLinks.length === 0
		&& !setupSkipped
		&& shellFor(currentPath).requiresBlueprint) {
		goto('/setup');
	}

	async function handleLogout() {
		// PI v16 — wait for the on-disk wipe before goto so the SW + IndexedDB
		// purge has finished before any subsequent navigation could repopulate
		// caches. UI already flipped (logout sets empty state synchronously).
		await auth.logout();
		resetLoadState();
		blueprint.clear();
		documents.clear();
		familyLinks.clear();
		activeVault.set(null);
		goto('/login');
	}

	// Session-expiry catch. `api.ts` fires `ciphra:unauthorized` when an
	// authenticated request gets a 401 (token expired/revoked). Without this the
	// app still LOOKS logged in — the doc fetch 401s and the dashboard renders
	// the misleading "Du hast noch keine eigene Erfassung eingerichtet" caregiver
	// view. Wipe local auth/state and bounce straight to login with a notice.
	let handlingUnauthorized = false;
	async function onUnauthorized() {
		if (handlingUnauthorized) return; // dedupe concurrent 401s
		handlingUnauthorized = true;
		await auth.logout();
		resetLoadState();
		blueprint.clear();
		documents.clear();
		familyLinks.clear();
		activeVault.set(null);
		await goto('/login?session=expired');
		handlingUnauthorized = false;
	}

	// When the caregiver switches vault, clear cached docs + blueprint and
	// reload from the new vault. `lastVault` lets us detect real changes and
	// skip the initial render that fires while the store hydrates.
	//
	// This used to act only when `docsLoaded` was true, while always
	// recording `lastVault` — so a switch that arrived during a load was
	// dropped: A→B→C showed B's data under C's banner, and a 403 snap-back
	// mid-load left the revoked vault's view in place. Every change now
	// reloads; reloadVault makes the newest one win.
	let lastVault: number | null | undefined = undefined;
	$: {
		const v = $activeVault;
		if (browser && lastVault !== undefined && v !== lastVault && initialLoadSettled) {
			void reloadVault();
		}
		lastVault = v;
	}

	// If the currently-selected vault has been revoked server-side (patient
	// clicked their panic button), snap the switcher back to the caregiver's
	// own view so they don't sit staring at a broken /family/documents 403.
	// Same once the links are known to hold no link for it at all (removed
	// in another tab, or a stale sessionStorage value): without a link there
	// is no key, and nothing in that vault can be read or written.
	$: if (browser && $activeVault !== null && (
		$familyLinks.some(l => l.sourceUserId === $activeVault && l.revoked)
		|| (linksLoaded && !$familyLinks.some(l => l.sourceUserId === $activeVault))
	)) {
		activeVault.set(null);
	}

	$: liveLinks = $familyLinks.filter(l => !l.revoked);

	// CIPH-pi24-1B — `setLocale` removed from the layout. The language
	// picker now lives only in PublicFooter, which has its own local
	// copy of the handler.

	$: currentPath = $page.url.pathname as string;
	// CIPH-833 — route-shell registry. One lookup per route drives
	// both the chrome selection and the auth/blueprint guards below,
	// replacing the old multi-branch `currentPath !== '/X' && …`
	// chains that each new route had to be patched into.
	$: currentShell = shellFor(currentPath);
	// CIPH-890 — `data-route` and `data-cohort` on <main> drive the
	// CIPH-892 rhythm tokens and the cohort accent overrides in app.css.
	$: currentRoute = pathToRoute(currentPath);
	$: currentCohort = cohortOf($resolvedBlueprint);
	// CIPH-921c — repoint the primary accent (--accent/-hover/-rgb) from the
	// CONDITION color so the whole authed surface (buttons, rings, links, FAB)
	// matches /conditions + the dashboard badge, not the per-cohort accent.
	// Only when a blueprint is resolved; public routes keep the brand accent.
	// The cohort still drives --accent-info/-calm/-neutral (semantic secondaries)
	// and the rhythm tokens via data-cohort.
	$: accentOverride = $resolvedBlueprint
		? (() => {
				const a = conditionAccent($resolvedBlueprint);
				return `--accent:${a.hex};--accent-hover:${a.hover};--accent-rgb:${a.rgb};`;
			})()
		: '';

	// Dark mode (design review 2026-06-11) — mirror the resolved theme
	// onto <html> so the app.css [data-theme='dark'] block applies.
	// app.html sets the same attribute pre-hydration to avoid a white
	// flash; this keeps it live for in-session changes. The theme-color
	// metas are media-scoped for pre-hydration; once JS runs the
	// resolved theme is the truth (manual overrides included), so both
	// get the resolved surface tone.
	$: if (browser) {
		document.documentElement.dataset.theme = $resolvedTheme;
		const chrome = $resolvedTheme === 'dark' ? '#181310' : '#faf8f6';
		document
			.querySelectorAll('meta[name="theme-color"]')
			.forEach((m) => m.setAttribute('content', chrome));
	}

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
	// Also covers the landing `/`: a token-present / key-absent user renders the
	// authed dashboard shell there (isAuthenticated is true), but every vault
	// read no-ops silently → a broken empty view. Redirect to re-unlock.
	// /migrate and /join keep their own inbound signup/claim flows (excluded).
	$: if (browser && $needsUnlock && currentPath !== '/login'
		&& (currentShell.requiresAuth || currentPath === '/')) {
		// auth.logout() is async (PI v16); fire-and-forget here is fine
		// because the master key is already gone — no plaintext to leak.
		// The wipe still runs in background.
		void auth.logout();
		goto('/login');
	}

</script>

<svelte:window on:keydown={onQuickAddKeydown} />

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
	<!-- Sticky-footer shell. min-h-screen + flex-col + a flex-1 slot
	     wrapper push the footer to the bottom of the viewport on short
	     pages (e.g. /docs index). Without it the footer floated mid-
	     viewport on any page that didn't fill the screen. -->
	<div class="min-h-screen flex flex-col">
	<!-- Single unified public nav — covers landing, /login, /migrate,
		 /conditions, /privacy, /terms, /join/*. One identity for every
		 unauthenticated visitor; anchor links resolve back to the
		 landing page so they keep working from any sub-page. The
		 separate "Anmelden" text link was dropped — it was redundant
		 with the primary CTA and visually competed with it. Returning
		 users find the Login tab inside /login itself. -->
	<nav class="sticky top-0 z-40 backdrop-blur-sm" style="border-bottom: 1px solid var(--border); background: rgba(var(--surface-rgb), 0.85);">
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
	<div class="flex-1 flex flex-col">
		<slot />
	</div>
	<!-- CIPH-916 — public footer for landing + public-doc shells
		 (/conditions, /privacy, /terms, /protocol). Auth-flow + family-
		 claim shells skip it intentionally — those are focus surfaces. -->
	{#if currentShell.shell === 'landing' || currentShell.shell === 'public-doc'}
		<PublicFooter />
	{/if}
	</div>
{:else if $isAuthenticated && currentPath !== '/login'}
	<!-- CIPH-904 — Skip-to-content link for keyboard / AT users. Public
		 landing already had this; the authed shell didn't, leaving 8-9
		 nav stops in the header before reaching content on every page. -->
	<a
		href="#main-content"
		class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:outline-none"
		style="background: var(--brand); color: white;"
	>{$t('landing.skip_to_content')}</a>
	<!-- Sticky-footer shell (matches the unauth branch). Pushes the
	     authed footer to the bottom of short pages instead of letting
	     it float in mid-viewport. CIPH-921c — the condition-accent override
	     lives here (not on <main>) so the header nav + active state inherit
	     it too; the <main> below keeps data-cohort for the rhythm tokens. -->
	<div class="min-h-screen flex flex-col" style={accentOverride}>
	<!-- Top Bar -->
	<header class="sticky top-0 z-40 bg-white/95 backdrop-blur border-b">
		<div class="max-w-6xl mx-auto px-4 flex items-center justify-between h-14 gap-2">
			<a href="/" class="flex items-center shrink-0" aria-label="ciphra">
				<Wordmark size={28} />
			</a>

			<!-- Desktop primary nav (CIPH-201 follow-up) — bottom-nav handles
			     mobile, but on >=md the only navigation in the header was logo
			     + settings + logout, leaving users stranded. Mirror the 4 main
			     routes here. Active route gets brand color + brand bottom border.
			     2026-06-07 — gated on $hasBlueprint so the setup-wizard user
			     (who explicitly does not yet have a blueprint) doesn't see 4
			     nav links that would each trigger the redirect-back-to-/setup
			     loop. Primary-nav reappears the instant the wizard finishes. -->
			{#if $hasBlueprint}
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
						style="color: {active ? 'var(--accent)' : 'var(--text-secondary)'};
						       {active ? 'background: var(--surface-muted);' : ''}"
						aria-current={active ? 'page' : undefined}
					>{item.label}</a>
				{/each}
			</nav>
			{/if}

			{#if liveLinks.length > 0}
				<!-- Vault switcher: visible label + eye icon so it reads as
					 "you're viewing X" rather than a bare dropdown. The native
					 <select> it replaced could not style its own options panel
					 — see VaultSwitcher.svelte. -->
				<VaultSwitcher links={liveLinks} />
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
		<!-- The number comes from the STORE, which takes it from the server's
			 `withheld` count (2026-09-19). Counting diary/locked documents in
			 `$documents` was counting what a caregiver can never receive: the
			 server stopped sending them with per-invite scopes, so this was
			 always 0 and the line below never rendered for the one audience it
			 was written for. -->
		{@const hiddenCount = $caregiverHiddenCount}
		{@const visibleCount = $documents.length}
		<div class="border-b px-4 py-2" style="background: rgba(var(--ochre-rgb), 0.08); border-color: rgba(var(--ochre-rgb), 0.2)">
			<div class="max-w-6xl mx-auto flex items-center justify-between gap-3">
				<p class="text-sm" style="color: var(--ochre)">
					<strong>{$t('family.banner_viewing', { user: activeLink?.sourceUsername ?? '' })}</strong>
					<span style="color: var(--text-secondary)">— {$t('family.banner_desc')}</span>
				</p>
				<button
					type="button"
					on:click={() => activeVault.set(null)}
					class="text-xs font-medium px-3 py-1 rounded-lg shrink-0 min-h-[32px]"
					style="background: rgba(var(--ochre-rgb), 0.15); color: var(--ochre)"
				>
					{$t('family.banner_switch_back')}
				</button>
			</div>
			{#if hiddenCount > 0}
				<!-- CIPH-726 — caregivers need to know they are not seeing the
					 private/diary entries. Muted, lock-iconed, non-alarmist. -->
				<div class="max-w-6xl mx-auto mt-1 flex items-center gap-1.5 text-xs" style="color: var(--text-muted)">
					<svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" stroke-width="2"/><path d="M8 11V8a4 4 0 018 0v3" stroke-width="2" stroke-linecap="round"/></svg>
					<!-- Two counts, two plural rules: "1 persönliche Einträge" is
						 what one sentence with raw interpolation produced the
						 first time this line ever rendered. -->
					<span>
						{plural($t, $locale as Locale, 'family.private_context_shared', visibleCount)}
						{plural($t, $locale as Locale, 'family.private_context_private', hiddenCount)}
					</span>
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
			<p class="text-sm" style="color: var(--danger)">
				{#if $documentsError === 'load'}{$t('sync.error_load')}{:else if $documentsError === 'update'}{$t('sync.error_update')}{:else}{$t('sync.error_save')}{/if}
			</p>
			<!-- Reloads documents AND the blueprint (and the links, if the first
				 load never got through) — a documents-only reload left a vault
				 switch that had failed without its blueprint. -->
			<button on:click={() => { documentsError.set(null); void reloadVault({ keepShown: true }); }} class="ml-auto text-xs font-medium min-h-[44px] px-2" style="color: var(--danger)">{$t('common.retry')}</button>
		</div>
	{/if}

	<main
		id="main-content"
		data-route={currentRoute}
		data-cohort={currentCohort}
		class="flex-1"
		style="padding-bottom: 2rem;{accentOverride}"
	>
		<slot />
	</main>

	<!-- CIPH-903 — minimal authed footer. Watermark + Privacy/Terms/Security
		 links + encryption.badge trust signal that used to live in Companion's
		 bottom block. Self-hides on /log/[date], /setup, /login, /migrate so
		 focus surfaces stay clean. The footer's own margin-bottom clears the
		 BottomNav (mobile) and safe-area (desktop). -->
	<AuthedFooter />
	</div>

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
			<!-- primitive-exempt: Modal — the quick-add bottom sheet carries its
				 own dialog semantics, focus trap and Escape (onQuickAddKeydown);
				 neither Modal (centred) nor BottomSheet (z-50, under BottomNav)
				 fits its stacking. -->
			<button
				class="fixed inset-0 z-[55] bg-black/40 backdrop-blur-sm"
				on:click={quickAddReset}
				transition:fade={{ duration: 200 }}
				aria-label={$t('common.close')}
				tabindex="-1"
			></button>

			<div
				bind:this={quickAddSheetEl}
				class="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-2xl shadow-2xl max-h-[80vh] overflow-y-auto focus:outline-none"
				style="border-top: 1px solid var(--border)"
				role="dialog"
				aria-modal="true"
				aria-label={$t('quickadd.title')}
				tabindex="-1"
				data-testid="quickadd-sheet"
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

						{#if quickAddError}
							<!-- Not saved — not even queued offline. Everything entered is
								 still below; Save tries again. -->
							<p class="text-sm mb-4" style="color: var(--danger)" role="alert" data-testid="quickadd-error">{$t('quickadd.save_failed')}</p>
						{/if}

						<!-- CIPH-710 — top-level mode switch: log entry vs private diary.
							 CIPH-881 — third "med" chip surfaced only when the active
							 blueprint declares rescueMedications. -->
						<div class="flex gap-2 mb-4 p-1 rounded-lg" style="background: var(--surface-muted)">
							<button
								type="button"
								on:click={() => { quickAddMode = 'log'; }}
								data-testid="quickadd-mode-log"
								class="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors min-h-[40px]"
								style="background: {quickAddMode === 'log' ? 'var(--surface-card)' : 'transparent'}; color: {quickAddMode === 'log' ? 'var(--text-primary)' : 'var(--text-muted)'}"
							>{$t('quickadd.mode_entry')} / {$t('quickadd.mode_event')}</button>
							{#if !quickAddLinked}
							<button
								type="button"
								on:click={() => { quickAddMode = 'diary'; if (!diaryDate) diaryDate = todayISO(); }}
								data-testid="quickadd-mode-diary"
								class="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors min-h-[40px] inline-flex items-center justify-center gap-1.5"
								style="background: {quickAddMode === 'diary' ? 'var(--surface-card)' : 'transparent'}; color: {quickAddMode === 'diary' ? 'var(--text-primary)' : 'var(--text-muted)'}"
							>
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<rect x="4" y="11" width="16" height="10" rx="2" />
									<path d="M8 11V7a4 4 0 1 1 8 0v4" />
								</svg>
								{$t('quickadd.mode_diary')}
							</button>
							{/if}
							{#if bedarfMeds.length > 0}
								<button
									type="button"
									on:click={() => { quickAddMode = 'med'; }}
									data-testid="quickadd-mode-med"
									class="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors min-h-[40px] inline-flex items-center justify-center gap-1.5"
									style="background: {quickAddMode === 'med' ? 'var(--surface-card)' : 'transparent'}; color: {quickAddMode === 'med' ? 'var(--text-primary)' : 'var(--text-muted)'}"
								>
									<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
										<path d="M19 14l-7 7-7-7a7 7 0 1 1 14 0z"/>
										<circle cx="12" cy="11" r="3"/>
									</svg>
									{$t('quickadd.mode_med')}
								</button>
							{/if}
						</div>

						{#if quickAddMode === 'med' && bedarfMeds.length > 0}
							<!-- Bedarfsmedikation picker, sourced from the user's configured
								 as-needed meds. Tap a chip to select; dose pre-fills from the
								 configured dose, override if needed. -->
							<p class="text-xs font-medium uppercase tracking-wider mb-2" style="color: var(--text-muted)">{$t('quickadd.pick_med')}</p>
							<div class="flex flex-wrap gap-2 mb-4">
								{#each bedarfMeds as med}
									<button
										type="button"
										on:click={() => selectRescueMed(med.id)}
										data-testid="quickadd-med-{med.id}"
										class="flex items-center gap-2 px-4 py-2 rounded-xl border transition-all min-h-[44px]"
										style="border-color: {quickAddSelectedMedId === med.id ? 'var(--accent)' : 'var(--border)'}; background: {quickAddSelectedMedId === med.id ? 'rgba(var(--accent-rgb), 0.08)' : 'var(--surface-muted)'}"
									>
										<span class="text-sm font-medium" style="color: {quickAddSelectedMedId === med.id ? 'var(--accent)' : 'var(--text-primary)'}">{med.name}</span>
										{#if med.dose}
											<span class="text-[11px]" style="color: var(--text-muted)">{med.dose}</span>
										{/if}
									</button>
								{/each}
							</div>
							{#if quickAddSelectedMedId}
								{@const selectedMed = bedarfMeds.find(m => m.id === quickAddSelectedMedId)}
								<div class="mb-3">
									<label class="text-xs" style="color: var(--text-secondary)" for="qa-dose">
										{$t('quickadd.dose')}
										<span style="color: var(--text-muted)">— {$t('quickadd.dose_optional')}</span>
									</label>
									<input
										id="qa-dose"
										type="text"
										inputmode="decimal"
										bind:value={quickAddDose}
										placeholder={selectedMed?.dose ?? ''}
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
							<p class="text-[11px] mb-2" style="color: var(--text-muted)">{quickAddPrivate ? $t('quickadd.mode_event_hint_private') : $t('quickadd.mode_event_hint')}</p>
							<input
								type="text"
								bind:value={quickAddNote}
								placeholder={$t('quickadd.note')}
								data-testid="quickadd-note"
								class="input"
								on:input={() => { if (fabShowTooltip) dismissFabTooltip(); }}
								on:keydown={(e) => { if (e.key === 'Enter' && !quickAddSaving && (quickAddSelectedEpisode || quickAddNote.trim())) quickAddSave(); }}
							/>
						</div>

						<!-- CIPH-713 / CIPH-783 — private toggle with semantic lock state.
							 Not in someone else's vault: see quickAddLinked. -->
						{#if quickAddLinked}
							<p class="text-[11px] mb-3" style="color: var(--text-muted)" data-testid="quickadd-linked-hint">
								{$t('quickadd.linked_hint', { user: $familyLinks.find((l) => l.sourceUserId === $activeVault)?.sourceUsername ?? '' })}
							</p>
						{:else}
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
							<!-- The hint must follow the STATE. `private.tooltip` says
							     "never exported or shared"; rendering it unconditionally
							     meant the default (exportable) row read "Standard —
							     Privater Eintrag — wird nie exportiert oder geteilt",
							     directly under the note field, while the note was in
							     fact printed verbatim on the doctor PDF. -->
							<span style="color: var(--text-muted)">— {quickAddPrivate ? $t('private.tooltip') : $t('private.state_public_hint')}</span>
						</label>
						{/if}

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

	<!-- Offline outbox: "saved offline" confirmation + a persistent pill while
		 writes wait to sync. -->
	{#key queuedToastKey}
		<Toast message={queuedToastShow ? $t('sync.queued') : ''} duration={2400} show={queuedToastShow} />
	{/key}

	<!-- A linked vault was revoked while viewing it — snapped back to own vault. -->
	{#key revokedToastKey}
		<Toast message={revokedToastShow ? $t('family.access_removed') : ''} duration={3000} show={revokedToastShow} />
	{/key}

	<!-- Offline writes held back because the vault is at its document cap. -->
	{#key quotaToastKey}
		<Toast message={quotaToastShow ? $t('sync.quota_exceeded') : ''} duration={6000} show={quotaToastShow} />
	{/key}

	<!-- Generic confirmation toast (ciphra:toast event, e.g. custom-item save). -->
	{#key genericToastKey}
		<Toast message={genericToastShow ? genericToastMsg : ''} duration={2200} show={genericToastShow} />
	{/key}

	{#if $isAuthenticated && $pendingCount > 0}
		<div
			class="fixed z-[60] flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
			style="top: calc(0.5rem + env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%); background: var(--surface-card); border: 1px solid var(--border); box-shadow: 0 2px 8px rgba(0,0,0,0.08); color: var(--text-muted);"
			role="status"
			aria-live="polite"
			transition:fade={{ duration: 200 }}
		>
			<svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">
				<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/>
			</svg>
			{$t('sync.pending', { count: $pendingCount })}
		</div>
	{/if}

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
