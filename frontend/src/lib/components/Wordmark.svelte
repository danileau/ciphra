<!--
	CIPH-896 — Wordmark primitive.

	"ciphra*" — the canonical brand mark. Text + asterisk sized
	relatively to a single `size` prop. Replaces 5+ hand-rolled SVG
	implementations (landing nav, landing hero, landing footer, layout
	header, /migrate header) so the mark stays consistent + cohort
	identity stays intact (text always uses --text-primary, asterisk
	always --brand — the wordmark is invariant by design, NOT
	cohort-tinted).

	The asterisk paths mirror `Asterisk.svelte` exactly — same 8°
	rotation, same arm geometry, same stroke-width ratio. The two
	primitives stay in sync via the audit test in
	`lib/wordmark-consolidation.test.ts`.
-->
<script lang="ts">
	/** Height of the wordmark in CSS pixels. Text + asterisk scale together. */
	export let size: number = 28;
	/** Color of the asterisk strokes. `brand` is the default and almost
	 *  always correct — wordmark identity is invariant. `muted` for
	 *  faded watermark contexts. */
	export let mark: 'brand' | 'muted' = 'brand';
	/** Optional `aria-label` override. Defaults to "ciphra". */
	export let ariaLabel: string = 'ciphra';

	// Geometry — asterisk hugs the wordmark as a trailing glyph. Inter's
	// rendered "ciphra" at font-size 26 with letter-spacing 0.5 ends near
	// x≈80 in the viewBox, so the asterisk centre sits at x=82 with arms
	// reaching across the gap. Earlier x=84 left a perceptible 1.5-glyph
	// gap on desktop; pulling it 2 units closer makes the mark read as
	// one word at every size from 28 to 64.
	$: viewBoxW = 100;
	$: viewBoxH = 36;
	$: width = Math.round(size * (viewBoxW / viewBoxH));
	$: textY = 27;
	$: textSize = 26;
	$: astTranslate = '82,8';
	$: astSize = 5.4; // arm half-length in viewBox units
	$: markStroke =
		mark === 'muted' ? 'var(--text-muted)' : 'var(--brand)';
</script>

<svg
	viewBox="0 0 {viewBoxW} {viewBoxH}"
	width={width}
	height={size}
	role="img"
	aria-label={ariaLabel}
	class="wordmark"
>
	<text
		x="0"
		y={textY}
		font-family="Inter, DM Sans, sans-serif"
		font-size={textSize}
		font-weight="500"
		letter-spacing="0.5"
		style="fill: var(--text-primary)"
	>ciphra</text>
	<!-- Two nested groups so external motion (e.g. landing hero settle)
	     can animate rotate/scale on the inner <g> without clobbering the
	     position translate. The outer group anchors the asterisk in the
	     viewBox; the inner `.wordmark-asterisk` handles its rest 8°
	     rotation and is the one motion targets. transform-origin: 0 0
	     keeps the rotation pivot at the asterisk centre, since the
	     outer translate has already moved us there. -->
	<g transform="translate({astTranslate})">
		<g
			class="wordmark-asterisk"
			transform="rotate(8)"
			style="stroke: {markStroke}; transform-origin: 0 0;"
			stroke-linecap="round"
			fill="none"
		>
			<path d="M -{astSize} 0 L {astSize} 0" stroke-width="1.3" />
			<path d="M -2 -3.5 L 2 3.5" stroke-width="1" />
			<path d="M 2 -3.3 L -2 3.3" stroke-width="0.9" />
		</g>
	</g>
</svg>

<style>
	.wordmark {
		display: inline-block;
		vertical-align: middle;
	}
</style>
