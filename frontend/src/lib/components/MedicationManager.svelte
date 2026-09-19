<!--
	Settings → medications, with dose history (2026-09-16).

	What the list shows is dated, because a medication is no longer one fixed
	dose: the dose that applies today, since when (if known), and anything
	already planned ("from 17.09.: 12 mg"). Stopped medications move to their
	own list instead of disappearing — their days are still in every report,
	and they can be resumed. Each medication's recorded steps are one tap away.

	Every change goes through MedicationChangeDialog. This component only
	applies the dialog's result to the RAW blueprint and saves it — never
	`$resolvedBlueprint`, which strips custom items (see customizations.ts).
-->
<script lang="ts">
	import { get } from 'svelte/store';
	import { t } from '$lib/i18n';
	import { blueprint, resolvedBlueprint } from '$lib/blueprint';
	import {
		createMedication,
		duplicateGroups,
		medHistoryDays,
		medNameKey,
		medicationChanges,
		medPeriods,
		medStartDate,
		medStatusOn,
		newMedicationId,
		periodOn,
		plannedChange,
		removeReportedPeriod,
		undoLastChange,
		type MedChange,
	} from '$lib/blueprint/medicationHistory';
	import type { Blueprint, MedicationSlot } from '$lib/blueprint/types';
	import { formatISODateChoice } from '$lib/blueprint/preferences';
	import { documents } from '$lib/stores/documents';
	import { todayISO } from '$lib/date';
	import MedicationChangeDialog, { type DialogMode } from '$lib/components/MedicationChangeDialog.svelte';
	import MedicationCombineDialog from '$lib/components/MedicationCombineDialog.svelte';
	import MedicationHistoryDialog, { type HistoryDialogMode } from '$lib/components/MedicationHistoryDialog.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';

	// Render from the resolved view (medications are not customized, so it is
	// the same list); mutate the raw store — see `persist`.
	$: bp = $resolvedBlueprint;
	$: meds = bp?.medications ?? [];
	const today = todayISO();

	$: currentMeds = meds.filter((m) => medStatusOn(m, today) !== 'stopped');
	$: stoppedMeds = meds.filter((m) => medStatusOn(m, today) === 'stopped');

	const fmt = (iso: string) => formatISODateChoice(iso, bp?.dateFormat);
	const monthOf = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
	/** A date the person gave as a month reads as a month, not as a day
	 *  nobody chose (2026-09-19). */
	const edge = (iso: string | undefined, precision: 'month' | undefined) =>
		!iso ? '' : precision === 'month' ? monthOf(iso) : fmt(iso);
	const regimenText = (p: { dose: string; schedule: string }) =>
		[p.dose, p.schedule].filter(Boolean).join(' · ');

	function currentRegimen(m: MedicationSlot) {
		const periods = medPeriods(m);
		return periodOn(m, today) ?? periods[periods.length - 1];
	}

	function nameOf(id: string | undefined): string {
		return meds.find((m) => m.id === id)?.name ?? '';
	}

	// ─── History disclosure ───
	let expanded: Record<string, boolean> = {};
	function changesFor(m: MedicationSlot): MedChange[] {
		return medicationChanges([m]).reverse();
	}

	// ─── Duplicates (one entry per dose, the pre-dose-history workaround) ───
	$: duplicates = duplicateGroups(meds);
	function duplicatesOf(m: MedicationSlot | null): MedicationSlot[] {
		if (!m) return [];
		const key = medNameKey(m.name);
		return meds.filter((x) => x.id !== m.id && medNameKey(x.name) === key);
	}
	let combineOpen = false;
	let combinePair: [MedicationSlot, MedicationSlot] | null = null;
	function openCombine(a: MedicationSlot, b: MedicationSlot) {
		// List order = the order they were added; the first keeps its id.
		combinePair = meds.indexOf(a) <= meds.indexOf(b) ? [a, b] : [b, a];
		saveError = false;
		dialogOpen = false;
		combineOpen = true;
	}
	async function handleCombine(e: CustomEvent<{ replace: MedicationSlot; remove: string }>) {
		const { replace, remove } = e.detail;
		const ok = await persist((list) =>
			list.filter((m) => m.id !== remove).map((m) => (m.id === replace.id ? replace : m)),
		);
		if (ok) combineOpen = false;
	}

	// ─── Dialog ───
	let dialogOpen = false;
	let dialogMed: MedicationSlot | null = null;
	let dialogMode: DialogMode = 'change';
	let saveError = false;
	$: dialogHistoryDays = dialogMed ? medHistoryDays(dialogMed, $documents) : 0;

	function openDialog(m: MedicationSlot, mode: DialogMode) {
		dialogMed = m;
		dialogMode = mode;
		saveError = false;
		dialogOpen = true;
	}

	// ─── History from before ciphra (2026-09-19) ───
	let historyOpen = false;
	let historyMode: HistoryDialogMode = 'earlier';
	let historyMed: MedicationSlot | null = null;

	function openHistory(m: MedicationSlot | null, hMode: HistoryDialogMode) {
		historyMed = m;
		historyMode = hMode;
		saveError = false;
		dialogOpen = false;
		addOpen = false;
		historyOpen = true;
	}

	/** Periods the person filled in afterwards, oldest first — the rows the
	 *  history list offers to take back. */
	function reportedPeriodsOf(m: MedicationSlot) {
		return medPeriods(m)
			.map((p, index) => ({ p, index }))
			.filter(({ p }) => p.reported);
	}

	async function removeReported(m: MedicationSlot, index: number) {
		const next = removeReportedPeriod(m, index);
		if (!next) return;
		await persist((list) => list.map((x) => (x.id === m.id ? next : x)));
	}

	function historyRangeText(p: { from?: string; to?: string; fromPrecision?: 'month'; toPrecision?: 'month' }): string {
		const start = p.from ? edge(p.from, p.fromPrecision) : $t('medication.combine_start_unknown');
		const end = edge(p.to, p.toPrecision);
		return end ? `${start} – ${end}` : start;
	}

	async function persist(mutate: (meds: MedicationSlot[]) => MedicationSlot[]): Promise<boolean> {
		const raw = get(blueprint);
		if (!raw) return false;
		const next: Blueprint = JSON.parse(JSON.stringify(raw));
		next.medications = mutate(next.medications ?? []);
		const ok = await blueprint.save(next);
		saveError = !ok;
		return ok;
	}

	async function handleApply(e: CustomEvent<{ replace?: MedicationSlot; add?: MedicationSlot; remove?: string }>) {
		const { replace, add, remove } = e.detail;
		const ok = await persist((list) => {
			let out = list;
			if (remove) out = out.filter((m) => m.id !== remove);
			if (replace) out = out.map((m) => (m.id === replace.id ? replace : m));
			if (add) out = [...out, add];
			return out;
		});
		if (ok) {
			dialogOpen = false;
			historyOpen = false;
		}
	}

	async function undo(m: MedicationSlot) {
		const undone = undoLastChange(m);
		if (!undone) return;
		await persist((list) => list.map((x) => (x.id === m.id ? undone : x)));
	}

	// ─── Add ───
	let addOpen = false;
	let addName = '';
	let addDose = '';
	let addSchedule = '';
	let addAsNeeded = false;
	let addFrom = '';

	function openAdd() {
		addName = '';
		addDose = '';
		addSchedule = '';
		addAsNeeded = false;
		addFrom = '';
		saveError = false;
		addOpen = true;
	}

	async function saveAdd() {
		if (!addName.trim() || !addDose.trim()) return;
		const med = createMedication(newMedicationId(), {
			name: addName,
			dose: addDose,
			schedule: addSchedule,
			asNeeded: addAsNeeded,
			from: addFrom || undefined,
		});
		const ok = await persist((list) => [...list, med]);
		if (ok) addOpen = false;
	}

	function describe(c: MedChange): string {
		if (c.kind === 'change') {
			return $t('medication.history_change', {
				before: regimenText(c.before ?? { dose: '', schedule: '' }),
				after: regimenText(c.after ?? { dose: '', schedule: '' }),
			});
		}
		if (c.kind === 'start') {
			return c.switchedFrom
				? $t('medication.history_start_switch', { regimen: regimenText(c.after ?? { dose: '', schedule: '' }), name: nameOf(c.switchedFrom) })
				: $t('medication.history_start', { regimen: regimenText(c.after ?? { dose: '', schedule: '' }) });
		}
		return c.switchedTo
			? $t('medication.history_stop_switch', { name: nameOf(c.switchedTo) })
			: $t('medication.history_stop');
	}
</script>

<section class="card p-5">
	{#each duplicates as group (group.map((m) => m.id).join('|'))}
		<div class="p-3 mb-4 rounded-xl space-y-2" style="border: 1px solid var(--olive); background: var(--olive-light)" data-testid="med-duplicate-notice">
			<p class="text-sm font-medium" style="color: var(--text-primary)">{$t('medication.duplicate_notice', { name: group[0].name })}</p>
			<p class="text-xs" style="color: var(--text-secondary)">{$t('medication.duplicate_hint')}</p>
			<button
				type="button"
				on:click={() => openCombine(group[0], group[1])}
				class="text-xs font-medium px-3 py-1.5 rounded-lg min-h-[36px]"
				style="color: var(--text-primary); background: var(--surface-card); border: 1px solid var(--border)"
				data-testid="med-duplicate-combine"
			>
				{$t('medication.combine')}
			</button>
		</div>
	{/each}

	{#if meds.length === 0}
		<p class="text-sm mb-4" style="color: var(--text-secondary)">{$t('settings.medications_empty')}</p>
	{/if}

	{#if currentMeds.length > 0}
		<ul class="space-y-2 mb-4" data-testid="med-list-current">
			{#each currentMeds as med (med.id)}
				{@const regimen = currentRegimen(med)}
				{@const status = medStatusOn(med, today)}
				{@const start = medStartDate(med)}
				{@const plan = plannedChange(med, today)}
				{@const changes = changesFor(med)}
				<li class="p-3 rounded-xl" style="background: var(--surface-muted); border: 1px solid var(--border)">
					<div class="flex items-center gap-3">
						<div class="flex-1 min-w-0">
							<p class="text-sm font-medium truncate" style="color: var(--text-primary)">{med.name}</p>
							<p class="text-xs mt-0.5" style="color: var(--text-secondary)">
								{regimenText(regimen)}{med.asNeeded ? ' · ' + $t('settings.medication_as_needed') : ''}{status === 'active' && start ? ' · ' + $t('medication.since', { date: edge(start, medPeriods(med)[0].fromPrecision) }) : ''}
							</p>
							{#if status === 'upcoming' && start}
								<p class="text-xs mt-0.5 font-medium" style="color: var(--olive)" data-testid="med-upcoming">
									{$t('medication.starts_on', { date: fmt(start) })}
								</p>
							{:else if plan}
								<p class="text-xs mt-0.5 font-medium" style="color: var(--olive)" data-testid="med-planned">
									{#if plan.next}
										{$t('medication.planned_change', { date: fmt(plan.date), regimen: regimenText(plan.next) })}
									{:else}
										{$t('medication.planned_stop', { date: fmt(plan.date) })}
									{/if}
								</p>
							{/if}
						</div>
						<button
							type="button"
							on:click={() => openDialog(med, 'change')}
							class="text-xs font-medium px-3 py-1.5 rounded-lg min-h-[36px] shrink-0"
							style="color: var(--text-secondary); background: var(--surface-card); border: 1px solid var(--border)"
							data-testid="med-change-open"
						>
							{$t('medication.change')}
						</button>
					</div>
					{#if changes.length === 0}
						<button type="button" class="text-xs mt-2 underline min-h-[32px]" style="color: var(--text-muted)" on:click={() => openHistory(med, 'earlier')} data-testid="med-add-earlier">
							{$t('medication.earlier_add')}
						</button>
					{/if}
					{#if changes.length > 0}
						<button
							type="button"
							class="text-xs mt-2 underline min-h-[32px]"
							style="color: var(--text-muted)"
							aria-expanded={!!expanded[med.id]}
							on:click={() => (expanded = { ...expanded, [med.id]: !expanded[med.id] })}
						>
							{$t('medication.history_toggle', { count: changes.length })}
						</button>
						{#if expanded[med.id]}
							<ol class="mt-1 space-y-1" data-testid="med-history">
								{#each changes as c}
									<li class="text-xs flex gap-2" style="color: var(--text-secondary)">
										<span class="shrink-0 tabular-nums" style="color: var(--text-muted)">{fmt(c.date)}</span>
										<span>{describe(c)}{c.note ? ` — ${c.note}` : ''}</span>
									</li>
								{/each}
							</ol>
							{#each reportedPeriodsOf(med) as row (row.index)}
								<p class="text-xs mt-1 flex gap-2 items-baseline" style="color: var(--text-muted)" data-testid="med-reported-period">
									<span class="shrink-0 tabular-nums">{historyRangeText(row.p)}</span>
									<span>{regimenText(row.p)} · {$t('medication.history_reported')}</span>
									<button type="button" class="underline min-h-[32px]" style="color: var(--text-secondary)" on:click={() => removeReported(med, row.index)} data-testid="med-reported-remove">
										{$t('common.remove')}
									</button>
								</p>
							{/each}
							<div class="flex gap-4">
								<button type="button" class="text-xs mt-2 underline min-h-[32px]" style="color: var(--text-secondary)" on:click={() => undo(med)} data-testid="med-undo">
									{$t('medication.undo_last')}
								</button>
								<button type="button" class="text-xs mt-2 underline min-h-[32px]" style="color: var(--text-secondary)" on:click={() => openHistory(med, 'earlier')} data-testid="med-add-earlier">
									{$t('medication.earlier_add')}
								</button>
							</div>
						{/if}
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if stoppedMeds.length > 0}
		<h3 class="text-xs font-medium uppercase tracking-wider mb-2" style="color: var(--text-muted)">{$t('medication.section_stopped')}</h3>
		<ul class="space-y-2 mb-4" data-testid="med-list-stopped">
			{#each stoppedMeds as med (med.id)}
				{@const periods = medPeriods(med)}
				{@const last = periods[periods.length - 1]}
				{@const changes = changesFor(med)}
				<li class="p-3 rounded-xl" style="border: 1px dashed var(--border)">
					<div class="flex items-center gap-3">
						<div class="flex-1 min-w-0">
							<p class="text-sm font-medium truncate" style="color: var(--text-secondary)">{med.name}</p>
							<p class="text-xs mt-0.5" style="color: var(--text-muted)">
								{regimenText(last)}{last.to ? ' · ' + $t('medication.last_taken', { date: edge(last.to, last.toPrecision) }) : ''}
							</p>
						</div>
						<button
							type="button"
							on:click={() => openDialog(med, 'resume')}
							class="text-xs font-medium px-3 py-1.5 rounded-lg min-h-[36px] shrink-0"
							style="color: var(--text-secondary); background: var(--surface-card); border: 1px solid var(--border)"
						>
							{$t('medication.resume')}
						</button>
					</div>
					{#if changes.length > 0}
						<button
							type="button"
							class="text-xs mt-2 underline min-h-[32px]"
							style="color: var(--text-muted)"
							aria-expanded={!!expanded[med.id]}
							on:click={() => (expanded = { ...expanded, [med.id]: !expanded[med.id] })}
						>
							{$t('medication.history_toggle', { count: changes.length })}
						</button>
						{#if expanded[med.id]}
							<ol class="mt-1 space-y-1">
								{#each changes as c}
									<li class="text-xs flex gap-2" style="color: var(--text-secondary)">
										<span class="shrink-0 tabular-nums" style="color: var(--text-muted)">{fmt(c.date)}</span>
										<span>{describe(c)}{c.note ? ` — ${c.note}` : ''}</span>
									</li>
								{/each}
							</ol>
							<div class="flex gap-4">
								<button type="button" class="text-xs mt-2 underline min-h-[32px]" style="color: var(--text-secondary)" on:click={() => undo(med)}>
									{$t('medication.undo_last')}
								</button>
								<button type="button" class="text-xs mt-2 underline min-h-[32px]" style="color: var(--danger)" on:click={() => openDialog(med, 'delete')}>
									{$t('common.delete')}
								</button>
							</div>
						{/if}
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if saveError}
		<p class="text-sm mb-3" style="color: var(--danger)" role="alert">{$t('medication.save_failed')}</p>
	{/if}

	{#if !addOpen}
		<div class="space-y-2">
			<button type="button" on:click={openAdd} class="btn-secondary w-full rounded-xl text-sm font-medium min-h-[44px]">
				{$t('settings.add_medication')}
			</button>
			<button type="button" on:click={() => openHistory(null, 'past')} class="w-full rounded-xl text-sm min-h-[44px]" style="color: var(--text-secondary); background: transparent; border: 1px dashed var(--border)" data-testid="med-add-past">
				{$t('medication.past_add')}
			</button>
		</div>
	{:else}
		<form on:submit|preventDefault={saveAdd} class="space-y-3 p-4 rounded-xl" style="background: var(--surface-muted); border: 1px solid var(--border)">
			<h4 class="text-xs font-medium uppercase tracking-wider" style="color: var(--text-muted)">{$t('settings.add_medication')}</h4>
			<div>
				<label class="text-xs block mb-1" for="med-name" style="color: var(--text-secondary)">{$t('settings.medication_name')}</label>
				<input id="med-name" type="text" bind:value={addName} class="input" required />
			</div>
			<div>
				<label class="text-xs block mb-1" for="med-dose" style="color: var(--text-secondary)">{$t('settings.medication_dose')}</label>
				<input id="med-dose" type="text" bind:value={addDose} class="input" placeholder="10mg" required />
			</div>
			<div>
				<label class="text-xs block mb-1" for="med-schedule" style="color: var(--text-secondary)">{$t('settings.medication_schedule')}</label>
				<input id="med-schedule" type="text" bind:value={addSchedule} class="input" placeholder={$t('setup.med_schedule_placeholder')} />
			</div>
			<div>
				<label class="text-xs block mb-1" for="med-from" style="color: var(--text-secondary)">
					{$t('medication.start_date')} <span style="color: var(--text-muted)">({$t('common.optional')})</span>
				</label>
				<DatePicker id="med-from" bind:value={addFrom} format={bp?.dateFormat ?? 'dd.mm.yyyy'} ariaLabel={$t('medication.start_date')} />
				<p class="text-xs mt-1" style="color: var(--text-muted)">{$t('medication.start_date_hint')}</p>
			</div>
			<label class="flex items-center gap-2 text-sm cursor-pointer" style="color: var(--text-primary)">
				<input type="checkbox" bind:checked={addAsNeeded} class="w-4 h-4" style="accent-color: var(--olive)" />
				{$t('settings.medication_as_needed')}
			</label>
			<div class="flex gap-3 pt-1">
				<button type="button" on:click={() => (addOpen = false)} class="btn-secondary flex-1 rounded-xl text-sm font-medium min-h-[44px]">
					{$t('common.cancel')}
				</button>
				<button type="submit" disabled={!addName.trim() || !addDose.trim()} class="btn-primary flex-1 rounded-xl text-sm font-medium min-h-[44px]">
					{$t('settings.medication_save')}
				</button>
			</div>
		</form>
	{/if}
</section>

<MedicationHistoryDialog
	open={historyOpen}
	mode={historyMode}
	med={historyMed}
	dateFormat={bp?.dateFormat}
	{today}
	on:apply={handleApply}
	on:close={() => (historyOpen = false)}
/>

<MedicationChangeDialog
	open={dialogOpen}
	med={dialogMed}
	mode={dialogMode}
	historyDays={dialogHistoryDays}
	dateFormat={bp?.dateFormat}
	{today}
	duplicates={duplicatesOf(dialogMed)}
	on:apply={handleApply}
	on:combine={(e) => dialogMed && openCombine(dialogMed, e.detail.with)}
	on:close={() => (dialogOpen = false)}
/>

<MedicationCombineDialog
	open={combineOpen}
	pair={combinePair}
	docs={$documents}
	dateFormat={bp?.dateFormat}
	on:apply={handleCombine}
	on:close={() => (combineOpen = false)}
/>
