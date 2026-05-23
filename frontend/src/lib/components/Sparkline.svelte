<!--
    Sparkline — minimal SVG line chart for /admin dashboard metrics.

    Stateless, takes an array of numbers and renders them as a single
    polyline scaled to the component's width/height. No axes, no legend,
    no library — by design.

    Used by the admin dashboard's sparkline-first metric layout
    ([[project_epilepc_lifecycle_plan]] §Phase walkthrough decisions).
-->
<script lang="ts">
    export let values: number[] = [];
    export let height: number = 32;
    export let width: number = 240;
    export let color: string = 'var(--brand, #b23c2c)';
    /** Stroke width in CSS px. */
    export let stroke: number = 1.5;
    /** Whether to draw a baseline (0-line) underneath. */
    export let baseline: boolean = false;
    /** Optional accessible label. */
    export let label: string = '';

    $: max = values.length > 0 ? Math.max(...values, 1) : 1;
    $: min = values.length > 0 ? Math.min(0, ...values) : 0;
    $: range = Math.max(max - min, 1);
    $: stepX = values.length > 1 ? width / (values.length - 1) : 0;

    $: points = values
        .map((v, i) => {
            const x = i * stepX;
            const y = height - ((v - min) / range) * (height - 2) - 1;
            return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(' ');

    $: lastValue = values.length > 0 ? values[values.length - 1] : 0;
    $: lastX = values.length > 0 ? (values.length - 1) * stepX : 0;
    $: lastY = values.length > 0 ? height - ((lastValue - min) / range) * (height - 2) - 1 : height / 2;
</script>

<svg
    {width}
    {height}
    viewBox="0 0 {width} {height}"
    role="img"
    aria-label={label}
    preserveAspectRatio="none"
    style="display: block; overflow: visible;"
>
    {#if baseline}
        <line
            x1="0"
            y1={height - 1}
            x2={width}
            y2={height - 1}
            stroke="var(--border, #e8e3dd)"
            stroke-width="1"
        />
    {/if}
    {#if values.length > 1}
        <polyline
            points={points}
            fill="none"
            stroke={color}
            stroke-width={stroke}
            stroke-linecap="round"
            stroke-linejoin="round"
        />
        <circle cx={lastX} cy={lastY} r={stroke + 0.5} fill={color} />
    {:else if values.length === 1}
        <circle cx={width / 2} cy={height / 2} r={stroke + 0.5} fill={color} />
    {/if}
</svg>
