<!--
	History from before ciphra (2026-09-19).

	Dose history records a medication from the day it is entered, so a doctor
	reads "8 mg, since 16.09.2026" and cannot see the two years of titration
	behind it, nor the drugs that were tried and given up. This dialog records
	both:

	- earlier — a dose that applied BEFORE everything already recorded. It never
	            touches a recorded day (that is `prependPeriod`, not a dose
	            change dated in the past, which would drop the later history).
	- past    — a medication taken and stopped long ago, with why it ended.

	Dates are months, not days: nobody remembers that a dose changed on the 14th
	of March 2023, and a picker that insists gets an invented answer. The start
	may stay unknown altogether.

	Like the other medication dialogs, this one computes the result with the
	pure writers and hands it over; it never saves. The preview is rendered from
	that result, so what is read is what gets stored.
-->
<script context="module" lang="ts">
	export type HistoryDialogMode = 'earlier' | 'past';
</script>

<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { t } from '$lib/i18n';
	import Modal from '$lib/components/Modal.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import {
		addDaysISO,
		createPastMedication,
		medPeriods,
		medStartDate,
		newMedicationId,
		prependPeriod,
	} from '$lib/blueprint/medicationHistory';
	import { stopReasonLabel } from '$lib/blueprint/medications';
	import type { MedicationPeriod, MedicationSlot, MedicationStopReason } from '$lib/blueprint/types';
	import { formatISODateChoice, type DateFormatChoice } from '$lib/blueprint/preferences';
	import { todayISO } from '$lib/date';

	export let open = false;
	export let mode: HistoryDialogMode = 'earlier';
	/** The medication to extend backwards. Unused in `past` mode. */
	export let med: MedicationSlot | null = null;
	export let dateFormat: DateFormatChoice | undefined = undefined;
	/** Injectable for tests; the local day the dialog treats as today. */
	export let today: string = todayISO();

	const dispatch = createEventDispatcher<{
		apply: { replace?: MedicationSlot; add?: MedicationSlot };
		close: void;
	}>();

	const STOP_REASONS: MedicationStopReason[] = ['side_effects', 'ineffective', 'doctor', 'pregnancy', 'other'];

	let name = '';
	let dose = '';
	let schedule = '';
	let asNeeded = false;
	let from = '';
	let startUnknown = true;
	let until = '';
	let untilDefault = '';
	let stopReason: MedicationStopReason | '' = '';
	let note = '';

	let hydratedFor = '';
	$: if (open && hydratedFor !== `${mode}|${med?.id ?? ''}`) hydrate();
	$: if (!open) hydratedFor = '';

	function hydrate() {
		hydratedFor = `${mode}|${med?.id ?? ''}`;
		name = '';
		dose = '';
		schedule = med && mode === 'earlier' ? medPeriods(med)[0].schedule : '';
		asNeeded = false;
		from = '';
		startUnknown = true;
		// An earlier dose runs up to the day before the recorded start. Without
		// a recorded start there is nothing to run up to, and the person has to
		// say when the regimen ciphra knows about began.
		untilDefault = med && mode === 'earlier' && medStartDate(med) ? addDaysISO(medStartDate(med) as string, -1) : '';
		until = untilDefault;
		stopReason = '';
		note = '';
	}

	const fmt = (iso: string) => formatISODateChoice(iso, dateFormat);
	const monthOf = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
	const regimenText = (p: { dose: string; schedule: string }) => [p.dose, p.schedule].filter(Boolean).join(' · ');

	/** A date the person picked as a month reads as a month everywhere. */
	$: fromPrecision = startUnknown || !from ? undefined : ('month' as const);
	$: toPrecision = until && until !== untilDefault ? ('month' as const) : undefined;
	$: knownStart = med ? medStartDate(med) : null;

	$: result = (() => {
		if (mode === 'past') {
			if (!name.trim() || !dose.trim() || !until) return null;
			return createPastMedication(newMedicationId(), {
				name,
				dose,
				schedule,
				asNeeded,
				from: startUnknown ? undefined : from || undefined,
				fromPrecision,
				to: until,
				toPrecision: toPrecision ?? 'month',
				stopReason: stopReason || undefined,
				endNote: note,
			});
		}
		if (!med || !dose.trim()) return null;
		return prependPeriod(med, {
			dose,
			schedule,
			from: startUnknown ? undefined : from || undefined,
			fromPrecision,
			to: until || undefined,
			toPrecision,
			note,
		});
	})();

	/** What the dialog asks for and has not got yet — a missing dose leaves the
	 *  button disabled quietly, a contradiction says so. */
	$: problem = (() => {
		if (result) return null;
		if (!dose.trim()) return null;
		if (mode === 'past') return until ? null : 'until_required';
		if (!until) return 'until_required';
		if (!startUnknown && from && until && from > until) return 'range';
		if (knownStart && until >= knownStart) return 'overlap';
		return 'range';
	})();

	$: previewPeriods = result ? medPeriods(result) : [];
	/** True when saving gives the recorded regimen the start it never had. */
	$: adoptsStart = mode === 'earlier' && !!med && !knownStart && !!result;

	function rangeText(p: MedicationPeriod): string {
		const start = p.from
			? (p.fromPrecision === 'month' ? monthOf(p.from) : fmt(p.from))
			: $t('medication.combine_start_unknown');
		const end = p.to ? (p.toPrecision === 'month' ? monthOf(p.to) : fmt(p.to)) : '';
		return end ? `${start} – ${end}` : $t('medication.from', { date: start });
	}

	function submit() {
		if (!result) return;
		dispatch('apply', mode === 'past' ? { add: result } : { replace: result });
	}
</script>

<Modal
	{open}
	title={mode === 'past' ? $t('medication.past_title') : $t('medication.earlier_title', { name: med?.name ?? '' })}
	onClose={() => dispatch('close')}
>
	<div class="space-y-4">
		<p class="text-sm" style="color: var(--text-secondary)">
			{mode === 'past' ? $t('medication.past_hint') : $t('medication.earlier_hint')}
		</p>

		{#if mode === 'past'}
			<label class="block">
				<span class="text-xs font-medium" style="color: var(--text-secondary)">{$t('settings.medication_name')}</span>
				<input type="text" bind:value={name} class="input mt-1 w-full" autocomplete="off" data-testid="history-name" />
			</label>
		{/if}

		<div class="grid grid-cols-2 gap-3">
			<label class="block">
				<span class="text-xs font-medium" style="color: var(--text-secondary)">{$t('medication.dose')}</span>
				<input type="text" bind:value={dose} class="input mt-1 w-full" autocomplete="off" data-testid="history-dose" />
			</label>
			<label class="block">
				<span class="text-xs font-medium" style="color: var(--text-secondary)">{$t('settings.medication_schedule')}</span>
				<input type="text" bind:value={schedule} class="input mt-1 w-full" autocomplete="off" placeholder={$t('setup.med_schedule_placeholder')} data-testid="history-schedule" />
			</label>
		</div>

		{#if mode === 'past'}
			<label class="flex items-center gap-2 text-sm cursor-pointer" style="color: var(--text-primary)">
				<input type="checkbox" bind:checked={asNeeded} class="w-4 h-4" style="accent-color: var(--olive)" />
				{$t('settings.medication_as_needed')}
			</label>
		{/if}

		<div class="grid grid-cols-2 gap-3">
			<div>
				<span class="text-xs font-medium block" style="color: var(--text-secondary)">{$t('medication.history_from')}</span>
				<div class="mt-1">
					{#if startUnknown}
						<p class="text-sm py-2" style="color: var(--text-muted)" data-testid="history-start-unknown">{$t('medication.combine_start_unknown')}</p>
					{:else}
						<DatePicker id="history-from" bind:value={from} mode="month" max={today} ariaLabel={$t('medication.history_from')} />
					{/if}
				</div>
				<label class="flex items-center gap-2 text-xs mt-1 cursor-pointer" style="color: var(--text-secondary)">
					<input type="checkbox" bind:checked={startUnknown} class="w-4 h-4" style="accent-color: var(--olive)" data-testid="history-start-unknown-toggle" />
					{$t('medication.history_start_unknown')}
				</label>
			</div>
			<div>
				<span class="text-xs font-medium block" style="color: var(--text-secondary)">{$t('medication.history_until')}</span>
				<div class="mt-1">
					<DatePicker id="history-until" bind:value={until} mode="month" monthEdge="end" max={today} ariaLabel={$t('medication.history_until')} />
				</div>
				{#if mode === 'earlier' && untilDefault}
					<p class="text-xs mt-1" style="color: var(--text-muted)">{$t('medication.history_until_hint', { date: fmt(untilDefault) })}</p>
				{/if}
			</div>
		</div>

		{#if mode === 'past'}
			<label class="block">
				<span class="text-xs font-medium" style="color: var(--text-secondary)">{$t('medication.stop_reason')}</span>
				<select bind:value={stopReason} class="input mt-1 w-full" data-testid="history-stop-reason">
					<option value="">{$t('medication.stop_reason_none')}</option>
					{#each STOP_REASONS as reason}
						<option value={reason}>{stopReasonLabel(reason, $t)}</option>
					{/each}
				</select>
				<span class="text-xs mt-1 block" style="color: var(--text-muted)">{$t('medication.stop_reason_hint')}</span>
			</label>
		{/if}

		<label class="block">
			<span class="text-xs font-medium" style="color: var(--text-secondary)">{$t('medication.reason')} <span style="color: var(--text-muted)">({$t('common.optional')})</span></span>
			<input type="text" bind:value={note} class="input mt-1 w-full" autocomplete="off" placeholder={$t('medication.reason_placeholder')} data-testid="history-note" />
		</label>

		{#if problem}
			<p class="text-sm" style="color: var(--danger)" role="alert" data-testid="history-error">
				{#if problem === 'until_required'}
					{$t('medication.history_error_until')}
				{:else if problem === 'overlap'}
					{$t('medication.history_error_overlap', { date: knownStart ? fmt(knownStart) : '' })}
				{:else}
					{$t('medication.history_error_range')}
				{/if}
			</p>
		{:else if result}
			<div class="rounded-xl p-3 space-y-1" style="background: var(--surface-muted); border: 1px solid var(--border)" data-testid="history-preview" aria-live="polite">
				<p class="text-xs font-medium uppercase tracking-wider" style="color: var(--text-muted)">{$t('medication.preview_title')}</p>
				{#each previewPeriods as p}
					<p class="text-sm flex gap-2" style="color: var(--text-secondary)">
						<span class="shrink-0 tabular-nums">{rangeText(p)}</span>
						<span style="color: var(--text-primary)">{regimenText(p)}</span>
					</p>
				{/each}
				{#if adoptsStart && until}
					<p class="text-xs pt-1" style="color: var(--text-muted)" data-testid="history-adopts-start">
						{$t('medication.history_adopts_start', { name: med?.name ?? '', date: fmt(addDaysISO(until, 1)) })}
					</p>
				{/if}
				<p class="text-xs" style="color: var(--text-muted)">{$t('medication.history_not_tracked')}</p>
			</div>
		{/if}

		<div class="flex justify-end gap-2 pt-2">
			<button type="button" class="btn-secondary min-h-[44px] px-4" on:click={() => dispatch('close')}>{$t('common.cancel')}</button>
			<button type="button" class="btn-primary min-h-[44px] px-4" disabled={!result} on:click={submit} data-testid="history-apply">
				{$t('common.save')}
			</button>
		</div>
	</div>
</Modal>
