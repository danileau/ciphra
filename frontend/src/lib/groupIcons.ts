/**
 * Symptom-group icons — shared between the setup wizard and the daily entry
 * screen so a group shows the same icon everywhere it appears (Loránd feedback,
 * 2026-06-08: "the icons are top, show them more often, not only at profile
 * creation"). Previously this map lived only in setup/+page.svelte.
 *
 * Keyed by the group's i18n label key (`symptom_group.*`). Unknown keys —
 * including the synthetic "Custom" group and any future preset group — fall
 * back to the generic category icon via iconPath().
 */
import { iconPath } from '$lib/conditionIcons';

export const GROUP_ICON: Record<string, string> = {
	'symptom_group.behavior': 'brain',
	'symptom_group.physical': 'activity',
	'symptom_group.sleep': 'battery-low',
	'symptom_group.focus': 'focus',
	'symptom_group.impulse': 'zap',
	'symptom_group.emotion': 'heart',
	'symptom_group.energy': 'battery-low',
	'symptom_group.hypo_signs': 'droplet',
	'symptom_group.hyper_signs': 'droplet',
	'symptom_group.general': 'donut',
	'symptom_group.mental': 'brain',
	'symptom_group.social': 'shield',
	'symptom_group.prodrome': 'waves',
	'symptom_group.aura': 'waves',
	'symptom_group.attack': 'zap',
	'symptom_group.postdrome': 'battery-low',
	'symptom_group.pain_quality': 'flame',
	'symptom_group.cognitive_emotional': 'brain',
	'symptom_group.motor': 'activity',
	'symptom_group.sensory': 'waves',
	'symptom_group.vision': 'eye',
	'symptom_group.cognitive': 'brain',
	'symptom_group.fatigue_bladder': 'battery-low',
	'symptom_group.mood_affect': 'heart',
	'symptom_group.anxiety_fear': 'cloud-lightning',
	'symptom_group.abdominal': 'activity',
	'symptom_group.bowel': 'activity',
	'symptom_group.respiratory': 'wind',
	'symptom_group.activity': 'activity',
	'symptom_group.pelvic_pain': 'flower',
	'symptom_group.gi_symptoms': 'activity',
	'symptom_group.gi': 'activity',
	'symptom_group.fatigue': 'battery-low',
	'symptom_group.neuro': 'brain',
	'symptom_group.pain': 'flame',
	'symptom_group.emotional': 'heart',
	'symptom_group.skin_symptoms': 'flower',
	'symptom_group.quality_of_life': 'shield-plus',
	'symptom_group.executive': 'focus',
	'symptom_group.masking': 'shield',
	'symptom_group.regulation': 'heart-pulse',
	'symptom_group.cardiac': 'heart-pulse',
	'symptom_group.circulation': 'heart-pulse',
};

/** SVG path `d` for a group's icon, resolved by the group's i18n label key.
 *  Unknown groups fall back to the generic category icon. */
export function groupIconPath(label: string | undefined): string {
	return iconPath((label && GROUP_ICON[label]) || 'donut');
}
