<script lang="ts">
	/**
	 * CIPH-834 — HelpHint primitive.
	 *
	 * Small dismissable inline info banner (NOT a modal — it doesn't
	 * capture focus and it doesn't cover page content). Used for
	 * one-time contextual education: "Your Tagebuch entries are
	 * never exported", "Tap + to add a second entry", etc.
	 *
	 * Visually distinct from `<Toast>`: Toast is transient and floats
	 * at the top-of-viewport; HelpHint is persistent until the user
	 * dismisses it and flows inline with page content.
	 *
	 * Callers own the "has this been dismissed before?" persistence
	 * (usually a localStorage flag) — this primitive only renders
	 * when `open` is true and calls `onDismiss` when the user taps
	 * the ×. That keeps the primitive stateless and the persistence
	 * policy explicit per site.
	 *
	 * Usage:
	 * ```svelte
	 *   <HelpHint
	 *     open={!hintSeen}
	 *     title={$t('journal.tagebuch_hint_title')}
	 *     onDismiss={markSeen}
	 *   >
	 *     {$t('journal.tagebuch_hint_body')}
	 *   </HelpHint>
	 * ```
	 */
	import { t } from '$lib/i18n';

	export let open = false;
	export let onDismiss: (() => void) | undefined = undefined;
	export let title: string | undefined = undefined;
	export let dismissLabel: string | undefined = undefined;

	$: _dismiss = dismissLabel ?? $t('common.close');
</script>

{#if open}
	<div
		class="rounded-xl p-3 flex items-start gap-2"
		style="background: var(--surface-muted); border: 1px solid var(--border); color: var(--text-secondary)"
		role="status"
	>
		<svg
			class="w-4 h-4 shrink-0 mt-0.5"
			style="color: var(--text-muted)"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="10" stroke-width="2" />
			<path d="M12 16v-4M12 8h.01" stroke-width="2" stroke-linecap="round" />
		</svg>
		<div class="flex-1 text-sm leading-relaxed">
			{#if title}<p class="font-medium mb-0.5" style="color: var(--text-primary)">{title}</p>{/if}
			<slot />
		</div>
		{#if onDismiss}
			<button
				type="button"
				on:click={onDismiss}
				aria-label={_dismiss}
				class="shrink-0 p-1 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg"
				style="color: var(--text-muted)"
			>
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
					<path d="M6 6l12 12M18 6L6 18" stroke-width="2" stroke-linecap="round" />
				</svg>
			</button>
		{/if}
	</div>
{/if}
