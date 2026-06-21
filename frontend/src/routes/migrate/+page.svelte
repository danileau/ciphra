<!--
	CIPH-712 — Epilepc migration landing.

	Activates ONLY when the URL fragment contains `#migrate=<token>&source=<host>`.
	Without the fragment we render a minimal not-found message and offer the
	user the way back to `/`. Ciphra has no other discovery surface for epilepc:
	this route is not linked from anywhere in normal navigation.

	Token never leaves the client — fragments are not sent to the ciphra server.
	Bundle is fetched directly from the source (epilepc) and encrypted under
	the new user's master_key before any POST to ciphra.

	CIPH-780 — visual parity with /login. Same wrapper, same wordmark,
	same card shell. Every phase renders inside the same rounded-2xl card
	so the user feels zero discontinuity from the login tab they likely
	arrived from.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { auth, isAuthenticated } from '$lib/stores/auth';
	import { originStatus, hostOf, type OriginStatus } from '$lib/origin';
	import Wordmark from '$lib/components/Wordmark.svelte';
	import { get } from 'svelte/store';
	import { documents } from '$lib/stores/documents';
	import { migrationClientKey } from '$lib/migrationKey';
	import SignupFlow from '$lib/components/SignupFlow.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { blueprint } from '$lib/blueprint/store';
	import {
		validateBundle,
		mapBundle,
		mergeMedications,
		defaultEpilepsyBlueprint,
		type EpilepcBundle,
		type MappedDocs,
	} from '$lib/migration/epilepcMapping';

	type Phase =
		| 'init'
		| 'no-fragment'
		| 'signup'
		| 'confirm-origin'
		| 'fetching'
		| 'fetch-error'
		| 'preview'
		| 'importing'
		| 'done'
		| 'tour';

	const TOUR_FLAG_KEY = 'ciphra_migrate_tour_seen';

	let phase: Phase = 'init';
	let token = '';
	let source = '';
	let decommissionDate = '';
	let errorKey = '';
	let errorDetail = '';
	let originConfirmed = false;
	let currentOrigin = '';
	// Design review 2026-06-11 — the app verifies its own origin instead
	// of leaving the whole phishing check to the user. 'mismatch' hard-
	// stops the transfer; 'dev' (loopback) skips the pill for e2e/local.
	let ciphraStatus: OriginStatus = 'mismatch';

	let busy = false;
	let busyLabel = '';

	let bundle: EpilepcBundle | null = null;
	let mapped: MappedDocs | null = null;

	let progressDone = 0;
	let progressTotal = 0;

	// CIPH-760 — preview date range across all imported collections.
	let dateRangeStart = '';
	let dateRangeEnd = '';

	function computeDateRange(b: EpilepcBundle): { start: string; end: string } {
		const all: string[] = [];
		for (const s of b.seizures) if (s.date) all.push(s.date);
		for (const e of b.events) if (e.date) all.push(e.date);
		for (const d of b.diary) if (d.date) all.push(d.date);
		if (all.length === 0) return { start: '', end: '' };
		all.sort();
		return { start: all[0], end: all[all.length - 1] };
	}

	const CHECKPOINT_KEY_PREFIX = 'ciphra_migrate_done:';

	function checkpointKey() {
		return `${CHECKPOINT_KEY_PREFIX}${source}:${token}`;
	}

	function loadCheckpoint(): Set<string> {
		if (!browser) return new Set();
		try {
			const raw = localStorage.getItem(checkpointKey());
			if (!raw) return new Set();
			return new Set(JSON.parse(raw) as string[]);
		} catch {
			return new Set();
		}
	}

	function saveCheckpoint(done: Set<string>) {
		if (!browser) return;
		try {
			localStorage.setItem(checkpointKey(), JSON.stringify([...done]));
		} catch {
			/* ignore quota */
		}
	}

	function clearCheckpoint() {
		if (!browser) return;
		try {
			localStorage.removeItem(checkpointKey());
		} catch {
			/* ignore */
		}
	}

	onMount(() => {
		if (!browser) return;
		currentOrigin = window.location.origin;
		ciphraStatus = originStatus(currentOrigin);
		const hash = window.location.hash.replace(/^#/, '');
		const params = new URLSearchParams(hash);
		const tok = params.get('migrate');
		const src = params.get('source');
		if (!tok || !src) {
			phase = 'no-fragment';
			return;
		}
		// Token: no whitespace. Source: normalized to a bare host —
		// hostname-only and full-URL inputs both resolve (P2 debt), deep
		// links / credentials / exotic schemes are rejected.
		const srcHost = /\s/.test(tok) ? null : hostOf(src);
		if (!srcHost) {
			phase = 'no-fragment';
			return;
		}
		token = tok;
		source = srcHost;
		// Already authenticated (with master_key in session) → skip signup,
		// go straight to bundle fetch. Covers the case where the user reloaded
		// after a prior signup attempt.
		if (get(isAuthenticated) && get(auth).masterKey) {
			phase = 'confirm-origin';
			return;
		}
		phase = 'signup';
	});

	function setError(key: string, detail = '') {
		errorKey = key;
		errorDetail = detail;
	}

	function handleSignupComplete() {
		// SignupFlow has already created the vault and populated the auth store.
		// Recovery acknowledgment gate has passed — now require origin confirmation
		// before any bytes are pulled from the epilepc source (CIPH-721).
		phase = 'confirm-origin';
	}

	function confirmOriginAndFetch() {
		if (!originConfirmed) return;
		fetchBundle();
	}

	async function fetchBundle() {
		setError('');
		busy = true;
		phase = 'fetching';
		busyLabel = $t('migrate.phase_fetching');
		try {
			// Token + source are URL-fragment values, not server-known.
			// Fetch goes directly to the epilepc host.
			const url = `https://${source}/api/ciphra-export/${encodeURIComponent(token)}`;
			let res: Response;
			try {
				res = await fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit' });
			} catch (netErr) {
				// dev mock runs on http://, retry once with http for localhost-style sources
				if (source.startsWith('localhost') || source.startsWith('127.0.0.1')) {
					res = await fetch(`http://${source}/api/ciphra-export/${encodeURIComponent(token)}`, {
						method: 'GET',
						mode: 'cors',
						credentials: 'omit',
					});
				} else {
					throw netErr;
				}
			}
			if (res.status === 401) {
				setError('migrate.error_token_expired');
				phase = 'fetch-error';
				return;
			}
			if (res.status === 410) {
				setError('migrate.error_token_used');
				phase = 'fetch-error';
				return;
			}
			if (!res.ok) {
				setError('migrate.error_fetch', `HTTP ${res.status}`);
				phase = 'fetch-error';
				return;
			}
			let raw: unknown;
			try {
				raw = await res.json();
			} catch {
				setError('migrate.error_bundle_format');
				phase = 'fetch-error';
				return;
			}
			let valid: EpilepcBundle;
			try {
				valid = validateBundle(raw);
			} catch (e) {
				setError('migrate.error_bundle_format', e instanceof Error ? e.message : String(e));
				phase = 'fetch-error';
				return;
			}
			bundle = valid;
			decommissionDate = valid.epilepc_decommission_at.slice(0, 10);
			mapped = mapBundle(valid);
			progressTotal = mapped.entries.length + mapped.events.length + mapped.diaries.length;
			progressDone = 0;
			const range = computeDateRange(valid);
			dateRangeStart = range.start;
			dateRangeEnd = range.end;
			phase = 'preview';
		} catch (e) {
			setError('migrate.error_fetch', e instanceof Error ? e.message : String(e));
			phase = 'fetch-error';
		} finally {
			busy = false;
			busyLabel = '';
		}
	}

	async function runImport() {
		if (!mapped) return;
		phase = 'importing';
		busy = true;
		const done = loadCheckpoint();
		try {
			// Load existing docs first so blueprint.loadFromDocuments has data
			await documents.load();
			// Epilepc is epilepsy-only → always ensure an epilepsy blueprint exists.
			// Append migrated medications to it (if any).
			blueprint.loadFromDocuments();
			const current = (await import('svelte/store')).get(blueprint) || defaultEpilepsyBlueprint();
			const next = {
				...current,
				medications: mergeMedications(current.medications || [], mapped.medications),
			};
			await blueprint.save(next);
			// Track-3 3.4 — bulk import. One request per BATCH_SIZE docs instead
			// of one per doc (233 docs → 3 requests). Idempotent server-side via
			// an opaque client_key = "v1:" + base64url(sha256(username:source_id)),
			// so a resumed/retried batch returns `skipped`, never a duplicate —
			// this is the durable guarantee; the localStorage `done` checkpoint is
			// now just a fast-path skip. created+skipped both count as success.
			const uname = get(auth).username || '';
			const allDocs = [...mapped.entries, ...mapped.events, ...mapped.diaries];
			// Already-checkpointed docs count toward progress without re-sending.
			const pending = allDocs.filter((d) => {
				const sid = d.source_id as string;
				if (done.has(sid)) { progressDone += 1; return false; }
				return true;
			});

			const BATCH_SIZE = 100;
			for (let i = 0; i < pending.length; i += BATCH_SIZE) {
				const chunk = pending.slice(i, i + BATCH_SIZE);
				const items = await Promise.all(
					chunk.map(async (d) => ({ data: d, clientKey: await migrationClientKey(uname, d.source_id as string) })),
				);
				const { ok, results } = await documents.saveBatch(items);
				// Fall back to per-doc save if the batch endpoint is unavailable
				// (older server / network): same end state, just slower.
				if (!ok) {
					for (const d of chunk) {
						const sid = d.source_id as string;
						const saved = await documents.save(d);
						if (!saved) throw new Error(`save_failed:${sid}`);
						done.add(sid);
						saveCheckpoint(done);
						progressDone += 1;
					}
					continue;
				}
				for (let j = 0; j < chunk.length; j++) {
					const sid = chunk[j].source_id as string;
					const status = results[j]?.status;
					if (status === 'created' || status === 'skipped') {
						done.add(sid);
						progressDone += 1;
					} else {
						throw new Error(`save_failed:${sid}:${results[j]?.error || status || 'unknown'}`);
					}
				}
				saveCheckpoint(done);
			}

			clearCheckpoint();
			// Slice 3b — signal the source (epilepc) that the import succeeded.
			// epilepc stamps `users.migrated_at` and locks the user into read+
			// export-only mode on its side, preventing data divergence.
			// Fire-and-forget: the migration itself has succeeded on ciphra's
			// side; the lockdown is a downstream nice-to-have. We log and
			// move on if the signal fails.
			void signalMigrationComplete();
			// CIPH-761 — show the one-shot Tagebuch-private tour after a
			// successful import, unless the user has already seen it on this
			// browser. The tour has its own explicit "continue" button to
			// /today — no setTimeout redirect.
			const seen = browser && localStorage.getItem(TOUR_FLAG_KEY) === '1';
			if (seen) {
				phase = 'done';
				setTimeout(() => goto('/'), 1200);
			} else {
				phase = 'tour';
			}
		} catch (e) {
			setError('migrate.error_import', e instanceof Error ? e.message : String(e));
			// stay on importing/preview so user can retry — checkpoint preserved
			phase = 'preview';
		} finally {
			busy = false;
		}
	}

	async function signalMigrationComplete() {
		// Best-effort: try https first, fall back to http for localhost-style
		// dev sources (mirrors the fetchBundle logic).
		const path = `/api/migration-complete/${encodeURIComponent(token)}`;
		const tryOnce = async (scheme: 'https' | 'http') => {
			const url = `${scheme}://${source}${path}`;
			return fetch(url, { method: 'POST', mode: 'cors', credentials: 'omit' });
		};
		try {
			let res: Response;
			try {
				res = await tryOnce('https');
			} catch (netErr) {
				if (source.startsWith('localhost') || source.startsWith('127.0.0.1')) {
					res = await tryOnce('http');
				} else {
					throw netErr;
				}
			}
			if (!res.ok) {
				console.warn('[migrate] lockdown signal returned non-OK', res.status);
			}
		} catch (e) {
			console.warn('[migrate] lockdown signal failed (non-fatal)', e);
		}
	}

	function goHome() {
		goto('/');
	}

	function finishTour() {
		if (browser) {
			try {
				localStorage.setItem(TOUR_FLAG_KEY, '1');
			} catch {
				/* ignore quota */
			}
		}
		goto('/');
	}
</script>

<svelte:head>
	<title>{$t('migrate.title')}</title>
</svelte:head>

<main
	class="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4"
	style="background: var(--surface)"
>
	<div class="w-full max-w-md">
		<!-- Wordmark + tagline header — identical to /login -->
		<div class="flex justify-center mb-3 mt-2">
			<Wordmark size={56} />
		</div>
		<p class="text-sm text-center mb-8" style="color: var(--text-muted)">
			{$t('encryption.badge')}
		</p>

		{#if phase === 'tour'}
			<!-- CIPH-761 — one-shot post-import Tagebuch-private tour. Uses
				 the shared Modal primitive (CIPH-834). Not dismissable: the
				 user must tap Continue so we know they saw the notice. -->
			<Modal open={true} dismissable={false} title={$t('migrate.tour_title')}>
				<p class="text-sm mb-6" style="color: var(--text-secondary)">{$t('migrate.tour_body')}</p>
				<button type="button" class="btn-primary w-full px-4 min-h-[48px]" on:click={finishTour}>
					{$t('migrate.tour_continue')}
				</button>
			</Modal>
		{:else}
			<div
				class="rounded-2xl overflow-hidden"
				style="background: var(--surface-card); border: 1px solid var(--border)"
			>
				<div class="p-6">
					{#if phase === 'init'}
						<p class="text-sm text-center" style="color: var(--text-muted)">…</p>
					{:else if phase === 'no-fragment'}
						<h1 class="text-lg font-semibold mb-2" style="color: var(--text-primary)">
							{$t('migrate.not_found_title')}
						</h1>
						<p class="text-sm mb-6" style="color: var(--text-secondary)">{$t('migrate.not_found_body')}</p>
						<button type="button" class="btn-primary w-full px-4 min-h-[48px]" on:click={goHome}>
							{$t('common.back')}
						</button>
					{:else if phase === 'signup'}
						<h1 class="text-lg font-semibold mb-2" style="color: var(--text-primary)">
							{$t('migrate.welcome_title')}
						</h1>
						<p class="text-sm mb-6" style="color: var(--text-secondary)">
							{$t('migrate.welcome_body', { source })}
						</p>
						<SignupFlow source="migrate" on:signup-complete={handleSignupComplete} />
					{:else if phase === 'confirm-origin'}
						<!-- Design review 2026-06-11 — from→to reading order (source
						     above target), machine origin-check with hard-stop on
						     mismatch, and one sentence on what actually happens to
						     the data. The checkbox stays as a deliberate ritual: the
						     browser address bar is the one indicator a phishing page
						     cannot fake, so the human look is still requested. -->
						<h1 class="text-lg font-semibold mb-2" style="color: var(--text-primary)">
							{$t('migrate.confirm_title')}
						</h1>

						{#if ciphraStatus === 'mismatch'}
							<div
								class="rounded-xl p-3 mb-3"
								style="background: var(--surface-muted); border: 1px solid var(--border)"
							>
								<p class="text-xs mb-1" style="color: var(--text-muted)">
									{$t('migrate.confirm_target_label')}
								</p>
								<code class="text-sm font-mono font-semibold break-all" style="color: var(--text-primary)"
									>{currentOrigin}</code
								>
							</div>
							<div
								class="rounded-xl p-4"
								style="background: rgba(var(--danger-rgb), 0.07); border: 1px solid var(--danger)"
								data-testid="migrate-origin-blocked"
							>
								<p class="text-sm font-semibold mb-1" style="color: var(--danger)">
									{$t('migrate.confirm_blocked_title')}
								</p>
								<p class="text-sm" style="color: var(--text-primary)">
									{$t('migrate.confirm_blocked_body')}
								</p>
							</div>
						{:else}
							<p class="text-sm mb-4" style="color: var(--text-secondary)">
								{$t('migrate.confirm_body', { source })}
							</p>

							<div
								class="rounded-xl p-3"
								style="background: var(--surface-muted); border: 1px solid var(--border)"
							>
								<p class="text-xs mb-1" style="color: var(--text-muted)">
									{$t('migrate.confirm_source_label')}
								</p>
								<code class="text-sm font-mono font-semibold break-all" style="color: var(--text-primary)"
									>{source}</code
								>
							</div>
							<div class="flex justify-center py-1" style="color: var(--text-muted)" aria-hidden="true">
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 5v14m0 0l-6-6m6 6l6-6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
							</div>
							<div
								class="rounded-xl p-3 mb-2"
								style="background: var(--surface-muted); border: 1px solid var(--border)"
							>
								<p class="text-xs mb-1" style="color: var(--text-muted)">
									{$t('migrate.confirm_target_label')}
								</p>
								<code class="text-sm font-mono font-semibold break-all" style="color: var(--text-primary)"
									>{currentOrigin}</code
								>
							</div>

							{#if ciphraStatus === 'canonical'}
								<p class="mb-3">
									<span
										class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
										style="background: var(--olive-light); color: var(--olive)"
									>
										<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><polyline points="20,6 9,17 4,12" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
										{$t('migrate.confirm_match_ok')}
									</span>
								</p>
							{:else}
								<p class="text-xs mb-3" style="color: var(--text-muted)">
									{$t('migrate.confirm_dev_note')}
								</p>
							{/if}

							<p
								class="text-sm rounded-xl p-3 mb-4"
								style="background: var(--olive-light); color: var(--text-secondary)"
							>
								{$t('migrate.confirm_selfcheck_note')}
							</p>

							<label class="flex items-start gap-2 mb-6 cursor-pointer">
								<input type="checkbox" bind:checked={originConfirmed} class="mt-0.5" />
								<span class="text-sm" style="color: var(--text-secondary)">{$t('migrate.confirm_checkbox')}</span>
							</label>

							<button
								type="button"
								class="btn-primary w-full px-4 min-h-[48px]"
								on:click={confirmOriginAndFetch}
								disabled={!originConfirmed}
								data-testid="migrate-confirm-origin"
							>
								{$t('migrate.confirm_button')}
							</button>
						{/if}
					{:else if phase === 'fetching'}
						<h1 class="text-lg font-semibold mb-2" style="color: var(--text-primary)">
							{$t('migrate.phase_fetching')}
						</h1>
						<p class="text-sm" style="color: var(--text-secondary)">{busyLabel}</p>
					{:else if phase === 'fetch-error'}
						<h1 class="text-lg font-semibold mb-2" style="color: var(--text-primary)">
							{$t('migrate.error_title')}
						</h1>
						<div
							class="rounded-xl p-3 mb-4"
							style="background: rgba(220,38,38,0.05); border: 1px solid rgba(220,38,38,0.2)"
						>
							<p class="text-sm" style="color: var(--danger)">{$t(errorKey)}</p>
							{#if errorDetail}
								<p class="text-xs mt-1 font-mono break-all" style="color: var(--text-muted)">
									{errorDetail}
								</p>
							{/if}
						</div>
						<a
							class="btn-secondary w-full px-4 min-h-[48px] flex items-center justify-center"
							href="https://{source}"
						>
							{$t('migrate.back_to_source', { source })}
						</a>
					{:else if phase === 'preview' && bundle && mapped}
						<h1 class="text-lg font-semibold mb-2" style="color: var(--text-primary)">
							{$t('migrate.preview_title')}
						</h1>
						<p class="text-sm mb-4" style="color: var(--text-secondary)">
							{$t('migrate.preview_body', {
								seizures: mapped.entries.length,
								events: mapped.events.length,
								meds: mapped.medications.length,
								diary: mapped.diaries.length,
							})}
						</p>
						{#if dateRangeStart && dateRangeEnd}
							<p class="text-xs mb-2" style="color: var(--text-muted)">
								{$t('migrate.date_range', { start: dateRangeStart, end: dateRangeEnd })}
							</p>
						{/if}
						<p class="text-xs mb-6" style="color: var(--text-muted)">
							{$t('migrate.decommission_note', { date: decommissionDate })}
						</p>
						{#if errorKey}
							<div
								class="rounded-xl p-3 mb-4"
								style="background: rgba(220,38,38,0.05); border: 1px solid rgba(220,38,38,0.2)"
							>
								<p class="text-sm" style="color: var(--danger)">{$t(errorKey)} {errorDetail}</p>
							</div>
						{/if}
						<button
							type="button"
							class="btn-primary w-full px-4 min-h-[48px]"
							on:click={runImport}
							disabled={busy}
							data-testid="migrate-confirm-import"
						>
							{$t('migrate.confirm_import')}
						</button>
					{:else if phase === 'importing'}
						<h1 class="text-lg font-semibold mb-2" style="color: var(--text-primary)">
							{$t('migrate.importing_title')}
						</h1>
						<p class="text-sm mb-3" style="color: var(--text-secondary)">
							{progressDone} / {progressTotal}
						</p>
						<div class="w-full rounded-full h-2 mb-2" style="background: var(--surface-inset)">
							<div
								class="h-2 rounded-full transition-all duration-300"
								style="background: var(--brand); width: {progressTotal > 0
									? Math.round((progressDone / progressTotal) * 100)
									: 0}%"
							></div>
						</div>
						<p class="text-xs" style="color: var(--text-muted)">
							{$t('migrate.importing_status', { done: progressDone, total: progressTotal })}
						</p>
					{:else if phase === 'done'}
						<h1 class="text-lg font-semibold mb-2" style="color: var(--text-primary)">
							{$t('migrate.done_title')}
						</h1>
						<p class="text-sm" style="color: var(--text-secondary)">{$t('migrate.done_body')}</p>
					{/if}
				</div>
			</div>
		{/if}

		<p class="text-center text-xs mt-4" style="color: var(--text-muted)">
			{$t('encryption.zero_knowledge')}
		</p>
	</div>
</main>
