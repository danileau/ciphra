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

/**
 * Render a day-precision date in the user's chosen format.
 *
 * Canonical implementation. It existed three times — VitalTrendReportsCard,
 * routes/reports, and a `sampleDate` in settings that showed the user a
 * preview of a format the rest of the app then applied separately — and the
 * doctor PDF implemented none of them, formatting every date through
 * `toLocaleDateString` and so silently overriding an explicit setting on the
 * one artefact that leaves the device.
 *
 * Day precision only. `dateFormat` has no month-precision variant, so
 * month-and-year labels (chart axes, the report window, monthly grid titles)
 * keep locale formatting — there is no user choice to honour there.
 */
export function formatDateChoice(d: Date, choice: DateFormatChoice | undefined): string {
	const dd = String(d.getDate()).padStart(2, '0');
	const mm = String(d.getMonth() + 1).padStart(2, '0');
	const yyyy = d.getFullYear();
	switch (choice) {
		case 'iso': return `${yyyy}-${mm}-${dd}`;
		case 'us': return `${mm}/${dd}/${yyyy}`;
		case 'dd/mm/yyyy': return `${dd}/${mm}/${yyyy}`;
		case 'dd.mm.yyyy':
		default: return `${dd}.${mm}.${yyyy}`;
	}
}

/** Same, from a `YYYY-MM-DD` string. Noon anchor avoids timezone slippage. */
export function formatISODateChoice(iso: string, choice: DateFormatChoice | undefined): string {
	return formatDateChoice(new Date(iso + 'T12:00:00'), choice);
}

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
