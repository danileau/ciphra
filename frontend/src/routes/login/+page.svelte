<script lang="ts">
	import { t, locale, locales, localeNames } from '$lib/i18n';
	import type { Locale } from '$lib/i18n';
	import { auth } from '$lib/stores/auth';
	import * as api from '$lib/api';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { createVault, decryptMasterKey, decryptMasterKeyWithRecovery, deriveAuthKey, rewrapMasterKey } from '$lib/crypto';
	import { validateRecoveryCode } from '$lib/wordlist';
	import { generateRecoveryPdf } from '$lib/pdf';
	import Asterisk from '$lib/components/Asterisk.svelte';

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

	// Login
	let loginUser = '';
	let loginPass = '';

	// Register
	let regUser = '';
	let regPass = '';
	let regPassConfirm = '';
	const enableRecovery = true;
	let recoveryCode = '';
	let recoveryConfirmed = false;
	let showRecovery = false;

	// Validation
	let touched: Record<string, boolean> = {};

	// Recovery
	let recUser = '';
	let recCode = '';
	let recNewPass = '';
	let recNewPassConfirm = '';

	async function handleLogin() {
		clearError();
		loading = true;
		phase = $t('auth.phase_checking');
		try {
			const initRes = await api.loginInit(loginUser.trim().toLowerCase());
			if (!initRes.ok) {
				setError($t('auth.error_credentials'), initRes.data.error as string);
				return;
			}
			const authParams = (initRes.data as { auth_params: string }).auth_params;
			phase = $t('auth.phase_deriving');
			const authKey = await deriveAuthKey(loginPass, authParams);
			phase = $t('auth.phase_verifying');
			const res = await api.login(loginUser.trim().toLowerCase(), authKey);
			if (!res.ok) {
				const rawErr = res.data.error as string | undefined;
				const msg = res.status === 429
					? $t('auth.error_locked')
					: $t('auth.error_credentials');
				setError(msg, rawErr);
				return;
			}
			const vault = res.data.vault as { auth_params: string; vault_params: string; encrypted_master: string };
			try {
				phase = $t('auth.phase_unlocking');
				const masterKey = await decryptMasterKey(loginPass, vault.vault_params, vault.encrypted_master);
				auth.login(
					res.data.token as string,
					res.data.username as string,
					masterKey,
					vault,
					(res.data.is_admin as boolean) || false
				);
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
				goto(dest);
			} catch (e) {
				setError($t('auth.error_vault_decrypt'), e instanceof Error ? e.message : String(e));
			}
		} catch (e) {
			setError($t('auth.error_credentials'), e instanceof Error ? e.message : String(e));
		} finally {
			loading = false;
			phase = '';
		}
	}

	async function handleRegister() {
		error = '';
		if (regPass !== regPassConfirm) {
			error = $t('auth.error_password_match');
			return;
		}
		loading = true;
		phase = $t('auth.phase_building_vault');
		try {
			// All crypto runs in the browser. Server only sees hashes + ciphertext.
			const bundle = await createVault(regUser.trim().toLowerCase(), regPass, enableRecovery);
			const res = await api.register(bundle);
			if (res.ok) {
				if (bundle.recovery_code) {
					recoveryCode = bundle.recovery_code;
					showRecovery = true;
				} else {
					tab = 'login';
					loginUser = regUser;
				}
			} else {
				setError($t('auth.error_exists'), res.data.error as string);
			}
		} catch (e) {
			setError($t('auth.error_exists'), e instanceof Error ? e.message : String(e));
		} finally {
			loading = false;
			phase = '';
		}
	}

	let recSuccess = '';

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

	function proceedAfterRecovery() {
		showRecovery = false;
		tab = 'login';
		loginUser = regUser;
	}
</script>

<div class="min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-4" style="background: var(--surface)">
	<div class="w-full max-w-md">
		<!-- Logo lives in the sticky layout header; only keep the tagline here -->
		<p class="text-sm text-center mb-6" style="color: var(--text-muted)">{$t('encryption.badge')}</p>

		<div class="rounded-2xl overflow-hidden" style="background: var(--surface-card); border: 1px solid var(--border)">
			{#if showRecovery}
				<!-- Recovery Code Display -->
				<div class="p-6">
					<div class="rounded-xl p-4 mb-4" style="background: var(--olive-light); border: 1px solid rgba(127,130,27,0.15)">
						<p class="text-sm font-medium" style="color: var(--olive)">{$t('auth.recovery_save_warning')}</p>
					</div>
					<div class="rounded-xl p-4 mb-4" style="background: var(--surface-muted)">
						<p class="font-mono text-base select-all leading-relaxed" style="color: var(--text-primary)">{recoveryCode}</p>
					</div>
					<button
						type="button"
						on:click={() => generateRecoveryPdf(regUser.trim().toLowerCase(), recoveryCode, $t, $locale)}
						class="btn-secondary w-full px-4 min-h-[44px] mb-4 flex items-center justify-center gap-2"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
						{$t('auth.download_recovery_pdf')}
					</button>
					<label class="flex items-center gap-3 mb-4 cursor-pointer min-h-[44px]">
						<input type="checkbox" bind:checked={recoveryConfirmed} class="w-5 h-5 rounded" style="border-color: var(--border)" />
						<span class="text-sm" style="color: var(--text-secondary)">{$t('auth.recovery_confirm')}</span>
					</label>
					<button
						on:click={proceedAfterRecovery}
						disabled={!recoveryConfirmed}
						class="btn-primary w-full px-4 min-h-[48px]"
					>
						{$t('auth.proceed')}
					</button>
				</div>
			{:else}
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
					{#if error}
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
						<form on:submit|preventDefault={handleLogin} class="space-y-4">
							<div>
								<label for="login-user" class="block text-sm font-medium mb-1.5" style="color: var(--text-secondary)">{$t('auth.username')}</label>
								<input id="login-user" type="text" bind:value={loginUser} required minlength="3"
									on:blur={() => { touched.loginUser = true; }}
									class="input" />
								{#if touched.loginUser && loginUser.length > 0 && loginUser.length < 3}
									<p class="text-xs mt-1" style="color: var(--danger)">{$t('auth.error_username_short')}</p>
								{/if}
							</div>
							<div>
								<label for="login-pass" class="block text-sm font-medium mb-1.5" style="color: var(--text-secondary)">{$t('auth.password')}</label>
								<input id="login-pass" type="password" bind:value={loginPass} required minlength="8"
									on:blur={() => { touched.loginPass = true; }}
									class="input" />
								{#if touched.loginPass && loginPass.length > 0 && loginPass.length < 8}
									<p class="text-xs mt-1" style="color: var(--danger)">{$t('auth.error_password_short')}</p>
								{/if}
							</div>
							<button type="submit" disabled={loading}
								class="btn-primary w-full px-4 min-h-[48px]">
								{loading ? (phase || $t('common.loading')) : $t('auth.login')}
							</button>
						</form>
					{:else if tab === 'register'}
						<form on:submit|preventDefault={handleRegister} class="space-y-4">
							<div>
								<label for="reg-user" class="block text-sm font-medium mb-1.5" style="color: var(--text-secondary)">{$t('auth.username')}</label>
								<input id="reg-user" type="text" bind:value={regUser} required minlength="3" pattern="[a-z0-9_]+"
									on:blur={() => { touched.regUser = true; }}
									class="input" />
								{#if touched.regUser && regUser.length > 0 && regUser.length < 3}
									<p class="text-xs mt-1" style="color: var(--danger)">{$t('auth.error_username_short')}</p>
								{/if}
							</div>
							<div>
								<label for="reg-pass" class="block text-sm font-medium mb-1.5" style="color: var(--text-secondary)">{$t('auth.password')}</label>
								<input id="reg-pass" type="password" bind:value={regPass} required minlength="8"
									on:blur={() => { touched.regPass = true; }}
									class="input" />
								{#if touched.regPass && regPass.length > 0 && regPass.length < 8}
									<p class="text-xs mt-1" style="color: var(--danger)">{$t('auth.error_password_short')}</p>
								{/if}
							</div>
							<div>
								<label for="reg-pass2" class="block text-sm font-medium mb-1.5" style="color: var(--text-secondary)">{$t('auth.password_confirm')}</label>
								<input id="reg-pass2" type="password" bind:value={regPassConfirm} required minlength="8"
									on:blur={() => { touched.regPassConfirm = true; }}
									class="input" />
								{#if touched.regPassConfirm && regPassConfirm.length > 0 && regPass !== regPassConfirm}
									<p class="text-xs mt-1" style="color: var(--danger)">{$t('auth.error_password_match')}</p>
								{/if}
							</div>
							<div class="rounded-xl p-3" style="background: var(--olive-light); border: 1px solid rgba(127,130,27,0.15)">
								<div class="flex items-center gap-2">
									<svg class="w-4 h-4 shrink-0" style="color: var(--olive)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
									<p class="text-xs" style="color: var(--olive)">{$t('auth.recovery_mandatory')}</p>
								</div>
							</div>
							<button type="submit" disabled={loading}
								class="btn-primary w-full px-4 min-h-[48px]">
								{loading ? (phase || $t('common.loading')) : $t('auth.register')}
							</button>
						</form>
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
								<input id="rec-new-pass" type="password" bind:value={recNewPass} required minlength="8"
									class="input" />
							</div>
							<div>
								<label for="rec-new-pass2" class="block text-sm font-medium mb-1.5" style="color: var(--text-secondary)">{$t('auth.password_confirm')}</label>
								<input id="rec-new-pass2" type="password" bind:value={recNewPassConfirm} required minlength="8"
									class="input" />
							</div>
							<button type="submit" disabled={loading}
								class="btn-primary w-full px-4 min-h-[48px]">
								{loading ? (phase || $t('common.loading')) : $t('auth.recover_button')}
							</button>
						</form>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Footer controls -->
		<div class="flex items-center justify-center gap-4 mt-6">
			<select
				class="text-xs rounded-lg px-2 py-1.5 min-h-[36px] cursor-pointer"
				style="background: var(--surface-muted); border: 1px solid var(--border); color: var(--text-secondary)"
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
</div>
