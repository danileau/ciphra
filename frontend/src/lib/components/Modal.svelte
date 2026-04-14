<script lang="ts">
	/**
	 * CIPH-834 — Modal primitive.
	 *
	 * Centred dialog over a translucent backdrop. Used for short,
	 * focused tasks that need to block the rest of the UI (the
	 * `/migrate` post-import tour is the canonical site). The
	 * bottom-sheet quick-add on the dashboard is NOT a modal — it
	 * uses its own mobile-bottom chrome.
	 *
	 * Esc + backdrop click both close when `dismissable` (default
	 * true). Set `dismissable={false}` for modals that require an
	 * explicit action (rare — prefer a button that writes state and
	 * then the caller flips `open=false`).
	 *
	 * `title` is used for both the visible `<h1>` and the
	 * `aria-labelledby` reference; supply one.
	 *
	 * Usage:
	 * ```svelte
	 *   <Modal open={showTour} title={$t('migrate.tour_title')}
	 *          onClose={() => (showTour = false)}>
	 *     <p class="text-sm mb-6">…</p>
	 *     <button class="btn-primary w-full min-h-[48px]"
	 *             on:click={finish}>Continue</button>
	 *   </Modal>
	 * ```
	 */
	import { onMount } from 'svelte';

	export let open = false;
	export let onClose: (() => void) | undefined = undefined;
	export let title: string | undefined = undefined;
	export let dismissable = true;
	/** Max-width utility for the inner card. Default `max-w-md`. */
	export let maxWidth: string = 'max-w-md';

	let titleId = `modal-title-${Math.random().toString(36).slice(2, 9)}`;

	function handleBackdropClick() {
		if (!dismissable) return;
		onClose?.();
	}
	function handleKey(e: KeyboardEvent) {
		if (!open || !dismissable) return;
		if (e.key === 'Escape') onClose?.();
	}

	onMount(() => {
		window.addEventListener('keydown', handleKey);
		return () => window.removeEventListener('keydown', handleKey);
	});
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4"
		style="background: rgba(0,0,0,0.45)"
		role="dialog"
		aria-modal="true"
		aria-labelledby={title ? titleId : undefined}
	>
		{#if dismissable}
			<button
				type="button"
				class="absolute inset-0 w-full h-full cursor-default"
				aria-label="Close"
				tabindex="-1"
				on:click={handleBackdropClick}
			></button>
		{/if}
		<div
			class="relative rounded-2xl p-6 w-full {maxWidth}"
			style="background: var(--surface-card); border: 1px solid var(--border); box-shadow: 0 10px 30px rgba(0,0,0,0.2)"
		>
			{#if title}
				<h1 id={titleId} class="text-lg font-semibold mb-2" style="color: var(--text-primary)">
					{title}
				</h1>
			{/if}
			<slot />
		</div>
	</div>
{/if}
