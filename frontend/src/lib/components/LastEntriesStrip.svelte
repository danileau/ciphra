<!--
	pi24 dashboard — Last-entries strip.

	Universal fallback card for the dashboard primary slot. Used when no
	cohort-specific card has signal (Helena pre-labs, day-1-ish users
	with a few entries, custom cohort, or any blueprint where the pinned
	primitive can't fire yet). Codex + Claude campfire consensus 2026-05-12.

	Anti-patterns this avoids:
	- No "Nothing recorded yet" copy (the no-gaslight rule — see
	  feedback_no_gaslight_good_days.md). The parent already checks
	  `entries.length > 0` before mounting this component, so if there's
	  nothing to show, this component never renders.
	- No coverage % / streak counters. Mirrors WHAT was logged, not gaps.
	- No CTA button. Add-today affordances live on BottomNav + /journal.

	Renders up to `limit` most-recent entry-type / event-type / diary-type
	documents as a vertical stack. Each row: date · type · 1-line summary.
	Clicking a row routes to /journal (the canonical detail surface).
-->
<script lang="ts">
	import { t, locale, plural } from '$lib/i18n';
	import type { CiphraDocument } from '$lib/stores/documents';
	import type { Blueprint } from '$lib/blueprint/types';
	import { isCustomItem } from '$lib/blueprint';

	export let docs: CiphraDocument[];
	export let bp: Blueprint | null = null;
	export let limit = 3;

	$: recent = docs
		.filter((d) => {
			const type = d.data?.type;
			return type === 'entry' || type === 'event' || type === 'diary';
		})
		.slice()
		.sort((a, b) => {
			const da = String(a.data?.date || '');
			const db = String(b.data?.date || '');
			return db.localeCompare(da);
		})
		.slice(0, limit);

	function formatRowDate(dateStr: string): string {
		if (!dateStr) return '';
		try {
			return new Date(dateStr + 'T12:00:00').toLocaleDateString($locale, {
				weekday: 'short',
				day: 'numeric',
				month: 'short',
			});
		} catch {
			return dateStr;
		}
	}

	function typeLabel(type: string): string {
		if (type === 'entry') return $t('protocol.title');
		if (type === 'event') return $t('stream.events');
		if (type === 'diary') return $t('quickadd.mode_diary');
		return type;
	}

	function symptomLabel(id: string): string {
		for (const g of bp?.symptomGroups || []) {
			const it = g.items.find((x) => x.id === id);
			if (it) return isCustomItem(it.id) ? it.label : $t(it.label);
		}
		return id;
	}

	function episodeLabel(id: string): string {
		const ep = bp?.episodeTypes?.find((e) => e.id === id);
		if (!ep) return id;
		return isCustomItem(ep.id) ? ep.label : $t(ep.label);
	}

	/**
	 * Compact summary line for one entry. Picks the first 1-2 signals
	 * present: positive symptoms (named), episode counts (cohort-aware
	 * noun), a vital reading, or notes preview. Never enumerates "0 of
	 * X" — silence > nag.
	 */
	function summarize(doc: CiphraDocument): string {
		const d = doc.data || {};
		const type = d.type;
		const parts: string[] = [];

		if (type === 'diary') {
			const text = String((d as Record<string, unknown>).text || '').trim();
			return text.length > 60 ? text.slice(0, 57) + '…' : text;
		}

		if (type === 'event') {
			const kind = String((d as Record<string, unknown>).kind || '');
			if (kind === 'medication') {
				const medId = String((d as Record<string, unknown>).medicationId || '');
				const med = bp?.rescueMedications?.find((m) => m.id === medId);
				return med ? $t(med.label) : medId;
			}
			const note = String((d as Record<string, unknown>).note || '').trim();
			return note.length > 60 ? note.slice(0, 57) + '…' : note;
		}

		// type === 'entry'
		const positives = Object.entries((d.symptoms || {}) as Record<string, unknown>)
			.filter(([, v]) => v)
			.map(([k]) => symptomLabel(k));
		if (positives.length === 1) parts.push(positives[0]);
		else if (positives.length > 1) {
			parts.push(plural($t, $locale, 'companion.recap_symptoms', positives.length));
		}

		const epMap = (d.episodes || d.seizures || {}) as Record<string, number>;
		const epTotal = Object.entries(epMap).reduce((sum, [, v]) => sum + (Number(v) || 0), 0);
		if (epTotal > 0) {
			const firstId = Object.entries(epMap).find(([, v]) => Number(v) > 0)?.[0] || '';
			const label = firstId ? episodeLabel(firstId) : '';
			parts.push(epTotal === 1 && label ? label : `${epTotal} ${label}`.trim());
		}

		if (parts.length === 0) {
			const vitals = (d.vitals || {}) as Record<string, unknown>;
			for (const [k, v] of Object.entries(vitals)) {
				if (v === '' || v === null || v === undefined) continue;
				const vital = bp?.vitals?.find((vv) => vv.id === k);
				const lbl = vital ? $t(vital.label) : k;
				const unit = vital?.unit ? ` ${vital.unit}` : '';
				parts.push(`${lbl} ${String(v)}${unit}`);
				break;
			}
		}

		return parts.slice(0, 2).join(' · ');
	}
</script>

{#if recent.length > 0}
	<section class="card p-4">
		<h2 class="text-sm font-semibold mb-3" style="color: var(--text-primary)">
			{$t('companion.last_entries_title')}
		</h2>
		<ul class="flex flex-col gap-2">
			{#each recent as doc (doc.id)}
				<li>
					<a
						href="/journal"
						class="flex items-baseline gap-2 text-sm no-underline rounded-md px-1.5 py-1 -mx-1.5 transition-colors"
						style="color: var(--text-primary)"
					>
						<span class="font-mono text-xs shrink-0 tabular-nums" style="color: var(--text-muted); min-width: 5.5em">
							{formatRowDate(String(doc.data?.date || ''))}
						</span>
						<span class="text-xs shrink-0" style="color: var(--text-muted)">
							{typeLabel(String(doc.data?.type || ''))}
						</span>
						<span class="truncate" style="color: var(--text-secondary)">
							{summarize(doc)}
						</span>
					</a>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	a:hover {
		background: var(--surface-muted);
	}
	a:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
