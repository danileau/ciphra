<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { isAuthenticated, auth, authReady } from '$lib/stores/auth';
	import { documents, type CiphraDocument } from '$lib/stores/documents';
	import { resolvedBlueprint, isCustomItem } from '$lib/blueprint';
	import { familyLinks, activeVault } from '$lib/stores/familyLinks';
	import Asterisk from '$lib/components/Asterisk.svelte';
	import type { Blueprint } from '$lib/blueprint';
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { generateDoctorPdf, generateCompactPdf, exportCsv, type ReportScope } from '$lib/pdf';
	import { isEpisodeBearing } from '$lib/utils/episodeCounts';
	import { isExportable } from '$lib/utils/exportable';

	let currentDate = new Date().toISOString().slice(0, 10);
	let pdfScope: ReportScope = 'month';
	let exportMenuOpen = false;

	function scopeLabelKey(s: ReportScope): string {
		if (s === 'year') return 'pdf.scope_year_label';
		if (s === '2years') return 'pdf.scope_2years_label';
		return 'pdf.scope_month_label';
	}

	function pickExport(scope: ReportScope, compact: boolean) {
		pdfScope = scope;
		exportMenuOpen = false;
		if (compact) exportCompactForDoctor();
		else exportForDoctor();
	}

	// Available scope set depends on data span: no point offering "2 years"
	// when the user only has 2 months of logs. Thresholds are intentionally
	// generous — even a partial year is more useful than re-running the
	// monthly export 12 times.
	$: dataSpanDays = (() => {
		const dates = exportableDocs
			.filter(d => d.data?.type === 'entry')
			.map(d => String(d.data.date || ''))
			.filter(s => s.length === 10);
		if (dates.length === 0) return 0;
		const oldest = dates.reduce((a, b) => (a < b ? a : b));
		const ms = Date.now() - new Date(oldest + 'T12:00:00').getTime();
		return Math.floor(ms / 86400000);
	})();
	$: scopeYearAvailable = dataSpanDays >= 60;
	$: scopeTwoYearsAvailable = dataSpanDays >= 365;
	// If the user picks a scope and then their data set shrinks (caregiver
	// switches accounts), fall back to the most useful available option.
	$: if (pdfScope === '2years' && !scopeTwoYearsAvailable) {
		pdfScope = scopeYearAvailable ? 'year' : 'month';
	} else if (pdfScope === 'year' && !scopeYearAvailable) {
		pdfScope = 'month';
	}
	let viewMode: 'month' | 'year' = 'month';
	let currentYear = new Date().getFullYear();
	// Track loading explicitly so the empty / loading / ready states don't
	// all collapse into a single "!bp → Laden…" that hangs forever for
	// caregivers without their own blueprint.
	let initialLoadDone = false;

	$: bp = $resolvedBlueprint;
	$: liveLinks = $familyLinks.filter(l => !l.revoked);

	// CIPH-710 / CIPH-713 — every aggregation, summary, and export below uses
	// `exportableDocs` (diary excluded, private excluded). `$documents` is
	// only used for editing actions where we DO need to find private entries.
	$: exportableDocs = $documents.filter(isExportable);

	onMount(async () => {
		if (!$isAuthenticated) { goto('/login'); return; }
		await documents.load();
		initialLoadDone = true;

		// CIPH-873 — Deep-link from Companion "Export for doctor" button.
		// When `?action=export` is present, open the export menu and scroll
		// it into view. Previous flow silently generated a current-month PDF
		// with no scope choice; this respects the existing picker UI and
		// stops the button from surprising the user.
		if ($page.url.searchParams.get('action') === 'export') {
			exportMenuOpen = true;
			await tick();
			document
				.getElementById('reports-export-section')
				?.scrollIntoView({ behavior: 'smooth', block: 'start' });
			// Clean the URL so a refresh doesn't re-trigger.
			const u = new URL($page.url);
			u.searchParams.delete('action');
			history.replaceState(null, '', u.pathname + (u.search || ''));
		}
	});

	// Recent note-marker events (type === 'event') — shown on Reports so
	// users can verify the vertical lines that appear on the 24-month chart.
	// Scope-aware: month view shows only that month; year view shows the full
	// visible year. Cap at 8 to keep the card compact.
	$: recentEvents = (() => {
		const inScope = (dateStr: string) => {
			if (viewMode === 'month') return dateStr.startsWith(currentDate.slice(0, 7));
			return dateStr.startsWith(String(currentYear));
		};
		return exportableDocs
			.filter(d => d.data?.type === 'event' && typeof d.data.date === 'string' && inScope(String(d.data.date)))
			.sort((a, b) => String(b.data.date).localeCompare(String(a.data.date)))
			.slice(0, 8);
	})();

	// Monthly grid helpers
	$: monthDocs = getMonthDocs(exportableDocs, currentDate);

	// CIPH-876 — Auto-expand the monthly episode-columns list to include any
	// non-curated episode type that has ≥1 occurrence in the visible month.
	// Curated `gridEpisodeColumns` always render (even at zero) so the grid
	// stays stable month-to-month; extras appear only when they have data.
	// Order preserved from `bp.episodeTypes` for deterministic layout.
	// CIPH-877 — mirrored symptom auto-expand. Curated `gridSymptomColumns`
	// always render; symptoms from any `symptomGroups.items` with ≥1 logged
	// occurrence in the visible month get appended. Keeps the grid in sync
	// with what the user is actually tracking, so no data we save is
	// orphaned from the monthly export.
	$: effectiveSymptomColumns = ((): string[] => {
		if (!bp) return [];
		const curated: string[] = bp.gridSymptomColumns || [];
		const curatedSet = new Set<string>(curated);
		const prefix = currentDate.slice(0, 7);
		const extras: string[] = [];
		for (const g of bp.symptomGroups) {
			for (const item of g.items) {
				if (curatedSet.has(item.id)) continue;
				const hasData = exportableDocs.some((d: any) => {
					if (d.data?.type !== 'entry') return false;
					if (!String(d.data?.date || '').startsWith(prefix)) return false;
					return !!d.data.symptoms?.[item.id];
				});
				if (hasData) extras.push(item.id);
			}
		}
		return [...curated, ...extras];
	})();

	$: effectiveEpisodeColumns = ((): string[] => {
		if (!bp) return [];
		const curated: string[] = bp.gridEpisodeColumns || [];
		const curatedSet = new Set<string>(curated);
			const prefix = currentDate.slice(0, 7);
			const extras: string[] = [];
			for (const ep of bp.episodeTypes) {
				if (curatedSet.has(ep.id)) continue;
				const hasData = exportableDocs.some((d: any) => {
					if (!isEpisodeBearing(d)) return false;
					if (!String(d.data?.date || '').startsWith(prefix)) return false;
					return (d.data.episodes?.[ep.id] || d.data.seizures?.[ep.id] || 0) > 0;
				});
				if (hasData) extras.push(ep.id);
		}
		return [...curated, ...extras];
	})();

	// CIPH-885 — Per-month "auto-added" ID sets, used to decorate column
	// headers so a user seeing a column appear this month but not next month
	// understands it reflects their data, not a bug. Purely additive — the
	// column is already rendering; this is just typography.
	$: autoAddedSymptomSet = new Set<string>(
		effectiveSymptomColumns.filter((id) => !(bp?.gridSymptomColumns || []).includes(id))
	);
	$: autoAddedEpisodeSet = new Set<string>(
		effectiveEpisodeColumns.filter((id) => !(bp?.gridEpisodeColumns || []).includes(id))
	);

	function getMonthDocs(docs: CiphraDocument[], refDate: string) {
		const d = new Date(refDate + 'T12:00:00');
		const year = d.getFullYear();
		const month = d.getMonth();
		const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
		return docs.filter(doc =>
			doc.data.type === 'entry' && String(doc.data.date || '').startsWith(prefix)
		);
	}

	function getDaysInMonth(dateStr: string): number {
		const d = new Date(dateStr + 'T12:00:00');
		return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
	}

	function getSymptom(doc: any, col: string): boolean {
		return doc?.data?.symptoms?.[col] || false;
	}
	function getEpisodeCount(doc: any, col: string): number {
		return doc?.data?.episodes?.[col] || doc?.data?.seizures?.[col] || 0;
	}
	function symptomSum(col: string): number {
		return monthDocs.filter(d => d.data.symptoms?.[col]).length;
	}
	function episodeSum(col: string): number {
		// Includes both daily_log and standalone `episode` docs in the month.
		const prefix = currentDate.slice(0, 7);
		return exportableDocs.reduce((sum: number, d: any) => {
			if (!isEpisodeBearing(d)) return sum;
			if (!String(d.data?.date || '').startsWith(prefix)) return sum;
			return sum + (d.data.episodes?.[col] || d.data.seizures?.[col] || 0);
		}, 0);
	}

	function itemLabel(id: string): string {
		if (!bp) return id;
		for (const g of bp.symptomGroups) {
			const item = g.items.find(i => i.id === id);
			if (item) return isCustomItem(item.id) ? item.label : $t(item.label);
		}
		const ep = bp.episodeTypes.find(e => e.id === id);
		if (ep) return isCustomItem(ep.id) ? ep.label : $t(ep.label);
		return id;
	}

	function changeMonth(delta: number) {
		const d = new Date(currentDate + 'T12:00:00');
		d.setMonth(d.getMonth() + delta);
		d.setDate(1);
		currentDate = d.toISOString().slice(0, 10);
	}
	// CIPH-883 — jump-to-today mirror of calendar/+page.svelte CIPH-878.
	// Reports is the most-deep-linked surface after PDFs; users scroll months
	// back to compare and need a cheap way home.
	function jumpToCurrentMonth() {
		const now = new Date();
		currentDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
	}
	$: todayMonthStr = (() => {
		const n = new Date();
		return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
	})();
	$: isOnCurrentMonth = currentDate.slice(0, 7) === todayMonthStr;

	function formatMonth(dateStr: string): string {
		const d = new Date(dateStr + 'T12:00:00');
		return d.toLocaleDateString($locale, { month: 'long', year: 'numeric' });
	}

	function exportForDoctor() {
		if (!bp) return;
		const d = new Date(currentDate + 'T12:00:00');
		generateDoctorPdf(bp, exportableDocs, d.getFullYear(), d.getMonth(), $t, $locale, $auth.username || '', pdfScope);
	}

	function exportCompactForDoctor() {
		if (!bp) return;
		const d = new Date(currentDate + 'T12:00:00');
		generateCompactPdf(bp, exportableDocs, d.getFullYear(), d.getMonth(), $t, $locale, $auth.username || '', pdfScope);
	}

	function exportCsvFile() {
		if (!bp) return;
		const d = new Date(currentDate + 'T12:00:00');
		exportCsv(bp, exportableDocs, d.getFullYear(), d.getMonth(), $t, $locale, pdfScope);
	}

	// Stats
	// Inline the sum so Svelte sees `bp`, `currentDate`, `exportableDocs`
	// directly as reactive deps. The earlier IIFE+`void` trick didn't always
	// trigger recompute on month change (Svelte's reactive analyzer can
	// optimize `void <ident>` away).
	$: totalEpisodes = bp
		? (() => {
			const prefix = currentDate.slice(0, 7);
			let total = 0;
			for (const d of exportableDocs) {
				if (d.data?.type !== 'entry') continue;
				if (!String(d.data.date || '').startsWith(prefix)) continue;
				const eps = (d.data.episodes || d.data.seizures || {}) as Record<string, number>;
				for (const ep of bp.episodeTypes) {
					total += Number(eps[ep.id] || 0);
				}
			}
			return total;
		})()
		: 0;
	$: daysLogged = monthDocs.length;
	$: daysInMonth = getDaysInMonth(currentDate);

	// ─── Year view helpers ─────────────────────────────────
	function getYearDocs(docs: CiphraDocument[], year: number) {
		const prefix = `${year}-`;
		return docs.filter(doc =>
			doc.data.type === 'entry' && String(doc.data.date || '').startsWith(prefix)
		);
	}

	$: yearDocs = getYearDocs(exportableDocs, currentYear);

	function getYearMonthDays(year: number, month: number): number {
		return new Date(year, month + 1, 0).getDate();
	}

	function getDayDoc(docs: CiphraDocument[], dateStr: string): CiphraDocument | undefined {
		return docs.find(d => d.data.date === dateStr);
	}

	function dayHasEpisodes(doc: CiphraDocument | undefined, bp: Blueprint): boolean {
		if (!doc || !bp) return false;
		for (const ep of bp.episodeTypes) {
			if ((doc.data.episodes?.[ep.id] || doc.data.seizures?.[ep.id] || 0) > 0) return true;
		}
		return false;
	}

	function dayTooltip(doc: CiphraDocument | undefined, bp: Blueprint): string {
		if (!doc) return '';
		const parts: string[] = [];
		if (bp) {
			// Count active symptoms
			const symCount = bp.symptomGroups.reduce((sum, g) =>
				sum + g.items.filter(i => doc.data.symptoms?.[i.id]).length, 0);
			if (symCount > 0) parts.push(`${symCount} ${$t('protocol.symptoms')}`);
			// Count episodes
			const epCount = bp.episodeTypes.reduce((sum, ep) =>
				sum + (doc.data.episodes?.[ep.id] || doc.data.seizures?.[ep.id] || 0), 0);
			if (epCount > 0) parts.push(`${epCount} ${$t('protocol.episodes')}`);
		}
		if (doc.data.notes) parts.push($t('common.notes'));
		return parts.join(', ') || $t('pdf.days_logged');
	}

	// Year episode total includes both daily_log and standalone `episode` docs.
	$: yearEpisodeBearingDocs = exportableDocs.filter(d => isEpisodeBearing(d) && String(d.data?.date || '').startsWith(`${currentYear}-`));
	$: yearTotalEpisodes = bp ? bp.episodeTypes.reduce((sum, ep) =>
		sum + yearEpisodeBearingDocs.reduce((s: number, d: any) => s + (d.data.episodes?.[ep.id] || d.data.seizures?.[ep.id] || 0), 0), 0) : 0;

	$: yearDaysLogged = yearDocs.length;

	$: yearMostFrequentSymptom = (() => {
		if (!bp || yearDocs.length === 0) return '';
		let maxCount = 0;
		let maxLabel = '';
		for (const g of bp.symptomGroups) {
			for (const item of g.items) {
				const count = yearDocs.filter(d => d.data.symptoms?.[item.id]).length;
				if (count > maxCount) {
					maxCount = count;
					maxLabel = isCustomItem(item.id) ? item.label : $t(item.label);
				}
			}
		}
		return maxLabel;
	})();

	function getMonthShortName(month: number): string {
		const d = new Date(2024, month, 1);
		return d.toLocaleDateString($locale, { month: 'short' });
	}

	async function toggleGridSymptom(dayStr: string, symptomId: string) {
		const existing = $documents.find(d => d.data.type === 'entry' && d.data.date === dayStr);
		if (existing) {
			const symptoms = { ...existing.data.symptoms, [symptomId]: !existing.data.symptoms?.[symptomId] };
			await documents.updateDoc(existing.id, { ...existing.data, symptoms });
		} else {
			const data: any = { type: 'entry', date: dayStr, symptoms: { [symptomId]: true }, episodes: {}, triggers: {}, vitals: {}, medications: {}, notes: '' };
			await documents.save(data);
		}
	}

	async function incrementGridEpisode(dayStr: string, episodeId: string) {
		const existing = $documents.find(d => d.data.type === 'entry' && d.data.date === dayStr);
		if (existing) {
			const episodes = { ...existing.data.episodes, [episodeId]: (existing.data.episodes?.[episodeId] || 0) + 1 };
			await documents.updateDoc(existing.id, { ...existing.data, episodes });
		} else {
			const data: any = { type: 'entry', date: dayStr, symptoms: {}, episodes: { [episodeId]: 1 }, triggers: {}, vitals: {}, medications: {}, notes: '' };
			await documents.save(data);
		}
	}

	function getFirstDayOfWeek(year: number, month: number): number {
		// 0=Sun, 1=Mon... We want Mon=0
		const day = new Date(year, month, 1).getDay();
		return day === 0 ? 6 : day - 1;
	}
</script>

{#if !bp && !initialLoadDone}
	<!-- Genuine loading state — we're still fetching/decrypting documents. -->
	<div class="max-w-6xl mx-auto px-4 py-12 text-center">
		<Asterisk size={32} spin color="muted" />
		<p class="mt-3 text-sm" style="color: var(--text-muted)">{$t('common.loading')}</p>
	</div>
{:else if !bp}
	<!-- Blueprint never loaded. This is a caregiver with no own tracking,
		 or a user who hasn't completed setup. Show an actionable empty state
		 instead of a forever-spinner. -->
	<div class="max-w-2xl mx-auto px-4 py-12 space-y-5 text-center">
		<Asterisk size={40} color="muted" />
		<h1 class="text-xl font-semibold" style="color: var(--text-primary)">{$t('reports.no_blueprint_title')}</h1>
		{#if liveLinks.length > 0}
			<p class="text-sm md:text-base" style="color: var(--text-secondary)">{$t('reports.no_blueprint_caregiver_desc')}</p>
			<div class="flex flex-wrap gap-2 justify-center">
				{#each liveLinks as l}
					<button
						type="button"
						on:click={() => activeVault.set(l.sourceUserId)}
						class="btn-primary px-4 min-h-[44px]"
					>
						{$t('reports.view_for', { user: l.sourceUsername })}
					</button>
				{/each}
			</div>
		{:else}
			<p class="text-sm md:text-base" style="color: var(--text-secondary)">{$t('reports.no_blueprint_desc')}</p>
			<div class="flex flex-wrap gap-2 justify-center">
				<a href="/setup" class="btn-primary px-4 min-h-[44px] flex items-center">{$t('companion.caregiver_setup_own')}</a>
				<a href="/settings" class="btn-secondary px-4 min-h-[44px] flex items-center">{$t('companion.caregiver_open_settings')}</a>
			</div>
		{/if}
	</div>
{:else}
<div class="rpt-page">
	<!-- Header -->
	<div class="rpt-header">
		<h1 class="rpt-title">{$t('reports.title')}</h1>
		<div class="rpt-view-toggle">
			<button
				class="rpt-toggle-btn {viewMode === 'month' ? 'rpt-toggle-btn--active' : ''}"
				on:click={() => { viewMode = 'month'; }}
			>{$t('reports.month_view')}</button>
			<button
				class="rpt-toggle-btn {viewMode === 'year' ? 'rpt-toggle-btn--active' : ''}"
				on:click={() => { viewMode = 'year'; }}
			>{$t('reports.year_view')}</button>
		</div>
	</div>

	{#if viewMode === 'month'}
	<!-- ═══ MONTH VIEW ═══ -->

	<!-- Month nav -->
	<div class="flex items-center justify-center gap-3 mb-6">
		<button on:click={() => changeMonth(-1)} class="p-2 rounded-lg hover:bg-slate-100 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500">
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
		</button>
		<div class="flex items-center gap-2 min-w-[180px] justify-center">
			<span class="text-base font-semibold text-slate-900 text-center">{formatMonth(currentDate)}</span>
			{#if !isOnCurrentMonth}
				<button
					on:click={jumpToCurrentMonth}
					class="rpt-today-btn"
					aria-label={$t('common.today')}
				>{$t('common.today')}</button>
			{/if}
		</div>
		<button on:click={() => changeMonth(1)} class="p-2 rounded-lg hover:bg-slate-100 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500">
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
		</button>
	</div>

	<!-- Summary stats -->
	<div class="grid grid-cols-3 gap-3 mb-6">
		<div class="card p-4 text-center">
			<p class="text-2xl font-bold text-slate-900">{daysLogged}</p>
			<p class="text-xs text-slate-500 mt-1">{$t('pdf.days_logged')}</p>
		</div>
		<div class="card p-4 text-center">
			<p class="text-2xl font-bold" style="color: var(--danger)">{totalEpisodes}</p>
			<p class="text-xs text-slate-500 mt-1">{$t('pdf.total_episodes')}</p>
		</div>
		<div class="card p-4 text-center">
			<p class="text-2xl font-bold text-brand">{daysInMonth > 0 ? Math.round(daysLogged / daysInMonth * 100) : 0}%</p>
			<p class="text-xs text-slate-500 mt-1">{$t('reports.coverage')}</p>
		</div>
	</div>

	<!-- Recent note-marker events — closes the visibility gap. Users who
		 create "Treatment adjusted" style markers couldn't see them anywhere
		 in the UI before, only as vertical lines on the PDF trend chart. -->
	<div class="card-inline mb-4">
		<p class="text-xs font-medium uppercase tracking-wider mb-2" style="color: var(--text-muted)">{$t('reports.recent_events_title')}</p>
		{#if recentEvents.length === 0}
			<p class="text-xs" style="color: var(--text-muted)">{$t('reports.no_events_yet')}</p>
		{:else}
			<ul class="flex flex-col gap-1.5">
				{#each recentEvents as ev}
					<li class="flex items-baseline gap-2 text-sm md:text-base">
						<span class="font-mono text-xs shrink-0" style="color: var(--text-muted)">{ev.data.date}</span>
						{#if ev.data.kind === 'medication'}
							<!-- CIPH-881b — rescue-medication events render with med
								 name + dose + time, distinct from freeform notes. -->
							{@const medId = ev.data.medicationId}
							{@const presetMed = bp?.rescueMedications?.find(m => m.id === medId)}
							{@const medLabel = presetMed ? $t(presetMed.label) : (medId || '')}
							{@const unit = presetMed?.unit ? ` ${presetMed.unit}` : ''}
							<span class="truncate" style="color: var(--brand)">
								{medLabel}{ev.data.dose ? ` · ${ev.data.dose}${unit}` : ''}{ev.data.time ? ` · ${ev.data.time}` : ''}
							</span>
						{:else}
							<span class="truncate" style="color: var(--text-primary)">{ev.data.notes || ''}</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<!-- CIPH-423 — Combined scope+export dropdown: scope only matters with
	     export, so collapse them into one decision. CSV stays as a small link.
	     CIPH-873 — id=reports-export-section for deep-link scroll-into-view. -->
	<div id="reports-export-section" class="mb-6 relative">
		<button
			type="button"
			on:click={() => (exportMenuOpen = !exportMenuOpen)}
			aria-haspopup="menu"
			aria-expanded={exportMenuOpen}
			class="w-full px-4 py-3 text-sm font-medium rounded-xl bg-brand text-white hover:opacity-90 transition-opacity flex items-center justify-between gap-2 min-h-[44px]"
		>
			<span class="flex items-center gap-2">
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				{$t('reports.export_dropdown_label', { scope: $t(scopeLabelKey(pdfScope)) })}
			</span>
			<svg class="w-4 h-4 transition-transform" style="transform: rotate({exportMenuOpen ? 180 : 0}deg)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="6,9 12,15 18,9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
		</button>

		{#if exportMenuOpen}
			<!-- Backdrop: click anywhere outside to close -->
			<button
				type="button"
				class="fixed inset-0 z-40"
				aria-label={$t('common.close')}
				on:click={() => (exportMenuOpen = false)}
			></button>
			<div
				role="menu"
				class="absolute z-50 left-0 right-0 mt-2 rounded-xl overflow-hidden shadow-lg"
				style="background: var(--surface-card); border: 1px solid var(--border)"
			>
				<button
					role="menuitem"
					type="button"
					on:click={() => pickExport('month', false)}
					class="w-full text-left px-4 py-3 text-sm hover:bg-brand/5 transition-colors flex items-center justify-between"
				>
					<span style="color: var(--text-primary)">{$t('pdf.scope_month_label')}</span>
					<span class="text-xs" style="color: var(--text-muted)">PDF</span>
				</button>
				<button
					role="menuitem"
					type="button"
					on:click={() => scopeYearAvailable && pickExport('year', false)}
					disabled={!scopeYearAvailable}
					title={scopeYearAvailable ? '' : $t('pdf.scope_unavailable')}
					class="w-full text-left px-4 py-3 text-sm hover:bg-brand/5 transition-colors flex items-center justify-between disabled:opacity-40 disabled:cursor-not-allowed"
				>
					<span style="color: var(--text-primary)">{$t('pdf.scope_year_label')}</span>
					<span class="text-xs" style="color: var(--text-muted)">PDF</span>
				</button>
				<button
					role="menuitem"
					type="button"
					on:click={() => scopeTwoYearsAvailable && pickExport('2years', false)}
					disabled={!scopeTwoYearsAvailable}
					title={scopeTwoYearsAvailable ? '' : $t('pdf.scope_unavailable')}
					class="w-full text-left px-4 py-3 text-sm hover:bg-brand/5 transition-colors flex items-center justify-between disabled:opacity-40 disabled:cursor-not-allowed"
				>
					<span style="color: var(--text-primary)">{$t('pdf.scope_2years_label')}</span>
					<span class="text-xs" style="color: var(--text-muted)">PDF</span>
				</button>
				<div style="border-top: 1px solid var(--border)"></div>
				<button
					role="menuitem"
					type="button"
					on:click={() => pickExport(pdfScope, true)}
					title={$t('pdf.export_compact_desc')}
					class="w-full text-left px-4 py-3 text-sm hover:bg-brand/5 transition-colors flex items-center justify-between"
				>
					<span style="color: var(--text-primary)">{$t('pdf.export_compact')}</span>
					<span class="text-xs" style="color: var(--text-muted)">PDF</span>
				</button>
			</div>
		{/if}

		<p class="text-[11px] mt-2" style="color: var(--text-muted)">{$t('reports.doctor_desc')}</p>
		{#if !scopeYearAvailable || !scopeTwoYearsAvailable}
			<p class="text-[11px] mt-1" style="color: var(--text-muted)">
				{$t('pdf.scope_data_span', { days: String(dataSpanDays) })}
			</p>
		{/if}

		<div class="mt-2 text-right">
			<button
				on:click={exportCsvFile}
				class="text-[11px] text-slate-500 hover:text-brand underline-offset-2 hover:underline transition-colors"
				title={$t('reports.csv_desc')}
			>
				↓ {$t('reports.csv')}
			</button>
		</div>
	</div>

	<!-- Day-coverage strip (mirrors year-view coloring so the user sees
	     which days were filled at a glance, before the data table) -->
	{#if bp}
	{@const monthIdx = new Date(currentDate + 'T12:00:00').getMonth()}
	{@const yearOfMonth = new Date(currentDate + 'T12:00:00').getFullYear()}
	{@const firstDow = getFirstDayOfWeek(yearOfMonth, monthIdx)}
	<div class="card-inline mb-4">
		<div class="flex items-center justify-between mb-3">
			<p class="text-xs font-medium text-slate-500">{$t('reports.day_coverage')}</p>
			<div class="flex gap-3 text-[10px] text-slate-400">
				<span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-slate-200"></span>{$t('reports.legend_empty')}</span>
				<span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm" style="background: var(--olive)"></span>{$t('reports.legend_logged')}</span>
				<span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm" style="background: var(--danger)"></span>{$t('reports.legend_episode')}</span>
			</div>
		</div>
		<div class="rpt-month-grid">
			{#each ['M','T','W','T','F','S','S'] as dw}
				<span class="rpt-dow">{dw}</span>
			{/each}
			{#each Array(firstDow) as _}
				<span class="rpt-day-cell rpt-day-cell--empty"></span>
			{/each}
			{#each Array.from({ length: daysInMonth }, (_, i) => i + 1) as day}
				{@const dateStr = `${yearOfMonth}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`}
				{@const doc = getDayDoc(monthDocs, dateStr)}
				{@const hasEp = dayHasEpisodes(doc, bp)}
				<span
					class="rpt-day-cell {doc ? (hasEp ? 'rpt-day-cell--episode' : 'rpt-day-cell--logged') : ''}"
					title={doc ? `${dateStr}: ${dayTooltip(doc, bp)}` : dateStr}
					on:click={() => goto(`/log/${dateStr}`)}
					role="button"
					tabindex="0"
					on:keydown={(e) => { if (e.key === 'Enter') goto(`/log/${dateStr}`); }}
				></span>
			{/each}
		</div>
	</div>
	{/if}

	<!-- Monthly grid table -->
	{#if monthDocs.length > 0}
	<div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
		<div class="overflow-x-auto">
			<table class="grid-table w-full text-xs" class:grid-table--compact={effectiveSymptomColumns.length + effectiveEpisodeColumns.length >= 12} class:grid-table--ultra={effectiveSymptomColumns.length + effectiveEpisodeColumns.length >= 18}>
				<thead>
					<tr class="bg-slate-50">
						<th class="bg-slate-50 px-3 py-2 text-left font-medium text-slate-500 border-b border-slate-200">{$t('common.day')}</th>
						{#each effectiveSymptomColumns as col}
							<th class="px-2 py-2 text-center font-medium text-slate-500 border-b border-slate-200 whitespace-nowrap" class:rpt-col--auto={autoAddedSymptomSet.has(col)} title={autoAddedSymptomSet.has(col) ? $t('reports.col_auto_tooltip') : ''}>{itemLabel(col)}{#if autoAddedSymptomSet.has(col)}<span class="rpt-col-auto-dot" aria-label={$t('reports.col_auto_tooltip')}>·</span>{/if}</th>
						{/each}
						{#each effectiveEpisodeColumns as col}
							<th class="px-2 py-2 text-center font-medium border-b border-slate-200 whitespace-nowrap" class:rpt-col--auto={autoAddedEpisodeSet.has(col)} title={autoAddedEpisodeSet.has(col) ? $t('reports.col_auto_tooltip') : ''} style="color: {bp.episodeTypes.find(e => e.id === col)?.color || 'var(--danger)'}">{itemLabel(col)}{#if autoAddedEpisodeSet.has(col)}<span class="rpt-col-auto-dot" aria-label={$t('reports.col_auto_tooltip')}>·</span>{/if}</th>
						{/each}
						<th class="px-2 py-2 text-center font-medium text-slate-500 border-b border-slate-200">{$t('common.notes')}</th>
					</tr>
				</thead>
				<tbody>
					{#each Array.from({ length: daysInMonth }, (_, i) => i + 1) as day}
						{@const dayStr = `${currentDate.slice(0, 8)}${String(day).padStart(2, '0')}`}
						{@const dayDoc = monthDocs.find(d => d.data.date === dayStr)}
						<tr class="border-b border-slate-100">
							<td class="bg-white px-3 py-1.5 font-medium whitespace-nowrap">
								<a href="/log/{dayStr}" class="grid-day-link">{day}</a>
							</td>
							{#each effectiveSymptomColumns as col}
								<td
									class="px-2 py-1.5 text-center grid-symptom-cell"
									on:click|stopPropagation={() => toggleGridSymptom(dayStr, col)}
									role="button"
									tabindex="0"
									on:keydown={(e) => { if (e.key === 'Enter') toggleGridSymptom(dayStr, col); }}
								>
									{#if getSymptom(dayDoc, col)}
										<span class="inline-block w-4 h-4 rounded-sm" style="background: var(--olive)"></span>
									{:else}
										<span class="inline-block w-4 h-4 rounded-sm" style="background: var(--surface-inset)"></span>
									{/if}
								</td>
							{/each}
							{#each effectiveEpisodeColumns as col}
								<td
									class="px-2 py-1.5 text-center font-mono grid-episode-cell"
									on:click|stopPropagation={() => incrementGridEpisode(dayStr, col)}
									role="button"
									tabindex="0"
									on:keydown={(e) => { if (e.key === 'Enter') incrementGridEpisode(dayStr, col); }}
								>
									{#if getEpisodeCount(dayDoc, col) > 0}
										<span class="font-bold" style="color: {bp.episodeTypes.find(e => e.id === col)?.color || 'var(--danger)'}">{getEpisodeCount(dayDoc, col)}</span>
									{:else}
										<span class="grid-episode-zero">-</span>
									{/if}
								</td>
							{/each}
							<td class="px-2 py-1.5 max-w-[240px] truncate" style="color: var(--text-secondary)">
								{dayDoc?.data?.notes || ''}
							</td>
						</tr>
					{/each}
				</tbody>
				<tfoot>
					<tr class="bg-slate-50 font-medium">
						<td class="bg-slate-50 px-3 py-2 text-slate-700">{$t('protocol.sum')}</td>
						{#each effectiveSymptomColumns as col}
							<td class="px-2 py-2 text-center text-slate-700">{symptomSum(col)}</td>
						{/each}
						{#each effectiveEpisodeColumns as col}
							<td class="px-2 py-2 text-center font-bold" style="color: {bp.episodeTypes.find(e => e.id === col)?.color || 'var(--danger)'}">{episodeSum(col)}</td>
						{/each}
						<td></td>
					</tr>
					<tr class="bg-slate-50 text-slate-500">
						<td class="bg-slate-50 px-3 py-2">{$t('protocol.percent')}</td>
						{#each effectiveSymptomColumns as col}
							{@const total = daysInMonth}
							{@const count = symptomSum(col)}
							<td class="px-2 py-2 text-center text-xs">{total > 0 ? Math.round(count / total * 100) : 0}%</td>
						{/each}
						{#each effectiveEpisodeColumns as _}
							<td></td>
						{/each}
						<td></td>
					</tr>
				</tfoot>
			</table>
		</div>
	</div>
	{:else}
		<div class="bg-white rounded-xl border border-slate-200 p-8 text-center">
			<svg class="w-12 h-12 mx-auto text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" stroke-width="2"/><line x1="3" y1="9" x2="21" y2="9" stroke-width="2"/><line x1="9" y1="3" x2="9" y2="21" stroke-width="2"/></svg>
			<p class="text-sm text-slate-500">{$t('reports.no_data')}</p>
			<a href="/log/today" class="inline-block mt-3 text-sm text-brand hover:text-brand-hover font-medium">{$t('companion.fill_today')}</a>
		</div>
	{/if}

	{:else}
	<!-- ═══ YEAR VIEW ═══ -->

	<!-- Year nav -->
	<div class="rpt-year-nav">
		<button on:click={() => { currentYear--; }} class="rpt-nav-btn" aria-label="Previous year">
			<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
		</button>
		<span class="rpt-year-label">{currentYear}</span>
		<button on:click={() => { currentYear++; }} class="rpt-nav-btn" aria-label="Next year">
			<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
		</button>
	</div>

	<!-- Year summary stats -->
	<div class="rpt-year-stats">
		<div class="rpt-stat-card">
			<p class="rpt-stat-num">{yearDaysLogged}</p>
			<p class="rpt-stat-label">{$t('reports.days_tracked')}</p>
		</div>
		<div class="rpt-stat-card">
			<p class="rpt-stat-num rpt-stat-num--danger">{yearTotalEpisodes}</p>
			<p class="rpt-stat-label">{$t('reports.total_year_episodes')}</p>
		</div>
		<div class="rpt-stat-card">
			<p class="rpt-stat-num rpt-stat-num--ochre">{yearMostFrequentSymptom || '-'}</p>
			<p class="rpt-stat-label">{$t('protocol.symptoms')}</p>
		</div>
	</div>

	<!-- Year grid (12 months) -->
	<div class="rpt-year-grid">
		{#each Array.from({ length: 12 }, (_, i) => i) as month}
			{@const daysInMo = getYearMonthDays(currentYear, month)}
			{@const firstDay = getFirstDayOfWeek(currentYear, month)}
			<div class="rpt-month-card">
				<p class="rpt-month-name">{getMonthShortName(month)}</p>
				<div class="rpt-month-grid">
					<!-- Day-of-week headers -->
					{#each ['M','T','W','T','F','S','S'] as dw}
						<span class="rpt-dow">{dw}</span>
					{/each}
					<!-- Empty cells before first day -->
					{#each Array(firstDay) as _}
						<span class="rpt-day-cell rpt-day-cell--empty"></span>
					{/each}
					<!-- Day cells -->
					{#each Array.from({ length: daysInMo }, (_, i) => i + 1) as day}
						{@const dateStr = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`}
						{@const doc = getDayDoc(yearDocs, dateStr)}
						{@const hasEp = dayHasEpisodes(doc, bp)}
						<span
							class="rpt-day-cell {doc ? (hasEp ? 'rpt-day-cell--episode' : 'rpt-day-cell--logged') : ''}"
							title={doc ? `${dateStr}: ${dayTooltip(doc, bp)}` : dateStr}
							on:click={() => goto(`/log/${dateStr}`)}
							role="button"
							tabindex="0"
							on:keydown={(e) => { if (e.key === 'Enter') goto(`/log/${dateStr}`); }}
						></span>
					{/each}
				</div>
			</div>
		{/each}
	</div>
	{/if}
</div>
{/if}

<style>
	/* CIPH-877 — When auto-expanded columns make the grid wide, scale the
	   typography and cell padding down so the whole table stays on-page
	   without horizontal scroll on desktop. Two steps: compact (≥12 cols)
	   and ultra (≥18 cols). */
	:global(.grid-table--compact) { font-size: 10.5px; }
	:global(.grid-table--compact th),
	:global(.grid-table--compact td) { padding-left: 4px !important; padding-right: 4px !important; }
	:global(.grid-table--compact th) { padding-top: 6px !important; padding-bottom: 6px !important; }
	:global(.grid-table--compact td) { padding-top: 4px !important; padding-bottom: 4px !important; }
	:global(.grid-table--ultra) { font-size: 9.5px; }
	/* CIPH-885 — subtle indicator on auto-added grid columns. Dotted
	   underline + middot after the label. Tooltip explains the semantics,
	   so a user seeing a column appear/disappear across months reads it
	   as data-driven, not a bug. */
	:global(.rpt-col--auto) { text-decoration: underline dotted rgba(0,0,0,0.35); text-underline-offset: 3px; }
	:global(.rpt-col-auto-dot) { margin-left: 2px; color: rgba(0,0,0,0.35); font-weight: 700; }
	/* CIPH-883 — jump-to-current-month pill, mirror of .cal-today-btn */
	.rpt-today-btn {
		font-size: 11px;
		font-weight: 500;
		padding: 2px 8px;
		border-radius: 9999px;
		border: 1px solid var(--border-subtle, rgba(0,0,0,0.1));
		background: transparent;
		color: var(--text-secondary);
		line-height: 1.4;
		white-space: nowrap;
		cursor: pointer;
		transition: color .15s, background .15s, border-color .15s;
	}
	.rpt-today-btn:hover,
	.rpt-today-btn:focus-visible {
		color: var(--brand);
		border-color: var(--brand);
		background: rgba(var(--brand-rgb, 99,102,241), 0.08);
	}
	:global(.grid-table--ultra th),
	:global(.grid-table--ultra td) { padding-left: 2px !important; padding-right: 2px !important; }
	.rpt-page {
		/* CIPH-746: widened to 1280 so data tables stop truncating cells
		   on desktop. Below 640 the percentage-free padding keeps the
		   mobile edge-to-edge feel unchanged. */
		max-width: 1280px;
		margin: 0 auto;
		padding: 16px 16px 128px;
	}
	@media (min-width: 640px) {
		.rpt-page {
			padding: 20px 24px 128px;
		}
	}

	/* ─── Header with toggle ─── */
	.rpt-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 24px;
		gap: 12px;
		flex-wrap: wrap;
	}
	.rpt-title {
		font-size: 18px;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0;
	}
	.rpt-view-toggle {
		display: flex;
		background: var(--surface-muted);
		border-radius: 10px;
		padding: 3px;
		border: 1px solid var(--border);
	}
	.rpt-toggle-btn {
		padding: 6px 16px;
		font-size: 13px;
		font-weight: 500;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: var(--text-secondary);
		cursor: pointer;
		transition: all 0.2s ease-out;
		min-height: 36px;
	}
	.rpt-toggle-btn--active {
		background: var(--surface-card);
		color: var(--text-primary);
		box-shadow: 0 1px 2px rgba(0,0,0,0.06);
	}
	.rpt-toggle-btn:hover:not(.rpt-toggle-btn--active) {
		color: var(--text-primary);
	}

	/* ─── Year nav ─── */
	.rpt-year-nav {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		margin-bottom: 24px;
	}
	.rpt-nav-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 44px;
		min-height: 44px;
		border-radius: 12px;
		color: var(--text-secondary);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: background 0.15s ease-out;
	}
	.rpt-nav-btn:hover {
		background: var(--surface-muted);
	}
	.rpt-year-label {
		font-size: 18px;
		font-weight: 600;
		color: var(--text-primary);
		min-width: 80px;
		text-align: center;
	}

	/* ─── Year stats ─── */
	.rpt-year-stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 12px;
		margin-bottom: 24px;
	}
	.rpt-stat-card {
		background: var(--surface-card);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 16px;
		text-align: center;
	}
	.rpt-stat-num {
		font-size: 24px;
		font-weight: 700;
		color: var(--text-primary);
		font-variant-numeric: tabular-nums;
	}
	.rpt-stat-num--danger {
		color: var(--danger);
	}
	.rpt-stat-num--ochre {
		font-size: 14px;
		font-weight: 600;
		color: var(--ochre);
	}
	.rpt-stat-label {
		font-size: 12px;
		color: var(--text-muted);
		margin-top: 4px;
	}

	/* ─── Year grid ─── */
	.rpt-year-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 16px;
	}
	@media (max-width: 767px) {
		.rpt-year-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	@media (max-width: 479px) {
		.rpt-year-grid {
			grid-template-columns: repeat(2, 1fr);
			gap: 12px;
		}
	}
	@media (min-width: 1024px) {
		.rpt-year-grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}

	.rpt-month-card {
		background: var(--surface-card);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 12px;
	}
	.rpt-month-name {
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-secondary);
		margin: 0 0 8px;
	}
	.rpt-month-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 2px;
	}
	.rpt-dow {
		font-size: 9px;
		font-weight: 500;
		color: var(--text-muted);
		text-align: center;
		padding-bottom: 2px;
	}
	.rpt-day-cell {
		width: 100%;
		aspect-ratio: 1;
		max-width: 18px;
		max-height: 18px;
		border-radius: 3px;
		background: var(--surface-inset);
		cursor: pointer;
		transition: transform 0.15s ease-out;
		margin: 0 auto;
	}
	.rpt-day-cell:hover {
		transform: scale(1.3);
	}
	.rpt-day-cell:focus-visible {
		outline: 2px solid var(--brand);
		outline-offset: 1px;
	}
	.rpt-day-cell--empty {
		background: transparent;
		cursor: default;
	}
	.rpt-day-cell--empty:hover {
		transform: none;
	}
	.rpt-day-cell--logged {
		background: var(--olive);
	}
	.rpt-day-cell--episode {
		background: var(--danger);
	}

	/* ─── Interactive grid cells ─── */
	.grid-day-link {
		color: var(--text-primary);
		text-decoration: none;
		font-weight: 500;
	}
	.grid-day-link:hover {
		color: var(--brand);
		text-decoration: underline;
	}

	.grid-symptom-cell {
		cursor: pointer;
		transition: transform 0.15s ease-out;
	}
	.grid-symptom-cell:hover {
		transform: scale(1.15);
	}
	.grid-symptom-cell:hover span {
		box-shadow: 0 0 0 2px var(--olive);
	}

	.grid-episode-cell {
		cursor: pointer;
		position: relative;
		transition: background 0.15s ease-out;
	}
	.grid-episode-cell:hover {
		background: var(--surface-muted);
	}
	.grid-episode-cell:hover::after {
		content: '+';
		position: absolute;
		top: 1px;
		right: 3px;
		font-size: 10px;
		font-weight: 700;
		color: var(--text-muted);
		line-height: 1;
	}
	.grid-episode-zero {
		color: var(--text-muted);
		opacity: 0.4;
	}
</style>
