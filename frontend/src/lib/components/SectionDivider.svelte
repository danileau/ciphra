<script lang="ts">
	import Asterisk from '$lib/components/Asterisk.svelte';
</script>

<div class="divider" aria-hidden="true">
	<div class="divider-line"></div>
	<Asterisk size={14} color="muted" />
	<div class="divider-line"></div>
</div>

<style>
	.divider {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 0;
	}

	.divider-line {
		flex: 1;
		height: 1px;
		background: var(--border-subtle);
	}
</style>
