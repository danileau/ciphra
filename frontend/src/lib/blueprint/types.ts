/**
 * ciphra Blueprint — the customization layer.
 *
 * A Blueprint defines what a user tracks: symptoms, episodes, triggers,
 * vitals, medications, and how they're grouped. It's stored as an
 * encrypted document (type: "blueprint") so the server never knows
 * what condition the user has.
 *
 * The UI renders entirely from the active Blueprint — no hardcoded
 * epilepsy/ADHD/diabetes fields anywhere.
 */

/** A single trackable item (symptom, trigger, etc.) */
export interface BlueprintItem {
	id: string;          // unique key, e.g. "tired", "hyperglycemia"
	label: string;       // display name in the user's language
	icon?: string;       // optional icon name
}

/** A group of related items (e.g. "Behavior", "Physical") */
export interface BlueprintGroup {
	id: string;
	label: string;
	items: BlueprintItem[];
}

/** An episode type the user tracks (seizure, panic attack, hypo, etc.) */
export interface EpisodeType {
	id: string;
	label: string;
	color: string;       // hex color for UI
	icon?: string;
}

/** A vital sign to track */
export interface VitalField {
	id: string;
	label: string;
	unit: string;
	placeholder: string;
}

/** Medication template */
export interface MedicationSlot {
	id: string;
	name: string;
	dose: string;
	schedule: string;    // e.g. "morgens, abends" or "as needed"
	asNeeded: boolean;
}

/** The full Blueprint */
export interface Blueprint {
	/** Internal version for future migrations */
	version: number;

	/** What condition this tracks */
	conditionId: string;  // e.g. "epilepsy", "adhd", "diabetes", "custom"
	conditionLabel: string;

	/** Display theme color */
	accentColor: string;

	/** Symptom/sign groups (rendered as toggle chips) */
	symptomGroups: BlueprintGroup[];

	/** Episode types (rendered as counters, like seizure types) */
	episodeTypes: EpisodeType[];

	/** Triggers */
	triggers: BlueprintItem[];

	/** Vitals to track */
	vitals: VitalField[];

	/** Default medications (user can add more) */
	medications: MedicationSlot[];

	/** Which symptom columns appear in the monthly grid */
	gridSymptomColumns: string[];  // item IDs from symptomGroups

	/** Which episode columns appear in the monthly grid */
	gridEpisodeColumns: string[];  // episode type IDs

	/** Quick actions on the companion page */
	quickActions: {
		id: string;
		label: string;
		icon: string;
		color: string;
		href: string;
	}[];

	/** Stream filter tabs */
	streamFilters: {
		key: string;
		label: string;
	}[];
}
