<script lang="ts">
	import { t, locale, plural } from '$lib/i18n';
	import { rememberFocusMonth, recallFocusMonth } from '$lib/stores/focusMonth';
	import { isAuthenticated, auth, authReady } from '$lib/stores/auth';
	import { documents, type CiphraDocument } from '$lib/stores/documents';
	import { resolvedBlueprint, isCustomItem } from '$lib/blueprint';
	import { familyLinks, activeVault } from '$lib/stores/familyLinks';
	import Asterisk from '$lib/components/Asterisk.svelte';
	import ReportsEmpty from '$lib/components/ReportsEmpty.svelte';
	import ChartWrapper from '$lib/components/ChartWrapper.svelte';
	import VitalTrendReportsCard from '$lib/components/VitalTrendReportsCard.svelte';
	import LastEntriesStrip from '$lib/components/LastEntriesStrip.svelte';
	import { cohortPalette } from '$lib/cohortPalette';
	import { cohortOf } from '$lib/blueprint/cohort';
	import {
		resolveReportsPrimaryCard,
		type ReportsSummary,
		type ReportsCardSpec,
	} from '$lib/blueprint/reportsPrimary';
	import type { Blueprint } from '$lib/blueprint';
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { ReportScope } from '$lib/pdf';
	// jsPDF + autoTable + pdfkit core add ~152KB gzip. Defer until the user
	// actually clicks an export action.
	async function loadPdfLib() {
		return await import('$lib/pdf');
	}
	import { isEpisodeBearing } from '$lib/utils/episodeCounts';
	import { isExportable } from '$lib/utils/exportable';
	import { weekdayLabels } from '$lib/i18n/dates';

	// Design review 2026-06-11 — month context travels from /calendar
	// via the focus-month handoff; fresh sessions start on today.
	let currentDate = (() => {
		const m = recallFocusMonth();
		return m ? `${m}-01` : new Date().toISOString().slice(0, 10);
	})();
	let pdfScope: ReportScope = 'month';

	// Doctor-export scope picker — a clicked card sets the scope and
	// exports in one step (no intermediate menu state).
	function pickExport(scope: ReportScope) {
		pdfScope = scope;
		exportForDoctor();
	}

	/** Human date span a scope covers, ending at the report month. */
	function scopeRangeLabel(scope: ReportScope, locale: string, refISO: string): string {
		const d = new Date(refISO + 'T12:00:00');
		const end = new Date(d.getFullYear(), d.getMonth(), 1);
		const fmt = (x: Date) => x.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
		if (scope === 'month') return fmt(end);
		const back = scope === 'year' ? 11 : 23;
		const start = new Date(end.getFullYear(), end.getMonth() - back, 1);
		return `${fmt(start)} – ${fmt(end)}`;
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

	// Export scope cards (replaces the dropdown): each is a clickable
	// mini-document; paper-stack depth cues the span, the body line says
	// which visit it suits, and a locked card explains its own threshold.
	$: scopeCards = [
		{
			scope: 'month' as ReportScope, depth: 1, available: true,
			titleKey: 'pdf.scope_month_label', useKey: 'reports.scope_month_use',
			range: scopeRangeLabel('month', $locale, currentDate),
			recommended: false, lockMonths: 0,
		},
		{
			scope: 'year' as ReportScope, depth: 2, available: scopeYearAvailable,
			titleKey: 'pdf.scope_year_label', useKey: 'reports.scope_year_use',
			range: scopeRangeLabel('year', $locale, currentDate),
			recommended: scopeYearAvailable, lockMonths: 2,
		},
		{
			scope: '2years' as ReportScope, depth: 3, available: scopeTwoYearsAvailable,
			titleKey: 'pdf.scope_2years_label', useKey: 'reports.scope_2years_use',
			range: scopeRangeLabel('2years', $locale, currentDate),
			recommended: false, lockMonths: 12,
		},
	];
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

	// pi24 reports rework — primary trend slot is governed by
	// resolveReportsPrimaryCard(bp, summary). Same pattern as the dashboard
	// resolver but with /reports' clinician-pattern routing context
	// (vital-pinned cohorts take priority over episode trend here).
	$: reportsSummary = ((): ReportsSummary => {
		const presentVitalIds = new Set<string>();
		let hasAnyEntry = false;
		let hasEpisodeData = false;
		let hasSymptomData = false;
		for (const d of exportableDocs) {
			const type = d.data?.type;
			if (type === 'entry' || type === 'event') {
				hasAnyEntry = true;
			}
			if (type !== 'entry') continue;
			const eps = (d.data.episodes || d.data.seizures || {}) as Record<string, number>;
			for (const v of Object.values(eps)) {
				if (Number(v) > 0) { hasEpisodeData = true; break; }
			}
			const syms = (d.data.symptoms || {}) as Record<string, unknown>;
			for (const v of Object.values(syms)) {
				if (v) { hasSymptomData = true; break; }
			}
			const vitals = (d.data.vitals || {}) as Record<string, unknown>;
			for (const [k, v] of Object.entries(vitals)) {
				if (v === '' || v === null || v === undefined) continue;
				// For multi-entry vitals stored as objects, check at least
				// one inner value is non-empty.
				if (typeof v === 'object') {
					const innerHas = Object.values(v as Record<string, unknown>).some(
						(iv) => iv !== '' && iv !== null && iv !== undefined,
					);
					if (innerHas) presentVitalIds.add(k);
				} else {
					presentVitalIds.add(k);
				}
			}
		}
		return { hasAnyEntry, hasEpisodeData, hasSymptomData, presentVitalIds };
	})();
	$: reportsPrimarySpec = resolveReportsPrimaryCard(bp, reportsSummary) as ReportsCardSpec | null;

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
	$: rememberFocusMonth(currentDate.slice(0, 7));

	$: weekdays = weekdayLabels($locale, 'narrow');

	function formatMonth(dateStr: string): string {
		const d = new Date(dateStr + 'T12:00:00');
		return d.toLocaleDateString($locale, { month: 'long', year: 'numeric' });
	}

	async function exportForDoctor() {
		if (!bp) return;
		const d = new Date(currentDate + 'T12:00:00');
		const { generateDoctorPdf } = await loadPdfLib();
		generateDoctorPdf(bp, exportableDocs, d.getFullYear(), d.getMonth(), $t, $locale, $auth.username || '', pdfScope);
	}

	async function exportCsvFile() {
		if (!bp) return;
		const d = new Date(currentDate + 'T12:00:00');
		const { exportCsv } = await loadPdfLib();
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

	// CIPH-909 (v2) — Bar charts dropped after smoke. They duplicated the
	// day-coverage strip + the monthly grid table without giving the user
	// a clinical sentence to take to the doctor. Replaced by a "this
	// month at a glance" stat block (delta vs last month + top symptoms
	// + phase days) — answers the questions a doctor actually asks.
	const POSITIVE_MARKERS_REPORTS = new Set(['slept_well']);

	function totalEpisodesForMonth(prefix: string): number {
		if (!bp) return 0;
		let total = 0;
		for (const d of exportableDocs) {
			if (d.data?.type !== 'entry') continue;
			if (!String(d.data.date || '').startsWith(prefix)) continue;
			const eps = (d.data.episodes || d.data.seizures || {}) as Record<string, number>;
			for (const ep of bp.episodeTypes) total += Number(eps[ep.id] || 0);
		}
		return total;
	}

	// CIPH-912 — Counter-only episode sum (excludes multiDay). For
	// cohorts where every episode type is multiDay (cycle: flare;
	// IBD: flare; MS: relapse...), `totalEpisodes` and `phaseDays`
	// resolve to the same number (one increment per active day, max),
	// which made the 3-card "Episoden gesamt" stat read identical to
	// the glance "Phase-Tage" — confusing redundancy. Splitting the
	// two clarifies the model: counters are acute incidents, phase-
	// days span a state. Each owns one slot in the report.
	function counterOnlyForMonth(prefix: string): number {
		if (!bp) return 0;
		let total = 0;
		for (const d of exportableDocs) {
			if (d.data?.type !== 'entry') continue;
			if (!String(d.data.date || '').startsWith(prefix)) continue;
			const eps = (d.data.episodes || d.data.seizures || {}) as Record<string, number>;
			for (const ep of bp.episodeTypes) {
				if (ep.multiDay) continue;
				total += Number(eps[ep.id] || 0);
			}
		}
		return total;
	}
	$: hasCounterEpisodes = !!bp?.episodeTypes?.some((e) => !e.multiDay);

	$: prevMonthPrefix = (() => {
		const d = new Date(currentDate + 'T12:00:00');
		const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
		return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
	})();
	$: prevMonthEpisodes = bp ? totalEpisodesForMonth(prevMonthPrefix) : 0;
	$: episodeDelta = totalEpisodes - prevMonthEpisodes;
	$: episodeTrend = episodeDelta > 0 ? 'up' : episodeDelta < 0 ? 'down' : 'flat';
	// CIPH-912 — counter-only stats for the 3-card middle slot.
	$: currentMonthPrefix = currentDate.slice(0, 7);
	$: counterEpisodesThisMonth = bp ? counterOnlyForMonth(currentMonthPrefix) : 0;
	$: counterEpisodesThisYear = bp ? counterOnlyForMonth(String(currentYear)) : 0;

	// Top 3 symptoms this month by day count. Tabular ranked list — much
	// more skimmable than a horizontal bar chart, and it's the format
	// users already write down before a doctor visit.
	$: topSymptomsThisMonth = (() => {
		if (!bp?.symptomGroups?.length) return [];
		const counts: Record<string, number> = {};
		for (const d of monthDocs) {
			for (const [k, v] of Object.entries(d.data.symptoms || {})) {
				if (v && !POSITIVE_MARKERS_REPORTS.has(k)) {
					counts[k] = (counts[k] || 0) + 1;
				}
			}
		}
		const labelMap: Record<string, string> = {};
		for (const g of bp.symptomGroups) {
			for (const item of g.items) {
				if (POSITIVE_MARKERS_REPORTS.has(item.id)) continue;
				labelMap[item.id] = isCustomItem(item.id) ? item.label : $t(item.label);
			}
		}
		return Object.entries(counts)
			.sort(([, a], [, b]) => b - a)
			.slice(0, 3)
			.map(([id, days]) => ({ id, label: labelMap[id] || id, days }));
	})();

	// Phase-days: total days in the month where ANY multiDay episode was
	// active (flare, manic, depressive, MS relapse, IBD flare, ...). Only
	// surfaces when the blueprint has multiDay episodes — discrete cohort
	// (epilepsy etc.) doesn't get a phase-days card.
	$: hasMultiDayPhases = !!bp?.episodeTypes?.some((e) => e.multiDay);
	$: phaseDaysThisMonth = (() => {
		if (!hasMultiDayPhases || !bp) return 0;
		const multiIds = bp.episodeTypes.filter((e) => e.multiDay).map((e) => e.id);
		const days = new Set<string>();
		for (const d of monthDocs) {
			const eps = (d.data.episodes || d.data.seizures || {}) as Record<string, number>;
			for (const id of multiIds) {
				if (Number(eps[id] || 0) > 0) {
					days.add(String(d.data.date || ''));
					break;
				}
			}
		}
		return days.size;
	})();

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

	// CIPH-909 (year-block) — year-scope counterparts of the month
	// stat-block. Same shape so the two views read as one product, just
	// scoped differently. No year-over-year delta — most users have <2y
	// of data, and the per-month view answers "is it getting better?"
	// with last-month comparisons already.
	$: topSymptomsThisYear = (() => {
		if (!bp?.symptomGroups?.length) return [];
		const counts: Record<string, number> = {};
		for (const d of yearDocs) {
			for (const [k, v] of Object.entries(d.data.symptoms || {})) {
				if (v && !POSITIVE_MARKERS_REPORTS.has(k)) {
					counts[k] = (counts[k] || 0) + 1;
				}
			}
		}
		const labelMap: Record<string, string> = {};
		for (const g of bp.symptomGroups) {
			for (const item of g.items) {
				if (POSITIVE_MARKERS_REPORTS.has(item.id)) continue;
				labelMap[item.id] = isCustomItem(item.id) ? item.label : $t(item.label);
			}
		}
		return Object.entries(counts)
			.sort(([, a], [, b]) => b - a)
			.slice(0, 3)
			.map(([id, days]) => ({ id, label: labelMap[id] || id, days }));
	})();

	$: phaseDaysThisYear = (() => {
		if (!hasMultiDayPhases || !bp) return 0;
		const multiIds = bp.episodeTypes.filter((e) => e.multiDay).map((e) => e.id);
		const days = new Set<string>();
		for (const d of yearDocs) {
			const eps = (d.data.episodes || d.data.seizures || {}) as Record<string, number>;
			for (const id of multiIds) {
				if (Number(eps[id] || 0) > 0) {
					days.add(String(d.data.date || ''));
					break;
				}
			}
		}
		return days.size;
	})();

	// CIPH-909 (year-parity) — scoped reactive accessors. Lets the shared
	// summary-card row, recent-events block, export menu, and glance
	// stat-block render once outside the month/year if-else and pull the
	// right values for the current view. Month and year now feel like
	// one product, just scoped differently.
	$: daysInYear = (() => {
		const y = currentYear;
		return ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 366 : 365;
	})();
	$: scopedDocs = viewMode === 'month' ? monthDocs : yearDocs;
	$: scopedDaysLogged = viewMode === 'month' ? daysLogged : yearDaysLogged;
	$: scopedTotalEpisodes = viewMode === 'month' ? totalEpisodes : yearTotalEpisodes;
	$: scopedDaysInWindow = viewMode === 'month' ? daysInMonth : daysInYear;
	$: scopedCoverage = scopedDaysInWindow > 0
		? Math.round((scopedDaysLogged / scopedDaysInWindow) * 100)
		: 0;
	$: scopedTopSymptoms = viewMode === 'month' ? topSymptomsThisMonth : topSymptomsThisYear;
	$: scopedPhaseDays = viewMode === 'month' ? phaseDaysThisMonth : phaseDaysThisYear;
	$: scopedCounterEpisodes = viewMode === 'month' ? counterEpisodesThisMonth : counterEpisodesThisYear;

	// CIPH-914 — 24-month trend chart in /reports. The doctor-facing
	// "complexity of all aggregated data" view that the team flagged was
	// epilepc's strongest feature. Episodes (sum, all types) per month
	// as a primary line in the cohort accent; symptom-days per month as
	// a faint secondary line. Year mode shows the same 24-month window
	// (anchor = currentYear's December); month mode shows it ending at
	// the visible month — so navigating months keeps the chart in context.
	$: trendCohort = cohortOf(bp);
	$: trendAccentHex = bp ? cohortPalette(trendCohort)[0] : '#b23c2c';
	$: trendNeutralHex = bp ? cohortPalette(trendCohort)[4] : '#5c6b73';
	$: trendAnchor = (() => {
		if (viewMode === 'year') {
			return new Date(currentYear, 11, 1);
		}
		const d = new Date(currentDate + 'T12:00:00');
		return new Date(d.getFullYear(), d.getMonth(), 1);
	})();
	$: trendChartData = (() => {
		if (!bp?.episodeTypes?.length) return null;
		// PI v17 — context-aware. Year-view shows the rolling 24-month
		// summary (the "complexity of all aggregated data" view that
		// scored highest in epilepc). Month-view shows daily resolution
		// for the displayed month — same shape, but each point is one
		// day so the user can see the within-month rhythm next to the
		// day-coverage strip and grid.
		if (viewMode === 'month') {
			const d = new Date(currentDate + 'T12:00:00');
			const y = d.getFullYear();
			const m = d.getMonth();
			const daysInMo = new Date(y, m + 1, 0).getDate();
			const labels: string[] = [];
			const episodes: number[] = [];
			const symptomCounts: number[] = [];
			const monthPrefix = `${y}-${String(m + 1).padStart(2, '0')}`;
			// Bucket docs by date once (O(docs)) instead of per-day filter.
			const dayDocs = new Map<string, typeof exportableDocs>();
			for (const doc of exportableDocs) {
				if (doc.data?.type !== 'entry') continue;
				const ds = String(doc.data.date || '');
				if (!ds.startsWith(monthPrefix)) continue;
				const arr = dayDocs.get(ds);
				if (arr) arr.push(doc);
				else dayDocs.set(ds, [doc]);
			}
			for (let day = 1; day <= daysInMo; day++) {
				const ds = `${monthPrefix}-${String(day).padStart(2, '0')}`;
				labels.push(String(day));
				let epCount = 0;
				let symCount = 0;
				const docs = dayDocs.get(ds) || [];
				for (const doc of docs) {
					const eps = (doc.data.episodes || doc.data.seizures || {}) as Record<string, number>;
					for (const ep of bp.episodeTypes) epCount += Number(eps[ep.id] || 0);
					const syms = (doc.data.symptoms || {}) as Record<string, unknown>;
					for (const k of Object.keys(syms)) if (syms[k]) symCount++;
				}
				episodes.push(epCount);
				symptomCounts.push(symCount);
			}
			const totalSignal = episodes.reduce((a, b) => a + b, 0) + symptomCounts.reduce((a, b) => a + b, 0);
			if (totalSignal === 0) return null;
			return {
				labels,
				datasets: [
					{
						label: $t('day_detail.episodes'),
						data: episodes,
						borderColor: trendAccentHex,
						backgroundColor: 'transparent',
						borderWidth: 2,
						tension: 0.3,
						pointRadius: 2,
						pointHoverRadius: 5,
						pointBackgroundColor: trendAccentHex,
						fill: false,
						yAxisID: 'y',
					},
					{
						label: $t('companion.symptoms'),
						data: symptomCounts,
						borderColor: trendNeutralHex,
						backgroundColor: 'transparent',
						borderWidth: 1,
						borderDash: [3, 3],
						tension: 0.3,
						pointRadius: 1.5,
						pointHoverRadius: 4,
						pointBackgroundColor: trendNeutralHex,
						fill: false,
						yAxisID: 'y1',
					},
				],
			};
		}
		// Year-view: rolling 24-month window ending at trendAnchor.
		const months: { y: number; m: number; key: string; label: string }[] = [];
		for (let i = 23; i >= 0; i--) {
			const d = new Date(trendAnchor.getFullYear(), trendAnchor.getMonth() - i, 1);
			months.push({
				y: d.getFullYear(),
				m: d.getMonth(),
				key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
				label: d.toLocaleDateString($locale, {
					month: 'short',
					year: d.getMonth() === 0 || i === 23 ? '2-digit' : undefined,
				}),
			});
		}
		// PI v16 LB-23 — was findIndex(mo => ds.startsWith(mo.key)) per doc:
		// O(docs × 24) per recompute, ~13K compares for 540 docs. Build a
		// key→index Map once; loop is O(docs).
		const keyToIdx = new Map<string, number>();
		for (let i = 0; i < months.length; i++) keyToIdx.set(months[i].key, i);
		const episodes = months.map(() => 0);
		const symptomDays = months.map(() => 0);
		for (const doc of exportableDocs) {
			if (doc.data?.type !== 'entry') continue;
			const ds = String(doc.data.date || '');
			if (ds.length < 7) continue;
			const idx = keyToIdx.get(ds.slice(0, 7));
			if (idx === undefined) continue;
			const eps = (doc.data.episodes || doc.data.seizures || {}) as Record<string, number>;
			let epCount = 0;
			for (const ep of bp.episodeTypes) epCount += Number(eps[ep.id] || 0);
			episodes[idx] += epCount;
			const syms = (doc.data.symptoms || {}) as Record<string, unknown>;
			if (Object.values(syms).some((v) => v)) symptomDays[idx] += 1;
		}
		const totalSignal = episodes.reduce((a, b) => a + b, 0) + symptomDays.reduce((a, b) => a + b, 0);
		if (totalSignal === 0) return null;
		return {
			labels: months.map((m) => m.label),
			datasets: [
				{
					label: $t('day_detail.episodes'),
					data: episodes,
					borderColor: trendAccentHex,
					backgroundColor: 'transparent',
					borderWidth: 2,
					tension: 0.3,
					pointRadius: 2,
					pointHoverRadius: 5,
					pointBackgroundColor: trendAccentHex,
					fill: false,
					yAxisID: 'y',
				},
				{
					label: $t('companion.how_symptom_days'),
					data: symptomDays,
					borderColor: trendNeutralHex,
					backgroundColor: 'transparent',
					borderWidth: 1,
					borderDash: [3, 3],
					tension: 0.3,
					pointRadius: 1.5,
					pointHoverRadius: 4,
					pointBackgroundColor: trendNeutralHex,
					fill: false,
					yAxisID: 'y1',
				},
			],
		};
	})();
	// pi24 dogfood: trend-chart tooltip needs the underlying Date for each
	// bin so the title callback can format month-view as a full date
	// (honoring bp.dateFormat) and year-view as full month name + 4-digit
	// year — same pattern as the dashboard /. Labels alone aren't enough:
	// month view labels are bare day numbers ("5", "12") and year view
	// labels are short month-year ("Mai 26").
	$: trendBinDates = (() => {
		if (!trendChartData) return [] as Date[];
		if (viewMode === 'month') {
			const d = new Date(currentDate + 'T12:00:00');
			const y = d.getFullYear();
			const m = d.getMonth();
			const daysInMo = new Date(y, m + 1, 0).getDate();
			return Array.from({ length: daysInMo }, (_, i) => new Date(y, m, i + 1));
		}
		const dates: Date[] = [];
		for (let i = 23; i >= 0; i--) {
			dates.push(new Date(trendAnchor.getFullYear(), trendAnchor.getMonth() - i, 1));
		}
		return dates;
	})();
	function formatDateChoice(d: Date, choice: Blueprint['dateFormat'] | undefined): string {
		const dd = String(d.getDate()).padStart(2, '0');
		const mm = String(d.getMonth() + 1).padStart(2, '0');
		const yyyy = d.getFullYear();
		switch (choice) {
			case 'iso': return `${yyyy}-${mm}-${dd}`;
			case 'us': return `${mm}/${dd}/${yyyy}`;
			case 'dd/mm/yyyy': return `${dd}/${mm}/${yyyy}`;
			case 'dd.mm.yyyy':
			default: return `${dd}.${mm}.${yyyy}`;
		}
	}

	// pi24 dogfood: tick-row visualization removed. The trigger-day count
	// per chart bin (day in month-view, month in year-view) surfaces via
	// tooltip enrichment instead. `docHasTrigger` consults known blueprint
	// trigger ids when reading the object shape — EntryComposer's spread-
	// merge can graft list ids onto numeric keys with truthy string values,
	// and a naive truthy scan would over-count those.
	$: trendTriggerIds = bp?.triggers?.map((tr) => tr.id) ?? [];
	function docHasTrigger(d: CiphraDocument, ids: string[]): boolean {
		const trs = d.data?.triggers as unknown;
		if (Array.isArray(trs)) return trs.length > 0;
		if (trs && typeof trs === 'object') {
			const obj = trs as Record<string, unknown>;
			for (const id of ids) if (obj[id] === true) return true;
		}
		return false;
	}
	$: trendTriggerByBin = (() => {
		if (!trendChartData || !bp || trendTriggerIds.length === 0) return [] as number[];
		if (viewMode === 'month') {
			const d = new Date(currentDate + 'T12:00:00');
			const y = d.getFullYear();
			const m = d.getMonth();
			const monthPrefix = `${y}-${String(m + 1).padStart(2, '0')}`;
			const daysInMo = new Date(y, m + 1, 0).getDate();
			const out = Array.from({ length: daysInMo }, () => 0);
			for (const doc of exportableDocs) {
				if (doc.data?.type !== 'entry') continue;
				const ds = String(doc.data.date || '');
				if (!ds.startsWith(monthPrefix)) continue;
				if (!docHasTrigger(doc, trendTriggerIds)) continue;
				const dayN = Math.max(1, Number(ds.slice(8, 10)) || 1);
				out[dayN - 1]++;
			}
			return out;
		}
		// Year-view: 24-month rolling window ending at trendAnchor.
		const months: { y: number; m: number; key: string }[] = [];
		for (let i = 23; i >= 0; i--) {
			const d = new Date(trendAnchor.getFullYear(), trendAnchor.getMonth() - i, 1);
			months.push({
				y: d.getFullYear(),
				m: d.getMonth(),
				key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
			});
		}
		const keyToIdx = new Map<string, number>();
		for (let i = 0; i < months.length; i++) keyToIdx.set(months[i].key, i);
		const out = months.map(() => 0);
		for (const doc of exportableDocs) {
			if (doc.data?.type !== 'entry') continue;
			const ds = String(doc.data.date || '');
			if (ds.length < 7) continue;
			const idx = keyToIdx.get(ds.slice(0, 7));
			if (idx === undefined) continue;
			if (!docHasTrigger(doc, trendTriggerIds)) continue;
			out[idx]++;
		}
		return out;
	})();
	// Cheap signature so the trendChartOptions memo (below) busts when the
	// trigger window changes — sum is enough to detect any user-visible
	// change without an O(n) JSON.stringify on each tick.
	$: trendTriggerSig = trendTriggerByBin.length === 0
		? '0'
		: `${trendTriggerByBin.length}:${trendTriggerByBin.reduce((a, b) => a + b, 0)}`;

	// PI v15 LB-4 — Screen-reader data-table mirror for the trend chart.
	// PI v17 — caption + headers track viewMode so SR users get the right
	// context (24-month summary vs. daily-resolution-for-this-month).
	$: trendTitle = viewMode === 'month'
		? $t('reports.trend_title_month', { month: formatMonth(currentDate) })
		: $t('reports.trend_title');
	$: trendAria = viewMode === 'month'
		? $t('reports.trend_aria_month', { month: formatMonth(currentDate) })
		: $t('reports.trend_aria');
	$: trendChartSrTable = (() => {
		if (!trendChartData) return undefined;
		const labels = trendChartData.labels as string[];
		const eps = trendChartData.datasets[0].data as number[];
		const sym = trendChartData.datasets[1].data as number[];
		return {
			caption: trendTitle,
			headers: [
				viewMode === 'month' ? $t('common.day') : $t('common.month'),
				$t('day_detail.episodes'),
				viewMode === 'month' ? $t('companion.symptoms') : $t('companion.how_symptom_days'),
			],
			rows: labels.map((label, i) => [label, eps[i] ?? 0, sym[i] ?? 0]),
		};
	})();

	// PI v16 LB-23 — manual identity-stable memo for the options object.
	// The inner block returns a fresh object only when the only two reactive
	// deps that actually matter (the cohort palette accent + neutral hex)
	// change. Without this, ChartWrapper's ref-equality short-circuit
	// (ChartWrapper.svelte:104-108) was always falling through to a chart
	// .update() on every $documents mutation — chart-update storm on save.
	// CIPH-pi24-5e+ — trigger-tick marker signature is a third dep so the
	// memo also busts when triggers appear/disappear in the scope window
	// (e.g. user adds an entry with triggers on the visible month).
	let _prevAccent = '';
	let _prevNeutral = '';
	let _prevTrigSig = '';
	let _prevLocale = '';
	let _prevViewMode = '';
	let _prevDateFmt = '';
	let _trendOpts: Record<string, unknown> | null = null;
	$: trendChartOptions = (() => {
		const dateFmt = bp?.dateFormat || '';
		if (
			trendAccentHex === _prevAccent &&
			trendNeutralHex === _prevNeutral &&
			trendTriggerSig === _prevTrigSig &&
			$locale === _prevLocale &&
			viewMode === _prevViewMode &&
			dateFmt === _prevDateFmt &&
			_trendOpts
		) {
			return _trendOpts;
		}
		_prevAccent = trendAccentHex;
		_prevNeutral = trendNeutralHex;
		_prevTrigSig = trendTriggerSig;
		_prevLocale = $locale;
		_prevViewMode = viewMode;
		_prevDateFmt = dateFmt;
		// Capture by value so the memoized options object holds onto its
		// own snapshot of trigger counts AND its own ($t, $locale) view —
		// when any dep changes, the memo rebuilds and grabs fresh snapshots.
		const triggerSnapshot = trendTriggerByBin;
		const binDates = trendBinDates;
		const view = viewMode;
		const fmt = bp?.dateFormat;
		const tt = $t;
		const lc = $locale;
		_trendOpts = {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: { display: true, position: 'bottom' as const, labels: { boxWidth: 10, font: { size: 11 } } },
				tooltip: {
					callbacks: {
						// pi24 dogfood: tooltip title mirrors the dashboard
						// / chart — full date in month-view (respecting
						// bp.dateFormat) and full month name + 4-digit year
						// in year-view. Default Chart.js title is the bare
						// x-axis label ("5" or "Mai 26"); neither carries
						// enough context to read on hover.
						title: (items: Array<{ dataIndex: number }>) => {
							if (!items.length || binDates.length === 0) return '';
							const d = binDates[items[0].dataIndex];
							if (!d) return '';
							if (view === 'month') return formatDateChoice(d, fmt);
							return d.toLocaleDateString(lc, { month: 'long', year: 'numeric' });
						},
						// Trigger-day count surfaces as a hover line instead
						// of a sub-pixel tick row. Renders only when the
						// blueprint declares triggers and the bin has at
						// least one.
						afterBody: (items: Array<{ dataIndex: number }>) => {
							if (!items.length || triggerSnapshot.length === 0) return [];
							const n = triggerSnapshot[items[0].dataIndex] || 0;
							if (n === 0) return [];
							return [plural(tt, lc, 'companion.tooltip_trigger_days', n)];
						},
					},
				},
			},
			scales: {
				y: {
					type: 'linear' as const,
					position: 'left' as const,
					beginAtZero: true,
					ticks: { precision: 0, font: { size: 10 }, color: trendAccentHex, maxTicksLimit: 5 },
					grid: { color: 'rgba(0,0,0,0.04)' },
					border: { display: false },
				},
				y1: {
					type: 'linear' as const,
					position: 'right' as const,
					beginAtZero: true,
					ticks: { precision: 0, font: { size: 10 }, color: trendNeutralHex, maxTicksLimit: 5 },
					grid: { display: false },
					border: { display: false },
				},
				x: {
					// PI v17 (Linus dry-run): with 30+ daily ticks at 10px in a
					// ~220px-wide mobile chart, Chart.js' default autoSkip can
					// pile labels. Pin an explicit budget so the chart degrades
					// to ~weekly markers on small viewports instead of pretending
					// to show every day.
					ticks: {
						font: { size: 10 },
						color: 'rgba(120,113,108,0.7)',
						maxRotation: 0,
						autoSkip: true,
						autoSkipPadding: 8,
						maxTicksLimit: 8,
					},
					grid: { display: false },
					border: { display: false },
				},
			},
		};
		return _trendOpts;
	})();

	// PI v17 (both dry-runs) — explicit range chip beneath the title gives
	// the user a visual cue that "month-view = 1 month" vs "year-view = 24
	// months". Title text alone wasn't enough — the charts looked too
	// similar on toggle.
	$: trendRange = (() => {
		if (viewMode === 'month') {
			const d = new Date(currentDate + 'T12:00:00');
			const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
			const first = new Date(d.getFullYear(), d.getMonth(), 1);
			const fmt = (x: Date) => x.toLocaleDateString($locale, { day: 'numeric', month: 'short' });
			return `${fmt(first)} – ${fmt(last)}`;
		}
		const end = new Date(trendAnchor.getFullYear(), trendAnchor.getMonth(), 1);
		const start = new Date(end.getFullYear(), end.getMonth() - 23, 1);
		const fmt = (x: Date) => x.toLocaleDateString($locale, { month: 'short', year: 'numeric' });
		return `${fmt(start)} – ${fmt(end)}`;
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
	// CIPH-915 — Decrement episode count from the grid table. Mirrors
	// increment but goes the other way; deletes the key entirely when
	// the count would hit 0 so re-encryption diffs stay minimal.
	async function decrementGridEpisode(dayStr: string, episodeId: string) {
		const existing = $documents.find(d => d.data.type === 'entry' && d.data.date === dayStr);
		if (!existing) return;
		const cur = Number(existing.data.episodes?.[episodeId] || 0);
		if (cur <= 0) return;
		const next = cur - 1;
		const episodes = { ...(existing.data.episodes || {}) };
		if (next > 0) episodes[episodeId] = next;
		else delete episodes[episodeId];
		await documents.updateDoc(existing.id, { ...existing.data, episodes });
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

	<!-- CIPH-909 (year-parity) — Mode-specific nav at top. The summary
		 cards / recent events / export menu / glance block that follow
		 are all SHARED and scoped via `scoped*` reactive values. -->
	{#if viewMode === 'month'}
		<!-- Month nav -->
		<div class="flex items-center justify-center gap-3 mb-6">
			<button on:click={() => changeMonth(-1)} class="p-2 rounded-lg hover:bg-slate-100 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500" aria-label={$t('common.previous_month')}>
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
			<button on:click={() => changeMonth(1)} class="p-2 rounded-lg hover:bg-slate-100 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500" aria-label={$t('common.next_month')}>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
			</button>
		</div>
	{:else}
		<!-- Year nav -->
		<div class="rpt-year-nav">
			<button on:click={() => { currentYear--; }} class="rpt-nav-btn" aria-label={$t('common.previous_year')}>
				<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
			</button>
			<span class="rpt-year-label">{currentYear}</span>
			<button on:click={() => { currentYear++; }} class="rpt-nav-btn" aria-label={$t('common.next_year')}>
				<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
			</button>
		</div>
	{/if}

	<!-- Summary stats (scoped — month or year).
		 CIPH-912 — Middle slot adapts to the cohort: cohorts with
		 counter episodes (epilepsy, migraine, bipolar) show "Episoden
		 gesamt"; cohorts with only multiDay episodes (cycle, MS, IBD)
		 show "Phase-Tage" (since totalEpisodes would equal phaseDays —
		 confusing redundancy). The glance block below drops both rows
		 and keeps only top-symptoms (those are unique to glance). -->
	<div class="grid grid-cols-3 gap-3 mb-6">
		<div class="card p-4 text-center">
			<p class="text-2xl font-bold text-slate-900">{scopedDaysLogged}</p>
			<p class="text-xs text-slate-500 mt-1">{$t('pdf.days_logged')}</p>
		</div>
		{#if hasCounterEpisodes}
			<div class="card p-4 text-center">
				<p class="text-2xl font-bold" style="color: var(--danger)">{scopedCounterEpisodes}</p>
				<p class="text-xs text-slate-500 mt-1">{$t('pdf.total_episodes')}</p>
			</div>
		{:else if hasMultiDayPhases}
			<div class="card p-4 text-center">
				<p class="text-2xl font-bold" style="color: var(--ochre)">{scopedPhaseDays}</p>
				<p class="text-xs text-slate-500 mt-1">{$t('reports.glance_phase_days')}</p>
			</div>
		{:else}
			<div class="card p-4 text-center">
				<p class="text-2xl font-bold" style="color: var(--danger)">{scopedTotalEpisodes}</p>
				<p class="text-xs text-slate-500 mt-1">{$t('pdf.total_episodes')}</p>
			</div>
		{/if}
		<div class="card p-4 text-center">
			<p class="text-2xl font-bold text-brand">{scopedCoverage}%</p>
			<p class="text-xs text-slate-500 mt-1">{$t('reports.coverage')}</p>
		</div>
	</div>

	<!-- pi24 reports rework — primary trend slot is resolver-driven.
	     resolveReportsPrimaryCard picks the kind from cohort + data:
	     - 'episode-trend' (CIPH-914): existing dual-axis chart
	     - 'vital-trend': VitalTrendReportsCard (line OR diverging-bar
	       depending on active vital's range; carries chip selector for
	       4+ vitals, secondary footer for 2-3)
	     - 'last-entries': LastEntriesStrip — for Hashimoto pre-labs /
	       Cancer / Custom / sparse-data states. Same fallback shape as
	       dashboard.
	     - null: silent empty state (day-1 user). -->
	{#if reportsPrimarySpec?.kind === 'episode-trend'}
		<!-- CIPH-914 — 24-month trend chart. The "complexity of all
		     aggregated data" view that scored highest in epilepc.
		     Renders above the recent events block. Episodes line +
		     symptom-days line, dual y-axis so a low episode count stays
		     readable when symptom-days dwarf it. Hides when there's no
		     signal yet.
		     PI v17 — chart card always renders in either view (month/year).
		     The daily-month chart can collapse to "no entries" mid-month
		     and used to vanish the whole card, breaking page silhouette
		     + trust. Empty state now shows the title + range chip + a
		     muted line. -->
		<div class="card mb-4 p-4">
			<div class="rpt-trend-header">
				<h2 class="rpt-trend-title" style="color: var(--text-primary)">{trendTitle}</h2>
				<span class="rpt-trend-range" style="color: var(--text-muted)">{trendRange}</span>
			</div>
			{#if trendChartData}
				<div class="rpt-trend-chart">
					<ChartWrapper
						type="line"
						data={trendChartData}
						options={trendChartOptions}
						ariaLabel={trendAria}
						srTable={trendChartSrTable}
					/>
				</div>
			{:else}
				<!-- PI v17 (Jonas dry-run #2) — distinguish "no entries
				     at all" from "entries exist but no episodes/symptoms
				     triggering signal". The latter is the common mid-month
				     case where the user has logged diary days but no
				     flares yet, and the previous "Keine Daten" copy
				     gaslit them into thinking their entries weren't saved. -->
				{@const scopeDocs = viewMode === 'year' ? yearDocs : monthDocs}
				<div class="rpt-trend-empty" role="status" style="color: var(--text-muted)">
					{scopeDocs.length > 0 ? $t('reports.no_signal') : $t('reports.no_data')}
				</div>
			{/if}
		</div>
	{:else if reportsPrimarySpec?.kind === 'vital-trend'}
		<!-- pi24 reports — vital-trend primary for Hashimoto / hypertension /
		     cardiovascular / diabetes / parkinson / bipolar. Card carries
		     its own header + chart chrome. -->
		<div class="mb-4">
			<VitalTrendReportsCard
				docs={exportableDocs}
				{bp}
				primaryVitalId={reportsPrimarySpec.primaryVitalId}
				secondaryVitalIds={reportsPrimarySpec.secondaryVitalIds}
				accentHex={trendAccentHex}
				neutralHex={trendNeutralHex}
				dateFormatChoice={bp?.dateFormat}
			/>
		</div>
	{:else if reportsPrimarySpec?.kind === 'last-entries'}
		<!-- pi24 reports — last-entries fallback for cancer / custom /
		     Hashimoto-pre-labs / any blueprint that hasn't accrued
		     primary-section data yet. Universal silent-empty-state pattern. -->
		<div class="mb-4">
			<LastEntriesStrip docs={exportableDocs} {bp} limit={5} />
		</div>
	{/if}
	<!-- reportsPrimarySpec === null → render nothing (day-1, no data,
	     no nag). The KPI block and stats above stand on their own. -->

	<!-- Recent note-marker events — closes the visibility gap. Users who
		 create "Treatment adjusted" style markers couldn't see them anywhere
		 in the UI before, only as vertical lines on the PDF trend chart.
		 The `recentEvents` reactive is already scope-aware (month/year). -->
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

	<!-- Doctor-export scope picker (2026-05-22). Replaces the dropdown with
	     clickable mini-document cards: each card's paper-stack depth cues its
	     time span, the body line says which visit it suits, and a locked card
	     explains its own data threshold instead of greying out silently.
	     id=reports-export-section kept for deep-link scroll-into-view. -->
	<div id="reports-export-section" class="mb-6">
		<h2 class="text-sm font-semibold mb-3" style="color: var(--text-primary)">
			{$t('reports.export_heading')}
		</h2>
		<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
			{#each scopeCards as card (card.scope)}
				<button
					type="button"
					class="report-card"
					class:report-card--recommended={card.recommended}
					disabled={!card.available}
					on:click={() => pickExport(card.scope)}
				>
					<span class="report-doc" aria-hidden="true">
						{#if card.depth >= 3}<span class="report-sheet report-sheet--b2"></span>{/if}
						{#if card.depth >= 2}<span class="report-sheet report-sheet--b1"></span>{/if}
						<span class="report-sheet report-sheet--front">
							<span class="report-line"></span>
							<span class="report-line"></span>
							<span class="report-line report-line--short"></span>
						</span>
					</span>
					<span class="report-card__title">
						{$t(card.titleKey)}
						{#if card.recommended}
							<span class="report-card__badge">★ {$t('reports.scope_recommended')}</span>
						{/if}
					</span>
					<span class="report-card__range">{card.range}</span>
					<span class="report-card__use">
						{card.available
							? $t(card.useKey)
							: $t('reports.scope_locked', { months: card.lockMonths })}
					</span>
				</button>
			{/each}
		</div>

		<!-- Privacy note: the exported PDF is plaintext on disk. ciphra's
		     zero-knowledge encryption only covers data inside the app, so
		     the patient must know the saved file is readable by anyone. -->
		<p class="report-export-note">
			<svg class="report-export-note__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
				<path d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
			<span>{$t('reports.export_privacy_note')}</span>
		</p>

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

	<!-- CIPH-909 (v3) — "auf einen Blick" stat block. After the
		 3-card row split counter-episodes vs phase-days into mutually-
		 exclusive slots, the glance no longer repeats those numbers.
		 What's left here: month-over-month trend (delta) + top
		 symptoms ranked. Renders only when there's content. -->
	{#if scopedDocs.length > 0 && (scopedTopSymptoms.length > 0 || (viewMode === 'month' && (prevMonthEpisodes > 0 || scopedTotalEpisodes > 0)))}
		<div class="card mb-4 p-4 rpt-glance">
			<h2 class="text-xs font-medium uppercase tracking-wider mb-3" style="color: var(--text-muted)">
				{viewMode === 'month' ? $t('reports.glance_title') : $t('reports.glance_year_title')}
			</h2>
			<dl class="rpt-glance-list">
				{#if viewMode === 'month' && (prevMonthEpisodes > 0 || scopedTotalEpisodes > 0)}
					<div class="rpt-glance-row">
						<dt class="rpt-glance-label">{$t('reports.glance_trend')}</dt>
						<dd class="rpt-glance-value">
							<span class="rpt-glance-delta rpt-glance-delta--{episodeTrend}">
								{#if episodeTrend === 'up'}↗{:else if episodeTrend === 'down'}↘{:else}→{/if}
								{#if episodeTrend === 'down'}
									{plural($t, $locale, 'reports.glance_delta_down', Math.abs(episodeDelta), { prev: prevMonthEpisodes })}
								{:else if episodeTrend === 'up'}
									{plural($t, $locale, 'reports.glance_delta_up', Math.abs(episodeDelta), { prev: prevMonthEpisodes })}
								{:else}
									{$t('reports.glance_delta_flat', { prev: prevMonthEpisodes })}
								{/if}
							</span>
						</dd>
					</div>
				{/if}
				{#if scopedTopSymptoms.length > 0}
					<div class="rpt-glance-row">
						<dt class="rpt-glance-label">{$t('reports.glance_top_symptoms')}</dt>
						<dd class="rpt-glance-value rpt-glance-value--list">
							{#each scopedTopSymptoms as sym, i}
								{#if i > 0}<span class="rpt-glance-sep">·</span>{/if}
								<span class="rpt-glance-sym">{sym.label}</span>
								<span class="rpt-glance-meta">({plural($t, $locale, 'reports.glance_n_days', sym.days)})</span>
							{/each}
						</dd>
					</div>
				{/if}
			</dl>
		</div>
	{/if}

	<!-- Bottom (mode-specific): day-coverage + monthly grid table for
		 month, or 12-month heatmap for year. -->
	{#if viewMode === 'month'}
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
			{#each weekdays as dw}
				<span class="rpt-dow">{dw}</span>
			{/each}
			{#each Array(firstDow) as _}
				<span class="rpt-day-cell rpt-day-cell--empty"></span>
			{/each}
			{#each Array.from({ length: daysInMonth }, (_, i) => i + 1) as day}
				{@const dateStr = `${yearOfMonth}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`}
				{@const doc = getDayDoc(monthDocs, dateStr)}
				{@const hasEp = dayHasEpisodes(doc, bp)}
				<button
					type="button"
					class="rpt-day-cell {doc ? (hasEp ? 'rpt-day-cell--episode' : 'rpt-day-cell--logged') : ''}"
					title={doc ? `${dateStr}: ${dayTooltip(doc, bp)}` : dateStr}
					aria-label={doc ? `${dateStr} — ${dayTooltip(doc, bp)}` : dateStr}
					on:click={() => goto(`/log/${dateStr}`)}
				></button>
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
								{@const present = !!getSymptom(dayDoc, col)}
								<td class="px-2 py-1.5 text-center grid-symptom-cell">
									<button
										type="button"
										class="grid-symptom-toggle"
										aria-pressed={present}
										aria-label={`${dayStr} — ${itemLabel(col)}`}
										on:click|stopPropagation={() => toggleGridSymptom(dayStr, col)}
									>
										{#if present}
											<span class="inline-block w-4 h-4 rounded-sm" style="background: var(--olive)"></span>
										{:else}
											<span class="inline-block w-4 h-4 rounded-sm" style="background: var(--surface-inset)"></span>
										{/if}
									</button>
								</td>
							{/each}
							{#each effectiveEpisodeColumns as col}
								{@const count = getEpisodeCount(dayDoc, col)}
								{@const epColor = bp.episodeTypes.find(e => e.id === col)?.color || 'var(--danger)'}
								<!-- CIPH-915 — +/- counter widget. Symmetric pair instead
									 of the earlier cell-click + inline minus pattern.
									 Both buttons share `.grid-counter-btn` styling so
									 they read as a matched pair. Cell-wide click handler
									 dropped — the buttons are the explicit affordance. -->
								<td class="px-2 py-1.5 text-center font-mono grid-episode-cell">
									<div class="grid-counter">
										{#if count > 0}
											<button
												type="button"
												class="grid-counter-btn"
												on:click|stopPropagation={() => decrementGridEpisode(dayStr, col)}
												aria-label={$t('reports.grid_cell_decrement')}
												title={$t('reports.grid_cell_decrement')}
											>−</button>
											<span class="grid-counter-num" style="color: {epColor}">{count}</span>
											<button
												type="button"
												class="grid-counter-btn"
												on:click|stopPropagation={() => incrementGridEpisode(dayStr, col)}
												aria-label={$t('reports.grid_cell_increment_hint')}
												title={$t('reports.grid_cell_increment_hint')}
											>+</button>
										{:else}
											<button
												type="button"
												class="grid-counter-btn grid-counter-btn--solo"
												on:click|stopPropagation={() => incrementGridEpisode(dayStr, col)}
												aria-label={$t('reports.grid_cell_increment_hint')}
												title={$t('reports.grid_cell_increment_hint')}
											>+</button>
										{/if}
									</div>
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
		<!-- CIPH-893 — ReportsEmpty primitive: clinical tabular silhouette
			 instead of a generic icon, so the surface still reads as
			 "the report" even when empty. -->
		<ReportsEmpty daysLogged={monthDocs.length} threshold={7} />
	{/if}

	{:else}
		<!-- Year heatmap (12 months) -->
		<div class="rpt-year-grid">
			{#each Array.from({ length: 12 }, (_, i) => i) as month}
				{@const daysInMo = getYearMonthDays(currentYear, month)}
				{@const firstDay = getFirstDayOfWeek(currentYear, month)}
				<div class="rpt-month-card">
					<p class="rpt-month-name">{getMonthShortName(month)}</p>
					<div class="rpt-month-grid">
						<!-- Day-of-week headers -->
						{#each weekdays as dw}
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
							<button
								type="button"
								class="rpt-day-cell {doc ? (hasEp ? 'rpt-day-cell--episode' : 'rpt-day-cell--logged') : ''}"
								title={doc ? `${dateStr}: ${dayTooltip(doc, bp)}` : dateStr}
								aria-label={doc ? `${dateStr} — ${dayTooltip(doc, bp)}` : dateStr}
								on:click={() => goto(`/log/${dateStr}`)}
							></button>
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

	/* CIPH-914 — 24-month trend chart container. */
	.rpt-trend-chart {
		height: 220px;
	}
	/* PI v17 — title + range chip block. min-height holds the card's top
	   region stable when the title string length changes between
	   "Verlauf · 24 Monate" and "Verlauf · September 2026" (Linus dry-run). */
	.rpt-trend-header {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 4px 12px;
		margin-bottom: 12px;
		min-height: 1.5rem;
	}
	.rpt-trend-title {
		font-size: 0.875rem;
		font-weight: 600;
		margin: 0;
	}
	.rpt-trend-range {
		font-size: 0.75rem;
	}
	.rpt-trend-empty {
		height: 220px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.875rem;
	}
	@media (min-width: 768px) {
		.rpt-trend-empty {
			height: 280px;
		}
		.rpt-trend-chart {
			height: 280px;
		}
	}
	/* CIPH-915 — grid-cell +/- counter widget. Both buttons share
	   matching style; the count sits between them. Tap-target stays
	   reasonable (16px sq) without bloating the table column width. */
	:global(.grid-counter) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
	}
	:global(.grid-counter-num) {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		min-width: 1ch;
	}
	:global(.grid-counter-btn) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		font-size: 13px;
		line-height: 1;
		color: var(--text-muted);
		background: rgba(0, 0, 0, 0.04);
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-family: inherit;
		transition: color 0.12s ease-out, background 0.12s ease-out, transform 0.12s ease-out;
	}
	:global(.grid-counter-btn):hover,
	:global(.grid-counter-btn):focus-visible {
		color: var(--text-primary);
		background: rgba(0, 0, 0, 0.08);
		outline: none;
	}
	:global(.grid-counter-btn):active {
		transform: scale(0.92);
	}
	/* Solo + button (count=0): slightly more visible so the empty cell
	   reads as "tap to add" rather than as filler. */
	:global(.grid-counter-btn--solo) {
		color: var(--text-secondary);
	}
	/* CIPH-909 (v2) — "This month at a glance" stat block. dl/dt/dd
	   semantics so screen readers announce the term/definition pairs
	   correctly. Two-column on wider viewports; stacked on mobile. */
	.rpt-glance-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin: 0;
	}
	.rpt-glance-row {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	@media (min-width: 640px) {
		.rpt-glance-row {
			flex-direction: row;
			align-items: baseline;
			gap: 16px;
		}
	}
	.rpt-glance-label {
		font-size: 12px;
		color: var(--text-muted);
		font-weight: 500;
		min-width: 140px;
	}
	.rpt-glance-value {
		margin: 0;
		font-size: 14px;
		color: var(--text-primary);
		display: inline-flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: baseline;
	}
	.rpt-glance-value--list {
		gap: 4px;
	}
	.rpt-glance-num {
		font-weight: 700;
		font-size: 18px;
		font-variant-numeric: tabular-nums;
		color: var(--text-primary);
	}
	.rpt-glance-meta,
	.rpt-glance-sep {
		color: var(--text-muted);
		font-size: 12px;
	}
	.rpt-glance-sym {
		font-weight: 500;
	}
	.rpt-glance-delta {
		font-size: 12px;
		font-weight: 500;
	}
	.rpt-glance-delta--down { color: var(--olive); }
	.rpt-glance-delta--up { color: var(--danger); }
	.rpt-glance-delta--flat { color: var(--text-muted); }
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
		/* CIPH-pi23-A1 — 44pt min-height per WCAG 2.5.5. Padding pushed
		   from 6/16 to 11/16 so the 13px font + line-height lands at 44. */
		padding: 11px 16px;
		font-size: 13px;
		font-weight: 500;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: var(--text-secondary);
		cursor: pointer;
		transition: all 0.2s ease-out;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
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

	/* CIPH-909 (year-block) — `.rpt-year-stats` / `.rpt-stat-card` /
	   `.rpt-stat-num` removed: year view now uses the unified
	   `.rpt-glance-*` stat block (declared above with the month view). */

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
		/* PI v15 LB-3 — was a span+role=button; now a real <button>. Reset
		   browser defaults so the cell still renders as a colored 18px square. */
		border: none;
		padding: 0;
		font: inherit;
		display: block;
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
		/* PI v15 LB-3 — the <td> is no longer interactive; the inner <button>
		   is. Keep the cell padding only. */
		padding: 0;
	}
	.grid-symptom-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		min-height: 32px;
		padding: 6px 4px;
		background: transparent;
		border: none;
		font: inherit;
		cursor: pointer;
		transition: transform 0.15s ease-out;
	}
	.grid-symptom-toggle:hover {
		transform: scale(1.15);
	}
	.grid-symptom-toggle:hover span {
		box-shadow: 0 0 0 2px var(--olive);
	}
	.grid-symptom-toggle:focus-visible {
		outline: 2px solid var(--brand);
		outline-offset: 1px;
		border-radius: 3px;
	}

	/* CIPH-915 — `.grid-episode-cell` no longer needs cursor:pointer,
	   hover-background, or the hover-only "+" corner hint; the explicit
	   [−] N [+] counter widget inside is the affordance. */
	/* CIPH-915 — `.grid-episode-zero` removed; empty cells now show a
	   centered "+" button instead of a muted "-" placeholder. */

	/* ── Doctor-export scope cards ── */
	.report-card {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		padding: 0.85rem 0.95rem 0.9rem;
		border-radius: 0.75rem;
		background: var(--surface-card);
		border: 1px solid var(--border);
		text-align: left;
		cursor: pointer;
		min-height: 138px;
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
	}
	.report-card:hover:not(:disabled),
	.report-card:focus-visible:not(:disabled) {
		border-color: var(--brand);
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
	}
	.report-card:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}
	.report-card--recommended {
		border-color: var(--brand);
	}
	.report-card__title {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.55rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-primary);
	}
	.report-card__badge {
		font-size: 0.62rem;
		font-weight: 600;
		color: var(--brand);
		white-space: nowrap;
	}
	.report-card__range {
		margin-top: 0.1rem;
		font-size: 0.72rem;
		color: var(--text-muted);
	}
	.report-card__use {
		margin-top: 0.3rem;
		font-size: 0.72rem;
		line-height: 1.4;
		color: var(--text-secondary);
	}
	/* Mini-document: the front sheet plus offset sheets behind it. The
	   stack depth (1 / 2 / 3 sheets) is the visual cue for the time span. */
	.report-doc {
		position: relative;
		width: 36px;
		height: 44px;
	}
	.report-sheet {
		position: absolute;
		width: 28px;
		height: 36px;
		border-radius: 2px;
		background: #fff;
		border: 1px solid var(--border);
	}
	.report-sheet--b2 { left: 8px; top: 0; }
	.report-sheet--b1 { left: 4px; top: 4px; }
	.report-sheet--front {
		left: 0;
		top: 8px;
		z-index: 2;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 3px;
		padding: 0 4.5px;
	}
	.report-line {
		height: 1.6px;
		border-radius: 1px;
		background: var(--border);
	}
	.report-line--short { width: 58%; }

	/* Privacy note under the export cards. */
	.report-export-note {
		display: flex;
		align-items: flex-start;
		gap: 0.4rem;
		margin-top: 0.8rem;
		font-size: 0.72rem;
		line-height: 1.45;
		color: var(--text-muted);
	}
	.report-export-note__icon {
		width: 0.85rem;
		height: 0.85rem;
		flex-shrink: 0;
		margin-top: 0.07rem;
	}
</style>
