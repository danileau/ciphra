/**
 * PDF copy guard — a document may not describe its own period relatively.
 *
 * The doctor PDF titled itself "Letzte 12 Monate" / "Last 24 months" on
 * every multi-month export. That phrase needs a "now" to resolve against,
 * and the only "now" on the page is `Exportiert: <date>` — the moment the
 * patient pressed the button, which is not the window's end.
 *
 * Since the /reports picker anchors every year and every pair at December,
 * the phrase was wrong in the ordinary case: a 2023 report exported in
 * March 2024 read "Letzte 12 Monate · Exportiert: 12. März 2024", decoding
 * to Mär 2023 – Mär 2024. A quarter off, and into the wrong year.
 *
 * This is not a style rule. A stated-period-vs-actual-content mismatch is
 * the documented reason the previous renderer was deleted:
 * docs/archive/CLINICAL_HANDOFF.md:6-8 — the export showed "last 90 days
 * (count: 1)" when the user had selected 2 years. And the correct rule was
 * already written: PDF_DESIGN_SPEC §15, "The date range must appear on
 * page 1."
 *
 * Relative framing is fine on the PICKER, where "the last 12 months" is
 * true at the instant of choosing. It is not fine on an artifact that gets
 * printed, filed, faxed and re-read a year later. Hence: `pdf.*` only.
 */
import { describe, it, expect } from 'vitest';
import de from '$lib/i18n/de';
import en from '$lib/i18n/en';
import fr from '$lib/i18n/fr';
import itDict from '$lib/i18n/it';

const DICTS: Array<[string, Record<string, string>]> = [
	['de', de],
	['en', en],
	['fr', fr],
	['it', itDict],
];

/**
 * A window expressed as "<relative word> N <time unit>" or "N-month …".
 *
 * Deliberately narrow: it targets a period CLAIM, not any mention of a
 * duration. `pdf.cycle_anchor_stale` ("älter als 60 Tage") is a staleness
 * threshold describing the data, not the report's window, and must keep
 * passing.
 */
const RELATIVE_WINDOW: Record<string, RegExp> = {
	de: /\b(letzte[nr]?|vergangene[nr]?|vorige[nr]?)\s+\d+\s*(monate|monaten|jahre|jahren|tage|tagen)\b|\büber\s+\d+\s*monate\b/i,
	en: /\blast\s+\d+\s*(months?|years?|days?)\b|\b\d+-(month|year|day)\b|\bpast\s+\d+\s*(months?|years?|days?)\b/i,
	fr: /\b\d+\s*(derniers?|dernières?)\s*(mois|ans|jours)\b|\b(derniers?|dernières?)\s+\d+\s*(mois|ans|jours)\b|\bsur\s+\d+\s*mois\b/i,
	it: /\bultim[oi]\s+\d+\s*(mesi|anni|giorni)\b|\bsu\s+\d+\s*mesi\b|\btrend\s+\d+\s*mesi\b/i,
};

const pdfKeys = (dict: Record<string, string>) =>
	Object.keys(dict).filter((k) => k.startsWith('pdf.'));

describe('PDF copy — the document states its period absolutely', () => {
	for (const [name, dict] of DICTS) {
		it(`${name}: no pdf.* value claims a relative window`, () => {
			const pattern = RELATIVE_WINDOW[name];
			const offenders = pdfKeys(dict).filter((k) => pattern.test(dict[k]));
			expect(
				offenders,
				`${name}: these PDF strings describe the period relative to "now": ` +
					`${offenders.map((k) => `${k} = "${dict[k]}"`).join(', ')}. ` +
					`The PDF outlives the moment it was generated — state the range ` +
					`(PDF_DESIGN_SPEC §15) and let reportWindow.ts format it.`,
			).toEqual([]);
		});

		it(`${name}: the removed relative keys stay gone`, () => {
			for (const key of [
				'pdf.scope_year',
				'pdf.scope_2years',
				'pdf.episode_trend',
				'pdf.episode_trend_12m',
				'pdf.vital_trends_title',
				'pdf.vital_trends_title_12m',
				'pdf.episode_duration_title',
			]) {
				expect(dict[key], `${name}: ${key} is back`).toBeUndefined();
			}
		});

		it(`${name}: the range-bearing replacements exist and interpolate`, () => {
			for (const key of [
				'pdf.episode_trend_range',
				'pdf.vital_trends_title_range',
				'pdf.episode_duration_title_range',
			]) {
				const value = dict[key];
				expect(value, `${name}: ${key} is missing`).toBeDefined();
				expect(value, `${name}: ${key} must carry the {range}`).toContain('{range}');
				// Substitution is single-pass, first-occurrence-only
				// (i18n/index.ts) — a repeated placeholder silently survives
				// into the rendered PDF as literal "{range}".
				expect(value.match(/\{range\}/g), `${name}: ${key} repeats {range}`).toHaveLength(1);
			}
		});
	}

	it('the picker keeps its own short scope titles', () => {
		// Relative/short framing is legitimate on the card, where it is true
		// at the instant of choosing. Only the document had to change.
		expect(de['pdf.scope_month_label']).toBe('Monat');
		expect(de['pdf.scope_year_label']).toBe('Jahr');
		expect(de['pdf.scope_2years_label']).toBe('2 Jahre');
	});
});
