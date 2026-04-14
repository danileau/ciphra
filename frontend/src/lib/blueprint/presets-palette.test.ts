/**
 * CIPH-801 — palette discipline enforcement.
 *
 * Every preset's accentColor and every episodeTypes[].color MUST be
 * one of the six DATA_PALETTE tokens. Also verifies that within any
 * single preset no two adjacent episodeTypes share the same color —
 * this keeps stacked charts scannable and avoids color-blind
 * collisions in the common case.
 *
 * conditionInfoMap colors follow the same rule.
 */
import { describe, it, expect } from 'vitest';
import * as presetsMod from './presets';
import { presets } from './presets';
import { conditionInfoMap } from '../conditionInfo';
import { DATA_PALETTE } from '../dataPalette';

const PALETTE = new Set<string>(DATA_PALETTE);

function isBlueprint(v: unknown): v is { accentColor?: string; conditionId?: string; episodeTypes?: Array<{ color?: string; id?: string }> } {
	return typeof v === 'object' && v !== null && 'accentColor' in v && 'episodeTypes' in v;
}

describe('CIPH-801 — preset palette discipline', () => {
	const blueprints = Object.values(presetsMod).filter(isBlueprint);

	it('has at least the expected number of blueprints', () => {
		expect(blueprints.length).toBeGreaterThanOrEqual(20);
	});

	for (const bp of blueprints) {
		const id = bp.conditionId ?? 'unknown';

		it(`${id}: accentColor is in DATA_PALETTE`, () => {
			expect(PALETTE.has(bp.accentColor ?? '')).toBe(true);
		});

		it(`${id}: every episodeTypes[].color is in DATA_PALETTE`, () => {
			for (const et of bp.episodeTypes ?? []) {
				expect({ id: et.id, color: et.color, inPalette: PALETTE.has(et.color ?? '') }).toEqual({
					id: et.id,
					color: et.color,
					inPalette: true,
				});
			}
		});

		it(`${id}: no two adjacent episodeTypes share the same color`, () => {
			const eps = bp.episodeTypes ?? [];
			for (let i = 1; i < eps.length; i++) {
				expect(
					eps[i].color,
					`${id}: episodeTypes[${i - 1}] (${eps[i - 1].id}) and [${i}] (${eps[i].id}) both use ${eps[i].color}`,
				).not.toBe(eps[i - 1].color);
			}
		});
	}

	it('landing preset tiles use DATA_PALETTE colors', () => {
		for (const p of presets) {
			expect({ id: p.id, color: p.color, inPalette: PALETTE.has(p.color) }).toEqual({
				id: p.id,
				color: p.color,
				inPalette: true,
			});
		}
	});
});

describe('CIPH-801 — conditionInfo palette discipline', () => {
	for (const [id, info] of Object.entries(conditionInfoMap)) {
		it(`${id}: color is in DATA_PALETTE`, () => {
			expect(PALETTE.has(info.color)).toBe(true);
		});
	}
});
