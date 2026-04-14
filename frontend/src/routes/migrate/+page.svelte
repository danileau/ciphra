<!--
	CIPH-712 — Epilepc migration landing.

	Activates ONLY when the URL fragment contains `#migrate=<token>&source=<host>`.
	Without the fragment we render a minimal not-found message and offer the
	user the way back to `/`. Ciphra has no other discovery surface for epilepc:
	this route is not linked from anywhere in normal navigation.

	Token never leaves the client — fragments are not sent to the ciphra server.
	Bundle is fetched directly from the source (epilepc) and encrypted under
	the new user's master_key before any POST to ciphra.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { auth, isAuthenticated } from '$lib/stores/auth';
	import { get } from 'svelte/store';
	import { documents } from '$lib/stores/documents';
	import SignupFlow from '$lib/components/SignupFlow.svelte';
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
		| 'done';

	let phase: Phase = 'init';
	let token = '';
	let source = '';
	let decommissionDate = '';
	let errorKey = '';
	let errorDetail = '';
	let originConfirmed = false;
	let currentOrigin = '';

	let busy = false;
	let busyLabel = '';

	let bundle: EpilepcBundle | null = null;
	let mapped: MappedDocs | null = null;

	let progressDone = 0;
	let progressTotal = 0;

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
		const hash = window.location.hash.replace(/^#/, '');
		const params = new URLSearchParams(hash);
		const tok = params.get('migrate');
		const src = params.get('source');
		if (!tok || !src) {
			phase = 'no-fragment';
			return;
		}
		// minimal sanity: no scheme, no spaces
		if (/[\s]/.test(tok) || /[\s/]/.test(src)) {
			phase = 'no-fragment';
			return;
		}
		token = tok;
		source = src;
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
			// Save each doc (skip already-checkpointed)
			const saveOne = async (doc: Record<string, unknown>) => {
				const sid = doc.source_id as string;
				if (done.has(sid)) {
					progressDone += 1;
					return;
				}
				const ok = await documents.save(doc);
				if (!ok) throw new Error(`save_failed:${sid}`);
				done.add(sid);
				saveCheckpoint(done);
				progressDone += 1;
			};
			for (const d of mapped.entries) await saveOne(d);
			for (const d of mapped.events) await saveOne(d);
			for (const d of mapped.diaries) await saveOne(d);

			clearCheckpoint();
			phase = 'done';
			setTimeout(() => goto('/'), 1200);
		} catch (e) {
			setError('migrate.error_import', e instanceof Error ? e.message : String(e));
			// stay on importing/preview so user can retry — checkpoint preserved
			phase = 'preview';
		} finally {
			busy = false;
		}
	}

	function goHome() {
		goto('/');
	}
</script>

<svelte:head>
	<title>{$t('migrate.title')}</title>
</svelte:head>

<main class="migrate">
	{#if phase === 'init'}
		<p>…</p>
	{:else if phase === 'no-fragment'}
		<h1>{$t('migrate.not_found_title')}</h1>
		<p>{$t('migrate.not_found_body')}</p>
		<button on:click={goHome}>{$t('common.back')}</button>
	{:else if phase === 'signup'}
		<h1>{$t('migrate.welcome_title')}</h1>
		<p>{$t('migrate.welcome_body', { source })}</p>
		<SignupFlow on:signup-complete={handleSignupComplete} />
	{:else if phase === 'confirm-origin'}
		<h1>{$t('migrate.confirm_title')}</h1>
		<p>{$t('migrate.confirm_body')}</p>
		<div class="origin-block">
			<div class="origin-label">{$t('migrate.confirm_target_label')}</div>
			<code class="origin-value">{currentOrigin}</code>
		</div>
		<div class="origin-block">
			<div class="origin-label">{$t('migrate.confirm_source_label')}</div>
			<code class="origin-value">{source}</code>
		</div>
		<label class="ack">
			<input type="checkbox" bind:checked={originConfirmed} />
			<span>{$t('migrate.confirm_checkbox')}</span>
		</label>
		<button on:click={confirmOriginAndFetch} disabled={!originConfirmed}>
			{$t('migrate.confirm_button')}
		</button>
	{:else if phase === 'fetching'}
		<h1>{$t('migrate.phase_fetching')}</h1>
		<p>{busyLabel}</p>
	{:else if phase === 'fetch-error'}
		<h1>{$t('migrate.error_title')}</h1>
		<p class="err">{$t(errorKey)}</p>
		{#if errorDetail}<p class="detail">{errorDetail}</p>{/if}
		<a class="back-link" href="https://{source}">{$t('migrate.back_to_source', { source })}</a>
	{:else if phase === 'preview' && bundle && mapped}
		<h1>{$t('migrate.preview_title')}</h1>
		<p>
			{$t('migrate.preview_body', {
				seizures: mapped.entries.length,
				events: mapped.events.length,
				meds: mapped.medications.length,
				diary: mapped.diaries.length,
			})}
		</p>
		<p class="decom">{$t('migrate.decommission_note', { date: decommissionDate })}</p>
		{#if errorKey}<p class="err">{$t(errorKey)} {errorDetail}</p>{/if}
		<button on:click={runImport} disabled={busy}>{$t('migrate.confirm_import')}</button>
	{:else if phase === 'importing'}
		<h1>{$t('migrate.importing_title')}</h1>
		<p>{progressDone} / {progressTotal}</p>
		<progress value={progressDone} max={progressTotal}></progress>
	{:else if phase === 'done'}
		<h1>{$t('migrate.done_title')}</h1>
		<p>{$t('migrate.done_body')}</p>
	{/if}
</main>

<style>
	.migrate {
		max-width: 36rem;
		margin: 2rem auto;
		padding: 1.5rem;
		font-family: system-ui, sans-serif;
	}
	button {
		padding: 0.6rem 1rem;
		font-size: 1rem;
		cursor: pointer;
	}
	.err {
		color: #b00020;
	}
	.detail {
		color: #666;
		font-size: 0.9rem;
	}
	progress {
		width: 100%;
		height: 1rem;
	}
	.decom {
		color: #666;
		font-size: 0.9rem;
	}
	.back-link {
		display: inline-block;
		margin-top: 1rem;
	}
	.origin-block {
		margin: 1rem 0;
		padding: 0.75rem 1rem;
		background: #f5f5f7;
		border: 1px solid #ddd;
		border-radius: 6px;
	}
	.origin-label {
		font-size: 0.8rem;
		color: #666;
		margin-bottom: 0.25rem;
	}
	.origin-value {
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 1.05rem;
		font-weight: 600;
		word-break: break-all;
	}
	.ack {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 1rem 0;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
