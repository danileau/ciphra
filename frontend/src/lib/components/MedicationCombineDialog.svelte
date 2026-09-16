<!--
	Combine two entries of the same medication into one (2026-09-16).

	Before dose history existed, the only way to record a new dose was a second
	medication with the same name. Deleting either copy strips its logged days of
	their name, and stopping it leaves two histories that contradict each other.
	This dialog builds ONE history out of both and keeps every logged day:

	- If the two entries never claim the same day, their histories simply line
	  up and nothing needs asking.
	- If they do (the usual case: both "always" active), one question settles it —
	  which dose came first, and from which day the other one applied.

	The preview is rendered from the computed result (`combineMedications`), so
	what the person reads is exactly what gets saved. The removed entry's id is
	kept as an alias on the combined one; no logged document is rewritten.
-->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { t, locale, plural, type Locale } from '$lib/i18n';
	import Modal from '$lib/components/Modal.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import {
		combineMedications,
		docReferencesMed,
		medHistoryDays,
		medPeriods,
		medStartDate,
		medicationsOverlap,
	} from '$lib/blueprint/medicationHistory';
	import type { MedicationPeriod, MedicationSlot } from '$lib/blueprint/types';
	import { formatISODateChoice, type DateFormatChoice } from '$lib/blueprint/preferences';

	export let open = false;
	/** The two entries, in list order (the order they were added). */
	export let pair: [MedicationSlot, MedicationSlot] | null = null;
	export let docs: Array<{ data?: Record<string, unknown> }> = [];
	export let dateFormat: DateFormatChoice | undefined = undefined;

	const dispatch = createEventDispatcher<{
		apply: { replace: MedicationSlot; remove: string };
		close: void;
	}>();

	let earlierId = '';
	let switchDate = '';
	let hydratedFor = '';

	const fmt = (iso: string) => formatISODateChoice(iso, dateFormat);
	const regimenText = (p: { dose: string; schedule: string }) => [p.dose, p.schedule].filter(Boolean).join(' · ');
	const latest = (m: MedicationSlot) => {
		const periods = medPeriods(m);
		return periods[periods.length - 1];
	};

	/** The entry that more likely came first: an unknown start ("since before
	 *  the record") beats a known one, an earlier start beats a later one, and
	 *  otherwise the one added first. */
	function defaultEarlier(a: MedicationSlot, b: MedicationSlot): string {
		const sa = medStartDate(a);
		const sb = medStartDate(b);
		if (sa && sb && sa !== sb) return sa < sb ? a.id : b.id;
		if (!sa && sb) return a.id;
		if (sa && !sb) return b.id;
		return a.id;
	}

	/** Best guess for the switch: the later entry's recorded start, else the
	 *  first day anything was logged against it. Empty when there is no clue —
	 *  the person has to say. */
	function defaultSwitchDate(later: MedicationSlot): string {
		const start = medStartDate(later);
		if (start) return start;
		const dates = docs
			.filter((d) => docReferencesMed(d, later))
			.map((d) => d.data?.date)
			.filter((x): x is string => typeof x === 'string')
			.sort();
		return dates[0] ?? '';
	}

	$: if (open && pair && hydratedFor !== `${pair[0].id}|${pair[1].id}`) {
		hydratedFor = `${pair[0].id}|${pair[1].id}`;
		earlierId = defaultEarlier(pair[0], pair[1]);
		const later = pair[0].id === earlierId ? pair[1] : pair[0];
		switchDate = defaultSwitchDate(later);
	}
	$: if (!open) hydratedFor = '';

	$: needsDate = pair ? medicationsOverlap(pair[0], pair[1]) : false;
	$: laterMed = pair ? (pair[0].id === earlierId ? pair[1] : pair[0]) : null;
	$: combined =
		pair && (!needsDate || switchDate)
			? combineMedications(pair[0], pair[1], { earlierId, switchDate: needsDate ? switchDate : undefined })
			: null;
	$: resultPeriods = combined ? medPeriods(combined) : [];
	$: loc = $locale as Locale;

	function rangeText(p: MedicationPeriod): string {
		if (p.from && p.to) return `${fmt(p.from)} – ${fmt(p.to)}`;
		if (p.from) return $t('medication.from', { date: fmt(p.from) });
		if (p.to) return $t('medication.until', { date: fmt(p.to) });
		return $t('medication.combine_throughout');
	}

	function entrySummary(m: MedicationSlot): string {
		const periods = medPeriods(m);
		const first = periods[0];
		const last = periods[periods.length - 1];
		const start = first.from ? $t('medication.since', { date: fmt(first.from) }) : $t('medication.combine_start_unknown');
		const end = last.to ? ` · ${$t('medication.last_taken', { date: fmt(last.to) })}` : '';
		return `${start}${end}`;
	}

	function submit() {
		if (!pair || !combined) return;
		// The entry added first keeps its id (and so its place in the list);
		// the other's id lives on as an alias.
		dispatch('apply', { replace: combined, remove: pair[1].id });
	}
</script>

<Modal {open} title={pair ? $t('medication.combine_title', { name: pair[0].name }) : ''} onClose={() => dispatch('close')}>
	{#if pair}
		<div class="space-y-4">
			<p class="text-sm" style="color: var(--text-secondary)">{$t('medication.duplicate_hint')}</p>

			<ul class="space-y-2">
				{#each pair as m (m.id)}
					<li class="p-3 rounded-xl" style="background: var(--surface-muted); border: 1px solid var(--border)" data-testid="combine-entry">
						<p class="text-sm font-medium" style="color: var(--text-primary)">{m.name} · {regimenText(latest(m))}</p>
						<p class="text-xs mt-0.5" style="color: var(--text-secondary)">
							{entrySummary(m)} · {plural($t, loc, 'medication.combine_days', medHistoryDays(m, docs))}
						</p>
					</li>
				{/each}
			</ul>

			{#if needsDate}
				<fieldset class="rounded-xl p-3" style="border: 1px solid var(--border)">
					<legend class="text-xs px-1" style="color: var(--text-muted)">{$t('medication.combine_first')}</legend>
					{#each pair as m (m.id)}
						<label class="flex items-start gap-2 cursor-pointer py-1.5">
							<input type="radio" name="combine-earlier" bind:group={earlierId} value={m.id} class="mt-0.5 w-4 h-4" data-testid="combine-earlier-{m.id}" />
							<span class="text-sm" style="color: var(--text-primary)">{regimenText(latest(m))}</span>
						</label>
					{/each}
				</fieldset>

				{#if laterMed}
					<div>
						<label class="text-xs font-medium block" for="combine-switch" style="color: var(--text-secondary)">
							{$t('medication.combine_switch_date', { regimen: regimenText(latest(laterMed)) })}
						</label>
						<div class="mt-1">
							<DatePicker id="combine-switch" bind:value={switchDate} format={dateFormat ?? 'dd.mm.yyyy'} ariaLabel={$t('medication.effective_from')} />
						</div>
						<p class="text-xs mt-1" style="color: var(--text-muted)">{$t('medication.combine_switch_hint')}</p>
					</div>
				{/if}
			{/if}

			{#if needsDate && !switchDate}
				<p class="text-sm" style="color: var(--text-secondary)" role="status">{$t('medication.combine_date_required')}</p>
			{:else if combined}
				<div class="rounded-xl p-3 space-y-1" style="background: var(--surface-muted); border: 1px solid var(--border)" data-testid="combine-preview" aria-live="polite">
					<p class="text-xs font-medium uppercase tracking-wider" style="color: var(--text-muted)">{$t('medication.preview_title')}</p>
					{#each resultPeriods as p}
						<p class="text-sm flex gap-2" style="color: var(--text-secondary)">
							<span class="shrink-0 tabular-nums">{rangeText(p)}</span>
							<span style="color: var(--text-primary)">{regimenText(p)}</span>
						</p>
					{/each}
					<p class="text-xs pt-1" style="color: var(--text-muted)">{$t('medication.combine_keeps')}</p>
				</div>
			{/if}

			<div class="flex justify-end gap-2 pt-2">
				<button type="button" class="btn-secondary min-h-[44px] px-4" on:click={() => dispatch('close')}>{$t('common.cancel')}</button>
				<button type="button" class="btn-primary min-h-[44px] px-4" disabled={!combined} on:click={submit} data-testid="combine-apply">
					{$t('medication.combine')}
				</button>
			</div>
		</div>
	{/if}
</Modal>
