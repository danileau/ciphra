<!-- primitive-exempt: Modal — BottomSheet is the *other* modal primitive
	 (mobile bottom-anchored sheet, not centred dialog). It keeps its own
	 fixed-inset-0 backdrop because it is itself the primitive. -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { fly, fade } from 'svelte/transition';

	export let open: boolean = false;

	const dispatch = createEventDispatcher<{ close: void }>();

	function handleBackdropClick() {
		dispatch('close');
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			dispatch('close');
		}
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
		class="sheet"
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
