<script lang="ts">
	import { onMount, onDestroy, afterUpdate } from 'svelte';
	import { browser } from '$app/environment';

	export let type: string;
	export let data: any;
	export let options: any = {};

	let canvas: HTMLCanvasElement;
	let chart: any = null;
	let Chart: any = null;

	// CIPH-745: coalesce reactive bursts. Svelte's `afterUpdate` fires on
	// every reactive tick — a dashboard page can easily drive 5–10 ticks
	// for one user action (store cascades, derived stores, i18n updates).
	// Chart.js' `update()` walks the dataset each time, and on mid-range
	// phones that's visibly janky. We coalesce updates into a single
	// rAF-aligned 60ms debounce, and skip no-op updates by hashing the
	// incoming data/options reference.
	let rafHandle: number | null = null;
	let debounceHandle: ReturnType<typeof setTimeout> | null = null;
	let lastDataRef: any = null;
	let lastOptionsRef: any = null;
	const DEBOUNCE_MS = 60;

	function scheduleUpdate() {
		if (debounceHandle) clearTimeout(debounceHandle);
		debounceHandle = setTimeout(() => {
			debounceHandle = null;
			if (rafHandle) cancelAnimationFrame(rafHandle);
			rafHandle = requestAnimationFrame(() => {
				rafHandle = null;
				if (!chart) return;
				chart.data = data;
				chart.options = mergeDefaults(options);
				// 'none' skips animation — keeps quick successive updates cheap.
				chart.update('none');
			});
		}, DEBOUNCE_MS);
	}

	function isDarkMode(): boolean {
		return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
	}

	function mergeDefaults(opts: any): any {
		const dark = isDarkMode();
		// CIPH-891 follow-up — pull tick + grid colors from the live CSS
		// vars so charts honour the cream/text-secondary brand tokens
		// instead of cold Tailwind slate. Falls back to known brand
		// values when running outside a DOM (SSR / vitest).
		const root =
			typeof document !== 'undefined'
				? getComputedStyle(document.documentElement)
				: null;
		const textColor =
			(root && root.getPropertyValue('--text-secondary').trim()) ||
			(dark ? '#94a3b8' : '#64594e');
		const gridColor = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';

		const scales = Object.fromEntries(
			Object.entries(opts.scales || {}).map(([key, scale]: [string, any]) => [
				key,
				{
					...scale,
					ticks: { color: textColor, ...(scale?.ticks || {}) },
					grid: { color: gridColor, ...(scale?.grid || {}) }
				}
			])
		);

		return {
			...opts,
			responsive: true,
			maintainAspectRatio: false,
			animation: false,
			plugins: {
				...opts.plugins,
				legend: {
					...(opts.plugins?.legend || {}),
					labels: { color: textColor, font: { size: 12 }, ...(opts.plugins?.legend)?.labels }
				}
			},
			scales
		};
	}

	onMount(async () => {
		const mod = await import('chart.js');
		Chart = mod.Chart;
		Chart.register(...mod.registerables);

		chart = new Chart(canvas, {
			type,
			data,
			options: mergeDefaults(options)
		});
	});

	afterUpdate(() => {
		if (!chart) return;
		// Reference-equality short-circuit: if neither `data` nor `options`
		// changed identity since the last update, this tick is a no-op.
		// Callers that mutate in place will still hit the debounced path.
		if (data === lastDataRef && options === lastOptionsRef) return;
		lastDataRef = data;
		lastOptionsRef = options;
		scheduleUpdate();
	});

	onDestroy(() => {
		if (debounceHandle) clearTimeout(debounceHandle);
		if (rafHandle) cancelAnimationFrame(rafHandle);
		chart?.destroy();
		chart = null;
	});
</script>

{#if browser}
<!-- No min-height — parent controls vertical sizing via h-* classes.
     Chart.js with responsive: true + maintainAspectRatio: false will
     fill whatever box the parent sets. -->
<div class="w-full h-full relative">
	<canvas bind:this={canvas}></canvas>
</div>
{/if}
