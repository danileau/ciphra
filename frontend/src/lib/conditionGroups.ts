/**
 * Groupings for the /conditions overview.
 *
 * A condition may only belong to one group — groups are mutually exclusive so
 * the overview doesn't duplicate cards. If a condition straddles domains
 * (e.g. endometriosis is pain + women's health), pick the primary audience.
 */

export interface ConditionGroup {
	id: string;
	titleKey: string;
	descriptionKey: string;
	conditionIds: string[];
}

export const conditionGroups: ConditionGroup[] = [
	{
		id: 'neurological',
		titleKey: 'condition_group.neurological.title',
		descriptionKey: 'condition_group.neurological.description',
		conditionIds: ['epilepsy', 'migraine', 'ms', 'parkinson'],
	},
	{
		id: 'mental_health',
		titleKey: 'condition_group.mental_health.title',
		descriptionKey: 'condition_group.mental_health.description',
		conditionIds: ['adhd', 'burnout', 'anxiety_depression', 'bipolar'],
	},
	{
		id: 'cardio_metabolic',
		titleKey: 'condition_group.cardio_metabolic.title',
		descriptionKey: 'condition_group.cardio_metabolic.description',
		conditionIds: ['diabetes', 'hypertension'],
	},
	{
		id: 'respiratory',
		titleKey: 'condition_group.respiratory.title',
		descriptionKey: 'condition_group.respiratory.description',
		conditionIds: ['asthma'],
	},
	{
		id: 'pain_digestive',
		titleKey: 'condition_group.pain_digestive.title',
		descriptionKey: 'condition_group.pain_digestive.description',
		conditionIds: ['chronic_pain', 'ibs', 'ibd'],
	},
	{
		id: 'womens_health',
		titleKey: 'condition_group.womens_health.title',
		descriptionKey: 'condition_group.womens_health.description',
		conditionIds: ['endometriosis', 'menopause', 'pcos'],
	},
	{
		id: 'vision',
		titleKey: 'condition_group.vision.title',
		descriptionKey: 'condition_group.vision.description',
		conditionIds: ['glaucoma'],
	},
	{
		id: 'systemic',
		titleKey: 'condition_group.systemic.title',
		descriptionKey: 'condition_group.systemic.description',
		conditionIds: ['long_covid'],
	},
];
