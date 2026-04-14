<script lang="ts">
	/**
	 * CIPH-834 — ConfirmDelete primitive.
	 *
	 * The red "Yes delete" + "Cancel" button pair shown next to a
	 * just-tapped delete icon on entry cards. Canonical visual:
	 *   [   Yes delete (danger bg, white text)   ] [ Cancel (btn-secondary) ]
	 * Both 44px min tap target, rounded-lg, text-xs, p-{size}.
	 *
	 * Use when the caller wants the compact icon-pair style — journal
	 * and calendar entry rows are the two canonical sites. Patterns
	 * that render a full-width banner ("Entry löschen?" on its own
	 * line, as in `/log/[date]`) or a more compact 40px variant
	 * inside the dashboard rail keep their inline markup and opt out
	 * with a `primitive-exempt` comment; see `primitives.test.ts`.
	 *
	 * Usage:
	 * ```svelte
	 *   {#if confirmDeleteId === item.id}
	 *     <ConfirmDelete
	 *       onConfirm={() => handleDelete(item.id)}
	 *       onCancel={() => (confirmDeleteId = null)}
	 *     />
	 *   {/if}
	 * ```
	 */
	import { t } from '$lib/i18n';

	export let onConfirm: () => void;
	export let onCancel: () => void;
	export let disabled = false;
	export let confirmLabel: string | undefined = undefined;
	export let cancelLabel: string | undefined = undefined;
	/** Inner padding: `p-2` (journal) or `p-1.5` (calendar). */
	export let padding: 'p-2' | 'p-1.5' = 'p-2';

	$: _confirmLabel = confirmLabel ?? $t('common.yes_delete');
	$: _cancelLabel = cancelLabel ?? $t('common.cancel');
</script>

<button
	type="button"
	on:click={onConfirm}
	{disabled}
	class="{padding} rounded-lg text-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center text-xs font-medium"
	style="background: var(--danger)"
>{_confirmLabel}</button>
<button
	type="button"
	on:click={onCancel}
	class="btn-secondary {padding} min-w-[44px] min-h-[44px] flex items-center justify-center text-xs font-medium"
>{_cancelLabel}</button>
