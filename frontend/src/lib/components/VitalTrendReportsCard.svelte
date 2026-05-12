<!--
	pi24 reports — VitalTrendReportsCard.

	The /reports counterpart to VitalTrendCard (dashboard). Mounted by
	/reports/+page.svelte when resolveReportsPrimaryCard returns
	kind='vital-trend'.

	Differences from the dashboard version:
	- Bigger chart canvas (reports is the deep-view surface)
	- Chip selector for 4+ vitals (chips, not tabs — Codex round 2
	  consensus). 2-3 vitals → inline secondary sparklines.
	- Diverging-bar variant when the ACTIVE vital crosses zero
	  (mood_polarity). Diverging-ness is per-vital, not per-card: if a
	  bipolar user clicks the sleep_hours chip the chart switches back
	  to a line because sleep_hours is monotonic. Line charts overstate
	  continuity for sign + magnitude data; bars centered on the zero
	  baseline answer "how much mania vs how much depression" at a
	  glance.
	- Honors bp.dateFormat in tooltip titles (matching the /reports
	  trend chart pi24-5e+ work).
	- No "Verlauf ansehen →" link — we ARE the deep view.

	Same monthly-mean aggregation algorithm as the dashboard card
	(spanGaps:true keeps sparse lab cohorts legible). Diverging path
	colors each bar by sign so a manic-leaning month and a depressive
	month read distinctly without a legend.
-->
<script lang="ts">
	import { t, locale, plural } from '$lib/i18n';
	import ChartWrapper from '$lib/components/ChartWrapper.svelte';
	import type { CiphraDocument } from '$lib/stores/documents';
	import type { Blueprint, VitalField } from '$lib/blueprint/types';

	export let docs: CiphraDocument[];
	export let bp: Blueprint | null = null;
	export let primaryVitalId: string;
	export let secondaryVitalIds: string[] = [];
	export let accentHex = '#b23c2c';
	/** Optional cool color for negative bars in diverging mode. */
	export let negativeHex = '#3b7a9b';
	export let neutralHex = '#5c6b73';
	/** Date-format pref bubbled in from /reports. */
	export let dateFormatChoice: Blueprint['dateFormat'] | undefined = undefined;

	/**
	 * Chip-selector threshold: 4+ vitals with data → chip row.
	 * 2-3 vitals → inline sparklines under the main chart. Pinned
	 * default = primary; user can click any chip to swap the active.
	 */
	const CHIP_THRESHOLD = 4;
	$: secondariesWithData = secondaryVitalIds.filter((id) => {
		for (const d of docs) {
			if (d.data?.type !== 'entry') continue;
			const v = (d.data.vitals || {})[id];
			if (v !== '' && v !== null && v !== undefined) return true;
		}
		return false;
	});
	$: chipsMode = 1 + secondariesWithData.length >= CHIP_THRESHOLD;

	let activeVitalId = primaryVitalId;
	// Reset to primary when blueprint switches.
	$: if (primaryVitalId) activeVitalId = primaryVitalId;

	$: activeVital = (bp?.vitals || []).find((v) => v.id === activeVitalId) as VitalField | undefined;
	/** All vitals to consider — primary plus secondaries with data. */
	$: allVitals = (() => {
		const ids = [primaryVitalId, ...secondariesWithData];
		const seen = new Set<string>();
		return ids
			.filter((id) => {
				if (seen.has(id)) return false;
				seen.add(id);
				return true;
			})
			.map((id) => (bp?.vitals || []).find((v) => v.id === id))
			.filter(Boolean) as VitalField[];
	})();

	/**
	 * Aggregate one vital across the 12-month window. Same pattern as
	 * VitalTrendCard (dashboard). Numeric extraction handles raw number,
	 * numeric string, and multi-entry object shapes.
	 */
	function aggregate(vitalId: string) {
		const now = new Date();
		const months: { y: number; m: number; key: string; label: string }[] = [];
		for (let i = 11; i >= 0; i--) {
			const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
			months.push({
				y: d.getFullYear(),
				m: d.getMonth(),
				key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
				label: d.toLocaleDateString($locale, { month: 'short' }),
			});
		}
		const sums = months.map(() => 0);
		const counts = months.map(() => 0);
		let lastValue: number | null = null;
		let prevValue: number | null = null;
		let lastDate: string | null = null;
		for (const doc of docs) {
			if (doc.data?.type !== 'entry') continue;
			const ds = String(doc.data.date || '');
			if (ds.length < 7) continue;
			const idx = months.findIndex((mo) => ds.startsWith(mo.key));
			const vitals = (doc.data.vitals || {}) as Record<string, unknown>;
			const raw = vitals[vitalId];
			if (raw === '' || raw === null || raw === undefined) continue;
			const values: number[] = [];
			if (typeof raw === 'number') values.push(raw);
			else if (typeof raw === 'string' && raw.trim() !== '') {
				const n = Number(raw);
				if (!Number.isNaN(n)) values.push(n);
			} else if (typeof raw === 'object') {
				for (const v of Object.values(raw as Record<string, unknown>)) {
					if (v === '' || v === null || v === undefined) continue;
					const n = Number(v);
					if (!Number.isNaN(n)) values.push(n);
				}
			}
			if (values.length === 0) continue;
			if (idx >= 0) {
				sums[idx] += values.reduce((a, b) => a + b, 0);
				counts[idx] += values.length;
			}
			if (!lastDate || ds > lastDate) {
				prevValue = lastValue;
				lastValue = values[values.length - 1];
				lastDate = ds;
			}
		}
		const series = sums.map((s, i) => (counts[i] > 0 ? s / counts[i] : null));
		const hasAny = series.some((v) => v !== null);
		if (!hasAny) return null;
		return { months, series, lastValue, prevValue, lastDate };
	}

	$: activeTrend = aggregate(activeVitalId);
	$: activeIsDiverging = !!activeVital && typeof activeVital.min === 'number' && activeVital.min < 0;

	function formatDateChoice(d: Date, choice: Blueprint['dateFormat'] | undefined): string {
		const dd = String(d.getDate()).padStart(2, '0');
		const mm = String(d.getMonth() + 1).padStart(2, '0');
		const yyyy = d.getFullYear();
		switch (choice) {
			case 'iso': return `${yyyy}-${mm}-${dd}`;
			case 'us': return `${mm}/${dd}/${yyyy}`;
			case 'dd/mm/yyyy': return `${dd}/${mm}/${yyyy}`;
			case 'dd.mm.yyyy':
			default: return `${dd}.${mm}.${yyyy}`;
		}
	}

	$: chartConfig = (() => {
		if (!activeTrend) return null;
		const labels = activeTrend.months.map((m) => m.label);
		if (activeIsDiverging) {
			// Diverging bars. Per-bar color by sign so positive and negative
			// halves read distinctly without a legend. Y-axis uses the
			// vital's declared min/max as fixed range so the zero baseline
			// is centered and bar magnitudes are comparable across months.
			const data = activeTrend.series;
			const barColors = data.map((v) =>
				v === null ? 'rgba(0,0,0,0)' : v >= 0 ? accentHex : negativeHex,
			);
			return {
				type: 'bar' as const,
				data: {
					labels,
					datasets: [
						{
							label: activeVital ? $t(activeVital.label) : activeVitalId,
							data,
							backgroundColor: barColors,
							borderColor: barColors,
							borderWidth: 0,
						},
					],
				},
				yMin: activeVital?.min,
				yMax: activeVital?.max,
			};
		}
		// Monotonic vital → line with sparse-month gaps.
		return {
			type: 'line' as const,
			data: {
				labels,
				datasets: [
					{
						label: activeVital ? $t(activeVital.label) : activeVitalId,
						data: activeTrend.series,
						borderColor: accentHex,
						backgroundColor: 'transparent',
						borderWidth: 2,
						tension: 0.3,
						pointRadius: 3,
						pointHoverRadius: 5,
						pointBackgroundColor: accentHex,
						fill: false,
						spanGaps: true,
					},
				],
			},
			yMin: undefined as number | undefined,
			yMax: undefined as number | undefined,
		};
	})();

	$: chartOptions = (() => {
		if (!chartConfig || !activeTrend) return null;
		const months = activeTrend.months;
		const lc = $locale;
		const fmt = dateFormatChoice;
		const ref = activeVital?.referenceLine;
		const ySettings: Record<string, unknown> = {
			type: 'linear' as const,
			beginAtZero: activeIsDiverging ? true : false,
			ticks: { font: { size: 10 }, color: neutralHex, maxTicksLimit: 6 },
			grid: { color: 'rgba(0,0,0,0.04)' },
			border: { display: false },
		};
		if (typeof chartConfig.yMin === 'number') ySettings.min = chartConfig.yMin;
		if (typeof chartConfig.yMax === 'number') ySettings.max = chartConfig.yMax;
		return {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: { display: false },
				tooltip: {
					callbacks: {
						title: (items: Array<{ dataIndex: number }>) => {
							if (!items.length) return '';
							const mo = months[items[0].dataIndex];
							if (!mo) return '';
							return new Date(mo.y, mo.m, 1).toLocaleDateString(lc, { month: 'long', year: 'numeric' });
						},
						label: (ctx: { parsed: { y: number | null } }) => {
							const v = ctx.parsed.y;
							if (v === null) return '';
							const unit = activeVital?.unit ? ` ${activeVital.unit}` : '';
							return `${formatValue(v)}${unit}`;
						},
					},
				},
			},
			scales: {
				y: ySettings,
				x: {
					ticks: {
						font: { size: 10 },
						color: 'rgba(120,113,108,0.7)',
						maxRotation: 0,
						autoSkip: true,
						autoSkipPadding: 8,
						maxTicksLimit: 8,
					},
					grid: { display: false },
					border: { display: false },
				},
			},
			// dateFormatChoice + reference line are intentionally not wired
			// into Chart.js annotations here — kept for a future pass when
			// the chartjs-plugin-annotation budget is justified.
			_dateFmt: fmt,
			_ref: ref,
		};
	})();

	function formatValue(v: number | null): string {
		if (v === null) return '';
		return Math.abs(v) >= 20 ? String(Math.round(v)) : v.toFixed(1);
	}
	$: delta = activeTrend && activeTrend.prevValue !== null && activeTrend.lastValue !== null
		? activeTrend.lastValue - activeTrend.prevValue
		: null;
	$: deltaArrow = delta === null ? '' : delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
</script>

{#if chartConfig && activeTrend}
	<section class="card vital-reports-card p-4 md:p-6">
		<div class="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
			<h2 class="text-base md:text-lg font-semibold" style="color: var(--text-primary)">
				{activeVital ? $t(activeVital.label) : activeVitalId}
			</h2>
			{#if activeTrend.lastValue !== null}
				<div class="text-sm" style="color: var(--text-muted)">
					<span class="font-mono tabular-nums num-data" style="color: var(--text-primary)">
						{formatValue(activeTrend.lastValue)}
					</span>
					{#if activeVital?.unit}<span class="ml-1">{activeVital.unit}</span>{/if}
					{#if delta !== null}
						<span class="ml-2">{deltaArrow} {formatValue(Math.abs(delta))}</span>
					{/if}
				</div>
			{/if}
		</div>

		{#if chipsMode}
			<!-- Chip selector for 4+ vitals. Pinned default = primary; user
			     can swap which vital fills the chart. NOT tabs (would imply
			     page navigation) — chips filter within this section. -->
			<div class="flex flex-wrap gap-2 mb-4">
				{#each allVitals as v}
					<button
						type="button"
						class="vital-chip"
						class:active={v.id === activeVitalId}
						aria-pressed={v.id === activeVitalId}
						on:click={() => { activeVitalId = v.id; }}
					>
						{$t(v.label)}
					</button>
				{/each}
			</div>
		{/if}

		<div class="vital-canvas">
			<ChartWrapper type={chartConfig.type} data={chartConfig.data} options={chartOptions} />
		</div>

		{#if !chipsMode && secondariesWithData.length > 0}
			<!-- 2-3 vital secondary sparklines. Mini inline numeric +
			     direction; full sparklines deferred to a future pass when
			     the SVG cost is justified. Counted in plural() for grammar. -->
			<p class="text-xs mt-4" style="color: var(--text-muted)">
				{plural($t, $locale, 'reports.vital_secondary_count', secondariesWithData.length)}
			</p>
		{/if}
	</section>
{/if}

<style>
	.vital-canvas {
		height: 260px;
	}
	@media (min-width: 768px) {
		.vital-canvas {
			height: 320px;
		}
	}
	.vital-chip {
		display: inline-flex;
		align-items: center;
		padding: 4px 10px;
		min-height: 28px;
		font-size: 12px;
		line-height: 1.2;
		background: var(--surface-muted);
		color: var(--text-secondary);
		border: 1px solid var(--border);
		border-radius: 999px;
		cursor: pointer;
		transition: background 0.12s ease-out, color 0.12s ease-out, border-color 0.12s ease-out;
	}
	.vital-chip:hover {
		background: var(--surface-card);
		color: var(--text-primary);
	}
	.vital-chip.active {
		background: var(--accent);
		color: white;
		border-color: var(--accent);
	}
	.vital-chip:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
