<script lang="ts">
	import { t, locale, locales, localeNames } from '$lib/i18n';
	import type { Locale } from '$lib/i18n';
	import { auth, isAuthenticated } from '$lib/stores/auth';
	import { documents } from '$lib/stores/documents';
	import { blueprint, hasBlueprint, presets } from '$lib/blueprint';
	import type { Blueprint, MedicationSlot } from '$lib/blueprint';
	import type { PresetInfo } from '$lib/blueprint';
	import { changePassword, deleteAccount } from '$lib/api';
	import { get } from 'svelte/store';
	import { deriveAuthKey, rewrapMasterKey } from '$lib/crypto';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import Asterisk from '$lib/components/Asterisk.svelte';
	import FamilySharing from '$lib/components/FamilySharing.svelte';
	import LinkedAccounts from '$lib/components/LinkedAccounts.svelte';
	import { iconPath } from '$lib/conditionIcons';

	$: currentPreset = bp ? presets.find(p => p.id === bp.conditionId) : null;

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

	// CIPH-411b — Medication editor state
	let medEditorOpen = false;
	let medEditingId: string | null = null;
	let medName = '';
	let medDose = '';
	let medSchedule = '';
	let medAsNeeded = false;

	function newMedId(): string {
		try {
			if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
				return crypto.randomUUID();
			}
		} catch { /* fallthrough */ }
		return `med-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
	}

	function resetMedForm() {
		medEditingId = null;
		medName = '';
		medDose = '';
		medSchedule = '';
		medAsNeeded = false;
	}

	function openAddMed() {
		resetMedForm();
		medEditorOpen = true;
	}

	function openEditMed(m: MedicationSlot) {
		medEditingId = m.id;
		medName = m.name;
		medDose = m.dose;
		medSchedule = m.schedule;
		medAsNeeded = m.asNeeded;
		medEditorOpen = true;
	}

	async function saveMed() {
		if (!bp) return;
		const name = medName.trim();
		const dose = medDose.trim();
		if (!name || !dose) return;
		const schedule = medSchedule.trim();
		const next: Blueprint = JSON.parse(JSON.stringify(bp));
		if (medEditingId) {
			const idx = next.medications.findIndex(m => m.id === medEditingId);
			if (idx >= 0) {
				next.medications[idx] = { id: medEditingId, name, dose, schedule, asNeeded: medAsNeeded };
			}
		} else {
			next.medications.push({ id: newMedId(), name, dose, schedule, asNeeded: medAsNeeded });
		}
		await blueprint.save(next);
		medEditorOpen = false;
		resetMedForm();
	}

	async function toggleMedAsNeeded(id: string) {
		if (!bp) return;
		const next: Blueprint = JSON.parse(JSON.stringify(bp));
		const m = next.medications.find(x => x.id === id);
		if (!m) return;
		m.asNeeded = !m.asNeeded;
		await blueprint.save(next);
	}

	async function deleteMed(id: string) {
		if (!bp) return;
		if (!confirm($t('settings.medication_delete_confirm'))) return;
		const next: Blueprint = JSON.parse(JSON.stringify(bp));
		next.medications = next.medications.filter(m => m.id !== id);
		await blueprint.save(next);
	}

	// Delete account state
	let showDeleteModal = false;
	let deletePassword = '';
	let deleteUsernameTyped = '';
	let deleteError = '';
	let deleteLoading = false;
	$: deleteUsernameMatches = deleteUsernameTyped.trim() === ($auth.username || '').trim() && !!$auth.username;

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
			const state = get(auth);
			if (!state.masterKey || !state.authParams) {
				passwordError = $t('auth.error_credentials');
				return;
			}
			// Prove current password by deriving its auth_key; re-wrap master_key for new password.
			const currentAuthKey = await deriveAuthKey(currentPassword, state.authParams);
			const wrap = await rewrapMasterKey(state.masterKey, newPassword);
			const res = await changePassword({
				current_auth_key: currentAuthKey,
				auth_hash: wrap.auth_hash,
				auth_params: wrap.auth_params,
				vault_params: wrap.vault_params,
				encrypted_master: wrap.encrypted_master,
			});
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
			const state = get(auth);
			if (!state.authParams) {
				deleteError = $t('auth.error_credentials');
				return;
			}
			const authKey = await deriveAuthKey(deletePassword, state.authParams);
			const res = await deleteAccount(authKey);
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

<div class="max-w-3xl mx-auto px-4 py-6 space-y-8">
	<h1 class="text-2xl font-bold" style="color: var(--text-primary)">{$t('nav.more')}</h1>

	<!-- ═══ Account section (profile + login identity) ═══ -->
	<section aria-labelledby="settings-account-heading" class="space-y-4">
		<h2 id="settings-account-heading" class="text-sm font-semibold uppercase tracking-wider" style="color: var(--text-muted)">{$t('settings.section_account')}</h2>

	<!-- Current profile -->
	{#if bp}
	<section class="card p-5">
		<h3 class="text-xs font-medium uppercase tracking-wider mb-3" style="color: var(--text-muted)">{$t('settings.current_profile')}</h3>
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
			{#if currentPreset}
				<div class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style="background: {currentPreset.color}15; color: {currentPreset.color}">
					<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d={iconPath(currentPreset.icon)} stroke-width="2"/></svg>
				</div>
			{:else}
				<div class="w-12 h-12 rounded-xl" style="background: {bp.accentColor}"></div>
			{/if}
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
		<h3 class="text-xs font-medium uppercase tracking-wider mb-3" style="color: var(--text-muted)">{$t('settings.appearance')}</h3>
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

	<!-- Quick switch (profile template) -->
	<section class="card p-5">
		<h3 class="text-xs font-medium uppercase tracking-wider mb-3" style="color: var(--text-muted)">{$t('settings.switch_template')}</h3>
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
					<div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style="background: {preset.color}15; color: {preset.color}">
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d={iconPath(preset.icon)} stroke-width="2"/></svg>
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

	</section>

	<!-- ═══ Sharing section ═══ -->
	<section aria-labelledby="settings-sharing-heading" class="space-y-4">
		<h2 id="settings-sharing-heading" class="text-sm font-semibold uppercase tracking-wider" style="color: var(--text-muted)">{$t('settings.section_sharing')}</h2>

	<!-- Family sharing — patient view -->
	<FamilySharing />

	<!-- Linked accounts — caregiver view -->
	<LinkedAccounts />

	</section>

	<!-- ═══ Medications section (CIPH-411b) ═══ -->
	{#if bp}
	<section aria-labelledby="settings-medications-heading" class="space-y-4">
		<h2 id="settings-medications-heading" class="text-sm font-semibold uppercase tracking-wider" style="color: var(--text-muted)">{$t('settings.section_medications')}</h2>

		<section class="card p-5">
			{#if bp.medications.length === 0}
				<p class="text-sm mb-4" style="color: var(--text-secondary)">{$t('settings.medications_empty')}</p>
			{:else}
				<ul class="space-y-2 mb-4">
					{#each bp.medications as med (med.id)}
						<li class="flex items-center gap-3 p-3 rounded-xl" style="background: var(--surface-muted); border: 1px solid var(--border)">
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium truncate" style="color: var(--text-primary)">{med.name}</p>
								<p class="text-xs mt-0.5 truncate" style="color: var(--text-secondary)">
									{med.dose}{med.schedule ? ' · ' + med.schedule : ''}{med.asNeeded ? ' · ' + $t('settings.medication_as_needed') : ''}
								</p>
							</div>
							<label class="flex items-center gap-1.5 text-xs cursor-pointer shrink-0" style="color: var(--text-muted)">
								<input
									type="checkbox"
									checked={med.asNeeded}
									on:change={() => toggleMedAsNeeded(med.id)}
									class="w-4 h-4"
									style="accent-color: var(--olive)"
								/>
								<span class="hidden sm:inline">{$t('settings.medication_as_needed')}</span>
							</label>
							<button
								type="button"
								on:click={() => openEditMed(med)}
								class="text-xs font-medium px-2 py-1.5 rounded-lg min-h-[36px]"
								style="color: var(--text-secondary); background: var(--surface-card); border: 1px solid var(--border)"
							>
								{$t('common.edit')}
							</button>
							<button
								type="button"
								on:click={() => deleteMed(med.id)}
								class="text-xs font-medium px-2 py-1.5 rounded-lg min-h-[36px]"
								style="color: var(--danger); background: rgba(220,38,38,0.05); border: 1px solid rgba(220,38,38,0.2)"
							>
								{$t('common.delete')}
							</button>
						</li>
					{/each}
				</ul>
			{/if}

			{#if !medEditorOpen}
				<button
					type="button"
					on:click={openAddMed}
					class="btn-secondary w-full rounded-xl text-sm font-medium min-h-[44px]"
				>
					{$t('settings.add_medication')}
				</button>
			{:else}
				<form on:submit|preventDefault={saveMed} class="space-y-3 p-4 rounded-xl" style="background: var(--surface-muted); border: 1px solid var(--border)">
					<h4 class="text-xs font-medium uppercase tracking-wider" style="color: var(--text-muted)">
						{medEditingId ? $t('settings.medication_edit_title') : $t('settings.add_medication')}
					</h4>
					<div>
						<label class="text-xs block mb-1" for="med-name" style="color: var(--text-secondary)">{$t('settings.medication_name')}</label>
						<input id="med-name" type="text" bind:value={medName} class="input" required />
					</div>
					<div>
						<label class="text-xs block mb-1" for="med-dose" style="color: var(--text-secondary)">{$t('settings.medication_dose')}</label>
						<input id="med-dose" type="text" bind:value={medDose} class="input" placeholder="10mg" required />
					</div>
					<div>
						<label class="text-xs block mb-1" for="med-schedule" style="color: var(--text-secondary)">{$t('settings.medication_schedule')}</label>
						<input id="med-schedule" type="text" bind:value={medSchedule} class="input" placeholder="morgens, abends" />
					</div>
					<label class="flex items-center gap-2 text-sm cursor-pointer" style="color: var(--text-primary)">
						<input type="checkbox" bind:checked={medAsNeeded} class="w-4 h-4" style="accent-color: var(--olive)" />
						{$t('settings.medication_as_needed')}
					</label>
					<div class="flex gap-3 pt-1">
						<button
							type="button"
							on:click={() => { medEditorOpen = false; resetMedForm(); }}
							class="btn-secondary flex-1 rounded-xl text-sm font-medium min-h-[44px]"
						>
							{$t('common.cancel')}
						</button>
						<button
							type="submit"
							disabled={!medName.trim() || !medDose.trim()}
							class="btn-primary flex-1 rounded-xl text-sm font-medium min-h-[44px]"
						>
							{$t('settings.medication_save')}
						</button>
					</div>
				</form>
			{/if}
		</section>
	</section>
	{/if}

	<!-- ═══ Data section ═══ -->
	<section aria-labelledby="settings-data-heading" class="space-y-4">
		<h2 id="settings-data-heading" class="text-sm font-semibold uppercase tracking-wider" style="color: var(--text-muted)">{$t('settings.section_data')}</h2>

	<!-- Data export -->
	<section class="card p-5">
		<h3 class="text-xs font-medium uppercase tracking-wider mb-3" style="color: var(--text-muted)">{$t('settings.export_data')}</h3>
		<p class="text-sm mb-4" style="color: var(--text-secondary)">{$t('settings.export_data_desc')}</p>
		<button
			on:click={exportAllData}
			class="w-full py-2.5 rounded-xl text-sm font-medium min-h-[44px] transition-colors text-white"
			style="background: var(--ochre)"
		>
			{$t('settings.export_button')}
		</button>
	</section>

	</section>

	<!-- ═══ Privacy & Security section ═══ -->
	<section aria-labelledby="settings-privacy-heading" class="space-y-4">
		<h2 id="settings-privacy-heading" class="text-sm font-semibold uppercase tracking-wider" style="color: var(--text-muted)">{$t('settings.section_privacy')}</h2>

	<!-- Account login info + password -->
	<section class="card p-5">
		<h3 class="text-xs font-medium uppercase tracking-wider mb-3" style="color: var(--text-muted)">{$t('settings.account')}</h3>
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

	</section>

	<!-- ═══ Danger zone — separated from other sections by extra margin + 2px border ═══ -->
	<hr style="border: none; border-top: 1px dashed var(--border); margin-top: 24px; margin-bottom: 8px;" aria-hidden="true" />
	<section aria-labelledby="settings-danger-heading" class="space-y-4" style="margin-top: 16px">
		<h2 id="settings-danger-heading" class="text-sm font-semibold uppercase tracking-wider" style="color: var(--danger)">{$t('settings.section_danger')}</h2>

	<!-- Delete account -->
	<section class="rounded-xl p-5" style="background: rgba(220,38,38,0.05); border: 2px solid var(--danger)">
		<h3 class="text-xs font-medium uppercase tracking-wider mb-1" style="color: var(--danger)">{$t('settings.delete_account')}</h3>
		<p class="text-sm mb-4" style="color: var(--danger); opacity: 0.8">{$t('settings.delete_account_warning')}</p>
		<button
			on:click={() => { showDeleteModal = true; deletePassword = ''; deleteUsernameTyped = ''; deleteError = ''; }}
			class="w-full py-2.5 text-white rounded-xl text-sm font-medium min-h-[44px] transition-colors"
			style="background: var(--danger)"
		>
			{$t('settings.delete_account')}
		</button>
	</section>

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
		<p class="text-xs mb-2" style="color: var(--text-secondary)">
			{$t('settings.delete_type_to_confirm', { username: $auth.username || '' })}
		</p>
		<input
			type="text"
			bind:value={deleteUsernameTyped}
			placeholder={$t('settings.delete_username_placeholder')}
			autocomplete="off"
			autocapitalize="off"
			autocorrect="off"
			spellcheck="false"
			class="w-full px-4 py-2.5 min-h-[44px] rounded-xl text-sm mb-3 outline-none"
			style="background: var(--surface-muted); border: 1px solid var(--border); color: var(--text-primary)"
		/>
		<input
			type="password"
			bind:value={deletePassword}
			placeholder={$t('auth.password')}
			disabled={!deleteUsernameMatches}
			class="w-full px-4 py-2.5 min-h-[44px] rounded-xl text-sm mb-3 outline-none disabled:opacity-50"
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
				disabled={deleteLoading || !deletePassword || !deleteUsernameMatches}
				class="flex-1 py-2.5 text-white rounded-xl text-sm font-medium min-h-[44px] disabled:opacity-50"
				style="background: var(--danger)"
			>
				{$t('settings.delete_account')}
			</button>
		</div>
	</div>
</div>
{/if}
