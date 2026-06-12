/**
 * Pure helpers for the two settings-driven blueprint preferences.
 *
 * Both fields use the same "unset = default" persistence contract:
 *   - When the user picks the default, the field is deleted from the
 *     persisted JSON so untouched blueprints stay minimal.
 *   - Any other choice is written explicitly.
 *
 * Extracted into a module so the discriminator can be unit-tested
 * (CIPH-pi18-3, Linus dry-run #1).
 */
import type { Blueprint } from './types';

export type DateFormatChoice = NonNullable<Blueprint['dateFormat']>;
export type PrimarySurfaceChoice = 'auto' | NonNullable<Blueprint['primaryBrowseSurface']>;

const DATE_FORMAT_DEFAULT: DateFormatChoice = 'dd.mm.yyyy';

export function applyDateFormatChoice(bp: Blueprint, value: DateFormatChoice): Blueprint {
	const next: Blueprint = JSON.parse(JSON.stringify(bp));
	if (value === DATE_FORMAT_DEFAULT) {
		delete (next as Partial<Blueprint>).dateFormat;
	} else {
		next.dateFormat = value;
	}
	return next;
}

/** Record a welcome-card dismissal on the blueprint (idempotent). */
export function applyWelcomeDismissed(bp: Blueprint, variant: 'web' | 'migrate'): Blueprint {
	const next: Blueprint = JSON.parse(JSON.stringify(bp));
	const seen = new Set(next.dismissedWelcome ?? []);
	seen.add(variant);
	next.dismissedWelcome = [...seen].sort();
	return next;
}

export function applyPrimarySurfaceChoice(bp: Blueprint, value: PrimarySurfaceChoice): Blueprint {
	const next: Blueprint = JSON.parse(JSON.stringify(bp));
	if (value === 'auto') {
		delete (next as Partial<Blueprint>).primaryBrowseSurface;
	} else {
		next.primaryBrowseSurface = value;
	}
	return next;
}
