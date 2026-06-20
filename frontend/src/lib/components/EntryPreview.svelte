<script lang="ts">
	/**
	 * EntryPreview — read-only render of a CiphraDocument.
	 *
	 * Extracted from Companion / Journal / Calendar (CIPH-415) to consolidate
	 * the chip-rich entry layout that was duplicated three times. Action
	 * buttons (edit/delete) intentionally stay on each parent because their
	 * handlers are page-specific.
	 *
	 * CIPH-410..414: vitals split into paired-cards / lab-pills / daily-mean
	 * line; chips collapsible when dense; ranked by 30-day frequency; single-
	 * axis pill style with left-edge severity stripe.
	 */
	import { t, locale, translateUnit, plural } from '$lib/i18n';
	import type { CiphraDocument } from '$lib/stores/documents';
	import type { Blueprint, VitalField } from '$lib/blueprint/types';
	import { isCustomItem, prettifyCustomId, resolveMedDisplay } from '$lib/blueprint';

	export let entry: CiphraDocument;
	export let bp: Blueprint | null = null;
	export let showDate: boolean = true;
	export let compact: boolean = false;
	/** CIPH-901a — when true, suppress the leading type-label
	 *  ("Eintrag" / "Notiz" / "Tagebuch"). Used in surfaces where the
	 *  parent already carries type via a colored left rail (calendar
	 *  day-detail panel, future journal redesign), so the type isn't
	 *  signalled twice. The day-summary chips below carry the content. */
	export let hideType: boolean = false;
	/** CIPH-911b — when true, ALWAYS suppress multiDay episode chips
	 *  regardless of other content. Set when this card is rendered
	 *  inside a journal closed-phase streak group: the streak header
	 *  ("Gemischte Episode · 4 Tage") + the bracket carry the phase
	 *  identity, so a "1× Gemischte Episode" chip on each day inside
	 *  the bracket is redundant. The card may end up empty for days
	 *  with only the multiDay logged — that's acceptable here because
	 *  the streak bracket is the meaningful chrome. */
	export let inStreak: boolean = false;
	/** Optional. Used to rank chips by frequency over the past 30 days
	 *  (CIPH-413). When omitted, chips render in source order. */
	export let recentDocs: CiphraDocument[] | undefined = undefined;

	// Positive markers (slept_well) aren't symptoms — suppress them from
	// the chip strip. Legacy stored blueprints still list them, so we filter
	// at render time rather than at preset time.
	const POSITIVE_MARKERS = new Set(['slept_well']);

	function symptomLabelFor(id: string): string {
		for (const g of bp?.symptomGroups || []) {
			const it = g.items.find(x => x.id === id);
			if (it) return isCustomItem(it.id) ? it.label : $t(it.label);
		}
		return prettifyCustomId(id);
	}
	function triggerLabelFor(id: string): string {
		const tr = (bp?.triggers || []).find(x => x.id === id);
		if (!tr) return prettifyCustomId(id);
		return isCustomItem(tr.id) ? tr.label : $t(tr.label);
	}
	function epLabelFor(id: string): string {
		const ep = (bp?.episodeTypes || []).find(e => e.id === id);
		if (!ep) return prettifyCustomId(id);
		return isCustomItem(ep.id) ? ep.label : $t(ep.label);
	}
	function vitalFor(id: string) {
		return (bp?.vitals || []).find(v => v.id === id);
	}

	// Multi-entry vitals (glaucoma IOP, hypertension BP) are stored as
	// JSON-encoded arrays of {time, value}. Returns the parsed entries
	// (or [{time:'', value:s}] for plain scalars) so callers can render
	// timed-value pairs without re-parsing.
	function parseVitalEntries(raw: unknown): { time: string; value: string }[] {
		if (raw == null) return [];
		const s = String(raw).trim();
		if (!s) return [];
		if (s.startsWith('[')) {
			try {
				const arr = JSON.parse(s);
				if (Array.isArray(arr)) {
					return arr
						.map((e: { time?: string; value?: string }) => ({
							time: e?.time ?? '',
							value: e?.value ?? '',
						}))
						.filter(e => String(e.value) !== '');
				}
			} catch { /* fall through */ }
		}
		return [{ time: '', value: s }];
	}

	function formatVitalValue(raw: unknown): string {
		const entries = parseVitalEntries(raw);
		return entries
			.map(e => (e.time ? `${e.time} ${e.value}` : String(e.value)))
			.filter(Boolean)
			.join(' · ');
	}

	// CIPH-414: merge a paired vital (e.g. systolic + diastolic) into one
	// "08:00 132/82 · 20:00 128/79" line. When times don't line up between
	// the two members we fall back to listing each separately.
	function formatPairedVitals(aRaw: unknown, bRaw: unknown): string {
		const a = parseVitalEntries(aRaw);
		const b = parseVitalEntries(bRaw);
		// Index b by time to match.
		const byTime = new Map<string, string>();
		for (const e of b) byTime.set(e.time, String(e.value));
		const matched: string[] = [];
		const usedB = new Set<string>();
		let allMatched = true;
		for (const e of a) {
			const partner = byTime.get(e.time);
			if (partner != null) {
				usedB.add(e.time);
				matched.push(e.time ? `${e.time} ${e.value}/${partner}` : `${e.value}/${partner}`);
			} else {
				allMatched = false;
			}
		}
		const unmatchedB = b.filter(e => !usedB.has(e.time));
		if (allMatched && unmatchedB.length === 0) {
			return matched.join(' · ');
		}
		// eslint-disable-next-line no-console
		console.warn('[EntryPreview] paired vitals have mismatched times — listing separately');
		const aFmt = formatVitalValue(aRaw);
		const bFmt = formatVitalValue(bRaw);
		return [aFmt, bFmt].filter(Boolean).join(' / ');
	}

	function formatDate(doc: CiphraDocument): string {
		const d = String(doc.data.date || doc.serverCreatedAt);
		try {
			return new Date(d.includes('T') ? d : d + 'T12:00:00').toLocaleDateString($locale, {
				weekday: 'short', day: 'numeric', month: 'short'
			});
		} catch { return d; }
	}

	function typeLabel(type: string): string {
		if (type === 'entry') return $t('protocol.title');
		if (type === 'event') return $t('stream.events');
		if (type === 'diary') return $t('quickadd.mode_diary');
		return type;
	}

	// CIPH-881 — rescue-medication events are type:'event' + kind:'medication'.
	// Render distinctly from freeform note-marker events so journal / calendar
	// / dashboard never collapse them into a generic "Event" row.
	$: isMedEvent = entry.data?.type === 'event' && entry.data?.kind === 'medication';
	function rescueMedLabel(doc: CiphraDocument): string {
		return resolveMedDisplay(bp, (doc.data as any)?.medicationId, $t).label;
	}
	function rescueMedUnit(doc: CiphraDocument): string {
		return resolveMedDisplay(bp, (doc.data as any)?.medicationId, $t).unit;
	}

	// CIPH-713 — diary docs are always private; entries/events become private
	// when the user toggles the lock. Either way, render a small lock icon
	// next to the type badge so the UI matches what's been excluded from any
	// export.
	$: isPrivate = entry.data?.type === 'diary' || entry.data?.private === true;

	// CIPH-915 — defensive id-resolution. Orphan ids in the saved doc
	// (legacy data, dropped customizations, migration leftovers) used
	// to fall through `symptomLabelFor` / `triggerLabelFor` / `epLabelFor`
	// to "return id" — the raw id rendered as a chip. A doc with
	// `data.symptoms = { "0": true, ... }` would render a stray "0"
	// chip in the journal. Filter unknown ids out before they reach
	// the chip rows.
	function isKnownSymptom(id: string): boolean {
		for (const g of bp?.symptomGroups || []) {
			if (g.items.some((it) => it.id === id)) return true;
		}
		return false;
	}
	function isKnownTrigger(id: string): boolean {
		return (bp?.triggers || []).some((tr) => tr.id === id);
	}
	function isKnownEpisode(id: string): boolean {
		return (bp?.episodeTypes || []).some((ep) => ep.id === id);
	}

	$: symIdsRaw = bp ? Object.entries(entry.data.symptoms || {}).filter(([k, v]) => v && !POSITIVE_MARKERS.has(k) && isKnownSymptom(k)).map(([k]) => k) : [];
	$: epEntriesRaw = bp ? Object.entries(entry.data.episodes || entry.data.seizures || {}).filter(([k, n]) => Number(n) > 0 && isKnownEpisode(k)) : [];
	$: trigIdsRaw = bp ? (Array.isArray(entry.data.triggers)
		? entry.data.triggers.filter(isKnownTrigger)
		: Object.entries(entry.data.triggers || {}).filter(([k, v]) => v && isKnownTrigger(k)).map(([k]) => k)) : [];
	$: vitalEntries = bp ? Object.entries(entry.data.vitals || {}).filter(([k, v]) => v != null && String(v).trim() !== '' && String(v).trim() !== '0' && (bp.vitals || []).some((vt) => vt.id === k)) : [];

	// CIPH-907c — When hideType is true the parent surface (journal day-
	// header, calendar bottom sheet) shows a phase tag for active multiDay
	// episodes. Rendering them again as chips here is duplication.
	// BUT — if the entry has nothing else logged (only the multiDay
	// episode), suppressing the chip leaves the card body empty. Smoke
	// flagged this. So dedup is conditional: hide multiDay chips ONLY
	// when there's other content to fill the card. Empty-content entries
	// still get the chip so the card never goes blank.
	$: hasNonMultiDayContent = (
		symIdsRaw.length > 0 ||
		trigIdsRaw.length > 0 ||
		vitalEntries.length > 0 ||
		!!entry.data.notes ||
		!!entry.data.text ||
		epEntriesRaw.some(([id]) => {
			const ep = bp?.episodeTypes.find((e) => e.id === id);
			return !ep?.multiDay;
		})
	);
	$: epEntries = (hideType && bp && (hasNonMultiDayContent || inStreak))
		? epEntriesRaw.filter(([id]) => {
				const ep = bp.episodeTypes.find((e) => e.id === id);
				return !ep?.multiDay;
			})
		: epEntriesRaw;

	// CIPH-413 — rank by 30-day frequency
	function buildFrequencyMap(docs: CiphraDocument[] | undefined, kind: 'symptoms' | 'triggers'): Map<string, number> {
		const map = new Map<string, number>();
		if (!docs) return map;
		const cutoff = Date.now() - 30 * 86_400_000;
		for (const d of docs) {
			const ts = new Date(d.serverCreatedAt).getTime();
			if (Number.isFinite(ts) && ts < cutoff) continue;
			const slot = d.data?.[kind];
			if (!slot) continue;
			if (kind === 'triggers' && Array.isArray(slot)) {
				for (const id of slot) map.set(id, (map.get(id) || 0) + 1);
			} else if (typeof slot === 'object') {
				for (const [k, v] of Object.entries(slot)) {
					if (v) map.set(k, (map.get(k) || 0) + 1);
				}
			}
		}
		return map;
	}

	$: symFreq = buildFrequencyMap(recentDocs, 'symptoms');
	$: trigFreq = buildFrequencyMap(recentDocs, 'triggers');

	$: symIds = recentDocs
		? [...symIdsRaw].sort((a, b) => (symFreq.get(b) || 0) - (symFreq.get(a) || 0))
		: symIdsRaw;
	$: trigIds = recentDocs
		? [...trigIdsRaw].sort((a, b) => (trigFreq.get(b) || 0) - (trigFreq.get(a) || 0))
		: trigIdsRaw;

	// CIPH-410/414 — group vitals into paired cards / lab pills / daily-mean line.
	type VitalGroup = {
		paired: { pairLabel: string; vitalA: VitalField; valA: unknown; vitalB: VitalField; valB: unknown }[];
		labs:   { vital: VitalField; value: unknown }[];
		means:  { vital: VitalField; value: unknown }[];
	};
	function groupVitals(entries: [string, unknown][]): VitalGroup {
		const out: VitalGroup = { paired: [], labs: [], means: [] };
		const byId = new Map<string, unknown>(entries.map(([k, v]) => [k, v]));
		const consumed = new Set<string>();

		// 1. Paired groups
		const pairBuckets = new Map<string, { vital: VitalField; value: unknown }[]>();
		for (const [id, val] of entries) {
			const v = vitalFor(id);
			if (!v?.pairLabel) continue;
			if (!pairBuckets.has(v.pairLabel)) pairBuckets.set(v.pairLabel, []);
			pairBuckets.get(v.pairLabel)!.push({ vital: v, value: val });
		}
		for (const [pairLabel, members] of pairBuckets) {
			if (members.length === 2 && byId.has(members[0].vital.id) && byId.has(members[1].vital.id)) {
				out.paired.push({
					pairLabel,
					vitalA: members[0].vital, valA: members[0].value,
					vitalB: members[1].vital, valB: members[1].value,
				});
				consumed.add(members[0].vital.id);
				consumed.add(members[1].vital.id);
			}
		}

		// 2/3. Labs vs daily-means
		for (const [id, val] of entries) {
			if (consumed.has(id)) continue;
			const v = vitalFor(id);
			if (!v) continue;
			if (v.referenceLine) {
				out.labs.push({ vital: v, value: val });
			} else {
				out.means.push({ vital: v, value: val });
			}
		}
		return out;
	}

	$: groupedVitals = bp ? groupVitals(vitalEntries as [string, unknown][]) : { paired: [], labs: [], means: [] };

	function pairTitle(pairLabel: string, fallback: string): string {
		const key = `vital.pair_${pairLabel}`;
		const v = $t(key);
		return v && v !== key ? v : fallback;
	}

	// CIPH-412 — collapse chips for daily_log entries with many chips
	$: needsCollapse = entry.data.type === 'entry' && (symIds.length > 3 || trigIds.length > 2);
	let expanded = false;
	$: showChips = !needsCollapse || expanded;

	$: chipSize = compact ? 'text-[10px]' : 'text-[11px]';

	// CIPH-411 pill style — single neutral background, optional left stripe.
	function pillStyle(stripe: string | null): string {
		const base = 'background: var(--surface-muted); color: var(--text-primary);';
		if (!stripe) return base;
		return `${base} border-left: 3px solid ${stripe};`;
	}
</script>

<p class="text-sm font-medium" style="color: var(--text-primary)">
	{#if !hideType}
		{isMedEvent ? $t('rescue_med.section_title') : typeLabel(entry.data.type || '')}
	{/if}
	{#if isPrivate}
		<span
			class="inline-flex items-center align-middle ml-1 gap-1 text-xs"
			style="color: var(--text-muted)"
			title={$t('private.tooltip')}
		>
			<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<rect x="4" y="11" width="16" height="10" rx="2" />
				<path d="M8 11V7a4 4 0 1 1 8 0v4" />
			</svg>
			<span>{$t('private.label')}</span>
		</span>
	{/if}
	{#if showDate}
		<span class="text-xs font-normal" style="color: var(--text-muted)">{hideType && !isPrivate ? '' : ' · '}{formatDate(entry)}</span>
	{/if}
	<!-- CIPH-907c — Summary count line ("· 4 Symptome · 1 Episoden · 2
		 Vitals") suppressed when hideType is true. The journal's day-
		 header phase tag + the chips below already say everything; the
		 summary was a third reference to the same data. -->
	{#if !compact && !hideType && entry.data.type === 'entry' && (symIds.length > 0 || epEntries.length > 0 || vitalEntries.length > 0)}
		<span class="text-xs font-normal" style="color: var(--text-muted)">
			{#if symIds.length > 0}
				· {plural($t, $locale, 'entry_preview.summary_symptoms', symIds.length)}
			{/if}
			{#if epEntries.length > 0}
				· {plural($t, $locale, 'entry_preview.summary_episodes', epEntries.reduce((s, [, n]) => s + Number(n), 0))}
			{/if}
			{#if vitalEntries.length > 0}
				· {plural($t, $locale, 'entry_preview.summary_vitals', vitalEntries.length)}
			{/if}
		</span>
	{/if}
</p>

{#if bp}
	{#if entry.data.episodeType && bp.episodeTypes}
		<p class="text-xs mt-0.5" style="color: var(--text-muted)">{epLabelFor(entry.data.episodeType)}</p>
	{/if}

	<!-- CIPH-760 — preserved epilepc raw type_name (e.g. "Fokal rechts") -->
	{#if entry.data.epilepc_original_type}
		<p class="text-xs mt-0.5" style="color: var(--text-muted)">
			{$t('entry.original_type_label').replace('{value}', String(entry.data.epilepc_original_type))}
		</p>
	{/if}

	{#if needsCollapse && !expanded}
		<button
			type="button"
			class="text-[11px] mt-1.5 underline"
			style="color: var(--text-muted)"
			on:click={() => (expanded = true)}
		>{$t('entry_preview.show_details')}</button>
	{/if}

	{#if showChips}
		<!-- CIPH-902 — Per-chip color stripes (red on episodes, brand on
			 triggers) dropped: a calm timeline shouldn't fight the rail
			 color. The "Nx" count prefix on episodes carries the "this is
			 an episode" signal; symptoms vs triggers stay legible by label.
			 +N truncation also dropped — let card height carry "loud day
			 vs quiet day" as visual rhythm. -->
		{#if epEntries.length > 0}
			<div
				role="group"
				aria-label={plural($t, $locale, 'entry_preview.aria_episodes_count', epEntries.reduce((s, [, n]) => s + Number(n), 0))}
				class="flex flex-wrap gap-1 {compact ? 'mt-1' : 'mt-2'}"
			>
				{#each epEntries as [id, n]}
					<span class="inline-flex items-center gap-1 {chipSize} px-2 py-0.5 rounded-full"
						style={pillStyle(null)}
					>{n}× {epLabelFor(id)}</span>
				{/each}
			</div>
		{/if}

		{#if symIds.length > 0}
			<div
				role="group"
				aria-label={plural($t, $locale, 'entry_preview.aria_symptoms_count', symIds.length)}
				class="flex flex-wrap gap-1 {compact ? 'mt-1' : (epEntries.length > 0 ? 'mt-1.5' : 'mt-2')}"
			>
				{#each symIds as id}
					<span class="{chipSize} px-2 py-0.5 rounded-full"
						style={pillStyle(null)}
					>{symptomLabelFor(id)}</span>
				{/each}
			</div>
		{/if}

		{#if trigIds.length > 0}
			<div
				role="group"
				aria-label={plural($t, $locale, 'entry_preview.aria_triggers_count', trigIds.length)}
				class="flex flex-wrap gap-1 mt-1.5"
			>
				{#each trigIds as id}
					<span class="{chipSize} px-2 py-0.5 rounded-full"
						style={pillStyle(null)}
					>{triggerLabelFor(id)}</span>
				{/each}
			</div>
		{/if}

		{#if needsCollapse && expanded}
			<button
				type="button"
				class="text-[11px] mt-1.5 underline"
				style="color: var(--text-muted)"
				on:click={() => (expanded = false)}
			>{$t('entry_preview.hide_details')}</button>
		{/if}
	{/if}

	<!-- Vital snippets — paired cards, lab pills, then daily-mean line (CIPH-410/414) -->
	{#if entry.data.type === 'entry' && (groupedVitals.paired.length > 0 || groupedVitals.labs.length > 0 || groupedVitals.means.length > 0)}
		{#if groupedVitals.paired.length > 0}
			<div class="flex flex-col gap-1 mt-2">
				{#each groupedVitals.paired as p}
					<div class="px-2 py-1 rounded-md" style="background: var(--surface-muted)">
						<div class="text-[11px] font-medium" style="color: var(--text-primary)">
							{pairTitle(p.pairLabel, isCustomItem(p.vitalA.id) ? p.vitalA.label : $t(p.vitalA.label))}{p.vitalA.unit ? ` (${translateUnit($t, p.vitalA.unit)})` : ''}
						</div>
						<div class="{chipSize}" style="color: var(--text-secondary)">
							{formatPairedVitals(p.valA, p.valB)}
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if groupedVitals.labs.length > 0}
			<div class="flex flex-wrap gap-1 mt-1.5">
				{#each groupedVitals.labs as l}
					<span class="{chipSize} px-2 py-0.5 rounded-md"
						style="background: var(--surface-muted); color: var(--text-primary); border-left: 3px solid var(--success);"
					>{isCustomItem(l.vital.id) ? l.vital.label : $t(l.vital.label)}: {formatVitalValue(l.value)}{l.vital.unit ? ' ' + translateUnit($t, l.vital.unit) : ''}</span>
				{/each}
			</div>
		{/if}

		{#if groupedVitals.means.length > 0}
			<p class="{chipSize} mt-1.5" style="color: var(--text-muted)">
				{#each groupedVitals.means.slice(0, 6) as m, j}
					{j > 0 ? ' · ' : ''}{isCustomItem(m.vital.id) ? m.vital.label : $t(m.vital.label)}: {formatVitalValue(m.value)}{m.vital.unit ? ' ' + translateUnit($t, m.vital.unit) : ''}
				{/each}
			</p>
		{/if}
	{/if}
{/if}

{#if entry.data.type === 'diary' && entry.data.text}
	<p
		class="mt-1.5 line-clamp-3 whitespace-pre-wrap entry-preview-diary-text"
		style="color: var(--text-secondary)"
	>{entry.data.text}</p>
{/if}

<!-- CIPH-881b — rescue-medication pill: brand-tinted, distinct from
	 freeform-event "Event" badge so journal / calendar / dashboard show
	 the medication clearly. -->
{#if isMedEvent}
	<div class="flex flex-wrap items-center gap-2 mt-1.5">
		<span
			class="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full"
			style="background: var(--surface-muted); color: var(--accent); border: 1px solid var(--accent)"
		>
			<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M19 14l-7 7-7-7a7 7 0 1 1 14 0z"/>
				<circle cx="12" cy="11" r="3"/>
			</svg>
			{rescueMedLabel(entry)}
			{#if entry.data.dose}
				<span style="color: var(--text-secondary)">· {entry.data.dose}{rescueMedUnit(entry) ? ' ' + rescueMedUnit(entry) : ''}</span>
			{/if}
			{#if entry.data.time}
				<span style="color: var(--text-muted)">· {entry.data.time}</span>
			{/if}
		</span>
	</div>
{/if}

{#if entry.data.type === 'event' && entry.data.title}
	<!-- Migrated epilepc events carry the name in `title`; render it (with notes
		 if any) so title-only events aren't blank rows. -->
	<p class="text-xs mt-1.5 italic line-clamp-2" style="color: var(--text-secondary)">"{[entry.data.title, entry.data.notes].filter(Boolean).join(' · ')}"</p>
{:else if entry.data.notes}
	<p class="text-xs mt-1.5 italic line-clamp-2" style="color: var(--text-secondary)">"{entry.data.notes}"</p>
{/if}

<!-- CIPH-911b — placeholder for empty cards inside a closed-phase streak.
	 When inStreak suppresses the multiDay chip and there's nothing else
	 to render, the card would be visually empty. The bracket header
	 already says "Gemischte Episode · 4 Tage" — show a quiet "Phase
	 weiter aktiv" inside the card so it doesn't read as broken. -->
{#if inStreak && !hasNonMultiDayContent && entry.data.type === 'entry'}
	<p class="entry-preview-streak-placeholder">{$t('entry_preview.phase_continues')}</p>
{/if}

<style>
	/* Diary text matches the body size of every other journal entry (the
	   notes/secondary text-xs = 12px) — it previously rendered at 14px and read
	   as larger than other cards. Same sans stack as the rest of the app
	   (CIPH-902's serif treatment was reverted earlier). */
	.entry-preview-diary-text {
		font-size: 12px;
		line-height: 1.5;
	}
	/* CIPH-911b — placeholder for streak-only days. */
	.entry-preview-streak-placeholder {
		font-size: 12px;
		font-style: italic;
		color: var(--text-muted);
		margin: 0;
	}
</style>
