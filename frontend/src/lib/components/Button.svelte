<script lang="ts">
	export let variant: 'primary' | 'secondary' | 'ghost' | 'danger' = 'primary';
	export let disabled: boolean = false;
	export let href: string | undefined = undefined;
	export let type: 'button' | 'submit' | 'reset' = 'button';
</script>

{#if href && !disabled}
	<a
		{href}
		class="btn btn-{variant}"
		aria-label={$$restProps['aria-label'] || undefined}
	>
		<slot />
	</a>
{:else}
	<button
		{type}
		{disabled}
		class="btn btn-{variant}"
		class:btn-disabled={disabled}
		aria-label={$$restProps['aria-label'] || undefined}
		on:click
	>
		<slot />
	</button>
{/if}

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 44px;
		min-width: 44px;
		padding: 10px 20px;
		border: none;
		border-radius: 12px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		text-decoration: none;
		transition: background 150ms ease-out, transform 150ms ease-out;
		-webkit-tap-highlight-color: transparent;
		user-select: none;
		line-height: 1.3;
	}

	.btn:active {
		transform: scale(0.97);
	}

	.btn-primary {
		/* CIPH-891 — cohort-aware via --accent. */
		background: var(--accent);
		color: #ffffff;
	}

	.btn-primary:hover {
		background: hsl(from var(--accent) h s calc(l - 8%));
	}

	.btn-secondary {
		background: var(--surface-muted);
		color: var(--text-secondary);
	}

	.btn-secondary:hover {
		background: var(--surface-inset);
	}

	.btn-ghost {
		background: transparent;
		/* CIPH-891 — cohort-aware ghost text. */
		color: var(--accent);
	}

	.btn-ghost:hover {
		background: rgba(var(--accent-rgb), 0.08);
	}

	.btn-danger {
		background: var(--danger);
		color: #ffffff;
	}

	.btn-danger:hover {
		background: #b91c1c;
	}

	.btn-disabled {
		opacity: 0.5;
		cursor: not-allowed;
		pointer-events: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.btn {
			transition: none;
		}
		.btn:active {
			transform: none;
		}
	}
</style>
