<!--
	PublicFooter — shared footer for public-shell routes (CIPH-916).

	Lifted from the inline `<footer>` that lived at the bottom of
	`routes/+page.svelte`. Now mounted in `+layout.svelte` for the
	`landing` and `public-doc` shells so /conditions, /privacy, /terms
	all get the same footer chrome and aren't visually orphaned.

	Auth-flow shells (login / migrate / stream / join) intentionally
	skip the footer — they're focus surfaces.
-->
<script lang="ts">
	import { t } from '$lib/i18n';
	import Wordmark from '$lib/components/Wordmark.svelte';
	import Asterisk from '$lib/components/Asterisk.svelte';
	import LocaleSelect from '$lib/components/LocaleSelect.svelte';
	import { themeChoice, setThemeChoice, type ThemeChoice } from '$lib/stores/theme';
	import { sourceUrl } from '$lib/source';

	// Theme switch for logged-out visitors (2026-06-12). Settings is the
	// authed control surface; anonymous visitors had no override and the
	// only path was login → settings → logout. Footer is ciphra's slot
	// for preferences (CIPH-pi24-1B: language lives here, Threema/Proton
	// pattern). Same store as the settings select — the two stay in sync.
	const THEME_OPTIONS: { value: ThemeChoice; labelKey: string }[] = [
		{ value: 'light', labelKey: 'settings.theme_light' },
		{ value: 'dark', labelKey: 'settings.theme_dark' },
		{ value: 'system', labelKey: 'settings.theme_system_short' },
	];
</script>

<footer class="py-12" style="background: var(--surface-card); border-top: 1px solid var(--border);">
	<div class="max-w-5xl mx-auto px-6">
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
			<div>
				<a href="/" aria-label="ciphra">
					<Wordmark size={32} />
				</a>
				<p class="text-xs font-semibold tracking-widest uppercase mt-1" style="color: var(--brand);">{$t('landing.footer_tagline')}</p>
				<p class="text-sm mt-3 leading-relaxed" style="color: var(--text-muted);">{@html $t('landing.footer_desc').replace('\n', '<br>')}</p>
			</div>
			<div>
				<h3 class="text-sm font-semibold mb-3" style="color: var(--text-primary);">{$t('landing.footer_product')}</h3>
				<ul class="space-y-2 text-sm" style="color: var(--text-muted);">
					<li><a href="/#how" class="hover:underline" style="color: inherit;">{$t('landing.footer_how')}</a></li>
					<li><a href="/#conditions" class="hover:underline" style="color: inherit;">{$t('landing.footer_templates')}</a></li>
					<li><a href="/#security" class="hover:underline" style="color: inherit;">{$t('landing.footer_security')}</a></li>
				</ul>
			</div>
			<div>
				<h3 class="text-sm font-semibold mb-3" style="color: var(--text-primary);">{$t('landing.footer_links')}</h3>
				<ul class="space-y-2 text-sm" style="color: var(--text-muted);">
					<li><a href="/login" class="hover:underline" style="color: inherit;">{$t('landing.footer_login')}</a></li>
					<li><a href="/login?mode=register" class="hover:underline" style="color: inherit;">{$t('landing.footer_register')}</a></li>
					<li><a href="/#conditions" class="hover:underline" style="color: inherit;">{$t('nav.conditions')}</a></li>
				</ul>
			</div>
			<div>
				<h3 class="text-sm font-semibold mb-3" style="color: var(--text-primary);">{$t('landing.footer_legal')}</h3>
				<ul class="space-y-2 text-sm" style="color: var(--text-muted);">
					<li><a href="/privacy" class="hover:underline" style="color: inherit;">{$t('privacy.title')}</a></li>
					<li><a href="/terms" class="hover:underline" style="color: inherit;">{$t('terms.title')}</a></li>
					<!-- Docs link is hardcoded English (no i18n key) — see /docs
					     index for the why. The docs themselves are English-only;
					     the link label matches. -->
					<li><a href="/docs" class="hover:underline" style="color: inherit;">Documentation</a></li>
					<li><a href={sourceUrl} target="_blank" rel="noopener" class="hover:underline inline-flex items-center gap-1" style="color: inherit;">
						<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6z"/></svg>
						{$t('footer.source')}
					</a></li>
				</ul>
			</div>
		</div>
		<!-- pi24 P-Land-1 — Contact strip with explicit privacy-boundary
		     copy. Mailto, not a server form: a server endpoint here would
		     create the wrong affordance on a "we can't read your data"
		     page. The boundary copy makes the difference legible — the
		     user leaves the encrypted app context when emailing the team. -->
		<div class="text-sm text-center mb-6">
			<a
				href="mailto:info@ciphra.ch"
				class="inline-flex items-center gap-1.5 font-medium hover:underline"
				style="color: var(--brand);"
			>
				{$t('landing.contact_mailto_label')}
				<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8l9 6 9-6m-18 0v10a2 2 0 002 2h14a2 2 0 002-2V8m-18 0a2 2 0 012-2h14a2 2 0 012 2"/></svg>
			</a>
			<p class="text-xs mt-1.5 max-w-md mx-auto" style="color: var(--text-muted);">
				{$t('landing.contact_boundary')}
			</p>
		</div>
		<div class="asterisk-divider mb-6">
			<Asterisk size={14} color="muted" />
		</div>
		<p class="text-xs text-center mb-4 italic" style="color: var(--text-muted);">
			{$t('landing.disclaimer_medical')}
		</p>
		<div class="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm" style="color: var(--text-muted);">
			<span>&copy; 2026 ciphra</span>
			<div class="flex items-center gap-4">
				<div
					role="radiogroup"
					aria-label={$t('settings.theme_title')}
					class="flex items-center rounded-full p-0.5"
					style="border: 1px solid var(--border);"
				>
					{#each THEME_OPTIONS as opt}
						<button
							type="button"
							role="radio"
							aria-checked={$themeChoice === opt.value}
							on:click={() => setThemeChoice(opt.value)}
							class="px-3 text-xs font-medium rounded-full min-h-[36px] transition-colors"
							style={$themeChoice === opt.value
								? 'background: var(--surface-muted); color: var(--text-primary);'
								: 'color: var(--text-muted);'}
						>{$t(opt.labelKey)}</button>
					{/each}
				</div>
				<LocaleSelect />
			</div>
		</div>
	</div>
</footer>
