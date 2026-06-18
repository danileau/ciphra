<!--
	DayDetail — calendar-side-panel content (CIPH-910).

	Replaces the per-doc EntryPreview stack inside the calendar bottom-
	sheet / right-side panel. Smoke flagged the EntryPreview-stack as
	visually unclear: chips weren't named, symptoms and triggers blended
	together, the day's full picture didn't read as "the day" but as "a
	bunch of doc rows."

	DayDetail aggregates everything logged on a single date into
	clinical sections: PHASE / EPISODEN / SYMPTOME / AUSLÖSER / VITALS /
	NOTIZEN / EREIGNISSE / TAGEBUCH. Each section is labeled, content is
	a `·`-separated text list. Doctor-prep-shaped: the patient pulls up
	a day in the calendar before a doctor visit and sees what to read out.

	Render-only. Edit / delete is the calendar's concern (the "Bearbeiten"
	link in the panel header routes to /log/{date} for entries; events
	and diaries open the journal moment-modal — out of scope here).
-->
<script lang="ts">
	import { t, locale, translateUnit } from '$lib/i18n';
	import { isCustomItem, resolveMedDisplay } from '$lib/blueprint';
	import type { Blueprint } from '$lib/blueprint/types';
	import type { CiphraDocument } from '$lib/stores/documents';

	export let docs: CiphraDocument[];
	export let bp: Blueprint | null;

	const POSITIVE_MARKERS = new Set(['slept_well']);

	$: entryDocs = docs.filter((d) => d.data.type === 'entry');
	$: eventDocs = docs.filter((d) => d.data.type === 'event' && d.data.kind !== 'medication');
	$: medEventDocs = docs.filter((d) => d.data.type === 'event' && d.data.kind === 'medication');
	$: diaryDocs = docs.filter((d) => d.data.type === 'diary');

	// Aggregate symptoms / triggers / episode counts / vitals / notes
	// across every entry doc for the day. Multi-entry days are rare —
	// usually 1 entry per day — but the merge keeps display correct
	// when the model allows multiple.
	$: aggregated = (() => {
		const symptoms = new Set<string>();
		const triggers = new Set<string>();
		const episodes: Record<string, number> = {};
		const vitals: Record<string, string> = {};
		const notes: string[] = [];
		for (const d of entryDocs) {
			const data = d.data;
			// Filter ids unknown to the current blueprint (deleted custom items,
			// legacy/migration leftovers) so they don't render as raw-id chips —
			// mirrors the CIPH-915 guard already in EntryPreview.
			for (const [k, v] of Object.entries(data.symptoms || {})) {
				if (v && !POSITIVE_MARKERS.has(k) && isKnownSymptom(k)) symptoms.add(k);
			}
			const trs = data.triggers as unknown;
			if (Array.isArray(trs)) {
				for (const id of trs) { if (isKnownTrigger(String(id))) triggers.add(String(id)); }
			} else if (trs && typeof trs === 'object') {
				for (const [k, v] of Object.entries(trs as Record<string, boolean>)) {
					if (v && isKnownTrigger(k)) triggers.add(k);
				}
			}
			for (const [k, n] of Object.entries(data.episodes || data.seizures || {})) {
				if (Number(n) > 0) episodes[k] = (episodes[k] || 0) + Number(n);
			}
			for (const [k, v] of Object.entries(data.vitals || {})) {
				if (v != null && String(v).trim() !== '' && String(v).trim() !== '0' && isKnownVital(k)) {
					vitals[k] = String(v);
				}
			}
			if (data.notes) notes.push(String(data.notes));
		}
		return {
			symptoms: Array.from(symptoms),
			triggers: Array.from(triggers),
			episodes,
			vitals,
			notes,
		};
	})();

	// Active multiDay episodes ("PHASE" section).
	$: activePhases = bp?.episodeTypes
		? bp.episodeTypes.filter(
				(ep) => ep.multiDay && (aggregated.episodes[ep.id] || 0) > 0,
			)
		: [];

	// Counter (non-multiDay) episodes with their day-totals.
	$: counterEpisodes = bp?.episodeTypes
		? bp.episodeTypes
				.filter((ep) => !ep.multiDay && (aggregated.episodes[ep.id] || 0) > 0)
				.map((ep) => ({ ep, count: aggregated.episodes[ep.id] }))
		: [];

	function isKnownSymptom(id: string): boolean {
		return (bp?.symptomGroups || []).some((g) => g.items.some((it) => it.id === id));
	}
	function isKnownTrigger(id: string): boolean {
		return (bp?.triggers || []).some((tr) => tr.id === id);
	}
	function isKnownVital(id: string): boolean {
		return (bp?.vitals || []).some((v) => v.id === id);
	}
	function symptomLabel(id: string): string {
		for (const g of bp?.symptomGroups || []) {
			const it = g.items.find((x) => x.id === id);
			if (it) return isCustomItem(it.id) ? it.label : $t(it.label);
		}
		return id;
	}
	function triggerLabel(id: string): string {
		const tr = (bp?.triggers || []).find((x) => x.id === id);
		if (!tr) return id;
		return isCustomItem(tr.id) ? tr.label : $t(tr.label);
	}
	function epLabel(ep: { id: string; label: string }): string {
		return isCustomItem(ep.id) ? ep.label : $t(ep.label);
	}
	function vitalDef(id: string) {
		return (bp?.vitals || []).find((v) => v.id === id);
	}
	function vitalLabel(id: string): string {
		const v = vitalDef(id);
		if (!v) return id;
		return isCustomItem(v.id) ? v.label : $t(v.label);
	}
	function vitalUnit(id: string): string {
		const v = vitalDef(id);
		if (!v?.unit) return '';
		return ' ' + translateUnit($t, v.unit);
	}
	function formatVital(raw: string): string {
		const s = String(raw).trim();
		if (!s) return '';
		if (s.startsWith('[')) {
			try {
				const arr = JSON.parse(s);
				if (Array.isArray(arr)) {
					return arr
						.map((e: { time?: string; value?: string }) =>
							e.time ? `${e.time} ${e.value}` : String(e.value),
						)
						.filter(Boolean)
						.join(' · ');
				}
			} catch {
				/* fallthrough */
			}
		}
		return s;
	}
	function rescueMedLabel(doc: CiphraDocument): string {
		const id = (doc.data as Record<string, unknown>).medicationId as string | undefined;
		return resolveMedDisplay(bp, id, $t).label;
	}
	function rescueMedUnit(doc: CiphraDocument): string {
		const id = (doc.data as Record<string, unknown>).medicationId as string | undefined;
		const u = resolveMedDisplay(bp, id, $t).unit;
		return u ? ' ' + u : '';
	}

	$: hasAnyContent =
		activePhases.length > 0 ||
		counterEpisodes.length > 0 ||
		aggregated.symptoms.length > 0 ||
		aggregated.triggers.length > 0 ||
		Object.keys(aggregated.vitals).length > 0 ||
		aggregated.notes.length > 0 ||
		eventDocs.length > 0 ||
		medEventDocs.length > 0 ||
		diaryDocs.length > 0;
</script>

{#if hasAnyContent}
	<div class="dd">
		{#if activePhases.length > 0}
			<section class="dd-section">
				<h3 class="dd-label">{$t('day_detail.phase')}</h3>
				<p class="dd-content">
					{#each activePhases as ep, i}{i > 0 ? ' · ' : ''}<span style="color: {ep.color}; font-weight: 500">{epLabel(ep)}</span>{/each}
				</p>
			</section>
		{/if}

		{#if counterEpisodes.length > 0}
			<section class="dd-section">
				<h3 class="dd-label">{$t('day_detail.episodes')}</h3>
				<p class="dd-content">
					{#each counterEpisodes as { ep, count }, i}{i > 0 ? ' · ' : ''}<span style="color: {ep.color}; font-weight: 500">{count}× {epLabel(ep)}</span>{/each}
				</p>
			</section>
		{/if}

		{#if aggregated.symptoms.length > 0}
			<section class="dd-section">
				<h3 class="dd-label">
					{$t('day_detail.symptoms')}
					<span class="dd-count">({aggregated.symptoms.length})</span>
				</h3>
				<p class="dd-content">
					{#each aggregated.symptoms as id, i}{i > 0 ? ' · ' : ''}{symptomLabel(id)}{/each}
				</p>
			</section>
		{/if}

		{#if aggregated.triggers.length > 0}
			<section class="dd-section">
				<h3 class="dd-label">
					{$t('day_detail.triggers')}
					<span class="dd-count">({aggregated.triggers.length})</span>
				</h3>
				<p class="dd-content">
					{#each aggregated.triggers as id, i}{i > 0 ? ' · ' : ''}{triggerLabel(id)}{/each}
				</p>
			</section>
		{/if}

		{#if Object.keys(aggregated.vitals).length > 0}
			<section class="dd-section">
				<h3 class="dd-label">{$t('day_detail.vitals')}</h3>
				<ul class="dd-vitals">
					{#each Object.entries(aggregated.vitals) as [vid, val]}
						<li>
							<span class="dd-vital-label">{vitalLabel(vid)}:</span>
							<span class="dd-vital-value">{formatVital(val)}{vitalUnit(vid)}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if aggregated.notes.length > 0}
			<section class="dd-section">
				<h3 class="dd-label">{$t('day_detail.notes')}</h3>
				{#each aggregated.notes as n}
					<p class="dd-notes">"{n}"</p>
				{/each}
			</section>
		{/if}

		{#if medEventDocs.length > 0 || eventDocs.length > 0}
			<section class="dd-section">
				<h3 class="dd-label">{$t('day_detail.events')}</h3>
				<ul class="dd-events">
					{#each medEventDocs as ev}
						<li>
							{#if ev.data.time}
								<span class="dd-event-time">{ev.data.time}</span>
							{/if}
							<span class="dd-event-rescue" style="color: var(--accent)">{rescueMedLabel(ev)}{ev.data.dose ? ` · ${ev.data.dose}${rescueMedUnit(ev)}` : ''}</span>
						</li>
					{/each}
					{#each eventDocs as ev}
						<li>
							{#if ev.data.time}
								<span class="dd-event-time">{ev.data.time}</span>
							{/if}
							<span class="dd-event-text">{[ev.data.title, ev.data.notes].filter(Boolean).join(' · ') || ''}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if diaryDocs.length > 0}
			<section class="dd-section">
				<h3 class="dd-label">{$t('day_detail.diary')}</h3>
				{#each diaryDocs as d}
					{#if d.data.time}
						<p class="dd-diary-time">{d.data.time}</p>
					{/if}
					<p class="dd-diary-text">{d.data.text || ''}</p>
				{/each}
			</section>
		{/if}
	</div>
{/if}

<style>
	/* CIPH-913 — visual polish. Smoke flagged the day-detail panel as
	   "shine-less, just text." Added: hairline divider + cohort-accent
	   dot per section, vitals as a 2-column grid with right-aligned
	   tabular values, the notes section reads as quote-pulled text. Calm
	   Threema-style "designed"
	   feel without sparkle. */
	.dd {
		display: flex;
		flex-direction: column;
		gap: 0;
	}
	.dd-section {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 14px 0;
		border-top: 1px solid var(--border-subtle, var(--border));
	}
	.dd-section:first-child {
		padding-top: 0;
		border-top: none;
	}
	.dd-label {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-secondary);
		margin: 0;
	}
	.dd-label::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent);
		flex-shrink: 0;
	}
	.dd-count {
		font-weight: 400;
		text-transform: none;
		letter-spacing: normal;
		color: var(--text-muted);
	}
	.dd-content {
		font-size: 14px;
		line-height: 1.55;
		color: var(--text-primary);
		margin: 0;
	}
	.dd-vitals {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		font-size: 14px;
	}
	.dd-vitals li {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 12px;
		align-items: baseline;
		padding: 5px 0;
		border-bottom: 1px solid var(--border-subtle, var(--border));
	}
	.dd-vitals li:last-child {
		border-bottom: none;
	}
	.dd-vital-label {
		color: var(--text-secondary);
	}
	.dd-vital-value {
		color: var(--text-primary);
		font-variant-numeric: tabular-nums;
		font-weight: 500;
		text-align: right;
	}
	.dd-notes {
		font-size: 14px;
		line-height: 1.55;
		color: var(--text-secondary);
		font-style: italic;
		margin: 0;
		padding-left: 10px;
		border-left: 2px solid var(--border);
	}
	.dd-events {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		font-size: 14px;
	}
	.dd-events li {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 10px;
		align-items: baseline;
		padding: 5px 0;
		border-bottom: 1px solid var(--border-subtle, var(--border));
	}
	.dd-events li:last-child {
		border-bottom: none;
	}
	.dd-event-time {
		font-variant-numeric: tabular-nums;
		color: var(--text-muted);
		font-size: 12px;
		font-weight: 500;
	}
	.dd-event-rescue {
		font-weight: 500;
	}
	.dd-event-text {
		color: var(--text-primary);
	}
	.dd-diary-time {
		font-variant-numeric: tabular-nums;
		color: var(--text-muted);
		font-size: 12px;
		margin: 0 0 4px;
	}
	.dd-diary-text {
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-secondary);
		white-space: pre-wrap;
		margin: 0;
		padding-left: 10px;
		border-left: 2px solid var(--border);
	}
</style>
