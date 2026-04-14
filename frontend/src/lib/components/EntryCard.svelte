<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let type: 'entry' | 'event' = 'entry';
	export let title: string = '';
	export let subtitle: string | undefined = undefined;
	export let notes: string | undefined = undefined;

	const dispatch = createEventDispatcher<{ edit: void; delete: void }>();

	let confirmingDelete = false;

	const borderColors: Record<string, string> = {
		entry: 'var(--olive)',
		event: 'var(--ochre)'
	};

	function handleDelete() {
		if (confirmingDelete) {
			dispatch('delete');
			confirmingDelete = false;
		} else {
			confirmingDelete = true;
		}
	}

	function cancelDelete() {
		confirmingDelete = false;
	}
</script>

<div
	class="entry-card"
	style="border-left: 3px solid {borderColors[type]};"
>
	<div class="entry-content">
		<span class="entry-title">{title}</span>
		{#if subtitle}
			<span class="entry-subtitle">{subtitle}</span>
		{/if}
		{#if notes}
			<p class="entry-notes">{notes}</p>
		{/if}
	</div>
	<div class="entry-actions">
		{#if confirmingDelete}
			<button
				type="button"
				class="action-btn action-confirm"
				aria-label="Confirm delete"
				on:click={handleDelete}
			>
				confirm
			</button>
			<button
				type="button"
				class="action-btn action-cancel"
				aria-label="Cancel delete"
				on:click={cancelDelete}
			>
				cancel
			</button>
		{:else}
			<button
				type="button"
				class="action-btn"
				aria-label="Edit {title}"
				on:click={() => dispatch('edit')}
			>
				edit
			</button>
			<button
				type="button"
				class="action-btn action-delete"
				aria-label="Delete {title}"
				on:click={handleDelete}
			>
				delete
			</button>
		{/if}
	</div>
</div>

<style>
	.entry-card {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 16px;
		background: var(--surface-card);
		border: 1px solid var(--border);
		border-radius: 12px;
		transition: background 200ms ease-out;
	}

	.entry-content {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}

	.entry-title {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-primary);
	}

	.entry-subtitle {
		font-size: 12px;
		color: var(--text-secondary);
	}

	.entry-notes {
		font-size: 12px;
		color: var(--text-muted);
		margin: 4px 0 0;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		line-height: 1.5;
	}

	.entry-actions {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	.action-btn {
		min-height: 44px;
		min-width: 44px;
		padding: 8px;
		background: transparent;
		border: none;
		border-radius: 8px;
		font-size: 12px;
		font-weight: 500;
		color: var(--text-muted);
		cursor: pointer;
		transition: color 150ms ease-out, background 150ms ease-out;
		-webkit-tap-highlight-color: transparent;
	}

	.action-btn:hover {
		background: var(--surface-muted);
		color: var(--text-secondary);
	}

	.action-delete {
		color: var(--text-muted);
	}

	.action-delete:hover {
		color: var(--danger);
		background: #fef2f2;
	}

	.action-confirm {
		color: var(--danger);
		font-weight: 600;
	}

	.action-cancel {
		color: var(--text-secondary);
	}

	@media (prefers-reduced-motion: reduce) {
		.entry-card,
		.action-btn {
			transition: none;
		}
	}
</style>
