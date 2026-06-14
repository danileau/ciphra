<!-- primitive-exempt: ConfirmDelete — rail today-entries use a compact
	 40px (not 44px) tap target and a non-btn-secondary cancel (surface-muted
	 / text-secondary inline) to fit the denser right-rail rhythm. Swapping
	 to the 44px btn-secondary primitive would stretch the row and push the
	 rail content below the fold on 1024px width. Revisit if/when
	 ConfirmDelete grows a `size=sm` variant. -->
<script lang="ts">
	// CIPH-750 / CIPH-781 — Dashboard right-rail (≥1024px).
	// Rebalanced in CIPH-781: compliance + reports moved IN from CompanionMain
	// (they're the "how am I doing" + "give to doctor" at-a-glance cards that
	// belong in the 1/3 rail), "Wie geht's dir?" trend chart moved OUT into
	// the main 2/3 column alongside the other charts.
	import { t } from '$lib/i18n';
	import EntryPreview from '$lib/components/EntryPreview.svelte';
	import GapTrendSpark from '$lib/components/GapTrendSpark.svelte';
	import type { CiphraDocument } from '$lib/stores/documents';
	import type { Blueprint } from '$lib/blueprint/types';

	// CIPH-872 — `todayLogged` + Asterisk import removed with the
	// redundant Quick-Action rail card.

	// Today's entries moved into rail per CIPH-781 follow-up.
	export let todayEntries: CiphraDocument[];
	export let bp: Blueprint | null;
	export let allDocsStore: CiphraDocument[];
	export let confirmDeleteId: number | null;
	export let onEditEntry: (e: CiphraDocument) => void;
	export let onDeleteEntry: (id: number) => void;
	export let onRequestDelete: (id: number) => void;
	export let onCancelDelete: () => void;

	// Compliance (data-reliability). Moved in from CompanionMain.
	export let complianceLogged: number;
	export let complianceTotal: number;
	export let complianceRatio: number;
	export let complianceTone: 'high' | 'mid' | 'low';
	export let complianceMessage: string;
	export let complianceAccent: string;
	// CIPH-904 — Suppress for new users (entryDocCount < 3) so day-1 users
	// don't see "0% logged in 30 days" as a failure on their first visit.
	export let complianceVisible: boolean = true;

	// CIPH-881b — count of rescue-medication events this month. Renders only
	// when the active blueprint declares rescueMedications AND count > 0,
	// so the card stays out of presets without a clinical rescue protocol.
	export let rescueMedsThisMonth: number = 0;

	// CIPH-pi24-5c — Marker-event gap-trend sparkline data. Null when the
	// active preset doesn't declare `markerEvent` or when <3 events have
	// been logged yet (gate enforced upstream in Companion.svelte).
	export let markerGapTrend: {
		historicalGaps: number[];
		currentGap: number;
		bestGap: number;
		nounKey: string;
	} | null = null;
	export let markerAccentHex: string = '';

	// Reports / export. Doctor PDF + Open reports. Moved in from CompanionMain.
	export let canExport: boolean;
	// CIPH-873 — `onExportForDoctor` prop removed. Export is now a deep-link
	// to /reports?action=export so the scope picker drives the export.
</script>

<div class="space-y-6">
	<!-- ═══ MARKER GAP TREND (CIPH-pi24-5c) ═══
		 Top of the rail: the morbus-AI signal — "is the treatment working?"
		 Reordered above compliance because the clinically-meaningful gap
		 trend should anchor the rail; data-reliability is supporting
		 context. Renders only when the preset declares `markerEvent` AND
		 ≥3 marker events have been logged. Gap trend (treatment efficacy)
		 wraps Klara's prior streak objection (Companion.svelte:124) — show
		 trend, not a resetting counter. -->
	{#if markerGapTrend}
		<GapTrendSpark
			historicalGaps={markerGapTrend.historicalGaps}
			currentGap={markerGapTrend.currentGap}
			bestGap={markerGapTrend.bestGap}
			accentHex={markerAccentHex}
			nounLabel={$t(markerGapTrend.nounKey)}
		/>
	{/if}

	<!-- ═══ COMPLIANCE (data-reliability) ═══
		 "How am I doing with logging" — supporting context below the
		 outcome signal. CIPH-904 — suppressed for first-day users so 0%
		 doesn't read as failure on their first visit. -->
	{#if complianceVisible}
		<section class="card-anchor">
			<div class="flex items-center gap-3">
				<div class="text-center shrink-0">
					<p class="text-2xl font-bold num-data" style="color: {complianceAccent}">
						{Math.round(complianceRatio * 100)}%
					</p>
					<p class="text-[10px] uppercase tracking-wider font-medium" style="color: var(--text-muted)">
						{complianceLogged}/{complianceTotal} {$t('common.days')}
					</p>
				</div>
				<div class="flex-1 min-w-0">
					<p class="text-xs font-medium" style="color: var(--text-primary)">{complianceMessage}</p>
					{#if complianceTone === 'low'}
						<p class="text-[11px] mt-1" style="color: var(--text-muted)">{$t('companion.compliance_subtitle')}</p>
					{/if}
					<div class="mt-2 w-full rounded-full h-1.5" style="background: var(--surface-inset)">
						<div
							class="h-1.5 rounded-full transition-all duration-500"
							style="background: {complianceAccent}; width: {Math.round(complianceRatio * 100)}%"
						></div>
					</div>
				</div>
			</div>
		</section>
	{/if}

	<!-- CIPH-872 — Rail "quick action" card removed. User dogfood feedback
		 flagged it as redundant with (a) the prominent "Fill today" card in
		 main column when !todayLog and (b) the global + FAB that handles
		 add-entry everywhere. Three entry points for the same action broke
		 the "one canonical add affordance" rule from PI v6. -->

	<!-- CIPH-881b — Rescue-medications counter. Only surfaced for blueprints
		 that declare `rescueMedications` AND have at least one event in the
		 current month, so presets without a clinical rescue protocol stay
		 clean and the card stays out of empty months. -->
	{#if bp?.rescueMedications && bp.rescueMedications.length > 0 && rescueMedsThisMonth > 0}
		<section class="card p-4">
			<div class="flex items-center gap-3">
				<div
					class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
					style="background: rgba(var(--accent-rgb), 0.08)"
				>
					<svg class="w-4 h-4" style="color: var(--accent)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
						<path d="M19 14l-7 7-7-7a7 7 0 1 1 14 0z"/>
						<circle cx="12" cy="11" r="3"/>
					</svg>
				</div>
				<div class="flex-1 min-w-0">
					<p class="text-2xl font-bold num-data" style="color: var(--accent)">{rescueMedsThisMonth}</p>
					<p class="text-[11px]" style="color: var(--text-muted)">{$t('rescue_med.dashboard_count')}</p>
				</div>
			</div>
		</section>
	{/if}

	<!-- ═══ REPORTS & EXPORT ═══
		 CIPH-902 follow-up: opted into `card-rhythmic` so dashboard's
		 `--rhythm-card-padding` (16px) drives padding rather than the
		 hardcoded `p-4`. No visual change today (both = 16px), but route
		 rhythm tokens now flow through this surface. -->
	<section class="card card-rhythmic">
		<div class="flex items-center gap-2 mb-3">
			<div
				class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
				style="background: var(--ochre-light)"
			>
				<svg class="w-4 h-4" style="color: var(--ochre)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
					<polyline points="14,2 14,8 20,8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
			</div>
			<div class="flex-1 min-w-0">
				<p class="text-sm font-semibold" style="color: var(--text-primary)">{$t('reports.title')}</p>
				<p class="text-[11px]" style="color: var(--text-muted)">{$t('reports.analytics_desc')}</p>
			</div>
		</div>
		<!-- CIPH-873 — Single primary CTA that routes to /reports with the
			 export menu auto-opened. Previous version had two buttons:
			 (a) "Export for doctor" generating a current-month PDF silently
			 with no scope choice, and (b) "Open reports" → plain route. Both
			 collapsed into one action because `/reports` already has the
			 scope picker (month/year/2-year). Secondary button dropped —
			 navigation to /reports is also in the BottomNav. -->
		<div class="flex flex-col gap-2">
			{#if canExport}
				<a
					href="/reports?action=export"
					data-testid="export-doctor-pdf"
					class="btn-primary text-sm px-4 min-h-[44px] flex items-center justify-center gap-2"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					{$t('companion.export_for_doctor')}
				</a>
			{:else}
				<button
					type="button"
					disabled
					class="btn-primary text-sm px-4 min-h-[44px] flex items-center justify-center gap-2 opacity-50 cursor-not-allowed"
				>
					{$t('companion.export_for_doctor')}
				</button>
			{/if}
		</div>
	</section>

	<!-- ═══ TODAY'S ENTRIES ═══ -->
	{#if todayEntries.length > 0}
		<section>
			<h2 class="text-sm font-semibold mb-3" style="color: var(--text-primary)">{$t('companion.todays_entries')}</h2>
			<div class="space-y-2">
				{#each todayEntries as entry, i}
					{@const epEntries = Object.entries(entry.data.episodes || entry.data.seizures || {}).filter(([, n]) => Number(n) > 0)}
					<div
						class="card p-4 stagger-in"
						style="animation-delay: {i * 50}ms; border-left: 3px solid {epEntries.length > 0 ? 'var(--danger)' : 'var(--olive)'}"
					>
						<div class="flex justify-between items-start gap-2">
							<div class="flex-1 min-w-0">
								<EntryPreview {entry} {bp} showDate={false} recentDocs={allDocsStore} />
							</div>
							<div class="flex items-center gap-0.5 shrink-0">
								<button
									on:click={() => onEditEntry(entry)}
									class="p-1.5 rounded-lg transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center hover:bg-[var(--surface-muted)]"
									style="color: var(--text-muted)"
									aria-label={$t('common.edit')}
								>
									<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
								</button>
								{#if confirmDeleteId === entry.id}
									<button on:click={() => onDeleteEntry(entry.id)}
										class="p-1.5 rounded-lg text-white transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center text-xs font-medium"
										style="background: var(--danger); color: var(--on-danger, #fff)"
									>{$t('common.yes_delete')}</button>
									<button on:click={onCancelDelete}
										class="p-1.5 rounded-lg transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center text-xs font-medium"
										style="background: var(--surface-muted); color: var(--text-secondary)"
									>{$t('common.cancel')}</button>
								{:else}
									<button
										on:click={() => onRequestDelete(entry.id)}
										class="p-1.5 rounded-lg transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center hover-danger"
										style="color: var(--text-muted)"
										aria-label={$t('common.delete')}
									>
										<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3,6 5,6 21,6" stroke-width="2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke-width="2"/></svg>
									</button>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}
</div>
