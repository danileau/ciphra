<script lang="ts">
	import { t, locale, locales, localeNames } from '$lib/i18n';
	import type { Locale } from '$lib/i18n';
	import { auth } from '$lib/stores/auth';
	import * as api from '$lib/api';
	import { goto } from '$app/navigation';
	import { decryptMasterKey } from '$lib/crypto';
	import Asterisk from '$lib/components/Asterisk.svelte';

	function setLocale(e: Event) {
		const val = (e.currentTarget as HTMLSelectElement).value;
		locale.set(val);
	}

	let tab: 'login' | 'register' | 'recovery' = 'login';
	let error = '';
	let loading = false;

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
		error = '';
		loading = true;
		try {
			const res = await api.login(loginUser, loginPass);
			if (res.ok) {
				const vault = res.data.vault as { vault_params: string; encrypted_master: string };
				try {
					const masterKey = await decryptMasterKey(
						loginPass,
						vault.vault_params,
						vault.encrypted_master
					);
					auth.login(
						res.data.token as string,
						res.data.username as string,
						masterKey,
						vault,
						(res.data.is_admin as boolean) || false
					);
					goto('/');
				} catch (e) {
					console.error('Master key decryption failed:', e);
					error = 'Vault decryption failed';
				}
			} else {
				error = (res.data.error as string) || $t('auth.error_credentials');
			}
		} finally {
			loading = false;
		}
	}

	async function handleRegister() {
		error = '';
		if (regPass !== regPassConfirm) {
			error = $t('auth.error_password_match');
			return;
		}
		loading = true;
		const res = await api.register(regUser, regPass, enableRecovery);
		loading = false;
		if (res.ok) {
			if (res.data.recovery_code) {
				recoveryCode = res.data.recovery_code as string;
				showRecovery = true;
			} else {
				tab = 'login';
				loginUser = regUser;
			}
		} else {
			error = (res.data.error as string) || $t('auth.error_exists');
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
		loading = true;
		const res = await api.recover(recUser, recCode, recNewPass);
		loading = false;
		if (res.ok) {
			recSuccess = $t('auth.recovery_success');
			recUser = '';
			recCode = '';
			recNewPass = '';
			recNewPassConfirm = '';
			setTimeout(() => {
				recSuccess = '';
				tab = 'login';
			}, 2000);
		} else {
			error = (res.data.error as string) || $t('auth.error_recovery');
		}
	}

	function proceedAfterRecovery() {
		showRecovery = false;
		tab = 'login';
		loginUser = regUser;
	}
</script>

<div class="min-h-screen flex items-center justify-center p-4" style="background: var(--surface)">
	<div class="w-full max-w-md">
		<!-- Logo -->
		<div class="flex flex-col items-center mb-8">
			<svg viewBox="0 0 220 50" class="h-10 mb-2" aria-label="ciphra">
				<text x="28" y="36" font-family="Inter, DM Sans, sans-serif" font-size="36" font-weight="500" letter-spacing="1" style="fill: var(--text-primary)">ciphra</text>
				<g transform="translate(162,12) rotate(8)" style="stroke: var(--brand)" stroke-linecap="round" fill="none">
					<path d="M -6.5 0 L 6.5 0" stroke-width="1.5"/>
					<path d="M -2.7 -4.6 L 2.7 4.6" stroke-width="1.2"/>
					<path d="M 2.6 -4.4 L -2.6 4.4" stroke-width="1.1"/>
				</g>
			</svg>
			<p class="text-sm" style="color: var(--text-muted)">{$t('encryption.badge')}</p>
		</div>

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
						on:click={() => { tab = 'login'; error = ''; }}
					>{$t('auth.login')}</button>
					<button
						class="flex-1 py-3 text-sm font-medium transition-colors min-h-[48px]"
						style="{tab === 'register' ? 'color: var(--brand); border-bottom: 2px solid var(--brand)' : 'color: var(--text-muted)'}"
						on:click={() => { tab = 'register'; error = ''; }}
					>{$t('auth.register')}</button>
					<button
						class="flex-1 py-3 text-sm font-medium transition-colors min-h-[48px]"
						style="{tab === 'recovery' ? 'color: var(--brand); border-bottom: 2px solid var(--brand)' : 'color: var(--text-muted)'}"
						on:click={() => { tab = 'recovery'; error = ''; recSuccess = ''; }}
					>{$t('auth.recovery')}</button>
				</div>

				<div class="p-6">
					{#if error}
						<div class="rounded-xl p-3 mb-4" style="background: rgba(220,38,38,0.05); border: 1px solid rgba(220,38,38,0.2)">
							<p class="text-sm" style="color: var(--danger)">{error}</p>
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
								{loading ? $t('common.loading') : $t('auth.login')}
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
								{loading ? $t('common.loading') : $t('auth.register')}
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
								{loading ? $t('common.loading') : $t('auth.recover_button')}
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
	</div>
</div>
