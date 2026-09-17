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

	// Dose bands (2026-09-17) — the before/after structure behind a chart:
	// a medication's dose periods as subtle background shades with a thin
	// boundary where the dose changed (geometry: lib/reports/doseBands.ts).
	// Callers opt in with `options.plugins.doseBands`; charts without it are
	// untouched. Drawn BEFORE the datasets so the data line stays on top.
	// Not the rejected per-event tick row: one labelled boundary per change,
	// not a mark per day.
	type DoseBandsCfg = {
		bands?: Array<{ start: number; end: number; label: string; shaded: boolean }>;
		boundaries?: Array<{ at: number }>;
	};
	function bandGeometry(c: any) {
		const cfg = c.options?.plugins?.doseBands as DoseBandsCfg | undefined;
		if (!cfg?.bands?.length) return null;
		const xScale = c.scales?.x;
		const area = c.chartArea;
		const count = c.data?.labels?.length ?? 0;
		if (!xScale || !area || count === 0) return null;
		const x0 = xScale.getPixelForValue(0);
		const step = count > 1 ? (xScale.getPixelForValue(count - 1) - x0) / (count - 1) : area.right - area.left;
		const px = (pos: number) => Math.min(area.right, Math.max(area.left, x0 + pos * step));
		const root = getComputedStyle(document.documentElement);
		return {
			cfg,
			area,
			px,
			olive: root.getPropertyValue('--olive-rgb').trim() || '127, 130, 27',
			muted: root.getPropertyValue('--text-muted').trim() || '#8a7f73',
			surface: root.getPropertyValue('--surface-card').trim() || '#ffffff',
		};
	}
	const doseBandsPlugin = {
		id: 'doseBands',
		// Shades and boundaries go BEHIND the data …
		beforeDatasetsDraw(c: any) {
			const g = bandGeometry(c);
			if (!g) return;
			const ctx = c.ctx;
			ctx.save();
			for (const band of g.cfg.bands ?? []) {
				const left = g.px(band.start);
				const right = g.px(band.end);
				if (!band.shaded || right - left < 1) continue;
				ctx.fillStyle = `rgba(${g.olive}, ${isDarkMode() ? 0.16 : 0.1})`;
				ctx.fillRect(left, g.area.top, right - left, g.area.bottom - g.area.top);
			}
			ctx.strokeStyle = `rgba(${g.olive}, 0.75)`;
			ctx.lineWidth = 1;
			ctx.setLineDash([3, 3]);
			for (const b of g.cfg.boundaries ?? []) {
				const x = Math.round(g.px(b.at)) + 0.5;
				ctx.beginPath();
				ctx.moveTo(x, g.area.top);
				ctx.lineTo(x, g.area.bottom);
				ctx.stroke();
			}
			ctx.restore();
		},
		// … and the labels ABOVE the plot area, in the strip the caller reserves
		// with `layout.padding.top`. A label inside the plot collides with any
		// data line that reaches the top (a peak month), and drawing it on a
		// backing pill only moves the collision onto the line. Up here the two
		// never share a pixel.
		afterDatasetsDraw(c: any) {
			const g = bandGeometry(c);
			if (!g) return;
			const ctx = c.ctx;
			ctx.save();
			ctx.font = '10px system-ui, sans-serif';
			ctx.textBaseline = 'bottom';
			ctx.fillStyle = g.muted;
			const y = g.area.top - 4;
			for (const band of g.cfg.bands ?? []) {
				const left = g.px(band.start);
				const right = g.px(band.end);
				const width = ctx.measureText(band.label).width;
				if (width + 6 > right - left) continue;
				ctx.fillText(band.label, left + 3, y);
			}
			ctx.restore();
		},
	};

	onMount(async () => {
		const mod = await import('chart.js');
		Chart = mod.Chart;
		Chart.register(...mod.registerables);

		chart = new Chart(canvas, {
			type,
			data,
			options: mergeDefaults(options),
			plugins: [doseBandsPlugin],
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
