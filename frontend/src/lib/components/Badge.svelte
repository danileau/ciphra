<script lang="ts">
	export let variant: 'ochre' | 'olive' | 'brand' | 'danger' = 'ochre';
</script>

<span class="badge badge-{variant}">
	<slot />
</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		border-radius: 9999px;
		font-size: 12px;
		font-weight: 500;
		padding: 4px 10px;
		line-height: 1.3;
		white-space: nowrap;
	}

	.badge-ochre {
		background: var(--ochre-light);
		color: var(--ochre);
	}

	.badge-olive {
		background: var(--olive-light);
		color: var(--olive);
	}

	.badge-brand {
		background: var(--brand-light);
		color: var(--brand);
	}

	.badge-danger {
		background: #fef2f2;
		color: var(--danger);
	}
</style>
