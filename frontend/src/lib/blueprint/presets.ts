import type { Blueprint } from './types';

// ─── Epilepsy ────────────────────────────────────────────────

export const epilepsy: Blueprint = {
	version: 1,
	conditionId: 'epilepsy',
	conditionLabel: 'landing.template_epilepsy',
	accentColor: '#6366F1',
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
				{ id: 'slept_well', label: 'symptom.slept_well' },
				{ id: 'slept_badly', label: 'symptom.slept_badly' },
			]
		},
	],
	episodeTypes: [
		{ id: 'focal', label: 'seizure.focal', color: '#DC2626', trackDuration: true, trackTimeOfDay: true },
		{ id: 'generalized', label: 'seizure.generalized', color: '#B91C1C', trackDuration: true, trackTimeOfDay: true },
		{ id: 'absence', label: 'seizure.absence', color: '#EF4444', trackDuration: true, trackTimeOfDay: true },
		{ id: 'myoclonic', label: 'seizure.myoclonic', color: '#F87171', trackDuration: true, trackTimeOfDay: true },
		{ id: 'unknown', label: 'seizure.unknown', color: '#FCA5A5', trackDuration: true, trackTimeOfDay: true },
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
		{ key: 'daily_log', label: 'stream_filter.daily_log' },
		{ key: 'episode', label: 'stream_filter.episode' },
		{ key: 'event', label: 'stream_filter.event' },
	],
	reportPreference: 'both',
};

// ─── ADHD ────────────────────────────────────────────────────

export const adhd: Blueprint = {
	version: 1,
	conditionId: 'adhd',
	conditionLabel: 'landing.template_adhd',
	accentColor: '#F59E0B',
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
				{ id: 'slept_well', label: 'symptom.slept_well' },
				{ id: 'slept_badly', label: 'symptom.slept_badly' },
				{ id: 'hard_to_get_up', label: 'symptom.hard_to_get_up' },
			]
		},
	],
	episodeTypes: [
		{ id: 'meltdown', label: 'seizure.meltdown', color: '#DC2626' },
		{ id: 'shutdown', label: 'seizure.shutdown', color: '#7C3AED' },
		{ id: 'panic_attack', label: 'seizure.panic_attack', color: '#F59E0B' },
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
		{ key: 'daily_log', label: 'stream_filter.daily_log' },
		{ key: 'episode', label: 'stream_filter.episode' },
		{ key: 'event', label: 'stream_filter.event' },
	],
	reportPreference: 'both',
};

// ─── Diabetes ────────────────────────────────────────────────

export const diabetes: Blueprint = {
	version: 1,
	conditionId: 'diabetes',
	conditionLabel: 'landing.template_diabetes',
	accentColor: '#0D9488',
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
				{ id: 'slept_well', label: 'symptom.slept_well' },
				{ id: 'slept_badly', label: 'symptom.slept_badly' },
			]
		},
	],
	episodeTypes: [
		{ id: 'hypoglycemia', label: 'seizure.hypoglycemia', color: '#DC2626' },
		{ id: 'hyperglycemia', label: 'seizure.hyperglycemia', color: '#F59E0B' },
		{ id: 'ketoacidosis', label: 'seizure.ketoacidosis', color: '#B91C1C' },
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
		{ id: 'bp', label: 'vital.bp', unit: 'mmHg', placeholder: '120/80' },
		{ id: 'weight', label: 'vital.weight', unit: 'kg', placeholder: '70' },
		{ id: 'ketones', label: 'vital.ketones', unit: 'mmol/L', placeholder: '0.5' },
		{ id: 'carbs', label: 'vital.carbs', unit: 'g', placeholder: '45' },
		// hba1c omitted — it's a quarterly lab value, not a daily vital
	],
	medications: [],
	gridSymptomColumns: ['shaking', 'sweating', 'dizzy', 'thirsty', 'tired'],
	gridEpisodeColumns: ['hypoglycemia', 'hyperglycemia'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'daily_log', label: 'stream_filter.daily_log' },
		{ key: 'episode', label: 'stream_filter.episode' },
		{ key: 'event', label: 'stream_filter.event' },
	],
	reportPreference: 'both',
};

// ─── Burnout ─────────────────────────────────────────────────

export const burnout: Blueprint = {
	version: 1,
	conditionId: 'burnout',
	conditionLabel: 'landing.template_burnout',
	accentColor: '#8B5CF6',
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
				{ id: 'slept_well', label: 'symptom.slept_well' },
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
		{ id: 'breakdown', label: 'seizure.breakdown', color: '#DC2626' },
		{ id: 'panic_attack', label: 'seizure.panic_attack', color: '#F59E0B' },
		{ id: 'crying_spell', label: 'seizure.crying_spell', color: '#8B5CF6' },
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
		{ key: 'daily_log', label: 'stream_filter.daily_log' },
		{ key: 'episode', label: 'stream_filter.episode' },
		{ key: 'event', label: 'stream_filter.event' },
	],
	reportPreference: 'both',
};

// ─── Migraine ────────────────────────────────────────────────

export const migraine: Blueprint = {
	version: 1,
	conditionId: 'migraine',
	conditionLabel: 'landing.template_migraine',
	accentColor: '#EC4899',
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
		{ id: 'migraine_with_aura', label: 'seizure.migraine_with_aura', color: '#EC4899', trackDuration: true, trackTimeOfDay: true },
		{ id: 'migraine_without_aura', label: 'seizure.migraine_without_aura', color: '#F472B6', trackDuration: true, trackTimeOfDay: true },
		{ id: 'tension_headache', label: 'seizure.tension_headache', color: '#FB923C', trackDuration: true },
		{ id: 'cluster_headache', label: 'seizure.cluster_headache', color: '#DC2626', trackDuration: true, trackTimeOfDay: true },
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
		{ key: 'daily_log', label: 'stream_filter.daily_log' },
		{ key: 'episode', label: 'stream_filter.episode' },
		{ key: 'event', label: 'stream_filter.event' },
	],
	reportPreference: 'both',
};

// ─── Empty starter for fully custom blueprints ───────────────

export const custom: Blueprint = {
	version: 1,
	conditionId: 'custom',
	conditionLabel: 'landing.template_custom',
	accentColor: '#6366F1',
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
		{ key: 'daily_log', label: 'stream_filter.daily_log' },
		{ key: 'event', label: 'stream_filter.event' },
	],
	reportPreference: 'both',
};

// ─── Chronic Pain / Fibromyalgia ─────────────────────────────

export const chronic_pain: Blueprint = {
	version: 1,
	conditionId: 'chronic_pain',
	conditionLabel: 'landing.template_chronic_pain',
	accentColor: '#E11D48',
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
				{ id: 'slept_well', label: 'symptom.slept_well' },
				{ id: 'slept_badly', label: 'symptom.slept_badly' },
				{ id: 'insomnia', label: 'symptom.insomnia' },
				{ id: 'woke_from_pain', label: 'symptom.woke_from_pain' },
				{ id: 'unrefreshed', label: 'symptom.unrefreshed' },
			]
		},
	],
	episodeTypes: [
		{ id: 'flare', label: 'seizure.flare', color: '#DC2626' },
		{ id: 'breakthrough_pain', label: 'seizure.breakthrough_pain', color: '#F59E0B' },
		{ id: 'severe_episode', label: 'seizure.severe_episode', color: '#B91C1C' },
		{ id: 'functional_crisis', label: 'seizure.functional_crisis', color: '#7C3AED' },
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
		{ id: 'pain_level', label: 'vital.pain_level', unit: '0-10', placeholder: '5' },
		{ id: 'pain_interference', label: 'vital.pain_interference', unit: '0-10', placeholder: '5' },
		{ id: 'sleep_hours', label: 'vital.sleep_hours', unit: 'h', placeholder: '7' },
		{ id: 'mood', label: 'vital.mood', unit: '1-10', placeholder: '5' },
	],
	medications: [],
	gridSymptomColumns: ['burning', 'aching', 'stiffness', 'tired', 'brain_fog', 'insomnia'],
	gridEpisodeColumns: ['flare', 'breakthrough_pain'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'daily_log', label: 'stream_filter.daily_log' },
		{ key: 'episode', label: 'stream_filter.episode' },
		{ key: 'event', label: 'stream_filter.event' },
	],
	reportPreference: 'both',
};

// ─── Multiple Sclerosis ─────────────────────────────────────

export const ms: Blueprint = {
	version: 1,
	conditionId: 'ms',
	conditionLabel: 'landing.template_ms',
	accentColor: '#3B82F6',
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
		{ id: 'relapse', label: 'seizure.relapse', color: '#DC2626' },
		{ id: 'pseudo_relapse', label: 'seizure.pseudo_relapse', color: '#F59E0B' },
		{ id: 'optic_neuritis', label: 'seizure.optic_neuritis', color: '#EF4444' },
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
		{ key: 'daily_log', label: 'stream_filter.daily_log' },
		{ key: 'episode', label: 'stream_filter.episode' },
		{ key: 'event', label: 'stream_filter.event' },
	],
	reportPreference: 'both',
};

// ─── Anxiety & Depression ───────────────────────────────────

export const anxiety_depression: Blueprint = {
	version: 1,
	conditionId: 'anxiety_depression',
	conditionLabel: 'landing.template_anxiety_depression',
	accentColor: '#3B82F6',
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
				{ id: 'slept_well', label: 'symptom.slept_well' },
				{ id: 'slept_badly', label: 'symptom.slept_badly' },
				{ id: 'insomnia', label: 'symptom.insomnia' },
				{ id: 'hypersomnia', label: 'symptom.hypersomnia' },
				{ id: 'nightmares', label: 'symptom.nightmares' },
			]
		},
	],
	episodeTypes: [
		{ id: 'panic_attack', label: 'seizure.panic_attack', color: '#DC2626' },
		{ id: 'depressive_episode', label: 'seizure.depressive_episode', color: '#1E40AF' },
		{ id: 'anxiety_crisis', label: 'seizure.anxiety_crisis', color: '#F59E0B' },
		{ id: 'dissociation', label: 'seizure.dissociation', color: '#7C3AED' },
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
		{ key: 'daily_log', label: 'stream_filter.daily_log' },
		{ key: 'episode', label: 'stream_filter.episode' },
		{ key: 'event', label: 'stream_filter.event' },
	],
	reportPreference: 'both',
};

// ─── IBS / Digestive Health ─────────────────────────────────

export const ibs: Blueprint = {
	version: 1,
	conditionId: 'ibs',
	conditionLabel: 'landing.template_ibs',
	accentColor: '#D97706',
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
				{ id: 'slept_well', label: 'symptom.slept_well' },
				{ id: 'slept_badly', label: 'symptom.slept_badly' },
			]
		},
	],
	episodeTypes: [
		{ id: 'flare', label: 'seizure.flare', color: '#DC2626' },
		{ id: 'urgency_crisis', label: 'seizure.urgency_crisis', color: '#F59E0B' },
		{ id: 'vomiting_episode', label: 'seizure.vomiting_episode', color: '#7C3AED' },
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
		{ id: 'weight', label: 'vital.weight', unit: 'kg', placeholder: '70' },
	],
	medications: [],
	gridSymptomColumns: ['abdominal_pain', 'bloating', 'diarrhea', 'constipation', 'urgency', 'tired'],
	gridEpisodeColumns: ['flare', 'urgency_crisis'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'daily_log', label: 'stream_filter.daily_log' },
		{ key: 'episode', label: 'stream_filter.episode' },
		{ key: 'event', label: 'stream_filter.event' },
	],
	reportPreference: 'both',
};

// ─── Asthma / COPD ──────────────────────────────────────────

export const asthma: Blueprint = {
	version: 1,
	conditionId: 'asthma',
	conditionLabel: 'landing.template_asthma',
	accentColor: '#0EA5E9',
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
				{ id: 'slept_well', label: 'symptom.slept_well' },
				{ id: 'slept_badly', label: 'symptom.slept_badly' },
			]
		},
	],
	episodeTypes: [
		{ id: 'asthma_attack', label: 'seizure.asthma_attack', color: '#DC2626', trackDuration: true, trackTimeOfDay: true },
		{ id: 'copd_exacerbation', label: 'seizure.copd_exacerbation', color: '#B91C1C', trackDuration: true },
		{ id: 'respiratory_infection', label: 'seizure.respiratory_infection', color: '#F59E0B' },
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
		{ id: 'peak_flow', label: 'vital.peak_flow', unit: 'L/min', placeholder: '400' },
		{ id: 'spo2', label: 'vital.spo2', unit: '%', placeholder: '97' },
		{ id: 'rescue_inhaler_puffs', label: 'vital.rescue_inhaler_puffs', unit: 'puffs', placeholder: '0' },
		{ id: 'sleep_hours', label: 'vital.sleep_hours', unit: 'h', placeholder: '7' },
	],
	medications: [],
	gridSymptomColumns: ['wheezing', 'shortness_of_breath', 'chest_tightness', 'persistent_cough', 'nocturnal_waking', 'tired'],
	gridEpisodeColumns: ['asthma_attack', 'copd_exacerbation'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'daily_log', label: 'stream_filter.daily_log' },
		{ key: 'episode', label: 'stream_filter.episode' },
		{ key: 'event', label: 'stream_filter.event' },
	],
	reportPreference: 'both',
};

// ─── Endometriosis ──────────────────────────────────────────

export const endometriosis: Blueprint = {
	version: 1,
	conditionId: 'endometriosis',
	conditionLabel: 'landing.template_endometriosis',
	accentColor: '#E11D48',
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
		{ id: 'flare', label: 'seizure.flare', color: '#DC2626' },
		{ id: 'er_visit', label: 'seizure.er_visit', color: '#B91C1C' },
		{ id: 'missed_work_school', label: 'seizure.missed_work_school', color: '#F59E0B' },
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
		{ id: 'cycle_day', label: 'vital.cycle_day', unit: 'day', placeholder: '14' },
		{ id: 'sleep_hours', label: 'vital.sleep_hours', unit: 'h', placeholder: '7' },
		{ id: 'mood', label: 'vital.mood', unit: '1-10', placeholder: '5' },
	],
	medications: [],
	gridSymptomColumns: ['dysmenorrhea', 'chronic_pelvic_pain', 'bloating', 'tired', 'heavy_bleeding', 'painful_bowel'],
	gridEpisodeColumns: ['flare', 'missed_work_school'],
	streamFilters: [
		{ key: 'all', label: 'stream_filter.all' },
		{ key: 'daily_log', label: 'stream_filter.daily_log' },
		{ key: 'episode', label: 'stream_filter.episode' },
		{ key: 'event', label: 'stream_filter.event' },
	],
	reportPreference: 'both',
};

// ─── Cancer Treatment ───────────────────────────────────────

export const cancer_treatment: Blueprint = {
	version: 1,
	conditionId: 'cancer_treatment',
	conditionLabel: 'landing.template_cancer_treatment',
	accentColor: '#059669',
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
				{ id: 'slept_well', label: 'symptom.slept_well' },
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
		{ id: 'febrile_neutropenia', label: 'seizure.febrile_neutropenia', color: '#DC2626' },
		{ id: 'er_visit', label: 'seizure.er_visit', color: '#B91C1C' },
		{ id: 'dose_reduction', label: 'seizure.dose_reduction', color: '#F59E0B' },
		{ id: 'hospitalization', label: 'seizure.hospitalization', color: '#991B1B' },
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
		{ key: 'daily_log', label: 'stream_filter.daily_log' },
		{ key: 'episode', label: 'stream_filter.episode' },
		{ key: 'event', label: 'stream_filter.event' },
	],
	reportPreference: 'both',
};

// ─── Dermatology ────────────────────────────────────────────

export const dermatology: Blueprint = {
	version: 1,
	conditionId: 'dermatology',
	conditionLabel: 'landing.template_dermatology',
	accentColor: '#F43F5E',
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
		{ id: 'flare', label: 'seizure.flare', color: '#DC2626' },
		{ id: 'skin_infection', label: 'seizure.skin_infection', color: '#B91C1C' },
		{ id: 'allergic_reaction', label: 'seizure.allergic_reaction', color: '#F59E0B' },
		{ id: 'joint_flare', label: 'seizure.joint_flare', color: '#7C3AED' },
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
		{ key: 'daily_log', label: 'stream_filter.daily_log' },
		{ key: 'episode', label: 'stream_filter.episode' },
		{ key: 'event', label: 'stream_filter.event' },
	],
	reportPreference: 'both',
};

// ─── Autism / Sensory Processing ────────────────────────────

export const autism: Blueprint = {
	version: 1,
	conditionId: 'autism',
	conditionLabel: 'landing.template_autism',
	accentColor: '#0EA5E9',
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
				{ id: 'slept_well', label: 'symptom.slept_well' },
				{ id: 'slept_badly', label: 'symptom.slept_badly' },
				{ id: 'autistic_fatigue', label: 'symptom.autistic_fatigue' },
			]
		},
	],
	episodeTypes: [
		{ id: 'meltdown', label: 'seizure.meltdown', color: '#DC2626' },
		{ id: 'shutdown', label: 'seizure.shutdown', color: '#7C3AED' },
		{ id: 'sensory_crisis', label: 'seizure.sensory_crisis', color: '#F97316' },
		{ id: 'burnout_episode', label: 'seizure.burnout_episode', color: '#64748B' },
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
		{ key: 'daily_log', label: 'stream_filter.daily_log' },
		{ key: 'episode', label: 'stream_filter.episode' },
		{ key: 'event', label: 'stream_filter.event' },
	],
	reportPreference: 'both',
};

// ─── Heart & Cardiovascular ─────────────────────────────────

export const cardiovascular: Blueprint = {
	version: 1,
	conditionId: 'cardiovascular',
	conditionLabel: 'landing.template_cardiovascular',
	accentColor: '#DC2626',
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
				{ id: 'slept_well', label: 'symptom.slept_well' },
				{ id: 'slept_badly', label: 'symptom.slept_badly' },
				{ id: 'nocturia', label: 'symptom.nocturia' },
			]
		},
	],
	episodeTypes: [
		{ id: 'afib_episode', label: 'seizure.afib_episode', color: '#DC2626', trackDuration: true, trackTimeOfDay: true },
		{ id: 'angina', label: 'seizure.angina', color: '#F59E0B', trackDuration: true, trackTimeOfDay: true },
		{ id: 'syncope', label: 'seizure.syncope', color: '#7C3AED', trackTimeOfDay: true },
		{ id: 'hf_decompensation', label: 'seizure.hf_decompensation', color: '#B91C1C' },
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
		{ id: 'bp', label: 'vital.bp', unit: 'mmHg', placeholder: '120/80', multiEntry: true },
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
		{ key: 'daily_log', label: 'stream_filter.daily_log' },
		{ key: 'episode', label: 'stream_filter.episode' },
		{ key: 'event', label: 'stream_filter.event' },
	],
	reportPreference: 'both',
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
	{ id: 'epilepsy', labelKey: 'landing.template_epilepsy', descriptionKey: 'landing.template_epilepsy_desc', icon: 'zap', color: '#6366F1', blueprint: epilepsy },
	{ id: 'migraine', labelKey: 'landing.template_migraine', descriptionKey: 'landing.template_migraine_desc', icon: 'cloud-lightning', color: '#EC4899', blueprint: migraine },
	{ id: 'ms', labelKey: 'landing.template_ms', descriptionKey: 'landing.template_ms_desc', icon: 'brain', color: '#3B82F6', blueprint: ms },
	// Neurodivergence
	{ id: 'adhd', labelKey: 'landing.template_adhd', descriptionKey: 'landing.template_adhd_desc', icon: 'focus', color: '#F59E0B', blueprint: adhd },
	{ id: 'autism', labelKey: 'landing.template_autism', descriptionKey: 'landing.template_autism_desc', icon: 'ear', color: '#0EA5E9', blueprint: autism },
	// Mental health
	{ id: 'burnout', labelKey: 'landing.template_burnout', descriptionKey: 'landing.template_burnout_desc', icon: 'battery-low', color: '#8B5CF6', blueprint: burnout },
	{ id: 'anxiety_depression', labelKey: 'landing.template_anxiety_depression', descriptionKey: 'landing.template_anxiety_depression_desc', icon: 'heart', color: '#3B82F6', blueprint: anxiety_depression },
	// Metabolic & Pain
	{ id: 'diabetes', labelKey: 'landing.template_diabetes', descriptionKey: 'landing.template_diabetes_desc', icon: 'droplet', color: '#0D9488', blueprint: diabetes },
	{ id: 'chronic_pain', labelKey: 'landing.template_chronic_pain', descriptionKey: 'landing.template_chronic_pain_desc', icon: 'flame', color: '#E11D48', blueprint: chronic_pain },
	// Respiratory & Cardio
	{ id: 'asthma', labelKey: 'landing.template_asthma', descriptionKey: 'landing.template_asthma_desc', icon: 'wind', color: '#0EA5E9', blueprint: asthma },
	{ id: 'cardiovascular', labelKey: 'landing.template_cardiovascular', descriptionKey: 'landing.template_cardiovascular_desc', icon: 'heart-pulse', color: '#DC2626', blueprint: cardiovascular },
	// GI & Oncology
	{ id: 'ibs', labelKey: 'landing.template_ibs', descriptionKey: 'landing.template_ibs_desc', icon: 'shield', color: '#D97706', blueprint: ibs },
	{ id: 'cancer_treatment', labelKey: 'landing.template_cancer_treatment', descriptionKey: 'landing.template_cancer_treatment_desc', icon: 'shield-plus', color: '#059669', blueprint: cancer_treatment },
	// Dermatology & Gynecology
	{ id: 'dermatology', labelKey: 'landing.template_dermatology', descriptionKey: 'landing.template_dermatology_desc', icon: 'scan', color: '#F43F5E', blueprint: dermatology },
	{ id: 'endometriosis', labelKey: 'landing.template_endometriosis', descriptionKey: 'landing.template_endometriosis_desc', icon: 'flower', color: '#E11D48', blueprint: endometriosis },
	// Custom
	{ id: 'custom', labelKey: 'landing.template_custom', descriptionKey: 'landing.template_custom_desc', icon: 'settings', color: '#64748B', blueprint: custom },
];
