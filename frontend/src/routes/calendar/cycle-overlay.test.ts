/**
 * CIPH-855a — Calendar cycle-overlay render contract.
 *
 * Static parse of `calendar/+page.svelte` to assert the overlay is
 * gated on cohort and uses the shared cycleState module, not a local
 * re-implementation.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(__dirname, '+page.svelte'), 'utf8');

describe('CIPH-855a calendar cycle overlay', () => {
	it('imports shared cycleState module', () => {
		expect(SOURCE).toContain("from '$lib/cycleState'");
		expect(SOURCE).toContain('computeCycleAnchor');
		expect(SOURCE).toContain('cycleStateForDate');
		expect(SOURCE).toContain('PHASE_COLORS');
	});

	it('computes cohort from blueprint', () => {
		expect(SOURCE).toMatch(/cohort\s*=\s*cohortOf\(/);
	});

	it('cycleOverlayActive gated on cohort === cycle', () => {
		expect(SOURCE).toMatch(/cycleOverlayActive\s*=\s*cohort\s*===\s*'cycle'/);
	});

	it('anchor only computed when overlay active', () => {
		expect(SOURCE).toMatch(/cycleAnchor\s*=\s*cycleOverlayActive\s*\?/);
	});

	it('renders the phase legend only in cycle cohort', () => {
		expect(SOURCE).toMatch(/\{#if cycleOverlayActive\}[\s\S]*?phase_legend/);
	});

	it('day cell background includes the phase-colored fallback at 15%', () => {
		// 0x26 ≈ 0.15 (38/255). Enforce that the hex-alpha is exactly `26`
		// to prevent a drift from the agreed default without reviewer check.
		expect(SOURCE).toMatch(/PHASE_COLORS\[phase\]\}26/);
	});

	it('does not re-implement cycle computation locally', () => {
		// Guard against a future regression where someone copies the math
		// back inline. The module should be the only producer.
		expect(SOURCE).not.toMatch(/anchorDate\s*=\s*String\(logs\[/);
		expect(SOURCE).not.toMatch(/endMenstrual\s*=\s*Math\.max/);
	});
});

describe('CIPH-855a i18n', () => {
	const KEYS = ['cycle.phase_legend', 'cycle.phase_legend_aria'] as const;
	for (const locale of ['de', 'en', 'fr', 'it']) {
		it(`${locale}: every legend key present`, async () => {
			const mod = await import(`../../lib/i18n/${locale}`);
			const dict = mod.default as Record<string, string>;
			for (const k of KEYS) {
				expect(dict[k], `${locale} missing ${k}`).toBeTruthy();
			}
		});
	}
});
