/**
 * Landing brand-voice guard — `landing.how_step*` must not frame the
 * product as a daily-habit tracker.
 *
 * ciphra is positioned as an episodic diary for chronic illness. The
 * no-gaslight discipline (feedback_no_gaslight_good_days.md) holds that
 * sparse data is normal and no-log days are valid. Pre-2026-06-07 the
 * landing "how it works" step 2 said "Täglich protokollieren / Log
 * daily / Journal quotidien / Protocollo giornaliero" which directly
 * contradicted this on the first touchpoint with new users.
 *
 * This test pins the fix so a future copy edit cannot silently re-
 * introduce daily-frequency language in the how_step* keys.
 *
 * If you genuinely need to describe a daily flow somewhere on the
 * landing, use a different key namespace (the `landing.notapp_routine_*`
 * cluster, for instance, explicitly describes an example evening
 * routine and is out of scope of this pin).
 */
import { describe, it, expect } from 'vitest';
import de from '$lib/i18n/de';
import en from '$lib/i18n/en';
import fr from '$lib/i18n/fr';
import itDict from '$lib/i18n/it';

const HOW_STEP_KEYS = [
	'landing.how_step1_title',
	'landing.how_step1_desc',
	'landing.how_step2_title',
	'landing.how_step2_desc',
	'landing.how_step3_title',
	'landing.how_step3_desc',
] as const;

// The notapp "what an entry looks like" cluster used to be a "Die
// Abendroutine / Le rituel du soir" daily-ritual pitch with a
// "3 minutes every evening" promise. 2026-06-07 sweep neutralized it
// to an example-of-an-entry framing. The who_2 caregiver line dropped
// its "täglich / daily / chaque jour / ogni giorno" qualifier in the
// same pass.
const NOTAPP_KEYS = [
	'landing.notapp_routine_title',
	'landing.notapp_routine_desc',
	'landing.notapp_who_2',
] as const;

// Authed-app surfaces (2026-06-20 storyline sweep). The dashboard/setup
// must keep the same no-daily-habit voice the landing promises — a
// "Tägliche Einträge" tile or a "jeden Abend" setup pitch contradicted
// the public "keine Erinnerungen, kein schlechtes Gewissen" line. These
// are the first authed touchpoints (welcome card, setup wizard, quick
// action), pinned so the contradiction can't silently return.
const AUTHED_KEYS = [
	'welcome.new_log_title',
	'setup.mode_protokoll_desc',
	'quick_action.log_day',
] as const;

// Locale-specific banned phrases. Match is case-insensitive. Each
// pattern targets phrasing that asserts a daily cadence or evening
// ritual — both of which violate the no-gaslight stance for the
// product's own self-description.
const FORBIDDEN: Record<string, RegExp> = {
	de: /\btäglich\b|\bjeden\s+(?:abend|tag)\b|\babendroutine\b/i,
	en: /\bdaily\b|\bevery\s+(?:evening|day|night)\b|\bnightly\b/i,
	fr: /\bquotidien(?:ne)?s?\b|\bchaque\s+(?:soir|jour|nuit)\b/i,
	it: /\bgiornalier[oaie]\b|\bogni\s+(?:sera|giorno|notte)\b/i,
};

const DICTS: Array<[string, Record<string, string>]> = [
	['de', de],
	['en', en],
	['fr', fr],
	['it', itDict],
];

describe('landing brand voice — must not frame ciphra as daily-habit', () => {
	for (const [name, dict] of DICTS) {
		const pattern = FORBIDDEN[name];
		for (const key of [...HOW_STEP_KEYS, ...NOTAPP_KEYS, ...AUTHED_KEYS]) {
			it(`${name}: ${key} contains no daily-frequency phrasing`, () => {
				const value = dict[key];
				expect(value, `${name}: ${key} is missing`).toBeDefined();
				const match = value.match(pattern);
				expect(
					match,
					`${name}: ${key} matches forbidden daily-frequency pattern ${pattern}. ` +
						`Value: "${value}". See feedback_no_gaslight_good_days.md — landing ` +
						`copy describes the product as an episodic diary, not a daily routine.`,
				).toBeNull();
			});
		}
	}
});
