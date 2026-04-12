<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let value: number = 0;
	export let label: string = '';
	export let color: string = '#9f630b';
	export let min: number = 0;

	const dispatch = createEventDispatcher<{ change: number }>();

	function decrement() {
		if (value > min) {
			dispatch('change', value - 1);
		}
	}

	function increment() {
		dispatch('change', value + 1);
	}
</script>

<div class="counter">
	<div class="flex items-center gap-2">
		<span class="color-dot" style="background: {color};" aria-hidden="true"></span>
		<span class="counter-label">{label}</span>
	</div>
	<div class="flex items-center gap-3">
		<button
			type="button"
			class="counter-btn"
			aria-label="Decrease {label}"
			disabled={value <= min}
			on:click={decrement}
		>
			&minus;
		</button>
		<span
			class="counter-value"
			class:counter-zero={value === 0}
		>
			{value}
		</span>
		<button
			type="button"
			class="counter-btn"
			aria-label="Increase {label}"
			on:click={increment}
		>
			+
		</button>
	</div>
</div>

<style>
	.counter {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.color-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.counter-label {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-primary);
	}

	.counter-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--surface-card);
		color: var(--text-primary);
		font-size: 18px;
		cursor: pointer;
		transition: background 150ms ease-out, transform 150ms ease-out;
		-webkit-tap-highlight-color: transparent;
		user-select: none;
	}

	.counter-btn:hover {
		background: var(--surface-muted);
	}

	.counter-btn:active {
		transform: scale(0.97);
	}

	.counter-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.counter-value {
		min-width: 32px;
		text-align: center;
		font-size: 20px;
		font-weight: 700;
		color: var(--ochre);
		font-variant-numeric: tabular-nums;
	}

	.counter-zero {
		color: var(--text-muted);
	}

	@media (prefers-reduced-motion: reduce) {
		.counter-btn {
			transition: none;
		}
		.counter-btn:active {
			transform: none;
		}
	}
</style>
