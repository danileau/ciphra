/**
 * CIPH-890 — Cohort × Route palette.
 *
 * Adds a per-cohort tonal family on top of `DATA_PALETTE`, with a
 * per-route lightness/saturation modulation. Diversifies the visual
 * signature so a glance at the page reads BOTH the condition (cohort)
 * AND the surface (route).
 *
 * Layers:
 *   - Cohort axis (5 families × 6 tones)
 *     cycle    → roses
 *     phase    → indigos
 *     narrative→ sages
 *     discrete → warm-rust (= today's DATA_PALETTE, verbatim — keeps every
 *                shipped preset working without migration)
 *     custom   → slates
 *
 *   - Route axis (4 surfaces, applied multiplicatively in HSL space)
 *     calendar → -8% lightness    (denser, more chart-like)
 *     journal  → +4% lightness    (lighter, more readable)
 *     reports  → -4% saturation   (clinical, cool)
 *     dashboard→ baseline         (no shift)
 *
 * Consumers of this module:
 *   - CSS — uses `--cohort-<family>-<n>` vars from `app.css` and the
 *     `[data-route="..."]` shift variables. The relative-color syntax
 *     `hsl(from var(...) h calc(s + var(--route-s-shift)) calc(l + var(--route-l-shift)))`
 *     does the modulation at render time. Tested in modern evergreens
 *     only (Chrome 119+ / Safari 16.4+ / Firefox 128+) — pre-launch
 *     decision, no production users.
 *
 *   - JS / Chart.js — chart libraries take hex strings, not CSS vars.
 *     Use `cohortPalette(cohort)` for the base tones and
 *     `applyRouteShift(hex, route)` (or `applyRouteShiftRgb`) to compute
 *     the same modulation in TypeScript.
 *
 * NOT TOUCHED by this story:
 *   - `pdf.ts` BRAND + DATA_HEX (print-safe, fixed).
 *   - `cycleState.ts` PHASE_COLORS — menstrual-cycle phase encoding is
 *     a state-within-cohort signal, not a cohort palette. Keeping the
 *     existing rust/ochre/olive/slate phase mapping preserves the
 *     established clinical-color intuition.
 *
 * CIPH-891 will migrate consumers (presets, charts, route components)
 * to read from this module. CIPH-890 ships the foundation only.
 */

export type Cohort = 'cycle' | 'phase' | 'narrative' | 'discrete' | 'custom';
export type RouteName = 'calendar' | 'journal' | 'reports' | 'dashboard';
export type Hex = string;

/** Existing 6-token DATA_PALETTE — the discrete cohort row.
 *  Kept verbatim from `dataPalette.ts` to guarantee zero migration. */
const DISCRETE_TONES: readonly [Hex, Hex, Hex, Hex, Hex, Hex] = [
	'#b23c2c', // 1 brand rust
	'#8a2a1f', // 2 deep brick
	'#9f630b', // 3 ochre
	'#7f821b', // 4 olive
	'#5c6b73', // 5 anchor slate
	'#a87559', // 6 clay terracotta
];

/** Cycle row — roses + warm/cool breaks. Slots 1/2/6 are roses; slot 3
 *  is a warm clay-rose (chart-only — see CHART_ONLY_TONES); slot 4
 *  olive and slot 5 anchor slate are cool counterpoints.
 *  Slot 1 was shifted from `#a83a5b` to `#b6306a` (frontend-designer
 *  critique 2026-04-28) — the previous rose sat 14° hue / 18% sat away
 *  from discrete slot 1 `#b23c2c`, making cycle and discrete cohorts
 *  feel like tinted siblings. `#b6306a` pulls cycle clearly into
 *  magenta-rose territory and out of the warm-rust family. */
const CYCLE_TONES: readonly [Hex, Hex, Hex, Hex, Hex, Hex] = [
	'#b6306a', // 1 magenta-rose primary
	'#7a2845', // 2 mulberry
	'#b06a4a', // 3 clay-rose (chart only — 3.6:1 against cream)
	'#7f821b', // 4 olive
	'#5c6b73', // 5 anchor slate
	'#9a4f6b', // 6 dusty rose
];

/** Phase row — steel-violet family with warm + cool breaks.
 *  Slot 1 was shifted from `#3f4a8a` (cool navy-indigo) to `#5e4a8a`
 *  (warmer steel violet) on user feedback 2026-04-28: navy felt too
 *  institutional / cold for the "as private as a notebook" brand.
 *  Violet keeps the cool counterweight to cycle's magenta-rose without
 *  reading as clinical-blue. */
const PHASE_TONES: readonly [Hex, Hex, Hex, Hex, Hex, Hex] = [
	'#5e4a8a', // 1 steel violet primary (was #3f4a8a)
	'#3e2f5e', // 2 deep dusk violet (was #2d3563)
	'#9f630b', // 3 ochre (warm break)
	'#5c7a4a', // 4 muted sage
	'#5c6b73', // 5 anchor slate
	'#7a5e8a', // 6 dusty violet (was #6b6b9a periwinkle)
];

/** Narrative row — sages with warm + cool breaks. */
const NARRATIVE_TONES: readonly [Hex, Hex, Hex, Hex, Hex, Hex] = [
	'#4a6b3f', // 1 sage primary
	'#2f4a28', // 2 forest
	'#9f630b', // 3 ochre
	'#7f821b', // 4 olive
	'#5c6b73', // 5 anchor slate
	'#6b8a5c', // 6 moss
];

/** Custom row — slates with warm + cool breaks. */
const CUSTOM_TONES: readonly [Hex, Hex, Hex, Hex, Hex, Hex] = [
	'#475569', // 1 slate primary
	'#334155', // 2 deep slate
	'#a87559', // 3 clay (warm break)
	'#7f821b', // 4 olive
	'#5c6b73', // 5 anchor slate
	'#6b7b8a', // 6 blue-slate
];

export const COHORT_PALETTES: Readonly<
	Record<Cohort, readonly [Hex, Hex, Hex, Hex, Hex, Hex]>
> = {
	cycle: CYCLE_TONES,
	phase: PHASE_TONES,
	narrative: NARRATIVE_TONES,
	discrete: DISCRETE_TONES,
	custom: CUSTOM_TONES,
};

/** All cohort names — exported for tests + iteration. */
export const ALL_COHORTS_PALETTE: readonly Cohort[] = [
	'cycle',
	'phase',
	'narrative',
	'discrete',
	'custom',
];

/** RGB triples per cohort — mirrors `DATA_PALETTE_RGB`. Used by
 *  `rgba(var(--cohort-X-N-rgb), alpha)` callers for alpha tinting
 *  (selected-chip backgrounds, soft hover fills). The CSS layer
 *  emits matching `--cohort-X-N-rgb` vars in `app.css`. */
export const COHORT_PALETTE_RGB: Readonly<
	Record<Cohort, readonly [number, number, number][]>
> = {
	cycle: [
		[182, 48, 106],
		[122, 40, 69],
		[176, 106, 74],
		[127, 130, 27],
		[92, 107, 115],
		[154, 79, 107],
	],
	phase: [
		[94, 74, 138],
		[62, 47, 94],
		[159, 99, 11],
		[92, 122, 74],
		[92, 107, 115],
		[122, 94, 138],
	],
	narrative: [
		[74, 107, 63],
		[47, 74, 40],
		[159, 99, 11],
		[127, 130, 27],
		[92, 107, 115],
		[107, 138, 92],
	],
	discrete: [
		[178, 60, 44],
		[138, 42, 31],
		[159, 99, 11],
		[127, 130, 27],
		[92, 107, 115],
		[168, 117, 89],
	],
	custom: [
		[71, 85, 105],
		[51, 65, 85],
		[168, 117, 89],
		[127, 130, 27],
		[92, 107, 115],
		[107, 123, 138],
	],
};

/** Tones that pass the chart-use floor (3:1) but fail the text-use
 *  floor (4.5:1) against the cream surface. Document so future
 *  consumers don't accidentally use them for body text. The list is
 *  exhaustive — `cohortPalette.test.ts` enforces it stays so. */
export const CHART_ONLY_TONES: ReadonlySet<Hex> = new Set([
	'#b06a4a', // cycle slot 3 — clay-rose, ~3.6:1
	'#7f821b', // olive (cycle/narrative/discrete/custom slot 4) ~4:1
	'#a87559', // clay (discrete slot 6, custom slot 3) ~4.1:1
	'#6b8a5c', // narrative slot 6 — moss ~3.9:1
	'#6b7b8a', // custom slot 6 — blue-slate ~4.4:1
	'#5c7a4a', // phase slot 4 — muted sage, borderline
	'#5c6b73', // anchor slate (slot 5 across cohorts) ~4.4:1
]);

/** Named exports — mirror DATA_1..DATA_6 ergonomics. */
export const CYCLE_1 = CYCLE_TONES[0];
export const CYCLE_2 = CYCLE_TONES[1];
export const CYCLE_3 = CYCLE_TONES[2];
export const CYCLE_4 = CYCLE_TONES[3];
export const CYCLE_5 = CYCLE_TONES[4];
export const CYCLE_6 = CYCLE_TONES[5];

export const PHASE_1 = PHASE_TONES[0];
export const PHASE_2 = PHASE_TONES[1];
export const PHASE_3 = PHASE_TONES[2];
export const PHASE_4 = PHASE_TONES[3];
export const PHASE_5 = PHASE_TONES[4];
export const PHASE_6 = PHASE_TONES[5];

export const NARRATIVE_1 = NARRATIVE_TONES[0];
export const NARRATIVE_2 = NARRATIVE_TONES[1];
export const NARRATIVE_3 = NARRATIVE_TONES[2];
export const NARRATIVE_4 = NARRATIVE_TONES[3];
export const NARRATIVE_5 = NARRATIVE_TONES[4];
export const NARRATIVE_6 = NARRATIVE_TONES[5];

export const CUSTOM_1 = CUSTOM_TONES[0];
export const CUSTOM_2 = CUSTOM_TONES[1];
export const CUSTOM_3 = CUSTOM_TONES[2];
export const CUSTOM_4 = CUSTOM_TONES[3];
export const CUSTOM_5 = CUSTOM_TONES[4];
export const CUSTOM_6 = CUSTOM_TONES[5];

/** Returns the 6-tone hex tuple for the cohort. */
export function cohortPalette(
	cohort: Cohort,
): readonly [Hex, Hex, Hex, Hex, Hex, Hex] {
	return COHORT_PALETTES[cohort];
}

/** Returns the lightness/saturation deltas for the route, in HSL
 *  percent units. Unknown routes default to baseline. */
export function routeShift(route: RouteName): { l: number; s: number } {
	switch (route) {
		case 'calendar':
			return { l: -8, s: 0 };
		case 'journal':
			return { l: 4, s: 0 };
		case 'reports':
			return { l: 0, s: -4 };
		case 'dashboard':
		default:
			return { l: 0, s: 0 };
	}
}

/* ────────────────────────────────────────────────────────────────
 * HSL conversion helpers (private to this module).
 *
 * The CSS layer uses `hsl(from var(...) h calc(s + var(--route-s-shift))
 * calc(l + var(--route-l-shift)))` to do the same math in CSS Color
 * Level 5 relative-color syntax. The TS implementation here mirrors it
 * for chart consumers that take hex strings.
 * ──────────────────────────────────────────────────────────────── */

function hexToRgb(hex: string): [number, number, number] {
	const m = hex.replace('#', '');
	const full =
		m.length === 3 ? m.split('').map((ch) => ch + ch).join('') : m;
	return [
		parseInt(full.slice(0, 2), 16),
		parseInt(full.slice(2, 4), 16),
		parseInt(full.slice(4, 6), 16),
	];
}

function rgbToHex(r: number, g: number, b: number): string {
	const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
	const toHex = (n: number) => clamp(n).toString(16).padStart(2, '0');
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsl(
	r: number,
	g: number,
	b: number,
): { h: number; s: number; l: number } {
	const rN = r / 255;
	const gN = g / 255;
	const bN = b / 255;
	const max = Math.max(rN, gN, bN);
	const min = Math.min(rN, gN, bN);
	const l = (max + min) / 2;
	let s = 0;
	let h = 0;
	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case rN:
				h = (gN - bN) / d + (gN < bN ? 6 : 0);
				break;
			case gN:
				h = (bN - rN) / d + 2;
				break;
			case bN:
				h = (rN - gN) / d + 4;
				break;
		}
		h /= 6;
	}
	return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(
	h: number,
	s: number,
	l: number,
): [number, number, number] {
	const sN = s / 100;
	const lN = l / 100;
	const c = (1 - Math.abs(2 * lN - 1)) * sN;
	const hPrime = ((h % 360) + 360) % 360 / 60;
	const x = c * (1 - Math.abs((hPrime % 2) - 1));
	let r = 0;
	let g = 0;
	let b = 0;
	if (hPrime >= 0 && hPrime < 1) [r, g, b] = [c, x, 0];
	else if (hPrime < 2) [r, g, b] = [x, c, 0];
	else if (hPrime < 3) [r, g, b] = [0, c, x];
	else if (hPrime < 4) [r, g, b] = [0, x, c];
	else if (hPrime < 5) [r, g, b] = [x, 0, c];
	else [r, g, b] = [c, 0, x];
	const m = lN - c / 2;
	return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Apply the route's HSL shift to a hex color and return the new hex.
 *  Pure function. Idempotent for `route === 'dashboard'`. Clamps L and
 *  S to [0, 100]. */
export function applyRouteShift(hex: Hex, route: RouteName): Hex {
	const { l: dl, s: ds } = routeShift(route);
	if (dl === 0 && ds === 0) return hex;
	const [r, g, b] = hexToRgb(hex);
	const { h, s, l } = rgbToHsl(r, g, b);
	const newL = Math.max(0, Math.min(100, l + dl));
	const newS = Math.max(0, Math.min(100, s + ds));
	const [nr, ng, nb] = hslToRgb(h, newS, newL);
	return rgbToHex(nr, ng, nb);
}

/** Same as `applyRouteShift` but takes/returns RGB triples — for
 *  `rgba()` consumers (alpha tinting on charts, badge backgrounds). */
export function applyRouteShiftRgb(
	rgb: [number, number, number],
	route: RouteName,
): [number, number, number] {
	const { l: dl, s: ds } = routeShift(route);
	if (dl === 0 && ds === 0) return rgb;
	const { h, s, l } = rgbToHsl(rgb[0], rgb[1], rgb[2]);
	const newL = Math.max(0, Math.min(100, l + dl));
	const newS = Math.max(0, Math.min(100, s + ds));
	const [nr, ng, nb] = hslToRgb(h, newS, newL);
	return [Math.round(nr), Math.round(ng), Math.round(nb)];
}

/** Resolve the current route name from a pathname. The first path
 *  segment is the discriminator. `/log/[date]` maps to 'journal'
 *  because the log page is a journal-entry editor. Everything else
 *  (auth, settings, conditions, landing) maps to 'dashboard' which
 *  is the zero-shift baseline. */
export function pathToRoute(pathname: string): RouteName {
	const seg = pathname.split('/')[1] || '';
	if (seg === 'calendar') return 'calendar';
	if (seg === 'journal' || seg === 'log') return 'journal';
	if (seg === 'reports') return 'reports';
	return 'dashboard';
}
