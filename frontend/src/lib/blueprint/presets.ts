import type { Blueprint } from './types';
import { DATA_1, DATA_2, DATA_3, DATA_4, DATA_5, DATA_6 } from '../dataPalette';

/*
 * CIPH-801 — every `accentColor` and every `episodeTypes[].color` in
 * this file MUST reference DATA_1..DATA_6 from `../dataPalette`. The
 * vitest `presets-palette.test.ts` enforces this, and also checks
 * that no two adjacent episodeTypes within a preset share the same
 * color (so stacked bars stay scannable and color-blind friendly).
 */

// ─── Epilepsy ────────────────────────────────────────────────

export const epilepsy: Blueprint = {
	version: 1,
	conditionId: 'epilepsy',
	conditionLabel: 'landing.template_epilepsy',
	accentColor: DATA_1,
	episodeNoun: 'episode_noun.seizure',
	symptomGroups: [
		{
			id: 'behavior', label: 'symptom_group.behavior', items: [
				{ id: 'tired', label: 'symptom.tired' },
				{ id: 'aggressive', label: 'symptom.aggressive' },
				{ id: 'restless', label: 'symptom.restless' },
				{ id: 'irritable', label: 'symptom.irritable' },
				{ id: 'anxious', label: 'symptom.anxious' },
				{ id: 'confused', label: 'symptom.confused' },
			]
		},
		{
			id: 'physical', label: 'symptom_group.physical', items: [
				{ id: 'nausea', label: 'symptom.nausea' },
				{ id: 'dizzy', label: 'symptom.dizzy' },
				{ id: 'headache', label: 'symptom.headache' },
				{ id: 'aura', label: 'symptom.aura' },
			]
		},
		{
			id: 'sleep', label: 'symptom_group.sleep', items: [
				{ id: 'slept_badly', label: 'symptom.slept_badly' },
			]
		},
	],
	episodeTypes: [
		{ id: 'focal', label: 'seizure.focal', color: DATA_1, trackDuration: true, trackTimeOfDay: true },
		{ id: 'generalized', label: 'seizure.generalized', color: DATA_2, trackDuration: true, trackTimeOfDay: true },
		{ id: 'absence', label: 'seizure.absence', color: DATA_3, trackDuration: true, trackTimeOfDay: true },
		{ id: 'myoclonic', label: 'seizure.myoclonic', color: DATA_4, trackDuration: true, trackTimeOfDay: true },
		{ id: 'unknown', label: 'seizure.unknown', color: DATA_5, trackDuration: true, trackTimeOfDay: true },
	],
	triggers: [
		{ id: 'stress', label: 'trigger.stress' },
		{ id: 'sleep_deprivation', label: 'trigger.sleep_deprivation' },
		{ id: 'weather', label: 'trigger.weather' },
		{ id: 'menstruation', label: 'trigger.menstruation' },
		{ id: 'alcohol', label: 'trigger.alcohol' },
		{ id: 'missed_meds', label: 'trigger.missed_meds' },
		{ id: 'light', label: 'trigger.light' },
	],
	vitals: [
		{ id: 'sleep_hours', label: 'vital.sleep_hours', unit: 'h', placeholder: '7' },
		{ id: 'mood', label: 'vital.mood', unit: '1-10', placeholder: '5' },
		{ id: 'weight', label: 'vital.weight', unit: 'kg', placeholder: '70' },
	],
	medications: [],
	gridSymptomColumns: ['tired', 'aggressive', 'restless', 'nausea', 'dizzy', 'headache', 'aura'],
	gridEpisodeColumns: ['focal', 'generalized'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'entry', label: 'stream_filter.entry' },
		{ key: 'event', label: 'stream_filter.event' },
		{ key: 'diary', label: 'stream_filter.diary' },
	],
	reportPreference: 'both',
	primaryBrowseSurface: 'trend',
	rescueMedications: [
		{ id: 'midazolam_buccal', label: 'rescue_med.midazolam', unit: 'mg', defaultDose: '5' },
		{ id: 'diazepam_rectal', label: 'rescue_med.diazepam', unit: 'mg', defaultDose: '10' },
	],
};

// ─── ADHD ────────────────────────────────────────────────────

export const adhd: Blueprint = {
	version: 1,
	conditionId: 'adhd',
	conditionLabel: 'landing.template_adhd',
	accentColor: DATA_3,
	symptomGroups: [
		{
			id: 'focus', label: 'symptom_group.focus', items: [
				{ id: 'distracted', label: 'symptom.distracted' },
				{ id: 'hyperfocus', label: 'symptom.hyperfocus' },
				{ id: 'forgetful', label: 'symptom.forgetful' },
				{ id: 'brain_fog', label: 'symptom.brain_fog' },
				{ id: 'procrastinating', label: 'symptom.procrastinating' },
			]
		},
		{
			id: 'impulse', label: 'symptom_group.impulse', items: [
				{ id: 'impulsive', label: 'symptom.impulsive' },
				{ id: 'restless', label: 'symptom.restless' },
				{ id: 'impatient', label: 'symptom.impatient' },
				{ id: 'interrupting', label: 'symptom.interrupting' },
			]
		},
		{
			id: 'emotion', label: 'symptom_group.emotion', items: [
				{ id: 'irritable', label: 'symptom.irritable' },
				{ id: 'overwhelmed', label: 'symptom.overwhelmed' },
				{ id: 'anxious', label: 'symptom.anxious' },
				{ id: 'mood_swings', label: 'symptom.mood_swings' },
				{ id: 'rejection_sensitive', label: 'symptom.rejection_sensitive' },
			]
		},
		{
			id: 'energy', label: 'symptom_group.energy', items: [
				{ id: 'tired', label: 'symptom.tired' },
				{ id: 'wired', label: 'symptom.wired' },
				{ id: 'slept_badly', label: 'symptom.slept_badly' },
				{ id: 'hard_to_get_up', label: 'symptom.hard_to_get_up' },
			]
		},
	],
	episodeTypes: [
		{ id: 'meltdown', label: 'seizure.meltdown', color: DATA_1 },
		{ id: 'shutdown', label: 'seizure.shutdown', color: DATA_5 },
		{ id: 'panic_attack', label: 'seizure.panic_attack', color: DATA_3 },
	],
	triggers: [
		{ id: 'stress', label: 'trigger.stress' },
		{ id: 'sleep_deprivation', label: 'trigger.sleep_deprivation' },
		{ id: 'overstimulation', label: 'trigger.overstimulation' },
		{ id: 'boredom', label: 'trigger.boredom' },
		{ id: 'hunger', label: 'trigger.hunger' },
		{ id: 'caffeine', label: 'trigger.caffeine' },
		{ id: 'missed_meds', label: 'trigger.missed_meds' },
		{ id: 'social_conflict', label: 'trigger.social_conflict' },
		{ id: 'time_pressure', label: 'trigger.time_pressure' },
	],
	vitals: [
		{ id: 'sleep_hours', label: 'vital.sleep_hours', unit: 'h', placeholder: '7' },
		{ id: 'mood', label: 'vital.mood', unit: '1-10', placeholder: '5' },
		{ id: 'energy_level', label: 'vital.energy_level', unit: '1-10', placeholder: '5' },
		{ id: 'pulse', label: 'vital.pulse', unit: 'bpm', placeholder: '72' },
	],
	medications: [],
	gridSymptomColumns: ['distracted', 'hyperfocus', 'forgetful', 'restless', 'overwhelmed', 'tired'],
	gridEpisodeColumns: ['meltdown', 'shutdown'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'entry', label: 'stream_filter.entry' },
		{ key: 'event', label: 'stream_filter.event' },
		{ key: 'diary', label: 'stream_filter.diary' },
	],
	reportPreference: 'both',
	primaryBrowseSurface: 'trend',
};

// ─── Diabetes ────────────────────────────────────────────────

export const diabetes: Blueprint = {
	version: 1,
	conditionId: 'diabetes',
	conditionLabel: 'landing.template_diabetes',
	accentColor: DATA_4,
	symptomGroups: [
		{
			id: 'hypo_signs', label: 'symptom_group.hypo_signs', items: [
				{ id: 'shaking', label: 'symptom.shaking' },
				{ id: 'sweating', label: 'symptom.sweating' },
				{ id: 'dizzy', label: 'symptom.dizzy' },
				{ id: 'confused', label: 'symptom.confused' },
				{ id: 'hungry', label: 'symptom.hungry' },
				{ id: 'blurred_vision', label: 'symptom.blurred_vision' },
			]
		},
		{
			id: 'hyper_signs', label: 'symptom_group.hyper_signs', items: [
				{ id: 'thirsty', label: 'symptom.thirsty' },
				{ id: 'frequent_urination', label: 'symptom.frequent_urination' },
				{ id: 'tired', label: 'symptom.tired' },
				{ id: 'nausea', label: 'symptom.nausea' },
			]
		},
		{
			id: 'general', label: 'symptom_group.general', items: [
				{ id: 'headache', label: 'symptom.headache' },
				{ id: 'irritable', label: 'symptom.irritable' },
				{ id: 'slept_badly', label: 'symptom.slept_badly' },
			]
		},
	],
	episodeTypes: [
		{ id: 'hypoglycemia', label: 'seizure.hypoglycemia', color: DATA_1 },
		{ id: 'hyperglycemia', label: 'seizure.hyperglycemia', color: DATA_3 },
		{ id: 'ketoacidosis', label: 'seizure.ketoacidosis', color: DATA_2 },
	],
	triggers: [
		{ id: 'missed_meds', label: 'trigger.missed_meds' },
		{ id: 'stress', label: 'trigger.stress' },
		{ id: 'high_carb_meal', label: 'trigger.high_carb_meal' },
		{ id: 'exercise', label: 'trigger.exercise' },
		{ id: 'illness', label: 'trigger.illness' },
		{ id: 'alcohol', label: 'trigger.alcohol' },
	],
	vitals: [
		{ id: 'blood_sugar', label: 'vital.blood_sugar', unit: 'mg/dL', placeholder: '110' },
		{ id: 'insulin', label: 'vital.insulin', unit: 'units', placeholder: '10', multiEntry: true },
		{ id: 'bp_systolic', label: 'vital.bp_systolic', unit: 'mmHg', placeholder: '120', pairLabel: 'bp', referenceLine: { value: 140, labelKey: 'vital.target_bp_systolic' } },
		{ id: 'bp_diastolic', label: 'vital.bp_diastolic', unit: 'mmHg', placeholder: '80', pairLabel: 'bp', referenceLine: { value: 90, labelKey: 'vital.target_bp_diastolic' } },
		{ id: 'weight', label: 'vital.weight', unit: 'kg', placeholder: '70' },
		{ id: 'ketones', label: 'vital.ketones', unit: 'mmol/L', placeholder: '0.5' },
		{ id: 'carbs', label: 'vital.carbs', unit: 'g', placeholder: '45' },
		// hba1c is a quarterly lab value but we render it as a sparse trend
		{ id: 'hba1c', label: 'vital.hba1c', unit: '%', placeholder: '7.0', referenceLine: { value: 7.0, labelKey: 'vital.target_hba1c' } },
	],
	medications: [],
	gridSymptomColumns: ['shaking', 'sweating', 'dizzy', 'thirsty', 'tired'],
	gridEpisodeColumns: ['hypoglycemia', 'hyperglycemia'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'entry', label: 'stream_filter.entry' },
		{ key: 'event', label: 'stream_filter.event' },
		{ key: 'diary', label: 'stream_filter.diary' },
	],
	reportPreference: 'both',
	primaryBrowseSurface: 'trend',
};

// ─── Burnout ─────────────────────────────────────────────────

export const burnout: Blueprint = {
	version: 1,
	conditionId: 'burnout',
	conditionLabel: 'landing.template_burnout',
	accentColor: DATA_5,
	symptomGroups: [
		{
			id: 'mental', label: 'symptom_group.mental', items: [
				{ id: 'exhausted', label: 'symptom.exhausted' },
				{ id: 'overwhelmed', label: 'symptom.overwhelmed' },
				{ id: 'cynical', label: 'symptom.cynical' },
				{ id: 'brain_fog', label: 'symptom.brain_fog' },
				{ id: 'no_motivation', label: 'symptom.no_motivation' },
				{ id: 'anxious', label: 'symptom.anxious' },
			]
		},
		{
			id: 'physical', label: 'symptom_group.physical', items: [
				{ id: 'tired', label: 'symptom.tired' },
				{ id: 'headache', label: 'symptom.headache' },
				{ id: 'back_pain', label: 'symptom.back_pain' },
				{ id: 'tension', label: 'symptom.tension' },
				{ id: 'stomach', label: 'symptom.stomach' },
			]
		},
		{
			id: 'sleep', label: 'symptom_group.sleep', items: [
				{ id: 'slept_badly', label: 'symptom.slept_badly' },
				{ id: 'insomnia', label: 'symptom.insomnia' },
				{ id: 'nightmares', label: 'symptom.nightmares' },
			]
		},
		{
			id: 'social', label: 'symptom_group.social', items: [
				{ id: 'isolated', label: 'symptom.isolated' },
				{ id: 'irritable', label: 'symptom.irritable' },
				{ id: 'conflict', label: 'symptom.conflict' },
			]
		},
	],
	episodeTypes: [
		{ id: 'breakdown', label: 'seizure.breakdown', color: DATA_1 },
		{ id: 'panic_attack', label: 'seizure.panic_attack', color: DATA_3 },
		{ id: 'crying_spell', label: 'seizure.crying_spell', color: DATA_5 },
	],
	triggers: [
		{ id: 'work_overload', label: 'trigger.work_overload' },
		{ id: 'deadline', label: 'trigger.deadline' },
		{ id: 'conflict_work', label: 'trigger.conflict_work' },
		{ id: 'conflict_private', label: 'trigger.conflict_private' },
		{ id: 'sleep_deprivation', label: 'trigger.sleep_deprivation' },
		{ id: 'no_breaks', label: 'trigger.no_breaks' },
		{ id: 'perfectionism', label: 'trigger.perfectionism' },
	],
	vitals: [
		{ id: 'energy_level', label: 'vital.energy_level', unit: '1-10', placeholder: '5' },
		{ id: 'mood', label: 'vital.mood', unit: '1-10', placeholder: '5' },
		{ id: 'pulse', label: 'vital.pulse', unit: 'bpm', placeholder: '72' },
		{ id: 'sleep_hours', label: 'vital.sleep_hours', unit: 'h', placeholder: '7' },
	],
	medications: [],
	gridSymptomColumns: ['exhausted', 'overwhelmed', 'brain_fog', 'tired', 'insomnia', 'isolated'],
	gridEpisodeColumns: ['breakdown', 'panic_attack'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'entry', label: 'stream_filter.entry' },
		{ key: 'event', label: 'stream_filter.event' },
		{ key: 'diary', label: 'stream_filter.diary' },
	],
	reportPreference: 'both',
	primaryBrowseSurface: 'calendar',
};

// ─── Migraine ────────────────────────────────────────────────

export const migraine: Blueprint = {
	version: 1,
	conditionId: 'migraine',
	conditionLabel: 'landing.template_migraine',
	accentColor: DATA_2,
	episodeNoun: 'episode_noun.attack',
	symptomGroups: [
		{
			id: 'prodrome', label: 'symptom_group.prodrome', items: [
				{ id: 'mood_change', label: 'symptom.mood_change' },
				{ id: 'food_cravings', label: 'symptom.food_cravings' },
				{ id: 'neck_stiffness', label: 'symptom.neck_stiffness' },
				{ id: 'yawning', label: 'symptom.yawning' },
			]
		},
		{
			id: 'aura', label: 'symptom_group.aura', items: [
				{ id: 'visual_aura', label: 'symptom.visual_aura' },
				{ id: 'tingling', label: 'symptom.tingling' },
				{ id: 'speech_difficulty', label: 'symptom.speech_difficulty' },
			]
		},
		{
			id: 'attack', label: 'symptom_group.attack', items: [
				{ id: 'headache', label: 'symptom.headache' },
				{ id: 'nausea', label: 'symptom.nausea' },
				{ id: 'vomiting', label: 'symptom.vomiting' },
				{ id: 'light_sensitive', label: 'symptom.light_sensitive' },
				{ id: 'sound_sensitive', label: 'symptom.sound_sensitive' },
				{ id: 'dizzy', label: 'symptom.dizzy' },
			]
		},
		{
			id: 'postdrome', label: 'symptom_group.postdrome', items: [
				{ id: 'tired', label: 'symptom.tired' },
				{ id: 'confused', label: 'symptom.confused' },
				{ id: 'drained', label: 'symptom.drained' },
			]
		},
	],
	episodeTypes: [
		{ id: 'migraine_with_aura', label: 'seizure.migraine_with_aura', color: DATA_2, trackDuration: true, trackTimeOfDay: true },
		{ id: 'migraine_without_aura', label: 'seizure.migraine_without_aura', color: DATA_6, trackDuration: true, trackTimeOfDay: true },
		{ id: 'tension_headache', label: 'seizure.tension_headache', color: DATA_3, trackDuration: true },
		{ id: 'cluster_headache', label: 'seizure.cluster_headache', color: DATA_1, trackDuration: true, trackTimeOfDay: true },
	],
	triggers: [
		{ id: 'stress', label: 'trigger.stress' },
		{ id: 'weather', label: 'trigger.weather' },
		{ id: 'sleep_deprivation', label: 'trigger.sleep_deprivation' },
		{ id: 'alcohol', label: 'trigger.alcohol' },
		{ id: 'caffeine_withdrawal', label: 'trigger.caffeine_withdrawal' },
		{ id: 'menstruation', label: 'trigger.menstruation' },
		{ id: 'bright_light', label: 'trigger.bright_light' },
		{ id: 'strong_smells', label: 'trigger.strong_smells' },
		{ id: 'skipped_meal', label: 'trigger.skipped_meal' },
	],
	vitals: [
		{ id: 'pain_level', label: 'vital.pain_level', unit: '1-10', placeholder: '5' },
		{ id: 'duration_hours', label: 'vital.duration_hours', unit: 'h', placeholder: '4' },
		{ id: 'sleep_hours', label: 'vital.sleep_hours', unit: 'h', placeholder: '7' },
	],
	medications: [],
	gridSymptomColumns: ['headache', 'nausea', 'light_sensitive', 'visual_aura', 'tired'],
	gridEpisodeColumns: ['migraine_with_aura', 'migraine_without_aura', 'tension_headache'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'entry', label: 'stream_filter.entry' },
		{ key: 'event', label: 'stream_filter.event' },
		{ key: 'diary', label: 'stream_filter.diary' },
	],
	reportPreference: 'both',
	primaryBrowseSurface: 'journal',
	rescueMedications: [
		{ id: 'sumatriptan', label: 'rescue_med.sumatriptan', unit: 'mg', defaultDose: '50' },
		{ id: 'rizatriptan', label: 'rescue_med.rizatriptan', unit: 'mg', defaultDose: '10' },
	],
};

// ─── Empty starter for fully custom blueprints ───────────────

export const custom: Blueprint = {
	version: 1,
	conditionId: 'custom',
	conditionLabel: 'landing.template_custom',
	accentColor: DATA_5,
	symptomGroups: [
		{ id: 'general', label: 'symptom_group.general', items: [] },
	],
	episodeTypes: [],
	triggers: [],
	vitals: [],
	medications: [],
	gridSymptomColumns: [],
	gridEpisodeColumns: [],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'entry', label: 'stream_filter.entry' },
		{ key: 'event', label: 'stream_filter.event' },
		{ key: 'diary', label: 'stream_filter.diary' },
	],
	reportPreference: 'both',
	primaryBrowseSurface: 'journal',
};

// ─── Chronic Pain / Fibromyalgia ─────────────────────────────

export const chronic_pain: Blueprint = {
	version: 1,
	conditionId: 'chronic_pain',
	conditionLabel: 'landing.template_chronic_pain',
	accentColor: DATA_1,
	symptomGroups: [
		{
			id: 'pain_quality', label: 'symptom_group.pain_quality', items: [
				{ id: 'burning', label: 'symptom.burning' },
				{ id: 'stabbing', label: 'symptom.stabbing' },
				{ id: 'aching', label: 'symptom.aching' },
				{ id: 'throbbing', label: 'symptom.throbbing' },
				{ id: 'tingling', label: 'symptom.tingling' },
				{ id: 'numbness', label: 'symptom.numbness' },
			]
		},
		{
			id: 'physical', label: 'symptom_group.physical', items: [
				{ id: 'stiffness', label: 'symptom.stiffness' },
				{ id: 'muscle_spasm', label: 'symptom.muscle_spasm' },
				{ id: 'weakness', label: 'symptom.weakness' },
				{ id: 'limited_mobility', label: 'symptom.limited_mobility' },
				{ id: 'tired', label: 'symptom.tired' },
			]
		},
		{
			id: 'cognitive_emotional', label: 'symptom_group.cognitive_emotional', items: [
				{ id: 'brain_fog', label: 'symptom.brain_fog' },
				{ id: 'anxious', label: 'symptom.anxious' },
				{ id: 'depressed', label: 'symptom.depressed' },
				{ id: 'irritable', label: 'symptom.irritable' },
				{ id: 'catastrophizing', label: 'symptom.catastrophizing' },
				{ id: 'overwhelmed', label: 'symptom.overwhelmed' },
			]
		},
		{
			id: 'sleep', label: 'symptom_group.sleep', items: [
				{ id: 'slept_badly', label: 'symptom.slept_badly' },
				{ id: 'insomnia', label: 'symptom.insomnia' },
				{ id: 'woke_from_pain', label: 'symptom.woke_from_pain' },
				{ id: 'unrefreshed', label: 'symptom.unrefreshed' },
			]
		},
	],
	episodeTypes: [
		{ id: 'flare', label: 'seizure.flare', color: DATA_1, multiDay: true },
		{ id: 'breakthrough_pain', label: 'seizure.breakthrough_pain', color: DATA_3 },
		{ id: 'severe_episode', label: 'seizure.severe_episode', color: DATA_2 },
		{ id: 'functional_crisis', label: 'seizure.functional_crisis', color: DATA_5 },
	],
	triggers: [
		{ id: 'stress', label: 'trigger.stress' },
		{ id: 'weather', label: 'trigger.weather' },
		{ id: 'sleep_deprivation', label: 'trigger.sleep_deprivation' },
		{ id: 'overexertion', label: 'trigger.overexertion' },
		{ id: 'prolonged_sitting', label: 'trigger.prolonged_sitting' },
		{ id: 'cold_exposure', label: 'trigger.cold_exposure' },
		{ id: 'menstruation', label: 'trigger.menstruation' },
		{ id: 'missed_meds', label: 'trigger.missed_meds' },
		{ id: 'emotional_distress', label: 'trigger.emotional_distress' },
	],
	vitals: [
		{ id: 'pain_level', label: 'vital.pain_level', unit: '0-10', placeholder: '5', pairLabel: 'pain' },
		{ id: 'pain_interference', label: 'vital.pain_interference', unit: '0-10', placeholder: '5', pairLabel: 'pain' },
		{ id: 'sleep_hours', label: 'vital.sleep_hours', unit: 'h', placeholder: '7' },
		{ id: 'mood', label: 'vital.mood', unit: '1-10', placeholder: '5' },
	],
	medications: [],
	gridSymptomColumns: ['burning', 'aching', 'stiffness', 'tired', 'brain_fog', 'insomnia'],
	gridEpisodeColumns: ['flare', 'breakthrough_pain'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'entry', label: 'stream_filter.entry' },
		{ key: 'event', label: 'stream_filter.event' },
		{ key: 'diary', label: 'stream_filter.diary' },
	],
	reportPreference: 'both',
	primaryBrowseSurface: 'calendar',
};

// ─── Multiple Sclerosis ─────────────────────────────────────

export const ms: Blueprint = {
	version: 1,
	conditionId: 'ms',
	conditionLabel: 'landing.template_ms',
	accentColor: DATA_6,
	symptomGroups: [
		{
			id: 'motor', label: 'symptom_group.motor', items: [
				{ id: 'weakness', label: 'symptom.weakness' },
				{ id: 'spasticity', label: 'symptom.spasticity' },
				{ id: 'balance_problems', label: 'symptom.balance_problems' },
				{ id: 'tremor', label: 'symptom.tremor' },
				{ id: 'gait_difficulty', label: 'symptom.gait_difficulty' },
			]
		},
		{
			id: 'sensory', label: 'symptom_group.sensory', items: [
				{ id: 'numbness', label: 'symptom.numbness' },
				{ id: 'tingling', label: 'symptom.tingling' },
				{ id: 'ms_hug', label: 'symptom.ms_hug' },
				{ id: 'lhermitte_sign', label: 'symptom.lhermitte_sign' },
			]
		},
		{
			id: 'vision', label: 'symptom_group.vision', items: [
				{ id: 'blurred_vision', label: 'symptom.blurred_vision' },
				{ id: 'double_vision', label: 'symptom.double_vision' },
				{ id: 'eye_pain', label: 'symptom.eye_pain' },
			]
		},
		{
			id: 'cognitive', label: 'symptom_group.cognitive', items: [
				{ id: 'brain_fog', label: 'symptom.brain_fog' },
				{ id: 'forgetful', label: 'symptom.forgetful' },
				{ id: 'slow_processing', label: 'symptom.slow_processing' },
			]
		},
		{
			id: 'fatigue_bladder', label: 'symptom_group.fatigue_bladder', items: [
				{ id: 'ms_fatigue', label: 'symptom.ms_fatigue' },
				{ id: 'tired', label: 'symptom.tired' },
				{ id: 'urinary_urgency', label: 'symptom.urinary_urgency' },
				{ id: 'heat_sensitivity', label: 'symptom.heat_sensitivity' },
			]
		},
	],
	episodeTypes: [
		{ id: 'relapse', label: 'seizure.relapse', color: DATA_1, multiDay: true },
		{ id: 'pseudo_relapse', label: 'seizure.pseudo_relapse', color: DATA_3, multiDay: true },
		{ id: 'optic_neuritis', label: 'seizure.optic_neuritis', color: DATA_2, multiDay: true },
	],
	triggers: [
		{ id: 'heat', label: 'trigger.heat' },
		{ id: 'infection', label: 'trigger.infection' },
		{ id: 'stress', label: 'trigger.stress' },
		{ id: 'sleep_deprivation', label: 'trigger.sleep_deprivation' },
		{ id: 'overexertion', label: 'trigger.overexertion' },
		{ id: 'missed_meds', label: 'trigger.missed_meds' },
	],
	vitals: [
		{ id: 'fatigue_scale', label: 'vital.fatigue_scale', unit: '1-10', placeholder: '5' },
		{ id: 'walking_distance', label: 'vital.walking_distance', unit: 'm', placeholder: '500' },
		{ id: 'sleep_hours', label: 'vital.sleep_hours', unit: 'h', placeholder: '7' },
		{ id: 'mood', label: 'vital.mood', unit: '1-10', placeholder: '5' },
	],
	medications: [],
	gridSymptomColumns: ['ms_fatigue', 'spasticity', 'numbness', 'brain_fog', 'blurred_vision', 'gait_difficulty'],
	gridEpisodeColumns: ['relapse', 'pseudo_relapse'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'entry', label: 'stream_filter.entry' },
		{ key: 'event', label: 'stream_filter.event' },
		{ key: 'diary', label: 'stream_filter.diary' },
	],
	reportPreference: 'both',
	primaryBrowseSurface: 'calendar',
};

// ─── Anxiety & Depression ───────────────────────────────────

export const anxiety_depression: Blueprint = {
	version: 1,
	conditionId: 'anxiety_depression',
	conditionLabel: 'landing.template_anxiety_depression',
	accentColor: DATA_5,
	symptomGroups: [
		{
			id: 'mood_affect', label: 'symptom_group.mood_affect', items: [
				{ id: 'depressed_mood', label: 'symptom.depressed_mood' },
				{ id: 'hopelessness', label: 'symptom.hopelessness' },
				{ id: 'anhedonia', label: 'symptom.anhedonia' },
				{ id: 'emotional_numbness', label: 'symptom.emotional_numbness' },
				{ id: 'mood_swings', label: 'symptom.mood_swings' },
			]
		},
		{
			id: 'anxiety_fear', label: 'symptom_group.anxiety_fear', items: [
				{ id: 'excessive_worry', label: 'symptom.excessive_worry' },
				{ id: 'restless', label: 'symptom.restless' },
				{ id: 'on_edge', label: 'symptom.on_edge' },
				{ id: 'racing_thoughts', label: 'symptom.racing_thoughts' },
				{ id: 'dread', label: 'symptom.dread' },
			]
		},
		{
			id: 'physical', label: 'symptom_group.physical', items: [
				{ id: 'tension', label: 'symptom.tension' },
				{ id: 'chest_tightness', label: 'symptom.chest_tightness' },
				{ id: 'nausea', label: 'symptom.nausea' },
				{ id: 'headache', label: 'symptom.headache' },
				{ id: 'appetite_change', label: 'symptom.appetite_change' },
			]
		},
		{
			id: 'behavior', label: 'symptom_group.behavior', items: [
				{ id: 'isolated', label: 'symptom.isolated' },
				{ id: 'avoidance', label: 'symptom.avoidance' },
				{ id: 'procrastinating', label: 'symptom.procrastinating' },
			]
		},
		{
			id: 'sleep', label: 'symptom_group.sleep', items: [
				{ id: 'slept_badly', label: 'symptom.slept_badly' },
				{ id: 'insomnia', label: 'symptom.insomnia' },
				{ id: 'hypersomnia', label: 'symptom.hypersomnia' },
				{ id: 'nightmares', label: 'symptom.nightmares' },
			]
		},
	],
	episodeTypes: [
		{ id: 'panic_attack', label: 'seizure.panic_attack', color: DATA_1 },
		{ id: 'depressive_episode', label: 'seizure.depressive_episode', color: DATA_5 },
		{ id: 'anxiety_crisis', label: 'seizure.anxiety_crisis', color: DATA_3 },
		{ id: 'dissociation', label: 'seizure.dissociation', color: DATA_6 },
	],
	triggers: [
		{ id: 'stress', label: 'trigger.stress' },
		{ id: 'sleep_deprivation', label: 'trigger.sleep_deprivation' },
		{ id: 'social_conflict', label: 'trigger.social_conflict' },
		{ id: 'loneliness', label: 'trigger.loneliness' },
		{ id: 'caffeine', label: 'trigger.caffeine' },
		{ id: 'alcohol', label: 'trigger.alcohol' },
		{ id: 'missed_meds', label: 'trigger.missed_meds' },
		{ id: 'rumination', label: 'trigger.rumination' },
		{ id: 'menstruation', label: 'trigger.menstruation' },
	],
	vitals: [
		{ id: 'mood', label: 'vital.mood', unit: '1-10', placeholder: '5' },
		{ id: 'anxiety_level', label: 'vital.anxiety_level', unit: '1-10', placeholder: '3' },
		{ id: 'sleep_hours', label: 'vital.sleep_hours', unit: 'h', placeholder: '7' },
		{ id: 'energy_level', label: 'vital.energy_level', unit: '1-10', placeholder: '5' },
	],
	medications: [],
	gridSymptomColumns: ['depressed_mood', 'anhedonia', 'excessive_worry', 'on_edge', 'insomnia', 'avoidance'],
	gridEpisodeColumns: ['panic_attack', 'depressive_episode'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'entry', label: 'stream_filter.entry' },
		{ key: 'event', label: 'stream_filter.event' },
		{ key: 'diary', label: 'stream_filter.diary' },
	],
	reportPreference: 'both',
	primaryBrowseSurface: 'calendar',
};

// ─── IBS / Digestive Health ─────────────────────────────────

export const ibs: Blueprint = {
	version: 1,
	conditionId: 'ibs',
	conditionLabel: 'landing.template_ibs',
	accentColor: DATA_3,
	symptomGroups: [
		{
			id: 'abdominal', label: 'symptom_group.abdominal', items: [
				{ id: 'abdominal_pain', label: 'symptom.abdominal_pain' },
				{ id: 'cramping', label: 'symptom.cramping' },
				{ id: 'bloating', label: 'symptom.bloating' },
				{ id: 'gas', label: 'symptom.gas' },
				{ id: 'nausea', label: 'symptom.nausea' },
			]
		},
		{
			id: 'bowel', label: 'symptom_group.bowel', items: [
				{ id: 'diarrhea', label: 'symptom.diarrhea' },
				{ id: 'constipation', label: 'symptom.constipation' },
				{ id: 'urgency', label: 'symptom.urgency' },
				{ id: 'incomplete_evacuation', label: 'symptom.incomplete_evacuation' },
				{ id: 'blood_in_stool', label: 'symptom.blood_in_stool' },
			]
		},
		{
			id: 'general', label: 'symptom_group.general', items: [
				{ id: 'tired', label: 'symptom.tired' },
				{ id: 'brain_fog', label: 'symptom.brain_fog' },
				{ id: 'anxious', label: 'symptom.anxious' },
				{ id: 'slept_badly', label: 'symptom.slept_badly' },
			]
		},
	],
	episodeTypes: [
		{ id: 'flare', label: 'seizure.flare', color: DATA_1, multiDay: true },
		{ id: 'urgency_crisis', label: 'seizure.urgency_crisis', color: DATA_3 },
		{ id: 'vomiting_episode', label: 'seizure.vomiting_episode', color: DATA_5 },
	],
	triggers: [
		{ id: 'stress', label: 'trigger.stress' },
		{ id: 'high_fodmap', label: 'trigger.high_fodmap' },
		{ id: 'dairy', label: 'trigger.dairy' },
		{ id: 'gluten', label: 'trigger.gluten' },
		{ id: 'alcohol', label: 'trigger.alcohol' },
		{ id: 'caffeine', label: 'trigger.caffeine' },
		{ id: 'fatty_food', label: 'trigger.fatty_food' },
		{ id: 'spicy_food', label: 'trigger.spicy_food' },
		{ id: 'missed_meds', label: 'trigger.missed_meds' },
		{ id: 'sleep_deprivation', label: 'trigger.sleep_deprivation' },
	],
	vitals: [
		{ id: 'stool_frequency', label: 'vital.stool_frequency', unit: 'x/day', placeholder: '2' },
		{ id: 'bristol_score', label: 'vital.bristol_score', unit: '1-7', placeholder: '4' },
		{ id: 'pain_level', label: 'vital.pain_level', unit: '1-10', placeholder: '3' },
		{ id: 'mood', label: 'vital.mood', unit: '1-10', placeholder: '5' },
		{ id: 'weight', label: 'vital.weight', unit: 'kg', placeholder: '70' },
	],
	medications: [],
	gridSymptomColumns: ['abdominal_pain', 'bloating', 'diarrhea', 'constipation', 'urgency', 'tired'],
	gridEpisodeColumns: ['flare', 'urgency_crisis'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'entry', label: 'stream_filter.entry' },
		{ key: 'event', label: 'stream_filter.event' },
		{ key: 'diary', label: 'stream_filter.diary' },
	],
	reportPreference: 'both',
	primaryBrowseSurface: 'calendar',
};

// ─── Asthma / COPD ──────────────────────────────────────────

export const asthma: Blueprint = {
	version: 1,
	conditionId: 'asthma',
	conditionLabel: 'landing.template_asthma',
	accentColor: DATA_4,
	symptomGroups: [
		{
			id: 'respiratory', label: 'symptom_group.respiratory', items: [
				{ id: 'wheezing', label: 'symptom.wheezing' },
				{ id: 'shortness_of_breath', label: 'symptom.shortness_of_breath' },
				{ id: 'chest_tightness', label: 'symptom.chest_tightness' },
				{ id: 'persistent_cough', label: 'symptom.persistent_cough' },
				{ id: 'sputum', label: 'symptom.sputum' },
			]
		},
		{
			id: 'activity', label: 'symptom_group.activity', items: [
				{ id: 'limited_activity', label: 'symptom.limited_activity' },
				{ id: 'exercise_intolerant', label: 'symptom.exercise_intolerant' },
				{ id: 'tired', label: 'symptom.tired' },
				{ id: 'nocturnal_waking', label: 'symptom.nocturnal_waking' },
			]
		},
		{
			id: 'general', label: 'symptom_group.general', items: [
				{ id: 'headache', label: 'symptom.headache' },
				{ id: 'anxious', label: 'symptom.anxious' },
				{ id: 'slept_badly', label: 'symptom.slept_badly' },
			]
		},
	],
	episodeTypes: [
		{ id: 'asthma_attack', label: 'seizure.asthma_attack', color: DATA_1, trackDuration: true, trackTimeOfDay: true },
		{ id: 'copd_exacerbation', label: 'seizure.copd_exacerbation', color: DATA_2, trackDuration: true },
		{ id: 'respiratory_infection', label: 'seizure.respiratory_infection', color: DATA_3 },
	],
	triggers: [
		{ id: 'allergens', label: 'trigger.allergens' },
		{ id: 'cold_air', label: 'trigger.cold_air' },
		{ id: 'air_pollution', label: 'trigger.air_pollution' },
		{ id: 'exercise', label: 'trigger.exercise' },
		{ id: 'stress', label: 'trigger.stress' },
		{ id: 'smoke_exposure', label: 'trigger.smoke_exposure' },
		{ id: 'weather', label: 'trigger.weather' },
		{ id: 'missed_meds', label: 'trigger.missed_meds' },
		{ id: 'strong_smells', label: 'trigger.strong_smells' },
	],
	vitals: [
		// Personal best PEF: enter once at setup. Used as the reference line
		// for the peak_flow trend chart so the doctor sees % predicted at a
		// glance instead of an arbitrary L/min number.
		{ id: 'personal_best_pef', label: 'vital.personal_best_pef', unit: 'L/min', placeholder: '550', excludeFromTrends: true },
		{ id: 'peak_flow', label: 'vital.peak_flow', unit: 'L/min', placeholder: '400' },
		{ id: 'spo2', label: 'vital.spo2', unit: '%', placeholder: '97', referenceLine: { value: 95, labelKey: 'vital.target_spo2' } },
		{ id: 'rescue_inhaler_puffs', label: 'vital.rescue_inhaler_puffs', unit: 'puffs', placeholder: '0' },
		{ id: 'sleep_hours', label: 'vital.sleep_hours', unit: 'h', placeholder: '7' },
	],
	medications: [],
	gridSymptomColumns: ['wheezing', 'shortness_of_breath', 'chest_tightness', 'persistent_cough', 'nocturnal_waking', 'tired'],
	gridEpisodeColumns: ['asthma_attack', 'copd_exacerbation'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'entry', label: 'stream_filter.entry' },
		{ key: 'event', label: 'stream_filter.event' },
		{ key: 'diary', label: 'stream_filter.diary' },
	],
	reportPreference: 'both',
	primaryBrowseSurface: 'trend',
	rescueMedications: [
		{ id: 'salbutamol_puff', label: 'rescue_med.salbutamol', unit: 'puff', defaultDose: '2' },
		{ id: 'prednisolone', label: 'rescue_med.prednisolone', unit: 'mg', defaultDose: '30' },
	],
};

// ─── Endometriosis ──────────────────────────────────────────

export const endometriosis: Blueprint = {
	version: 1,
	conditionId: 'endometriosis',
	conditionLabel: 'landing.template_endometriosis',
	accentColor: DATA_2,
	symptomGroups: [
		{
			id: 'pelvic_pain', label: 'symptom_group.pelvic_pain', items: [
				{ id: 'dysmenorrhea', label: 'symptom.dysmenorrhea' },
				{ id: 'chronic_pelvic_pain', label: 'symptom.chronic_pelvic_pain' },
				{ id: 'dyspareunia', label: 'symptom.dyspareunia' },
				{ id: 'ovulation_pain', label: 'symptom.ovulation_pain' },
				{ id: 'lower_back_pain', label: 'symptom.lower_back_pain' },
			]
		},
		{
			id: 'gi_symptoms', label: 'symptom_group.gi_symptoms', items: [
				{ id: 'bloating', label: 'symptom.bloating' },
				{ id: 'nausea', label: 'symptom.nausea' },
				{ id: 'diarrhea', label: 'symptom.diarrhea' },
				{ id: 'constipation', label: 'symptom.constipation' },
				{ id: 'painful_bowel', label: 'symptom.painful_bowel' },
			]
		},
		{
			id: 'general', label: 'symptom_group.general', items: [
				{ id: 'tired', label: 'symptom.tired' },
				{ id: 'brain_fog', label: 'symptom.brain_fog' },
				{ id: 'mood_swings', label: 'symptom.mood_swings' },
				{ id: 'anxious', label: 'symptom.anxious' },
				{ id: 'heavy_bleeding', label: 'symptom.heavy_bleeding' },
			]
		},
	],
	episodeTypes: [
		{ id: 'flare', label: 'seizure.flare', color: DATA_1, multiDay: true },
		{ id: 'er_visit', label: 'seizure.er_visit', color: DATA_2 },
		{ id: 'missed_work_school', label: 'seizure.missed_work_school', color: DATA_3 },
	],
	triggers: [
		{ id: 'menstruation', label: 'trigger.menstruation' },
		{ id: 'ovulation', label: 'trigger.ovulation' },
		{ id: 'stress', label: 'trigger.stress' },
		{ id: 'exercise', label: 'trigger.exercise' },
		{ id: 'sexual_activity', label: 'trigger.sexual_activity' },
		{ id: 'certain_foods', label: 'trigger.certain_foods' },
		{ id: 'missed_meds', label: 'trigger.missed_meds' },
		{ id: 'alcohol', label: 'trigger.alcohol' },
	],
	vitals: [
		{ id: 'pain_level', label: 'vital.pain_level', unit: '1-10', placeholder: '5' },
		{ id: 'bleeding_intensity', label: 'vital.bleeding_intensity', unit: '1-5', placeholder: '3' },
		// Endo-specific cycle tracking — daily cycle_day alone isn't enough
		// to spot length-irregularity flares (per persona feedback).
		{ id: 'cycle_day', label: 'vital.cycle_day', unit: 'day', placeholder: '14', excludeFromTrends: true },
		{ id: 'cycle_length', label: 'vital.cycle_length', unit: 'days', placeholder: '28', excludeFromTrends: true },
		{ id: 'period_duration', label: 'vital.period_duration', unit: 'days', placeholder: '5', excludeFromTrends: true },
		{ id: 'sleep_hours', label: 'vital.sleep_hours', unit: 'h', placeholder: '7' },
		{ id: 'mood', label: 'vital.mood', unit: '1-10', placeholder: '5' },
	],
	medications: [],
	gridSymptomColumns: ['dysmenorrhea', 'chronic_pelvic_pain', 'bloating', 'tired', 'heavy_bleeding', 'painful_bowel'],
	gridEpisodeColumns: ['flare', 'missed_work_school'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'entry', label: 'stream_filter.entry' },
		{ key: 'event', label: 'stream_filter.event' },
		{ key: 'diary', label: 'stream_filter.diary' },
	],
	reportPreference: 'both',
	primaryBrowseSurface: 'calendar',
};

// ─── Cancer Treatment ───────────────────────────────────────

export const cancer_treatment: Blueprint = {
	version: 1,
	conditionId: 'cancer_treatment',
	conditionLabel: 'landing.template_cancer_treatment',
	accentColor: DATA_4,
	symptomGroups: [
		{
			id: 'gi', label: 'symptom_group.gi', items: [
				{ id: 'nausea', label: 'symptom.nausea' },
				{ id: 'vomiting', label: 'symptom.vomiting' },
				{ id: 'appetite_loss', label: 'symptom.appetite_loss' },
				{ id: 'taste_changes', label: 'symptom.taste_changes' },
				{ id: 'mouth_sores', label: 'symptom.mouth_sores' },
				{ id: 'diarrhea', label: 'symptom.diarrhea' },
				{ id: 'constipation', label: 'symptom.constipation' },
			]
		},
		{
			id: 'fatigue', label: 'symptom_group.fatigue', items: [
				{ id: 'tired', label: 'symptom.tired' },
				{ id: 'exhausted', label: 'symptom.exhausted' },
				{ id: 'weakness', label: 'symptom.weakness' },
				{ id: 'slept_badly', label: 'symptom.slept_badly' },
			]
		},
		{
			id: 'neuro', label: 'symptom_group.neuro', items: [
				{ id: 'tingling_hands', label: 'symptom.tingling_hands' },
				{ id: 'tingling_feet', label: 'symptom.tingling_feet' },
				{ id: 'numbness', label: 'symptom.numbness' },
				{ id: 'brain_fog', label: 'symptom.brain_fog' },
				{ id: 'dizzy', label: 'symptom.dizzy' },
			]
		},
		{
			id: 'pain', label: 'symptom_group.pain', items: [
				{ id: 'bone_pain', label: 'symptom.bone_pain' },
				{ id: 'muscle_pain', label: 'symptom.muscle_pain' },
				{ id: 'headache', label: 'symptom.headache' },
				{ id: 'mouth_pain', label: 'symptom.mouth_pain' },
			]
		},
		{
			id: 'emotional', label: 'symptom_group.emotional', items: [
				{ id: 'anxious', label: 'symptom.anxious' },
				{ id: 'depressed', label: 'symptom.depressed' },
				{ id: 'overwhelmed', label: 'symptom.overwhelmed' },
				{ id: 'fearful', label: 'symptom.fearful' },
			]
		},
	],
	episodeTypes: [
		{ id: 'febrile_neutropenia', label: 'seizure.febrile_neutropenia', color: DATA_1 },
		{ id: 'er_visit', label: 'seizure.er_visit', color: DATA_3 },
		{ id: 'dose_reduction', label: 'seizure.dose_reduction', color: DATA_4 },
		{ id: 'hospitalization', label: 'seizure.hospitalization', color: DATA_2 },
	],
	triggers: [
		{ id: 'chemo_day', label: 'trigger.chemo_day' },
		{ id: 'missed_meds', label: 'trigger.missed_meds' },
		{ id: 'dehydration', label: 'trigger.dehydration' },
		{ id: 'stress', label: 'trigger.stress' },
		{ id: 'sleep_deprivation', label: 'trigger.sleep_deprivation' },
		{ id: 'infection_exposure', label: 'trigger.infection_exposure' },
	],
	vitals: [
		{ id: 'temp', label: 'vital.temp', unit: '°C', placeholder: '36.5', multiEntry: true },
		{ id: 'weight', label: 'vital.weight', unit: 'kg', placeholder: '70' },
		{ id: 'pain_level', label: 'vital.pain_level', unit: '0-10', placeholder: '3' },
		{ id: 'energy_level', label: 'vital.energy_level', unit: '0-10', placeholder: '5' },
		{ id: 'mood', label: 'vital.mood', unit: '1-10', placeholder: '5' },
	],
	medications: [],
	gridSymptomColumns: ['nausea', 'appetite_loss', 'tired', 'exhausted', 'tingling_hands', 'mouth_sores'],
	gridEpisodeColumns: ['febrile_neutropenia', 'er_visit', 'dose_reduction'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'entry', label: 'stream_filter.entry' },
		{ key: 'event', label: 'stream_filter.event' },
		{ key: 'diary', label: 'stream_filter.diary' },
	],
	reportPreference: 'both',
	primaryBrowseSurface: 'journal',
};

// ─── Dermatology ────────────────────────────────────────────

export const dermatology: Blueprint = {
	version: 1,
	conditionId: 'dermatology',
	conditionLabel: 'landing.template_dermatology',
	accentColor: DATA_6,
	symptomGroups: [
		{
			id: 'skin_symptoms', label: 'symptom_group.skin_symptoms', items: [
				{ id: 'itching', label: 'symptom.itching' },
				{ id: 'burning', label: 'symptom.burning' },
				{ id: 'dry_skin', label: 'symptom.dry_skin' },
				{ id: 'redness', label: 'symptom.redness' },
				{ id: 'scaling', label: 'symptom.scaling' },
				{ id: 'cracking', label: 'symptom.cracking' },
				{ id: 'oozing', label: 'symptom.oozing' },
			]
		},
		{
			id: 'quality_of_life', label: 'symptom_group.quality_of_life', items: [
				{ id: 'sleep_disrupted', label: 'symptom.sleep_disrupted' },
				{ id: 'self_conscious', label: 'symptom.self_conscious' },
				{ id: 'social_avoidance', label: 'symptom.social_avoidance' },
			]
		},
		{
			id: 'general', label: 'symptom_group.general', items: [
				{ id: 'tired', label: 'symptom.tired' },
				{ id: 'joint_pain', label: 'symptom.joint_pain' },
				{ id: 'irritable', label: 'symptom.irritable' },
				{ id: 'anxious', label: 'symptom.anxious' },
			]
		},
	],
	episodeTypes: [
		{ id: 'flare', label: 'seizure.flare', color: DATA_1 },
		{ id: 'skin_infection', label: 'seizure.skin_infection', color: DATA_2 },
		{ id: 'allergic_reaction', label: 'seizure.allergic_reaction', color: DATA_3 },
		{ id: 'joint_flare', label: 'seizure.joint_flare', color: DATA_6 },
	],
	triggers: [
		{ id: 'stress', label: 'trigger.stress' },
		{ id: 'weather', label: 'trigger.weather' },
		{ id: 'sweat', label: 'trigger.sweat' },
		{ id: 'food_reaction', label: 'trigger.food_reaction' },
		{ id: 'skincare_product', label: 'trigger.skincare_product' },
		{ id: 'allergens', label: 'trigger.allergens' },
		{ id: 'hot_shower', label: 'trigger.hot_shower' },
		{ id: 'illness', label: 'trigger.illness' },
		{ id: 'missed_meds', label: 'trigger.missed_meds' },
	],
	vitals: [
		{ id: 'itch_level', label: 'vital.itch_level', unit: '1-10', placeholder: '5' },
		{ id: 'skin_pain', label: 'vital.skin_pain', unit: '1-10', placeholder: '3' },
		{ id: 'sleep_hours', label: 'vital.sleep_hours', unit: 'h', placeholder: '7' },
		{ id: 'affected_area_pct', label: 'vital.affected_area_pct', unit: '%', placeholder: '5' },
		{ id: 'mood', label: 'vital.mood', unit: '1-10', placeholder: '5' },
	],
	medications: [],
	gridSymptomColumns: ['itching', 'redness', 'scaling', 'dry_skin', 'sleep_disrupted', 'joint_pain'],
	gridEpisodeColumns: ['flare', 'skin_infection'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'entry', label: 'stream_filter.entry' },
		{ key: 'event', label: 'stream_filter.event' },
		{ key: 'diary', label: 'stream_filter.diary' },
	],
	reportPreference: 'both',
	primaryBrowseSurface: 'journal',
};

// ─── Autism / Sensory Processing ────────────────────────────

export const autism: Blueprint = {
	version: 1,
	conditionId: 'autism',
	conditionLabel: 'landing.template_autism',
	accentColor: DATA_5,
	symptomGroups: [
		{
			id: 'sensory', label: 'symptom_group.sensory', items: [
				{ id: 'sensory_overload', label: 'symptom.sensory_overload' },
				{ id: 'light_sensitive', label: 'symptom.light_sensitive' },
				{ id: 'sound_sensitive', label: 'symptom.sound_sensitive' },
				{ id: 'texture_aversion', label: 'symptom.texture_aversion' },
				{ id: 'smell_sensitive', label: 'symptom.smell_sensitive' },
			]
		},
		{
			id: 'executive', label: 'symptom_group.executive', items: [
				{ id: 'task_paralysis', label: 'symptom.task_paralysis' },
				{ id: 'difficulty_switching', label: 'symptom.difficulty_switching' },
				{ id: 'decision_fatigue', label: 'symptom.decision_fatigue' },
				{ id: 'forgetful', label: 'symptom.forgetful' },
				{ id: 'time_blindness', label: 'symptom.time_blindness' },
			]
		},
		{
			id: 'masking', label: 'symptom_group.masking', items: [
				{ id: 'masking_heavy', label: 'symptom.masking_heavy' },
				{ id: 'social_exhaustion', label: 'symptom.social_exhaustion' },
				{ id: 'difficulty_communicating', label: 'symptom.difficulty_communicating' },
				{ id: 'isolated', label: 'symptom.isolated' },
			]
		},
		{
			id: 'regulation', label: 'symptom_group.regulation', items: [
				{ id: 'irritable', label: 'symptom.irritable' },
				{ id: 'anxious', label: 'symptom.anxious' },
				{ id: 'overwhelmed', label: 'symptom.overwhelmed' },
				{ id: 'need_to_stim', label: 'symptom.need_to_stim' },
				{ id: 'emotional_flooding', label: 'symptom.emotional_flooding' },
			]
		},
		{
			id: 'energy', label: 'symptom_group.energy', items: [
				{ id: 'tired', label: 'symptom.tired' },
				{ id: 'slept_badly', label: 'symptom.slept_badly' },
				{ id: 'autistic_fatigue', label: 'symptom.autistic_fatigue' },
			]
		},
	],
	episodeTypes: [
		{ id: 'meltdown', label: 'seizure.meltdown', color: DATA_1 },
		{ id: 'shutdown', label: 'seizure.shutdown', color: DATA_5 },
		{ id: 'sensory_crisis', label: 'seizure.sensory_crisis', color: DATA_3 },
		{ id: 'burnout_episode', label: 'seizure.burnout_episode', color: DATA_4 },
	],
	triggers: [
		{ id: 'sensory_environment', label: 'trigger.sensory_environment' },
		{ id: 'unexpected_change', label: 'trigger.unexpected_change' },
		{ id: 'social_demands', label: 'trigger.social_demands' },
		{ id: 'masking_exhaustion', label: 'trigger.masking_exhaustion' },
		{ id: 'sleep_deprivation', label: 'trigger.sleep_deprivation' },
		{ id: 'time_pressure', label: 'trigger.time_pressure' },
		{ id: 'hunger', label: 'trigger.hunger' },
		{ id: 'overstimulation', label: 'trigger.overstimulation' },
		{ id: 'demand_overload', label: 'trigger.demand_overload' },
	],
	vitals: [
		{ id: 'energy_level', label: 'vital.energy_level', unit: '1-10', placeholder: '5' },
		{ id: 'sensory_load', label: 'vital.sensory_load', unit: '1-10', placeholder: '3' },
		{ id: 'social_battery', label: 'vital.social_battery', unit: '1-10', placeholder: '5' },
		{ id: 'sleep_hours', label: 'vital.sleep_hours', unit: 'h', placeholder: '7' },
		{ id: 'mood', label: 'vital.mood', unit: '1-10', placeholder: '5' },
	],
	medications: [],
	gridSymptomColumns: ['sensory_overload', 'task_paralysis', 'masking_heavy', 'social_exhaustion', 'overwhelmed', 'autistic_fatigue'],
	gridEpisodeColumns: ['meltdown', 'shutdown', 'sensory_crisis'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'entry', label: 'stream_filter.entry' },
		{ key: 'event', label: 'stream_filter.event' },
		{ key: 'diary', label: 'stream_filter.diary' },
	],
	reportPreference: 'both',
	primaryBrowseSurface: 'journal',
};

// ─── Heart & Cardiovascular ─────────────────────────────────

export const cardiovascular: Blueprint = {
	version: 1,
	conditionId: 'cardiovascular',
	conditionLabel: 'landing.template_cardiovascular',
	accentColor: DATA_1,
	symptomGroups: [
		{
			id: 'respiratory', label: 'symptom_group.respiratory', items: [
				{ id: 'dyspnea', label: 'symptom.dyspnea' },
				{ id: 'orthopnea', label: 'symptom.orthopnea' },
				{ id: 'wheezing', label: 'symptom.wheezing' },
				{ id: 'persistent_cough', label: 'symptom.persistent_cough' },
			]
		},
		{
			id: 'cardiac', label: 'symptom_group.cardiac', items: [
				{ id: 'palpitations', label: 'symptom.palpitations' },
				{ id: 'chest_pain', label: 'symptom.chest_pain' },
				{ id: 'chest_tightness', label: 'symptom.chest_tightness' },
				{ id: 'irregular_heartbeat', label: 'symptom.irregular_heartbeat' },
			]
		},
		{
			id: 'circulation', label: 'symptom_group.circulation', items: [
				{ id: 'leg_swelling', label: 'symptom.leg_swelling' },
				{ id: 'ankle_edema', label: 'symptom.ankle_edema' },
				{ id: 'dizzy', label: 'symptom.dizzy' },
				{ id: 'cold_extremities', label: 'symptom.cold_extremities' },
			]
		},
		{
			id: 'general', label: 'symptom_group.general', items: [
				{ id: 'tired', label: 'symptom.tired' },
				{ id: 'exercise_intolerance', label: 'symptom.exercise_intolerance' },
				{ id: 'slept_badly', label: 'symptom.slept_badly' },
				{ id: 'nocturia', label: 'symptom.nocturia' },
			]
		},
	],
	episodeTypes: [
		{ id: 'afib_episode', label: 'seizure.afib_episode', color: DATA_1, trackDuration: true, trackTimeOfDay: true },
		{ id: 'angina', label: 'seizure.angina', color: DATA_3, trackDuration: true, trackTimeOfDay: true },
		{ id: 'syncope', label: 'seizure.syncope', color: DATA_5, trackTimeOfDay: true },
		{ id: 'hf_decompensation', label: 'seizure.hf_decompensation', color: DATA_2 },
	],
	triggers: [
		{ id: 'exertion', label: 'trigger.exertion' },
		{ id: 'stress', label: 'trigger.stress' },
		{ id: 'alcohol', label: 'trigger.alcohol' },
		{ id: 'caffeine', label: 'trigger.caffeine' },
		{ id: 'high_salt_meal', label: 'trigger.high_salt_meal' },
		{ id: 'dehydration', label: 'trigger.dehydration' },
		{ id: 'missed_meds', label: 'trigger.missed_meds' },
		{ id: 'sleep_deprivation', label: 'trigger.sleep_deprivation' },
		{ id: 'cold_weather', label: 'trigger.cold_weather' },
	],
	vitals: [
		{ id: 'bp_systolic', label: 'vital.bp_systolic', unit: 'mmHg', placeholder: '120', multiEntry: true, pairLabel: 'bp', referenceLine: { value: 140, labelKey: 'vital.target_bp_systolic' }, splitByTimeOfDay: true },
		{ id: 'bp_diastolic', label: 'vital.bp_diastolic', unit: 'mmHg', placeholder: '80', multiEntry: true, pairLabel: 'bp', referenceLine: { value: 90, labelKey: 'vital.target_bp_diastolic' }, splitByTimeOfDay: true },
		{ id: 'pulse', label: 'vital.pulse', unit: 'bpm', placeholder: '72' },
		{ id: 'weight', label: 'vital.weight', unit: 'kg', placeholder: '70' },
		{ id: 'spo2', label: 'vital.spo2', unit: '%', placeholder: '97' },
		{ id: 'sleep_hours', label: 'vital.sleep_hours', unit: 'h', placeholder: '7' },
	],
	medications: [],
	gridSymptomColumns: ['dyspnea', 'palpitations', 'chest_pain', 'leg_swelling', 'tired', 'dizzy'],
	gridEpisodeColumns: ['afib_episode', 'angina', 'hf_decompensation'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'entry', label: 'stream_filter.entry' },
		{ key: 'event', label: 'stream_filter.event' },
		{ key: 'diary', label: 'stream_filter.diary' },
	],
	reportPreference: 'both',
	primaryBrowseSurface: 'trend',
};

// ─── Hypertension ────────────────────────────────────────────

export const hypertension: Blueprint = {
	version: 1,
	conditionId: 'hypertension',
	conditionLabel: 'landing.template_hypertension',
	accentColor: DATA_1,
	symptomGroups: [
		{
			id: 'headache_signs', label: 'symptom_group.headache_signs', items: [
				{ id: 'headache', label: 'symptom.headache' },
				{ id: 'dizzy', label: 'symptom.dizzy' },
				{ id: 'blurred_vision', label: 'symptom.blurred_vision' },
				{ id: 'nosebleed', label: 'symptom.nosebleed' },
			]
		},
		{
			id: 'general', label: 'symptom_group.general', items: [
				{ id: 'tired', label: 'symptom.tired' },
				{ id: 'shortness_of_breath', label: 'symptom.shortness_of_breath' },
				{ id: 'chest_tightness', label: 'symptom.chest_tightness' },
			]
		},
		{
			id: 'sleep', label: 'symptom_group.sleep', items: [
				{ id: 'slept_badly', label: 'symptom.slept_badly' },
			]
		},
	],
	episodeTypes: [
		{ id: 'hypertensive_crisis', label: 'seizure.hypertensive_crisis', color: DATA_1, trackTimeOfDay: true },
		{ id: 'orthostatic_drop', label: 'seizure.orthostatic_drop', color: DATA_3, trackTimeOfDay: true },
	],
	triggers: [
		{ id: 'high_salt_meal', label: 'trigger.high_salt_meal' },
		{ id: 'stress', label: 'trigger.stress' },
		{ id: 'alcohol', label: 'trigger.alcohol' },
		{ id: 'missed_meds', label: 'trigger.missed_meds' },
		{ id: 'caffeine', label: 'trigger.caffeine' },
		{ id: 'cold_weather', label: 'trigger.cold_weather' },
		{ id: 'dehydration', label: 'trigger.dehydration' },
		{ id: 'poor_sleep', label: 'trigger.poor_sleep' },
	],
	vitals: [
		{ id: 'bp_systolic', label: 'vital.bp_systolic', unit: 'mmHg', placeholder: '120', multiEntry: true, pairLabel: 'bp', referenceLine: { value: 140, labelKey: 'vital.target_bp_systolic' }, splitByTimeOfDay: true },
		{ id: 'bp_diastolic', label: 'vital.bp_diastolic', unit: 'mmHg', placeholder: '80', multiEntry: true, pairLabel: 'bp', referenceLine: { value: 90, labelKey: 'vital.target_bp_diastolic' }, splitByTimeOfDay: true },
		{ id: 'pulse', label: 'vital.pulse', unit: 'bpm', placeholder: '72' },
		{ id: 'weight', label: 'vital.weight', unit: 'kg', placeholder: '70' },
		{ id: 'sleep_hours', label: 'vital.sleep_hours', unit: 'h', placeholder: '7' },
	],
	medications: [],
	gridSymptomColumns: ['headache', 'dizzy', 'chest_tightness', 'shortness_of_breath', 'tired'],
	gridEpisodeColumns: ['hypertensive_crisis', 'orthostatic_drop'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'entry', label: 'stream_filter.entry' },
		{ key: 'event', label: 'stream_filter.event' },
		{ key: 'diary', label: 'stream_filter.diary' },
	],
	reportPreference: 'both',
	primaryBrowseSurface: 'trend',
};

// ─── Long COVID / ME-CFS ─────────────────────────────────────

export const long_covid: Blueprint = {
	version: 1,
	conditionId: 'long_covid',
	conditionLabel: 'landing.template_long_covid',
	accentColor: DATA_4,
	symptomGroups: [
		{
			id: 'fatigue', label: 'symptom_group.fatigue', items: [
				{ id: 'pem', label: 'symptom.pem' },
				// PEM with delayed onset is the diagnostic hallmark — separate
				// from same-day exhaustion. Sofia (10-persona QA) called this
				// out as missing. Boom-bust = the user sees the cycle.
				{ id: 'pem_delayed', label: 'symptom.pem_delayed' },
				{ id: 'boom_bust_cycle', label: 'symptom.boom_bust_cycle' },
				{ id: 'tired', label: 'symptom.tired' },
				{ id: 'post_exertional_crash', label: 'symptom.post_exertional_crash' },
				{ id: 'lie_flat_recovery', label: 'symptom.lie_flat_recovery' },
				{ id: 'brain_fog', label: 'symptom.brain_fog' },
			]
		},
		{
			id: 'cognitive', label: 'symptom_group.cognitive', items: [
				{ id: 'concentration_loss', label: 'symptom.concentration_loss' },
				{ id: 'forgetful', label: 'symptom.forgetful' },
				{ id: 'word_finding_issues', label: 'symptom.word_finding_issues' },
			]
		},
		{
			id: 'autonomic', label: 'symptom_group.autonomic', items: [
				{ id: 'pots_symptoms', label: 'symptom.pots_symptoms' },
				{ id: 'palpitations', label: 'symptom.palpitations' },
				{ id: 'dizzy', label: 'symptom.dizzy' },
				{ id: 'temperature_dysregulation', label: 'symptom.temperature_dysregulation' },
			]
		},
		{
			id: 'pain', label: 'symptom_group.pain', items: [
				{ id: 'muscle_pain', label: 'symptom.muscle_pain' },
				{ id: 'joint_pain', label: 'symptom.joint_pain' },
				{ id: 'headache', label: 'symptom.headache' },
				{ id: 'sore_throat', label: 'symptom.sore_throat' },
			]
		},
	],
	episodeTypes: [
		{ id: 'crash', label: 'seizure.crash', color: DATA_2, multiDay: true },
		{ id: 'flare', label: 'seizure.flare', color: DATA_3, multiDay: true },
	],
	triggers: [
		{ id: 'overexertion', label: 'trigger.overexertion' },
		{ id: 'stress', label: 'trigger.stress' },
		{ id: 'heat', label: 'trigger.heat' },
		{ id: 'poor_sleep', label: 'trigger.poor_sleep' },
		{ id: 'social_overload', label: 'trigger.social_overload' },
		{ id: 'cognitive_load', label: 'trigger.cognitive_load' },
		{ id: 'infection', label: 'trigger.infection' },
	],
	vitals: [
		{ id: 'heart_rate_resting', label: 'vital.heart_rate_resting', unit: 'bpm', placeholder: '70', pairLabel: 'hr' },
		{ id: 'heart_rate_standing', label: 'vital.heart_rate_standing', unit: 'bpm', placeholder: '95', pairLabel: 'hr' },
		{ id: 'energy_envelope', label: 'vital.energy_envelope', unit: '1-10', placeholder: '5' },
		{ id: 'sleep_hours', label: 'vital.sleep_hours', unit: 'h', placeholder: '8' },
		{ id: 'pacing_score', label: 'vital.pacing_score', unit: '1-10', placeholder: '5' },
	],
	medications: [],
	gridSymptomColumns: ['pem', 'brain_fog', 'muscle_pain', 'palpitations', 'tired'],
	gridEpisodeColumns: ['crash', 'flare'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'entry', label: 'stream_filter.entry' },
		{ key: 'event', label: 'stream_filter.event' },
		{ key: 'diary', label: 'stream_filter.diary' },
	],
	reportPreference: 'both',
	primaryBrowseSurface: 'calendar',
};

// ─── Menopause / Perimenopause ───────────────────────────────

export const menopause: Blueprint = {
	version: 1,
	conditionId: 'menopause',
	conditionLabel: 'landing.template_menopause',
	accentColor: DATA_6,
	symptomGroups: [
		{
			id: 'vasomotor', label: 'symptom_group.vasomotor', items: [
				{ id: 'hot_flashes', label: 'symptom.hot_flashes' },
				{ id: 'night_sweats', label: 'symptom.night_sweats' },
				{ id: 'chills', label: 'symptom.chills' },
			]
		},
		{
			id: 'mood', label: 'symptom_group.mood', items: [
				{ id: 'irritable', label: 'symptom.irritable' },
				{ id: 'anxious', label: 'symptom.anxious' },
				{ id: 'mood_swings', label: 'symptom.mood_swings' },
				{ id: 'low_mood', label: 'symptom.low_mood' },
				{ id: 'tearful', label: 'symptom.tearful' },
			]
		},
		{
			id: 'cognitive', label: 'symptom_group.cognitive', items: [
				{ id: 'brain_fog', label: 'symptom.brain_fog' },
				{ id: 'forgetful', label: 'symptom.forgetful' },
				{ id: 'concentration_loss', label: 'symptom.concentration_loss' },
			]
		},
		{
			id: 'sleep', label: 'symptom_group.sleep', items: [
				{ id: 'slept_badly', label: 'symptom.slept_badly' },
				{ id: 'wake_frequent', label: 'symptom.wake_frequent' },
				{ id: 'insomnia', label: 'symptom.insomnia' },
			]
		},
		{
			id: 'physical', label: 'symptom_group.physical', items: [
				{ id: 'joint_pain', label: 'symptom.joint_pain' },
				{ id: 'headache', label: 'symptom.headache' },
				{ id: 'libido_change', label: 'symptom.libido_change' },
				{ id: 'vaginal_dryness', label: 'symptom.vaginal_dryness' },
				{ id: 'bloating', label: 'symptom.bloating' },
			]
		},
	],
	episodeTypes: [
		{ id: 'hot_flash_severe', label: 'seizure.hot_flash_severe', color: DATA_3, trackTimeOfDay: true },
		{ id: 'panic_episode', label: 'seizure.panic_episode', color: DATA_1 },
	],
	triggers: [
		{ id: 'stress', label: 'trigger.stress' },
		{ id: 'alcohol', label: 'trigger.alcohol' },
		{ id: 'caffeine', label: 'trigger.caffeine' },
		{ id: 'spicy_food', label: 'trigger.spicy_food' },
		{ id: 'hot_weather', label: 'trigger.hot_weather' },
		{ id: 'missed_hrt', label: 'trigger.missed_hrt' },
	],
	vitals: [
		{ id: 'flash_count', label: 'vital.flash_count', unit: '/day', placeholder: '4' },
		{ id: 'bleeding_intensity', label: 'vital.bleeding_intensity', unit: '0-5', placeholder: '0', min: 0, max: 5 },
		{ id: 'temperature', label: 'vital.temperature', unit: '°C', placeholder: '36.8' },
		{ id: 'sleep_hours', label: 'vital.sleep_hours', unit: 'h', placeholder: '7' },
		{ id: 'mood', label: 'vital.mood', unit: '1-10', placeholder: '5' },
		{ id: 'cycle_day', label: 'vital.cycle_day', unit: '', placeholder: '—', excludeFromTrends: true },
	],
	medications: [],
	gridSymptomColumns: ['hot_flashes', 'night_sweats', 'brain_fog', 'slept_badly', 'irritable'],
	gridEpisodeColumns: ['hot_flash_severe'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'entry', label: 'stream_filter.entry' },
		{ key: 'event', label: 'stream_filter.event' },
		{ key: 'diary', label: 'stream_filter.diary' },
	],
	reportPreference: 'both',
	primaryBrowseSurface: 'calendar',
};

// ─── Bipolar Disorder ───────────────────────────────────────

export const bipolar: Blueprint = {
	version: 1,
	conditionId: 'bipolar',
	conditionLabel: 'landing.template_bipolar',
	accentColor: DATA_5,
	symptomGroups: [
		{
			id: 'mania', label: 'symptom_group.mania', items: [
				{ id: 'elevated_mood', label: 'symptom.elevated_mood' },
				{ id: 'grandiosity', label: 'symptom.grandiosity' },
				{ id: 'pressured_speech', label: 'symptom.pressured_speech' },
				{ id: 'racing_thoughts', label: 'symptom.racing_thoughts' },
				{ id: 'reduced_sleep_need', label: 'symptom.reduced_sleep_need' },
				{ id: 'risk_taking', label: 'symptom.risk_taking' },
			]
		},
		{
			id: 'depression', label: 'symptom_group.depression', items: [
				{ id: 'depressed_mood', label: 'symptom.depressed_mood' },
				{ id: 'anhedonia', label: 'symptom.anhedonia' },
				{ id: 'hopelessness', label: 'symptom.hopelessness' },
				{ id: 'tired', label: 'symptom.tired' },
				{ id: 'guilt', label: 'symptom.guilt' },
				{ id: 'psychomotor_slowing', label: 'symptom.psychomotor_slowing' },
			]
		},
		{
			id: 'mixed', label: 'symptom_group.mixed_state', items: [
				{ id: 'irritable', label: 'symptom.irritable' },
				{ id: 'anxious', label: 'symptom.anxious' },
				{ id: 'agitated', label: 'symptom.agitated' },
				{ id: 'restless', label: 'symptom.restless' },
			]
		},
		{
			id: 'sleep', label: 'symptom_group.sleep', items: [
				{ id: 'slept_badly', label: 'symptom.slept_badly' },
				{ id: 'insomnia', label: 'symptom.insomnia' },
				{ id: 'hypersomnia', label: 'symptom.hypersomnia' },
			]
		},
	],
	episodeTypes: [
		{ id: 'hypomanic', label: 'seizure.hypomanic', color: DATA_3, multiDay: true },
		{ id: 'manic', label: 'seizure.manic', color: DATA_1, multiDay: true },
		{ id: 'depressive', label: 'seizure.depressive', color: DATA_5, multiDay: true },
		{ id: 'mixed', label: 'seizure.mixed_ep', color: DATA_6, multiDay: true },
	],
	triggers: [
		{ id: 'sleep_deprivation', label: 'trigger.sleep_deprivation' },
		{ id: 'stress', label: 'trigger.stress' },
		{ id: 'seasonal_change', label: 'trigger.seasonal_change' },
		{ id: 'missed_meds', label: 'trigger.missed_meds' },
		{ id: 'substance_use', label: 'trigger.substance_use' },
		{ id: 'travel', label: 'trigger.travel' },
		{ id: 'circadian_disruption', label: 'trigger.circadian_disruption' },
	],
	vitals: [
		{ id: 'mood', label: 'vital.mood', unit: '1-10', placeholder: '5' },
		{ id: 'mood_polarity', label: 'vital.mood_polarity', unit: '-5..+5', placeholder: '0', min: -5, max: 5 },
		{ id: 'sleep_hours', label: 'vital.sleep_hours', unit: 'h', placeholder: '7' },
		{ id: 'weight', label: 'vital.weight', unit: 'kg', placeholder: '70' },
	],
	medications: [],
	gridSymptomColumns: ['elevated_mood', 'depressed_mood', 'anhedonia', 'insomnia', 'racing_thoughts', 'irritable'],
	gridEpisodeColumns: ['manic', 'depressive'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'entry', label: 'stream_filter.entry' },
		{ key: 'event', label: 'stream_filter.event' },
		{ key: 'diary', label: 'stream_filter.diary' },
	],
	reportPreference: 'both',
	primaryBrowseSurface: 'calendar',
	rescueMedications: [
		{ id: 'lorazepam', label: 'rescue_med.lorazepam', unit: 'mg', defaultDose: '1' },
		{ id: 'quetiapine_prn', label: 'rescue_med.quetiapine', unit: 'mg', defaultDose: '25' },
	],
};

// ─── Glaucoma ───────────────────────────────────────────────

export const glaucoma: Blueprint = {
	version: 1,
	conditionId: 'glaucoma',
	conditionLabel: 'landing.template_glaucoma',
	accentColor: DATA_3,
	episodeNoun: 'episode_noun.iop_spike',
	symptomGroups: [
		{
			id: 'vision', label: 'symptom_group.vision', items: [
				{ id: 'blurred_vision', label: 'symptom.blurred_vision' },
				{ id: 'halos_around_lights', label: 'symptom.halos_around_lights' },
				{ id: 'tunnel_vision', label: 'symptom.tunnel_vision' },
				{ id: 'reduced_contrast', label: 'symptom.reduced_contrast' },
			]
		},
		{
			id: 'pressure_pain', label: 'symptom_group.pressure_pain', items: [
				{ id: 'eye_pain', label: 'symptom.eye_pain' },
				{ id: 'brow_ache', label: 'symptom.brow_ache' },
				{ id: 'headache', label: 'symptom.headache' },
				{ id: 'eye_redness', label: 'symptom.eye_redness' },
			]
		},
		{
			id: 'systemic', label: 'symptom_group.systemic', items: [
				{ id: 'nausea', label: 'symptom.nausea' },
				{ id: 'dizzy', label: 'symptom.dizzy' },
			]
		},
	],
	episodeTypes: [
		{ id: 'iop_spike', label: 'seizure.iop_spike', color: DATA_1, trackDuration: true, trackTimeOfDay: true },
		{ id: 'angle_closure', label: 'seizure.angle_closure', color: DATA_3, trackDuration: true, trackTimeOfDay: true },
	],
	triggers: [
		{ id: 'missed_drops', label: 'trigger.missed_drops' },
		{ id: 'head_down_posture', label: 'trigger.head_down_posture' },
		{ id: 'valsalva', label: 'trigger.valsalva' },
		{ id: 'caffeine', label: 'trigger.caffeine' },
		{ id: 'dehydration', label: 'trigger.dehydration' },
		{ id: 'stress', label: 'trigger.stress' },
	],
	vitals: [
		{ id: 'iop_left', label: 'vital.iop_left', unit: 'mmHg', placeholder: '16', multiEntry: true, pairLabel: 'iop', referenceLine: { value: 21, labelKey: 'vital.target_iop' } },
		{ id: 'iop_right', label: 'vital.iop_right', unit: 'mmHg', placeholder: '16', multiEntry: true, pairLabel: 'iop', referenceLine: { value: 21, labelKey: 'vital.target_iop' } },
		{ id: 'sleep_hours', label: 'vital.sleep_hours', unit: 'h', placeholder: '7' },
	],
	medications: [],
	gridSymptomColumns: ['blurred_vision', 'halos_around_lights', 'eye_pain', 'headache'],
	gridEpisodeColumns: ['iop_spike'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'entry', label: 'stream_filter.entry' },
		{ key: 'event', label: 'stream_filter.event' },
		{ key: 'diary', label: 'stream_filter.diary' },
	],
	reportPreference: 'both',
	primaryBrowseSurface: 'trend',
};

// ─── Parkinson's ────────────────────────────────────────────

export const parkinson: Blueprint = {
	version: 1,
	conditionId: 'parkinson',
	conditionLabel: 'landing.template_parkinson',
	accentColor: DATA_3,
	episodeNoun: 'episode_noun.tremor',
	symptomGroups: [
		{
			id: 'motor', label: 'symptom_group.motor', items: [
				{ id: 'resting_tremor', label: 'symptom.resting_tremor' },
				{ id: 'rigidity', label: 'symptom.rigidity' },
				{ id: 'bradykinesia', label: 'symptom.bradykinesia' },
				{ id: 'postural_instability', label: 'symptom.postural_instability' },
				{ id: 'shuffling_gait', label: 'symptom.shuffling_gait' },
			]
		},
		{
			id: 'movement_complications', label: 'symptom_group.movement_complications', items: [
				{ id: 'dyskinesia', label: 'symptom.dyskinesia' },
				{ id: 'dystonia', label: 'symptom.dystonia' },
				{ id: 'freezing_of_gait', label: 'symptom.freezing_of_gait' },
			]
		},
		{
			id: 'non_motor', label: 'symptom_group.non_motor', items: [
				{ id: 'depressed_mood', label: 'symptom.depressed_mood' },
				{ id: 'anxious', label: 'symptom.anxious' },
				{ id: 'tired', label: 'symptom.tired' },
				{ id: 'rem_sleep_behavior', label: 'symptom.rem_sleep_behavior' },
				{ id: 'constipation', label: 'symptom.constipation' },
				{ id: 'drooling', label: 'symptom.drooling' },
				{ id: 'hypomimia', label: 'symptom.hypomimia' },
				{ id: 'dysphagia', label: 'symptom.dysphagia' },
			]
		},
		{
			id: 'cognitive', label: 'symptom_group.cognitive', items: [
				{ id: 'brain_fog', label: 'symptom.brain_fog' },
				{ id: 'forgetful', label: 'symptom.forgetful' },
				{ id: 'slow_processing', label: 'symptom.slow_processing' },
			]
		},
	],
	episodeTypes: [
		{ id: 'off_period', label: 'seizure.off_period', color: DATA_2, trackDuration: true, trackTimeOfDay: true },
		{ id: 'freezing', label: 'seizure.freezing', color: DATA_1, trackDuration: true, trackTimeOfDay: true },
		{ id: 'dyskinesia_flare', label: 'seizure.dyskinesia_flare', color: DATA_3, trackDuration: true, trackTimeOfDay: true },
	],
	triggers: [
		{ id: 'missed_meds', label: 'trigger.missed_meds' },
		{ id: 'stress', label: 'trigger.stress' },
		{ id: 'protein_meal', label: 'trigger.protein_meal' },
		{ id: 'infection', label: 'trigger.infection' },
		{ id: 'sleep_deprivation', label: 'trigger.sleep_deprivation' },
	],
	vitals: [
		{ id: 'off_time_hours', label: 'vital.off_time_hours', unit: 'h', placeholder: '2' },
		{ id: 'tremor_intensity', label: 'vital.tremor_intensity', unit: '1-10', placeholder: '3' },
		{ id: 'sleep_hours', label: 'vital.sleep_hours', unit: 'h', placeholder: '7' },
		{ id: 'weight', label: 'vital.weight', unit: 'kg', placeholder: '70' },
	],
	medications: [],
	gridSymptomColumns: ['resting_tremor', 'bradykinesia', 'dyskinesia', 'freezing_of_gait', 'constipation'],
	gridEpisodeColumns: ['off_period', 'freezing'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'entry', label: 'stream_filter.entry' },
		{ key: 'event', label: 'stream_filter.event' },
		{ key: 'diary', label: 'stream_filter.diary' },
	],
	reportPreference: 'both',
	primaryBrowseSurface: 'trend',
};

// ─── IBD (Crohn's / UC) ─────────────────────────────────────

export const ibd: Blueprint = {
	version: 1,
	conditionId: 'ibd',
	conditionLabel: 'landing.template_ibd',
	accentColor: DATA_6,
	symptomGroups: [
		{
			id: 'bowel', label: 'symptom_group.bowel', items: [
				{ id: 'diarrhea', label: 'symptom.diarrhea' },
				{ id: 'bloody_stool', label: 'symptom.bloody_stool' },
				{ id: 'mucus_stool', label: 'symptom.mucus_stool' },
				{ id: 'urgency', label: 'symptom.urgency' },
				{ id: 'incomplete_evacuation', label: 'symptom.incomplete_evacuation' },
				{ id: 'abdominal_pain', label: 'symptom.abdominal_pain' },
				{ id: 'cramping', label: 'symptom.cramping' },
			]
		},
		{
			id: 'systemic', label: 'symptom_group.systemic', items: [
				{ id: 'fever', label: 'symptom.fever' },
				{ id: 'tired', label: 'symptom.tired' },
				{ id: 'weight_loss', label: 'symptom.weight_loss' },
			]
		},
		{
			id: 'extraintestinal', label: 'symptom_group.extraintestinal', items: [
				{ id: 'joint_pain', label: 'symptom.joint_pain' },
				{ id: 'mouth_ulcers', label: 'symptom.mouth_ulcers' },
				{ id: 'skin_lesions', label: 'symptom.skin_lesions' },
				{ id: 'eye_inflammation', label: 'symptom.eye_inflammation' },
			]
		},
	],
	episodeTypes: [
		{ id: 'flare', label: 'seizure.flare', color: DATA_1, multiDay: true },
		{ id: 'infusion_day', label: 'seizure.infusion_day', color: DATA_4, trackTimeOfDay: true },
		{ id: 'tapering', label: 'seizure.tapering', color: DATA_3, multiDay: true },
	],
	triggers: [
		{ id: 'stress', label: 'trigger.stress' },
		{ id: 'nsaid', label: 'trigger.nsaid' },
		{ id: 'antibiotic', label: 'trigger.antibiotic' },
		{ id: 'missed_meds', label: 'trigger.missed_meds' },
		{ id: 'dietary_trigger', label: 'trigger.dietary_trigger' },
		{ id: 'infection', label: 'trigger.infection' },
	],
	vitals: [
		{ id: 'stool_count', label: 'vital.stool_count', unit: '/day', placeholder: '3' },
		{ id: 'weight', label: 'vital.weight', unit: 'kg', placeholder: '70' },
		{ id: 'crp', label: 'vital.crp', unit: 'mg/L', placeholder: '5' },
		{ id: 'calprotectin', label: 'vital.calprotectin', unit: 'µg/g', placeholder: '50' },
	],
	medications: [],
	gridSymptomColumns: ['diarrhea', 'bloody_stool', 'abdominal_pain', 'fever', 'tired'],
	gridEpisodeColumns: ['flare'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'entry', label: 'stream_filter.entry' },
		{ key: 'event', label: 'stream_filter.event' },
		{ key: 'diary', label: 'stream_filter.diary' },
	],
	reportPreference: 'both',
	primaryBrowseSurface: 'calendar',
	rescueMedications: [
		{ id: 'prednisone_burst', label: 'rescue_med.prednisone', unit: 'mg', defaultDose: '40' },
		{ id: 'loperamide', label: 'rescue_med.loperamide', unit: 'mg', defaultDose: '4' },
	],
};

// ─── PCOS (Polycystic Ovary Syndrome) ───────────────────────

export const pcos: Blueprint = {
	version: 1,
	conditionId: 'pcos',
	conditionLabel: 'landing.template_pcos',
	accentColor: DATA_6,
	symptomGroups: [
		{
			id: 'menstrual', label: 'symptom_group.menstrual', items: [
				{ id: 'irregular_periods', label: 'symptom.irregular_periods' },
				{ id: 'heavy_bleeding', label: 'symptom.heavy_bleeding' },
				{ id: 'absent_periods', label: 'symptom.absent_periods' },
				{ id: 'spotting', label: 'symptom.spotting' },
				{ id: 'painful_periods', label: 'symptom.painful_periods' },
			]
		},
		{
			id: 'androgen', label: 'symptom_group.androgen', items: [
				{ id: 'hirsutism', label: 'symptom.hirsutism' },
				{ id: 'acne', label: 'symptom.acne' },
				{ id: 'hair_loss', label: 'symptom.hair_loss' },
				{ id: 'oily_skin', label: 'symptom.oily_skin' },
			]
		},
		{
			id: 'metabolic', label: 'symptom_group.metabolic', items: [
				{ id: 'weight_gain', label: 'symptom.weight_gain' },
				{ id: 'hungry', label: 'symptom.hungry' },
				{ id: 'sugar_cravings', label: 'symptom.sugar_cravings' },
				{ id: 'tired', label: 'symptom.tired' },
				{ id: 'brain_fog', label: 'symptom.brain_fog' },
			]
		},
		{
			id: 'mood', label: 'symptom_group.mood', items: [
				{ id: 'mood_swings', label: 'symptom.mood_swings' },
				{ id: 'anxious', label: 'symptom.anxious' },
				{ id: 'low_mood', label: 'symptom.low_mood' },
				{ id: 'irritable', label: 'symptom.irritable' },
			]
		},
	],
	episodeTypes: [
		{ id: 'fertility_concern', label: 'seizure.fertility_concern', color: DATA_6, trackTimeOfDay: false, trackDuration: false },
		{ id: 'skin_flare', label: 'seizure.skin_flare', color: DATA_3 },
	],
	triggers: [
		{ id: 'high_carb_meal', label: 'trigger.high_carb_meal' },
		{ id: 'stress', label: 'trigger.stress' },
		{ id: 'sleep_deprivation', label: 'trigger.sleep_deprivation' },
		{ id: 'missed_meds', label: 'trigger.missed_meds' },
		{ id: 'alcohol', label: 'trigger.alcohol' },
		{ id: 'high_glycemic_snack', label: 'trigger.high_glycemic_snack' },
		{ id: 'skipped_meal', label: 'trigger.skipped_meal' },
	],
	vitals: [
		{ id: 'cycle_day', label: 'vital.cycle_day', unit: 'day', placeholder: '14', excludeFromTrends: true },
		{ id: 'cycle_length', label: 'vital.cycle_length', unit: 'days', placeholder: '35', excludeFromTrends: true },
		{ id: 'bleeding_intensity', label: 'vital.bleeding_intensity', unit: '0-5', placeholder: '0', min: 0, max: 5 },
		{ id: 'weight', label: 'vital.weight', unit: 'kg', placeholder: '70' },
		{ id: 'waist_circumference', label: 'vital.waist_circumference', unit: 'cm', placeholder: '85' },
		{ id: 'hba1c', label: 'vital.hba1c', unit: '%', placeholder: '5.7', referenceLine: { value: 7.0, labelKey: 'vital.target_hba1c' } },
		{ id: 'mood', label: 'vital.mood', unit: '1-10', placeholder: '5' },
	],
	medications: [],
	gridSymptomColumns: ['irregular_periods', 'hirsutism', 'acne', 'weight_gain', 'tired', 'mood_swings'],
	gridEpisodeColumns: ['fertility_concern', 'skin_flare'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'entry', label: 'stream_filter.entry' },
		{ key: 'event', label: 'stream_filter.event' },
		{ key: 'diary', label: 'stream_filter.diary' },
	],
	reportPreference: 'both',
	primaryBrowseSurface: 'calendar',
};

// ─── Registry ────────────────────────────────────────────────

export interface PresetInfo {
	id: string;
	labelKey: string;
	descriptionKey: string;
	icon: string;
	color: string;
	blueprint: Blueprint;
}

export const presets: PresetInfo[] = [
	// Neurology
	{ id: 'epilepsy', labelKey: 'landing.template_epilepsy', descriptionKey: 'landing.template_epilepsy_desc', icon: 'zap', color: DATA_1, blueprint: epilepsy },
	{ id: 'migraine', labelKey: 'landing.template_migraine', descriptionKey: 'landing.template_migraine_desc', icon: 'cloud-lightning', color: DATA_2, blueprint: migraine },
	{ id: 'ms', labelKey: 'landing.template_ms', descriptionKey: 'landing.template_ms_desc', icon: 'brain', color: DATA_6, blueprint: ms },
	// Neurodivergence
	{ id: 'adhd', labelKey: 'landing.template_adhd', descriptionKey: 'landing.template_adhd_desc', icon: 'focus', color: DATA_3, blueprint: adhd },
	// Removed per product review — kept blueprint def above for potential future re-enable
	// { id: 'autism', labelKey: 'landing.template_autism', descriptionKey: 'landing.template_autism_desc', icon: 'ear', color: DATA_5, blueprint: autism },
	// Mental health
	{ id: 'burnout', labelKey: 'landing.template_burnout', descriptionKey: 'landing.template_burnout_desc', icon: 'battery-low', color: DATA_5, blueprint: burnout },
	{ id: 'anxiety_depression', labelKey: 'landing.template_anxiety_depression', descriptionKey: 'landing.template_anxiety_depression_desc', icon: 'heart', color: DATA_5, blueprint: anxiety_depression },
	// Metabolic & Pain
	{ id: 'diabetes', labelKey: 'landing.template_diabetes', descriptionKey: 'landing.template_diabetes_desc', icon: 'droplet', color: DATA_4, blueprint: diabetes },
	{ id: 'chronic_pain', labelKey: 'landing.template_chronic_pain', descriptionKey: 'landing.template_chronic_pain_desc', icon: 'flame', color: DATA_1, blueprint: chronic_pain },
	{ id: 'long_covid', labelKey: 'landing.template_long_covid', descriptionKey: 'landing.template_long_covid_desc', icon: 'shield-plus', color: DATA_4, blueprint: long_covid },
	// Respiratory & Cardio
	{ id: 'asthma', labelKey: 'landing.template_asthma', descriptionKey: 'landing.template_asthma_desc', icon: 'wind', color: DATA_4, blueprint: asthma },
	{ id: 'hypertension', labelKey: 'landing.template_hypertension', descriptionKey: 'landing.template_hypertension_desc', icon: 'heart-pulse', color: DATA_1, blueprint: hypertension },
	// Removed per product review — kept blueprint def above for potential future re-enable
	// { id: 'cardiovascular', labelKey: 'landing.template_cardiovascular', descriptionKey: 'landing.template_cardiovascular_desc', icon: 'heart-pulse', color: DATA_1, blueprint: cardiovascular },
	// GI & Oncology
	{ id: 'ibs', labelKey: 'landing.template_ibs', descriptionKey: 'landing.template_ibs_desc', icon: 'shield', color: DATA_3, blueprint: ibs },
	// CIPH-pi24-4a — cancer_treatment revived as a setup-wizard preset.
	// Landing-discovery surface (conditionGroups + conditionInfoMap entry +
	// /conditions/[id] deep-link page with ~80 i18n strings of rationale
	// copy) deferred to a follow-up. Selection via /setup works fully.
	{ id: 'cancer_treatment', labelKey: 'landing.template_cancer_treatment', descriptionKey: 'landing.template_cancer_treatment_desc', icon: 'shield-plus', color: DATA_4, blueprint: cancer_treatment },
	// Dermatology & Gynecology
	// Removed per product review — kept blueprint def above for potential future re-enable
	// { id: 'dermatology', labelKey: 'landing.template_dermatology', descriptionKey: 'landing.template_dermatology_desc', icon: 'scan', color: DATA_6, blueprint: dermatology },
	{ id: 'endometriosis', labelKey: 'landing.template_endometriosis', descriptionKey: 'landing.template_endometriosis_desc', icon: 'flower', color: DATA_2, blueprint: endometriosis },
	{ id: 'menopause', labelKey: 'landing.template_menopause', descriptionKey: 'landing.template_menopause_desc', icon: 'scan', color: DATA_6, blueprint: menopause },
	{ id: 'pcos', labelKey: 'landing.template_pcos', descriptionKey: 'landing.template_pcos_desc', icon: 'flower2', color: DATA_6, blueprint: pcos },
	// New presets (wave 1)
	{ id: 'bipolar', labelKey: 'landing.template_bipolar', descriptionKey: 'landing.template_bipolar_desc', icon: 'activity', color: DATA_5, blueprint: bipolar },
	{ id: 'glaucoma', labelKey: 'landing.template_glaucoma', descriptionKey: 'landing.template_glaucoma_desc', icon: 'eye', color: DATA_3, blueprint: glaucoma },
	{ id: 'parkinson', labelKey: 'landing.template_parkinson', descriptionKey: 'landing.template_parkinson_desc', icon: 'waves', color: DATA_3, blueprint: parkinson },
	{ id: 'ibd', labelKey: 'landing.template_ibd', descriptionKey: 'landing.template_ibd_desc', icon: 'donut', color: DATA_6, blueprint: ibd },
	// Custom
	{ id: 'custom', labelKey: 'landing.template_custom', descriptionKey: 'landing.template_custom_desc', icon: 'settings', color: DATA_5, blueprint: custom },
];
