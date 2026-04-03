import type { Blueprint } from './types';

// ─── Epilepsy ────────────────────────────────────────────────

export const epilepsy: Blueprint = {
	version: 1,
	conditionId: 'epilepsy',
	conditionLabel: 'Epilepsie',
	accentColor: '#6366F1',
	symptomGroups: [
		{
			id: 'behavior', label: 'Verhalten', items: [
				{ id: 'tired', label: 'Müde' },
				{ id: 'aggressive', label: 'Aggressiv' },
				{ id: 'restless', label: 'Unruhig' },
				{ id: 'irritable', label: 'Reizbar' },
				{ id: 'anxious', label: 'Ängstlich' },
				{ id: 'confused', label: 'Verwirrt' },
			]
		},
		{
			id: 'physical', label: 'Körperlich', items: [
				{ id: 'nausea', label: 'Übelkeit' },
				{ id: 'dizzy', label: 'Schwindel' },
				{ id: 'headache', label: 'Kopfschmerzen' },
				{ id: 'aura', label: 'Aura' },
			]
		},
		{
			id: 'sleep', label: 'Schlaf', items: [
				{ id: 'slept_well', label: 'Gut geschlafen' },
				{ id: 'slept_badly', label: 'Schlecht geschlafen' },
			]
		},
	],
	episodeTypes: [
		{ id: 'focal', label: 'Fokal', color: '#DC2626' },
		{ id: 'generalized', label: 'Generalisiert (GM)', color: '#B91C1C' },
		{ id: 'absence', label: 'Absence', color: '#EF4444' },
		{ id: 'myoclonic', label: 'Myoklonisch', color: '#F87171' },
		{ id: 'unknown', label: 'Unbekannt', color: '#FCA5A5' },
	],
	triggers: [
		{ id: 'stress', label: 'Stress' },
		{ id: 'sleep_deprivation', label: 'Schlafmangel' },
		{ id: 'weather', label: 'Wetter' },
		{ id: 'menstruation', label: 'Menstruation' },
		{ id: 'alcohol', label: 'Alkohol' },
		{ id: 'missed_meds', label: 'Medikament vergessen' },
		{ id: 'light', label: 'Lichtreize' },
	],
	vitals: [
		{ id: 'bp', label: 'Blutdruck', unit: 'mmHg', placeholder: '120/80' },
		{ id: 'pulse', label: 'Puls', unit: 'bpm', placeholder: '72' },
		{ id: 'o2', label: 'O₂-Sättigung', unit: '%', placeholder: '98' },
		{ id: 'weight', label: 'Gewicht', unit: 'kg', placeholder: '70' },
		{ id: 'temp', label: 'Temperatur', unit: '°C', placeholder: '36.5' },
	],
	medications: [
		{ id: 'med_1', name: 'Levetiracetam', dose: '500mg', schedule: 'morgens, abends', asNeeded: false },
		{ id: 'med_2', name: 'Midazolam nasal', dose: '5mg', schedule: 'bei Anfall', asNeeded: true },
	],
	gridSymptomColumns: ['tired', 'aggressive', 'restless', 'nausea', 'dizzy', 'headache', 'aura'],
	gridEpisodeColumns: ['focal', 'generalized'],
	quickActions: [
		{ id: 'log_day', label: 'Tag protokollieren', icon: 'zap', color: 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400', href: '/protocol' },
		{ id: 'generate_report', label: 'Monatsbericht', icon: 'file', color: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400', href: '/protocol?view=month' },
		{ id: 'view_calendar', label: 'Kalender', icon: 'calendar', color: 'bg-teal-500/10 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400', href: '/calendar' },
		{ id: 'view_stream', label: 'Verlauf', icon: 'activity', color: 'bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400', href: '/stream' },
	],
	streamFilters: [
		{ key: 'all', label: 'Alle' },
		{ key: 'daily_log', label: 'Protokolle' },
		{ key: 'episode', label: 'Anfälle' },
		{ key: 'event', label: 'Ereignisse' },
	],
};

// ─── ADHD ────────────────────────────────────────────────────

export const adhd: Blueprint = {
	version: 1,
	conditionId: 'adhd',
	conditionLabel: 'ADHS',
	accentColor: '#F59E0B',
	symptomGroups: [
		{
			id: 'focus', label: 'Aufmerksamkeit', items: [
				{ id: 'distracted', label: 'Ablenkbar' },
				{ id: 'hyperfocus', label: 'Hyperfokus' },
				{ id: 'forgetful', label: 'Vergesslich' },
				{ id: 'brain_fog', label: 'Brain Fog' },
				{ id: 'procrastinating', label: 'Prokrastination' },
			]
		},
		{
			id: 'impulse', label: 'Impulskontrolle', items: [
				{ id: 'impulsive', label: 'Impulsiv' },
				{ id: 'restless', label: 'Unruhig' },
				{ id: 'impatient', label: 'Ungeduldig' },
				{ id: 'interrupting', label: 'Unterbreche andere' },
			]
		},
		{
			id: 'emotion', label: 'Emotionen', items: [
				{ id: 'irritable', label: 'Reizbar' },
				{ id: 'overwhelmed', label: 'Überfordert' },
				{ id: 'anxious', label: 'Ängstlich' },
				{ id: 'mood_swings', label: 'Stimmungsschwankungen' },
				{ id: 'rejection_sensitive', label: 'Rejection Sensitivity' },
			]
		},
		{
			id: 'energy', label: 'Energie & Schlaf', items: [
				{ id: 'tired', label: 'Müde' },
				{ id: 'wired', label: 'Aufgedreht' },
				{ id: 'slept_well', label: 'Gut geschlafen' },
				{ id: 'slept_badly', label: 'Schlecht geschlafen' },
				{ id: 'hard_to_get_up', label: 'Schwer aufgestanden' },
			]
		},
	],
	episodeTypes: [
		{ id: 'meltdown', label: 'Meltdown', color: '#DC2626' },
		{ id: 'shutdown', label: 'Shutdown', color: '#7C3AED' },
		{ id: 'panic_attack', label: 'Panikattacke', color: '#F59E0B' },
	],
	triggers: [
		{ id: 'stress', label: 'Stress' },
		{ id: 'sleep_deprivation', label: 'Schlafmangel' },
		{ id: 'overstimulation', label: 'Reizüberflutung' },
		{ id: 'boredom', label: 'Langeweile' },
		{ id: 'hunger', label: 'Hunger' },
		{ id: 'caffeine', label: 'Koffein' },
		{ id: 'missed_meds', label: 'Medikament vergessen' },
		{ id: 'social_conflict', label: 'Sozialer Konflikt' },
		{ id: 'time_pressure', label: 'Zeitdruck' },
	],
	vitals: [
		{ id: 'pulse', label: 'Puls', unit: 'bpm', placeholder: '72' },
		{ id: 'weight', label: 'Gewicht', unit: 'kg', placeholder: '70' },
	],
	medications: [],
	gridSymptomColumns: ['distracted', 'hyperfocus', 'forgetful', 'restless', 'overwhelmed', 'tired'],
	gridEpisodeColumns: ['meltdown', 'shutdown'],
	quickActions: [
		{ id: 'log_day', label: 'Tag protokollieren', icon: 'zap', color: 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400', href: '/protocol' },
		{ id: 'generate_report', label: 'Monatsbericht', icon: 'file', color: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400', href: '/protocol?view=month' },
		{ id: 'view_calendar', label: 'Kalender', icon: 'calendar', color: 'bg-teal-500/10 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400', href: '/calendar' },
		{ id: 'view_stream', label: 'Verlauf', icon: 'activity', color: 'bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400', href: '/stream' },
	],
	streamFilters: [
		{ key: 'all', label: 'Alle' },
		{ key: 'daily_log', label: 'Protokolle' },
		{ key: 'episode', label: 'Episoden' },
		{ key: 'event', label: 'Ereignisse' },
	],
};

// ─── Diabetes ────────────────────────────────────────────────

export const diabetes: Blueprint = {
	version: 1,
	conditionId: 'diabetes',
	conditionLabel: 'Diabetes',
	accentColor: '#0D9488',
	symptomGroups: [
		{
			id: 'hypo_signs', label: 'Unterzucker-Zeichen', items: [
				{ id: 'shaking', label: 'Zittern' },
				{ id: 'sweating', label: 'Schwitzen' },
				{ id: 'dizzy', label: 'Schwindel' },
				{ id: 'confused', label: 'Verwirrt' },
				{ id: 'hungry', label: 'Heisshunger' },
				{ id: 'blurred_vision', label: 'Verschwommenes Sehen' },
			]
		},
		{
			id: 'hyper_signs', label: 'Überzucker-Zeichen', items: [
				{ id: 'thirsty', label: 'Starker Durst' },
				{ id: 'frequent_urination', label: 'Häufiges Wasserlassen' },
				{ id: 'tired', label: 'Müde' },
				{ id: 'nausea', label: 'Übelkeit' },
			]
		},
		{
			id: 'general', label: 'Allgemein', items: [
				{ id: 'headache', label: 'Kopfschmerzen' },
				{ id: 'irritable', label: 'Reizbar' },
				{ id: 'slept_well', label: 'Gut geschlafen' },
				{ id: 'slept_badly', label: 'Schlecht geschlafen' },
			]
		},
	],
	episodeTypes: [
		{ id: 'hypoglycemia', label: 'Unterzuckerung', color: '#DC2626' },
		{ id: 'hyperglycemia', label: 'Überzuckerung', color: '#F59E0B' },
		{ id: 'ketoacidosis', label: 'Ketoazidose', color: '#B91C1C' },
	],
	triggers: [
		{ id: 'missed_meds', label: 'Insulin vergessen' },
		{ id: 'stress', label: 'Stress' },
		{ id: 'high_carb_meal', label: 'Kohlenhydratreiche Mahlzeit' },
		{ id: 'exercise', label: 'Sport / Bewegung' },
		{ id: 'illness', label: 'Krankheit / Infekt' },
		{ id: 'alcohol', label: 'Alkohol' },
	],
	vitals: [
		{ id: 'blood_sugar', label: 'Blutzucker', unit: 'mg/dL', placeholder: '110' },
		{ id: 'hba1c', label: 'HbA1c', unit: '%', placeholder: '6.5' },
		{ id: 'bp', label: 'Blutdruck', unit: 'mmHg', placeholder: '120/80' },
		{ id: 'weight', label: 'Gewicht', unit: 'kg', placeholder: '70' },
		{ id: 'ketones', label: 'Ketone', unit: 'mmol/L', placeholder: '0.5' },
		{ id: 'carbs', label: 'Kohlenhydrate', unit: 'g', placeholder: '45' },
	],
	medications: [],
	gridSymptomColumns: ['shaking', 'sweating', 'dizzy', 'thirsty', 'tired'],
	gridEpisodeColumns: ['hypoglycemia', 'hyperglycemia'],
	quickActions: [
		{ id: 'log_day', label: 'Tag protokollieren', icon: 'zap', color: 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400', href: '/protocol' },
		{ id: 'generate_report', label: 'Monatsbericht', icon: 'file', color: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400', href: '/protocol?view=month' },
		{ id: 'view_calendar', label: 'Kalender', icon: 'calendar', color: 'bg-teal-500/10 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400', href: '/calendar' },
		{ id: 'view_stream', label: 'Verlauf', icon: 'activity', color: 'bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400', href: '/stream' },
	],
	streamFilters: [
		{ key: 'all', label: 'Alle' },
		{ key: 'daily_log', label: 'Protokolle' },
		{ key: 'episode', label: 'Episoden' },
		{ key: 'event', label: 'Ereignisse' },
	],
};

// ─── Burnout ─────────────────────────────────────────────────

export const burnout: Blueprint = {
	version: 1,
	conditionId: 'burnout',
	conditionLabel: 'Burnout / Erschöpfung',
	accentColor: '#8B5CF6',
	symptomGroups: [
		{
			id: 'mental', label: 'Mental', items: [
				{ id: 'exhausted', label: 'Erschöpft' },
				{ id: 'overwhelmed', label: 'Überfordert' },
				{ id: 'cynical', label: 'Zynisch / Distanziert' },
				{ id: 'brain_fog', label: 'Brain Fog' },
				{ id: 'no_motivation', label: 'Keine Motivation' },
				{ id: 'anxious', label: 'Ängstlich' },
			]
		},
		{
			id: 'physical', label: 'Körperlich', items: [
				{ id: 'tired', label: 'Müde' },
				{ id: 'headache', label: 'Kopfschmerzen' },
				{ id: 'back_pain', label: 'Rückenschmerzen' },
				{ id: 'tension', label: 'Verspannungen' },
				{ id: 'stomach', label: 'Magenprobleme' },
			]
		},
		{
			id: 'sleep', label: 'Schlaf', items: [
				{ id: 'slept_well', label: 'Gut geschlafen' },
				{ id: 'slept_badly', label: 'Schlecht geschlafen' },
				{ id: 'insomnia', label: 'Einschlafprobleme' },
				{ id: 'nightmares', label: 'Alpträume' },
			]
		},
		{
			id: 'social', label: 'Sozial', items: [
				{ id: 'isolated', label: 'Rückzug' },
				{ id: 'irritable', label: 'Reizbar' },
				{ id: 'conflict', label: 'Konflikte' },
			]
		},
	],
	episodeTypes: [
		{ id: 'breakdown', label: 'Zusammenbruch', color: '#DC2626' },
		{ id: 'panic_attack', label: 'Panikattacke', color: '#F59E0B' },
		{ id: 'crying_spell', label: 'Weinkrampf', color: '#8B5CF6' },
	],
	triggers: [
		{ id: 'work_overload', label: 'Arbeitsüberlastung' },
		{ id: 'deadline', label: 'Deadline' },
		{ id: 'conflict_work', label: 'Konflikt (Arbeit)' },
		{ id: 'conflict_private', label: 'Konflikt (Privat)' },
		{ id: 'sleep_deprivation', label: 'Schlafmangel' },
		{ id: 'no_breaks', label: 'Keine Pausen' },
		{ id: 'perfectionism', label: 'Perfektionismus' },
	],
	vitals: [
		{ id: 'energy_level', label: 'Energielevel', unit: '1-10', placeholder: '5' },
		{ id: 'mood', label: 'Stimmung', unit: '1-10', placeholder: '5' },
		{ id: 'pulse', label: 'Puls', unit: 'bpm', placeholder: '72' },
		{ id: 'sleep_hours', label: 'Schlafstunden', unit: 'h', placeholder: '7' },
	],
	medications: [],
	gridSymptomColumns: ['exhausted', 'overwhelmed', 'brain_fog', 'tired', 'insomnia', 'isolated'],
	gridEpisodeColumns: ['breakdown', 'panic_attack'],
	quickActions: [
		{ id: 'log_day', label: 'Tag protokollieren', icon: 'zap', color: 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400', href: '/protocol' },
		{ id: 'generate_report', label: 'Monatsbericht', icon: 'file', color: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400', href: '/protocol?view=month' },
		{ id: 'view_calendar', label: 'Kalender', icon: 'calendar', color: 'bg-teal-500/10 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400', href: '/calendar' },
		{ id: 'view_stream', label: 'Verlauf', icon: 'activity', color: 'bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400', href: '/stream' },
	],
	streamFilters: [
		{ key: 'all', label: 'Alle' },
		{ key: 'daily_log', label: 'Protokolle' },
		{ key: 'episode', label: 'Episoden' },
		{ key: 'event', label: 'Ereignisse' },
	],
};

// ─── Migraine ────────────────────────────────────────────────

export const migraine: Blueprint = {
	version: 1,
	conditionId: 'migraine',
	conditionLabel: 'Migräne',
	accentColor: '#EC4899',
	symptomGroups: [
		{
			id: 'prodrome', label: 'Vorboten', items: [
				{ id: 'mood_change', label: 'Stimmungswechsel' },
				{ id: 'food_cravings', label: 'Heisshunger' },
				{ id: 'neck_stiffness', label: 'Nackenstarre' },
				{ id: 'yawning', label: 'Häufiges Gähnen' },
			]
		},
		{
			id: 'aura', label: 'Aura', items: [
				{ id: 'visual_aura', label: 'Sehstörungen' },
				{ id: 'tingling', label: 'Kribbeln' },
				{ id: 'speech_difficulty', label: 'Sprachstörung' },
			]
		},
		{
			id: 'attack', label: 'Attacke', items: [
				{ id: 'headache', label: 'Kopfschmerzen' },
				{ id: 'nausea', label: 'Übelkeit' },
				{ id: 'vomiting', label: 'Erbrechen' },
				{ id: 'light_sensitive', label: 'Lichtempfindlich' },
				{ id: 'sound_sensitive', label: 'Geräuschempfindlich' },
				{ id: 'dizzy', label: 'Schwindel' },
			]
		},
		{
			id: 'postdrome', label: 'Nachphase', items: [
				{ id: 'tired', label: 'Müde' },
				{ id: 'confused', label: 'Verwirrt' },
				{ id: 'drained', label: 'Ausgelaugt' },
			]
		},
	],
	episodeTypes: [
		{ id: 'migraine_with_aura', label: 'Migräne mit Aura', color: '#EC4899' },
		{ id: 'migraine_without_aura', label: 'Migräne ohne Aura', color: '#F472B6' },
		{ id: 'tension_headache', label: 'Spannungskopfschmerz', color: '#FB923C' },
		{ id: 'cluster_headache', label: 'Clusterkopfschmerz', color: '#DC2626' },
	],
	triggers: [
		{ id: 'stress', label: 'Stress' },
		{ id: 'weather', label: 'Wetterwechsel' },
		{ id: 'sleep_deprivation', label: 'Schlafmangel' },
		{ id: 'alcohol', label: 'Alkohol' },
		{ id: 'caffeine_withdrawal', label: 'Koffeinentzug' },
		{ id: 'menstruation', label: 'Menstruation' },
		{ id: 'bright_light', label: 'Helles Licht' },
		{ id: 'strong_smells', label: 'Starke Gerüche' },
		{ id: 'skipped_meal', label: 'Mahlzeit ausgelassen' },
	],
	vitals: [
		{ id: 'pain_level', label: 'Schmerzlevel', unit: '1-10', placeholder: '5' },
		{ id: 'duration_hours', label: 'Dauer', unit: 'h', placeholder: '4' },
		{ id: 'bp', label: 'Blutdruck', unit: 'mmHg', placeholder: '120/80' },
	],
	medications: [],
	gridSymptomColumns: ['headache', 'nausea', 'light_sensitive', 'visual_aura', 'tired'],
	gridEpisodeColumns: ['migraine_with_aura', 'migraine_without_aura', 'tension_headache'],
	quickActions: [
		{ id: 'log_day', label: 'Tag protokollieren', icon: 'zap', color: 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400', href: '/protocol' },
		{ id: 'generate_report', label: 'Monatsbericht', icon: 'file', color: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400', href: '/protocol?view=month' },
		{ id: 'view_calendar', label: 'Kalender', icon: 'calendar', color: 'bg-teal-500/10 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400', href: '/calendar' },
		{ id: 'view_stream', label: 'Verlauf', icon: 'activity', color: 'bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400', href: '/stream' },
	],
	streamFilters: [
		{ key: 'all', label: 'Alle' },
		{ key: 'daily_log', label: 'Protokolle' },
		{ key: 'episode', label: 'Attacken' },
		{ key: 'event', label: 'Ereignisse' },
	],
};

// ─── Empty starter for fully custom blueprints ───────────────

export const custom: Blueprint = {
	version: 1,
	conditionId: 'custom',
	conditionLabel: '',
	accentColor: '#6366F1',
	symptomGroups: [
		{ id: 'general', label: 'Allgemein', items: [] },
	],
	episodeTypes: [],
	triggers: [],
	vitals: [],
	medications: [],
	gridSymptomColumns: [],
	gridEpisodeColumns: [],
	quickActions: [
		{ id: 'write_diary', label: 'Tagebuch', icon: 'book', color: 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400', href: '/protocol' },
		{ id: 'generate_report', label: 'Bericht', icon: 'file', color: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400', href: '/protocol' },
	],
	streamFilters: [
		{ key: 'all', label: 'Alle' },
		{ key: 'daily_log', label: 'Protokolle' },
		{ key: 'event', label: 'Ereignisse' },
	],
};

// ─── Registry ────────────────────────────────────────────────

export interface PresetInfo {
	id: string;
	label: string;
	description: string;
	icon: string;
	color: string;
	blueprint: Blueprint;
}

export const presets: PresetInfo[] = [
	{ id: 'epilepsy', label: 'Epilepsie', description: 'Anfälle, Auren, Medikamente, Vitalwerte', icon: 'zap', color: '#6366F1', blueprint: epilepsy },
	{ id: 'adhd', label: 'ADHS', description: 'Fokus, Impulskontrolle, Emotionen, Energie', icon: 'brain', color: '#F59E0B', blueprint: adhd },
	{ id: 'diabetes', label: 'Diabetes', description: 'Blutzucker, Insulin, Ketone, Kohlenhydrate', icon: 'droplet', color: '#0D9488', blueprint: diabetes },
	{ id: 'burnout', label: 'Burnout', description: 'Erschöpfung, Stimmung, Schlaf, Belastung', icon: 'battery-low', color: '#8B5CF6', blueprint: burnout },
	{ id: 'migraine', label: 'Migräne', description: 'Attacken, Aura, Auslöser, Schmerzlevel', icon: 'cloud-lightning', color: '#EC4899', blueprint: migraine },
	{ id: 'custom', label: 'Eigenes Profil', description: 'Komplett individuell konfigurieren', icon: 'settings', color: '#64748B', blueprint: custom },
];
