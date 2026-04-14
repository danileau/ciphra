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
	import Asterisk from '$lib/components/Asterisk.svelte';
	import EntryPreview from '$lib/components/EntryPreview.svelte';
	import type { CiphraDocument } from '$lib/stores/documents';
	import type { Blueprint } from '$lib/blueprint/types';

	export let todayLogged: boolean;

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

	// Reports / export. Doctor PDF + Open reports. Moved in from CompanionMain.
	export let canExport: boolean;
	export let onExportForDoctor: () => void;
</script>

<div class="space-y-6">
	<!-- ═══ COMPLIANCE (data-reliability) ═══
		 At the top of the rail: the "how am I doing with logging" answer
		 users glance at first. -->
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

	<!-- ═══ QUICK ACTION ═══ -->
	<section class="card p-4">
		<p class="text-xs uppercase tracking-wider font-medium mb-2" style="color: var(--text-muted)">
			{$t('companion.quick_actions')}
		</p>
		<a
			href="/log/today"
			class="btn-primary w-full text-sm px-4 py-2 flex items-center justify-center gap-2"
		>
			<Asterisk size={14} color="white" />
			{todayLogged ? $t('companion.add_another') : $t('companion.fill_today')}
		</a>
	</section>

	<!-- ═══ REPORTS & EXPORT ═══ -->
	<section class="card p-4">
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
		<div class="flex flex-col gap-2">
			<button
				type="button"
				on:click={onExportForDoctor}
				disabled={!canExport}
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
			</button>
			<a
				href="/reports"
				class="btn-secondary text-sm px-4 min-h-[44px] flex items-center justify-center gap-2"
			>
				{$t('companion.open_reports')}
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<polyline
						points="9,6 15,12 9,18"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</a>
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
										style="background: var(--danger)"
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
