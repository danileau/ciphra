<!--
  ciphra* asterisk mark — the living brand element.

  Usage:
    <Asterisk />                     — static mark (logo size)
    <Asterisk size={48} />           — large
    <Asterisk spin />                — legacy fast spinner (kept for back-compat)
    <Asterisk color="ochre" />       — ochre variant
    <Asterisk muted />               — faded (empty state, watermark)

  CIPH-204 modes (mode prop):
    mode="static"   — default, decorative
    mode="loading"  — gentle 3.6s rotation (skeleton placeholder)
    mode="saved"    — quick scale + olive flash (~700ms)
    mode="empty"    — slow opacity pulse (3s, empty-state icon)

  All animations honor `prefers-reduced-motion`.

  The mark is rotated 8° with asymmetric arms — designed, not typed.
-->
<script lang="ts">
	export let size: number = 20;
	export let spin: boolean = false;
	export let muted: boolean = false;
	/** CIPH-891 — `accent` (cohort-aware) is the default. `brand` stays
	 *  invariant for the wordmark + landing where brand identity must
	 *  not shift per cohort. `coral` was a dead variant — removed. */
	export let color: 'accent' | 'brand' | 'ochre' | 'olive' | 'white' | 'muted' = 'accent';
	export let mode: 'static' | 'loading' | 'saved' | 'empty' = 'static';

	/** Maps the `color` prop to a CSS-var reference. `saved` mode forces
	 *  olive (the success token) regardless of `color` so the save flash
	 *  always reads as "completed". */
	const cssVarFor: Record<string, string> = {
		accent: 'var(--accent)',
		brand: 'var(--brand)',
		ochre: 'var(--ochre)',
		olive: 'var(--olive)',
		white: '#ffffff',
		muted: 'var(--text-muted)',
	};

	$: strokeColor = mode === 'saved' ? 'var(--olive)' : (cssVarFor[color] || cssVarFor.accent);
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 48 48"
	class="inline-block ast-root ast-mode-{mode}"
	class:asterisk-spin-anim={spin}
	style="opacity: {muted ? 0.15 : 1}; --asterisk-stroke: {strokeColor};"
	aria-hidden="true"
>
	<g transform="translate(24,24) rotate(8)" style="stroke: var(--asterisk-stroke);" stroke-linecap="round" fill="none">
		<path d="M -10.56 0 L 10.56 0" stroke-width={2.0 * (48 / size > 2 ? 1.5 : 1)} />
		<path d="M -4.33 -7.5 L 4.33 7.5" stroke-width={1.63 * (48 / size > 2 ? 1.5 : 1)} />
		<path d="M 4.17 -7.22 L -4.17 7.22" stroke-width={1.44 * (48 / size > 2 ? 1.5 : 1)} />
	</g>
</svg>

<style>
	.asterisk-spin-anim {
		animation: asteriskSpin 1.8s ease-in-out infinite;
	}
	@keyframes asteriskSpin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	/* CIPH-204: living-state modes */
	.ast-root {
		transform-origin: center;
	}
	/* Loading: faster + ease-out so the rotation reads as motion within
	   ~1s, not a sleepy 3.6s sweep that looks static. */
	.ast-mode-loading {
		animation: astLoading 1.4s linear infinite;
	}
	@keyframes astLoading {
		0%   { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	/* Saved: scale + olive flash. Reduced-motion DOES still get the
	   olive color-swap below — only the scale animation is killed,
	   so blind/SR users still hear the flash via the live region in
	   the parent and sighted reduced-motion users still see green. */
	.ast-mode-saved {
		animation: astSaved 700ms ease-out;
	}
	@keyframes astSaved {
		0%   { transform: scale(1); }
		40%  { transform: scale(1.25); }
		100% { transform: scale(1); }
	}

	/* Empty: pulse the OUTER size (scale) instead of opacity, so the
	   mark visibly "breathes" rather than faintly blinking. Distinct
	   from static (no motion) and loading (rotation). */
	.ast-mode-empty {
		animation: astEmpty 2.4s ease-in-out infinite;
		transform-origin: center;
	}
	@keyframes astEmpty {
		0%, 100% { transform: scale(0.92); opacity: 0.55; }
		50%      { transform: scale(1.04); opacity: 0.85; }
	}

	@media (prefers-reduced-motion: reduce) {
		.asterisk-spin-anim,
		.ast-mode-loading,
		.ast-mode-saved,
		.ast-mode-empty {
			animation: none !important;
		}
	}
</style>
