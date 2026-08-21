<!--
	ciphra — pre-export review for note markers.

	Freeform note markers are the only export content authored as prose, and
	people write prose: a real export carried lines naming a third party, a
	night-time detail, and a second physician's opinion. The field is labelled
	"Notiz" and, until now, said only that it draws something on a chart.

	So inclusion is OPT-IN, decided here, at the moment of generating the
	document rather than at the moment of writing. Nothing is preselected. A
	user who wants "Dosis erhöht" on the doctor's report ticks it; a user who
	wrote something for themselves does nothing and it stays theirs.

	Recorded data is NOT negotiable here — entries, episodes, vitals and
	medication administrations are the report. This dialog governs prose only.

	The dialog is skipped entirely when the window holds no note markers, so
	the ordinary export keeps its click count.
-->
<script lang="ts">
	import { createEventDispatcher, tick } from 'svelte';
	import { t, locale, plural } from '$lib/i18n';
	import Modal from './Modal.svelte';
	import type { NoteMarker } from '$lib/reports/noteMarkers';

	export let open = false;
	export let notes: NoteMarker[] = [];
	/** Human label of the period being exported, e.g. "Jan 2023 – Dez 2023". */
	export let periodLabel = '';

	const dispatch = createEventDispatcher<{ confirm: number[]; cancel: void }>();

	let selected = new Set<number>();
	let listEl: HTMLDivElement | null = null;

	// Reset on every open: a decision about which sentences a doctor may read
	// is not a preference to carry over from the last export.
	$: if (open) {
		selected = new Set();
		tick().then(() => listEl?.scrollTo({ top: 0 }));
	}

	function toggle(id: number) {
		const next = new Set(selected);
		next.has(id) ? next.delete(id) : next.add(id);
		selected = next;
	}
	const allSelected = (s: Set<number>, n: NoteMarker[]) => n.length > 0 && s.size === n.length;
	function toggleAll() {
		selected = allSelected(selected, notes) ? new Set() : new Set(notes.map((n) => n.id));
	}

	const fmt = (iso: string) =>
		new Date(iso + 'T12:00:00').toLocaleDateString($locale, {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
		});
</script>

<Modal {open} onClose={() => dispatch('cancel')}>
	<div class="enr">
		<h2 class="enr-title">{$t('export_review.title')}</h2>
		<p class="enr-lead">{$t('export_review.lead', { period: periodLabel })}</p>

		<div class="enr-bar">
			<span class="enr-count">
				{plural($t, $locale, 'export_review.selected', selected.size, { total: notes.length })}
			</span>
			<button type="button" class="enr-all" on:click={toggleAll}>
				{allSelected(selected, notes) ? $t('export_review.select_none') : $t('export_review.select_all')}
			</button>
		</div>

		<div class="enr-list" bind:this={listEl}>
			{#each notes as n (n.id)}
				<label class="enr-row">
					<input
						type="checkbox"
						checked={selected.has(n.id)}
						on:change={() => toggle(n.id)}
						data-testid="export-review-note"
						data-note-id={n.id}
					/>
					<span class="enr-date">{fmt(n.dateISO)}</span>
					<span class="enr-text">{n.text}</span>
				</label>
			{/each}
		</div>

		<p class="enr-foot">{$t('export_review.footnote')}</p>

		<div class="enr-actions">
			<button type="button" class="enr-btn enr-btn--ghost" on:click={() => dispatch('cancel')}>
				{$t('common.cancel')}
			</button>
			<button
				type="button"
				class="enr-btn enr-btn--primary"
				data-testid="export-review-confirm"
				on:click={() => dispatch('confirm', [...selected])}
			>
				{$t('export_review.confirm')}
			</button>
		</div>
	</div>
</Modal>

<style>
	.enr {
		display: flex;
		flex-direction: column;
		max-height: 78vh;
	}
	.enr-title {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-primary);
	}
	.enr-lead {
		margin: 0.35rem 0 0.75rem;
		font-size: 0.8125rem;
		line-height: 1.45;
		color: var(--text-secondary);
	}
	.enr-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding-bottom: 0.4rem;
		border-bottom: 1px solid var(--border);
	}
	.enr-count {
		font-size: 0.75rem;
		color: var(--text-muted);
	}
	.enr-all {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--brand);
		background: none;
		border: none;
		cursor: pointer;
		/* 44px touch floor — the /reports contract. */
		min-height: 44px;
		padding: 0 0.25rem;
	}
	.enr-list {
		flex: 1;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
		margin: 0.1rem 0 0.6rem;
	}
	.enr-row {
		display: grid;
		grid-template-columns: auto auto 1fr;
		align-items: start;
		gap: 0.55rem;
		min-height: 44px;
		padding: 0.5rem 0.15rem;
		border-bottom: 1px solid var(--border-subtle, var(--border));
		cursor: pointer;
	}
	.enr-row input {
		width: 1rem;
		height: 1rem;
		margin-top: 0.15rem;
	}
	.enr-date {
		font-size: 0.6875rem;
		color: var(--text-muted);
		white-space: nowrap;
		padding-top: 0.1rem;
	}
	.enr-text {
		font-size: 0.8125rem;
		line-height: 1.4;
		color: var(--text-primary);
		overflow-wrap: anywhere;
	}
	.enr-foot {
		margin: 0 0 0.75rem;
		font-size: 0.6875rem;
		line-height: 1.45;
		color: var(--text-muted);
	}
	.enr-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
	.enr-btn {
		min-height: 44px;
		padding: 0 1rem;
		border-radius: 0.6rem;
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
	}
	.enr-btn--ghost {
		background: transparent;
		border: 1px solid var(--border);
		color: var(--text-secondary);
	}
	.enr-btn--primary {
		background: var(--brand);
		border: 1px solid var(--brand);
		color: #fff;
	}
</style>
