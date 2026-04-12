<script lang="ts">
	import { t, locale, locales, localeNames } from '$lib/i18n';
	import type { Locale } from '$lib/i18n';
	import { auth, isAuthenticated } from '$lib/stores/auth';
	import { documents } from '$lib/stores/documents';
	import { blueprint, hasBlueprint, presets } from '$lib/blueprint';
	import type { Blueprint } from '$lib/blueprint';
	import type { PresetInfo } from '$lib/blueprint';
	import { changePassword, deleteAccount } from '$lib/api';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import Asterisk from '$lib/components/Asterisk.svelte';

	let showConfirmSwitch = false;
	let selectedPreset: PresetInfo | null = null;

	// Change password state
	let showChangePassword = false;
	let currentPassword = '';
	let newPassword = '';
	let confirmNewPassword = '';
	let passwordError = '';
	let passwordSuccess = false;
	let passwordLoading = false;

	// Delete account state
	let showDeleteModal = false;
	let deletePassword = '';
	let deleteError = '';
	let deleteLoading = false;

	onMount(() => {
		if (!$isAuthenticated) goto('/login');
		documents.load();
	});

	$: bp = $blueprint;

	function startSwitch(preset: PresetInfo) {
		selectedPreset = preset;
		showConfirmSwitch = true;
	}

	async function confirmSwitch() {
		if (!selectedPreset) return;
		const newBp = JSON.parse(JSON.stringify(selectedPreset.blueprint));
		await blueprint.save(newBp);
		showConfirmSwitch = false;
		selectedPreset = null;
	}

	function goToSetup() {
		goto('/setup');
	}

	function handleLogout() {
		auth.logout();
		goto('/login');
	}

	async function handleChangePassword() {
		passwordError = '';
		passwordSuccess = false;

		if (newPassword !== confirmNewPassword) {
			passwordError = $t('auth.error_password_match');
			return;
		}
		if (newPassword.length < 8) {
			passwordError = $t('auth.error_password_short');
			return;
		}

		passwordLoading = true;
		try {
			const res = await changePassword(currentPassword, newPassword);
			if (res.ok) {
				passwordSuccess = true;
				currentPassword = '';
				newPassword = '';
				confirmNewPassword = '';
				setTimeout(() => {
					auth.logout();
					goto('/login');
				}, 1500);
			} else {
				passwordError = (res.data?.error as string) || $t('auth.error_credentials');
			}
		} catch {
			passwordError = $t('auth.error_credentials');
		} finally {
			passwordLoading = false;
		}
	}

	function exportAllData() {
		const data = {
			exportedAt: new Date().toISOString(),
			documentCount: $documents.length,
			documents: $documents.map(d => ({
				id: d.id,
				data: d.data,
				serverCreatedAt: d.serverCreatedAt
			}))
		};
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `ciphra-export-${new Date().toISOString().slice(0, 10)}.json`;
		link.click();
		URL.revokeObjectURL(url);
	}

	async function handleDeleteAccount() {
		deleteError = '';
		if (!deletePassword) return;

		deleteLoading = true;
		try {
			const res = await deleteAccount(deletePassword);
			if (res.ok) {
				auth.logout();
				documents.clear();
				blueprint.clear();
				goto('/login');
			} else {
				deleteError = (res.data?.error as string) || $t('auth.error_credentials');
			}
		} catch {
			deleteError = $t('auth.error_credentials');
		} finally {
			deleteLoading = false;
		}
	}
</script>

<div class="max-w-3xl mx-auto px-4 py-6 space-y-6">
	<h1 class="text-2xl font-bold" style="color: var(--text-primary)">{$t('nav.more')}</h1>

	<!-- Current profile -->
	{#if bp}
	<section class="card p-5">
		<h2 class="text-xs font-medium uppercase tracking-wider mb-3" style="color: var(--text-muted)">{$t('settings.current_profile')}</h2>
		<div class="flex items-center justify-between">
			<div>
				<div class="flex items-center gap-2">
					<p class="text-lg font-semibold" style="color: var(--text-primary)">{bp.conditionLabel ? $t(bp.conditionLabel) : bp.conditionId}</p>
					<span class="badge badge-olive">{bp.conditionId}</span>
				</div>
				<p class="text-sm mt-0.5" style="color: var(--text-secondary)">
					{$t('settings.symptoms_count', { count: String(bp.symptomGroups.reduce((n, g) => n + g.items.length, 0)) })} ·
					{$t('settings.episode_types_count', { count: String(bp.episodeTypes.length) })} ·
					{$t('settings.triggers_count', { count: String(bp.triggers.length) })} ·
					{$t('settings.vitals_count', { count: String(bp.vitals.length) })}
				</p>
			</div>
			<div class="w-10 h-10 rounded-xl" style="background: {bp.accentColor}"></div>
		</div>
		<button
			on:click={goToSetup}
			class="btn-secondary mt-4 w-full rounded-xl text-sm font-medium min-h-[44px]"
		>
			{$t('settings.customize_profile')}
		</button>
	</section>
	{/if}

	<!-- Language & Appearance -->
	<section class="card p-5">
		<h2 class="text-xs font-medium uppercase tracking-wider mb-3" style="color: var(--text-muted)">{$t('settings.appearance')}</h2>
		<div class="space-y-4">
			<div>
				<label class="text-sm mb-1.5 block" style="color: var(--text-secondary)">{$t('common.language')}</label>
				<select
					class="input cursor-pointer"
					value={$locale}
					on:change={(e) => locale.set(e.currentTarget.value)}
				>
					{#each locales as l}
						<option value={l}>{localeNames[l]}</option>
					{/each}
				</select>
			</div>
		</div>
	</section>

	<!-- Quick switch -->
	<section class="card p-5">
		<h2 class="text-xs font-medium uppercase tracking-wider mb-3" style="color: var(--text-muted)">{$t('settings.switch_template')}</h2>
		<p class="text-sm mb-4" style="color: var(--text-secondary)">{$t('settings.switch_description')}</p>
		<div class="grid gap-2">
			{#each presets as preset}
				<button
					on:click={() => startSwitch(preset)}
					disabled={bp?.conditionId === preset.id}
					class="w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl transition-colors min-h-[48px]"
					style="{bp?.conditionId === preset.id
						? 'border: 1px solid rgba(127,130,27,0.3); background: var(--olive-light)'
						: 'border: 1px solid var(--border); background: var(--surface-card)'}"
				>
					<div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: {preset.color}15">
						<div class="w-3 h-3 rounded-full" style="background: {preset.color}"></div>
					</div>
					<div class="flex-1">
						<span class="text-sm font-medium" style="color: var(--text-primary)">{$t(preset.labelKey)}</span>
						{#if bp?.conditionId === preset.id}
							<span class="text-xs ml-2" style="color: var(--olive)">{$t('settings.active')}</span>
						{/if}
					</div>
				</button>
			{/each}
		</div>
	</section>

	<!-- Data export -->
	<section class="card p-5">
		<h2 class="text-xs font-medium uppercase tracking-wider mb-3" style="color: var(--text-muted)">{$t('settings.export_data')}</h2>
		<p class="text-sm mb-4" style="color: var(--text-secondary)">{$t('settings.export_data_desc')}</p>
		<button
			on:click={exportAllData}
			class="w-full py-2.5 rounded-xl text-sm font-medium min-h-[44px] transition-colors text-white"
			style="background: var(--ochre)"
		>
			{$t('settings.export_button')}
		</button>
	</section>

	<!-- Account -->
	<section class="card p-5">
		<h2 class="text-xs font-medium uppercase tracking-wider mb-3" style="color: var(--text-muted)">{$t('settings.account')}</h2>
		<div class="space-y-2">
			<div class="flex items-center justify-between py-2">
				<span class="text-sm" style="color: var(--text-secondary)">{$t('settings.logged_in_as')}</span>
				<span class="text-sm font-medium" style="color: var(--text-primary)">{$auth.username}</span>
			</div>
			<div class="flex items-center justify-between py-2">
				<span class="text-sm" style="color: var(--text-secondary)">{$t('settings.encryption')}</span>
				<span class="badge badge-olive">AES-256-GCM + Argon2id</span>
			</div>
		</div>

		<!-- Change password -->
		<div class="mt-4">
			{#if !showChangePassword}
				<button
					on:click={() => { showChangePassword = true; }}
					class="btn-secondary w-full rounded-xl text-sm font-medium min-h-[44px]"
				>
					{$t('settings.change_password')}
				</button>
			{:else}
				<form on:submit|preventDefault={handleChangePassword} class="space-y-3">
					<input
						type="password"
						bind:value={currentPassword}
						placeholder={$t('settings.current_password')}
						class="input"
						required
					/>
					<input
						type="password"
						bind:value={newPassword}
						placeholder={$t('settings.new_password')}
						class="input"
						required
					/>
					<input
						type="password"
						bind:value={confirmNewPassword}
						placeholder={$t('settings.confirm_new_password')}
						class="input"
						required
					/>
					{#if passwordError}
						<p class="text-sm" style="color: var(--danger)">{passwordError}</p>
					{/if}
					{#if passwordSuccess}
						<p class="text-sm" style="color: var(--success)">{$t('settings.password_changed')}</p>
					{/if}
					<div class="flex gap-3">
						<button
							type="button"
							on:click={() => { showChangePassword = false; passwordError = ''; passwordSuccess = false; currentPassword = ''; newPassword = ''; confirmNewPassword = ''; }}
							class="btn-secondary flex-1 rounded-xl text-sm font-medium min-h-[44px]"
						>
							{$t('common.cancel')}
						</button>
						<button
							type="submit"
							disabled={passwordLoading}
							class="btn-primary flex-1 rounded-xl text-sm font-medium min-h-[44px]"
						>
							{$t('common.save')}
						</button>
					</div>
				</form>
			{/if}
		</div>

		<button
			on:click={handleLogout}
			class="mt-4 w-full py-2.5 rounded-xl text-sm font-medium min-h-[44px] transition-colors"
			style="background: rgba(220,38,38,0.05); color: var(--danger)"
		>
			{$t('auth.logout')}
		</button>
	</section>

	<!-- Delete account -->
	<section class="rounded-xl p-5" style="background: rgba(220,38,38,0.05); border: 1px solid rgba(220,38,38,0.2)">
		<h2 class="text-xs font-medium uppercase tracking-wider mb-1" style="color: var(--danger)">{$t('settings.delete_account')}</h2>
		<p class="text-sm mb-4" style="color: var(--danger); opacity: 0.8">{$t('settings.delete_account_warning')}</p>
		<button
			on:click={() => { showDeleteModal = true; deletePassword = ''; deleteError = ''; }}
			class="w-full py-2.5 text-white rounded-xl text-sm font-medium min-h-[44px] transition-colors"
			style="background: var(--danger)"
		>
			{$t('settings.delete_account')}
		</button>
	</section>

	<!-- E2E badge -->
	<div class="flex items-center justify-center gap-2 py-4">
		<Asterisk size={14} color="muted" />
		<span class="text-xs" style="color: var(--text-muted)">{$t('encryption.badge')}</span>
	</div>
</div>

<!-- Confirm switch modal -->
{#if showConfirmSwitch && selectedPreset}
<div class="fixed inset-0 z-50 flex items-center justify-center p-4" style="background: rgba(0,0,0,0.4); backdrop-filter: blur(4px)" on:click|self={() => { showConfirmSwitch = false; }}>
	<div class="rounded-2xl p-6 max-w-sm w-full" style="background: var(--surface-card); border: 1px solid var(--border); box-shadow: 0 25px 50px -12px rgba(44,37,32,0.15)">
		<h3 class="text-lg font-semibold mb-2" style="color: var(--text-primary)">{$t('settings.switch_confirm_title')}</h3>
		<p class="text-sm mb-4" style="color: var(--text-secondary)">
			{$t('settings.switch_confirm_text', { name: $t(selectedPreset.labelKey) })}
		</p>
		<div class="flex gap-3">
			<button
				on:click={() => { showConfirmSwitch = false; }}
				class="btn-secondary flex-1 rounded-xl text-sm font-medium min-h-[44px]"
			>
				{$t('common.cancel')}
			</button>
			<button
				on:click={confirmSwitch}
				class="btn-primary flex-1 rounded-xl text-sm font-medium min-h-[44px]"
			>
				{$t('settings.switch_button')}
			</button>
		</div>
	</div>
</div>
{/if}

<!-- Delete account modal -->
{#if showDeleteModal}
<div class="fixed inset-0 z-50 flex items-center justify-center p-4" style="background: rgba(0,0,0,0.4); backdrop-filter: blur(4px)" on:click|self={() => { showDeleteModal = false; }}>
	<div class="rounded-2xl p-6 max-w-sm w-full" style="background: var(--surface-card); border: 1px solid var(--border); box-shadow: 0 25px 50px -12px rgba(44,37,32,0.15)">
		<h3 class="text-lg font-semibold mb-2" style="color: var(--danger)">{$t('settings.delete_account')}</h3>
		<p class="text-sm mb-4" style="color: var(--text-secondary)">
			{$t('settings.delete_confirm_text')}
		</p>
		<input
			type="password"
			bind:value={deletePassword}
			placeholder={$t('auth.password')}
			class="w-full px-4 py-2.5 min-h-[44px] rounded-xl text-sm mb-3 outline-none"
			style="background: var(--surface-muted); border: 1px solid var(--border); color: var(--text-primary)"
		/>
		{#if deleteError}
			<p class="text-sm mb-3" style="color: var(--danger)">{deleteError}</p>
		{/if}
		<div class="flex gap-3">
			<button
				on:click={() => { showDeleteModal = false; }}
				class="btn-secondary flex-1 rounded-xl text-sm font-medium min-h-[44px]"
			>
				{$t('common.cancel')}
			</button>
			<button
				on:click={handleDeleteAccount}
				disabled={deleteLoading || !deletePassword}
				class="flex-1 py-2.5 text-white rounded-xl text-sm font-medium min-h-[44px] disabled:opacity-50"
				style="background: var(--danger)"
			>
				{$t('settings.delete_account')}
			</button>
		</div>
	</div>
</div>
{/if}
