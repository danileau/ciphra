<script lang="ts">
	import { fade } from 'svelte/transition';
	import { onMount } from 'svelte';

	export let message: string = '';
	export let duration: number = 3000;
	export let show: boolean = true;

	onMount(() => {
		if (duration > 0) {
			const timer = setTimeout(() => { show = false; }, duration);
			return () => clearTimeout(timer);
		}
	});
</script>

{#if show && message}
	<div class="toast" role="status" aria-live="polite" transition:fade={{ duration: 200 }}>
		<span class="toast-dot" aria-hidden="true"></span>
		<span class="toast-msg">{message}</span>
	</div>
{/if}

<style>
	.toast {
		position: fixed;
		top: 72px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 80;
		display: inline-flex;
		align-items: center;
		gap: 10px;
		padding: 10px 16px;
		border-radius: 10px;
		background: var(--success-light, #f4f4e3);
		color: var(--success, #7f821b);
		border: 1px solid var(--success, #7f821b);
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
		font-size: 14px;
		font-weight: 500;
		max-width: calc(100vw - 32px);
	}
	.toast-dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--success, #7f821b);
		flex-shrink: 0;
	}
	.toast-msg {
		line-height: 1.3;
	}
</style>
