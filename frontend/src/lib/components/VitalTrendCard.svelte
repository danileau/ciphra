<!--
	pi24 dashboard — VitalTrendCard.

	Renders when resolvePrimaryDashboardCard returns kind='vital-trend'.
	Used by hashimoto (TSH), hypertension (bp_systolic), cardiovascular
	(bp_systolic), diabetes (blood_sugar), parkinson (tremor_intensity),
	bipolar between flares (mood_polarity).

	Mirrors the HowAreYou sparkline-hero shape so the dashboard's primary
	slot reads consistently across cohorts: title + last-value headline +
	12-month line + "Verlauf ansehen →" link to /reports. Pinned default
	vital — NO chip selector here per campfire consensus; the dashboard
	has an opinion. Multi-vital cohorts get a small secondary-vitals
	footer link nudging them to /reports for the deep view.

	Sparse-data safe: lab cohorts (hashimoto) typically have 4–12 points/
	year; the chart still reads even with sparse months because Chart.js
	draws line segments through whatever bins have values.
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
	export let accentHex: string = '#b23c2c';
	export let neutralHex: string = '#5c6b73';

	$: primaryVital = (bp?.vitals || []).find((v) => v.id === primaryVitalId) as VitalField | undefined;
	$: secondariesWithData = secondaryVitalIds.filter((id) => {
		for (const d of docs) {
			if (d.data?.type !== 'entry') continue;
			const v = (d.data.vitals || {})[id];
			if (v !== '' && v !== null && v !== undefined) return true;
		}
		return false;
	});

	/**
	 * 12-month monthly-mean series for the primary vital. Sparse months
	 * (no readings) become null so Chart.js doesn't draw misleading
	 * straight-line interpolation across them. spanGaps:true on the
	 * dataset lets the line bridge the gap visually but the absent month
	 * is still legible as a missing dot.
	 */
	$: trend = (() => {
		if (!primaryVital) return null;
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
		// Track last value for the headline.
		let lastValue: number | null = null;
		let lastDate: string | null = null;
		let prevValue: number | null = null;
		for (const doc of docs) {
			if (doc.data?.type !== 'entry') continue;
			const ds = String(doc.data.date || '');
			if (ds.length < 7) continue;
			const idx = months.findIndex((mo) => ds.startsWith(mo.key));
			const vitals = (doc.data.vitals || {}) as Record<string, unknown>;
			const raw = vitals[primaryVitalId];
			if (raw === '' || raw === null || raw === undefined) continue;
			// Multi-entry vitals store the time-keyed series as an object —
			// accept both number and object-with-values shape.
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
			const sum = values.reduce((a, b) => a + b, 0);
			if (idx >= 0) {
				sums[idx] += sum;
				counts[idx] += values.length;
			}
			// Track most-recent reading for the headline. Tie-break by date.
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
	})();

	$: chartData = trend
		? {
				labels: trend.months.map((m) => m.label),
				datasets: [
					{
						label: primaryVital ? $t(primaryVital.label) : primaryVitalId,
						data: trend.series,
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
			}
		: null;

	$: chartOptions = (() => {
		// Optional reference-line annotation (e.g. BP target, HbA1c target).
		const ref = primaryVital?.referenceLine;
		return {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: { display: false },
				tooltip: {
					callbacks: {
						title: (items: Array<{ dataIndex: number }>) => {
							if (!trend || !items.length) return '';
							const mo = trend.months[items[0].dataIndex];
							return new Date(mo.y, mo.m, 1).toLocaleDateString($locale, { month: 'long', year: 'numeric' });
						},
					},
				},
			},
			scales: {
				y: {
					type: 'linear' as const,
					beginAtZero: false,
					ticks: { font: { size: 10 }, color: neutralHex, maxTicksLimit: 5 },
					grid: { color: 'rgba(0,0,0,0.04)' },
					border: { display: false },
					...(ref
						? {
								// Chart.js doesn't draw reference lines without the
								// annotation plugin; we render them as an extra grid
								// tick via afterFit hint isn't worth wiring here. Skip
								// for now — the value is on the headline.
							}
						: {}),
				},
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
		};
	})();

	function formatValue(v: number | null): string {
		if (v === null) return '';
		// Keep two significant decimals for lab values (TSH 4.27 mU/L),
		// integers for BP / pulse / mood scales. Heuristic: if abs > 20,
		// integer; else 1-decimal.
		return Math.abs(v) >= 20 ? String(Math.round(v)) : v.toFixed(1);
	}
	$: delta = trend && trend.prevValue !== null && trend.lastValue !== null
		? trend.lastValue - trend.prevValue
		: null;
	$: deltaArrow = delta === null ? '' : delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
</script>

{#if trend && chartData}
	<a
		href="/reports"
		class="card card-rhythmic vital-hero block no-underline"
		aria-label={primaryVital ? $t('companion.vital_trend_aria', { label: $t(primaryVital.label) }) : ''}
	>
		<div class="flex items-baseline justify-between gap-2 mb-2">
			<h2 class="text-sm font-semibold" style="color: var(--text-primary)">
				{primaryVital ? $t(primaryVital.label) : primaryVitalId}
			</h2>
			<span class="text-xs vital-link" style="color: var(--accent)">
				{$t('companion.how_view_trend')} →
			</span>
		</div>
		{#if trend.lastValue !== null}
			<p class="text-base font-medium mb-3" style="color: var(--text-primary)">
				<span class="num-data">{formatValue(trend.lastValue)}</span>
				{#if primaryVital?.unit}
					<span class="text-sm" style="color: var(--text-muted)">{primaryVital.unit}</span>
				{/if}
				{#if delta !== null}
					<span aria-hidden="true" class="text-sm ml-2" style="color: var(--text-muted)">
						{deltaArrow} {formatValue(Math.abs(delta))}
					</span>
				{/if}
			</p>
		{/if}
		<div class="vital-spark">
			<ChartWrapper type="line" data={chartData} options={chartOptions} />
		</div>
		{#if secondariesWithData.length > 0}
			<p class="text-xs mt-3" style="color: var(--text-muted)">
				{plural($t, $locale, 'companion.vital_trend_secondary_count', secondariesWithData.length)}
			</p>
		{/if}
	</a>
{/if}

<style>
	.vital-hero {
		text-decoration: none;
		transition: border-color 0.15s ease-out;
	}
	.vital-hero:hover,
	.vital-hero:focus-visible {
		border-color: var(--accent);
	}
	.vital-hero:hover .vital-link,
	.vital-hero:focus-visible .vital-link {
		text-decoration: underline;
	}
	.vital-spark {
		height: 200px;
	}
	@media (min-width: 768px) {
		.vital-spark {
			height: 240px;
		}
	}
</style>
