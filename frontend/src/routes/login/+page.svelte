<script lang="ts">
	import { t, locale, locales, localeNames } from '$lib/i18n';
	import type { Locale } from '$lib/i18n';
	import { auth } from '$lib/stores/auth';
	import { darkMode } from '$lib/stores/darkmode';
	import * as api from '$lib/api';
	import { goto } from '$app/navigation';
	import { decryptMasterKey } from '$lib/crypto';

	function setLocale(e: Event) {
		const val = /** @type {HTMLSelectElement} */ (e.currentTarget).value;
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
	let enableRecovery = true;
	let recoveryCode = '';
	let recoveryConfirmed = false;
	let showRecovery = false;

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
					// Decrypt master key using Argon2id-WASM + AES-256-GCM (epi-2 key hierarchy)
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

<div class="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center p-4">
	<div class="w-full max-w-md">
		<!-- Logo -->
		<div class="text-center mb-8">
			<h1 class="text-3xl font-bold text-stone-900 dark:text-white tracking-tight">ciphra</h1>
			<p class="text-sm text-stone-500 dark:text-stone-400 mt-1">{$t('encryption.badge')}</p>
		</div>

		<div class="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm overflow-hidden">
			{#if showRecovery}
				<!-- Recovery Code Display -->
				<div class="p-6">
					<div class="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-4 mb-4">
						<p class="text-sm font-medium text-amber-800 dark:text-amber-300">{$t('auth.recovery_save_warning')}</p>
					</div>
					<div class="bg-stone-100 dark:bg-stone-800 rounded-xl p-4 mb-4">
						<p class="font-mono text-base text-stone-900 dark:text-white select-all leading-relaxed">{recoveryCode}</p>
					</div>
					<label class="flex items-center gap-3 mb-4 cursor-pointer">
						<input type="checkbox" bind:checked={recoveryConfirmed} class="w-5 h-5 rounded border-stone-300" />
						<span class="text-sm text-stone-700 dark:text-stone-300">{$t('auth.recovery_confirm')}</span>
					</label>
					<button
						on:click={proceedAfterRecovery}
						disabled={!recoveryConfirmed}
						class="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-stone-300 dark:disabled:bg-stone-700 text-white rounded-xl font-medium transition-colors min-h-[48px]"
					>
						{$t('auth.proceed')}
					</button>
				</div>
			{:else}
				<!-- Tabs -->
				<div class="flex border-b border-stone-200 dark:border-stone-800">
					<button
						class="flex-1 py-3 text-sm font-medium transition-colors min-h-[48px]
							{tab === 'login' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400' : 'text-stone-500'}"
						on:click={() => { tab = 'login'; error = ''; }}
					>{$t('auth.login')}</button>
					<button
						class="flex-1 py-3 text-sm font-medium transition-colors min-h-[48px]
							{tab === 'register' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400' : 'text-stone-500'}"
						on:click={() => { tab = 'register'; error = ''; }}
					>{$t('auth.register')}</button>
						<button
						class="flex-1 py-3 text-sm font-medium transition-colors min-h-[48px]
							{tab === 'recovery' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400' : 'text-stone-500'}"
						on:click={() => { tab = 'recovery'; error = ''; recSuccess = ''; }}
					>{$t('auth.recovery')}</button>
				</div>

				<div class="p-6">
					{#if error}
						<div class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-3 mb-4">
							<p class="text-sm text-red-700 dark:text-red-300">{error}</p>
						</div>
					{/if}

					{#if recSuccess}
						<div class="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-xl p-3 mb-4">
							<p class="text-sm text-green-700 dark:text-green-300">{recSuccess}</p>
						</div>
					{/if}

					{#if tab === 'login'}
						<form on:submit|preventDefault={handleLogin} class="space-y-4">
							<div>
								<label for="login-user" class="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">{$t('auth.username')}</label>
								<input id="login-user" type="text" bind:value={loginUser} required minlength="3"
									class="w-full px-3 py-2.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl text-stone-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none min-h-[44px]" />
							</div>
							<div>
								<label for="login-pass" class="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">{$t('auth.password')}</label>
								<input id="login-pass" type="password" bind:value={loginPass} required minlength="8"
									class="w-full px-3 py-2.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl text-stone-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none min-h-[44px]" />
							</div>
							<button type="submit" disabled={loading}
								class="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-stone-300 text-white rounded-xl font-medium transition-colors min-h-[48px]">
								{loading ? $t('common.loading') : $t('auth.login')}
							</button>
						</form>
					{:else if tab === 'register'}
						<form on:submit|preventDefault={handleRegister} class="space-y-4">
							<div>
								<label for="reg-user" class="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">{$t('auth.username')}</label>
								<input id="reg-user" type="text" bind:value={regUser} required minlength="3" pattern="[a-z0-9_]+"
									class="w-full px-3 py-2.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl text-stone-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none min-h-[44px]" />
							</div>
							<div>
								<label for="reg-pass" class="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">{$t('auth.password')}</label>
								<input id="reg-pass" type="password" bind:value={regPass} required minlength="8"
									class="w-full px-3 py-2.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl text-stone-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none min-h-[44px]" />
							</div>
							<div>
								<label for="reg-pass2" class="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">{$t('auth.password_confirm')}</label>
								<input id="reg-pass2" type="password" bind:value={regPassConfirm} required minlength="8"
									class="w-full px-3 py-2.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl text-stone-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none min-h-[44px]" />
							</div>
							<label class="flex items-center gap-3 cursor-pointer">
								<input type="checkbox" bind:checked={enableRecovery} class="w-5 h-5 rounded border-stone-300" />
								<span class="text-sm text-stone-700 dark:text-stone-300">{$t('auth.enable_recovery')}</span>
							</label>
							<button type="submit" disabled={loading}
								class="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-stone-300 text-white rounded-xl font-medium transition-colors min-h-[48px]">
								{loading ? $t('common.loading') : $t('auth.register')}
							</button>
						</form>
					{:else if tab === 'recovery'}
						<form on:submit|preventDefault={handleRecover} class="space-y-4">
							<div>
								<label for="rec-user" class="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">{$t('auth.username')}</label>
								<input id="rec-user" type="text" bind:value={recUser} required minlength="3"
									class="w-full px-3 py-2.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl text-stone-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none min-h-[44px]" />
							</div>
							<div>
								<label for="rec-code" class="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">{$t('auth.recovery_code')}</label>
								<input id="rec-code" type="text" bind:value={recCode} required
									placeholder="able acid aged also area army away baby back ball born boss"
									class="w-full px-3 py-2.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl text-stone-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none min-h-[44px] font-mono text-sm" />
							</div>
							<div>
								<label for="rec-new-pass" class="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">{$t('auth.new_password')}</label>
								<input id="rec-new-pass" type="password" bind:value={recNewPass} required minlength="8"
									class="w-full px-3 py-2.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl text-stone-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none min-h-[44px]" />
							</div>
							<div>
								<label for="rec-new-pass2" class="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">{$t('auth.password_confirm')}</label>
								<input id="rec-new-pass2" type="password" bind:value={recNewPassConfirm} required minlength="8"
									class="w-full px-3 py-2.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl text-stone-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none min-h-[44px]" />
							</div>
							<button type="submit" disabled={loading}
								class="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-stone-300 text-white rounded-xl font-medium transition-colors min-h-[48px]">
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
				class="text-xs bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg px-2 py-1.5 text-stone-600 dark:text-stone-300 min-h-[36px]"
				value={$locale}
				on:change={setLocale}
			>
				{#each locales as l}
					<option value={l}>{localeNames[l]}</option>
				{/each}
			</select>
			<button
				on:click={() => darkMode.toggle()}
				class="text-xs text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 min-h-[36px] px-2"
			>
				{$t('darkmode.toggle')}
			</button>
		</div>

		<p class="text-center text-xs text-stone-400 dark:text-stone-600 mt-4">
			{$t('encryption.zero_knowledge')}
		</p>
	</div>
</div>
