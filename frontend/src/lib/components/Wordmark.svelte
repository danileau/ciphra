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

	// Geometry — empirically matched to the hand-rolled originals.
	$: width = Math.round(size * 4.286);
	$: viewBoxW = 150;
	$: viewBoxH = 36;
	$: textY = 27;
	$: textSize = 26;
	$: astTranslate = '98,8';
	$: astSize = 5; // arm half-length in viewBox units
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
	<g
		transform="translate({astTranslate}) rotate(8)"
		style="stroke: {markStroke}"
		stroke-linecap="round"
		fill="none"
	>
		<path d="M -{astSize} 0 L {astSize} 0" stroke-width="1.3" />
		<path d="M -2 -3.5 L 2 3.5" stroke-width="1" />
		<path d="M 2 -3.3 L -2 3.3" stroke-width="0.9" />
	</g>
</svg>

<style>
	.wordmark {
		display: inline-block;
		vertical-align: middle;
	}
</style>
