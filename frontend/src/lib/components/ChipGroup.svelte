<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let items: Array<{ id: string; label: string }> = [];
	export let selected: Record<string, boolean> = {};
	export let variant: 'olive' | 'ochre' = 'olive';
	export let label: string | undefined = undefined;

	const dispatch = createEventDispatcher<{ toggle: string }>();

	function handleToggle(id: string) {
		dispatch('toggle', id);
	}
</script>

<div class="chip-group">
	{#if label}
		<span class="chip-label">{label}</span>
	{/if}
	<div class="flex flex-wrap gap-2">
		{#each items as item (item.id)}
			<button
				type="button"
				class="chip"
				class:chip-active-olive={selected[item.id] && variant === 'olive'}
				class:chip-active-ochre={selected[item.id] && variant === 'ochre'}
				aria-label="{item.label} — {selected[item.id] ? 'selected' : 'not selected'}"
				aria-pressed={selected[item.id] ? 'true' : 'false'}
				on:click={() => handleToggle(item.id)}
			>
				{item.label}
			</button>
		{/each}
	</div>
</div>

<style>
	.chip-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.chip-label {
		font-size: 12px;
		font-weight: 500;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.chip {
		display: inline-flex;
		align-items: center;
		min-height: 36px;
		padding: 6px 14px;
		background: var(--surface-muted);
		color: var(--text-secondary);
		border: 1px solid var(--border-subtle);
		border-radius: 9999px;
		font-size: 14px;
		font-weight: 400;
		cursor: pointer;
		transition: background 200ms ease-out, color 200ms ease-out, border-color 200ms ease-out;
		-webkit-tap-highlight-color: transparent;
		user-select: none;
	}

	.chip:active {
		transform: scale(0.97);
	}

	.chip-active-olive {
		background: var(--olive-light);
		color: var(--olive);
		border-color: rgba(127, 130, 27, 0.3);
		font-weight: 500;
	}

	.chip-active-ochre {
		background: var(--ochre-light);
		color: var(--ochre);
		border-color: rgba(159, 99, 11, 0.3);
		font-weight: 500;
	}

	@media (prefers-reduced-motion: reduce) {
		.chip {
			transition: none;
		}
		.chip:active {
			transform: none;
		}
	}
</style>
