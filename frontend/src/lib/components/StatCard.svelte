<script lang="ts">
	export let value: string | number = '';
	export let label: string = '';
	export let variant: 'ochre' | 'danger' = 'ochre';
</script>

<div class="stat-card">
	<span class="stat-value stat-{variant}">{value}</span>
	<span class="stat-label">{label}</span>
</div>

<style>
	.stat-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 16px;
		background: var(--surface-card);
		border: 1px solid var(--border);
		border-radius: 12px;
		text-align: center;
	}

	.stat-value {
		font-size: 28px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		line-height: 1.3;
	}

	.stat-ochre {
		color: var(--ochre);
	}

	.stat-danger {
		color: var(--danger);
	}

	.stat-label {
		font-size: 12px;
		font-weight: 400;
		color: var(--text-muted);
	}
</style>
