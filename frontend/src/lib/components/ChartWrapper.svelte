<script lang="ts">
	import { onMount, onDestroy, afterUpdate } from 'svelte';
	import { Chart, registerables, type ChartType, type ChartData, type ChartOptions } from 'chart.js';

	Chart.register(...registerables);

	export let type: ChartType;
	export let data: ChartData;
	export let options: ChartOptions = {};

	let canvas: HTMLCanvasElement;
	let chart: Chart | null = null;

	function isDarkMode(): boolean {
		return document.documentElement.classList.contains('dark');
	}

	function mergeDefaults(opts: ChartOptions): ChartOptions {
		const dark = isDarkMode();
		const gridColor = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
		const textColor = dark ? '#a8a29e' : '#78716c';

		const scales = Object.fromEntries(
			Object.entries(opts.scales || {}).map(([key, scale]) => [
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
					labels: { color: textColor, font: { size: 12 }, ...(opts.plugins?.legend as any)?.labels }
				}
			},
			scales
		};
	}

	onMount(() => {
		chart = new Chart(canvas, {
			type,
			data,
			options: mergeDefaults(options)
		});
	});

	afterUpdate(() => {
		if (!chart) return;
		chart.data = data;
		chart.options = mergeDefaults(options) as any;
		chart.update('none');
	});

	onDestroy(() => {
		chart?.destroy();
		chart = null;
	});
</script>

<div class="w-full h-full min-h-[200px]">
	<canvas bind:this={canvas}></canvas>
</div>
