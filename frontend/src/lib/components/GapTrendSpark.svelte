<script lang="ts">
	// CIPH-pi24-5c — Marker-event gap-trend sparkline. Renders the gap (days)
	// between successive marker events as a tiny inline-SVG line: historical
	// gaps as filled dots, the current in-progress gap as a hollow trailing
	// dot. The shape carries the morbus-AI signal — slope up = gaps growing
	// (treatment working), slope down = regressing. A static "longest gap so
	// far" line below provides a reference point without leaderboard framing.
	// Klara's prior streak objection (Companion.svelte:124) is met by showing
	// trend, not a single resetting counter — and by hiding the card entirely
	// when the preset doesn't declare a `markerEvent` (chronic_pain, burnout,
	// depression, etc.).
	import { t } from '$lib/i18n';

	export let historicalGaps: number[];
	export let currentGap: number;
	export let bestGap: number;
	export let accentHex: string;
	export let nounLabel: string;

	const W = 280;
	const H = 96;
	const PAD_X = 10;
	const PAD_Y = 14;

	$: allPoints = [...historicalGaps, currentGap];
	$: maxY = Math.max(...allPoints, 1);
	$: stepX = allPoints.length > 1 ? (W - 2 * PAD_X) / (allPoints.length - 1) : 0;
	$: points = allPoints.map((v, i) => ({
		x: PAD_X + i * stepX,
		y: PAD_Y + (1 - v / maxY) * (H - 2 * PAD_Y),
		v,
		inProgress: i === allPoints.length - 1,
	}));
	$: polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');
	$: areaPath = points.length
		? `M${points[0].x},${H - PAD_Y / 2} L${points.map((p) => `${p.x},${p.y}`).join(' L')} L${points[points.length - 1].x},${H - PAD_Y / 2} Z`
		: '';
</script>

<section class="card p-5" style="border-top: 3px solid {accentHex}">
	<p class="text-[10px] font-semibold uppercase tracking-wider mb-1" style="color: var(--text-muted)">
		{$t('companion.streak_no_type', { type: nounLabel })}
	</p>
	<div class="flex items-baseline gap-2 mb-3">
		<span class="text-4xl font-bold num-data leading-none" style="color: {accentHex}">{currentGap}</span>
		<span class="text-xs" style="color: var(--text-muted)">{$t('common.days')}</span>
	</div>

	<svg
		viewBox="0 0 {W} {H}"
		width="100%"
		height={H}
		role="img"
		aria-label={$t('companion.marker_sr', {
			noun: nounLabel,
			gaps: historicalGaps.join(', '),
			current: currentGap,
		})}
		style="display: block"
	>
		<path d={areaPath} fill={accentHex} opacity="0.08" />
		<polyline
			points={polylinePoints}
			fill="none"
			stroke={accentHex}
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			opacity="0.8"
		/>
		{#each points as p}
			{#if p.inProgress}
				<circle cx={p.x} cy={p.y} r="5" fill="var(--surface-card)" stroke={accentHex} stroke-width="2" />
				<circle cx={p.x} cy={p.y} r="2" fill={accentHex} />
			{:else}
				<circle cx={p.x} cy={p.y} r="3" fill={accentHex} />
			{/if}
		{/each}
	</svg>

	<p class="text-[11px] mt-2" style="color: var(--text-muted)">
		{$t('companion.marker_best', { days: bestGap })}
	</p>
</section>
