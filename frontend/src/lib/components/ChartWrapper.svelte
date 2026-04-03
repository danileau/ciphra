<script lang="ts">
	import { onMount, onDestroy, afterUpdate } from 'svelte';
	import { browser } from '$app/environment';

	export let type: string;
	export let data: any;
	export let options: any = {};

	let canvas: HTMLCanvasElement;
	let chart: any = null;
	let Chart: any = null;

	function isDarkMode(): boolean {
		return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
	}

	function mergeDefaults(opts: any): any {
		const dark = isDarkMode();
		const gridColor = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
		const textColor = dark ? '#a8a29e' : '#78716c';

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
		chart.data = data;
		chart.options = mergeDefaults(options);
		chart.update('none');
	});

	onDestroy(() => {
		chart?.destroy();
		chart = null;
	});
</script>

{#if browser}
<div class="w-full h-full min-h-[200px]">
	<canvas bind:this={canvas}></canvas>
</div>
{/if}
