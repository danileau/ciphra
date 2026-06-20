<!-- Thin auth + URL + CRUD adapter around <EntryComposer>. The primitive
	 owns the form, auto-save debounce, multi-entry vitals JSON round-trip,
	 section-jump nav, and the delete-confirm banner. The route is wrapped
	 in {#key date} so every date change is a fresh primitive instance —
	 same effect as the previous imperative form-state reset, expressed
	 structurally. See CIPH-850. -->
<script lang="ts">
	import { isAuthenticated } from '$lib/stores/auth';
	import { documents } from '$lib/stores/documents';
	import { resolvedBlueprint } from '$lib/blueprint';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { todayISO } from '$lib/date';
	import Asterisk from '$lib/components/Asterisk.svelte';
	import EntryComposer, { type EntryData } from '$lib/components/EntryComposer.svelte';

	// Derive from the URL param REACTIVELY (not once in onMount): SvelteKit
	// reuses this route component across /log/<a> → /log/<b> client-side
	// navigations (e.g. clicking a day in /reports), so a one-shot onMount
	// read leaves currentDate stale → {#key currentDate} never remounts →
	// EntryComposer shows the previous day's data on an empty day.
	$: currentDate = (() => {
		const p = $page.params.date;
		if (!p || p === 'today') return todayISO();
		return /^\d{4}-\d{2}-\d{2}$/.test(p) ? p : todayISO();
	})();

	$: bp = $resolvedBlueprint;
	$: isToday = currentDate === todayISO();
	$: existingDoc = $documents.find(d => d.data.type === 'entry' && d.data.date === currentDate) || null;
	$: previousDoc = (() => {
		const prev = new Date(currentDate + 'T12:00:00');
		prev.setDate(prev.getDate() - 1);
		const prevStr = prev.toISOString().slice(0, 10);
		return $documents.find(d => d.data.type === 'entry' && d.data.date === prevStr) || null;
	})();

	onMount(() => {
		if (!$isAuthenticated) { goto('/login'); return; }
		documents.load();
	});

	async function handleSave(data: EntryData) {
		const existing = $documents.find(d => d.data.type === 'entry' && d.data.date === currentDate);
		// Detect "this is the very first daily_log" BEFORE the save completes,
		// so we can fire a one-time onboarding event (CIPH-103) pointing the
		// user at the quick-add FAB / event-line feature.
		const priorDailyLogCount = $documents.filter(d => d.data.type === 'entry').length;
		const wasFirstDailyLog = !existing && priorDailyLogCount === 0;
		if (existing) {
			await documents.updateDoc(existing.id, data);
		} else {
			await documents.save(data);
		}
		if (wasFirstDailyLog && typeof window !== 'undefined') {
			try {
				if (localStorage.getItem('ciphra_event_line_tooltip_seen') !== 'true') {
					window.dispatchEvent(new CustomEvent('ciphra:first-daily-log'));
				}
			} catch {}
		}
	}

	async function handleDelete() {
		if (!existingDoc) return;
		await documents.remove(existingDoc.id);
		history.back();
	}

	function handleDateChange(delta: number) {
		const d = new Date(currentDate + 'T12:00:00');
		d.setDate(d.getDate() + delta);
		const newDate = d.toISOString().slice(0, 10);
		// currentDate is derived from $page.params.date — the goto drives it.
		goto(`/log/${newDate}`, { replaceState: true });
	}

	function handleJumpToToday() {
		goto(`/log/${todayISO()}`, { replaceState: true });
	}
</script>

{#if !bp}
	<div class="log-loading">
		<Asterisk size={32} spin color="muted" />
		<p class="log-loading-text">{$t('common.loading')}</p>
	</div>
{:else}
	{#key currentDate}
		<EntryComposer
			date={currentDate}
			{bp}
			{existingDoc}
			{previousDoc}
			{isToday}
			recentDocs={$documents}
			onSave={handleSave}
			onDelete={handleDelete}
			onDateChange={handleDateChange}
			onJumpToToday={handleJumpToToday}
		/>
	{/key}
{/if}

<style>
	.log-loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 48px 16px;
		gap: 12px;
	}
	.log-loading-text {
		font-size: 14px;
		color: var(--text-muted);
	}
</style>
