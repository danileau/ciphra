<!--
  ciphra* asterisk mark — the living brand element.

  Usage:
    <Asterisk />                     — static mark (logo size)
    <Asterisk size={48} />           — large
    <Asterisk spin />                — loading spinner
    <Asterisk color="ochre" />       — ochre variant
    <Asterisk muted />               — faded (empty state, watermark)

  The mark is rotated 8° with asymmetric arms — designed, not typed.
-->
<script lang="ts">
	export let size: number = 20;
	export let spin: boolean = false;
	export let muted: boolean = false;
	export let color: 'brand' | 'ochre' | 'olive' | 'coral' | 'white' | 'muted' = 'brand';

	const colors: Record<string, string> = {
		brand: '#b23c2c',
		ochre: '#9f630b',
		olive: '#7f821b',
		coral: '#e07360',
		white: '#ffffff',
		muted: '#97918a',
	};

	$: strokeColor = colors[color] || colors.brand;
	$: scale = size / 48;
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 48 48"
	class="inline-block {spin ? 'asterisk-spin-anim' : ''}"
	style="opacity: {muted ? 0.15 : 1}"
	aria-hidden="true"
>
	<g transform="translate(24,24) rotate(8)" stroke={strokeColor} stroke-linecap="round" fill="none">
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
</style>
