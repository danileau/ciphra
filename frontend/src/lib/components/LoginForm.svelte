<!--
	LoginForm — password-login flow extracted from /login for symmetry with
	SignupFlow.svelte. Owns: username/password fields, loginInit →
	deriveAuthKey → login → decryptMasterKey → auth.login. Emits
	`login-complete` on success; the parent is responsible for post-login
	routing (family-claim resume etc.), matching the SignupFlow contract.
-->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { t } from '$lib/i18n';
	import * as api from '$lib/api';
	import { auth } from '$lib/stores/auth';
	import PasswordField from '$lib/components/PasswordField.svelte';
	import { decryptMasterKey, deriveAuthKey } from '$lib/crypto';

	const dispatch = createEventDispatcher<{ 'login-complete': void }>();

	let loginUser = '';
	let loginPass = '';
	let loading = false;
	// Separate phase label so users see progress during the ~1–7s Argon2id
	// derivation (looks like a hung app on low-end Android otherwise).
	let phase = '';
	let error = '';
	let technicalError = '';
	let touched: Record<string, boolean> = {};

	// A11y validation reactives — used by aria-invalid + aria-describedby
	// linking on the inputs (PI v13 a11y review LB-2).
	$: userInvalid = touched.loginUser && loginUser.length > 0 && loginUser.length < 3;
	$: passInvalid = touched.loginPass && loginPass.length > 0 && loginPass.length < 8;

	function setError(userFacing: string, technical?: string) {
		error = userFacing;
		technicalError = technical || '';
	}
	function clearError() { error = ''; technicalError = ''; }

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
				dispatch('login-complete');
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
</script>

<form on:submit|preventDefault={handleLogin} class="space-y-4">
	{#if error}
		<div class="rounded-xl p-3" style="background: rgba(220,38,38,0.05); border: 1px solid rgba(220,38,38,0.2)">
			<p class="text-sm" style="color: var(--danger)">{error}</p>
			{#if technicalError}
				<details class="mt-2">
					<summary class="text-xs cursor-pointer select-none" style="color: var(--text-muted)">{$t('auth.technical_details')}</summary>
					<p class="text-xs font-mono mt-1 break-all" style="color: var(--text-muted)">{technicalError}</p>
				</details>
			{/if}
		</div>
	{/if}
	<div>
		<label for="login-user" class="block text-sm font-medium mb-1.5" style="color: var(--text-secondary)">{$t('auth.username')}</label>
		<input id="login-user" type="text" bind:value={loginUser} required minlength="3"
			on:blur={() => { touched.loginUser = true; }}
			aria-invalid={userInvalid}
			aria-describedby={userInvalid ? 'login-user-err' : undefined}
			class="input" />
		{#if userInvalid}
			<p id="login-user-err" class="text-xs mt-1" style="color: var(--danger)">{$t('auth.error_username_short')}</p>
		{/if}
	</div>
	<div>
		<label for="login-pass" class="block text-sm font-medium mb-1.5" style="color: var(--text-secondary)">{$t('auth.password')}</label>
		<PasswordField
			id="login-pass"
			bind:value={loginPass}
			required
			minlength={8}
			on:blur={() => { touched.loginPass = true; }}
			ariaInvalid={passInvalid}
			ariaDescribedby={passInvalid ? 'login-pass-err' : undefined}
			class="input"
		/>
		{#if passInvalid}
			<p id="login-pass-err" class="text-xs mt-1" style="color: var(--danger)">{$t('auth.error_password_short')}</p>
		{/if}
	</div>
	<button type="submit" disabled={loading}
		data-testid="login-submit"
		class="btn-primary w-full px-4 min-h-[48px]">
		{loading ? (phase || $t('common.loading')) : $t('auth.login')}
	</button>
</form>
