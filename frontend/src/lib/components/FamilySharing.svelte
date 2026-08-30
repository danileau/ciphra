<script lang="ts">
	/**
	 * Patient-side family-sharing management.
	 * Create invite → show one-time code + shareable link + PDF → list active
	 * grants → revoke.
	 *
	 * Component stays invisible in nav/layout unless the user actually has
	 * active grants OR clicks "+ Create invite" — ciphra stays a private
	 * notebook by default.
	 */
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';
	import { auth } from '$lib/stores/auth';
	import { get } from 'svelte/store';
	import { createFamilyGrant, encryptData, decryptData } from '$lib/crypto';
	import { locale } from '$lib/i18n';
	import * as api from '$lib/api';
	import { SHARE_MASK_SHARED_ONLY, SHARE_MASK_EVERYTHING } from '$lib/utils/shareClass';
	import ScopeChoice from './ScopeChoice.svelte';
	import { browser } from '$app/environment';

	interface Grant {
		id: number;
		label: string;
		created_at: string;
		claimed_at: string | null;
		claimed_by_username: string | null;
		last_access_at: string | null;
		/** 1 = everything but the diary and locked entries, 3 = everything. */
		share_mask?: number;
	}

	function timeAgo(iso: string | null, locale: string): string {
		if (!iso) return '';
		const diff = Date.now() - new Date(iso).getTime();
		if (diff < 0) return new Date(iso).toLocaleString(locale);
		const mins = Math.floor(diff / 60_000);
		if (mins < 1) return '<1 min';
		if (mins < 60) return `${mins} min`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours} h`;
		const days = Math.floor(hours / 24);
		if (days < 30) return `${days} d`;
		return new Date(iso).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
	}

	let grants: Grant[] = [];
	let loading = false;
	let errorMsg = '';

	// Create-invite state
	let showCreate = false;
	let newLabel = '';
	let creating = false;
	let createdCode = '';
	let createdGrantId = 0;
	let createdLabel = '';
	let createdShareMask: number = SHARE_MASK_SHARED_ONLY;
	let revealed = false;
	// A privacy control defaults closed: an invitation shares everything
	// EXCEPT the diary and locked entries unless the owner says otherwise.
	let newShareMask: number = SHARE_MASK_SHARED_ONLY;
	// Which grant is being modified, and the scope picked but not yet saved.
	let editingId: number | null = null;
	let editingMask: number = SHARE_MASK_SHARED_ONLY;
	let savingScope = false;

	$: shareLink = browser && createdGrantId
		? `${window.location.origin}/join/${createdGrantId}#${encodeURIComponent(createdCode)}`
		: '';

	// Security review (PI v13) LB: family_grants.label was stored
	// plaintext, leaking the patient's social graph ("Grandma", "Dr.
	// Schmidt") to a server breach. Encrypt with the patient's master
	// key (the only audience) before sending. Backwards-compat: legacy
	// plaintext labels still render — decrypt throws and we fall back.
	async function tryDecryptLabel(stored: string, masterKey: Uint8Array): Promise<string> {
		try {
			return await decryptData(stored, masterKey);
		} catch {
			return stored;
		}
	}

	async function load() {
		loading = true;
		const res = await api.familyGrantList();
		loading = false;
		if (!res.ok) return;
		const raw = (res.data.grants as Grant[]) || [];
		const state = get(auth);
		if (!state.masterKey) {
			grants = raw;
			return;
		}
		grants = await Promise.all(
			raw.map(async (g) => ({ ...g, label: await tryDecryptLabel(g.label, state.masterKey!) })),
		);
	}

	async function createInvite() {
		errorMsg = '';
		const label = newLabel.trim();
		if (!label) return;
		const state = get(auth);
		if (!state.masterKey) {
			errorMsg = $t('auth.error_vault_decrypt');
			return;
		}
		creating = true;
		try {
			const bundle = await createFamilyGrant(state.masterKey);
			const encryptedLabel = await encryptData(label, state.masterKey);
			const res = await api.familyGrantCreate({
				label: encryptedLabel,
				grant_params: bundle.grant_params,
				grant_auth: bundle.grant_auth,
				wrapped_master: bundle.wrapped_master,
				share_mask: newShareMask,
			});
			if (!res.ok) {
				errorMsg = (res.data.error as string) || 'Failed';
				return;
			}
			createdCode = bundle.family_code;
			createdGrantId = (res.data as { id: number }).id;
			createdLabel = label;
			createdShareMask = newShareMask;
			newLabel = '';
			newShareMask = SHARE_MASK_SHARED_ONLY;
			showCreate = false;
			revealed = false;
			await load();
		} finally {
			creating = false;
		}
	}

	function startEditScope(g: Grant) {
		editingId = g.id;
		editingMask = g.share_mask ?? SHARE_MASK_SHARED_ONLY;
		errorMsg = '';
	}

	function cancelEditScope() {
		editingId = null;
	}

	async function saveScope(g: Grant) {
		const current = g.share_mask ?? SHARE_MASK_SHARED_ONLY;
		if (editingMask === current) {
			editingId = null;
			return;
		}
		// Widening shares more than they had; narrowing does not reach what
		// they already downloaded. Both deserve the sentence before the click,
		// and they are different sentences.
		const question = editingMask === SHARE_MASK_EVERYTHING
			? $t('family.scope_confirm_widen')
			: $t('family.scope_confirm_narrow');
		if (!confirm(question)) return;
		errorMsg = '';
		savingScope = true;
		try {
			const res = await api.familyGrantRescope(g.id, editingMask);
			if (!res.ok) {
				errorMsg = (res.data.error as string) || 'Failed';
				return;
			}
			editingId = null;
			await load();
		} finally {
			savingScope = false;
		}
	}

	async function revoke(id: number) {
		if (!confirm($t('family.confirm_revoke'))) return;
		const res = await api.familyGrantRevoke(id);
		if (res.ok) await load();
	}

	async function revokeAll() {
		if (!confirm($t('family.confirm_revoke_all'))) return;
		const res = await api.familyGrantRevokeAll();
		if (res.ok) await load();
	}

	async function copyLink() {
		try { await navigator.clipboard.writeText(shareLink); } catch {}
	}
	async function copyCode() {
		try { await navigator.clipboard.writeText(createdCode); } catch {}
	}

	async function downloadPdf() {
		const state = get(auth);
		const { generateFamilyInvitePdf } = await import('$lib/pdf');
		generateFamilyInvitePdf(
			state.username || '',
			createdLabel,
			createdCode,
			shareLink,
			$t,
			$locale,
		);
	}

	function dismissReveal() {
		createdCode = '';
		createdGrantId = 0;
		createdLabel = '';
		revealed = false;
	}

	onMount(load);
</script>

<section class="card p-5">
	<div class="flex items-center justify-between mb-3">
		<h2 class="text-xs font-medium uppercase tracking-wider" style="color: var(--text-muted)">{$t('family.section_title')}</h2>
		{#if !createdCode}
			<button
				type="button"
				on:click={() => { showCreate = !showCreate; errorMsg = ''; }}
				class="text-xs px-3 py-1.5 rounded-lg min-h-[36px]"
				style="background: var(--surface-muted); color: var(--text-secondary)"
			>
				{showCreate ? $t('common.cancel') : $t('family.create_invite')}
			</button>
		{/if}
	</div>

	<p class="text-sm mb-3" style="color: var(--text-secondary)">{$t('family.section_desc')}</p>

	{#if errorMsg}
		<div class="rounded-xl p-3 mb-3" style="background: rgba(220,38,38,0.05); border: 1px solid rgba(220,38,38,0.2)">
			<p class="text-sm" style="color: var(--danger)">{errorMsg}</p>
		</div>
	{/if}

	{#if showCreate && !createdCode}
		<form on:submit|preventDefault={createInvite} class="mb-4">
			<div class="flex gap-2">
				<input
					type="text"
					bind:value={newLabel}
					placeholder={$t('family.label_placeholder')}
					required maxlength="64"
					class="input flex-1"
				/>
				<button type="submit" disabled={creating || !newLabel.trim()} class="btn-primary px-4 min-h-[44px]">
					{creating ? $t('common.loading') : $t('family.create')}
				</button>
			</div>

			<!-- What this invitation may read. Two radios rather than a
				 checkbox: both answers are legitimate, and a checkbox would
				 frame one of them as the deviation. Narrow is preselected. -->
			<div class="mt-3">
				<ScopeChoice bind:value={newShareMask} name="scope-new" />
			</div>
		</form>
	{/if}

	{#if createdCode}
		<div class="rounded-xl p-4 mb-4" style="background: var(--olive-light); border: 1px solid rgba(127,130,27,0.2)">
			<p class="text-sm font-semibold mb-2" style="color: var(--olive)">{$t('family.reveal_warning')}</p>
			<p class="text-sm mb-3" style="color: var(--text-secondary)">{$t('family.reveal_desc')}</p>

			<div class="rounded-lg p-3 mb-3" style="background: var(--surface-card); border: 1px solid var(--border)">
				<p class="text-xs mb-1" style="color: var(--text-muted)">{$t('family.code_label')}</p>
				<p class="font-mono text-base select-all leading-relaxed" style="color: var(--text-primary)">{createdCode}</p>
				<button type="button" on:click={copyCode} class="text-xs mt-2 underline" style="color: var(--accent)">{$t('common.copy')}</button>
			</div>

			<div class="rounded-lg p-3 mb-3" style="background: var(--surface-card); border: 1px solid var(--border)">
				<p class="text-xs mb-1" style="color: var(--text-muted)">{$t('family.link_label')}</p>
				<p class="font-mono text-xs break-all select-all" style="color: var(--text-primary)">{shareLink}</p>
				<button type="button" on:click={copyLink} class="text-xs mt-2 underline" style="color: var(--accent)">{$t('common.copy')}</button>
			</div>

			<button
				type="button"
				on:click={downloadPdf}
				class="btn-secondary w-full px-4 min-h-[44px] mb-3 flex items-center justify-center gap-2"
			>
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				{$t('auth.download_recovery_pdf')}
			</button>

			<!-- Say once more what is about to be shared, at the moment the
				 link is copied — the last point before it leaves. -->
			<p class="text-sm mb-3" style="color: var(--text-secondary)">
				<strong style="color: var(--text-primary)">
					{createdShareMask === SHARE_MASK_EVERYTHING
						? $t('family.scope_everything')
						: $t('family.scope_shared_only')}
				</strong>
				— {createdShareMask === SHARE_MASK_EVERYTHING
					? $t('family.scope_everything_hint')
					: $t('family.scope_shared_only_hint')}
			</p>

			<label class="flex items-center gap-2 mb-3 cursor-pointer min-h-[44px]">
				<input type="checkbox" bind:checked={revealed} class="w-5 h-5" />
				<span class="text-sm" style="color: var(--text-secondary)">{$t('family.reveal_confirm')}</span>
			</label>

			<button
				type="button"
				on:click={dismissReveal}
				disabled={!revealed}
				class="btn-primary w-full min-h-[44px]"
			>
				{$t('common.done')}
			</button>
		</div>
	{/if}

	{#if loading}
		<p class="text-sm" style="color: var(--text-muted)">{$t('common.loading')}</p>
	{:else if grants.length === 0}
		<p class="text-sm" style="color: var(--text-muted)">{$t('family.no_grants')}</p>
	{:else}
		<ul class="space-y-2">
			{#each grants as g}
				<li class="rounded-lg p-3" style="background: var(--surface-muted); border: 1px solid var(--border)">
				  <div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p class="text-sm font-medium" style="color: var(--text-primary)">{g.label}</p>
						<p class="text-xs mt-0.5" style="color: var(--text-muted)">
							{#if g.claimed_by_username}
								{$t('family.status_claimed_by', { user: g.claimed_by_username })}
							{:else}
								{$t('family.status_pending')}
							{/if}
						</p>
						<!-- What this invitation can see, and the way to change it.
							 The scope was previously the button itself, which
							 toggled on click: nothing said it was clickable, and
							 nothing showed the option you were switching to. -->
						<p class="text-xs mt-1 flex items-center gap-2 flex-wrap">
							<span style="color: var(--text-secondary)">
								{(g.share_mask ?? SHARE_MASK_SHARED_ONLY) === SHARE_MASK_EVERYTHING
									? $t('family.scope_everything')
									: $t('family.scope_shared_only')}
							</span>
							{#if editingId !== g.id}
								<button
									type="button"
									on:click={() => startEditScope(g)}
									class="underline underline-offset-2 min-h-[32px]"
									style="color: var(--accent, var(--brand))"
								>
									{$t('family.scope_change')}
								</button>
							{/if}
						</p>
						{#if g.last_access_at}
							<p class="text-[11px] mt-0.5" style="color: var(--text-muted)">
								{$t('family.last_seen', { ago: timeAgo(g.last_access_at, $locale) })}
							</p>
						{/if}
					</div>
					<button
						type="button"
						on:click={() => revoke(g.id)}
						class="text-xs px-3 py-1.5 rounded-lg min-h-[36px] ml-2"
						style="background: rgba(220,38,38,0.06); color: var(--danger)"
					>
						{$t('family.revoke')}
					</button>
				  </div>

				  {#if editingId === g.id}
					<!-- The same chooser as creation, so "modify" cannot offer a
						 different promise from the one they agreed to. Current
						 scope preselected; nothing changes until Save, and Save
						 asks first. -->
					<div class="mt-3">
						<ScopeChoice bind:value={editingMask} name={`scope-${g.id}`} />
						<div class="flex gap-2 justify-end mt-2">
							<button
								type="button"
								on:click={cancelEditScope}
								class="text-xs px-3 py-1.5 rounded-lg min-h-[36px]"
								style="background: var(--surface-card); color: var(--text-secondary)"
							>
								{$t('common.cancel')}
							</button>
							<button
								type="button"
								on:click={() => saveScope(g)}
								disabled={savingScope}
								class="btn-primary text-xs px-3 py-1.5 min-h-[36px]"
							>
								{savingScope ? $t('common.loading') : $t('common.save')}
							</button>
						</div>
					</div>
				  {/if}
				</li>
			{/each}
		</ul>
		<div class="mt-4 pt-3" style="border-top: 1px solid var(--border)">
			<p class="text-xs mb-2" style="color: var(--text-muted)">{$t('family.revoke_caveat')}</p>
			<button
				type="button"
				on:click={revokeAll}
				class="text-xs font-medium px-3 py-1.5 rounded-lg min-h-[36px]"
				style="background: rgba(220,38,38,0.1); color: var(--danger); border: 1px solid rgba(220,38,38,0.3)"
			>
				{$t('family.revoke_all')}
			</button>
		</div>
	{/if}
</section>
