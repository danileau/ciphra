<script lang="ts">
	/**
	 * Link-based family-grant claim landing page.
	 *
	 * URL shape: /join/<grant_id>#<family_code>
	 * The family code lives in the URL fragment — browsers never send
	 * fragments in HTTP requests, so the server never sees it.
	 *
	 * Flow:
	 *   1. Read grant_id from path param + family_code from fragment
	 *   2. If not logged in → stash in sessionStorage, redirect to /login
	 *   3. If logged in → ask server for candidate grants, match the code,
	 *      verify with the server, persist the link into caregiver's vault
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { get } from 'svelte/store';
	import { t } from '$lib/i18n';
	import { auth, isAuthenticated, authReady } from '$lib/stores/auth';
	import { familyLinks } from '$lib/stores/familyLinks';
	import { unwrapFamilyGrant } from '$lib/crypto';
	import * as api from '$lib/api';
	import Asterisk from '$lib/components/Asterisk.svelte';

	// SvelteKit passes route params as a component prop. Declare it to silence
	// "unknown prop 'params'" warnings; we still read via $page.params.
	export const params: Record<string, string> | undefined = undefined;
	export const data: unknown = undefined;
	void params; void data;

	const PENDING_KEY = 'ciphra_pending_family_claim';

	let status: 'loading' | 'needs_login' | 'confirming' | 'claiming' | 'success' | 'error' = 'loading';
	let errorMsg = '';
	let grantId = 0;
	let familyCode = '';
	let sourceUsername = '';

	function parseParams(): { grantId: number; code: string } | null {
		const idRaw = $page.params.grantId;
		const id = Number(idRaw);
		if (!id || Number.isNaN(id)) return null;
		let code = '';
		if (browser && window.location.hash) {
			code = decodeURIComponent(window.location.hash.replace(/^#/, ''));
		}
		return { grantId: id, code };
	}

	async function attemptClaim(): Promise<void> {
		const state = get(auth);
		if (!state.masterKey) {
			status = 'error';
			errorMsg = $t('auth.error_vault_decrypt');
			return;
		}
		try {
			// Try to identify the source user by asking the server for grants
			// associated with any username that produces a match. Simpler:
			// fetch our grant_id's details through claim/init variants.
			// Approach: caregiver tries the code against every candidate returned
			// for the *known* source_username after a server lookup-by-id. But
			// the claim endpoint can verify directly — we just need to try
			// deriving the key against any grant_params we can find.
			//
			// Since claim/init needs a username, we ask the server to return
			// the grant's params given an id. To keep enumeration-resistance,
			// this endpoint exists only via a limited shape: POST /family/grants/claim/init
			// takes username. We'll provide the username from the saved state
			// (user types it on a small form) OR defer to manual claim via Settings.

			// For the MVP link flow, we need username. Ask once if missing.
			status = 'confirming';
		} catch (e) {
			status = 'error';
			errorMsg = e instanceof Error ? e.message : String(e);
		}
	}

	async function confirmClaim(): Promise<void> {
		const state = get(auth);
		if (!state.masterKey || !sourceUsername.trim()) return;
		status = 'claiming';
		errorMsg = '';
		try {
			const initRes = await api.familyGrantClaimInit(sourceUsername.trim().toLowerCase());
			if (!initRes.ok) {
				throw new Error('Init failed');
			}
			const candidates = (initRes.data.grants as Array<{
				id: number; grant_params: string; wrapped_master: string; grant_auth: string;
			}>) || [];
			// Narrow to the one the link is pointing at when possible.
			const candidate = candidates.find(c => c.id === grantId) || candidates[0];
			if (!candidate) throw new Error('no-candidate');

			const { masterKey, familyKeyB64 } = await unwrapFamilyGrant(
				familyCode, candidate.grant_params, candidate.wrapped_master
			);
			const claimRes = await api.familyGrantClaim(candidate.id, familyKeyB64);
			if (!claimRes.ok) {
				if (claimRes.status === 409) {
					status = 'error';
					errorMsg = $t('family.error_already_claimed');
					return;
				}
				throw new Error('claim-rejected');
			}
			const claimData = claimRes.data as { source_user_id: number; source_username: string };
			await familyLinks.addLink({
				sourceUserId: claimData.source_user_id,
				sourceUsername: claimData.source_username,
				label: claimData.source_username,
				patientMasterKey: masterKey,
			});
			status = 'success';
			setTimeout(() => goto('/settings'), 1500);
		} catch (e) {
			status = 'error';
			errorMsg = $t('family.error_claim_failed');
		}
	}

	onMount(() => {
		const params = parseParams();
		if (!params || !params.code) {
			status = 'error';
			errorMsg = $t('family.error_bad_link');
			return;
		}
		grantId = params.grantId;
		familyCode = params.code;

		// Clear the fragment immediately — no point leaving the code in the
		// address bar after we've consumed it.
		if (browser) history.replaceState(null, '', window.location.pathname);

		if (!$authReady) return;

		if (!$isAuthenticated) {
			// Stash and send to login; we'll resume after auth.
			if (browser) {
				sessionStorage.setItem(PENDING_KEY, JSON.stringify({ grantId, familyCode }));
			}
			status = 'needs_login';
			setTimeout(() => goto('/login'), 0);
			return;
		}

		attemptClaim();
	});
</script>

<main class="min-h-screen flex items-center justify-center p-4" style="background: var(--surface)">
	<div class="w-full max-w-md card p-6">
		<div class="flex flex-col items-center mb-4">
			<Asterisk size={28} />
			<h1 class="text-xl font-bold mt-2" style="color: var(--text-primary)">{$t('family.join_title')}</h1>
		</div>

		{#if status === 'loading' || status === 'needs_login'}
			<p class="text-sm text-center" style="color: var(--text-muted)">{$t('common.loading')}</p>

		{:else if status === 'confirming'}
			<p class="text-sm mb-4" style="color: var(--text-secondary)">{$t('family.join_confirm_desc')}</p>
			<form on:submit|preventDefault={confirmClaim} class="space-y-3">
				<input
					type="text"
					bind:value={sourceUsername}
					placeholder={$t('family.username_placeholder')}
					required
					class="input w-full"
				/>
				<button type="submit" class="btn-primary w-full min-h-[48px]">
					{$t('family.link')}
				</button>
			</form>

		{:else if status === 'claiming'}
			<p class="text-sm text-center" style="color: var(--text-muted)">{$t('common.loading')}</p>

		{:else if status === 'success'}
			<div class="rounded-xl p-3" style="background: rgba(5,150,105,0.05); border: 1px solid rgba(5,150,105,0.2)">
				<p class="text-sm" style="color: var(--success)">{$t('family.join_success')}</p>
			</div>

		{:else if status === 'error'}
			<div class="rounded-xl p-3 mb-3" style="background: rgba(220,38,38,0.05); border: 1px solid rgba(220,38,38,0.2)">
				<p class="text-sm" style="color: var(--danger)">{errorMsg || $t('family.error_claim_failed')}</p>
			</div>
			<a href="/settings" class="btn-secondary w-full min-h-[44px] block text-center">{$t('common.back')}</a>
		{/if}
	</div>
</main>
