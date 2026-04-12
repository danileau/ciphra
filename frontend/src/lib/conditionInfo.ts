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
				items: ['symptom.slept_well', 'symptom.slept_badly'],
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
		relatedConditions: ['autism', 'anxiety_depression', 'burnout'],
	},

	autism: {
		id: 'autism',
		icon: 'ear',
		color: '#0EA5E9',
		titleKey: 'condition.autism.title',
		subtitleKey: 'condition.autism.subtitle',
		introKey: 'condition.autism.intro',
		symptomGroups: [
			{ labelKey: 'symptom_group.sensory', rationaleKey: 'condition.autism.rationale_sensory', items: ['symptom.sensory_overload', 'symptom.light_sensitive', 'symptom.sound_sensitive', 'symptom.texture_aversion'] },
			{ labelKey: 'symptom_group.executive', rationaleKey: 'condition.autism.rationale_executive', items: ['symptom.task_paralysis', 'symptom.difficulty_switching', 'symptom.time_blindness'] },
			{ labelKey: 'symptom_group.masking', rationaleKey: 'condition.autism.rationale_masking', items: ['symptom.masking_heavy', 'symptom.social_exhaustion', 'symptom.difficulty_communicating'] },
			{ labelKey: 'symptom_group.regulation', rationaleKey: 'condition.autism.rationale_regulation', items: ['symptom.overwhelmed', 'symptom.need_to_stim', 'symptom.emotional_flooding'] },
		],
		episodesKey: 'condition.autism.episodes_rationale',
		triggersKey: 'condition.autism.triggers_rationale',
		vitalsKey: 'condition.autism.vitals_rationale',
		scales: [
			{ nameKey: 'condition.scale.cat_q', descriptionKey: 'condition.scale.cat_q_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/30768734/' },
		],
		forDoctorKey: 'condition.autism.for_doctor',
		relatedConditions: ['adhd', 'anxiety_depression', 'burnout'],
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
			{ labelKey: 'symptom_group.sleep', rationaleKey: 'condition.burnout.rationale_sleep', items: ['symptom.slept_well', 'symptom.slept_badly', 'symptom.insomnia'] },
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
		relatedConditions: ['burnout', 'chronic_pain', 'autism'],
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
		relatedConditions: ['cardiovascular', 'anxiety_depression'],
	},

	cardiovascular: {
		id: 'cardiovascular',
		icon: 'heart-pulse',
		color: '#DC2626',
		titleKey: 'condition.cardiovascular.title',
		subtitleKey: 'condition.cardiovascular.subtitle',
		introKey: 'condition.cardiovascular.intro',
		symptomGroups: [
			{ labelKey: 'symptom_group.cardiac', rationaleKey: 'condition.cardiovascular.rationale_cardiac', items: ['symptom.palpitations', 'symptom.chest_pain', 'symptom.irregular_heartbeat'] },
			{ labelKey: 'symptom_group.circulation', rationaleKey: 'condition.cardiovascular.rationale_circulation', items: ['symptom.leg_swelling', 'symptom.ankle_edema', 'symptom.dizzy'] },
			{ labelKey: 'symptom_group.respiratory', rationaleKey: 'condition.cardiovascular.rationale_respiratory', items: ['symptom.dyspnea', 'symptom.orthopnea'] },
		],
		episodesKey: 'condition.cardiovascular.episodes_rationale',
		triggersKey: 'condition.cardiovascular.triggers_rationale',
		vitalsKey: 'condition.cardiovascular.vitals_rationale',
		scales: [
			{ nameKey: 'condition.scale.nyha', descriptionKey: 'condition.scale.nyha_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/7607439/' },
			{ nameKey: 'condition.scale.kccq', descriptionKey: 'condition.scale.kccq_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/10636124/' },
		],
		forDoctorKey: 'condition.cardiovascular.for_doctor',
		relatedConditions: ['diabetes', 'asthma'],
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

	cancer_treatment: {
		id: 'cancer_treatment',
		icon: 'shield-plus',
		color: '#059669',
		titleKey: 'condition.cancer_treatment.title',
		subtitleKey: 'condition.cancer_treatment.subtitle',
		introKey: 'condition.cancer_treatment.intro',
		symptomGroups: [
			{ labelKey: 'symptom_group.gi', rationaleKey: 'condition.cancer_treatment.rationale_gi', items: ['symptom.nausea', 'symptom.vomiting', 'symptom.appetite_loss', 'symptom.mouth_sores'] },
			{ labelKey: 'symptom_group.fatigue', rationaleKey: 'condition.cancer_treatment.rationale_fatigue', items: ['symptom.tired', 'symptom.exhausted', 'symptom.weakness'] },
			{ labelKey: 'symptom_group.neuro', rationaleKey: 'condition.cancer_treatment.rationale_neuro', items: ['symptom.tingling_hands', 'symptom.tingling_feet', 'symptom.numbness', 'symptom.brain_fog'] },
		],
		episodesKey: 'condition.cancer_treatment.episodes_rationale',
		triggersKey: 'condition.cancer_treatment.triggers_rationale',
		vitalsKey: 'condition.cancer_treatment.vitals_rationale',
		scales: [
			{ nameKey: 'condition.scale.esas', descriptionKey: 'condition.scale.esas_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/1718754/' },
			{ nameKey: 'condition.scale.pro_ctcae', descriptionKey: 'condition.scale.pro_ctcae_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/25265940/' },
		],
		forDoctorKey: 'condition.cancer_treatment.for_doctor',
		relatedConditions: ['chronic_pain', 'anxiety_depression'],
	},

	dermatology: {
		id: 'dermatology',
		icon: 'scan',
		color: '#F43F5E',
		titleKey: 'condition.dermatology.title',
		subtitleKey: 'condition.dermatology.subtitle',
		introKey: 'condition.dermatology.intro',
		symptomGroups: [
			{ labelKey: 'symptom_group.skin_symptoms', rationaleKey: 'condition.dermatology.rationale_skin', items: ['symptom.itching', 'symptom.burning', 'symptom.dry_skin', 'symptom.redness', 'symptom.scaling'] },
			{ labelKey: 'symptom_group.quality_of_life', rationaleKey: 'condition.dermatology.rationale_qol', items: ['symptom.sleep_disrupted', 'symptom.self_conscious', 'symptom.social_avoidance'] },
		],
		episodesKey: 'condition.dermatology.episodes_rationale',
		triggersKey: 'condition.dermatology.triggers_rationale',
		vitalsKey: 'condition.dermatology.vitals_rationale',
		scales: [
			{ nameKey: 'condition.scale.pasi', descriptionKey: 'condition.scale.pasi_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/13525782/' },
			{ nameKey: 'condition.scale.dlqi', descriptionKey: 'condition.scale.dlqi_desc', url: 'https://pubmed.ncbi.nlm.nih.gov/7887163/' },
		],
		forDoctorKey: 'condition.dermatology.for_doctor',
		relatedConditions: ['chronic_pain', 'anxiety_depression'],
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
};

export const conditionIds = Object.keys(conditionInfoMap);
