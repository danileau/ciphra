/**
 * CIPH-855b — Phase-bands polish render contract.
 *
 * Guards the cohort-driven band-height swap, counter-dot dimming, and
 * band legend. Plus: PhaseContextCard accepts and displays the
 * activeCount multi-phase pill.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CAL = readFileSync(join(__dirname, '+page.svelte'), 'utf8');
const PHASE_CARD = readFileSync(
	join(__dirname, '..', '..', 'lib', 'components', 'PhaseContextCard.svelte'),
	'utf8',
);

describe('CIPH-855b calendar phase-bands polish', () => {
	it('derives phaseBandEmphasis from cohort === phase', () => {
		expect(CAL).toMatch(/phaseBandEmphasis\s*=\s*cohort\s*===\s*'phase'/);
	});

	it('band height switches between 6px (phase) and 3px (default)', () => {
		expect(CAL).toMatch(/phaseBandEmphasis\s*\?\s*'6px'\s*:\s*'3px'/);
	});

	it('counter-dot row dims when phase emphasis + bands present', () => {
		expect(CAL).toMatch(
			/opacity:\s*\{phaseBandEmphasis\s*&&\s*bands\.length\s*>\s*0\s*\?\s*0\.4\s*:\s*1\}/,
		);
	});

	it('band legend gated on phase cohort with multiDay types', () => {
		expect(CAL).toMatch(
			/bandLegendVisible\s*=\s*phaseBandEmphasis\s*&&\s*multiDayTypes\.length\s*>\s*0/,
		);
		expect(CAL).toMatch(/\{#if bandLegendVisible\}/);
	});
});

describe('CIPH-855b PhaseContextCard multi-phase pill', () => {
	it('accepts optional activeCount in the phase prop type', () => {
		expect(PHASE_CARD).toMatch(/activeCount\?:\s*number/);
	});

	it('renders the pill only when activeCount > 1', () => {
		expect(PHASE_CARD).toMatch(
			/phase\.activeCount\s*&&\s*phase\.activeCount\s*>\s*1[\s\S]*?phase\.n_active/,
		);
	});
});

describe('CIPH-855b i18n', () => {
	const KEYS = [
		'calendar.band_legend',
		'calendar.band_legend_aria',
		'phase.n_active',
	] as const;
	for (const locale of ['de', 'en', 'fr', 'it']) {
		it(`${locale}: every phase-band key present`, async () => {
			const mod = await import(`../../lib/i18n/${locale}`);
			const dict = mod.default as Record<string, string>;
			for (const k of KEYS) {
				expect(dict[k], `${locale} missing ${k}`).toBeTruthy();
			}
		});
	}
});
