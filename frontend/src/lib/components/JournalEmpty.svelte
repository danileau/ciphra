<!--
	CIPH-893 — Journal empty state.

	Stream-card silhouette: a single ghost card with the same vertical
	rhythm as a real entry. Tells the user "this is the entry stream
	surface" even when empty. Distinct from the Asterisk hero used on
	the dashboard.
-->
<script lang="ts">
	import { t } from '$lib/i18n';

	/** Optional hint for the diary-only filter empty state. */
	export let variant: 'all' | 'diary' = 'all';
	/** When true, suppress the CTA (e.g., search returned zero results). */
	export let hideCta: boolean = false;
	export let onLogToday: () => void = () => {};
</script>

<section
	class="journal-empty"
	aria-label={$t('journal.empty_aria')}
	data-testid="journal-empty"
>
	<div class="journal-empty-card" aria-hidden="true">
		<div class="journal-empty-line journal-empty-line--lg"></div>
		<div class="journal-empty-line journal-empty-line--md"></div>
		<div class="journal-empty-line journal-empty-line--sm"></div>
	</div>
	<p class="journal-empty-title">
		{variant === 'diary' ? $t('journal.empty_diary_title') : $t('journal.empty_title')}
	</p>
	<p class="journal-empty-caption">
		{variant === 'diary' ? $t('journal.empty_diary_caption') : $t('journal.empty_caption')}
	</p>
	{#if !hideCta}
		<button type="button" class="btn-primary mt-4 px-5" on:click={onLogToday}>
			{$t('journal.empty_cta')}
		</button>
	{/if}
</section>

<style>
	.journal-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		padding: 32px 16px;
		text-align: center;
	}
	.journal-empty-card {
		width: 100%;
		max-width: 320px;
		background: var(--surface-card);
		border: 1px solid var(--border);
		border-left: 4px solid var(--accent-neutral);
		border-radius: 12px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		opacity: 0.55;
	}
	.journal-empty-line {
		height: 8px;
		border-radius: 4px;
		background: var(--surface-muted);
	}
	.journal-empty-line--lg {
		width: 60%;
	}
	.journal-empty-line--md {
		width: 90%;
	}
	.journal-empty-line--sm {
		width: 40%;
	}
	.journal-empty-title {
		font-size: 16px;
		font-weight: 600;
		color: var(--text-primary);
	}
	.journal-empty-caption {
		font-size: 14px;
		color: var(--text-muted);
		max-width: 300px;
	}
</style>
