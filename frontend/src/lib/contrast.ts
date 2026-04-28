/**
 * WCAG contrast helper — minimal, dependency-free.
 *
 * Used by `cohortPalette.test.ts` (CIPH-890) to assert each cohort tone
 * achieves at least 3:1 against the app's `--surface` cream so chart
 * bars / dots / band fills stay legible. Tones intended for text use
 * separately need ≥4.5:1; chart-only tones live in CHART_ONLY_TONES.
 *
 * Reference: https://www.w3.org/WAI/WCAG22/Techniques/general/G18
 */

/** Linearise an sRGB channel value (0..1) per WCAG. */
function channelLuminance(c: number): number {
	return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Relative luminance per WCAG 2.x. Accepts `#rrggbb` (3- or 6-digit). */
export function relativeLuminance(hex: string): number {
	const m = hex.replace('#', '');
	const full =
		m.length === 3
			? m.split('').map((ch) => ch + ch).join('')
			: m;
	const r = parseInt(full.slice(0, 2), 16) / 255;
	const g = parseInt(full.slice(2, 4), 16) / 255;
	const b = parseInt(full.slice(4, 6), 16) / 255;
	return (
		0.2126 * channelLuminance(r) +
		0.7152 * channelLuminance(g) +
		0.0722 * channelLuminance(b)
	);
}

/** WCAG contrast ratio between two hex colors. Returns a number in [1, 21]. */
export function contrastRatio(a: string, b: string): number {
	const la = relativeLuminance(a);
	const lb = relativeLuminance(b);
	const light = Math.max(la, lb);
	const dark = Math.min(la, lb);
	return (light + 0.05) / (dark + 0.05);
}
