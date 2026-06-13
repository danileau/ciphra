<script lang="ts">
	import { onMount, onDestroy, afterUpdate } from 'svelte';
	import { browser } from '$app/environment';
	import { resolvedTheme } from '$lib/stores/theme';

	export let type: string;
	export let data: any;
	export let options: any = {};
	/**
	 * PI v15 LB-4 — Screen-reader text alternative for the chart.
	 * Without this the canvas is invisible to assistive tech. Pass a short
	 * `ariaLabel` summarising the chart and an optional `srTable` so SR
	 * users can hear the actual data points instead of a chart blob.
	 */
	export let ariaLabel: string | undefined = undefined;
	export let srTable: {
		caption: string;
		headers: string[];
		rows: (string | number)[][];
	} | undefined = undefined;

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
		// data-theme is the live mechanism (design review 2026-06-11);
		// the legacy `.dark` class check predates it and is kept as a
		// harmless fallback.
		if (typeof document === 'undefined') return false;
		const el = document.documentElement;
		return el.dataset.theme === 'dark' || el.classList.contains('dark');
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

	// pi24 dogfood: the tick-row plugin shipped in pi24-5e was removed —
	// at 12m/24m axis widths each tick was sub-pixel, and the row pulled
	// the eye toward forensic detail on a glance surface. The correlation
	// question it tried to answer ("did triggers spike with episodes?")
	// is better served by tooltip enrichment at the bin level (see
	// callbacks.afterBody on the caller-side chart options).

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

	// Theme switch re-merges options so tick/grid colors re-read the live
	// CSS vars. Rides the existing debounced update path — cheap.
	$: if (chart && $resolvedTheme) scheduleUpdate();

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
<!-- overflow-hidden: Chart.js momentarily oversizes the <canvas> during the
     resize-observer settle, which can spill a few px past the container on
     narrow viewports. Clip it so it never grows the page. -->
<div class="w-full h-full relative overflow-hidden">
	<canvas
		bind:this={canvas}
		role={ariaLabel ? 'img' : undefined}
		aria-label={ariaLabel}
	></canvas>
	{#if srTable}
		<!-- PI v15 LB-4 — visually hidden data-table mirror. Lets screen-
		     reader users navigate the chart's underlying data points. -->
		<table class="sr-only">
			<caption>{srTable.caption}</caption>
			<thead>
				<tr>
					{#each srTable.headers as h}
						<th scope="col">{h}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each srTable.rows as row}
					<tr>
						{#each row as cell}
							<td>{cell}</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>
{/if}
