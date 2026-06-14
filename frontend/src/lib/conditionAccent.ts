/**
 * CIPH-921c — Condition-driven app accent.
 *
 * The authed app's primary chrome accent (`--accent` + companions) was set
 * per COHORT in app.css (`[data-cohort="phase"] { --accent: violet }`, …), so
 * every condition in a cohort shared one accent — and it diverged from the
 * per-condition color shown on `/conditions` and the dashboard badge. Rita
 * (rheumatoid_arthritis, phase cohort) got violet buttons while `/conditions`
 * shows her in rust. This derives the accent trio from the CONDITION color
 * instead, injected as inline custom-props on `<main>` (see +layout.svelte),
 * which overrides the cohort defaults for the whole authed surface.
 *
 * Source of truth for the hue is `conditionInfoMap[id].color` (the same value
 * `/conditions` uses), with the blueprint's own `accentColor` then the cohort
 * slot-1 as fallbacks — mirrors the badge logic in Companion.svelte.
 */
import { conditionInfoMap } from './conditionInfo';
import { cohortPalette } from './cohortPalette';
import { cohortOf } from './blueprint/cohort';
import type { Blueprint } from './blueprint/types';

export interface ConditionAccent {
	/** Primary accent hex (button/link/ring fill). */
	hex: string;
	/** Hover state — the accent at −8% lightness, matching the app.css convention. */
	hover: string;
	/** "r, g, b" triple for `rgba(var(--accent-rgb), α)` call sites. */
	rgb: string;
}

function clampHexChannel(n: number): number {
	return Math.max(0, Math.min(255, Math.round(n)));
}

/** #rrggbb → [r,g,b] (0..255). Tolerates #rgb and a leading #. */
export function hexToRgb(hex: string): [number, number, number] {
	let h = hex.replace('#', '').trim();
	if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
	const int = parseInt(h, 16);
	return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
	const c = (n: number) => clampHexChannel(n).toString(16).padStart(2, '0');
	return `#${c(r)}${c(g)}${c(b)}`;
}

/** Darken a hex by `amount` in HSL-lightness space (0..1). Used for hover. */
export function darkenHex(hex: string, amount = 0.08): string {
	const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	let h = 0;
	const l = (max + min) / 2;
	const d = max - min;
	const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
	if (d !== 0) {
		if (max === r) h = ((g - b) / d) % 6;
		else if (max === g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
		h *= 60;
		if (h < 0) h += 360;
	}
	const l2 = Math.max(0, l - amount);
	// HSL → RGB
	const c = (1 - Math.abs(2 * l2 - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l2 - c / 2;
	let rp = 0;
	let gp = 0;
	let bp = 0;
	if (h < 60) [rp, gp, bp] = [c, x, 0];
	else if (h < 120) [rp, gp, bp] = [x, c, 0];
	else if (h < 180) [rp, gp, bp] = [0, c, x];
	else if (h < 240) [rp, gp, bp] = [0, x, c];
	else if (h < 300) [rp, gp, bp] = [x, 0, c];
	else [rp, gp, bp] = [c, 0, x];
	return rgbToHex((rp + m) * 255, (gp + m) * 255, (bp + m) * 255);
}

/** Resolve the condition hue for a blueprint (matches the dashboard badge). */
export function conditionColorOf(bp: Blueprint | null | undefined): string {
	return (
		(bp && conditionInfoMap[bp.conditionId]?.color) ||
		bp?.accentColor ||
		cohortPalette(cohortOf(bp))[0]
	);
}

/** Relative luminance (WCAG) of a hex color. */
function luminance(hex: string): number {
	const c = hexToRgb(hex)
		.map((v) => v / 255)
		.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
	return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** WCAG contrast ratio between two hex colors. */
function contrast(a: string, b: string): number {
	const la = luminance(a);
	const lb = luminance(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const WHITE = '#ffffff';
const AA = 4.5;

/**
 * Chrome-safe the condition hue for use as a button fill: some `/conditions`
 * tones are a DATA-VIZ palette (olive #7f821b, clay #a87559) that dips just
 * below AA with white button text. Darken minimally until white text clears
 * AA — without touching the shared DATA/semantic palette (olive doubles as
 * `--success`, so retuning the raw token would shift success states app-wide).
 * Most tones already pass and are returned unchanged. Theme-independent:
 * button contrast is white-on-accent in both light and dark mode.
 */
export function chromeSafeAccent(hex: string): string {
	let out = hex;
	for (let i = 0; i < 12 && contrast(WHITE, out) < AA; i++) {
		out = darkenHex(out, 0.02);
	}
	return out;
}

/** Full accent trio for inline `--accent*` overrides (chrome-corrected). */
export function conditionAccent(bp: Blueprint | null | undefined): ConditionAccent {
	const hex = chromeSafeAccent(conditionColorOf(bp));
	const [r, g, b] = hexToRgb(hex);
	return { hex, hover: darkenHex(hex, 0.08), rgb: `${r}, ${g}, ${b}` };
}
