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
					<li><a href="https://github.com/danileau/ciphra" target="_blank" rel="noopener" class="hover:underline inline-flex items-center gap-1" style="color: inherit;">
						<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.05-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.21.09 1.85 1.24 1.85 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22 0 1.6-.01 2.89-.01 3.29 0 .32.22.7.83.58C20.56 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z"/></svg>
						GitHub
					</a></li>
				</ul>
			</div>
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
				<LocaleSelect />
			</div>
		</div>
	</div>
</footer>
