<script lang="ts">
	export let variant: 'default' | 'interactive' | 'brand' | 'ochre' | 'olive' = 'default';
	export let padding: boolean = true;
</script>

<div
	class="card card-{variant}"
	class:card-padded={padding}
>
	<slot />
</div>

<style>
	.card {
		background: var(--surface-card);
		border: 1px solid var(--border);
		border-radius: 12px;
		transition: transform 150ms ease-out, box-shadow 150ms ease-out;
	}

	.card-padded {
		padding: 16px;
	}

	@media (min-width: 640px) {
		.card-padded {
			padding: 20px;
		}
	}

	.card-interactive:hover {
		transform: translateY(-1px);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
	}

	.card-brand {
		background: var(--brand-light);
		border-color: rgba(178, 60, 44, 0.15);
	}

	.card-ochre {
		background: var(--ochre-light);
		border-color: rgba(159, 99, 11, 0.15);
	}

	.card-olive {
		background: var(--olive-light);
		border-color: rgba(127, 130, 27, 0.15);
	}

	@media (prefers-reduced-motion: reduce) {
		.card {
			transition: none;
		}
		.card-interactive:hover {
			transform: none;
		}
	}
</style>
