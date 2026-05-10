/**
 * CIPH-pi21-Track-B-4 — Phase distribution aggregation for the doctor PDF.
 *
 * Phase cohort (bipolar / MS / IBD / chronic_pain / anxiety_depression /
 * burnout / IBS / long_covid) renders a horizontal stacked bar showing the
 * relative mix of episode types across the focus month.
 *
 * Lives in its own file so the aggregation can be unit-tested independent
 * of jsPDF — the rendering side stays inside pdf.ts (consistent with
 * `drawDayCoverageStrip` etc).
 *
 * Gated by `sectionsForCohort(cohort).includes('phase-distribution')` —
 * cycle/discrete/narrative/custom cohorts never call this.
 */
import type { Blueprint, EpisodeType } from '$lib/blueprint';
import type { CiphraDocument } from '$lib/stores/documents';

export type RGB = [number, number, number];

export interface PhaseSegment {
	id: string;
	/** Episode-type label as authored — i18n key for preset items, literal
	 *  string for custom items. Caller resolves with `labelOf(t, item)`. */
	label: string;
	count: number;
	/** Fraction of total month episodes (0..1). Sums to 1 across segments. */
	pct: number;
	/** Hex color from EpisodeType.color, parsed to RGB triple. */
	color: RGB;
}

function parseHex(hex: string): RGB {
	const h = hex.replace('#', '');
	if (h.length !== 6) return [0, 0, 0];
	const n = parseInt(h, 16);
	return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * Sum episode counts per `episodeType.id` across the focus-month entry docs.
 * Returns segments sorted by count desc. Empty input → empty array (primitive
 * renders nothing in that case — silent month is honest, not "0% manic").
 */
export function aggregatePhaseDistribution(
	blueprint: Blueprint,
	focusMonthDocs: CiphraDocument[],
): PhaseSegment[] {
	const types: EpisodeType[] = blueprint.episodeTypes ?? [];
	if (types.length === 0) return [];

	const counts = new Map<string, number>();
	for (const t of types) counts.set(t.id, 0);

	for (const d of focusMonthDocs) {
		if (d?.data?.type !== 'entry') continue;
		const eps = (d.data?.episodes || {}) as Record<string, unknown>;
		for (const t of types) {
			const v = Number(eps[t.id] || 0);
			if (v > 0) counts.set(t.id, (counts.get(t.id) ?? 0) + v);
		}
	}

	const total = [...counts.values()].reduce((a, b) => a + b, 0);
	if (total === 0) return [];

	return types
		.map((t) => ({
			id: t.id,
			label: t.label,
			count: counts.get(t.id) ?? 0,
			pct: (counts.get(t.id) ?? 0) / total,
			color: parseHex(t.color),
		}))
		.filter((s) => s.count > 0)
		.sort((a, b) => b.count - a.count);
}
