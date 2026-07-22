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

/** CIPH-882 — A user-added custom symptom. Optional `groupId` lets the
 *  user attach a custom symptom under an existing preset group; otherwise
 *  it lands in a synthetic "Custom" group at render time. */
export interface CustomSymptomItem extends BlueprintItem {
	groupId?: string;
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
	/** Track duration per episode (e.g., <1min, 1-5min, >5min) */
	trackDuration?: boolean;
	/** Track time of day per episode */
	trackTimeOfDay?: boolean;
	/** This episode typically spans many days (flare, manic episode, etc.).
	 *  When true, calendar renders consecutive marked days as a band; the
	 *  log-page UI shows an "ongoing today" toggle instead of a counter. */
	multiDay?: boolean;
}

/** A vital sign to track */
export interface VitalField {
	id: string;
	label: string;
	unit: string;
	placeholder: string;
	multiEntry?: boolean;  // allows multiple time+value entries per day
	/** Vitals sharing the same pairLabel render side-by-side (e.g. left/right IOP) */
	pairLabel?: string;
	/** UI hint: render a constrained range slider/number with min/max */
	min?: number;
	max?: number;
	/** Skip this vital from the auto-generated trend charts.
	 *  Use for values that don't make sense as a monthly mean —
	 *  e.g. cycle_day (sawtooths), cycle_length (step function). */
	excludeFromTrends?: boolean;
	/** Clinical reference / target line drawn horizontally on the trend chart.
	 *  E.g. BP target 140 mmHg, IOP target 21 mmHg, HbA1c target 7%. */
	referenceLine?: { value: number; labelKey: string };
	/** For multi-entry vitals: split the daily entries by time of day
	 *  (before vs after noon) and render two lines on the same chart.
	 *  Morning hypertension is its own clinical entity. */
	splitByTimeOfDay?: boolean;
}

/** Medication template */
export interface MedicationSlot {
	id: string;
	name: string;
	dose: string;
	schedule: string;    // e.g. "morgens, abends" or "as needed"
	asNeeded: boolean;
}

/** CIPH-881 — Rescue medication preset for the FAB quick-add "med" mode.
 *  Distinct from MedicationSlot: rescue meds are taken episodically (during
 *  a flare / crisis / breakthrough event), not on a schedule. Selecting one
 *  in the FAB writes a `type:'event'` + `kind:'medication'` doc with the
 *  current time; render coverage in CIPH-881b spans journal / reports /
 *  PDF / CSV / dashboard. */
export interface RescueMedication {
	/** Stable identifier — used as the medicationId on event docs. */
	id: string;
	/** i18n key for the user-facing label, e.g. `rescue_med.midazolam`. */
	label: string;
	/** Optional unit i18n key (e.g. `unit.mg`, `unit.puff`). */
	unit?: string;
	/** Optional preset dose value (just the number / amount). */
	defaultDose?: string;
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

	/** CIPH-723 — i18n key for the condition-specific episode noun used
	 *  in dashboard headlines / chart legends / SR captions. E.g.
	 *  `episode_noun.seizure` for epilepsy, `episode_noun.tremor` for
	 *  parkinson. Optional — defaults to "Episoden" / "Episodes". */
	episodeNoun?: string;

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

	/** CIPH-881 — Rescue / breakthrough medications surfaced as a third
	 *  FAB quick-add mode. Optional + backwards compatible: when absent or
	 *  empty, the FAB does not render the "med" mode chip. */
	rescueMedications?: RescueMedication[];

	/** Which symptom columns appear in the monthly grid */
	gridSymptomColumns: string[];  // item IDs from symptomGroups

	/** Which episode columns appear in the monthly grid */
	gridEpisodeColumns: string[];  // episode type IDs

	/** Stream filter tabs */
	streamFilters: {
		key: string;
		label: string;
	}[];

	/** Preferred report type */
	reportPreference: 'analytics' | 'grid' | 'both';

	/** CIPH-852 — the browse-surface the user most benefits from for this
	 *  condition. Home dashboard + navigation emphasize this surface.
	 *  - 'journal' — chronological entry stream is primary (narrative conditions)
	 *  - 'calendar' — spatial month view is primary (cycle / phase-band conditions)
	 *  - 'trend' — trend chart is primary (discrete-event conditions)
	 *  Optional for backwards-compat; read through `getPrimaryBrowseSurface()`
	 *  which falls back to the cohort default. User can override in Settings. */
	primaryBrowseSurface?: 'journal' | 'calendar' | 'trend';

	/** CIPH-pi18-3 — Display format for the custom DatePicker popover and
	 *  trigger. Read by call sites of `<DatePicker>`. Default `dd.mm.yyyy`
	 *  (Swiss/EU) when unset, matching the existing PI v17 behavior. */
	dateFormat?: 'dd.mm.yyyy' | 'dd/mm/yyyy' | 'iso' | 'us';
	/** Welcome-card variants the user has dismissed (2026-06-12).
	 *  Account-level (rides the encrypted blueprint doc) so a dismissal
	 *  survives browsers/devices — localStorage-only dismissal kept
	 *  resurfacing the migrate card on every fresh profile. Optional
	 *  for backwards-compat; read through WelcomeCard's combined check. */
	dismissedWelcome?: Array<'web' | 'migrate'>;

	/** CIPH-pi24-5c — Marker event for the dashboard gap-trend sparkline
	 *  ("Tage ohne {Anfall|Attacke|Episode|Schub|...}"). Only declared for
	 *  presets where a clean episodic marker exists; absence hides the card.
	 *  Klara's prior objection to "days since last episode" framing is met
	 *  by showing a gap *trend* (treatment-efficacy signal) rather than a
	 *  bare counter — see Companion.svelte:124. `episodeIds` are matched
	 *  against entry.data.episodes; `nounKey` is the i18n singular noun
	 *  rendered through `companion.streak_no_type`. */
	markerEvent?: { episodeIds: string[]; nounKey: string };

	/** CIPH-301b / CIPH-882 — User customizations from the setup wizard
	 *  or settings. Two layers:
	 *
	 *  - **Hide layer (CIPH-301b):** ids listed in `hidden*` are removed
	 *    from render surfaces and PDF aggregations. The underlying preset
	 *    is untouched so re-enabling resurfaces history.
	 *
	 *  - **Add layer (CIPH-882):** items in `custom*` are merged into the
	 *    blueprint at read time via `resolveBlueprint(bp)`. Custom items
	 *    own a literal `label` string (NOT an i18n key); render sites must
	 *    branch via `isCustomItem(id) ? item.label : $t(item.label)`. Ids
	 *    are auto-generated `custom_<slug>_<suffix>` so they cannot
	 *    collide with preset ids. Hide-not-delete applies to custom items
	 *    too — toggling a custom off keeps history; explicit Delete is
	 *    needed to remove the item from `custom*`.
	 *
	 *  Both layers are optional + backwards-compatible — a missing field
	 *  means "no customizations".
	 */
	customizations?: {
		/** User-chosen display name for the profile, overriding the preset's
		 *  translated conditionLabel wherever the profile name is shown. The
		 *  conditionId (the "tag"/badge) stays fixed — it's an encryption + cohort
		 *  key, not a display string. Empty/absent = use the preset label. */
		displayLabel?: string;
		hiddenSymptoms?: string[];   // BlueprintItem.id from any symptomGroup or customSymptoms
		hiddenTriggers?: string[];   // BlueprintItem.id from triggers[] or customTriggers
		hiddenVitals?: string[];     // VitalField.id from vitals[] or customVitals

		// CIPH-882 additive arrays
		customSymptoms?: CustomSymptomItem[];
		customTriggers?: BlueprintItem[];
		customVitals?: VitalField[];
		customEpisodes?: EpisodeType[];
	};
}

/* ────────────────────────────────────────────────────────────────
 * Document-data shapes (CIPH-710 / CIPH-713).
 * The actual `CiphraDocument.data` is typed `any` for backwards-compat,
 * but these interfaces document the shapes consumers should expect and
 * write. Two flags govern export eligibility (see `utils/exportable.ts`):
 *   - `type === 'diary'` is always excluded.
 *   - `private === true` on Entry/Event is excluded.
 * ──────────────────────────────────────────────────────────────── */

export interface DiaryDoc {
	type: 'diary';
	date: string;          // YYYY-MM-DD
	time?: string;         // HH:MM, optional
	text: string;
	/** Always implicitly true; included for explicitness. */
	private?: boolean;
}

export interface EntryDoc {
	type: 'entry';
	date: string;
	private?: boolean;
	/** Scheduled (non-asNeeded) medication IDs the user marked as MISSED on
	 *  this day. Scheduled meds are assumed taken (part of the regimen), so we
	 *  record only the exceptions — no daily "taken" tap. Absent/empty = all
	 *  scheduled doses assumed taken. As-needed meds use `medications` instead
	 *  (an explicit "taken today" toggle / FAB event). */
	missedMedications?: string[];
	[k: string]: unknown;
}

export interface EventDoc {
	type: 'event';
	date: string;
	private?: boolean;
	[k: string]: unknown;
}
