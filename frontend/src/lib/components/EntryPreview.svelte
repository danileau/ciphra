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
	import { t, locale, translateUnit } from '$lib/i18n';
	import type { CiphraDocument } from '$lib/stores/documents';
	import type { Blueprint, VitalField } from '$lib/blueprint/types';

	export let entry: CiphraDocument;
	export let bp: Blueprint | null = null;
	export let showDate: boolean = true;
	export let compact: boolean = false;
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
			if (it) return $t(it.label);
		}
		return id;
	}
	function triggerLabelFor(id: string): string {
		const tr = (bp?.triggers || []).find(x => x.id === id);
		return tr ? $t(tr.label) : id;
	}
	function epLabelFor(id: string): string {
		const ep = (bp?.episodeTypes || []).find(e => e.id === id);
		return ep ? $t(ep.label) : id;
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

	// CIPH-713 — diary docs are always private; entries/events become private
	// when the user toggles the lock. Either way, render a small lock icon
	// next to the type badge so the UI matches what's been excluded from any
	// export.
	$: isPrivate = entry.data?.type === 'diary' || entry.data?.private === true;

	$: symIdsRaw = bp ? Object.entries(entry.data.symptoms || {}).filter(([k, v]) => v && !POSITIVE_MARKERS.has(k)).map(([k]) => k) : [];
	$: epEntries = bp ? Object.entries(entry.data.episodes || entry.data.seizures || {}).filter(([, n]) => Number(n) > 0) : [];
	$: trigIdsRaw = bp ? (Array.isArray(entry.data.triggers) ? entry.data.triggers : Object.entries(entry.data.triggers || {}).filter(([, v]) => v).map(([k]) => k)) : [];
	$: vitalEntries = bp ? Object.entries(entry.data.vitals || {}).filter(([, v]) => v != null && String(v).trim() !== '' && String(v).trim() !== '0') : [];

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
	{typeLabel(entry.data.type || '')}
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
		<span class="text-xs font-normal" style="color: var(--text-muted)"> · {formatDate(entry)}</span>
	{/if}
	{#if !compact && entry.data.type === 'entry' && (symIds.length > 0 || epEntries.length > 0 || vitalEntries.length > 0)}
		<span class="text-xs font-normal" style="color: var(--text-muted)">
			{#if symIds.length > 0}
				· {symIds.length} {$t('protocol.symptoms')}
			{/if}
			{#if epEntries.length > 0}
				· {epEntries.reduce((s, [, n]) => s + Number(n), 0)} {$t('protocol.episodes')}
			{/if}
			{#if vitalEntries.length > 0}
				· {vitalEntries.length} {$t('protocol.vitals')}
			{/if}
		</span>
	{/if}
</p>

{#if bp}
	{#if entry.data.episodeType && bp.episodeTypes}
		<p class="text-xs mt-0.5" style="color: var(--text-muted)">{epLabelFor(entry.data.episodeType)}</p>
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
		<!-- Episode chips (always first per CIPH-413) -->
		{#if epEntries.length > 0}
			<div
				role="group"
				aria-label={$t('entry_preview.aria_episodes_count').replace('{n}', String(epEntries.reduce((s, [, n]) => s + Number(n), 0)))}
				class="flex flex-wrap gap-1 {compact ? 'mt-1' : 'mt-2'}"
			>
				{#each epEntries.slice(0, 4) as [id, n]}
					<span class="inline-flex items-center gap-1 {chipSize} px-2 py-0.5 rounded-r-full rounded-l-sm"
						style={pillStyle('var(--danger)')}
					>{n}× {epLabelFor(id)}</span>
				{/each}
			</div>
		{/if}

		<!-- Symptom chips -->
		{#if symIds.length > 0}
			<div
				role="group"
				aria-label={$t('entry_preview.aria_symptoms_count').replace('{n}', String(symIds.length))}
				class="flex flex-wrap gap-1 {compact ? 'mt-1' : (epEntries.length > 0 ? 'mt-1.5' : 'mt-2')}"
			>
				{#each symIds.slice(0, 6) as id}
					<span class="{chipSize} px-2 py-0.5 rounded-r-full rounded-l-sm"
						style={pillStyle(null)}
					>{symptomLabelFor(id)}</span>
				{/each}
				{#if symIds.length > 6}
					<span class="{chipSize} px-2 py-0.5" style="color: var(--text-muted)">+{symIds.length - 6}</span>
				{/if}
			</div>
		{/if}

		<!-- Trigger chips -->
		{#if trigIds.length > 0}
			<div
				role="group"
				aria-label={$t('entry_preview.aria_triggers_count').replace('{n}', String(trigIds.length))}
				class="flex flex-wrap gap-1 mt-1.5"
			>
				{#each trigIds.slice(0, 4) as id}
					<span class="{chipSize} px-2 py-0.5 rounded-r-full rounded-l-sm"
						style={pillStyle('var(--brand)')}
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
							{pairTitle(p.pairLabel, $t(p.vitalA.label))}{p.vitalA.unit ? ` (${translateUnit($t, p.vitalA.unit)})` : ''}
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
					>{$t(l.vital.label)}: {formatVitalValue(l.value)}{l.vital.unit ? ' ' + translateUnit($t, l.vital.unit) : ''}</span>
				{/each}
			</div>
		{/if}

		{#if groupedVitals.means.length > 0}
			<p class="{chipSize} mt-1.5" style="color: var(--text-muted)">
				{#each groupedVitals.means.slice(0, 6) as m, j}
					{j > 0 ? ' · ' : ''}{$t(m.vital.label)}: {formatVitalValue(m.value)}{m.vital.unit ? ' ' + translateUnit($t, m.vital.unit) : ''}
				{/each}
			</p>
		{/if}
	{/if}
{/if}

{#if entry.data.type === 'diary' && entry.data.text}
	<p class="text-xs mt-1.5 line-clamp-3 whitespace-pre-wrap" style="color: var(--text-secondary)">{entry.data.text}</p>
{/if}

{#if entry.data.notes}
	<p class="text-xs mt-1.5 italic line-clamp-2" style="color: var(--text-secondary)">"{entry.data.notes}"</p>
{/if}
