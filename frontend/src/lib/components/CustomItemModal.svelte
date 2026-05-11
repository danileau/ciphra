<script lang="ts">
	/**
	 * CIPH-882 — CustomItemModal.
	 *
	 * Single kind-driven primitive for adding a user's own symptom,
	 * trigger, vital, or episode type. Wraps the existing `Modal.svelte`.
	 *
	 * Form fields by kind:
	 *   symptom  — label + optional group select
	 *   trigger  — label
	 *   vital    — label + unit + optional min + optional max
	 *   episode  — label + color picker (6 chips from DATA_PALETTE)
	 *
	 * Validation lives in `validateCustomItem` so the modal and any other
	 * caller surface the same error keys. On save, the dispatcher emits
	 * the fully-typed item with a generated `custom_<slug>_<suffix>` id
	 * (or the existing id when editing); callers append it to the right
	 * `customizations.custom*` array and persist via `blueprint.save`.
	 */
	import { createEventDispatcher } from 'svelte';
	import { t } from '$lib/i18n';
	import Modal from '$lib/components/Modal.svelte';
	import { DATA_PALETTE } from '$lib/dataPalette';
	import {
		generateCustomId,
		validateCustomItem,
		type CustomKind,
	} from '$lib/blueprint';
	import type {
		BlueprintGroup,
		BlueprintItem,
		CustomSymptomItem,
		EpisodeType,
		VitalField,
	} from '$lib/blueprint/types';

	type EditingItem =
		| CustomSymptomItem
		| BlueprintItem
		| VitalField
		| EpisodeType
		| null;

	export let open = false;
	export let kind: CustomKind = 'symptom';
	export let editing: EditingItem = null;
	/** For symptom kind: existing groups so the user can pick one. */
	export let groups: BlueprintGroup[] = [];

	const dispatch = createEventDispatcher<{
		save:
			| { kind: 'symptom'; item: CustomSymptomItem }
			| { kind: 'trigger'; item: BlueprintItem }
			| { kind: 'vital'; item: VitalField }
			| { kind: 'episode'; item: EpisodeType };
		close: void;
	}>();

	let label = '';
	let groupId = '';
	let unit = '';
	let minStr = '';
	let maxStr = '';
	let color = DATA_PALETTE[0] as string;
	let errorKey: string | null = null;

	$: titleKey =
		(editing ? 'customization.edit_' : 'customization.add_') + kind;

	// Hydrate fields from `editing` whenever the modal opens or kind changes.
	$: if (open) {
		hydrate();
	}

	function hydrate() {
		if (editing) {
			label = editing.label || '';
			if (kind === 'symptom') {
				groupId = (editing as CustomSymptomItem).groupId || '';
			}
			if (kind === 'vital') {
				const v = editing as VitalField;
				unit = v.unit || '';
				minStr = v.min != null ? String(v.min) : '';
				maxStr = v.max != null ? String(v.max) : '';
			}
			if (kind === 'episode') {
				color = (editing as EpisodeType).color || DATA_PALETTE[0];
			}
		} else {
			label = '';
			groupId = '';
			unit = '';
			minStr = '';
			maxStr = '';
			color = DATA_PALETTE[0];
		}
		errorKey = null;
	}

	function close() {
		dispatch('close');
	}

	function save() {
		const trimmedLabel = label.trim();
		const partial: Record<string, unknown> = { label: trimmedLabel };
		if (kind === 'vital') {
			partial.unit = unit.trim();
		}
		if (kind === 'episode') {
			partial.color = color;
		}
		const err = validateCustomItem(kind, partial as never);
		if (err) {
			errorKey = err;
			return;
		}
		const id = editing?.id ?? generateCustomId(trimmedLabel);
		if (kind === 'symptom') {
			const item: CustomSymptomItem = { id, label: trimmedLabel };
			if (groupId) item.groupId = groupId;
			dispatch('save', { kind, item });
		} else if (kind === 'trigger') {
			const item: BlueprintItem = { id, label: trimmedLabel };
			dispatch('save', { kind, item });
		} else if (kind === 'vital') {
			// `bind:value` on a `type=number` input coerces minStr/maxStr
			// to a number — coerce back to string before trimming.
			const minRaw = String(minStr ?? '').trim();
			const maxRaw = String(maxStr ?? '').trim();
			const min = minRaw === '' ? undefined : Number(minRaw);
			const max = maxRaw === '' ? undefined : Number(maxRaw);
			const item: VitalField = {
				id,
				label: trimmedLabel,
				unit: unit.trim(),
				placeholder: '',
				...(min !== undefined && !isNaN(min) ? { min } : {}),
				...(max !== undefined && !isNaN(max) ? { max } : {}),
			};
			dispatch('save', { kind, item });
		} else {
			const item: EpisodeType = {
				id,
				label: trimmedLabel,
				color,
			};
			dispatch('save', { kind, item });
		}
	}

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			save();
		}
	}
</script>

<Modal {open} title={$t(titleKey)} onClose={close}>
	<div class="space-y-4">
		<!-- Label (all kinds) -->
		<label class="block">
			<span class="text-xs font-medium" style="color: var(--text-secondary)"
				>{$t('customization.label')}</span
			>
			<input
				type="text"
				bind:value={label}
				on:keydown={handleKey}
				class="input mt-1 w-full"
				autocomplete="off"
				data-testid="custom-item-label"
			/>
		</label>

		{#if kind === 'symptom' && groups.length > 0}
			<label class="block">
				<span class="text-xs font-medium" style="color: var(--text-secondary)"
					>{$t('customization.group')}</span
				>
				<select
					bind:value={groupId}
					class="input select-chevron mt-1 w-full cursor-pointer"
					data-testid="custom-item-group"
				>
					<option value="">{$t('customization.no_group')}</option>
					{#each groups as g}
						<option value={g.id}>{$t(g.label)}</option>
					{/each}
				</select>
			</label>
		{/if}

		{#if kind === 'vital'}
			<label class="block">
				<span class="text-xs font-medium" style="color: var(--text-secondary)"
					>{$t('customization.unit')}</span
				>
				<input
					type="text"
					bind:value={unit}
					on:keydown={handleKey}
					class="input mt-1 w-full"
					autocomplete="off"
					data-testid="custom-item-unit"
				/>
			</label>
			<div class="grid grid-cols-2 gap-3">
				<label class="block">
					<span class="text-xs font-medium" style="color: var(--text-secondary)"
						>{$t('customization.min')}</span
					>
					<input
						type="number"
						bind:value={minStr}
						class="input mt-1 w-full"
						data-testid="custom-item-min"
					/>
				</label>
				<label class="block">
					<span class="text-xs font-medium" style="color: var(--text-secondary)"
						>{$t('customization.max')}</span
					>
					<input
						type="number"
						bind:value={maxStr}
						class="input mt-1 w-full"
						data-testid="custom-item-max"
					/>
				</label>
			</div>
		{/if}

		{#if kind === 'episode'}
			<div>
				<span class="text-xs font-medium" style="color: var(--text-secondary)"
					>{$t('customization.color')}</span
				>
				<div class="flex flex-wrap gap-2 mt-2" role="radiogroup" aria-label={$t('customization.color')}>
					{#each DATA_PALETTE as hex}
						<button
							type="button"
							role="radio"
							aria-checked={color === hex}
							on:click={() => (color = hex)}
							class="w-9 h-9 rounded-full transition-transform"
							style="background: {hex}; border: 3px solid {color === hex ? 'var(--text-primary)' : 'transparent'}; transform: {color === hex ? 'scale(1.1)' : 'scale(1)'}"
							data-testid="custom-item-color-{hex}"
						></button>
					{/each}
				</div>
			</div>
		{/if}

		{#if errorKey}
			<!-- Error text uses --danger to match Input.svelte:84 and to read
			     as "stop, this is wrong" rather than "warm warning". -->
			<p class="text-sm" style="color: var(--danger)" data-testid="custom-item-error">
				{$t(errorKey)}
			</p>
		{/if}

		<div class="flex justify-end gap-2 pt-2">
			<button
				type="button"
				class="btn-ghost min-h-[44px] px-4"
				on:click={close}
				data-testid="custom-item-cancel"
			>
				{$t('common.cancel')}
			</button>
			<button
				type="button"
				class="btn-primary min-h-[44px] px-4"
				on:click={save}
				data-testid="custom-item-save"
			>
				{$t('common.save')}
			</button>
		</div>
	</div>
</Modal>
