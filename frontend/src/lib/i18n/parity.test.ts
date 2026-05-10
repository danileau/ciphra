/**
 * i18n parity test — every locale dictionary must define the same key set.
 *
 * Background: PI v24-4 conditionInfoMap wiring shipped with 116 missing
 * translation strings across all 4 locales because the original blueprint
 * author wrote `condition.cancer_treatment.*` but not the equivalent for
 * hashimoto/rheumatoid_arthritis, and my dedup pass over-removed instead of
 * under-removing. svelte-check + the existing test suite didn't catch it
 * because missing-key fallback to the key string is by design at runtime —
 * `t('condition.X.title')` returns the literal `'condition.X.title'` rather
 * than throwing.
 *
 * This parity test makes the gap mechanical. If any one locale has a key
 * the others don't, CI fails. Use DE as the reference because it's the
 * eagerly-bundled SSR fallback dict (`i18n/index.ts:11`).
 *
 * Note: project_pre_launch_state.md (2026-04-29) listed this as a planned
 * post-launch sweep ("Add i18n parity vitest"). Shipping it now closes the
 * planned item AND fixes the immediate regression.
 */
import { describe, it, expect } from 'vitest';
import de from '$lib/i18n/de';
import en from '$lib/i18n/en';
import fr from '$lib/i18n/fr';
import itDict from '$lib/i18n/it';

const REFERENCE = de;
const REFERENCE_NAME = 'de';

function diffKeys(ref: Record<string, string>, other: Record<string, string>, otherName: string): string {
	const refKeys = new Set(Object.keys(ref));
	const otherKeys = new Set(Object.keys(other));
	const missing = [...refKeys].filter((k) => !otherKeys.has(k));
	const extra = [...otherKeys].filter((k) => !refKeys.has(k));
	const errors: string[] = [];
	if (missing.length > 0) {
		errors.push(`Missing in ${otherName} (${missing.length}): ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', ...' : ''}`);
	}
	if (extra.length > 0) {
		errors.push(`Extra in ${otherName} (${extra.length}): ${extra.slice(0, 5).join(', ')}${extra.length > 5 ? ', ...' : ''}`);
	}
	return errors.join('\n');
}

function findEmpty(dict: Record<string, string>): string[] {
	const out: string[] = [];
	for (const [k, v] of Object.entries(dict)) {
		if (typeof v !== 'string' || v.trim().length === 0) out.push(k);
	}
	return out;
}

describe('i18n parity across locales', () => {
	it('en.ts has the same key set as de.ts', () => {
		const err = diffKeys(REFERENCE, en, 'en');
		expect(err, err).toBe('');
	});

	it('fr.ts has the same key set as de.ts', () => {
		const err = diffKeys(REFERENCE, fr, 'fr');
		expect(err, err).toBe('');
	});

	it('it.ts has the same key set as de.ts', () => {
		const err = diffKeys(REFERENCE, itDict, 'it');
		expect(err, err).toBe('');
	});

	it('all locales have non-empty values', () => {
		const all = { de: REFERENCE, en, fr, it: itDict };
		const offenders: string[] = [];
		for (const [name, dict] of Object.entries(all)) {
			const empty = findEmpty(dict);
			if (empty.length > 0) {
				offenders.push(`${name}: ${empty.slice(0, 3).join(', ')}${empty.length > 3 ? ` (+${empty.length - 3} more)` : ''}`);
			}
		}
		expect(offenders, offenders.join('\n')).toEqual([]);
	});
});
