<!-- primitive-exempt: Modal — BottomSheet is the *other* modal primitive
	 (mobile bottom-anchored sheet, not centred dialog). It keeps its own
	 fixed-inset-0 backdrop because it is itself the primitive. -->
<script lang="ts">
	import { createEventDispatcher, tick } from 'svelte';
	import { fly, fade } from 'svelte/transition';

	export let open: boolean = false;

	const dispatch = createEventDispatcher<{ close: void }>();

	let sheetEl: HTMLDivElement | null = null;
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
		dispatch('close');
	}

	// A11y review (PI v13) LB-1: trap focus inside the sheet, restore
	// focus to the trigger on close. Mirrors Modal.svelte's pattern.
	function handleKeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			dispatch('close');
			return;
		}
		if (e.key !== 'Tab' || !sheetEl) return;
		const focusables = focusableWithin(sheetEl);
		if (focusables.length === 0) {
			e.preventDefault();
			sheetEl.focus();
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
		lastFocused = (document.activeElement as HTMLElement | null) ?? null;
		tick().then(() => {
			if (!sheetEl) return;
			const f = focusableWithin(sheetEl);
			(f[0] ?? sheetEl).focus();
		});
	} else if (typeof document !== 'undefined' && !open && lastFocused) {
		try { lastFocused.focus(); } catch { /* element may be gone */ }
		lastFocused = null;
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
	<div
		class="sheet-backdrop"
		transition:fade={{ duration: 200 }}
		on:click={handleBackdropClick}
		on:keydown={handleKeydown}
		role="presentation"
		aria-hidden="true"
	></div>
	<div
		bind:this={sheetEl}
		tabindex="-1"
		class="sheet focus:outline-none"
		role="dialog"
		aria-modal="true"
		transition:fly={{ y: 300, duration: 300 }}
	>
		<div class="sheet-handle-wrapper">
			<div class="sheet-handle" aria-hidden="true"></div>
		</div>
		<div class="sheet-content">
			<slot />
		</div>
	</div>
{/if}

<style>
	.sheet-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		z-index: 50;
	}

	.sheet {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		max-height: 80vh;
		background: var(--surface-card);
		border-radius: 16px 16px 0 0;
		z-index: 51;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
	}

	.sheet-handle-wrapper {
		display: flex;
		justify-content: center;
		padding: 12px 0 8px;
		position: sticky;
		top: 0;
		background: var(--surface-card);
	}

	.sheet-handle {
		width: 40px;
		height: 4px;
		border-radius: 9999px;
		background: var(--border);
	}

	.sheet-content {
		padding: 0 16px 24px;
	}

	@media (prefers-reduced-motion: reduce) {
		.sheet-backdrop,
		.sheet {
			transition: none;
			animation: none;
		}
	}
</style>
