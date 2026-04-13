/**
 * ciphra — Public condition info data.
 *
 * Each condition has structured metadata for SEO-optimized
 * public info pages at /conditions/[id]. All display strings
 * use i18n keys resolved at render time.
 */

export interface ClinicalScale {
	nameKey: string;        // i18n key for scale name
	descriptionKey: string; // i18n key for what it measures
	url?: string;           // link to PubMed or guideline
}

export interface SymptomGroupInfo {
	labelKey: string;       // i18n key for group name
	rationaleKey: string;   // i18n key for clinical rationale
	items: string[];        // i18n keys for individual symptoms
}

export interface ConditionInfo {
	id: string;
	icon: string;
	color: string;
	titleKey: string;
	subtitleKey: string;    // one-line hook for SEO description
	introKey: string;       // 2-3 sentence intro paragraph
	symptomGroups: SymptomGroupInfo[];
	episodesKey: string;    // explains episode tracking rationale
	triggersKey: string;    // explains trigger tracking rationale
	vitalsKey: string;      // explains vital tracking rationale
	scales: ClinicalScale[];
	forDoctorKey: string;   // what the PDF report contains
	relatedConditions: string[]; // IDs of related conditions for cross-linking
}

export const conditionInfoMap: Record<string, ConditionInfo> = {
	epilepsy: {
		id: 'epilepsy',
		icon: 'zap',
		color: '#6366F1',
		titleKey: 'condition.epilepsy.title',
		subtitleKey: 'condition.epilepsy.subtitle',
		introKey: 'condition.epilepsy.intro',
		symptomGroups: [
			{
				labelKey: 'symptom_group.behavior',
				rationaleKey: 'condition.epilepsy.rationale_behavior',
				items: ['symptom.tired', 'symptom.aggressive', 'symptom.restless', 'symptom.irritable', 'symptom.anxious', 'symptom.confused'],
			},
			{
				labelKey: 'symptom_group.physical',
				rationaleKey: 'condition.epilepsy.rationale_physical',
				items: ['symptom.nausea', 'symptom.dizzy', 'symptom.headache', 'symptom.aura'],
			},
			{
				labelKey: 'symptom_group.sleep',
				rationaleKey: 'condition.epilepsy.rationale_sleep',
				items: ['symptom.slept_badly'],
			},
		],
		episodesKey: 'condition.epilepsy.episodes_rationale',
		triggersKey: 'condition.epilepsy.triggers_rationale',
		vitalsKey: 'condition.epilepsy.vitals_rationale',
		scales: [
			{ nameKey: 'condition.scale.seizure_diary', descriptionKey: 'condition.scale.seizure_diary_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/20738380/' },
			{ nameKey: 'condition.scale.qolie31', descriptionKey: 'condition.scale.qolie31_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/8816156/' },
		],
		forDoctorKey: 'condition.epilepsy.for_doctor',
		relatedConditions: ['migraine', 'anxiety_depression'],
	},

	migraine: {
		id: 'migraine',
		icon: 'cloud-lightning',
		color: '#EC4899',
		titleKey: 'condition.migraine.title',
		subtitleKey: 'condition.migraine.subtitle',
		introKey: 'condition.migraine.intro',
		symptomGroups: [
			{ labelKey: 'symptom_group.prodrome', rationaleKey: 'condition.migraine.rationale_prodrome', items: ['symptom.mood_change', 'symptom.food_cravings', 'symptom.neck_stiffness', 'symptom.yawning'] },
			{ labelKey: 'symptom_group.aura', rationaleKey: 'condition.migraine.rationale_aura', items: ['symptom.visual_aura', 'symptom.tingling', 'symptom.speech_difficulty'] },
			{ labelKey: 'symptom_group.attack', rationaleKey: 'condition.migraine.rationale_attack', items: ['symptom.headache', 'symptom.nausea', 'symptom.vomiting', 'symptom.light_sensitive', 'symptom.sound_sensitive'] },
			{ labelKey: 'symptom_group.postdrome', rationaleKey: 'condition.migraine.rationale_postdrome', items: ['symptom.tired', 'symptom.confused', 'symptom.drained'] },
		],
		episodesKey: 'condition.migraine.episodes_rationale',
		triggersKey: 'condition.migraine.triggers_rationale',
		vitalsKey: 'condition.migraine.vitals_rationale',
		scales: [
			{ nameKey: 'condition.scale.hit6', descriptionKey: 'condition.scale.hit6_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/14979888/' },
			{ nameKey: 'condition.scale.midas', descriptionKey: 'condition.scale.midas_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/11553762/' },
		],
		forDoctorKey: 'condition.migraine.for_doctor',
		relatedConditions: ['epilepsy', 'chronic_pain', 'anxiety_depression'],
	},

	ms: {
		id: 'ms',
		icon: 'brain',
		color: '#3B82F6',
		titleKey: 'condition.ms.title',
		subtitleKey: 'condition.ms.subtitle',
		introKey: 'condition.ms.intro',
		symptomGroups: [
			{ labelKey: 'symptom_group.motor', rationaleKey: 'condition.ms.rationale_motor', items: ['symptom.weakness', 'symptom.spasticity', 'symptom.balance_problems', 'symptom.gait_difficulty'] },
			{ labelKey: 'symptom_group.sensory', rationaleKey: 'condition.ms.rationale_sensory', items: ['symptom.numbness', 'symptom.tingling', 'symptom.ms_hug'] },
			{ labelKey: 'symptom_group.vision', rationaleKey: 'condition.ms.rationale_vision', items: ['symptom.blurred_vision', 'symptom.double_vision', 'symptom.eye_pain'] },
			{ labelKey: 'symptom_group.cognitive', rationaleKey: 'condition.ms.rationale_cognitive', items: ['symptom.brain_fog', 'symptom.forgetful', 'symptom.slow_processing'] },
		],
		episodesKey: 'condition.ms.episodes_rationale',
		triggersKey: 'condition.ms.triggers_rationale',
		vitalsKey: 'condition.ms.vitals_rationale',
		scales: [
			{ nameKey: 'condition.scale.edss', descriptionKey: 'condition.scale.edss_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/6685237/' },
			{ nameKey: 'condition.scale.fss', descriptionKey: 'condition.scale.fss_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/2803071/' },
		],
		forDoctorKey: 'condition.ms.for_doctor',
		relatedConditions: ['chronic_pain', 'anxiety_depression'],
	},

	adhd: {
		id: 'adhd',
		icon: 'focus',
		color: '#F59E0B',
		titleKey: 'condition.adhd.title',
		subtitleKey: 'condition.adhd.subtitle',
		introKey: 'condition.adhd.intro',
		symptomGroups: [
			{ labelKey: 'symptom_group.focus', rationaleKey: 'condition.adhd.rationale_focus', items: ['symptom.distracted', 'symptom.hyperfocus', 'symptom.forgetful', 'symptom.brain_fog'] },
			{ labelKey: 'symptom_group.impulse', rationaleKey: 'condition.adhd.rationale_impulse', items: ['symptom.impulsive', 'symptom.restless', 'symptom.impatient'] },
			{ labelKey: 'symptom_group.emotion', rationaleKey: 'condition.adhd.rationale_emotion', items: ['symptom.irritable', 'symptom.overwhelmed', 'symptom.mood_swings'] },
		],
		episodesKey: 'condition.adhd.episodes_rationale',
		triggersKey: 'condition.adhd.triggers_rationale',
		vitalsKey: 'condition.adhd.vitals_rationale',
		scales: [
			{ nameKey: 'condition.scale.asrs', descriptionKey: 'condition.scale.asrs_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/15841682/' },
		],
		forDoctorKey: 'condition.adhd.for_doctor',
		relatedConditions: ['anxiety_depression', 'burnout'],
	},

	burnout: {
		id: 'burnout',
		icon: 'battery-low',
		color: '#8B5CF6',
		titleKey: 'condition.burnout.title',
		subtitleKey: 'condition.burnout.subtitle',
		introKey: 'condition.burnout.intro',
		symptomGroups: [
			{ labelKey: 'symptom_group.mental', rationaleKey: 'condition.burnout.rationale_mental', items: ['symptom.exhausted', 'symptom.overwhelmed', 'symptom.cynical', 'symptom.no_motivation'] },
			{ labelKey: 'symptom_group.physical', rationaleKey: 'condition.burnout.rationale_physical', items: ['symptom.tired', 'symptom.headache', 'symptom.back_pain', 'symptom.tension'] },
			{ labelKey: 'symptom_group.sleep', rationaleKey: 'condition.burnout.rationale_sleep', items: ['symptom.slept_badly', 'symptom.insomnia'] },
		],
		episodesKey: 'condition.burnout.episodes_rationale',
		triggersKey: 'condition.burnout.triggers_rationale',
		vitalsKey: 'condition.burnout.vitals_rationale',
		scales: [
			{ nameKey: 'condition.scale.mbi', descriptionKey: 'condition.scale.mbi_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/11022119/' },
		],
		forDoctorKey: 'condition.burnout.for_doctor',
		relatedConditions: ['anxiety_depression', 'adhd', 'chronic_pain'],
	},

	anxiety_depression: {
		id: 'anxiety_depression',
		icon: 'heart',
		color: '#3B82F6',
		titleKey: 'condition.anxiety_depression.title',
		subtitleKey: 'condition.anxiety_depression.subtitle',
		introKey: 'condition.anxiety_depression.intro',
		symptomGroups: [
			{ labelKey: 'symptom_group.mood_affect', rationaleKey: 'condition.anxiety_depression.rationale_mood', items: ['symptom.depressed_mood', 'symptom.hopelessness', 'symptom.anhedonia'] },
			{ labelKey: 'symptom_group.anxiety_fear', rationaleKey: 'condition.anxiety_depression.rationale_anxiety', items: ['symptom.excessive_worry', 'symptom.on_edge', 'symptom.racing_thoughts'] },
			{ labelKey: 'symptom_group.behavior', rationaleKey: 'condition.anxiety_depression.rationale_behavior', items: ['symptom.isolated', 'symptom.avoidance', 'symptom.procrastinating'] },
		],
		episodesKey: 'condition.anxiety_depression.episodes_rationale',
		triggersKey: 'condition.anxiety_depression.triggers_rationale',
		vitalsKey: 'condition.anxiety_depression.vitals_rationale',
		scales: [
			{ nameKey: 'condition.scale.phq9', descriptionKey: 'condition.scale.phq9_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/11556941/' },
			{ nameKey: 'condition.scale.gad7', descriptionKey: 'condition.scale.gad7_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/16717171/' },
		],
		forDoctorKey: 'condition.anxiety_depression.for_doctor',
		relatedConditions: ['burnout', 'chronic_pain'],
	},

	diabetes: {
		id: 'diabetes',
		icon: 'droplet',
		color: '#0D9488',
		titleKey: 'condition.diabetes.title',
		subtitleKey: 'condition.diabetes.subtitle',
		introKey: 'condition.diabetes.intro',
		symptomGroups: [
			{ labelKey: 'symptom_group.hypo_signs', rationaleKey: 'condition.diabetes.rationale_hypo', items: ['symptom.shaking', 'symptom.sweating', 'symptom.dizzy', 'symptom.hungry'] },
			{ labelKey: 'symptom_group.hyper_signs', rationaleKey: 'condition.diabetes.rationale_hyper', items: ['symptom.thirsty', 'symptom.frequent_urination', 'symptom.tired'] },
		],
		episodesKey: 'condition.diabetes.episodes_rationale',
		triggersKey: 'condition.diabetes.triggers_rationale',
		vitalsKey: 'condition.diabetes.vitals_rationale',
		scales: [
			{ nameKey: 'condition.scale.hba1c', descriptionKey: 'condition.scale.hba1c_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/20929995/' },
		],
		forDoctorKey: 'condition.diabetes.for_doctor',
		relatedConditions: ['cardiovascular', 'chronic_pain'],
	},

	chronic_pain: {
		id: 'chronic_pain',
		icon: 'flame',
		color: '#E11D48',
		titleKey: 'condition.chronic_pain.title',
		subtitleKey: 'condition.chronic_pain.subtitle',
		introKey: 'condition.chronic_pain.intro',
		symptomGroups: [
			{ labelKey: 'symptom_group.pain_quality', rationaleKey: 'condition.chronic_pain.rationale_pain_quality', items: ['symptom.burning', 'symptom.stabbing', 'symptom.aching', 'symptom.throbbing'] },
			{ labelKey: 'symptom_group.physical', rationaleKey: 'condition.chronic_pain.rationale_physical', items: ['symptom.stiffness', 'symptom.muscle_spasm', 'symptom.weakness'] },
			{ labelKey: 'symptom_group.cognitive_emotional', rationaleKey: 'condition.chronic_pain.rationale_cognitive', items: ['symptom.brain_fog', 'symptom.catastrophizing', 'symptom.anxious'] },
		],
		episodesKey: 'condition.chronic_pain.episodes_rationale',
		triggersKey: 'condition.chronic_pain.triggers_rationale',
		vitalsKey: 'condition.chronic_pain.vitals_rationale',
		scales: [
			{ nameKey: 'condition.scale.bpi', descriptionKey: 'condition.scale.bpi_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/1303505/' },
			{ nameKey: 'condition.scale.mcgill', descriptionKey: 'condition.scale.mcgill_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/1235985/' },
		],
		forDoctorKey: 'condition.chronic_pain.for_doctor',
		relatedConditions: ['endometriosis', 'anxiety_depression', 'migraine'],
	},

	asthma: {
		id: 'asthma',
		icon: 'wind',
		color: '#0EA5E9',
		titleKey: 'condition.asthma.title',
		subtitleKey: 'condition.asthma.subtitle',
		introKey: 'condition.asthma.intro',
		symptomGroups: [
			{ labelKey: 'symptom_group.respiratory', rationaleKey: 'condition.asthma.rationale_respiratory', items: ['symptom.wheezing', 'symptom.shortness_of_breath', 'symptom.chest_tightness', 'symptom.persistent_cough'] },
			{ labelKey: 'symptom_group.activity', rationaleKey: 'condition.asthma.rationale_activity', items: ['symptom.limited_activity', 'symptom.exercise_intolerant', 'symptom.nocturnal_waking'] },
		],
		episodesKey: 'condition.asthma.episodes_rationale',
		triggersKey: 'condition.asthma.triggers_rationale',
		vitalsKey: 'condition.asthma.vitals_rationale',
		scales: [
			{ nameKey: 'condition.scale.act', descriptionKey: 'condition.scale.act_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/14680078/' },
			{ nameKey: 'condition.scale.gina', descriptionKey: 'condition.scale.gina_desc', url: 'https://ginasthma.org/' },
		],
		forDoctorKey: 'condition.asthma.for_doctor',
		relatedConditions: ['anxiety_depression', 'hypertension'],
	},

	hypertension: {
		id: 'hypertension',
		icon: 'heart-pulse',
		color: '#DC2626',
		titleKey: 'condition.hypertension.title',
		subtitleKey: 'condition.hypertension.subtitle',
		introKey: 'condition.hypertension.intro',
		symptomGroups: [
			{ labelKey: 'symptom_group.headache_signs', rationaleKey: 'condition.hypertension.rationale_headache', items: ['symptom.headache', 'symptom.dizzy', 'symptom.blurred_vision', 'symptom.nosebleed'] },
			{ labelKey: 'symptom_group.general', rationaleKey: 'condition.hypertension.rationale_general', items: ['symptom.tired', 'symptom.shortness_of_breath', 'symptom.chest_tightness'] },
			{ labelKey: 'symptom_group.sleep', rationaleKey: 'condition.hypertension.rationale_sleep', items: ['symptom.slept_badly'] },
		],
		episodesKey: 'condition.hypertension.episodes_rationale',
		triggersKey: 'condition.hypertension.triggers_rationale',
		vitalsKey: 'condition.hypertension.vitals_rationale',
		scales: [],
		forDoctorKey: 'condition.hypertension.for_doctor',
		relatedConditions: ['diabetes', 'chronic_pain'],
	},

	long_covid: {
		id: 'long_covid',
		icon: 'shield-plus',
		color: '#7C3AED',
		titleKey: 'condition.long_covid.title',
		subtitleKey: 'condition.long_covid.subtitle',
		introKey: 'condition.long_covid.intro',
		symptomGroups: [
			{ labelKey: 'symptom_group.fatigue', rationaleKey: 'condition.long_covid.rationale_fatigue', items: ['symptom.pem', 'symptom.tired', 'symptom.post_exertional_crash', 'symptom.brain_fog'] },
			{ labelKey: 'symptom_group.cognitive', rationaleKey: 'condition.long_covid.rationale_cognitive', items: ['symptom.concentration_loss', 'symptom.forgetful', 'symptom.word_finding_issues'] },
			{ labelKey: 'symptom_group.autonomic', rationaleKey: 'condition.long_covid.rationale_autonomic', items: ['symptom.pots_symptoms', 'symptom.palpitations', 'symptom.dizzy', 'symptom.temperature_dysregulation'] },
			{ labelKey: 'symptom_group.pain', rationaleKey: 'condition.long_covid.rationale_pain', items: ['symptom.muscle_pain', 'symptom.joint_pain', 'symptom.headache', 'symptom.sore_throat'] },
		],
		episodesKey: 'condition.long_covid.episodes_rationale',
		triggersKey: 'condition.long_covid.triggers_rationale',
		vitalsKey: 'condition.long_covid.vitals_rationale',
		scales: [],
		forDoctorKey: 'condition.long_covid.for_doctor',
		relatedConditions: ['chronic_pain', 'anxiety_depression'],
	},

	menopause: {
		id: 'menopause',
		icon: 'scan',
		color: '#DB2777',
		titleKey: 'condition.menopause.title',
		subtitleKey: 'condition.menopause.subtitle',
		introKey: 'condition.menopause.intro',
		symptomGroups: [
			{ labelKey: 'symptom_group.vasomotor', rationaleKey: 'condition.menopause.rationale_vasomotor', items: ['symptom.hot_flashes', 'symptom.night_sweats', 'symptom.chills'] },
			{ labelKey: 'symptom_group.mood', rationaleKey: 'condition.menopause.rationale_mood', items: ['symptom.irritable', 'symptom.anxious', 'symptom.mood_swings', 'symptom.low_mood', 'symptom.tearful'] },
			{ labelKey: 'symptom_group.cognitive', rationaleKey: 'condition.menopause.rationale_cognitive', items: ['symptom.brain_fog', 'symptom.forgetful', 'symptom.concentration_loss'] },
			{ labelKey: 'symptom_group.sleep', rationaleKey: 'condition.menopause.rationale_sleep', items: ['symptom.slept_badly', 'symptom.wake_frequent', 'symptom.insomnia'] },
			{ labelKey: 'symptom_group.physical', rationaleKey: 'condition.menopause.rationale_physical', items: ['symptom.joint_pain', 'symptom.headache', 'symptom.libido_change', 'symptom.vaginal_dryness', 'symptom.bloating'] },
		],
		episodesKey: 'condition.menopause.episodes_rationale',
		triggersKey: 'condition.menopause.triggers_rationale',
		vitalsKey: 'condition.menopause.vitals_rationale',
		scales: [],
		forDoctorKey: 'condition.menopause.for_doctor',
		relatedConditions: ['endometriosis', 'anxiety_depression'],
	},

	ibs: {
		id: 'ibs',
		icon: 'shield',
		color: '#D97706',
		titleKey: 'condition.ibs.title',
		subtitleKey: 'condition.ibs.subtitle',
		introKey: 'condition.ibs.intro',
		symptomGroups: [
			{ labelKey: 'symptom_group.abdominal', rationaleKey: 'condition.ibs.rationale_abdominal', items: ['symptom.abdominal_pain', 'symptom.cramping', 'symptom.bloating', 'symptom.nausea'] },
			{ labelKey: 'symptom_group.bowel', rationaleKey: 'condition.ibs.rationale_bowel', items: ['symptom.diarrhea', 'symptom.constipation', 'symptom.urgency'] },
		],
		episodesKey: 'condition.ibs.episodes_rationale',
		triggersKey: 'condition.ibs.triggers_rationale',
		vitalsKey: 'condition.ibs.vitals_rationale',
		scales: [
			{ nameKey: 'condition.scale.ibs_sss', descriptionKey: 'condition.scale.ibs_sss_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/9179840/' },
			{ nameKey: 'condition.scale.bristol', descriptionKey: 'condition.scale.bristol_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/9299672/' },
		],
		forDoctorKey: 'condition.ibs.for_doctor',
		relatedConditions: ['endometriosis', 'anxiety_depression'],
	},

	endometriosis: {
		id: 'endometriosis',
		icon: 'flower',
		color: '#E11D48',
		titleKey: 'condition.endometriosis.title',
		subtitleKey: 'condition.endometriosis.subtitle',
		introKey: 'condition.endometriosis.intro',
		symptomGroups: [
			{ labelKey: 'symptom_group.pelvic_pain', rationaleKey: 'condition.endometriosis.rationale_pelvic', items: ['symptom.dysmenorrhea', 'symptom.chronic_pelvic_pain', 'symptom.dyspareunia', 'symptom.ovulation_pain'] },
			{ labelKey: 'symptom_group.gi_symptoms', rationaleKey: 'condition.endometriosis.rationale_gi', items: ['symptom.bloating', 'symptom.nausea', 'symptom.painful_bowel'] },
		],
		episodesKey: 'condition.endometriosis.episodes_rationale',
		triggersKey: 'condition.endometriosis.triggers_rationale',
		vitalsKey: 'condition.endometriosis.vitals_rationale',
		scales: [
			{ nameKey: 'condition.scale.ehp30', descriptionKey: 'condition.scale.ehp30_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/11438785/' },
			{ nameKey: 'condition.scale.bb', descriptionKey: 'condition.scale.bb_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/6310710/' },
		],
		forDoctorKey: 'condition.endometriosis.for_doctor',
		relatedConditions: ['chronic_pain', 'ibs', 'anxiety_depression'],
	},

	bipolar: {
		id: 'bipolar',
		icon: 'activity',
		color: '#A855F7',
		titleKey: 'condition.bipolar.title',
		subtitleKey: 'condition.bipolar.subtitle',
		introKey: 'condition.bipolar.intro',
		symptomGroups: [
			{ labelKey: 'symptom_group.mania', rationaleKey: 'condition.bipolar.rationale_mania', items: ['symptom.elevated_mood', 'symptom.grandiosity', 'symptom.pressured_speech', 'symptom.racing_thoughts', 'symptom.reduced_sleep_need', 'symptom.risk_taking'] },
			{ labelKey: 'symptom_group.depression', rationaleKey: 'condition.bipolar.rationale_depression', items: ['symptom.depressed_mood', 'symptom.anhedonia', 'symptom.hopelessness', 'symptom.tired', 'symptom.guilt', 'symptom.psychomotor_slowing'] },
			{ labelKey: 'symptom_group.mixed_state', rationaleKey: 'condition.bipolar.rationale_mixed', items: ['symptom.irritable', 'symptom.anxious', 'symptom.agitated', 'symptom.restless'] },
			{ labelKey: 'symptom_group.sleep', rationaleKey: 'condition.bipolar.rationale_sleep', items: ['symptom.insomnia', 'symptom.hypersomnia', 'symptom.slept_badly'] },
		],
		episodesKey: 'condition.bipolar.episodes_rationale',
		triggersKey: 'condition.bipolar.triggers_rationale',
		vitalsKey: 'condition.bipolar.vitals_rationale',
		scales: [
			{ nameKey: 'condition.scale.ymrs', descriptionKey: 'condition.scale.ymrs_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/728692/' },
			{ nameKey: 'condition.scale.mdq', descriptionKey: 'condition.scale.mdq_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/11058483/' },
		],
		forDoctorKey: 'condition.bipolar.for_doctor',
		relatedConditions: ['anxiety_depression', 'adhd'],
	},

	glaucoma: {
		id: 'glaucoma',
		icon: 'eye',
		color: '#0891B2',
		titleKey: 'condition.glaucoma.title',
		subtitleKey: 'condition.glaucoma.subtitle',
		introKey: 'condition.glaucoma.intro',
		symptomGroups: [
			{ labelKey: 'symptom_group.vision', rationaleKey: 'condition.glaucoma.rationale_vision', items: ['symptom.blurred_vision', 'symptom.halos_around_lights', 'symptom.tunnel_vision', 'symptom.reduced_contrast'] },
			{ labelKey: 'symptom_group.pressure_pain', rationaleKey: 'condition.glaucoma.rationale_pressure', items: ['symptom.eye_pain', 'symptom.brow_ache', 'symptom.headache', 'symptom.eye_redness'] },
			{ labelKey: 'symptom_group.systemic', rationaleKey: 'condition.glaucoma.rationale_systemic', items: ['symptom.nausea', 'symptom.dizzy'] },
		],
		episodesKey: 'condition.glaucoma.episodes_rationale',
		triggersKey: 'condition.glaucoma.triggers_rationale',
		vitalsKey: 'condition.glaucoma.vitals_rationale',
		scales: [
			{ nameKey: 'condition.scale.vfq25', descriptionKey: 'condition.scale.vfq25_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/9633743/' },
		],
		forDoctorKey: 'condition.glaucoma.for_doctor',
		relatedConditions: ['hypertension', 'diabetes'],
	},

	parkinson: {
		id: 'parkinson',
		icon: 'waves',
		color: '#4F46E5',
		titleKey: 'condition.parkinson.title',
		subtitleKey: 'condition.parkinson.subtitle',
		introKey: 'condition.parkinson.intro',
		symptomGroups: [
			{ labelKey: 'symptom_group.motor', rationaleKey: 'condition.parkinson.rationale_motor', items: ['symptom.resting_tremor', 'symptom.rigidity', 'symptom.bradykinesia', 'symptom.postural_instability', 'symptom.shuffling_gait'] },
			{ labelKey: 'symptom_group.movement_complications', rationaleKey: 'condition.parkinson.rationale_movement', items: ['symptom.dyskinesia', 'symptom.dystonia', 'symptom.freezing_of_gait'] },
			{ labelKey: 'symptom_group.non_motor', rationaleKey: 'condition.parkinson.rationale_non_motor', items: ['symptom.depressed_mood', 'symptom.anxious', 'symptom.tired', 'symptom.rem_sleep_behavior', 'symptom.constipation', 'symptom.drooling', 'symptom.hypomimia', 'symptom.dysphagia'] },
			{ labelKey: 'symptom_group.cognitive', rationaleKey: 'condition.parkinson.rationale_cognitive', items: ['symptom.brain_fog', 'symptom.forgetful', 'symptom.slow_processing'] },
		],
		episodesKey: 'condition.parkinson.episodes_rationale',
		triggersKey: 'condition.parkinson.triggers_rationale',
		vitalsKey: 'condition.parkinson.vitals_rationale',
		scales: [
			{ nameKey: 'condition.scale.updrs', descriptionKey: 'condition.scale.updrs_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/18344392/' },
			{ nameKey: 'condition.scale.hoehn_yahr', descriptionKey: 'condition.scale.hoehn_yahr_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/6067254/' },
		],
		forDoctorKey: 'condition.parkinson.for_doctor',
		relatedConditions: ['ms', 'anxiety_depression'],
	},

	ibd: {
		id: 'ibd',
		icon: 'donut',
		color: '#EA580C',
		titleKey: 'condition.ibd.title',
		subtitleKey: 'condition.ibd.subtitle',
		introKey: 'condition.ibd.intro',
		symptomGroups: [
			{ labelKey: 'symptom_group.bowel', rationaleKey: 'condition.ibd.rationale_bowel', items: ['symptom.diarrhea', 'symptom.bloody_stool', 'symptom.mucus_stool', 'symptom.urgency', 'symptom.incomplete_evacuation', 'symptom.abdominal_pain', 'symptom.cramping'] },
			{ labelKey: 'symptom_group.systemic', rationaleKey: 'condition.ibd.rationale_systemic', items: ['symptom.fever', 'symptom.tired', 'symptom.weight_loss'] },
			{ labelKey: 'symptom_group.extraintestinal', rationaleKey: 'condition.ibd.rationale_extraintestinal', items: ['symptom.joint_pain', 'symptom.mouth_ulcers', 'symptom.skin_lesions', 'symptom.eye_inflammation'] },
		],
		episodesKey: 'condition.ibd.episodes_rationale',
		triggersKey: 'condition.ibd.triggers_rationale',
		vitalsKey: 'condition.ibd.vitals_rationale',
		scales: [
			{ nameKey: 'condition.scale.cdai', descriptionKey: 'condition.scale.cdai_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/773473/' },
			{ nameKey: 'condition.scale.mayo_score', descriptionKey: 'condition.scale.mayo_score_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/3317057/' },
			{ nameKey: 'condition.scale.hbi', descriptionKey: 'condition.scale.hbi_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/2494724/' },
		],
		forDoctorKey: 'condition.ibd.for_doctor',
		relatedConditions: ['ibs', 'chronic_pain'],
	},
};

export const conditionIds = Object.keys(conditionInfoMap);
