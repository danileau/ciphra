/**
 * CIPH-890 — Cohort palette.
 *
 * Adds a per-cohort tonal family on top of `DATA_PALETTE`, so a glance
 * at the page reads the condition (cohort).
 *
 *   - Cohort axis (5 families × 6 tones)
 *     cycle    → roses
 *     phase    → indigos
 *     narrative→ sages
 *     discrete → warm-rust (= today's DATA_PALETTE, verbatim — keeps every
 *                shipped preset working without migration)
 *     custom   → slates
 *
 * The CIPH-890 route axis (per-route HSL shift) was REMOVED in the
 * 2026-06-11 design review: it shipped with zero consumers on both the
 * CSS side (`--route-l/s-shift` vars, only ever referenced in comments)
 * and the TS side (`applyRouteShift*`, only referenced by its own
 * tests) — and the two sides had already drifted apart (CSS said
 * reports −10% S after the PI v13 critique, TS still said −4%). Route
 * identity comes from content + the CIPH-892 rhythm tokens; cohort
 * identity keeps `--accent-*`. Guard: `route-shift-removed.test.ts`.
 * `pathToRoute()` survives — it drives `data-route` for rhythm tokens.
 *
 * Consumers of this module:
 *   - CSS — uses `--cohort-<family>-<n>` vars from `app.css`.
 *   - JS / Chart.js — chart libraries take hex strings, not CSS vars.
 *     Use `cohortPalette(cohort)` for the base tones.
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
