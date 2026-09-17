/**
 * /reports — a dose change gives the reader a before/after structure
 * (operator decisions 2026-09-17): dose bands behind the charts, the change as
 * an event, a divider in the monthly grid, and the medication that applies
 * today always visible. Structure only — nothing is counted per dose period.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPORTS = readFileSync(join(__dirname, '+page.svelte'), 'utf8');
const VITAL = readFileSync(join(__dirname, '..', '..', 'lib', 'components', 'VitalTrendReportsCard.svelte'), 'utf8');
const WRAPPER = readFileSync(join(__dirname, '..', '..', 'lib', 'components', 'ChartWrapper.svelte'), 'utf8');

describe('dose bands on the charts', () => {
	it('the episode trend passes the shaded medication\'s bands to the chart and names it', () => {
		expect(REPORTS).toMatch(/\$: trendBands = bandMed \? chartDoseBands\(bandMed, trendAxisBins\) : null;/);
		expect(REPORTS).toMatch(/doseBands: bands \?\? undefined,/);
		expect(REPORTS).toMatch(/trendBandSig === _prevBandSig/);
		expect(REPORTS).toMatch(/data-testid="reports-dose-bands"/);
	});

	it('the vital trend does the same', () => {
		expect(VITAL).toMatch(/doseBands: vitalBands \?\? undefined,/);
		expect(VITAL).toMatch(/data-testid="vital-dose-bands"/);
	});

	it('labels sit in the strip above the plot, never on top of the data', () => {
		expect(WRAPPER).toMatch(/afterDatasetsDraw[\s\S]*?const y = g\.area\.top - 4;/);
		expect(WRAPPER).not.toMatch(/fillText\(band\.label, left \+ \d+, g\.area\.top \+/);
		expect(REPORTS).toMatch(/layout: bands \? \{ padding: \{ top: 18 \} \} : undefined/);
	});

	it('nothing is computed per dose period', () => {
		const code = REPORTS.slice(REPORTS.indexOf('$: trendAxisBins'), REPORTS.indexOf('$: trendBandSig'));
		expect(code).not.toMatch(/episodes|symptoms|reduce\(|\.length\s*\//);
	});
});

describe('the change as an event', () => {
	it('is listed with note markers and intakes', () => {
		expect(REPORTS).toMatch(/medicationChanges\(bp\?\.medications \?\? \[\], \{ from: scopeFrom, to: scopeTo \}\)/);
		expect(REPORTS).toMatch(/data-testid="reports-event-med-change"/);
	});

	it('divides the monthly grid on the change day', () => {
		expect(REPORTS).toMatch(/\{#each medChangesByDay\.get\(dayStr\) \?\? \[\] as change\}/);
		expect(REPORTS).toMatch(/<td colspan=\{gridColumnCount\}>/);
	});

	it('the medication that applies today is always shown', () => {
		expect(REPORTS).toMatch(/data-testid="reports-current-meds"/);
		expect(REPORTS).toMatch(/const period = periodOn\(med, today\);/);
	});
});
