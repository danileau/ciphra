/**
 * Export-period copy guard — a coverage figure may describe the export,
 * never the user.
 *
 * The /reports period picker shipped (#128) with a `reports.period_sparse`
 * badge — "Lückenhaft" / "Patchy" / "Incomplet" / "Incompleto" — on any
 * window under half covered. That reads as a verdict on the person: it
 * implies a logging target and tells them they missed it.
 *
 * ciphra's no-gaslight discipline (feedback_no_gaslight_good_days.md) holds
 * that a no-log day is valid and sparse data is normal in chronic illness.
 * A patient who logs during flares and not between them has not failed at
 * anything, and the surface that hands their data to a doctor is the worst
 * possible place to suggest otherwise.
 *
 * "2 Tage erfasst" is a fact about the PDF. "Lückenhaft" is a grade.
 * This pins the difference so the badge cannot quietly return under a new
 * name.
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
 * Words that grade the data rather than describe it. Deliberately wider
 * than the one label that was removed — the failure mode is re-adding the
 * same idea under a synonym.
 */
const JUDGMENT: Record<string, RegExp> = {
	de: /\bl(?:ü|ue)ckenhaft\b|\bunvollst(?:ä|ae)ndig\b|\bd(?:ü|ue)nn\b|\bwenig(?:e|er)?\s+(?:daten|eintr)|\bzu\s+wenig\b|\bnur\s+\d/i,
	en: /\bpatchy\b|\bincomplete\b|\bsparse\b|\bthin\b|\btoo\s+few\b|\blow\s+coverage\b|\bonly\s+\d/i,
	fr: /\bincomplet(?:e|s|es)?\b|\blacunaire\b|\b(?:trop\s+)?peu\s+de\s+donn/i,
	it: /\bincomplet[oaie]\b|\blacunos[oaie]\b|\bpoch[ie]\s+dati\b|\btroppo\s+poch/i,
};

/** Every key the period picker renders. */
function periodKeys(dict: Record<string, string>): string[] {
	return Object.keys(dict).filter((k) => k.startsWith('reports.period_'));
}

describe('export period copy — describes the export, never grades the user', () => {
	for (const [name, dict] of DICTS) {
		it(`${name}: the removed reports.period_sparse badge stays gone`, () => {
			expect(
				dict['reports.period_sparse'],
				`${name}: reports.period_sparse is back. A coverage badge that calls a ` +
					`window "Lückenhaft"/"Patchy" implies a logging target the user missed. ` +
					`See feedback_no_gaslight_good_days.md.`,
			).toBeUndefined();
		});

		it(`${name}: no reports.period_* key grades the amount of data`, () => {
			const pattern = JUDGMENT[name];
			const offenders = periodKeys(dict).filter((k) => pattern.test(dict[k]));
			expect(
				offenders,
				`${name}: these keys grade the user's data instead of describing the ` +
					`export: ${offenders.map((k) => `${k} = "${dict[k]}"`).join(', ')}. ` +
					`State what the PDF contains ("2 Tage erfasst"), not how that rates.`,
			).toEqual([]);
		});
	}

	it('the picker still states coverage — this guard must not empty the row', () => {
		// Guards against "fix the lint by deleting the information": the
		// coverage figure is the honest half and has to survive.
		expect(de['reports.period_days_one']).toMatch(/\{count\}/);
		expect(de['reports.period_days_other']).toMatch(/\{count\}/);
		expect(periodKeys(de).length).toBeGreaterThan(2);
	});
});
