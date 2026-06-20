<!--
	CIPH-920 — Dashboard "Muster" (patterns) section.

	Renders the capability-driven insight cards computed by
	$lib/blueprint/insights.ts below the dashboard's primary card. Each card
	is a plain-language takeaway + a small CSS/SVG viz (deliberately NOT
	Chart.js — the CIPH-900 declutter lesson was "insight over raw charts").
	The section renders nothing when no insight qualifies (no gaslighting
	empty state). Cohort-agnostic: the engine gates per blueprint capability,
	so this same component enriches epilepsy, migraine, parkinson, diabetes …
-->
<script lang="ts">
	import { t, locale, plural } from '$lib/i18n';
	import { computeInsights } from '$lib/blueprint/insights';
	import type { InsightDoc } from '$lib/blueprint/insights';
	import type { Blueprint } from '$lib/blueprint/types';
	import type { CiphraDocument } from '$lib/stores/documents';

	export let docs: CiphraDocument[] = [];
	export let bp: Blueprint | null = null;
	export let accentHex = '#b23c2c';
	export let neutralHex = '#5c6b73';

	// episodeNoun (plural, e.g. "Anfälle") for insight headlines.
	$: noun = bp?.episodeNoun ? $t(bp.episodeNoun) : $t('companion.how_episodes');

	$: insights = computeInsights(docs as unknown as InsightDoc[], bp);

	// Daypart adverb + fixed hour-range label (locale-neutral numbers).
	const DAYPART_RANGE: Record<string, string> = {
		night: '0–6',
		morning: '6–12',
		afternoon: '12–18',
		evening: '18–24',
	};

</script>

{#if insights.length}
	<section class="space-y-4" aria-label={$t('insight.section_title')}>
		<h2 class="text-sm font-semibold" style="color: var(--text-primary)">{$t('insight.section_title')}</h2>

		{#each insights as ins (ins.kind)}
			<div class="card card-rhythmic insight-card">
				{#if ins.kind === 'sleep-link'}
					{@const factor = ins.liftPct}
					{@const outNoun = ins.outcome === 'symptom' ? $t('insight.symptom_days_noun') : noun}
					<p class="insight-title">{$t('insight.sleep_title')}<span class="insight-info" title={$t('insight.tip_sleep', { noun: outNoun })} aria-label={$t('insight.tip_sleep', { noun: outNoun })}>ⓘ</span></p>
					<p class="insight-headline">
						{#if factor !== null}
							{$t('insight.sleep_headline', { h: ins.thresholdH, pct: factor, noun: outNoun })}
						{:else}
							{$t('insight.sleep_headline_only', { h: ins.thresholdH, noun: outNoun })}
						{/if}
					</p>
					<div class="bar-rows">
						<div class="bar-row">
							<span class="bar-label" title={$t('insight.tip_short', { h: ins.thresholdH })}>{$t('insight.sleep_short', { h: ins.thresholdH })}</span>
							<div class="bar-track">
								<div class="bar-fill" style="width: {Math.round(ins.shortRate * 100)}%; background: {accentHex}"></div>
							</div>
							<span class="bar-val num-data" title={$t('insight.tip_rate', { noun: outNoun })}>{Math.round(ins.shortRate * 100)}%</span>
						</div>
						<div class="bar-row">
							<span class="bar-label" title={$t('insight.tip_adequate', { h: ins.thresholdH })}>{$t('insight.sleep_adequate', { h: ins.thresholdH })}</span>
							<div class="bar-track">
								<div class="bar-fill" style="width: {Math.round(ins.adequateRate * 100)}%; background: {neutralHex}"></div>
							</div>
							<span class="bar-val num-data" title={$t('insight.tip_rate', { noun: outNoun })}>{Math.round(ins.adequateRate * 100)}%</span>
						</div>
					</div>
					<p class="insight-foot">{plural($t, $locale, 'insight.days', ins.shortDays)} · {plural($t, $locale, 'insight.days', ins.adequateDays)}</p>

				{:else if ins.kind === 'trigger-lift'}
					{@const outNoun = ins.outcome === 'symptom' ? $t('insight.symptom_days_noun') : noun}
					<p class="insight-title">{$t('insight.trigger_title')}<span class="insight-info" title={$t('insight.tip_trigger', { noun: outNoun })} aria-label={$t('insight.tip_trigger', { noun: outNoun })}>ⓘ</span></p>
					<p class="insight-sub">{$t('insight.trigger_sub')}</p>
					<!-- Bars encode the relative LIFT (how much more often the
					     outcome occurs with the trigger), normalised to the
					     strongest row — not the absolute incidence. Absolute
					     incidence saturates near 100% for everything when the
					     outcome is common, so the bars all read full and convey
					     nothing; lift is the differentiator the badge shows. A
					     null lift (outcome only ever seen WITH the trigger) is
					     the strongest signal → full bar. -->
					{@const maxLift = Math.max(1, ...ins.rows.map((r) => r.liftPct ?? 0))}
					<div class="bar-rows">
						{#each ins.rows as r (r.triggerId)}
							{@const barPct = r.liftPct === null ? 100 : Math.max(8, Math.round((r.liftPct / maxLift) * 100))}
							<div class="bar-row">
								<span class="bar-label" title={$t(r.label)}>{$t(r.label)}</span>
								<div class="bar-track" title={r.liftPct !== null ? $t('insight.tip_more', { pct: r.liftPct, noun: outNoun }) : $t('insight.tip_only', { noun: outNoun })}>
									<div class="bar-fill" style="width: {barPct}%; background: {accentHex}"></div>
								</div>
								<span
									class="bar-badge"
									class:bar-badge-strong={r.liftPct !== null}
									title={r.liftPct !== null ? $t('insight.tip_more', { pct: r.liftPct, noun: outNoun }) : $t('insight.tip_only', { noun: outNoun })}
								>
									{r.liftPct !== null ? $t('insight.trigger_more', { pct: r.liftPct }) : $t('insight.trigger_only')}
								</span>
							</div>
						{/each}
					</div>

				{:else if ins.kind === 'top-symptoms'}
					{@const maxPct = Math.max(...ins.rows.map((r) => r.pct))}
					<p class="insight-title">{$t('insight.top_title')}<span class="insight-info" title={$t('insight.tip_top')} aria-label={$t('insight.tip_top')}>ⓘ</span></p>
					<p class="insight-sub">{$t('insight.top_sub')}</p>
					<div class="bar-rows">
						{#each ins.rows as r (r.id)}
							<div class="bar-row">
								<span class="bar-label" title={$t(r.label)}>{$t(r.label)}</span>
								<div class="bar-track">
									<div class="bar-fill" style="width: {maxPct > 0 ? Math.round((r.pct / maxPct) * 100) : 0}%; background: {accentHex}"></div>
								</div>
								<span class="bar-val num-data">{r.pct}%</span>
							</div>
						{/each}
					</div>

				{:else if ins.kind === 'circadian'}
					{@const maxCount = Math.max(...ins.buckets.map((b) => b.count))}
					<p class="insight-title">{$t('insight.circadian_title')}<span class="insight-info" title={$t('insight.tip_circadian', { noun })} aria-label={$t('insight.tip_circadian', { noun })}>ⓘ</span></p>
					<p class="insight-headline">
						<span class="num-data">{ins.topPct}%</span> {$t('insight.daypart_' + ins.topKey)}
					</p>
					<div class="daypart-cols">
						{#each ins.buckets as b (b.key)}
							<div class="daypart-col" title="{$t('insight.daypart_' + b.key)} ({DAYPART_RANGE[b.key]}): {b.count}× {noun}">
								<div class="daypart-bar-wrap">
									<div
										class="daypart-bar"
										style="height: {maxCount > 0 ? Math.round((b.count / maxCount) * 100) : 0}%; background: {b.key === ins.topKey ? accentHex : neutralHex}"
									></div>
								</div>
								<span class="daypart-label">{DAYPART_RANGE[b.key]}</span>
							</div>
						{/each}
					</div>
					<p class="insight-foot">{$t('insight.circadian_sub', { noun })}</p>

				{:else if ins.kind === 'type-mix'}
					<p class="insight-title">{$t('insight.type_title')}<span class="insight-info" title={$t('insight.tip_type', { noun })} aria-label={$t('insight.tip_type', { noun })}>ⓘ</span></p>
					<p class="insight-sub">{$t('insight.type_sub', { noun })}</p>
					<div class="mix-bar" role="img" aria-label={$t('insight.type_sub', { noun })}>
						{#each ins.slices as s (s.id)}
							<div class="mix-seg" style="width: {s.pct}%; background: {s.color}" title="{$t(s.label)} {s.pct}%"></div>
						{/each}
					</div>
					<ul class="mix-legend">
						{#each ins.slices as s (s.id)}
							<li class="mix-legend-item">
								<span class="mix-dot" style="background: {s.color}"></span>
								<span class="mix-name">{$t(s.label)}</span>
								<span class="mix-pct num-data">{s.pct}%</span>
							</li>
						{/each}
					</ul>

				{:else if ins.kind === 'duration'}
					<p class="insight-title">{$t('insight.duration_title')}<span class="insight-info" title={$t('insight.tip_duration', { noun })} aria-label={$t('insight.tip_duration', { noun })}>ⓘ</span></p>
					<p class="insight-sub">{$t('insight.duration_sub', { noun })}</p>
					<div class="mix-bar">
						{#if ins.under1 > 0}<div class="mix-seg" style="width: {Math.round((ins.under1 / ins.total) * 100)}%; background: {neutralHex}" title="{$t('protocol.duration_under1')}: {ins.under1}×"></div>{/if}
						{#if ins.oneToFive > 0}<div class="mix-seg" style="width: {Math.round((ins.oneToFive / ins.total) * 100)}%; background: {accentHex}" title="{$t('protocol.duration_1to5')}: {ins.oneToFive}×"></div>{/if}
						{#if ins.overFive > 0}<div class="mix-seg" style="width: {Math.round((ins.overFive / ins.total) * 100)}%; background: var(--danger)" title="{$t('protocol.duration_over5')}: {ins.overFive}×"></div>{/if}
					</div>
					{#if ins.hasProlonged}
						<p class="insight-flag">{plural($t, $locale, 'insight.duration_prolonged', ins.overFive)}</p>
					{:else}
						<p class="insight-foot">{$t('insight.duration_safe')}</p>
					{/if}

				{/if}
			</div>
		{/each}

		<!-- CIPH-920 — observational disclaimer. These cards surface
		     associations in the user's own logged data; they are NOT a
		     diagnosis or medical evidence. One note for the whole section
		     keeps it honest without nagging per card. Aligns with the
		     "not a medical device" guardrails + observational brand voice. -->
		<p class="insight-disclaimer">{$t('insight.disclaimer')}</p>
	</section>
{/if}

<style>
	.insight-card {
		padding: 1rem;
	}
	.insight-title {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text-primary);
	}
	/* Hover-explanation affordance on each diagram title. The glyph carries
	   a `title` (native tooltip) + aria-label; cursor:help signals it. */
	.insight-info {
		display: inline-block;
		margin-left: 0.3rem;
		font-size: 0.6875rem;
		color: var(--text-muted);
		cursor: help;
		vertical-align: middle;
	}
	.insight-info:hover {
		color: var(--accent);
	}
	/* Elements carrying a hover tooltip get the help cursor too. */
	.bar-label[title],
	.bar-val[title],
	.bar-track[title],
	.bar-badge[title],
	.daypart-col[title],
	.mix-seg[title] {
		cursor: help;
	}
	.insight-headline {
		font-size: 0.875rem;
		color: var(--text-secondary);
		margin-top: 0.25rem;
	}
	.insight-sub,
	.insight-foot {
		font-size: 0.6875rem;
		color: var(--text-muted);
		margin-top: 0.25rem;
	}
	.insight-flag {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--danger);
		margin-top: 0.5rem;
	}
	.insight-disclaimer {
		font-size: 0.6875rem;
		line-height: 1.4;
		color: var(--text-muted);
		padding: 0 0.25rem;
	}

	/* Horizontal labelled bars (sleep, trigger lift) */
	.bar-rows {
		margin-top: 0.625rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.bar-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.bar-label {
		font-size: 0.75rem;
		color: var(--text-secondary);
		width: 5.5rem;
		flex-shrink: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bar-track {
		flex: 1;
		height: 0.5rem;
		border-radius: 9999px;
		background: var(--surface-inset);
		overflow: hidden;
	}
	.bar-fill {
		height: 100%;
		border-radius: 9999px;
		transition: width 0.5s ease-out;
	}
	.bar-val {
		font-size: 0.75rem;
		color: var(--text-muted);
		width: 2.5rem;
		text-align: right;
		flex-shrink: 0;
	}
	.bar-badge {
		font-size: 0.6875rem;
		color: var(--text-muted);
		width: 3.5rem;
		text-align: right;
		flex-shrink: 0;
	}
	.bar-badge-strong {
		color: var(--accent);
		font-weight: 600;
	}

	/* Circadian daypart columns */
	.daypart-cols {
		margin-top: 0.625rem;
		display: flex;
		align-items: flex-end;
		gap: 0.5rem;
		height: 3.5rem;
	}
	.daypart-col {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		height: 100%;
	}
	.daypart-bar-wrap {
		flex: 1;
		width: 100%;
		display: flex;
		align-items: flex-end;
		justify-content: center;
	}
	.daypart-bar {
		width: 100%;
		max-width: 2rem;
		border-radius: 0.25rem 0.25rem 0 0;
		min-height: 2px;
		transition: height 0.5s ease-out;
	}
	.daypart-label {
		font-size: 0.625rem;
		color: var(--text-muted);
	}

	/* Stacked mix bar (type mix, duration) */
	.mix-bar {
		margin-top: 0.625rem;
		display: flex;
		height: 0.75rem;
		border-radius: 9999px;
		overflow: hidden;
		background: var(--surface-inset);
	}
	.mix-seg {
		height: 100%;
		min-width: 2px;
	}
	.mix-legend {
		margin-top: 0.5rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
	}
	.mix-legend-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.6875rem;
		color: var(--text-secondary);
	}
	.mix-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 9999px;
		flex-shrink: 0;
	}
	.mix-pct {
		color: var(--text-muted);
	}
</style>
