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
		/* Light-tint background derived from --danger-rgb (Tailwind red-50
		   equivalent at 8% opacity over cream surface). Was hardcoded
		   #fef2f2 — migrated to keep palette tokens authoritative. */
		background: rgba(var(--danger-rgb), 0.08);
		color: var(--danger);
	}
</style>
