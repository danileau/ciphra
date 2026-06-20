import type { Blueprint, MedicationSlot } from './types';
import { translateUnit } from '$lib/i18n';

/**
 * Medication model reconciliation (CIPH-881 follow-up, 2026-06-16).
 *
 * There are two medication lists on a blueprint:
 *   - `medications` (MedicationSlot[]) — the user's own meds, edited in
 *     Settings, each with an `asNeeded` ("Bei Bedarf") flag. This is what the
 *     user thinks of as "their Bedarfsmedikation".
 *   - `rescueMedications` (RescueMedication[]) — a hardcoded per-preset list
 *     (e.g. Midazolam/Diazepam for epilepsy) that originally backed the FAB
 *     "Bedarfsmed." quick-add. Labels are i18n keys; unit is a separate key.
 *
 * Both surface as "Bedarfsmedikation" in the UI but were wired to different
 * sources — the FAB ignored what the user configured. The fix:
 *   - The PICKER is sourced from configured as-needed meds only (see
 *     `bedarfMedsForPicker`).
 *   - All RENDER / COUNT / EXPORT paths resolve a logged `medicationId`
 *     against configured meds FIRST, then fall back to presets, so events
 *     logged before this change (incl. epilepc migrants) never render as a
 *     bare id (see `resolveMedDisplay` / `bedarfMedColumns`).
 */

export interface MedDisplay {
	/** User-facing medication name, already translated where applicable. */
	label: string;
	/** Translated unit, or '' when the dose string already carries the unit
	 *  (configured MedicationSlots store e.g. "400 mg" in `dose`). */
	unit: string;
}

type Translator = (key: string, params?: Record<string, string | number>) => string;

/** The meds offered in the FAB "Bedarfsmedikation" picker: the user's own
 *  as-needed medications, configured in Settings. */
export function bedarfMedsForPicker(bp: Blueprint | null | undefined): MedicationSlot[] {
	return (bp?.medications ?? []).filter((m) => m.asNeeded);
}

/** True when there is anything to show in the FAB "med" mode. */
export function hasBedarfMeds(bp: Blueprint | null | undefined): boolean {
	return bedarfMedsForPicker(bp).length > 0;
}

/** Resolve a logged event's `medicationId` to a display label + unit.
 *  Configured meds win over presets so renaming/removing a preset never
 *  orphans an event; presets remain a fallback for historical/migrated data. */
export function resolveMedDisplay(
	bp: Blueprint | null | undefined,
	id: string | undefined | null,
	t: Translator,
): MedDisplay {
	if (!id) return { label: '?', unit: '' };
	const slot = bp?.medications?.find((m) => m.id === id);
	if (slot) return { label: slot.name, unit: '' };
	const preset = bp?.rescueMedications?.find((rm) => rm.id === id);
	if (preset) return { label: t(preset.label), unit: preset.unit ? translateUnit(t, preset.unit) : '' };
	return { label: id, unit: '' };
}

/** One-time migration for EXISTING blueprints saved before the single-source
 *  model: fold any preset `rescueMedications` into the editable `medications`
 *  list (as `asNeeded`, preserving the original id so already-logged events
 *  still resolve) and drop the now-redundant `rescueMedications` field.
 *
 *  New presets seed these straight into `medications`, so for fresh blueprints
 *  this is a no-op. Returns a migrated CLONE when something changed, or `null`
 *  when the blueprint is already in the single-source shape (so callers can
 *  skip the persist). Pure — needs `t` to turn preset i18n label keys into the
 *  plain `MedicationSlot.name` the editor and FAB render. */
export function foldRescueMedications(
	bp: Blueprint | null | undefined,
	t: Translator,
): Blueprint | null {
	if (!bp || !bp.rescueMedications || bp.rescueMedications.length === 0) return null;
	// NEVER touch a user who already has medications. A configured or
	// epilepc-migrated list is curated data — appending preset rescue meds
	// (Midazolam/Diazepam) would contaminate it. Only SEED a brand-new/empty
	// list. Existing users keep the now-unused `rescueMedications` field (it's
	// harmless; resolveMedDisplay reads it only as a fallback for already-logged
	// events). Returning null here means the layout performs no blueprint.save,
	// so the migration is a true no-op for them.
	if (bp.medications && bp.medications.length > 0) return null;
	const next: Blueprint = JSON.parse(JSON.stringify(bp));
	const meds = next.medications ?? (next.medications = []);
	for (const rm of bp.rescueMedications) {
		const unit = rm.unit ? translateUnit(t, rm.unit) : '';
		const dose = [rm.defaultDose, unit].filter(Boolean).join(' ');
		meds.push({ id: rm.id, name: t(rm.label), dose, schedule: '', asNeeded: true });
	}
	delete next.rescueMedications;
	return next;
}

/** Columns for the doctor PDF / CSV per-day rescue-med counts. Union of the
 *  user's configured as-needed meds and the preset list (deduped by id) so a
 *  migrant's historical preset-id events are still counted alongside newly
 *  logged configured-med events. */
export function bedarfMedColumns(
	bp: Blueprint | null | undefined,
	t: Translator,
): { id: string; label: string; unit: string }[] {
	const cols: { id: string; label: string; unit: string }[] = [];
	const seen = new Set<string>();
	for (const m of bedarfMedsForPicker(bp)) {
		if (seen.has(m.id)) continue;
		seen.add(m.id);
		cols.push({ id: m.id, label: m.name, unit: '' });
	}
	for (const rm of bp?.rescueMedications ?? []) {
		if (seen.has(rm.id)) continue;
		seen.add(rm.id);
		cols.push({ id: rm.id, label: t(rm.label), unit: rm.unit ? translateUnit(t, rm.unit) : '' });
	}
	return cols;
}
