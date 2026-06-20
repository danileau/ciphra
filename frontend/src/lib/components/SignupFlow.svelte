<!--
	SignupFlow — shared zero-knowledge signup flow used by /login and /migrate.

	Handles: createVault → register → loginInit → deriveAuthKey → login → decryptMasterKey.
	Then presents the recovery code with PDF download, copy-to-clipboard, and an
	acknowledgment checkbox. Only AFTER the user ticks the checkbox and clicks
	Continue do we commit to `auth.login` (populating the auth store) and emit
	`signup-complete`. This ordering is load-bearing: the root layout swaps the
	page shell the instant `$isAuthenticated` flips truthy, which would unmount
	this component before the recovery gate can render. Holding the session
	artifacts in component-local state until acknowledgment keeps the auth store
	an accurate source of truth for "user has completed signup".

	Losing the recovery code in zero-knowledge crypto means permanent vault
	loss, so the gate is mandatory.
-->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { t, locale } from '$lib/i18n';
	import * as api from '$lib/api';
	import { auth } from '$lib/stores/auth';
	import { createVault, decryptMasterKey, deriveAuthKey } from '$lib/crypto';
	import PasswordField from '$lib/components/PasswordField.svelte';

	// jsPDF is heavy; only load it if the user clicks "download recovery PDF".
	async function downloadRecoveryPdf() {
		const { generateRecoveryPdf } = await import('$lib/pdf');
		generateRecoveryPdf(username.trim().toLowerCase(), recoveryCode, $t, $locale);
	}

	const dispatch = createEventDispatcher<{ 'signup-complete': void }>();

	// Metadata-only tag passed to /api/register. The migrate route sets this
	// to 'migrate' so /admin can count epilepc migrations vs organic signups.
	// Default undefined → register call omits the field → server defaults 'web'.
	export let source: 'web' | 'migrate' | undefined = undefined;

	let username = '';
	let password = '';
	let confirm = '';
	let busy = false;
	let busyLabel = '';
	let error = '';
	let technicalError = '';

	// A11y validation reactives — used by aria-invalid + aria-describedby
	// linking on the inputs (PI v13 a11y review LB-2).
	$: userInvalid = touched.user && username.length > 0 && username.length < 3;
	$: passInvalid = touched.pass && password.length > 0 && password.length < 12;
	$: pass2Invalid = touched.pass2 && confirm.length > 0 && password !== confirm;

	let recoveryCode = '';
	let showRecovery = false;
	let acknowledged = false;
	let copied = false;

	// Session artifacts collected during the register+login sequence but NOT
	// yet committed to the auth store. We hold them here until the user
	// acknowledges the recovery gate; committing early would cause the root
	// layout to unmount this component mid-flow.
	type PendingSession = {
		token: string;
		username: string;
		masterKey: Uint8Array;
		vault: { auth_params: string; vault_params: string; encrypted_master: string };
		isAdmin: boolean;
		registrationSource: 'web' | 'migrate';
	};
	let pending: PendingSession | null = null;

	let touched: Record<string, boolean> = {};

	function setError(userFacing: string, technical = '') {
		error = userFacing;
		technicalError = technical;
	}

	async function handleRegister() {
		error = '';
		technicalError = '';
		if (password !== confirm) {
			setError($t('auth.error_password_match'));
			return;
		}
		// Security review (PI v13): floor raised 8 → 12. The whole
		// zero-knowledge story rests on Argon2id + password
		// unguessability. 12 chars defends against rented-GPU attacks
		// at typical Argon2 parameters.
		if (password.length < 12) {
			setError($t('auth.error_password_short'));
			return;
		}
		busy = true;
		busyLabel = $t('auth.phase_building_vault');
		try {
			const uname = username.trim().toLowerCase();
			const bundle = await createVault(uname, password, true);
			const reg = await api.register(bundle, source);
			if (!reg.ok) {
				// Status-aware copy. Server is enumeration-resistant (409 also covers
				// bundle-bad), so 409 still maps to "username taken" — that's the
				// most useful message for the dominant case. Other statuses must NOT
				// claim the username is taken.
				const msg =
					reg.status === 429 ? $t('auth.error_locked') :
					reg.status >= 500 ? $t('auth.error_server') :
					$t('auth.error_exists');
				setError(msg, (reg.data.error as string) || '');
				return;
			}
			recoveryCode = bundle.recovery_code || '';

			// auto-login so the parent has a session token + master_key
			busyLabel = $t('auth.phase_deriving');
			const initRes = await api.loginInit(uname);
			if (!initRes.ok) {
				setError($t('auth.error_credentials'), (initRes.data.error as string) || '');
				return;
			}
			const authParams = (initRes.data as { auth_params: string }).auth_params;
			const authKey = await deriveAuthKey(password, authParams);

			busyLabel = $t('auth.phase_verifying');
			const lr = await api.login(uname, authKey);
			if (!lr.ok) {
				const msg = lr.status === 429 ? $t('auth.error_locked') : $t('auth.error_credentials');
				setError(msg, (lr.data.error as string) || '');
				return;
			}
			const vault = lr.data.vault as { auth_params: string; vault_params: string; encrypted_master: string };

			busyLabel = $t('auth.phase_unlocking');
			const masterKey = await decryptMasterKey(password, vault.vault_params, vault.encrypted_master);
			// Hold the session in component-local state. DO NOT call auth.login
			// yet — that would flip $isAuthenticated and cause the root layout to
			// swap shells before the recovery gate renders.
			pending = {
				token: lr.data.token as string,
				username: lr.data.username as string,
				masterKey,
				vault,
				isAdmin: (lr.data.is_admin as boolean) || false,
				registrationSource: (lr.data.registration_source as 'web' | 'migrate') || 'web',
			};
			showRecovery = true;
		} catch (e) {
			// Network drop, crypto exception, abort — anything that doesn't reach
			// `reg.ok`. Don't claim the username is taken; that misled real users.
			setError($t('auth.error_server'), e instanceof Error ? e.message : String(e));
		} finally {
			busy = false;
			busyLabel = '';
		}
	}

	async function copyRecovery() {
		try {
			await navigator.clipboard.writeText(recoveryCode);
			copied = true;
			setTimeout(() => { copied = false; }, 2000);
		} catch {
			/* clipboard blocked; user can still select the text */
		}
	}

	function proceed() {
		if (!acknowledged) return;
		if (!pending) return;
		// Commit to the auth store NOW — after the user has acknowledged the
		// recovery code. This is the moment the layout may reactively swap
		// shells; the parent's `signup-complete` handler then routes as needed.
		auth.login(
			pending.token,
			pending.username,
			pending.masterKey,
			pending.vault,
			pending.isAdmin,
			pending.registrationSource
		);
		pending = null;
		dispatch('signup-complete');
	}
</script>

{#if !showRecovery}
	<form on:submit|preventDefault={handleRegister} class="space-y-4">
		<div>
			<label for="signup-user" class="block text-sm font-medium mb-1.5" style="color: var(--text-secondary)">{$t('auth.username')}</label>
			<input id="signup-user" type="text" bind:value={username} required minlength="3" pattern="[a-z0-9_]+"
				autocomplete="username"
				on:blur={() => { touched.user = true; }}
				aria-invalid={userInvalid}
				aria-describedby={userInvalid ? 'signup-user-err' : undefined}
				class="input" />
			{#if userInvalid}
				<p id="signup-user-err" class="text-xs mt-1" style="color: var(--danger)">{$t('auth.error_username_short')}</p>
			{/if}
		</div>
		<div>
			<label for="signup-pass" class="block text-sm font-medium mb-1.5" style="color: var(--text-secondary)">{$t('auth.password')}</label>
			<PasswordField
				id="signup-pass"
				bind:value={password}
				required
				autocomplete="new-password"
				on:blur={() => { touched.pass = true; }}
				ariaInvalid={passInvalid}
				ariaDescribedby={passInvalid ? 'signup-pass-err' : undefined}
				class="input"
			/>
			{#if passInvalid}
				<p id="signup-pass-err" class="text-xs mt-1" style="color: var(--danger)">{$t('auth.error_password_short')}</p>
			{/if}
		</div>
		<div>
			<label for="signup-pass2" class="block text-sm font-medium mb-1.5" style="color: var(--text-secondary)">{$t('auth.password_confirm')}</label>
			<PasswordField
				id="signup-pass2"
				bind:value={confirm}
				required
				autocomplete="new-password"
				on:blur={() => { touched.pass2 = true; }}
				ariaInvalid={pass2Invalid}
				ariaDescribedby={pass2Invalid ? 'signup-pass2-err' : undefined}
				class="input"
			/>
			{#if pass2Invalid}
				<p id="signup-pass2-err" class="text-xs mt-1" style="color: var(--danger)">{$t('auth.error_password_match')}</p>
			{/if}
		</div>
		<div class="rounded-xl p-3" style="background: var(--olive-light); border: 1px solid rgba(127,130,27,0.15)">
			<div class="flex items-center gap-2">
				<svg class="w-4 h-4 shrink-0" style="color: var(--olive)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				<p class="text-xs" style="color: var(--olive)">{$t('auth.recovery_mandatory')}</p>
			</div>
		</div>
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
		<button type="submit" disabled={busy}
			data-testid="register-submit"
			class="btn-primary w-full px-4 min-h-[48px]">
			{busy ? (busyLabel || $t('common.loading')) : $t('auth.register')}
		</button>
	</form>
{:else}
	<!-- Recovery Code Display with mandatory acknowledgment gate -->
	<div>
		<div class="rounded-xl p-4 mb-4" style="background: var(--olive-light); border: 1px solid rgba(127,130,27,0.15)">
			<p class="text-sm font-medium" style="color: var(--olive)">{$t('auth.recovery_save_warning')}</p>
		</div>
		<div class="rounded-xl p-4 mb-4" style="background: var(--surface-muted)">
			<!-- CIPH-763b — SR-only DOM label announces context before the
				 raw code characters. Sighted users already see the olive
				 warning box above; announcer users had no such framing.
				 2026-06-07 — code now renders as a numbered 2/3/4-col
				 grid mirroring the PDF's 3×4 layout. Easier to cross-
				 check paper↔screen and lower cognitive load than a
				 12-word run-on. Selection skips the cell numbers via
				 user-select:none so a manual copy still yields just the
				 words; the explicit copy button below remains the
				 canonical copy path. -->
			<span class="sr-only">{$t('auth.recovery_code_label')}</span>
			<ol
				data-testid="recovery-code-display"
				class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-3 gap-y-2 list-none m-0 p-0"
				aria-label={$t('auth.recovery_code_label')}
			>
				{#each recoveryCode.trim().split(/\s+/) as word, i}
					<li class="flex items-baseline gap-2 min-w-0">
						<span
							class="text-xs font-mono tabular-nums select-none shrink-0"
							style="color: var(--text-muted)"
							aria-hidden="true"
						>{String(i + 1).padStart(2, '0')}</span>
						<span class="font-mono text-base truncate" style="color: var(--text-primary)">{word}</span>
					</li>
				{/each}
			</ol>
		</div>
		<div class="grid grid-cols-2 gap-2 mb-4">
			<button
				type="button"
				on:click={downloadRecoveryPdf}
				class="btn-secondary px-4 min-h-[44px] flex items-center justify-center gap-2"
			>
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				<span class="truncate">{$t('auth.download_recovery_pdf')}</span>
			</button>
			<button
				type="button"
				on:click={copyRecovery}
				class="btn-secondary px-4 min-h-[44px] flex items-center justify-center gap-2"
			>
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2v-2m-6-4h8a2 2 0 002-2V5a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				<span class="truncate">{copied ? $t('common.copied') : $t('common.copy')}</span>
			</button>
		</div>
		<label class="flex items-center gap-3 mb-4 cursor-pointer min-h-[44px]">
			<input type="checkbox" bind:checked={acknowledged} data-testid="recovery-ack-checkbox" class="w-5 h-5 rounded" style="border-color: var(--border)" />
			<span class="text-sm" style="color: var(--text-secondary)">{$t('auth.recovery_confirm')}</span>
		</label>
		<button
			type="button"
			on:click={proceed}
			disabled={!acknowledged}
			data-testid="recovery-continue"
			class="btn-primary w-full px-4 min-h-[48px]"
		>
			{$t('auth.proceed')}
		</button>
	</div>
{/if}
