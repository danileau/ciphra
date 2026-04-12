<script lang="ts">
	import Asterisk from '$lib/components/Asterisk.svelte';
	import Button from '$lib/components/Button.svelte';

	export let message: string = '';
	export let cta: string | undefined = undefined;
	export let href: string | undefined = undefined;
</script>

<div class="empty-state flex flex-col items-center justify-center">
	<Asterisk size={64} color="muted" muted />
	<p class="empty-message">{message}</p>
	{#if cta}
		<Button variant="primary" href={href}>{cta}</Button>
	{/if}
</div>

<style>
	.empty-state {
		padding: 48px 16px;
		gap: 16px;
		text-align: center;
	}

	.empty-message {
		color: var(--text-secondary);
		font-size: 14px;
		margin: 0;
		max-width: 280px;
		line-height: 1.5;
	}
</style>
