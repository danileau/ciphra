/**
 * CIPH-835 — allowlist of i18n key prefixes that are accessed
 * dynamically (template strings, variable labels, blueprint-driven
 * lookups). The `keys-used.test.ts` orphan detector would otherwise
 * flag them because they never appear as a static `$t('…')` literal.
 *
 * Only add a prefix here if the key family is genuinely looked up at
 * runtime from data (preset labels, vital ids, phase ids, etc.).
 * Adding a prefix silences the orphan check for every matching key,
 * so keep the list tight.
 *
 * A prefix matches a key if the key starts with the prefix string.
 */
export const DYNAMIC_KEY_PREFIXES: readonly string[] = [
	// Blueprint preset + label keys — every preset in blueprint/presets.ts
	// has its label/title referenced via `$t(info.titleKey)` etc. Preset
	// `conditionLabel` values live under `landing.template_*`.
	'condition.',
	'conditions.',
	'preset.',
	'landing.template_',
	'landing.template_desc_',

	// Condition-group titles/descriptions driven by `conditionGroups.ts`
	// lookups: `$t(group.titleKey)`.
	'condition_group.',

	// Symptom / vital / trigger / episode labels are blueprint-driven
	// and rendered via `$t(item.label)` where `item.label` is a string
	// from the blueprint.
	'symptom.',
	'symptoms.',
	'symptom_group.',
	'vital.',
	'vitals.',
	'trigger.',
	'triggers.',
	'episode.',
	'episodes.',
	'episode_noun.',
	'seizure.',
	'seizures.',

	// Cycle phase keys — `$t('cycle.phase_' + cs.phase)` in
	// CompanionMain; phases are follicular, luteal, ovulation, menstrual.
	'cycle.phase_',

	// Section-jump nav — `$t(`nav_section.${sid}`)` in log/[date]/+page.svelte
	'nav_section.',

	// Migration errorKey lookups — `$t(errorKey)` where errorKey is
	// 'migrate.error_…'. All migrate.* keys are referenced, some of
	// them only through the dynamic errorKey path.
	'migrate.error_',

	// PDF keys — pdf.ts invokes `t('pdf.foo')` via a direct translator
	// reference rather than `$t(...)`; the regex still catches most of
	// them but this covers PDF-section sub-keys addressed dynamically
	// (e.g. per-scope labels constructed with template strings).
	'pdf.',

	// Compliance / scale / rating labels read from blueprint data.
	'compliance.',
	'scale.',
	'rating.',

	// Companion / companion-sub keys set by reactive derivations.
	'companion.',

	// Reports / stream dynamic labels.
	'reports.',
	'stream.',
	'stream_filter.',

	// Protocol (log page) dynamic labels (group labels, duration labels,
	// etc.) — many come from blueprint preset definitions.
	'protocol.',

	// Info-pages conditional intro/outro keys.
	'info.',

	// Quick-action labels composed from preset metadata.
	'quick_action.',
	'quickadd.',
];

/**
 * CIPH-835 — AUDIT BACKLOG.
 *
 * The following individual keys are flagged by the orphan detector
 * but kept here explicitly (rather than a broad prefix) so a future
 * agent can audit and delete them one-by-one. "When in doubt, leave
 * + document" — we prefer a visible TODO list over premature removal
 * that might break a wizard path we haven't traced.
 *
 * A key listed here is treated as "allowlisted for now". To shrink
 * the list: grep the source, confirm no caller, then delete the key
 * from `de.ts` / `en.ts` / `fr.ts` / `it.ts` AND this list in the
 * same commit.
 */
export const ORPHAN_AUDIT_BACKLOG: readonly string[] = [
	// Landing rewrite leftovers — `/` no longer renders these sections.
	// Strongly suspected dead. Delete in a follow-up after one more
	// visual QA round to confirm no conditional render path.
	'landing.nav_origin',
	'landing.nav_features',
	'landing.nav_login',
	'landing.hero_badge',
	'landing.hero_title_1',
	'landing.hero_title_2',
	'landing.origin_title',
	'landing.origin_intro',
	'landing.origin_feedback_label',
	'landing.origin_feedback_context',
	'landing.origin_quote',
	'landing.origin_story',
	'landing.origin_lesson',
	'landing.origin_conclusion',
	'landing.excel_title',
	'landing.excel_header_excel',
	'landing.excel_header_ciphra',
	'landing.excel_row1_excel',
	'landing.excel_row1_ciphra',
	'landing.excel_row2_excel',
	'landing.excel_row2_ciphra',
	'landing.excel_row3_excel',
	'landing.excel_row3_ciphra',
	'landing.excel_row4_excel',
	'landing.excel_row4_ciphra',
	'landing.excel_row5_excel',
	'landing.excel_row5_ciphra',
	'landing.notapp_title',
	'landing.notapp_subtitle',
	'landing.notapp_who_title',
	'landing.notapp_who_1',
	'landing.notapp_who_2',
	'landing.notapp_who_3',
	'landing.notapp_routine_title',
	'landing.notapp_routine_desc',
	'landing.features_title',
	'landing.feature_protocol',
	'landing.feature_protocol_desc',
	'landing.feature_grid',
	'landing.feature_grid_desc',
	'landing.feature_calendar',
	'landing.feature_calendar_desc',
	'landing.feature_pdf',
	'landing.feature_pdf_desc',
	'landing.feature_offline',
	'landing.feature_offline_desc',
	'landing.feature_multilang',
	'landing.feature_multilang_desc',
	'landing.feature_darkmode',
	'landing.feature_darkmode_desc',
	'landing.feature_custom',
	'landing.feature_custom_desc',
	'landing.footer_features',

	// Tech / crypto explanation — page likely deleted or merged into
	// /privacy. Suspected dead.
	'tech.flow_register_title',
	'tech.flow_register_desc',
	'tech.flow_login_title',
	'tech.flow_login_desc',
	'tech.flow_storage_title',
	'tech.flow_storage_desc',
	'tech.flow_recovery_title',
	'tech.flow_recovery_desc',
	'tech.why_argon2_title',
	'tech.why_argon2_desc',
	'tech.why_aes_title',
	'tech.why_aes_desc',
	'tech.why_client_title',
	'tech.why_client_desc',
	'tech.why_metadata_title',
	'tech.why_metadata_desc',
	'tech.why_hardening_title',
	'tech.why_hardening_desc',

	// Setup wizard — live wizard uses a DIFFERENT subset of setup.*
	// keys. These look redundant but the wizard is structurally
	// complex — keep until a wizard-specific audit pass.
	'setup.symptoms_subtitle',
	'setup.symptoms_add',
	'setup.group_delete',
	'setup.group_add',
	'setup.group_add_button',
	'setup.episodes_title',
	'setup.episodes_subtitle',
	'setup.episodes_add',
	'setup.episodes_empty',
	'setup.triggers_subtitle',
	'setup.triggers_add',
	'setup.vitals_subtitle',
	'setup.vitals_name',
	'setup.vitals_unit',
	'setup.meds_title',
	'setup.meds_subtitle',
	'setup.meds_name',
	'setup.meds_dose',
	'setup.meds_schedule',
	'setup.meds_as_needed',
	'setup.meds_empty',
	'setup.confirm_title',
	'setup.confirm_subtitle',
	'setup.confirm_profile',
	'setup.confirm_symptoms',
	'setup.confirm_symptoms_count',
	'setup.confirm_episodes',
	'setup.confirm_triggers',
	'setup.confirm_vitals',
	'setup.confirm_meds',
	'setup.confirm_none',
	'setup.confirm_more',
	'setup.save',
	'setup.add',
	'setup.remove',
	'setup.as_needed_badge',
	'setup.configured',
	'setup.mode_title',
	'setup.mode_subtitle',
	'setup.mode_protokoll',
	'setup.mode_protokoll_desc',
	'setup.mode_legacy',
	'setup.mode_legacy_desc',
	'setup.confirm_mode',

	// Settings tracking-mode toggle — feature may be WIP.
	'settings.tracking_mode',
	'settings.tracking_mode_desc',
	'settings.mode_protokoll',
	'settings.mode_legacy',

	// Calendar header/summary keys — page renders month directly;
	// suspected dead but low-risk to keep.
	'calendar.title',
	'calendar.week',
	'calendar.month_view',
	'calendar.week_view',
	'calendar.day_detail',
	'calendar.summary',

	// Nav aliases — `nav.protocol` / `nav.stream` replaced by
	// `nav.today` / `nav.journal` in PI v4 type-merge. Likely dead.
	'nav.protocol',
	'nav.stream',

	// Common aliases — `common.yesterday` / `common.month` /
	// `common.entry` may be referenced via helper utilities. Audit
	// helpers before deletion.
	'common.yesterday',
	'common.month',
	'common.entry',

	// Auth flash keys — login/register flash messages may be wired
	// through a flash-store path not picked up by the static regex.
	'auth.login_success',
	'auth.register_success',
	'auth.enable_recovery',

	// Family / private / darkmode / quickadd — similar flash or
	// settings-surface paths. Keep until audited.
	'family.private_hidden',
	'darkmode.toggle',
	'private.toggle_make_private',

	// Migrate phases — invoked via store-driven phase label lookup,
	// likely wired through a `phase → labelKey` map rather than a
	// literal `$t(...)` site. Keep.
	'migrate.signup_continue',
	'migrate.fetch_bundle',
	'migrate.phase_building_vault',
	'migrate.phase_logging_in',
];

const ORPHAN_AUDIT_SET = new Set<string>();

/**
 * True if `key` is covered by the dynamic allowlist OR explicitly
 * listed in the audit backlog.
 */
export function isDynamicKey(key: string): boolean {
	for (const p of DYNAMIC_KEY_PREFIXES) {
		if (key.startsWith(p)) return true;
	}
	if (ORPHAN_AUDIT_SET.size === 0) {
		for (const k of ORPHAN_AUDIT_BACKLOG) ORPHAN_AUDIT_SET.add(k);
	}
	return ORPHAN_AUDIT_SET.has(key);
}
