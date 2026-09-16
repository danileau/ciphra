<!--
	Medication timeline for /reports (dose history, 2026-09-16).

	One lane per medication that was part of the regimen inside the window;
	each dose period is a segment across the window's date axis, labelled with
	its dose where there is room, with a visible step where the dose changed
	and a gap where it was not taken. Below it, the same changes as a dated
	list — the readable, screen-reader-accessible form of the picture, and the
	only form that still works on a narrow phone.

	Why a strip of its own instead of marks on the trend chart: the trend chart
	is aggregate-axis (24 monthly bins in year view), where per-event marks were
	tried and rejected as reading like rendering glitches. Sharing the window
	with the chart above keeps them comparable without drawing on it; the
	chart's tooltip names the change for the bin that holds it.

	Descriptive only. It shows what was taken when — never a before/after
	comparison of symptoms around a change (see pdf.no-assessment.test.ts).

	Render-only: the caller passes the medications and the window.
-->
<script lang="ts">
	import { t } from '$lib/i18n';
	import {
		addDaysISO,
		medPeriods,
		medicationChanges,
		type MedChange,
	} from '$lib/blueprint/medicationHistory';
	import type { MedicationSlot } from '$lib/blueprint/types';
	import { formatISODateChoice, type DateFormatChoice } from '$lib/blueprint/preferences';

	export let meds: MedicationSlot[];
	/** Inclusive local `YYYY-MM-DD` bounds of the window. */
	export let from: string;
	export let to: string;
	export let dateFormat: DateFormatChoice | undefined = undefined;

	const fmt = (iso: string) => formatISODateChoice(iso, dateFormat);
	const regimenText = (p: { dose: string; schedule: string }) =>
		[p.dose, p.schedule].filter(Boolean).join(' · ');

	function dayIndex(iso: string): number {
		const [y, m, d] = iso.split('-').map(Number);
		const [fy, fm, fd] = from.split('-').map(Number);
		return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(fy, fm - 1, fd)) / 86400000);
	}

	interface Segment { left: number; width: number; dose: string; alt: boolean; stepIn: boolean }
	interface Lane { id: string; name: string; segments: Segment[] }

	$: totalDays = Math.max(1, dayIndex(to) + 1);
	$: changes = medicationChanges(meds, { from, to });
	$: changedIds = new Set(changes.map((c) => c.medId));
	$: lanes = (() => {
		const out: Lane[] = [];
		for (const med of meds) {
			// A solid bar says "part of the daily regimen". That is true of a
			// scheduled medication, not of an as-needed one — an unchanged
			// rescue medication drawn across the whole month read as taken
			// every day. As-needed lanes appear only when their dose changed.
			if (med.asNeeded && !changedIds.has(med.id)) continue;
			const segments: Segment[] = [];
			const periods = medPeriods(med);
			periods.forEach((p, i) => {
				if (p.from && p.from > to) return;
				if (p.to && p.to < from) return;
				const s = !p.from || p.from < from ? from : p.from;
				const e = !p.to || p.to > to ? to : p.to;
				const prev = periods[i - 1];
				segments.push({
					left: (dayIndex(s) / totalDays) * 100,
					width: ((dayIndex(e) - dayIndex(s) + 1) / totalDays) * 100,
					dose: p.dose,
					alt: i % 2 === 1,
					// A step, not a gap: the previous period ended the day before.
					stepIn: !!(prev?.to && p.from && p.from >= from && addDaysISO(prev.to, 1) === p.from),
				});
			});
			if (segments.length > 0) out.push({ id: med.id, name: med.name, segments });
		}
		return out;
	})();

	function nameOf(id: string | undefined): string {
		return meds.find((m) => m.id === id)?.name ?? '';
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

{#if lanes.length > 0}
	<section class="card p-4 mb-4" aria-labelledby="med-timeline-title" data-testid="med-timeline">
		<div class="medtl-header">
			<h2 id="med-timeline-title" class="medtl-title">{$t('reports.med_timeline_title')}</h2>
			<span class="medtl-range">{fmt(from)} – {fmt(to)}</span>
		</div>

		<!-- The picture. aria-hidden: the dated list below carries the same
		     information in a form a screen reader can walk. -->
		<div class="medtl-lanes" aria-hidden="true">
			{#each lanes as lane (lane.id)}
				<div class="medtl-lane">
					<span class="medtl-name">{lane.name}</span>
					<div class="medtl-track">
						{#each lane.segments as seg}
							<span
								class="medtl-seg"
								class:medtl-seg--alt={seg.alt}
								class:medtl-seg--step={seg.stepIn}
								style="left: {seg.left}%; width: {seg.width}%"
								title={seg.dose}
							>
								{#if seg.width >= 14}<span class="medtl-dose">{seg.dose}</span>{/if}
							</span>
						{/each}
					</div>
				</div>
			{/each}
		</div>

		{#if changes.length > 0}
			<ol class="medtl-changes">
				{#each changes as c}
					<li>
						<span class="medtl-date">{fmt(c.date)}</span>
						<span><strong>{c.name}</strong> · {describe(c)}{c.note ? ` — ${c.note}` : ''}</span>
					</li>
				{/each}
			</ol>
		{/if}
	</section>
{/if}

<style>
	.medtl-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 12px;
	}
	.medtl-title {
		font-size: 15px;
		font-weight: 600;
		color: var(--text-primary);
	}
	.medtl-range {
		font-size: 12px;
		color: var(--text-muted);
	}
	.medtl-lanes {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.medtl-name {
		display: block;
		font-size: 12px;
		color: var(--text-secondary);
		margin-bottom: 3px;
	}
	.medtl-track {
		position: relative;
		height: 22px;
		border-radius: 6px;
		background: var(--surface-muted);
	}
	.medtl-seg {
		position: absolute;
		top: 0;
		bottom: 0;
		border-radius: 6px;
		background: var(--olive);
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.medtl-seg--alt {
		background: rgba(var(--olive-rgb), 0.4);
	}
	/* The dose step: a hairline notch in the surface colour where one dose
	   hands over to the next, so two adjacent segments never merge. */
	.medtl-seg--step {
		box-shadow: inset 2px 0 0 var(--surface-card);
	}
	.medtl-dose {
		font-size: 11px;
		font-weight: 600;
		color: var(--surface-card);
		white-space: nowrap;
		padding: 0 4px;
		text-overflow: ellipsis;
		overflow: hidden;
	}
	/* The lighter shade needs dark text to stay readable in both themes. */
	.medtl-seg--alt .medtl-dose {
		color: var(--text-primary);
	}
	.medtl-changes {
		list-style: none;
		margin: 14px 0 0;
		padding: 10px 0 0;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 13px;
		color: var(--text-secondary);
	}
	.medtl-changes li {
		display: flex;
		gap: 8px;
	}
	.medtl-date {
		flex-shrink: 0;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
	.medtl-changes strong {
		font-weight: 600;
		color: var(--text-primary);
	}
</style>
