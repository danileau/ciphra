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
	import { onMount, tick } from 'svelte';

	export let open = false;
	export let onClose: (() => void) | undefined = undefined;
	export let title: string | undefined = undefined;
	export let dismissable = true;
	/** Max-width utility for the inner card. Default `max-w-md`. */
	export let maxWidth: string = 'max-w-md';

	let titleId = `modal-title-${Math.random().toString(36).slice(2, 9)}`;
	let dialogEl: HTMLDivElement | null = null;
	let lastFocused: HTMLElement | null = null;

	function focusableWithin(root: HTMLElement): HTMLElement[] {
		const sel =
			'a[href], button:not([disabled]), input:not([disabled]), ' +
			'select:not([disabled]), textarea:not([disabled]), ' +
			'[tabindex]:not([tabindex="-1"])';
		return Array.from(root.querySelectorAll<HTMLElement>(sel)).filter(
			(el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed',
		);
	}

	function handleBackdropClick() {
		if (!dismissable) return;
		onClose?.();
	}

	// A11y review (PI v13) LB-1: previously aria-modal=true was set but
	// Tab walked into the page behind. Trap focus inside the dialog and
	// restore focus to the launching element on close.
	function handleKey(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape' && dismissable) {
			onClose?.();
			return;
		}
		if (e.key !== 'Tab' || !dialogEl) return;
		const focusables = focusableWithin(dialogEl);
		if (focusables.length === 0) {
			e.preventDefault();
			dialogEl.focus();
			return;
		}
		const first = focusables[0];
		const last = focusables[focusables.length - 1];
		const active = document.activeElement as HTMLElement | null;
		if (e.shiftKey && active === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && active === last) {
			e.preventDefault();
			first.focus();
		}
	}

	$: if (typeof document !== 'undefined' && open) {
		// Capture the trigger element + auto-focus the first focusable
		// inside the dialog on open. tick() defers until the slot is
		// rendered.
		lastFocused = (document.activeElement as HTMLElement | null) ?? null;
		tick().then(() => {
			if (!dialogEl) return;
			const f = focusableWithin(dialogEl);
			(f[0] ?? dialogEl).focus();
		});
	} else if (typeof document !== 'undefined' && !open && lastFocused) {
		// Restore focus to the trigger when the dialog closes.
		try { lastFocused.focus(); } catch { /* element may be gone */ }
		lastFocused = null;
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
			bind:this={dialogEl}
			tabindex="-1"
			class="relative rounded-2xl p-6 w-full {maxWidth} focus:outline-none"
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
