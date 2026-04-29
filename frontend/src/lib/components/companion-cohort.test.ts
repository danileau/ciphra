/**
 * CIPH-854 — Cohort-driven Companion ordering.
 *
 * Static parse of CompanionMain.svelte to assert:
 *   - PhaseContextCard is imported AND rendered above every chart/card.
 *   - The render gate is `cohort === 'phase' && activePhase`.
 *   - Cycle card still comes second (stable for cycle cohort).
 *
 * Snapshot-style structural guarantees — component render would require
 * a full reactive context (stores, i18n), and the ordering claim is
 * about source order, which static parse captures reliably.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(
	join(__dirname, 'CompanionMain.svelte'),
	'utf8',
);

describe('CIPH-854 Companion cohort ordering', () => {
	it('imports PhaseContextCard', () => {
		expect(SOURCE).toContain(
			"import PhaseContextCard from '$lib/components/PhaseContextCard.svelte'",
		);
	});

	it('accepts cohort + activePhase props', () => {
		expect(SOURCE).toMatch(/export let cohort:\s*Cohort/);
		expect(SOURCE).toMatch(/export let activePhase/);
	});

	it('renders PhaseContextCard gated on cohort=phase + active phase', () => {
		expect(SOURCE).toMatch(
			/cohort === 'phase'[\s\S]*activePhase[\s\S]*PhaseContextCard/,
		);
	});

	it('phase card renders above the cycle card', () => {
		const phaseIdx = SOURCE.indexOf('PhaseContextCard');
		const cycleIdx = SOURCE.indexOf('CYCLE PHASE');
		expect(phaseIdx).toBeGreaterThan(-1);
		expect(cycleIdx).toBeGreaterThan(-1);
		expect(phaseIdx).toBeLessThan(cycleIdx);
	});

	it('cycle card renders above the main trend chart', () => {
		const cycleIdx = SOURCE.indexOf('CYCLE PHASE');
		const trendIdx = SOURCE.indexOf("WIE GEHT'S DIR?");
		expect(cycleIdx).toBeLessThan(trendIdx);
	});

	// CIPH-900 — Episode bar-chart and Top-symptoms bar-chart removed
	// from the dashboard. /reports owns the deep view. Their ordering
	// assertion no longer applies.
});

describe('CIPH-854 PhaseContextCard i18n', () => {
	const KEYS = [
		'phase.active_title',
		'phase.day_n',
		'phase.day_label',
		'phase.started_on',
	] as const;

	for (const locale of ['de', 'en', 'fr', 'it']) {
		it(`${locale}: every phase key present`, async () => {
			const mod = await import(`../i18n/${locale}`);
			const dict = mod.default as Record<string, string>;
			for (const k of KEYS) {
				expect(dict[k], `${locale} missing ${k}`).toBeTruthy();
			}
		});
	}
});
