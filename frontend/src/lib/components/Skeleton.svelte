<script lang="ts">
	export let height: string = '24px';
	export let width: string = '100%';
	export let delay: number = 0;
</script>

<div
	class="skeleton"
	style="height: {height}; width: {width}; animation-delay: {delay}ms;"
	aria-hidden="true"
></div>

<style>
	.skeleton {
		border-radius: 12px;
		background: linear-gradient(
			90deg,
			var(--surface-muted) 0%,
			var(--surface-inset) 50%,
			var(--surface-muted) 100%
		);
		background-size: 200% 100%;
		animation: shimmer 1.5s ease-in-out infinite;
	}

	@keyframes shimmer {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.skeleton {
			animation: none;
		}
	}
</style>
