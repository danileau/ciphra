/**
 * The doctor PDF documents; it does not conclude.
 *
 * Operator ruling 2026-08-21: *"Ciphra ist nur eine Dokumentationsplattform."*
 * The trajectory chart used to carry a label reading "Mehr Ereignisse" /
 * "Weniger Ereignisse" / "Stabil" — a derived verdict on which way the
 * patient's course was going.
 *
 * This is the third time that verdict has been narrowed, so it is worth
 * pinning rather than trusting to memory:
 *
 *   pre-pi24  a coloured pill (improving / stable / worsening) for every
 *             cohort. The five-doctor campfire flagged it as the single
 *             most-cited concern — STABIL on Helena mid-titration,
 *             VERBESSERUNG on Hans with a recent GTC, VERSCHLECHTERUNG on
 *             Anna's normal-rhythm bipolar quarter. "A wrong pill is worse
 *             than no pill."
 *   pi24      made cohort-aware and allowed to return null.
 *   DSPEC-2   colour removed, neutral text kept — the claim survived the
 *             thing that was supposed to fix it.
 *   2026-08-21 removed entirely.
 *
 * The direction remains fully available: it is the plotted line and the
 * monthly numbers. What is gone is ciphra asserting what that line means.
 *
 * NOTE the deliberate boundary. This guard covers DERIVED VERDICTS about
 * direction, not measured facts. "Blutdruck 128/82", "3 Episoden",
 * "2 Tage erfasst" are recorded data and must keep working.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import de from '$lib/i18n/de';
import en from '$lib/i18n/en';
import fr from '$lib/i18n/fr';
import itDict from '$lib/i18n/it';

const PDF = readFileSync(join(__dirname, 'pdf.ts'), 'utf8');

const DICTS: Array<[string, Record<string, string>]> = [
	['de', de],
	['en', en],
	['fr', fr],
	['it', itDict],
];

const REMOVED_KEYS = [
	'pdf.trend_improving',
	'pdf.trend_worsening',
	'pdf.trend_stable',
	'pdf.trend_vital_rising',
	'pdf.trend_vital_falling',
	'pdf.trend_vital_stable',
	'pdf.trend_polarity_more_manic',
	'pdf.trend_polarity_more_depressive',
	'pdf.trend_polarity_closer_to_baseline',
	'pdf.trajectory_narrative',
];

describe('the PDF makes no directional assessment', () => {
	it('the trajectory verdict machinery is gone from pdf.ts', () => {
		for (const symbol of ['resolveTrajectoryPill', 'pillSpec', 'trendLabel', 'chartContext']) {
			expect(PDF, `${symbol} is back in pdf.ts`).not.toContain(symbol);
		}
	});

	it('pdfTrajectory.ts is deleted, not merely unused', () => {
		// It existed only to compute the verdict. Leaving it on disk invites
		// a future caller to wire it back up.
		expect(existsSync(join(__dirname, 'pdfTrajectory.ts'))).toBe(false);
	});

	for (const [name, dict] of DICTS) {
		it(`${name}: the verdict strings stay removed`, () => {
			const back = REMOVED_KEYS.filter((k) => dict[k] !== undefined);
			expect(
				back,
				`${name}: these assert a direction on the patient's course: ${back.join(', ')}. ` +
					`ciphra documents what was recorded; the chart shows the direction.`,
			).toEqual([]);
		});
	}

	it('the label chrome that read as a button is gone', () => {
		// White rounded rect + hairline border + short centred label is the
		// visual grammar of a control. A user reported it as "a 'Mehr
		// Ereignisse' button that isn't one" — in a PDF, where nothing is.
		expect(PDF).not.toMatch(/roundedRect\([^)]*labelW/);
	});

	it('measured facts are untouched — this guard is not a blanket ban', () => {
		// Guards against over-correcting: the report must still state what
		// was recorded.
		expect(de['pdf.days_logged_short']).toBeDefined();
		expect(de['pdf.legend_episodes']).toBeDefined();
		expect(PDF).toContain('pdf.days_logged_short');
	});
});
