/**
 * ciphra — Data visualization palette (CIPH-801).
 *
 * Used for chart series, condition accents, episode-type markers.
 * Keep small (≤6) so charts stay scannable and stay inside the warm
 * brand family. Pull from DATA_PALETTE (or the matching CSS --data-N
 * token) rather than raw hex literals.
 *
 * This array is the single source of truth — `app.css` defines the
 * same hues as `--data-1` … `--data-6` and must stay in sync.
 *
 *   1 brand rust      — primary (mirrors --brand)
 *   2 deep brick      — darker brand-adjacent
 *   3 ochre           — information / warmth (mirrors --ochre)
 *   4 olive           — calm / logged (mirrors --olive)
 *   5 anchor slate    — cool neutral for chart separation
 *   6 clay terracotta — warm tertiary, brand-adjacent
 *
 * Color-blind guidance (CIPH-801 persona dry-run, Linus):
 *   Avoid placing data-1 and data-2 adjacent in the same chart — the
 *   brand-rust / deep-brick pair collides under protanopia. Insert an
 *   ochre, olive, or slate between them. The presets-palette vitest
 *   enforces no two adjacent episodeTypes share exactly the same
 *   token, which covers the worst case.
 */
export const DATA_PALETTE = [
	'#b23c2c', // data-1 brand rust
	'#8a2a1f', // data-2 deep brick
	'#9f630b', // data-3 ochre
	'#7f821b', // data-4 olive
	'#5c6b73', // data-5 anchor slate
	'#a87559', // data-6 clay terracotta
] as const;

export type DataColorIndex = 0 | 1 | 2 | 3 | 4 | 5;

/** Named aliases for readability at call sites. */
export const DATA_1 = DATA_PALETTE[0];
export const DATA_2 = DATA_PALETTE[1];
export const DATA_3 = DATA_PALETTE[2];
export const DATA_4 = DATA_PALETTE[3];
export const DATA_5 = DATA_PALETTE[4];
export const DATA_6 = DATA_PALETTE[5];

/** RGB triples — mirrors `--data-N-rgb` CSS vars for `rgba()` tinting. */
export const DATA_PALETTE_RGB: Record<number, [number, number, number]> = {
	1: [178, 60, 44],
	2: [138, 42, 31],
	3: [159, 99, 11],
	4: [127, 130, 27],
	5: [92, 107, 115],
	6: [168, 117, 89],
};

export function isDataPaletteColor(hex: string): boolean {
	return (DATA_PALETTE as readonly string[]).includes(hex);
}
