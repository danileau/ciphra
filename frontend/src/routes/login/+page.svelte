<script lang="ts">
	import { t, locale, locales, localeNames } from '$lib/i18n';
	import * as api from '$lib/api';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { decryptMasterKeyWithRecovery, rewrapMasterKey } from '$lib/crypto';
	import { validateRecoveryCode } from '$lib/wordlist';
	import SignupFlow from '$lib/components/SignupFlow.svelte';
	import LoginForm from '$lib/components/LoginForm.svelte';
	import Wordmark from '$lib/components/Wordmark.svelte';
	import PasswordField from '$lib/components/PasswordField.svelte';

	function setLocale(e: Event) {
		const val = (e.currentTarget as HTMLSelectElement).value;
		locale.set(val);
	}

	// Default to the register tab when arriving via /login?mode=register
	// (primary landing-page CTA routes here). Anything else → login.
	const initialMode = $page.url.searchParams.get('mode');
	let tab: 'login' | 'register' | 'recovery' =
		initialMode === 'register' ? 'register'
		: initialMode === 'recovery' ? 'recovery'
		: 'login';
	let error = '';
	let technicalError = '';
	let loading = false;
	// Separate phase label so users see progress during the ~1–7s Argon2id
	// derivation (looks like a hung app on low-end Android otherwise).
	let phase = '';

	function setError(userFacing: string, technical?: string) {
		error = userFacing;
		technicalError = technical || '';
	}
	function clearError() { error = ''; technicalError = ''; }

	// Recovery
	let recUser = '';
	let recCode = '';
	let recNewPass = '';
	let recNewPassConfirm = '';
	let recSuccess = '';

	function resumePendingFamilyJoin(): string {
		// Resume a pending family-join if one was stashed before redirect.
		let dest = '/';
		try {
			const pending = sessionStorage.getItem('ciphra_pending_family_claim');
			if (pending) {
				const { grantId, familyCode } = JSON.parse(pending);
				if (grantId && familyCode) {
					dest = `/join/${grantId}#${encodeURIComponent(familyCode)}`;
				}
				sessionStorage.removeItem('ciphra_pending_family_claim');
			}
		} catch { /* ignore */ }
		return dest;
	}

	function handleLoginComplete() {
		goto(resumePendingFamilyJoin());
	}

	function handleSignupComplete() {
		// SignupFlow has already auto-logged-in and set the auth store.
		goto(resumePendingFamilyJoin());
	}

	async function handleRecover() {
		error = '';
		recSuccess = '';
		if (recNewPass !== recNewPassConfirm) {
			error = $t('auth.error_password_match');
			return;
		}
		if (recNewPass.length < 8) {
			error = $t('auth.error_password_short');
			return;
		}
		if (!validateRecoveryCode(recCode)) {
			error = $t('auth.error_recovery');
			return;
		}
		loading = true;
		phase = $t('auth.phase_deriving');
		try {
			const username = recUser.trim().toLowerCase();
			const initRes = await api.recoverInit(username);
			if (!initRes.ok) {
				setError($t('auth.error_recovery'), initRes.data.error as string);
				return;
			}
			const initData = initRes.data as { recovery_params: string; recovery_vault: string };
			const { masterKey, recoveryKeyB64 } = await decryptMasterKeyWithRecovery(
				username, recCode, initData.recovery_params, initData.recovery_vault
			);
			phase = $t('auth.phase_building_vault');
			const wrap = await rewrapMasterKey(masterKey, recNewPass);
			const res = await api.recover({
				username,
				recovery_key: recoveryKeyB64,
				auth_hash: wrap.auth_hash,
				auth_params: wrap.auth_params,
				vault_params: wrap.vault_params,
				encrypted_master: wrap.encrypted_master,
			});
			if (res.ok) {
				recSuccess = $t('auth.recovery_success');
				recUser = ''; recCode = ''; recNewPass = ''; recNewPassConfirm = '';
				setTimeout(() => { recSuccess = ''; tab = 'login'; }, 2000);
			} else {
				const msg = res.status === 429 ? $t('auth.error_locked') : $t('auth.error_recovery');
				setError(msg, res.data.error as string);
			}
		} catch (e) {
			setError($t('auth.error_recovery'), e instanceof Error ? e.message : String(e));
		} finally {
			loading = false;
			phase = '';
		}
	}

</script>

<main class="min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-4" style="background: var(--surface)">
	<div class="w-full max-w-md">
		<!-- Centered wordmark above the form — gives the auth flow its own
		     identity instead of relying on the passive top-left nav logo.
		     Sized larger here than in chrome so it owns the page and
		     reads as the moment of the brand, not a footer detail. -->
		<div class="flex justify-center mb-3 mt-2">
			<Wordmark size={56} />
		</div>
		<p class="text-sm text-center mb-8" style="color: var(--text-muted)">{$t('encryption.badge')}</p>

		<div class="rounded-2xl overflow-hidden" style="background: var(--surface-card); border: 1px solid var(--border)">
			<!-- Tabs -->
				<div class="flex" style="border-bottom: 1px solid var(--border)">
					<button
						class="flex-1 py-3 text-sm font-medium transition-colors min-h-[48px]"
						style="{tab === 'login' ? 'color: var(--brand); border-bottom: 2px solid var(--brand)' : 'color: var(--text-muted)'}"
						on:click={() => { tab = 'login'; clearError(); }}
					>{$t('auth.login')}</button>
					<button
						class="flex-1 py-3 text-sm font-medium transition-colors min-h-[48px]"
						style="{tab === 'register' ? 'color: var(--brand); border-bottom: 2px solid var(--brand)' : 'color: var(--text-muted)'}"
						on:click={() => { tab = 'register'; clearError(); }}
					>{$t('auth.register')}</button>
					<button
						class="flex-1 py-3 text-sm font-medium transition-colors min-h-[48px]"
						style="{tab === 'recovery' ? 'color: var(--brand); border-bottom: 2px solid var(--brand)' : 'color: var(--text-muted)'}"
						on:click={() => { tab = 'recovery'; clearError(); recSuccess = '';}}
					>{$t('auth.recovery')}</button>
				</div>

				<div class="p-6">
					{#if tab !== 'login' && error}
						<div class="rounded-xl p-3 mb-4" style="background: rgba(220,38,38,0.05); border: 1px solid rgba(220,38,38,0.2)">
							<p class="text-sm" style="color: var(--danger)">{error}</p>
							{#if technicalError}
								<details class="mt-2">
									<summary class="text-xs cursor-pointer select-none" style="color: var(--text-muted)">{$t('auth.technical_details')}</summary>
									<p class="text-xs font-mono mt-1 break-all" style="color: var(--text-muted)">{technicalError}</p>
								</details>
							{/if}
						</div>
					{/if}

					{#if recSuccess}
						<div class="rounded-xl p-3 mb-4" style="background: rgba(5,150,105,0.05); border: 1px solid rgba(5,150,105,0.2)">
							<p class="text-sm" style="color: var(--success)">{recSuccess}</p>
						</div>
					{/if}

					{#if tab === 'login'}
						<LoginForm on:login-complete={handleLoginComplete} />
					{:else if tab === 'register'}
						<SignupFlow on:signup-complete={handleSignupComplete} />
					{:else if tab === 'recovery'}
						<form on:submit|preventDefault={handleRecover} class="space-y-4">
							<div>
								<label for="rec-user" class="block text-sm font-medium mb-1.5" style="color: var(--text-secondary)">{$t('auth.username')}</label>
								<input id="rec-user" type="text" bind:value={recUser} required minlength="3"
									class="input" />
							</div>
							<div>
								<label for="rec-code" class="block text-sm font-medium mb-1.5" style="color: var(--text-secondary)">{$t('auth.recovery_code')}</label>
								<input id="rec-code" type="text" bind:value={recCode} required
									placeholder="able acid aged also area army away baby back ball born boss"
									class="input font-mono" />
							</div>
							<div>
								<label for="rec-new-pass" class="block text-sm font-medium mb-1.5" style="color: var(--text-secondary)">{$t('auth.new_password')}</label>
								<PasswordField
									id="rec-new-pass"
									bind:value={recNewPass}
									required
									minlength={8}
									class="input"
								/>
							</div>
							<div>
								<label for="rec-new-pass2" class="block text-sm font-medium mb-1.5" style="color: var(--text-secondary)">{$t('auth.password_confirm')}</label>
								<PasswordField
									id="rec-new-pass2"
									bind:value={recNewPassConfirm}
									required
									minlength={8}
									class="input"
								/>
							</div>
							<button type="submit" disabled={loading}
								class="btn-primary w-full px-4 min-h-[48px]">
								{loading ? (phase || $t('common.loading')) : $t('auth.recover_button')}
							</button>
						</form>
					{/if}
				</div>
		</div>

		<!-- Footer controls -->
		<div class="flex items-center justify-center gap-4 mt-6">
			<select
				class="text-xs rounded-lg px-2 py-1.5 min-h-[36px] cursor-pointer"
				style="background: var(--surface-muted); border: 1px solid var(--border) ; color: var(--text-secondary)"
				value={$locale}
				on:change={setLocale}
			>
				{#each locales as l}
					<option value={l}>{localeNames[l]}</option>
				{/each}
			</select>
		</div>

		<p class="text-center text-xs mt-4" style="color: var(--text-muted)">
			{$t('encryption.zero_knowledge')}
		</p>
		<p class="text-center text-xs mt-2">
			<a href="/privacy" class="underline" style="color: var(--text-muted)">{$t('privacy.title')}</a>
		</p>
	</div>
</main>
