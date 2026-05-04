<script lang="ts">
	import { t, locale, locales, localeNames } from '$lib/i18n';
	import type { Locale } from '$lib/i18n';
	import { auth, isAuthenticated } from '$lib/stores/auth';
	import { documents } from '$lib/stores/documents';
	import { blueprint, hasBlueprint, presets, resolvedBlueprint, isCustomItem } from '$lib/blueprint';
	import {
		applyDateFormatChoice,
		applyPrimarySurfaceChoice,
		type DateFormatChoice,
		type PrimarySurfaceChoice,
	} from '$lib/blueprint/preferences';
	import type {
		Blueprint,
		BlueprintItem,
		CustomSymptomItem,
		EpisodeType,
		MedicationSlot,
		VitalField,
	} from '$lib/blueprint';
	import type { PresetInfo, CustomKind } from '$lib/blueprint';
	import CustomItemModal from '$lib/components/CustomItemModal.svelte';
	import { changePassword, deleteAccount } from '$lib/api';
	import { get } from 'svelte/store';
	import { deriveAuthKey, rewrapMasterKey } from '$lib/crypto';
	import PasswordField from '$lib/components/PasswordField.svelte';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import FamilySharing from '$lib/components/FamilySharing.svelte';
	import LinkedAccounts from '$lib/components/LinkedAccounts.svelte';
	import Tabs from '$lib/components/Tabs.svelte';
	import { iconPath } from '$lib/conditionIcons';
	import { page } from '$app/stores';
	import { getCohort } from '$lib/blueprint/cohort';

	$: currentPreset = bp ? presets.find(p => p.id === bp.conditionId) : null;

	// CIPH-857 — tab query param (?tab=account|tracking|sharing). Default: account.
	type SettingsTab = 'account' | 'tracking' | 'sharing';
	const VALID_TABS: SettingsTab[] = ['account', 'tracking', 'sharing'];
	$: tab = (VALID_TABS.includes(($page.url.searchParams.get('tab') ?? '') as SettingsTab)
		? ($page.url.searchParams.get('tab') as SettingsTab)
		: 'account') as SettingsTab;

	function selectTab(id: string) {
		const url = new URL($page.url);
		if (id === 'account') url.searchParams.delete('tab');
		else url.searchParams.set('tab', id);
		goto(url.pathname + (url.search ? url.search : ''), { replaceState: true, noScroll: true });
	}

	$: tabList = [
		{ id: 'account', label: $t('settings.tab_account') },
		{ id: 'tracking', label: $t('settings.tab_tracking') },
		{ id: 'sharing', label: $t('settings.tab_sharing') },
	];

	// CIPH-852 — primaryBrowseSurface override. Discriminator helper lives
	// in $lib/blueprint/preferences.ts (CIPH-pi18-3 added the test).
	async function setPrimarySurface(value: PrimarySurfaceChoice) {
		if (!bp) return;
		await blueprint.save(applyPrimarySurfaceChoice(bp, value));
	}
	function onSurfaceChange(e: Event) {
		const target = e.currentTarget as HTMLSelectElement;
		setPrimarySurface(target.value as PrimarySurfaceChoice);
	}

	// For the <select>: 'auto' when the field is missing, otherwise the value.
	$: currentSurfaceChoice = bp?.primaryBrowseSurface ?? 'auto';
	$: cohortDefault = bp ? getCohort(bp.conditionId) : 'custom';

	// CIPH-pi18-3 — DatePicker display format. Lives in the Appearance
	// section of the Account tab — it's a display preference, not a
	// tracking preference (Jonas dry-run #1).
	async function setDateFormat(value: DateFormatChoice) {
		if (!bp) return;
		await blueprint.save(applyDateFormatChoice(bp, value));
	}
	function onDateFormatChange(e: Event) {
		const target = e.currentTarget as HTMLSelectElement;
		setDateFormat(target.value as DateFormatChoice);
	}
	$: currentDateFormat = bp?.dateFormat ?? 'dd.mm.yyyy';

	// Today's date rendered in each format — used as live option labels so
	// the user sees the actual SHAPE rather than a fixed "31.05.2026" sample.
	// Recomputed on locale change so the page stays fresh through the day.
	function sampleDate(format: DateFormatChoice): string {
		const now = new Date();
		const y = now.getFullYear();
		const m = String(now.getMonth() + 1).padStart(2, '0');
		const d = String(now.getDate()).padStart(2, '0');
		switch (format) {
			case 'dd/mm/yyyy': return `${d}/${m}/${y}`;
			case 'iso': return `${y}-${m}-${d}`;
			case 'us': return `${m}/${d}/${y}`;
			case 'dd.mm.yyyy':
			default: return `${d}.${m}.${y}`;
		}
	}

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

	// CIPH-882 — Custom blueprint items: add/edit/hide/delete
	const CUSTOM_SECTIONS: ReadonlyArray<{ kind: CustomKind; titleKey: string; addKey: string }> = [
		{ kind: 'symptom', titleKey: 'customization.section_custom_symptoms', addKey: 'customization.add_symptom' },
		{ kind: 'trigger', titleKey: 'customization.section_custom_triggers', addKey: 'customization.add_trigger' },
		{ kind: 'vital', titleKey: 'customization.section_custom_vitals', addKey: 'customization.add_vital' },
		{ kind: 'episode', titleKey: 'customization.section_custom_episodes', addKey: 'customization.add_episode' },
	];
	let customModalOpen = false;
	let customModalKind: CustomKind = 'symptom';
	let customModalEditing:
		| CustomSymptomItem
		| BlueprintItem
		| VitalField
		| EpisodeType
		| null = null;

	function openCustomModal(kind: CustomKind, editing: typeof customModalEditing = null) {
		customModalKind = kind;
		customModalEditing = editing;
		customModalOpen = true;
	}
	function closeCustomModal() {
		customModalOpen = false;
		customModalEditing = null;
	}

	async function handleCustomSave(
		event: CustomEvent<
			| { kind: 'symptom'; item: CustomSymptomItem }
			| { kind: 'trigger'; item: BlueprintItem }
			| { kind: 'vital'; item: VitalField }
			| { kind: 'episode'; item: EpisodeType }
		>,
	) {
		if (!bp) return;
		const { kind, item } = event.detail;
		const next: Blueprint = JSON.parse(JSON.stringify(bp));
		const cz = next.customizations || (next.customizations = {});
		const arrayKey = (
			{
				symptom: 'customSymptoms',
				trigger: 'customTriggers',
				vital: 'customVitals',
				episode: 'customEpisodes',
			} as const
		)[kind];
		const arr = (cz[arrayKey] = (cz[arrayKey] || []) as never[]);
		const existing = (arr as { id: string }[]).findIndex((x) => x.id === item.id);
		if (existing >= 0) {
			(arr as unknown as { id: string }[])[existing] = item as never;
		} else {
			(arr as unknown as { id: string }[]).push(item as never);
		}
		await blueprint.save(next);
		closeCustomModal();
	}

	async function toggleCustomHidden(kind: CustomKind, id: string) {
		if (!bp) return;
		// Episodes are not part of `Blueprint.customizations.hidden*`
		// (CIPH-301b schema covers symptoms / triggers / vitals only).
		// The template guards the affordance — defensive guard here too.
		if (kind === 'episode') return;
		const next: Blueprint = JSON.parse(JSON.stringify(bp));
		const cz = next.customizations || (next.customizations = {});
		const hideKey = (
			{
				symptom: 'hiddenSymptoms',
				trigger: 'hiddenTriggers',
				vital: 'hiddenVitals',
			} as const
		)[kind];
		const list = ((cz as Record<string, string[] | undefined>)[hideKey] = (
			(cz as Record<string, string[] | undefined>)[hideKey] || []
		) as string[]);
		const idx = list.indexOf(id);
		if (idx >= 0) list.splice(idx, 1);
		else list.push(id);
		await blueprint.save(next);
	}

	function isCustomHidden(kind: CustomKind, id: string): boolean {
		if (!bp?.customizations) return false;
		if (kind === 'symptom') return (bp.customizations.hiddenSymptoms || []).includes(id);
		if (kind === 'trigger') return (bp.customizations.hiddenTriggers || []).includes(id);
		if (kind === 'vital') return (bp.customizations.hiddenVitals || []).includes(id);
		return false;
	}

	async function deleteCustom(kind: CustomKind, item: { id: string; label: string }) {
		if (!bp) return;
		const msg = $t('customization.delete_confirm_title', { label: item.label }) +
			'\n\n' + $t('customization.delete_confirm_body');
		if (!confirm(msg)) return;
		const next: Blueprint = JSON.parse(JSON.stringify(bp));
		const cz = next.customizations || (next.customizations = {});
		const arrayKey = (
			{
				symptom: 'customSymptoms',
				trigger: 'customTriggers',
				vital: 'customVitals',
				episode: 'customEpisodes',
			} as const
		)[kind];
		const arr = (cz as Record<string, { id: string }[] | undefined>)[arrayKey];
		if (arr) {
			(cz as Record<string, { id: string }[]>)[arrayKey] = arr.filter((x) => x.id !== item.id);
		}
		// Strip from hide lists too — orphan ids would be confusing if the
		// user re-adds an item with the same label later (it will get a
		// fresh id but a leftover hide entry would do nothing).
		for (const k of ['hiddenSymptoms', 'hiddenTriggers', 'hiddenVitals'] as const) {
			const list = (cz as Record<string, string[] | undefined>)[k];
			if (list) (cz as Record<string, string[]>)[k] = list.filter((x) => x !== item.id);
		}
		// Strip from grid columns so deleted symptoms / episodes don't
		// reserve a column in PDF / report grids.
		next.gridSymptomColumns = next.gridSymptomColumns.filter((x) => x !== item.id);
		next.gridEpisodeColumns = next.gridEpisodeColumns.filter((x) => x !== item.id);
		await blueprint.save(next);
	}

	function customsForKind(kind: CustomKind): { id: string; label: string }[] {
		if (!bp?.customizations) return [];
		if (kind === 'symptom') return bp.customizations.customSymptoms || [];
		if (kind === 'trigger') return bp.customizations.customTriggers || [];
		if (kind === 'vital') return bp.customizations.customVitals || [];
		return bp.customizations.customEpisodes || [];
	}

	/** Type-narrowing helper: when section.kind is 'episode' the item
	 *  has a .color field (it's an EpisodeType). Inline type assertions
	 *  aren't valid in Svelte templates so this stays in the script. */
	function episodeColor(item: { id: string; label: string }): string {
		return (item as EpisodeType).color || '#5c6b73';
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

	// Settings reads BOTH stores: `bp` is the raw blueprint (so the
	// per-section custom-item lists can mutate `bp.customizations.custom*`
	// and persist via `blueprint.save(bp)`); `bpResolved` is the merged
	// view used for any count or rendering that should include user-added
	// items (profile card stats, etc.).
	$: bp = $blueprint;
	$: bpResolved = $resolvedBlueprint;

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
		// CIPH-874 — "Profil anpassen" is fine-tuning (symptom/trigger/vital
		// toggles), NOT a preset change. The `?customize=1` param makes
		// /setup skip the preset-picker step for users who already have a
		// blueprint. Switching preset happens via the "Vorlage wechseln"
		// list lower on this tab.
		goto('/setup?customize=1');
	}

	async function handleLogout() {
		await auth.logout();
		goto('/login');
	}

	async function handleChangePassword() {
		passwordError = '';
		passwordSuccess = false;

		if (newPassword !== confirmNewPassword) {
			passwordError = $t('auth.error_password_match');
			return;
		}
		// Security review (PI v13): change-password floor 8 → 12 to
		// match new-account creation. Existing accounts at 8 chars
		// keep working until they choose to rotate.
		if (newPassword.length < 12) {
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
				setTimeout(async () => {
					await auth.logout();
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

<div class="layout-default py-6 space-y-6">
	<h1 id="settings-heading" class="text-2xl font-bold" style="color: var(--text-primary)">{$t('nav.more')}</h1>

	<!-- CIPH-857 — Tabs: Account / Tracking / Sharing -->
	<Tabs
		tabs={tabList}
		current={tab}
		onSelect={selectTab}
		labelledBy="settings-heading"
		ariaLabel={$t('settings.tabs_label')}
	/>

	<!-- ═══════════════════ ACCOUNT TAB ═══════════════════ -->
	{#if tab === 'account'}
	<div role="tabpanel" id="tabpanel-account" aria-labelledby="tab-account" class="space-y-4">

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
					<PasswordField
						bind:value={currentPassword}
						placeholder={$t('settings.current_password')}
						class="input"
						required
					/>
					<PasswordField
						bind:value={newPassword}
						placeholder={$t('settings.new_password')}
						autocomplete="new-password"
						class="input"
						required
					/>
					<PasswordField
						bind:value={confirmNewPassword}
						placeholder={$t('settings.confirm_new_password')}
						autocomplete="new-password"
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
			class="mt-4 w-full py-2 rounded-xl text-sm font-medium min-h-[44px] transition-colors"
			style="background: rgba(220,38,38,0.05); color: var(--danger)"
		>
			{$t('auth.logout')}
		</button>
	</section>

	<!-- Language & Appearance -->
	<section class="card p-5">
		<h3 class="text-xs font-medium uppercase tracking-wider mb-3" style="color: var(--text-muted)">{$t('settings.appearance')}</h3>
		<div class="space-y-4">
			<div>
				<label class="text-sm mb-1.5 block" style="color: var(--text-secondary)" for="settings-language-select">{$t('common.language')}</label>
				<select
					id="settings-language-select"
					class="input cursor-pointer"
					value={$locale}
					on:change={(e) => locale.set(e.currentTarget.value)}
				>
					{#each locales as l}
						<option value={l}>{localeNames[l]}</option>
					{/each}
				</select>
			</div>

			{#if bp}
			<!-- CIPH-pi18-3 — DatePicker display format. Folded into Appearance
				 because it's a display preference, alongside language. Live
				 sample dates so the user sees the actual SHAPE on switch. -->
			<div>
				<label class="text-sm mb-1.5 block" style="color: var(--text-secondary)" for="date-format-select">{$t('settings.date_format_title')}</label>
				<p class="text-xs mb-1.5" style="color: var(--text-muted)">{$t('settings.date_format_desc')}</p>
				<select
					id="date-format-select"
					class="input cursor-pointer"
					value={currentDateFormat}
					on:change={onDateFormatChange}
				>
					<option value="dd.mm.yyyy">{sampleDate('dd.mm.yyyy')}</option>
					<option value="dd/mm/yyyy">{sampleDate('dd/mm/yyyy')}</option>
					<option value="iso">{sampleDate('iso')} (ISO 8601)</option>
					<option value="us">{sampleDate('us')}</option>
				</select>
			</div>
			{/if}
		</div>
	</section>

	<!-- Danger zone — kept in Account tab because account-deletion is
		 conceptually "end of my account", and users look here for logout. -->
	<hr style="border: none; border-top: 1px dashed var(--border); margin-top: 24px; margin-bottom: 8px;" aria-hidden="true" />
	<section aria-labelledby="settings-danger-heading" class="space-y-4" style="margin-top: 16px">
		<h2 id="settings-danger-heading" class="text-sm font-semibold uppercase tracking-wider" style="color: var(--danger)">{$t('settings.section_danger')}</h2>

		<section class="rounded-xl p-5" style="background: rgba(220,38,38,0.05); border: 2px solid var(--danger)">
			<h3 class="text-xs font-medium uppercase tracking-wider mb-1" style="color: var(--danger)">{$t('settings.delete_account')}</h3>
			<p class="text-sm mb-4" style="color: var(--danger); opacity: 0.8">{$t('settings.delete_account_warning')}</p>
			<button
				on:click={() => { showDeleteModal = true; deletePassword = ''; deleteUsernameTyped = ''; deleteError = ''; }}
				class="w-full py-2 text-white rounded-xl text-sm font-medium min-h-[44px] transition-colors"
				style="background: var(--danger)"
			>
				{$t('settings.delete_account')}
			</button>
		</section>
	</section>

	</div>
	{/if}

	<!-- ═══════════════════ TRACKING TAB ═══════════════════ -->
	{#if tab === 'tracking'}
	<div role="tabpanel" id="tabpanel-tracking" aria-labelledby="tab-tracking" class="space-y-4">

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
					{$t('settings.symptoms_count', { count: String((bpResolved ?? bp).symptomGroups.reduce((n, g) => n + g.items.length, 0)) })} ·
					{$t('settings.episode_types_count', { count: String((bpResolved ?? bp).episodeTypes.length) })} ·
					{$t('settings.triggers_count', { count: String((bpResolved ?? bp).triggers.length) })} ·
					{$t('settings.vitals_count', { count: String((bpResolved ?? bp).vitals.length) })}
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

	<!-- Medications (CIPH-411b) — moved up to right after Profile so people
		 find it without scrolling past customizations / primary-surface /
		 template-switcher. User feedback 2026-05-04. -->
	{#if bp}
	<section aria-labelledby="settings-medications-heading" class="space-y-3">
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
						<input id="med-schedule" type="text" bind:value={medSchedule} class="input" placeholder={$t('setup.med_schedule_placeholder')} />
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

	<!-- CIPH-882 — Custom blueprint items (per-kind sections). Sits above
	     the Profil-anpassen / template-switcher blocks so users discover
	     additive customization before navigating away. Episodes have no
	     hide-toggle (they're not part of the pre-301b hide-filter set);
	     all four kinds share the same delete affordance. -->
	{#if bp}
	{#each CUSTOM_SECTIONS as section}
		{@const items = customsForKind(section.kind)}
		<section class="card p-5">
			<div class="flex items-center justify-between mb-3">
				<h3 class="text-xs font-medium uppercase tracking-wider" style="color: var(--text-muted)">{$t(section.titleKey)}</h3>
				<button
					type="button"
					class="btn-secondary text-sm font-medium px-3 py-2 min-h-[40px]"
					on:click={() => openCustomModal(section.kind)}
					data-testid="add-custom-{section.kind}"
				>
					+ {$t(section.addKey)}
				</button>
			</div>
			{#if items.length === 0}
				<p class="text-sm" style="color: var(--text-muted)">{$t('customization.empty')}</p>
			{:else}
				<ul class="space-y-2">
					{#each items as item (item.id)}
						<li class="flex items-center justify-between gap-3 p-3 rounded-lg" style="background: var(--surface-muted)">
							<div class="flex items-center gap-2 flex-1 min-w-0">
								{#if section.kind === 'episode'}
									<span class="w-3 h-3 rounded-full shrink-0" style="background: {episodeColor(item)}"></span>
								{/if}
								<span class="text-sm truncate" style="color: var(--text-primary); {isCustomHidden(section.kind, item.id) ? 'opacity: 0.5; text-decoration: line-through;' : ''}">{item.label}</span>
							</div>
							<div class="flex items-center gap-1 shrink-0">
								<!-- Episodes intentionally have no Hide toggle: the
									`Blueprint.customizations.hidden*` schema (CIPH-301b)
									covers symptoms / triggers / vitals only — preset
									episodes are not user-hideable either, so adding a
									hide affordance just for *custom* episodes would be
									inconsistent. Delete is the only removal action. -->
								{#if section.kind !== 'episode'}
									<button
										type="button"
										class="text-xs px-2 py-1 rounded min-h-[36px]"
										style="color: var(--text-secondary); background: var(--surface-card); border: 1px solid var(--border)"
										on:click={() => toggleCustomHidden(section.kind, item.id)}
										data-testid="toggle-custom-{section.kind}-{item.id}"
									>
										{isCustomHidden(section.kind, item.id) ? $t('common.show') : $t('common.hide')}
									</button>
								{/if}
								<button
									type="button"
									class="text-xs px-2 py-1 rounded min-h-[36px]"
									style="color: var(--text-secondary); background: var(--surface-card); border: 1px solid var(--border)"
									on:click={() => openCustomModal(section.kind, item)}
									data-testid="edit-custom-{section.kind}-{item.id}"
								>
									{$t('common.edit')}
								</button>
								<button
									type="button"
									class="text-xs px-2 py-1 rounded min-h-[36px]"
									style="color: var(--brand); background: var(--surface-card); border: 1px solid var(--border)"
									on:click={() => deleteCustom(section.kind, item)}
									data-testid="delete-custom-{section.kind}-{item.id}"
								>
									{$t('common.delete')}
								</button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/each}
	{/if}

	<CustomItemModal
		open={customModalOpen}
		kind={customModalKind}
		editing={customModalEditing}
		groups={bp?.symptomGroups ?? []}
		on:save={handleCustomSave}
		on:close={closeCustomModal}
	/>

	<!-- CIPH-852 — Home layout / primary browse surface override -->
	{#if bp}
	<section class="card p-5">
		<h3 class="text-xs font-medium uppercase tracking-wider mb-2" style="color: var(--text-muted)">{$t('settings.primary_surface_title')}</h3>
		<p class="text-sm mb-3" style="color: var(--text-secondary)">{$t('settings.primary_surface_desc')}</p>
		<label class="sr-only" for="primary-surface-select">{$t('settings.primary_surface_title')}</label>
		<select
			id="primary-surface-select"
			class="input cursor-pointer"
			value={currentSurfaceChoice}
			on:change={onSurfaceChange}
		>
			<option value="auto">{$t('settings.primary_surface_auto')}</option>
			<option value="journal">{$t('settings.primary_surface_journal')}</option>
			<option value="calendar">{$t('settings.primary_surface_calendar')}</option>
			<option value="trend">{$t('settings.primary_surface_trend')}</option>
		</select>
	</section>
	{/if}


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

	</div>
	{/if}

	<!-- ═══════════════════ SHARING TAB ═══════════════════ -->
	{#if tab === 'sharing'}
	<div role="tabpanel" id="tabpanel-sharing" aria-labelledby="tab-sharing" class="space-y-4">

		<!-- Family sharing — patient view -->
		<FamilySharing />

		<!-- Linked accounts — caregiver view -->
		<LinkedAccounts />

		<!-- Data export — moved here from its own section. Exporting IS a form
			 of sharing (PDF to a doctor, JSON to a backup). -->
		<section class="card p-5">
			<h3 class="text-xs font-medium uppercase tracking-wider mb-3" style="color: var(--text-muted)">{$t('settings.export_data')}</h3>
			<p class="text-sm mb-4" style="color: var(--text-secondary)">{$t('settings.export_data_desc')}</p>
			<button
				on:click={exportAllData}
				class="w-full py-2 rounded-xl text-sm font-medium min-h-[44px] transition-colors text-white"
				style="background: var(--ochre)"
			>
				{$t('settings.export_button')}
			</button>
		</section>

	</div>
	{/if}
</div>

<!-- primitive-exempt: Modal — two bespoke confirmation dialogs (switch preset,
	 remove preset) with a blur backdrop and in-dialog danger chrome the current
	 Modal primitive does not expose. Sweep target for a future visual pass. -->
<!-- Confirm switch modal -->
{#if showConfirmSwitch && selectedPreset}
<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center p-4"
	style="background: rgba(0,0,0,0.4); backdrop-filter: blur(4px)"
	on:click|self={() => { showConfirmSwitch = false; }}
	on:keydown={(e) => { if (e.key === 'Escape') showConfirmSwitch = false; }}
	role="dialog"
	aria-modal="true"
	tabindex="-1"
>
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
<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center p-4"
	style="background: rgba(0,0,0,0.4); backdrop-filter: blur(4px)"
	on:click|self={() => { showDeleteModal = false; }}
	on:keydown={(e) => { if (e.key === 'Escape') showDeleteModal = false; }}
	role="dialog"
	aria-modal="true"
	tabindex="-1"
>
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
			class="w-full px-4 py-2 min-h-[44px] rounded-xl text-sm mb-3 outline-none"
			style="background: var(--surface-muted); border: 1px solid var(--border); color: var(--text-primary)"
		/>
		<div class="mb-3 {!deleteUsernameMatches ? 'opacity-50 pointer-events-none' : ''}">
			<PasswordField
				bind:value={deletePassword}
				placeholder={$t('auth.password')}
				class="w-full px-4 py-2 min-h-[44px] rounded-xl text-sm outline-none"
			/>
		</div>
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
				class="flex-1 py-2 text-white rounded-xl text-sm font-medium min-h-[44px] disabled:opacity-50"
				style="background: var(--danger)"
			>
				{$t('settings.delete_account')}
			</button>
		</div>
	</div>
</div>
{/if}
