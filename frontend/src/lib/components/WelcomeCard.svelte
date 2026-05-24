<!--
	WelcomeCard — first-moment explainer that mounts at the top of the
	dashboard for users who haven't dismissed it. Two variants driven by
	`auth.registrationSource`:

	- 'web' (new user)  → 3 bullets: how to log, how to retrieve, why the
	  recovery code matters. Quiet single-CTA dismiss.
	- 'migrate' (came via /migrate from epilepc) → import-count breakdown
	  ("X Einträge · Y Medikamente · Z Notizen"), a one-sentence encryption
	  note, and the epilepc read-only date. Verify-via-journal link.

	Dismiss is one-shot via localStorage. Per-variant key so a user who
	migrates a separate device later still sees the migrated copy on that
	device (rare but possible) and so dismissing one doesn't auto-dismiss
	the other.

	Trust-app posture: dense, factual, no illustrations, one CTA. Matches
	the rest of the dashboard's card vocabulary (`class="card"` surface,
	asterisk-bulleted body for the new variant, chip row for the migrated
	variant). Sits ABOVE the greeting + primary card.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { auth } from '$lib/stores/auth';
	import { t } from '$lib/i18n';
	import { documents } from '$lib/stores/documents';
	import Asterisk from '$lib/components/Asterisk.svelte';

	// Per-variant dismiss keys. Keeps the two acknowledgments independent.
	const KEY_WEB = 'ciphra_welcome_web_seen';
	const KEY_MIGRATE = 'ciphra_welcome_migrate_seen';

	let dismissed = true; // start hidden; flip on mount so SSR doesn't flash
	$: variant = $auth.registrationSource === 'migrate' ? 'migrated' : 'new';
	$: storageKey = variant === 'migrated' ? KEY_MIGRATE : KEY_WEB;

	onMount(() => {
		if (!browser) return;
		try {
			dismissed = localStorage.getItem(storageKey) === '1';
		} catch {
			dismissed = true; // private mode / quota → fail closed
		}
	});

	// Re-evaluate when the variant changes (rare: caregiver-vault switch).
	$: if (browser && storageKey) {
		try {
			dismissed = localStorage.getItem(storageKey) === '1';
		} catch {
			dismissed = true;
		}
	}

	function dismiss() {
		dismissed = true;
		if (!browser) return;
		try {
			localStorage.setItem(storageKey, '1');
		} catch {
			/* fail silent — the visible flip is the user signal that mattered */
		}
	}

	// Migrated-only counts. Three buckets that map directly to the epilepc
	// bundle's import contract: seizure-bearing days + diary days → entries,
	// medication events → events with kind='medication', plain note markers
	// → events without a kind. Diary docs (type='diary') are intentionally
	// EXCLUDED from the visible count because the user's mental model from
	// epilepc didn't include a separate private-diary lane; counting them
	// would inflate the "did everything import?" verification number.
	$: entryCount = $documents.filter((d) => d.data?.type === 'entry').length;
	$: medCount = $documents.filter(
		(d) => d.data?.type === 'event' && (d.data as { kind?: string }).kind === 'medication',
	).length;
	$: noteCount = $documents.filter(
		(d) => d.data?.type === 'event' && !(d.data as { kind?: string }).kind,
	).length;
	$: totalCount = entryCount + medCount + noteCount;
</script>

{#if !dismissed && $auth.username}
	<section
		class="card p-5 welcome-card"
		aria-label={variant === 'migrated' ? $t('welcome.migrated_aria') : $t('welcome.new_aria')}
	>
		<div class="flex items-start justify-between gap-3 mb-3">
			<div class="flex items-center gap-2 min-w-0">
				<Asterisk size={16} color="brand" />
				<h2 class="text-base font-semibold truncate" style="color: var(--text-primary)">
					{#if variant === 'migrated'}{$t('welcome.migrated_heading')}{:else}{$t('welcome.new_heading')}{/if}
				</h2>
			</div>
			<button
				type="button"
				on:click={dismiss}
				class="text-xs px-2 py-1 rounded-md hover:underline shrink-0 min-h-[32px]"
				style="color: var(--text-muted)"
				aria-label={$t('common.close')}
			>
				{$t('welcome.dismiss')}
			</button>
		</div>

		{#if variant === 'migrated'}
			<!-- Import-count chip row. Total is the headline; the breakdown
			     below answers "did everything come over?" without forcing the
			     user to count it themselves. Verify-link points at /journal,
			     where they can spot-check actual rows. -->
			<p class="text-sm mb-3" style="color: var(--text-secondary)">
				{$t('welcome.migrated_intro', { count: String(totalCount) })}
			</p>
			<div class="flex flex-wrap gap-2 mb-4">
				<span class="welcome-chip">
					<strong>{entryCount}</strong>
					<span>{$t('welcome.migrated_chip_entries')}</span>
				</span>
				{#if medCount > 0}
					<span class="welcome-chip">
						<strong>{medCount}</strong>
						<span>{$t('welcome.migrated_chip_meds')}</span>
					</span>
				{/if}
				{#if noteCount > 0}
					<span class="welcome-chip">
						<strong>{noteCount}</strong>
						<span>{$t('welcome.migrated_chip_notes')}</span>
					</span>
				{/if}
				<a href="/journal" class="welcome-chip welcome-chip--link">
					{$t('welcome.migrated_verify')}
					<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</a>
			</div>
			<ul class="welcome-bullets">
				<li>
					<strong>{$t('welcome.migrated_encryption_title')}</strong>
					<span>{$t('welcome.migrated_encryption_body')}</span>
				</li>
				<li>
					<strong>{$t('welcome.migrated_readonly_title')}</strong>
					<span>{$t('welcome.migrated_readonly_body', { date: '2026-10-31' })}</span>
				</li>
			</ul>
		{:else}
			<!-- New-user variant. Three icon-anchored feature rows. The
			     icon + tinted circle gives ADHD readers a visual hook per
			     bullet so they can scan rather than wade through a wall
			     of text. Each tile is a self-contained micro-moment:
			     verb-first title, single-sentence body. The recovery-code
			     bullet that used to live here was dropped — the welcome
			     card only mounts AFTER the user clicked through the
			     signup recovery screen, so "save the PDF before closing
			     this page" is either redundant (they already did) or
			     undeliverable (the 12-word code is never stored). -->
			<div class="welcome-features">
				<div class="welcome-feature">
					<div class="welcome-feature__icon" style="background: rgba(178,60,44,0.10); color: var(--brand)">
						<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
							<path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</div>
					<div class="welcome-feature__body">
						<p class="welcome-feature__title">{$t('welcome.new_log_title')}</p>
						<p class="welcome-feature__desc">{$t('welcome.new_log_body')}</p>
					</div>
				</div>

				<div class="welcome-feature">
					<div class="welcome-feature__icon" style="background: rgba(127,130,27,0.12); color: var(--olive)">
						<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
							<polyline points="3 17 9 11 13 15 21 7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
							<polyline points="14 7 21 7 21 14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</div>
					<div class="welcome-feature__body">
						<p class="welcome-feature__title">{$t('welcome.new_trends_title')}</p>
						<p class="welcome-feature__desc">{$t('welcome.new_trends_body')}</p>
					</div>
				</div>

				<div class="welcome-feature">
					<div class="welcome-feature__icon" style="background: rgba(159,99,11,0.12); color: var(--ochre)">
						<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
							<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
							<polyline points="14 2 14 8 20 8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
							<line x1="9" y1="13" x2="15" y2="13" stroke-width="2" stroke-linecap="round"/>
							<line x1="9" y1="17" x2="13" y2="17" stroke-width="2" stroke-linecap="round"/>
						</svg>
					</div>
					<div class="welcome-feature__body">
						<p class="welcome-feature__title">{$t('welcome.new_reports_title')}</p>
						<p class="welcome-feature__desc">{$t('welcome.new_reports_body')}</p>
					</div>
				</div>
			</div>

			<!-- Closing invite. Trust-app posture: don't enumerate every
			     feature on day one. Acknowledge there's more without pushing
			     a feature tour. Compass icon hints at exploration without
			     being decorative. -->
			<p class="welcome-explore">
				<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
					<circle cx="12" cy="12" r="10" stroke-width="2"/>
					<polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				<span>{$t('welcome.new_explore')}</span>
			</p>
		{/if}
	</section>
{/if}

<style>
	.welcome-card {
		border-left: 3px solid var(--brand);
	}
	.welcome-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0.65rem;
		border-radius: 0.5rem;
		background: var(--surface-muted);
		border: 1px solid var(--border);
		font-size: 0.8rem;
		color: var(--text-secondary);
		line-height: 1;
		text-decoration: none;
	}
	.welcome-chip strong {
		font-weight: 700;
		color: var(--text-primary);
		font-variant-numeric: tabular-nums;
	}
	.welcome-chip--link {
		color: var(--brand);
		background: transparent;
		border-color: transparent;
	}
	.welcome-chip--link:hover,
	.welcome-chip--link:focus-visible {
		text-decoration: underline;
	}
	.welcome-bullets {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}
	.welcome-bullets li {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.1rem;
		font-size: 0.85rem;
		line-height: 1.45;
	}
	.welcome-bullets strong {
		color: var(--text-primary);
		font-weight: 600;
	}
	.welcome-bullets span {
		color: var(--text-secondary);
	}
	@media (min-width: 640px) {
		.welcome-bullets li {
			grid-template-columns: minmax(140px, max-content) 1fr;
			gap: 0.6rem;
		}
	}

	/* New-user variant — icon-anchored feature rows. Each row is a
	   visual unit: tinted circle holding an icon, then verb-first
	   title and supporting body. ADHD-friendly hooks: distinct color
	   per row, generous whitespace, scannable left-edge. */
	.welcome-features {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}
	.welcome-feature {
		display: flex;
		align-items: flex-start;
		gap: 0.85rem;
		padding: 0.65rem 0.5rem;
		border-radius: 0.6rem;
		transition: background 0.15s ease;
	}
	.welcome-feature:hover {
		background: var(--surface-muted);
	}
	.welcome-feature__icon {
		flex: 0 0 auto;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 0.55rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.welcome-feature__body {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.welcome-feature__title {
		margin: 0;
		font-size: 0.92rem;
		font-weight: 600;
		color: var(--text-primary);
		line-height: 1.3;
	}
	.welcome-feature__desc {
		margin: 0;
		font-size: 0.82rem;
		line-height: 1.5;
		color: var(--text-secondary);
	}

	/* Closing "and there's more" line. Visually distinct from the
	   feature rows — muted, italic, with a tiny compass icon. Sits
	   below a soft divider so it reads as a sign-off, not a fourth
	   feature. */
	.welcome-explore {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0.85rem 0 0 0;
		padding-top: 0.75rem;
		border-top: 1px solid var(--border);
		font-size: 0.78rem;
		font-style: italic;
		color: var(--text-muted);
	}
	.welcome-explore svg {
		flex: 0 0 auto;
		color: var(--brand);
		opacity: 0.7;
	}
</style>
