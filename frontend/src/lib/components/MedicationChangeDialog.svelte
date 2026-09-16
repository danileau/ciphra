<!--
	The one place a medication changes (dose history, 2026-09-16).

	"Edit" used to be a form that overwrote the dose — which silently rewrote
	every day already logged — and "delete" dropped the medication from every
	report. This dialog makes the difference between those things explicit:

	- change  — asks WHAT is changing (dose/schedule, stopping, or switching to
	            another drug) and FROM WHEN, then shows exactly how it will be
	            recorded before anything is saved. Days before the date keep what
	            they had.
	- correct — a typo fix. Labelled as retroactive, because it is: it rewrites
	            the latest period in place.
	- delete  — when days are already logged against the medication, stopping is
	            offered first; deleting anyway takes a second, explicit step that
	            says how many days lose the name.
	- resume  — a stopped medication taken again, from a date.

	The dialog computes the new medication(s) with the pure writers in
	`medicationHistory.ts` and hands them to the caller; it never saves.
-->
<script context="module" lang="ts">
	export type DialogMode = 'change' | 'correct' | 'delete' | 'resume';
</script>

<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { t, locale, plural, type Locale } from '$lib/i18n';
	import Modal from '$lib/components/Modal.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import {
		addDaysISO,
		applyCorrection,
		applyDoseChange,
		applyStop,
		applySwitch,
		earliestChangeDate,
		medPeriods,
		newMedicationId,
		periodOn,
		plannedChange,
	} from '$lib/blueprint/medicationHistory';
	import type { MedicationPeriod, MedicationSlot } from '$lib/blueprint/types';
	import { formatISODateChoice, type DateFormatChoice } from '$lib/blueprint/preferences';
	import { todayISO } from '$lib/date';

	export let open = false;
	export let med: MedicationSlot | null = null;
	export let mode: DialogMode = 'change';
	/** Days of history that hang off this medication (`medHistoryDays`). */
	export let historyDays = 0;
	export let dateFormat: DateFormatChoice | undefined = undefined;
	/** Injectable for tests; the local day the dialog treats as today. */
	export let today: string = todayISO();
	/** Other entries that look like the same drug (`duplicateGroups`) — the
	 *  pre-dose-history workaround. Delete then offers combining first. */
	export let duplicates: MedicationSlot[] = [];

	const dispatch = createEventDispatcher<{
		apply: { replace?: MedicationSlot; add?: MedicationSlot; remove?: string };
		combine: { with: MedicationSlot };
		close: void;
	}>();

	type Kind = 'dose' | 'stop' | 'switch';

	let view: DialogMode = 'change';
	let kind: Kind = 'dose';
	let from = '';
	let dose = '';
	let schedule = '';
	let note = '';
	let switchName = '';
	let switchDose = '';
	let switchSchedule = '';
	let switchAsNeeded = false;
	let corrName = '';
	let corrDose = '';
	let corrSchedule = '';
	let corrAsNeeded = false;
	let confirmDelete = false;

	// Hydrate on every open, so a cancelled edit never leaks into the next one.
	let hydratedFor = '';
	$: if (open && med && hydratedFor !== `${med.id}|${mode}`) hydrate(med, mode);
	$: if (!open) hydratedFor = '';

	function latest(m: MedicationSlot): MedicationPeriod {
		const periods = medPeriods(m);
		return periods[periods.length - 1];
	}

	function hydrate(m: MedicationSlot, initial: DialogMode) {
		hydratedFor = `${m.id}|${initial}`;
		view = initial;
		kind = 'dose';
		const current = periodOn(m, today) ?? latest(m);
		dose = current.dose;
		schedule = current.schedule;
		// A change usually starts with the next dose, so tomorrow; a resume is
		// usually "I'm taking it again", so today.
		from = initial === 'resume' ? today : addDaysISO(today, 1);
		note = '';
		switchName = '';
		switchDose = '';
		switchSchedule = current.schedule;
		switchAsNeeded = m.asNeeded;
		corrName = m.name;
		corrDose = latest(m).dose;
		corrSchedule = latest(m).schedule;
		corrAsNeeded = m.asNeeded;
		confirmDelete = false;
	}

	function close() {
		dispatch('close');
	}

	const fmt = (iso: string) => formatISODateChoice(iso, dateFormat);
	const regimenText = (p: { dose: string; schedule: string }) =>
		[p.dose, p.schedule].filter(Boolean).join(' · ');

	$: earliest = med ? earliestChangeDate(med) : null;
	$: plan = med ? plannedChange(med, today) : null;
	$: dateError = !from ? 'required' : earliest && from < earliest ? 'before_start' : null;

	// The result of the pending action — computed live, so the preview is the
	// exact thing that will be saved, not a description of it.
	$: result = (() => {
		if (!med || dateError) return null;
		if (view === 'resume' || (view === 'change' && kind === 'dose')) {
			if (!dose.trim()) return null;
			return { replace: applyDoseChange(med, { from, dose, schedule, note }) };
		}
		if (view === 'change' && kind === 'stop') {
			const stopped = applyStop(med, from, { endNote: note });
			return stopped ? { replace: stopped } : null;
		}
		if (view === 'change' && kind === 'switch') {
			if (!switchName.trim() || !switchDose.trim()) return null;
			const res = applySwitch(
				med,
				newMedicationId(),
				{ name: switchName, dose: switchDose, schedule: switchSchedule, asNeeded: switchAsNeeded, note },
				from,
			);
			return res ? { replace: res.stopped, add: res.started } : null;
		}
		return null;
	})();

	$: dayBefore = from ? addDaysISO(from, -1) : '';
	// A "change" to the dose and schedule that already apply that day records
	// nothing (the history would read "8 mg → 8 mg"); say so instead.
	$: noopChange = (() => {
		if (!med || !from || !(view === 'resume' || (view === 'change' && kind === 'dose'))) return null;
		const applying = periodOn(med, from);
		const before = periodOn(med, dayBefore);
		const same = (p: MedicationPeriod | null) =>
			!!p && p.dose.trim() === dose.trim() && p.schedule.trim() === schedule.trim();
		return same(applying) && same(before) ? applying : null;
	})();
	$: previewBefore = result?.replace && dayBefore ? periodOn(result.replace, dayBefore) : null;
	$: previewAfterPeriod = result
		? result.add
			? periodOn(result.add, from)
			: result.replace ? periodOn(result.replace, from) : null
		: null;
	$: replacesPlan = !!(plan && from && plan.date >= from && view !== 'correct' && view !== 'delete');

	function submitChange() {
		if (!result) return;
		dispatch('apply', result);
	}

	function submitCorrection() {
		if (!med || !corrName.trim() || !corrDose.trim()) return;
		dispatch('apply', {
			replace: applyCorrection(med, { name: corrName, dose: corrDose, schedule: corrSchedule, asNeeded: corrAsNeeded }),
		});
	}

	function submitDelete() {
		if (!med) return;
		dispatch('apply', { remove: med.id });
	}

	function stopInstead() {
		view = 'change';
		kind = 'stop';
		from = addDaysISO(today, 1);
		confirmDelete = false;
	}

	$: correctsWhat = (() => {
		if (!med) return '';
		const p = latest(med);
		if (!p.from) return $t('medication.correct_scope_all');
		return $t('medication.correct_scope_since', { date: fmt(p.from) });
	})();

	$: title = !med
		? ''
		: view === 'correct'
			? $t('medication.correct_title', { name: med.name })
			: view === 'delete'
				? $t('medication.delete_title', { name: med.name })
				: view === 'resume'
					? $t('medication.resume_title', { name: med.name })
					: $t('medication.change_title', { name: med.name });

	$: loc = $locale as Locale;
</script>

<Modal {open} {title} onClose={close}>
	{#if med}
		{#if view === 'change' || view === 'resume'}
			<div class="space-y-4">
				{#if view === 'change'}
					<fieldset class="rounded-xl p-3" style="border: 1px solid var(--border)">
						<legend class="text-xs px-1" style="color: var(--text-muted)">{$t('medication.what_changes')}</legend>
						<label class="flex items-start gap-2 cursor-pointer py-1.5">
							<input type="radio" name="med-change-kind" bind:group={kind} value="dose" class="mt-0.5 w-4 h-4" data-testid="med-kind-dose" />
							<span>
								<span class="text-sm block" style="color: var(--text-primary)">{$t('medication.kind_dose')}</span>
								<span class="text-xs" style="color: var(--text-muted)">{$t('medication.kind_dose_hint')}</span>
							</span>
						</label>
						<label class="flex items-start gap-2 cursor-pointer py-1.5">
							<input type="radio" name="med-change-kind" bind:group={kind} value="stop" class="mt-0.5 w-4 h-4" data-testid="med-kind-stop" />
							<span>
								<span class="text-sm block" style="color: var(--text-primary)">{$t('medication.kind_stop')}</span>
								<span class="text-xs" style="color: var(--text-muted)">{$t('medication.kind_stop_hint')}</span>
							</span>
						</label>
						<label class="flex items-start gap-2 cursor-pointer py-1.5">
							<input type="radio" name="med-change-kind" bind:group={kind} value="switch" class="mt-0.5 w-4 h-4" data-testid="med-kind-switch" />
							<span>
								<span class="text-sm block" style="color: var(--text-primary)">{$t('medication.kind_switch')}</span>
								<span class="text-xs" style="color: var(--text-muted)">{$t('medication.kind_switch_hint')}</span>
							</span>
						</label>
					</fieldset>
				{/if}

				{#if view === 'resume' || kind === 'dose'}
					<div class="grid grid-cols-2 gap-3">
						<label class="block">
							<span class="text-xs font-medium" style="color: var(--text-secondary)">{view === 'resume' ? $t('medication.dose') : $t('medication.new_dose')}</span>
							<input type="text" bind:value={dose} class="input mt-1 w-full" autocomplete="off" data-testid="med-change-dose" />
						</label>
						<label class="block">
							<span class="text-xs font-medium" style="color: var(--text-secondary)">{$t('settings.medication_schedule')}</span>
							<input type="text" bind:value={schedule} class="input mt-1 w-full" autocomplete="off" placeholder={$t('setup.med_schedule_placeholder')} data-testid="med-change-schedule" />
						</label>
					</div>
				{:else if kind === 'switch'}
					<label class="block">
						<span class="text-xs font-medium" style="color: var(--text-secondary)">{$t('medication.switch_name')}</span>
						<input type="text" bind:value={switchName} class="input mt-1 w-full" autocomplete="off" data-testid="med-switch-name" />
					</label>
					<div class="grid grid-cols-2 gap-3">
						<label class="block">
							<span class="text-xs font-medium" style="color: var(--text-secondary)">{$t('medication.dose')}</span>
							<input type="text" bind:value={switchDose} class="input mt-1 w-full" autocomplete="off" data-testid="med-switch-dose" />
						</label>
						<label class="block">
							<span class="text-xs font-medium" style="color: var(--text-secondary)">{$t('settings.medication_schedule')}</span>
							<input type="text" bind:value={switchSchedule} class="input mt-1 w-full" autocomplete="off" placeholder={$t('setup.med_schedule_placeholder')} />
						</label>
					</div>
					<label class="flex items-center gap-2 text-sm cursor-pointer" style="color: var(--text-primary)">
						<input type="checkbox" bind:checked={switchAsNeeded} class="w-4 h-4" style="accent-color: var(--olive)" />
						{$t('settings.medication_as_needed')}
					</label>
				{/if}

				<div>
					<label class="text-xs font-medium block" for="med-change-from" style="color: var(--text-secondary)">
						{kind === 'stop' && view === 'change' ? $t('medication.stop_from') : $t('medication.effective_from')}
					</label>
					<div class="mt-1">
						<DatePicker id="med-change-from" bind:value={from} format={dateFormat ?? 'dd.mm.yyyy'} ariaLabel={$t('medication.effective_from')} />
					</div>
				</div>

				<label class="block">
					<span class="text-xs font-medium" style="color: var(--text-secondary)">{$t('medication.reason')} <span style="color: var(--text-muted)">({$t('common.optional')})</span></span>
					<input type="text" bind:value={note} class="input mt-1 w-full" autocomplete="off" placeholder={$t('medication.reason_placeholder')} data-testid="med-change-note" />
				</label>

				{#if noopChange && !dateError}
					<p class="text-sm" style="color: var(--text-secondary)" role="status" data-testid="med-change-noop">
						{$t('medication.change_noop', { date: fmt(from), regimen: regimenText(noopChange) })}
					</p>
				{:else if dateError}
					<p class="text-sm" style="color: var(--danger)" role="alert" data-testid="med-change-error">
						{#if dateError === 'required'}
							{$t('medication.error_date_required')}
						{:else}
							{$t('medication.error_date_before_start', { date: earliest ? fmt(addDaysISO(earliest, -1)) : '' })}
						{/if}
					</p>
				{:else if result}
					<!-- The preview is rendered from the computed result, so what the
					     person reads here is what gets saved. -->
					<div class="rounded-xl p-3 space-y-1" style="background: var(--surface-muted); border: 1px solid var(--border)" data-testid="med-change-preview" aria-live="polite">
						<p class="text-xs font-medium uppercase tracking-wider" style="color: var(--text-muted)">{$t('medication.preview_title')}</p>
						<p class="text-sm flex gap-2" style="color: var(--text-secondary)">
							<span class="shrink-0 tabular-nums">{$t('medication.until', { date: fmt(dayBefore) })}</span>
							<span style="color: var(--text-primary)">
								{#if previewBefore}
									{kind === 'switch' && view === 'change' ? `${med.name} · ` : ''}{regimenText(previewBefore)}
								{:else}
									{$t('medication.not_taken')}
								{/if}
							</span>
						</p>
						<p class="text-sm flex gap-2" style="color: var(--text-secondary)">
							<span class="shrink-0 tabular-nums">{$t('medication.from', { date: fmt(from) })}</span>
							<span class="font-medium" style="color: var(--text-primary)">
								{#if previewAfterPeriod}
									{kind === 'switch' && view === 'change' ? `${switchName.trim()} · ` : ''}{regimenText(previewAfterPeriod)}
								{:else}
									{$t('medication.not_taken')}
								{/if}
							</span>
						</p>
						<p class="text-xs pt-1" style="color: var(--text-muted)">
							{#if previewBefore}
								{$t('medication.preview_keeps', { date: fmt(dayBefore), regimen: regimenText(previewBefore) })}
							{:else}
								{$t('medication.preview_keeps_history')}
							{/if}
						</p>
						{#if replacesPlan && plan}
							<p class="text-xs" style="color: var(--text-secondary)" data-testid="med-change-replaces-plan">
								{$t('medication.preview_replaces_plan', { date: fmt(plan.date) })}
							</p>
						{/if}
					</div>
				{/if}

				<div class="flex justify-end gap-2 pt-2">
					<button type="button" class="btn-secondary min-h-[44px] px-4" on:click={close}>{$t('common.cancel')}</button>
					<button type="button" class="btn-primary min-h-[44px] px-4" disabled={!result || !!noopChange} on:click={submitChange} data-testid="med-change-apply">
						{$t('medication.apply')}
					</button>
				</div>

				{#if view === 'change'}
					<div class="flex flex-wrap justify-center gap-4 pt-2 text-xs" style="border-top: 1px solid var(--border)">
						<button type="button" class="underline min-h-[36px]" style="color: var(--text-secondary)" on:click={() => (view = 'correct')} data-testid="med-open-correct">
							{$t('medication.correct_link')}
						</button>
						<button type="button" class="underline min-h-[36px]" style="color: var(--danger)" on:click={() => (view = 'delete')} data-testid="med-open-delete">
							{$t('common.delete')}
						</button>
					</div>
				{/if}
			</div>
		{:else if view === 'correct'}
			<div class="space-y-4">
				<p class="text-sm" style="color: var(--text-secondary)">{$t('medication.correct_hint')}</p>
				<label class="block">
					<span class="text-xs font-medium" style="color: var(--text-secondary)">{$t('settings.medication_name')}</span>
					<input type="text" bind:value={corrName} class="input mt-1 w-full" autocomplete="off" data-testid="med-correct-name" />
				</label>
				<div class="grid grid-cols-2 gap-3">
					<label class="block">
						<span class="text-xs font-medium" style="color: var(--text-secondary)">{$t('medication.dose')}</span>
						<input type="text" bind:value={corrDose} class="input mt-1 w-full" autocomplete="off" data-testid="med-correct-dose" />
					</label>
					<label class="block">
						<span class="text-xs font-medium" style="color: var(--text-secondary)">{$t('settings.medication_schedule')}</span>
						<input type="text" bind:value={corrSchedule} class="input mt-1 w-full" autocomplete="off" placeholder={$t('setup.med_schedule_placeholder')} />
					</label>
				</div>
				<label class="flex items-center gap-2 text-sm cursor-pointer" style="color: var(--text-primary)">
					<input type="checkbox" bind:checked={corrAsNeeded} class="w-4 h-4" style="accent-color: var(--olive)" />
					{$t('settings.medication_as_needed')}
				</label>
				<p class="text-xs" style="color: var(--text-muted)" data-testid="med-correct-scope">{correctsWhat}</p>
				<div class="flex justify-end gap-2 pt-2">
					<button type="button" class="btn-secondary min-h-[44px] px-4" on:click={() => (view = 'change')}>{$t('common.back')}</button>
					<button type="button" class="btn-primary min-h-[44px] px-4" disabled={!corrName.trim() || !corrDose.trim()} on:click={submitCorrection} data-testid="med-correct-apply">
						{$t('medication.correct_apply')}
					</button>
				</div>
			</div>
		{:else if view === 'delete'}
			<div class="space-y-4">
				{#if duplicates.length > 0}
					<!-- A same-named entry is almost always the old one-entry-per-dose
					     workaround: combining keeps both histories, deleting loses one. -->
					<div class="rounded-xl p-3 space-y-2" style="background: var(--surface-muted); border: 1px solid var(--border)" data-testid="med-delete-duplicate">
						<p class="text-sm" style="color: var(--text-primary)">{$t('medication.delete_has_duplicate', { name: med.name })}</p>
						{#each duplicates as other (other.id)}
							<button type="button" class="btn-primary w-full min-h-[44px] px-4" on:click={() => dispatch('combine', { with: other })} data-testid="med-delete-combine">
								{$t('medication.combine_with', { name: other.name })}
							</button>
						{/each}
					</div>
				{/if}
				{#if historyDays > 0}
					<p class="text-sm" style="color: var(--text-primary)" data-testid="med-delete-history">
						{plural($t, loc, 'medication.delete_has_history', historyDays, { name: med.name })}
					</p>
					<p class="text-sm" style="color: var(--text-secondary)">{$t('medication.delete_stop_instead_hint')}</p>
					{#if !confirmDelete}
						<div class="flex flex-col gap-2 pt-2">
							<button type="button" class="btn-primary min-h-[44px] px-4" on:click={stopInstead} data-testid="med-delete-stop-instead">
								{$t('medication.delete_stop_instead')}
							</button>
							<button type="button" class="btn-secondary min-h-[44px] px-4" style="color: var(--danger)" on:click={() => (confirmDelete = true)} data-testid="med-delete-anyway">
								{$t('medication.delete_anyway')}
							</button>
						</div>
					{:else}
						<div class="rounded-xl p-3 space-y-3" style="border: 1px solid var(--danger)" role="alert">
							<p class="text-sm font-medium" style="color: var(--danger)">{$t('medication.delete_final')}</p>
							<div class="flex justify-end gap-2">
								<button type="button" class="btn-secondary min-h-[44px] px-4" on:click={() => (confirmDelete = false)}>{$t('common.cancel')}</button>
								<button type="button" class="btn-secondary min-h-[44px] px-4" style="color: var(--danger); border-color: var(--danger)" on:click={submitDelete} data-testid="med-delete-confirm">
									{$t('common.delete')}
								</button>
							</div>
						</div>
					{/if}
				{:else}
					<p class="text-sm" style="color: var(--text-primary)">{$t('medication.delete_no_history', { name: med.name })}</p>
					<div class="flex justify-end gap-2 pt-2">
						<button type="button" class="btn-secondary min-h-[44px] px-4" on:click={() => (view = 'change')}>{$t('common.back')}</button>
						<button type="button" class="btn-secondary min-h-[44px] px-4" style="color: var(--danger); border-color: var(--danger)" on:click={submitDelete} data-testid="med-delete-confirm">
							{$t('common.delete')}
						</button>
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</Modal>
