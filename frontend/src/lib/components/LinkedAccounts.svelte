<script lang="ts">
	/**
	 * Caregiver-side: view/manage accounts this user has linked to.
	 * Manual claim flow (source_username + family_code).
	 * The link-based flow lives at /join/[grantId] and also ends up here.
	 */
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';
	import { auth } from '$lib/stores/auth';
	import { familyLinks } from '$lib/stores/familyLinks';
	import { get } from 'svelte/store';
	import { matchFamilyGrant } from '$lib/crypto';
	import { validateFamilyCode } from '$lib/wordlist';
	import * as api from '$lib/api';

	let showClaim = false;
	let sourceUsername = '';
	let familyCode = '';
	let claiming = false;
	let errorMsg = '';
	let successMsg = '';

	async function load() {
		if (!familyLinks.isLoaded()) {
			await familyLinks.load();
		}
	}

	async function claim() {
		errorMsg = ''; successMsg = '';
		const user = sourceUsername.trim().toLowerCase();
		const code = familyCode.trim();
		if (!user) return;
		if (!validateFamilyCode(code)) {
			errorMsg = $t('family.error_invalid_code');
			return;
		}
		const state = get(auth);
		if (!state.masterKey) {
			errorMsg = $t('auth.error_vault_decrypt');
			return;
		}
		claiming = true;
		try {
			const initRes = await api.familyGrantClaimInit(user);
			if (!initRes.ok) {
				errorMsg = $t('family.error_claim_failed');
				return;
			}
			const candidates = (initRes.data.grants as Array<{
				id: number; grant_params: string; wrapped_master: string; grant_auth: string;
			}>) || [];
			const match = await matchFamilyGrant(code, candidates);
			if (!match) {
				errorMsg = $t('family.error_no_match');
				return;
			}
			const claimRes = await api.familyGrantClaim(match.grantId, match.familyKeyB64);
			if (!claimRes.ok) {
				const status = claimRes.status;
				errorMsg = status === 409
					? $t('family.error_already_claimed')
					: $t('family.error_claim_failed');
				return;
			}
			const claimData = claimRes.data as { source_user_id: number; source_username: string };
			await familyLinks.addLink({
				sourceUserId: claimData.source_user_id,
				sourceUsername: claimData.source_username,
				label: claimData.source_username,
				patientMasterKey: match.masterKey,
			});
			successMsg = $t('family.claim_success', { user: claimData.source_username });
			sourceUsername = ''; familyCode = ''; showClaim = false;
			setTimeout(() => { successMsg = ''; }, 3000);
		} catch (e) {
			errorMsg = $t('family.error_claim_failed');
		} finally {
			claiming = false;
		}
	}

	async function unlink(documentId: number, username: string) {
		if (!confirm($t('family.confirm_unlink', { user: username }))) return;
		await familyLinks.removeLink(documentId);
	}

	onMount(load);
</script>

<section class="card p-5">
	<div class="flex items-center justify-between mb-3">
		<h2 class="text-xs font-medium uppercase tracking-wider" style="color: var(--text-muted)">{$t('family.linked_title')}</h2>
		<button
			type="button"
			on:click={() => { showClaim = !showClaim; errorMsg = ''; }}
			class="text-xs px-3 py-1.5 rounded-lg min-h-[36px]"
			style="background: var(--surface-muted); color: var(--text-secondary)"
		>
			{showClaim ? $t('common.cancel') : $t('family.link_new')}
		</button>
	</div>

	<p class="text-sm mb-3" style="color: var(--text-secondary)">{$t('family.linked_desc')}</p>

	{#if errorMsg}
		<div class="rounded-xl p-3 mb-3" style="background: rgba(220,38,38,0.05); border: 1px solid rgba(220,38,38,0.2)">
			<p class="text-sm" style="color: var(--danger)">{errorMsg}</p>
		</div>
	{/if}
	{#if successMsg}
		<div class="rounded-xl p-3 mb-3" style="background: rgba(5,150,105,0.05); border: 1px solid rgba(5,150,105,0.2)">
			<p class="text-sm" style="color: var(--success)">{successMsg}</p>
		</div>
	{/if}

	{#if showClaim}
		<form on:submit|preventDefault={claim} class="space-y-2 mb-4">
			<input
				type="text"
				bind:value={sourceUsername}
				placeholder={$t('family.username_placeholder')}
				required
				class="input w-full"
			/>
			<input
				type="text"
				bind:value={familyCode}
				placeholder={$t('family.code_placeholder')}
				required
				class="input w-full font-mono"
			/>
			<button type="submit" disabled={claiming} class="btn-primary w-full min-h-[44px]">
				{claiming ? $t('common.loading') : $t('family.link')}
			</button>
		</form>
	{/if}

	{#if $familyLinks.length === 0}
		<p class="text-sm" style="color: var(--text-muted)">{$t('family.no_links')}</p>
	{:else}
		<ul class="space-y-2">
			{#each $familyLinks as l}
				<li
					class="flex items-center justify-between rounded-lg p-3"
					style="background: {l.revoked ? 'rgba(220,38,38,0.05)' : 'var(--surface-muted)'}; border: 1px solid {l.revoked ? 'rgba(220,38,38,0.2)' : 'var(--border)'}"
				>
					<div class="flex-1 min-w-0">
						<p class="text-sm font-medium" style="color: var(--text-primary)">{l.sourceUsername}</p>
						{#if l.revoked}
							<p class="text-xs mt-0.5" style="color: var(--danger)">{$t('family.link_revoked')}</p>
						{/if}
					</div>
					<button
						type="button"
						on:click={() => unlink(l.documentId, l.sourceUsername)}
						class="text-xs px-3 py-1.5 rounded-lg min-h-[36px] ml-2"
						style="background: rgba(220,38,38,0.06); color: var(--danger)"
					>
						{l.revoked ? $t('family.remove') : $t('family.unlink')}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>
